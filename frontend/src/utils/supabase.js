/**
 * Supabase Client Configuration
 * 
 * This client is used for:
 * - Real-time subscriptions (message broadcasting, typing indicators)
 * - No direct database access - all data goes through our Go backend
 * 
 * The anon key is safe to expose in the frontend as it only has
 * permissions for realtime features.
 */

import { createClient } from '@supabase/supabase-js';

// Get configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

// Create and export the Supabase client with enhanced realtime configuration
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    realtime: {
      params: {
        eventsPerSecond: 10
      },
      // Enable debug logging for connection issues
      log_level: import.meta.env.DEV ? 'debug' : 'warn'
    }
  }
);

// Log connection status for debugging
if (import.meta.env.DEV) {
  console.log('[Supabase] Initialized with URL:', supabaseUrl);
  console.log('[Supabase] Anon key present:', !!supabaseAnonKey);
}

// API base URL for our Go backend
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * API helper for making requests to our Go backend
 */
export const api = {
  /**
   * List all active rooms
   * @returns {Promise<Array>}
   */
  async listRooms() {
    const response = await fetch(`${API_URL}/api/rooms`);
    if (!response.ok) throw new Error('Failed to fetch rooms');
    return response.json();
  },

  /**
   * Create a new chat room
   * @param {string} name - Optional room name
   * @returns {Promise<{room_id: string}>}
   */
  async createRoom(name = '') {
    const response = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw new Error('Failed to create room');
    return response.json();
  },

  /**
   * Get room info and participants
   * @param {string} roomId 
   * @returns {Promise<{room: object, participants: array}>}
   */
  async getRoom(roomId) {
    const response = await fetch(`${API_URL}/api/rooms/${roomId}`);
    if (!response.ok) throw new Error('Room not found');
    return response.json();
  },

  /**
   * Join a room with username and avatar
   * @param {string} roomId 
   * @param {string} username 
   * @param {string} avatar 
   * @returns {Promise<{participant_id: string, room: object, participants: array}>}
   */
  async joinRoom(roomId, username, avatar) {
    const response = await fetch(`${API_URL}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, avatar })
    });
    if (!response.ok) throw new Error('Failed to join room');
    return response.json();
  },

  /**
   * Leave a room
   * @param {string} roomId 
   * @param {string} participantId 
   */
  async leaveRoom(roomId, participantId) {
    await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: participantId })
    });
  },

  /**
   * Send heartbeat to keep room alive
   * @param {string} roomId 
   * @param {string} participantId 
   */
  async heartbeat(roomId, participantId) {
    await fetch(`${API_URL}/api/rooms/${roomId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: participantId })
    });
  },

  /**
   * Send a message to a room (for polling fallback)
   * @param {string} roomId
   * @param {object} message - { participant_id, content, username, avatar, reply_to }
   * @returns {Promise<object>}
   */
  async sendMessage(roomId, message) {
    const response = await fetch(`${API_URL}/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  },

  /**
   * Get messages from a room (for polling)
   * @param {string} roomId
   * @param {string} after - ISO timestamp to get messages after (optional)
   * @returns {Promise<{messages: array}>}
   */
  async getMessages(roomId, after = null) {
    const url = after 
      ? `${API_URL}/api/rooms/${roomId}/messages?after=${encodeURIComponent(after)}`
      : `${API_URL}/api/rooms/${roomId}/messages`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to get messages');
    return response.json();
  }
};
