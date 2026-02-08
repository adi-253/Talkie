package models

import "time"

// Message represents an encrypted chat message.
// Messages are stored temporarily in-memory for polling-based sync.
// The content is encrypted on the client and never decrypted by the server.
type Message struct {
	// ID is the unique identifier for this message
	ID string `json:"id"`

	// RoomID is the room this message belongs to
	RoomID string `json:"room_id"`

	// ParticipantID is the sender's participant ID
	ParticipantID string `json:"participant_id"`

	// Content is the encrypted message payload (encrypted by the client)
	Content string `json:"content"`

	// Username is the sender's display name
	Username string `json:"username"`

	// Avatar is the sender's avatar identifier
	Avatar string `json:"avatar"`

	// Timestamp is when the message was sent
	Timestamp time.Time `json:"timestamp"`

	// ReplyTo contains optional reply context
	ReplyTo *ReplyContext `json:"reply_to,omitempty"`
}

// ReplyContext holds information about a message being replied to
type ReplyContext struct {
	Username string `json:"username"`
	Content  string `json:"content"` // Truncated content for preview
}

// SendMessageRequest is the request body for sending a message
type SendMessageRequest struct {
	ParticipantID string        `json:"participant_id"`
	Content       string        `json:"content"` // Encrypted content
	Username      string        `json:"username"`
	Avatar        string        `json:"avatar"`
	ReplyTo       *ReplyContext `json:"reply_to,omitempty"`
}

// GetMessagesResponse is the response for fetching messages
type GetMessagesResponse struct {
	Messages []Message `json:"messages"`
}
