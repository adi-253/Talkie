package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/adi-253/Talkie/backend/internal/models"
	"github.com/adi-253/Talkie/backend/internal/services"
)

// Hub maintains the set of active clients and broadcasts messages to clients in rooms.
// It handles client registration, unregistration, and message broadcasting per room.
type Hub struct {
	// rooms maps roomID to a set of clients in that room
	rooms map[string]map[*Client]bool

	// register requests from clients
	register chan *Client

	// unregister requests from clients
	unregister chan *Client

	// broadcast sends a message to all clients in a room
	broadcast chan *BroadcastMessage

	// mutex for thread-safe room operations
	mu sync.RWMutex

	// messageService for persisting messages
	messageService *services.MessageService
}

// BroadcastMessage contains a message to broadcast to a specific room
type BroadcastMessage struct {
	RoomID  string
	Message []byte
	Sender  *Client // Original sender (to exclude from broadcast if needed)
}

// WebSocketMessage is the expected format of messages from clients
type WebSocketMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// MessagePayload is the payload for message type
type MessagePayload struct {
	ID            string              `json:"id"`
	ParticipantID string              `json:"participant_id"`
	Content       string              `json:"content"`
	Timestamp     string              `json:"timestamp"`
	Username      string              `json:"username"`
	Avatar        string              `json:"avatar"`
	ReplyTo       *models.ReplyContext `json:"reply_to,omitempty"`
}

// NewHub creates a new Hub instance
func NewHub(messageService *services.MessageService) *Hub {
	return &Hub{
		rooms:          make(map[string]map[*Client]bool),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		broadcast:      make(chan *BroadcastMessage),
		messageService: messageService,
	}
}

// Run starts the hub's main event loop
// This should be called in a goroutine: go hub.Run()
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case msg := <-h.broadcast:
			h.broadcastToRoom(msg)
		}
	}
}

// registerClient adds a client to a room
func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Create room if it doesn't exist
	if h.rooms[client.RoomID] == nil {
		h.rooms[client.RoomID] = make(map[*Client]bool)
	}

	h.rooms[client.RoomID][client] = true
	log.Printf("[WebSocket] Client %s joined room %s (total: %d)",
		client.ParticipantID, client.RoomID, len(h.rooms[client.RoomID]))
}

// unregisterClient removes a client from a room
func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.rooms[client.RoomID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			close(client.send)

			log.Printf("[WebSocket] Client %s left room %s (remaining: %d)",
				client.ParticipantID, client.RoomID, len(clients))

			// Clean up empty rooms
			if len(clients) == 0 {
				delete(h.rooms, client.RoomID)
				log.Printf("[WebSocket] Room %s is now empty, removed from hub", client.RoomID)
			}
		}
	}
}

// broadcastToRoom sends a message to all clients in a room
func (h *Hub) broadcastToRoom(msg *BroadcastMessage) {
	h.mu.RLock()
	clients := h.rooms[msg.RoomID]
	clientCount := len(clients)
	h.mu.RUnlock()

	log.Printf("[WebSocket] Broadcasting to room %s (%d clients)", msg.RoomID, clientCount)

	// Try to parse and store the message if it's a chat message
	h.storeMessageIfApplicable(msg.RoomID, msg.Message)
	
	sentCount := 0
	for client := range clients {
		// Skip sending to the original sender (they already have the message locally)
		if msg.Sender != nil && client == msg.Sender {
			log.Printf("[WebSocket] Skipping sender %s", client.ParticipantID)
			continue
		}

		select {
		case client.send <- msg.Message:
			sentCount++
			log.Printf("[WebSocket] Sent to client %s", client.ParticipantID)
		default:
			// Client's buffer is full, remove them
			h.mu.Lock()
			if _, ok := h.rooms[msg.RoomID]; ok {
				delete(h.rooms[msg.RoomID], client)
				close(client.send)
			}
			h.mu.Unlock()
		}
	}
	log.Printf("[WebSocket] Broadcast complete: sent to %d clients", sentCount)
}

// storeMessageIfApplicable parses the WebSocket message and stores it if it's a chat message
func (h *Hub) storeMessageIfApplicable(roomID string, rawMessage []byte) {
	if h.messageService == nil {
		return
	}

	var wsMsg WebSocketMessage
	if err := json.Unmarshal(rawMessage, &wsMsg); err != nil {
		log.Printf("[WebSocket] Failed to parse message for storage: %v", err)
		return
	}

	// Only store chat messages, not typing indicators or participant updates
	if wsMsg.Type != "message" {
		return
	}

	var payload MessagePayload
	if err := json.Unmarshal(wsMsg.Payload, &payload); err != nil {
		log.Printf("[WebSocket] Failed to parse message payload: %v", err)
		return
	}

	// Store the message
	req := models.SendMessageRequest{
		ParticipantID: payload.ParticipantID,
		Content:       payload.Content,
		Username:      payload.Username,
		Avatar:        payload.Avatar,
		ReplyTo:       payload.ReplyTo,
	}
	h.messageService.SendMessage(roomID, req)
	log.Printf("[WebSocket] Message stored for room %s", roomID)
}

// GetRoomClientCount returns the number of connected clients in a room
func (h *Hub) GetRoomClientCount(roomID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[roomID])
}
