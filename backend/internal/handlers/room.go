package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/adi-253/Talkie/backend/internal/models"
	"github.com/adi-253/Talkie/backend/internal/services"
	"github.com/go-chi/chi/v5"
)

// RoomHandler contains HTTP handlers for room operations.
// All handlers follow RESTful conventions and return JSON responses.
type RoomHandler struct {
	roomService *services.RoomService
}

// NewRoomHandler creates a new RoomHandler instance.
func NewRoomHandler(roomService *services.RoomService) *RoomHandler {
	return &RoomHandler{roomService: roomService}
}

// CreateRoom handles POST /api/rooms
// Creates a new chat room and returns its ID for sharing.
func (h *RoomHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// If no body, use default name
		req.Name = ""
	}

	room, err := h.roomService.CreateRoom(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := models.CreateRoomResponse{
		RoomID: room.ID,
	}

	writeJSON(w, http.StatusCreated, response)
}

// ListRooms handles GET /api/rooms
// Returns all active rooms.
func (h *RoomHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.roomService.ListRooms()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, rooms)
}

// GetRoom handles GET /api/rooms/{id}
// Returns room details and current participants.
func (h *RoomHandler) GetRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	room, participants, err := h.roomService.GetRoom(roomID)
	if err != nil {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}

	response := models.RoomInfoResponse{
		Room:         *room,
		Participants: participants,
	}

	writeJSON(w, http.StatusOK, response)
}

// JoinRoom handles POST /api/rooms/{id}/join
// Adds a new participant to the room with their chosen username and avatar.
func (h *RoomHandler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	var req models.JoinRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	participant, room, participants, err := h.roomService.JoinRoom(roomID, req.Username, req.Avatar)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := models.JoinRoomResponse{
		ParticipantID: participant.ID,
		Room:          *room,
		Participants:  participants,
	}

	writeJSON(w, http.StatusOK, response)
}

// LeaveRoom handles POST /api/rooms/{id}/leave
// Removes a participant from the room.
func (h *RoomHandler) LeaveRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	var req models.LeaveRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.ParticipantID == "" {
		http.Error(w, "participant ID is required", http.StatusBadRequest)
		return
	}

	if err := h.roomService.LeaveRoom(roomID, req.ParticipantID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Heartbeat handles POST /api/rooms/{id}/heartbeat
// Updates the room and participant's activity timestamp to prevent auto-deletion.
func (h *RoomHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	if roomID == "" {
		http.Error(w, "room ID is required", http.StatusBadRequest)
		return
	}

	// Parse request body for participant_id
	var req struct {
		ParticipantID string `json:"participant_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if err := h.roomService.UpdateHeartbeat(roomID, req.ParticipantID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// writeJSON is a helper function to write JSON responses.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
