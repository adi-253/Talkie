package websocket

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 64 * 1024 // 64KB for encrypted messages
)

// Client represents a single WebSocket connection
type Client struct {
	hub *Hub

	// WebSocket connection
	conn *websocket.Conn

	// Buffered channel of outbound messages
	send chan []byte

	// Room this client belongs to
	RoomID string

	// Participant info
	ParticipantID string
	Username      string
	Avatar        string
}

// NewClient creates a new Client instance
func NewClient(hub *Hub, conn *websocket.Conn, roomID, participantID, username, avatar string) *Client {
	return &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		RoomID:        roomID,
		ParticipantID: participantID,
		Username:      username,
		Avatar:        avatar,
	}
}

// ReadPump pumps messages from the WebSocket connection to the hub
// This runs in its own goroutine per client
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error from %s: %v", c.ParticipantID, err)
			}
			break
		}

			// Broadcast received message to all clients in the room
		log.Printf("[WebSocket] Message received from %s in room %s, broadcasting...", c.ParticipantID, c.RoomID)
		c.hub.broadcast <- &BroadcastMessage{
			RoomID:  c.RoomID,
			Message: message,
			Sender:  c,
		}
	}
}

// WritePump pumps messages from the hub to the WebSocket connection
// This runs in its own goroutine per client
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send each message as a separate WebSocket frame
			// (concatenating with newlines would break JSON parsing on the frontend)
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

			// Send any queued messages as separate frames
			n := len(c.send)
			for i := 0; i < n; i++ {
				if err := c.conn.WriteMessage(websocket.TextMessage, <-c.send); err != nil {
					return
				}
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
