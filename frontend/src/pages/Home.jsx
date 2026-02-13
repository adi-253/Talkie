/**
 * Home Page - Simple Room List & Creation
 * Auto-redirects to active room if user is already in one and room still exists
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, supabase } from '../utils/supabase';
import './Home.css';

const ACTIVE_ROOM_KEY = 'talkie_active_room';

// Helper to get active room — server verification is the source of truth
export const getActiveRoom = () => {
  return localStorage.getItem(ACTIVE_ROOM_KEY);
};

// Set active room
export const setActiveRoom = (roomId) => {
  if (roomId) {
    localStorage.setItem(ACTIVE_ROOM_KEY, roomId);
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

  // Subscribe to real-time room creation/deletion events
  useEffect(() => {
    let cancelled = false;
    let channel = null;

    const setupChannel = () => {
      channel = supabase.channel('rooms:lobby', {
        config: {
          broadcast: { self: false }
        }
      });

      channel.on('broadcast', { event: 'room' }, ({ payload }) => {
        if (cancelled) return;
        console.log('[Lobby] Room event:', payload.action, payload.room?.id);
        if (payload.action === 'created' && payload.room) {
          setRooms(prev => {
            // Avoid duplicates
            if (prev.some(r => r.id === payload.room.id)) return prev;
            return [payload.room, ...prev];
          });
        } else if (payload.action === 'deleted' && payload.room) {
          setRooms(prev => prev.filter(r => r.id !== payload.room.id));
        }
      });

      channel.subscribe((status) => {
        console.log('[Lobby] Subscription status:', status);
      });
    };

    // Small delay to handle React StrictMode double-mount cleanup race
    const timer = setTimeout(setupChannel, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

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
