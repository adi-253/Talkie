package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/adi-253/Talkie/backend/internal/models"
	"github.com/adi-253/Talkie/backend/internal/supabase"
	"github.com/google/uuid"
)

// RoomService handles all room-related business logic.
// It acts as an intermediary between HTTP handlers and the database.
type RoomService struct {
	db *supabase.Client
}

// NewRoomService creates a new RoomService instance.
func NewRoomService(db *supabase.Client) *RoomService {
	return &RoomService{db: db}
}

// CreateRoom generates a new room with a unique ID and inserts it into the database.
// The room ID is a short, URL-friendly string that users can easily share.
// An encryption key is generated for message encryption.
func (s *RoomService) CreateRoom(name string) (*models.Room, error) {
	// Generate a short, memorable room ID (8 characters)
	roomID, err := generateRoomID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate room ID: %w", err)
	}

	// Generate encryption key (32 bytes = 256 bits for AES-256)
	encryptionKey, err := generateEncryptionKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}

	// Default name if not provided
	if name == "" {
		name = "Untitled Room"
	}

	now := time.Now().UTC()
	room := &models.Room{
		ID:            roomID,
		Name:          name,
		EncryptionKey: encryptionKey,
		CreatedAt:     now,
		LastActiveAt:  now,
	}

	if err := s.db.CreateRoom(room); err != nil {
		return nil, fmt.Errorf("failed to create room: %w", err)
	}

	return room, nil
}

// GetRoom retrieves a room by its ID along with the current participants.
func (s *RoomService) GetRoom(roomID string) (*models.Room, []models.Participant, error) {
	room, err := s.db.GetRoom(roomID)
	if err != nil {
		return nil, nil, err
	}

	participants, err := s.db.GetParticipants(roomID)
	if err != nil {
		return nil, nil, err
	}

	return room, participants, nil
}

// ListRooms retrieves all active rooms.
func (s *RoomService) ListRooms() ([]models.Room, error) {
	return s.db.ListRooms()
}

// JoinRoom adds a new participant to an existing room.
// Returns the participant ID and current room state.
func (s *RoomService) JoinRoom(roomID, username, avatar string) (*models.Participant, *models.Room, []models.Participant, error) {
	// Verify room exists
	room, err := s.db.GetRoom(roomID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("room not found: %w", err)
	}

	// Create new participant
	now := time.Now().UTC()
	participant := &models.Participant{
		ID:           uuid.New().String(),
		RoomID:       roomID,
		Username:     username,
		Avatar:       avatar,
		JoinedAt:     now,
		LastActiveAt: now,
	}

	if err := s.db.AddParticipant(participant); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to join room: %w", err)
	}

	// Broadcast join event so other clients update instantly
	if err := s.db.BroadcastParticipantEvent(roomID, "join", participant); err != nil {
		log.Printf("Failed to broadcast participant join for %s: %v", participant.ID, err)
	}

	// Update room activity
	if err := s.db.UpdateRoomActivity(roomID); err != nil {
		// Non-fatal error, log but continue
		fmt.Printf("Warning: failed to update room activity: %v\n", err)
	}

	// Get updated participant list
	participants, err := s.db.GetParticipants(roomID)
	if err != nil {
		return nil, nil, nil, err
	}

	return participant, room, participants, nil
}

// LeaveRoom removes a participant from a room.
// If this was the last participant, the room is automatically deleted.
func (s *RoomService) LeaveRoom(roomID, participantID string) error {
	// Fetch participant info before removing (needed for broadcast)
	participant, err := s.db.GetParticipant(participantID)
	if err != nil {
		log.Printf("Could not fetch participant %s for broadcast: %v", participantID, err)
	}

	// Remove the participant
	if err := s.db.RemoveParticipant(participantID); err != nil {
		return fmt.Errorf("failed to leave room: %w", err)
	}

	// Broadcast leave event so other clients update instantly
	if participant != nil {
		if err := s.db.BroadcastParticipantEvent(roomID, "leave", participant); err != nil {
			log.Printf("Failed to broadcast participant leave for %s: %v", participantID, err)
		}
	}

	// Check if room is now empty
	count, err := s.db.CountParticipants(roomID)
	if err != nil {
		return fmt.Errorf("failed to check participant count: %w", err)
	}

	// If room is empty, delete it immediately
	if count == 0 {
		if err := s.db.DeleteRoom(roomID); err != nil {
			return fmt.Errorf("failed to delete empty room: %w", err)
		}
	}

	return nil
}

// UpdateHeartbeat refreshes the room and participant's last active timestamp.
// This prevents the room and participant from being cleaned up.
func (s *RoomService) UpdateHeartbeat(roomID, participantID string) error {
	// Update room activity
	if err := s.db.UpdateRoomActivity(roomID); err != nil {
		return err
	}
	// Update participant activity
	if participantID != "" {
		if err := s.db.UpdateParticipantActivity(participantID); err != nil {
			return err
		}
	}
	return nil
}

// generateRoomID creates a short, URL-friendly room identifier.
// Uses cryptographically secure random bytes encoded as hex.
func generateRoomID() (string, error) {
	bytes := make([]byte, 4) // 4 bytes = 8 hex characters
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// generateEncryptionKey creates a 256-bit encryption key for AES-GCM.
// Returns base64-encoded key string.
func generateEncryptionKey() (string, error) {
	bytes := make([]byte, 32) // 32 bytes = 256 bits
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64Encode(bytes), nil
}

// base64Encode encodes bytes to base64 string
func base64Encode(data []byte) string {
	const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	result := make([]byte, 0, (len(data)+2)/3*4)
	for i := 0; i < len(data); i += 3 {
		var b uint32
		remaining := len(data) - i
		if remaining >= 3 {
			b = uint32(data[i])<<16 | uint32(data[i+1])<<8 | uint32(data[i+2])
			result = append(result, base64Chars[b>>18&0x3F], base64Chars[b>>12&0x3F], base64Chars[b>>6&0x3F], base64Chars[b&0x3F])
		} else if remaining == 2 {
			b = uint32(data[i])<<16 | uint32(data[i+1])<<8
			result = append(result, base64Chars[b>>18&0x3F], base64Chars[b>>12&0x3F], base64Chars[b>>6&0x3F], '=')
		} else {
			b = uint32(data[i]) << 16
			result = append(result, base64Chars[b>>18&0x3F], base64Chars[b>>12&0x3F], '=', '=')
		}
	}
	return string(result)
}
