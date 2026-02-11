package services

import (
	"log"
	"time"

	"github.com/adi-253/Talkie/backend/internal/supabase"
)

// CleanupService handles automatic deletion of inactive rooms.
// It runs as a background goroutine and periodically checks for stale rooms.
type CleanupService struct {
	db       *supabase.Client
	interval time.Duration
	timeout  time.Duration
	stopChan chan struct{}
}

// NewCleanupService creates a new cleanup service.
// - interval: how often to check for inactive rooms (e.g., 1 minute)
// - timeout: how long a room can be inactive before deletion (e.g., 5 minutes)
func NewCleanupService(db *supabase.Client, interval, timeout time.Duration) *CleanupService {
	return &CleanupService{
		db:       db,
		interval: interval,
		timeout:  timeout,
		stopChan: make(chan struct{}),
	}
}

// Start begins the background cleanup worker.
// This method runs in its own goroutine and should be called with 'go'.
func (s *CleanupService) Start() {
	log.Printf("Cleanup service started (interval: %v, timeout: %v)", s.interval, s.timeout)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanup()
		case <-s.stopChan:
			log.Println("Cleanup service stopped")
			return
		}
	}
}

// Stop gracefully shuts down the cleanup service.
func (s *CleanupService) Stop() {
	close(s.stopChan)
}

// cleanup finds and deletes all rooms and participants that have been inactive past the timeout threshold.
func (s *CleanupService) cleanup() {
	threshold := time.Now().UTC().Add(-s.timeout)

	// Clean up inactive participants first
	s.cleanupParticipants(threshold)

	// Then clean up inactive rooms
	s.cleanupRooms(threshold)
}

// cleanupParticipants removes participants who haven't sent a heartbeat recently
// Also deletes the room immediately if the last participant is removed
func (s *CleanupService) cleanupParticipants(threshold time.Time) {
	participants, err := s.db.GetInactiveParticipants(threshold)
	if err != nil {
		log.Printf("Cleanup error: failed to get inactive participants: %v", err)
		return
	}

	if len(participants) == 0 {
		return
	}

	log.Printf("Cleaning up %d inactive participants", len(participants))

	// Track rooms that might need to be deleted
	roomsToCheck := make(map[string]bool)

	for _, p := range participants {
		if err := s.db.RemoveParticipant(p.ID); err != nil {
			log.Printf("Failed to remove participant %s: %v", p.ID, err)
		} else {
			log.Printf("Removed inactive participant: %s (%s)", p.ID, p.Username)
			// Broadcast the leave event so other clients update instantly
			if err := s.db.BroadcastParticipantEvent(p.RoomID, "leave", &p); err != nil {
				log.Printf("Failed to broadcast participant leave for %s: %v", p.ID, err)
			}
			roomsToCheck[p.RoomID] = true
		}
	}

	// Check each affected room and delete if empty
	for roomID := range roomsToCheck {
		count, err := s.db.CountParticipants(roomID)
		if err != nil {
			log.Printf("Failed to count participants in room %s: %v", roomID, err)
			continue
		}
		if count == 0 {
			if err := s.db.DeleteRoom(roomID); err != nil {
				log.Printf("Failed to delete empty room %s: %v", roomID, err)
			} else {
				log.Printf("Deleted room %s (last participant removed)", roomID)
			}
		}
	}
}

// cleanupRooms removes rooms that have been inactive
func (s *CleanupService) cleanupRooms(threshold time.Time) {
	rooms, err := s.db.GetInactiveRooms(threshold)
	if err != nil {
		log.Printf("Cleanup error: failed to get inactive rooms: %v", err)
		return
	}

	if len(rooms) == 0 {
		return
	}

	log.Printf("Cleaning up %d inactive rooms", len(rooms))

	for _, room := range rooms {
		if err := s.db.DeleteRoom(room.ID); err != nil {
			log.Printf("Failed to delete room %s: %v", room.ID, err)
		} else {
			log.Printf("Deleted inactive room: %s", room.ID)
		}
	}
}
