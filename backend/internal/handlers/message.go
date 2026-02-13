package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/adi-253/Talkie/backend/internal/models"
	"github.com/adi-253/Talkie/backend/internal/services"
	"github.com/go-chi/chi/v5"
)

// MessageHandler contains HTTP handlers for message operations.
// Provides a polling-based fallback when WebSocket realtime fails.
type MessageHandler struct {
	messageService *services.MessageService
}

// NewMessageHandler creates a new MessageHandler instance.
func NewMessageHandler(messageService *services.MessageService) *MessageHandler {
	return &MessageHandler{messageService: messageService}
}

// SendMessage handles POST /api/rooms/{id}/messages
// Stores an encrypted message for the room.
func (h *MessageHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "content is required", http.StatusBadRequest)
		return
	}

	msg := h.messageService.SendMessage(roomID, req)
	log.Printf("[Message] Stored message %s in room %s from participant %s", msg.ID, roomID, req.ParticipantID)
	writeJSON(w, http.StatusCreated, msg)
}

// GetMessages handles GET /api/rooms/{id}/messages
// Returns messages for the room, optionally filtered by 'after' timestamp.
// Query params:
//   - after: ISO 8601 timestamp to get messages after (for polling)
func (h *MessageHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	// Parse optional 'after' query param for incremental polling
	var afterTime time.Time
	afterParam := r.URL.Query().Get("after")
	if afterParam != "" {
		parsed, err := time.Parse(time.RFC3339Nano, afterParam)
		if err != nil {
			http.Error(w, "invalid 'after' timestamp format", http.StatusBadRequest)
			return
		}
		afterTime = parsed
	}

	messages := h.messageService.GetMessages(roomID, afterTime)
	
	response := models.GetMessagesResponse{
		Messages: messages,
	}
	
	writeJSON(w, http.StatusOK, response)
}
