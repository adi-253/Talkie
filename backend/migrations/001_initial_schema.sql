-- Talkie Database Schema
-- Run this SQL in your Supabase SQL Editor to create the required tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms table: stores ephemeral chat rooms
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL DEFAULT 'Untitled Room',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participants table: stores users currently in a room
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster room lookups by last_active_at (used for cleanup)
CREATE INDEX IF NOT EXISTS idx_rooms_last_active_at ON rooms(last_active_at);

-- Index for faster participant lookups by room_id
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);

-- Enable Row Level Security (optional - for production use)
-- ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Grant access to service role (required for backend operations)
-- Your service role key already has full access, so no additional grants needed

-- Enable realtime for the tables (for frontend subscriptions)
-- Run these in the Supabase dashboard under Database > Publications
-- or execute:
-- ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
-- ALTER PUBLICATION supabase_realtime ADD TABLE participants;
