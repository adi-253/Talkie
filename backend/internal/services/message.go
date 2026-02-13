package services

import (
	"log"
	"sync"
	"time"

	"github.com/adi-253/Talkie/backend/internal/models"
	"github.com/google/uuid"
)

// MessageService handles message storage and retrieval.
// Uses in-memory storage since messages are ephemeral.
// Messages are automatically cleaned up when their room is deleted.
type MessageService struct {
	// messages stores messages per room: roomID -> []Message
	messages map[string][]Message
	mu       sync.RWMutex
}

// Message is an internal representation matching the model
type Message = models.Message

// NewMessageService creates a new MessageService instance
func NewMessageService() *MessageService {
	return &MessageService{
		messages: make(map[string][]Message),
	}
}

// SendMessage adds a new message to a room
func (s *MessageService) SendMessage(roomID string, req models.SendMessageRequest) *Message {
	s.mu.Lock()
	defer s.mu.Unlock()

	msg := Message{
		ID:            uuid.New().String(),
		RoomID:        roomID,
		ParticipantID: req.ParticipantID,
		Content:       req.Content,
		Username:      req.Username,
		Avatar:        req.Avatar,
		Timestamp:     time.Now().UTC(),
		ReplyTo:       req.ReplyTo,
	}

	s.messages[roomID] = append(s.messages[roomID], msg)
	return &msg
}

// GetMessages returns all messages for a room after a given timestamp
// If afterTime is zero, returns all messages
func (s *MessageService) GetMessages(roomID string, afterTime time.Time) []Message {
	s.mu.RLock()
	defer s.mu.RUnlock()

	roomMessages := s.messages[roomID]
	if roomMessages == nil {
		return []Message{}
	}

	// If no timestamp filter, return all
	if afterTime.IsZero() {
		result := make([]Message, len(roomMessages))
		copy(result, roomMessages)
		return result
	}

	// Filter messages after the given time
	var filtered []Message
	for _, msg := range roomMessages {
		if msg.Timestamp.After(afterTime) {
			filtered = append(filtered, msg)
		}
	}

	if filtered == nil {
		return []Message{}
	}
	return filtered
}

// DeleteRoomMessages removes all messages for a room
// Called when a room is deleted
func (s *MessageService) DeleteRoomMessages(roomID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := len(s.messages[roomID])
	delete(s.messages, roomID)
	if count > 0 {
		log.Printf("[Message] Deleted %d messages for room %s", count, roomID)
	}
}

// GetMessageCount returns the number of messages in a room (for debugging)
func (s *MessageService) GetMessageCount(roomID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.messages[roomID])
}
