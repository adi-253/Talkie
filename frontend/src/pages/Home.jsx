/**
 * Home Page - Simple Room List & Creation
 * Auto-redirects to active room if user is already in one and room still exists
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/supabase';
import './Home.css';

const ACTIVE_ROOM_KEY = 'talkie_active_room';
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in ms

// Helper to get active room with timestamp check
export const getActiveRoom = () => {
  const stored = localStorage.getItem(ACTIVE_ROOM_KEY);
  if (!stored) return null;
  
  try {
    const { roomId, timestamp } = JSON.parse(stored);
    // Check if within 5-minute window
    if (Date.now() - timestamp < INACTIVITY_TIMEOUT) {
      return roomId;
    }
    // Expired - clear it
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    return null;
  } catch {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    return null;
  }
};

// Set active room with timestamp
export const setActiveRoom = (roomId) => {
  if (roomId) {
    localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({
      roomId,
      timestamp: Date.now()
    }));
  } else {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
  }
};

// Clear active room (called when room is not found or user leaves)
export const clearActiveRoom = () => {
  localStorage.removeItem(ACTIVE_ROOM_KEY);
};

export function Home() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  // Check for active room and redirect if it still exists
  useEffect(() => {
    const checkActiveRoom = async () => {
      const activeRoomId = getActiveRoom();
      
      if (activeRoomId) {
        try {
          // Verify room still exists on server
          await api.getRoom(activeRoomId);
          // Room exists, redirect to it
          navigate(`/room/${activeRoomId}`);
          return;
        } catch (err) {
          // Room no longer exists, clear it
          console.log('Active room no longer exists, clearing...');
          clearActiveRoom();
        }
      }
      
      // No active room or room doesn't exist, show home page
      fetchRooms();
    };

    checkActiveRoom();
  }, [navigate]);

  const fetchRooms = async () => {
    try {
      const data = await api.listRooms();
      setRooms(data || []);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const { room_id } = await api.createRoom(roomName || 'Untitled Room');
      setActiveRoom(room_id);
      navigate(`/room/${room_id}`);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      setIsCreating(false);
    }
  };

  const handleJoinRoom = (roomId) => {
    setActiveRoom(roomId);
    navigate(`/room/${roomId}`);
  };

  return (
    <div className="home">
      <header className="home__header">
        <h1 className="home__title">Talkie</h1>
        <p className="home__subtitle">Anonymous Chat Rooms</p>
      </header>

      <main className="home__content">
        <div className="home__create-section">
          <input
            type="text"
            className="home__name-input"
            placeholder="Room name (optional)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
          <button
            className="home__create-btn"
            onClick={handleCreateRoom}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : '+ Create Room'}
          </button>
        </div>

        {error && <p className="home__error">{error}</p>}

        <section className="home__rooms">
          <h2 className="home__section-title">Active Rooms</h2>
          
          {isLoading ? (
            <p className="home__loading">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <p className="home__empty">No active rooms. Create one to get started!</p>
          ) : (
            <ul className="home__room-list">
              {rooms.map((room) => (
                <li key={room.id} className="home__room-item">
                  <div className="home__room-info">
                    <span className="home__room-name">{room.name || 'Untitled Room'}</span>
                    <span className="home__room-id">{room.id.slice(0, 8)}</span>
                  </div>
                  <button
                    className="home__join-btn"
                    onClick={() => handleJoinRoom(room.id)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
