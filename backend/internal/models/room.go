package models

import "time"

// Room represents a temporary chat room in Talkie.
// Rooms are ephemeral and automatically deleted when all participants leave
// or when inactive for too long.
type Room struct {
	// ID is the unique identifier for the room, used in shareable URLs
	ID string `json:"id"`

	// Name is the display name of the room
	Name string `json:"name"`

	// EncryptionKey is the shared AES key for message encryption (base64)
	EncryptionKey string `json:"encryption_key,omitempty"`

	// CreatedAt is when the room was first created
	CreatedAt time.Time `json:"created_at"`

	// LastActiveAt is updated on each heartbeat to track room activity
	// Used by the cleanup service to delete inactive rooms
	LastActiveAt time.Time `json:"last_active_at"`
}

// Participant represents a user currently in a chat room.
// Participants are anonymous and identified only by their chosen username and avatar.
type Participant struct {
	// ID is the unique identifier for this participant session
	ID string `json:"id"`

	// RoomID links this participant to their current room
	RoomID string `json:"room_id"`

	// Username is the temporary display name chosen by the user
	Username string `json:"username"`

	// Avatar is the chosen avatar identifier/URL for the user
	Avatar string `json:"avatar"`

	// JoinedAt is when this participant joined the room
	JoinedAt time.Time `json:"joined_at"`

	// LastActiveAt is updated on each heartbeat for inactivity tracking
	LastActiveAt time.Time `json:"last_active_at"`
}

// CreateRoomRequest is the request body for creating a new room
type CreateRoomRequest struct {
	Name string `json:"name"`
}

// CreateRoomResponse is the response after creating a room
type CreateRoomResponse struct {
	RoomID string `json:"room_id"`
}

// JoinRoomRequest is the request body for joining a room
type JoinRoomRequest struct {
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
}

// JoinRoomResponse is the response after joining a room
type JoinRoomResponse struct {
	ParticipantID string        `json:"participant_id"`
	Room          Room          `json:"room"`
	Participants  []Participant `json:"participants"`
}

// LeaveRoomRequest is the request body for leaving a room
type LeaveRoomRequest struct {
	ParticipantID string `json:"participant_id"`
}

// HeartbeatRequest is used to keep the room alive
type HeartbeatRequest struct {
	ParticipantID string `json:"participant_id"`
}

// RoomInfoResponse contains room details and current participants
type RoomInfoResponse struct {
	Room         Room          `json:"room"`
	Participants []Participant `json:"participants"`
}
