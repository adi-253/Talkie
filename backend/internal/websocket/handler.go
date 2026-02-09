package websocket

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// upgrader upgrades HTTP connections to WebSocket
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow connections from any origin (CORS handled by middleware)
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Handler handles WebSocket connections
type Handler struct {
	hub *Hub
}

// NewHandler creates a new WebSocket handler
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// ServeWS handles WebSocket upgrade requests at /ws/{roomId}
// Query params: participant_id, username, avatar
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID required", http.StatusBadRequest)
		return
	}

	// Get participant info from query params
	participantID := r.URL.Query().Get("participant_id")
	username := r.URL.Query().Get("username")
	avatar := r.URL.Query().Get("avatar")

	if participantID == "" {
		http.Error(w, "participant_id required", http.StatusBadRequest)
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade failed: %v", err)
		return
	}

	log.Printf("[WebSocket] New connection: room=%s, participant=%s, username=%s",
		roomID, participantID, username)

	// Create client and register with hub
	client := NewClient(h.hub, conn, roomID, participantID, username, avatar)
	h.hub.register <- client

	// Start read/write pumps in separate goroutines
	go client.WritePump()
	go client.ReadPump()
}
