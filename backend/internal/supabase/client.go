package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/adi-253/Talkie/backend/internal/config"
	"github.com/adi-253/Talkie/backend/internal/models"
)

// Client is a wrapper around the Supabase REST API.
// It uses the service role key for backend operations with elevated privileges.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Supabase client with the given configuration.
func NewClient(cfg *config.Config) *Client {
	return &Client{
		baseURL: cfg.SupabaseURL,
		apiKey:  cfg.SupabaseKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// doRequest executes an HTTP request to the Supabase REST API.
// It automatically adds authentication headers and handles the response.
func (c *Client) doRequest(method, endpoint string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	url := fmt.Sprintf("%s/rest/v1/%s", c.baseURL, endpoint)
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add Supabase authentication headers
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase error (status %d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// CreateRoom inserts a new room into the database.
func (c *Client) CreateRoom(room *models.Room) error {
	_, err := c.doRequest("POST", "rooms", room)
	return err
}

// GetRoom retrieves a room by its ID.
func (c *Client) GetRoom(id string) (*models.Room, error) {
	endpoint := fmt.Sprintf("rooms?id=eq.%s&select=*", id)
	respBody, err := c.doRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var rooms []models.Room
	if err := json.Unmarshal(respBody, &rooms); err != nil {
		return nil, fmt.Errorf("failed to parse room: %w", err)
	}

	if len(rooms) == 0 {
		return nil, fmt.Errorf("room not found")
	}

	return &rooms[0], nil
}

// ListRooms retrieves all active rooms.
func (c *Client) ListRooms() ([]models.Room, error) {
	respBody, err := c.doRequest("GET", "rooms?select=*&order=created_at.desc", nil)
	if err != nil {
		return nil, err
	}

	var rooms []models.Room
	if err := json.Unmarshal(respBody, &rooms); err != nil {
		return nil, fmt.Errorf("failed to parse rooms: %w", err)
	}

	return rooms, nil
}

// UpdateRoomActivity updates the last_active_at timestamp for a room.
func (c *Client) UpdateRoomActivity(roomID string) error {
	data := map[string]interface{}{
		"last_active_at": time.Now().UTC(),
	}
	endpoint := fmt.Sprintf("rooms?id=eq.%s", roomID)
	_, err := c.doRequest("PATCH", endpoint, data)
	return err
}

// DeleteRoom removes a room from the database.
// This will cascade delete all participants due to the foreign key constraint.
func (c *Client) DeleteRoom(id string) error {
	endpoint := fmt.Sprintf("rooms?id=eq.%s", id)
	_, err := c.doRequest("DELETE", endpoint, nil)
	return err
}

// AddParticipant inserts a new participant into a room.
func (c *Client) AddParticipant(participant *models.Participant) error {
	_, err := c.doRequest("POST", "participants", participant)
	return err
}

// GetParticipants retrieves all participants in a room.
func (c *Client) GetParticipants(roomID string) ([]models.Participant, error) {
	endpoint := fmt.Sprintf("participants?room_id=eq.%s&select=*", roomID)
	respBody, err := c.doRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var participants []models.Participant
	if err := json.Unmarshal(respBody, &participants); err != nil {
		return nil, fmt.Errorf("failed to parse participants: %w", err)
	}

	return participants, nil
}

// GetParticipant retrieves a single participant by ID.
func (c *Client) GetParticipant(participantID string) (*models.Participant, error) {
	endpoint := fmt.Sprintf("participants?id=eq.%s&select=*", participantID)
	respBody, err := c.doRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var participants []models.Participant
	if err := json.Unmarshal(respBody, &participants); err != nil {
		return nil, fmt.Errorf("failed to parse participant: %w", err)
	}

	if len(participants) == 0 {
		return nil, fmt.Errorf("participant not found: %s", participantID)
	}

	return &participants[0], nil
}

// RemoveParticipant deletes a participant from the database.
func (c *Client) RemoveParticipant(participantID string) error {
	endpoint := fmt.Sprintf("participants?id=eq.%s", participantID)
	_, err := c.doRequest("DELETE", endpoint, nil)
	return err
}

// CountParticipants returns the number of participants in a room.
func (c *Client) CountParticipants(roomID string) (int, error) {
	participants, err := c.GetParticipants(roomID)
	if err != nil {
		return 0, err
	}
	return len(participants), nil
}

// GetInactiveRooms returns rooms that haven't been active since the given threshold.
func (c *Client) GetInactiveRooms(threshold time.Time) ([]models.Room, error) {
	endpoint := fmt.Sprintf("rooms?last_active_at=lt.%s&select=*", threshold.Format(time.RFC3339))
	respBody, err := c.doRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var rooms []models.Room
	if err := json.Unmarshal(respBody, &rooms); err != nil {
		return nil, fmt.Errorf("failed to parse rooms: %w", err)
	}

	return rooms, nil
}

// UpdateParticipantActivity updates the last_active_at timestamp for a participant.
func (c *Client) UpdateParticipantActivity(participantID string) error {
	data := map[string]interface{}{
		"last_active_at": time.Now().UTC(),
	}
	endpoint := fmt.Sprintf("participants?id=eq.%s", participantID)
	_, err := c.doRequest("PATCH", endpoint, data)
	return err
}

// BroadcastParticipantEvent sends a Supabase Realtime Broadcast event to notify
// connected clients about a participant joining or leaving.
// This uses the Supabase Realtime REST API so no WebSocket connection is needed.
func (c *Client) BroadcastParticipantEvent(roomID string, action string, participant *models.Participant) error {
	payload := map[string]interface{}{
		"messages": []map[string]interface{}{
			{
				"topic": fmt.Sprintf("room:%s", roomID),
				"event": "participant",
				"payload": map[string]interface{}{
					"action": action,
					"participant": map[string]interface{}{
						"id":       participant.ID,
						"room_id":  participant.RoomID,
						"username": participant.Username,
						"avatar":   participant.Avatar,
					},
				},
			},
		},
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast payload: %w", err)
	}

	url := fmt.Sprintf("%s/realtime/v1/api/broadcast", c.baseURL)
	log.Printf("[Broadcast] Participant %s in room:%s (user: %s)", action, roomID, participant.Username)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create broadcast request: %w", err)
	}

	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("broadcast request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		log.Printf("[Broadcast] Participant event failed: status=%d body=%s", resp.StatusCode, string(body))
		return fmt.Errorf("broadcast error (status %d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// BroadcastRoomEvent sends a Supabase Realtime Broadcast event to notify
// connected clients about a room being created or deleted.
// This broadcasts on a global "rooms:lobby" channel so the Home page can update in real-time.
func (c *Client) BroadcastRoomEvent(action string, room *models.Room) error {
	payload := map[string]interface{}{
		"messages": []map[string]interface{}{
			{
				"topic": "rooms:lobby",
				"event": "room",
				"payload": map[string]interface{}{
					"action": action,
					"room": map[string]interface{}{
						"id":   room.ID,
						"name": room.Name,
					},
				},
			},
		},
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal room broadcast payload: %w", err)
	}

	url := fmt.Sprintf("%s/realtime/v1/api/broadcast", c.baseURL)
	log.Printf("[Broadcast] Room %s: %s", action, room.ID)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create room broadcast request: %w", err)
	}

	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("room broadcast request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		log.Printf("[Broadcast] Room event failed: status=%d body=%s", resp.StatusCode, string(body))
		return fmt.Errorf("room broadcast error (status %d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetInactiveParticipants returns participants that haven't been active since the given threshold.
func (c *Client) GetInactiveParticipants(threshold time.Time) ([]models.Participant, error) {
	endpoint := fmt.Sprintf("participants?last_active_at=lt.%s&select=*", threshold.Format(time.RFC3339))
	respBody, err := c.doRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var participants []models.Participant
	if err := json.Unmarshal(respBody, &participants); err != nil {
		return nil, fmt.Errorf("failed to parse participants: %w", err)
	}

	return participants, nil
}
