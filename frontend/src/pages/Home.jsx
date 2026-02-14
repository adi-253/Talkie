/**
 * Home Page - Room List & Creation (with modal)
 * Auto-redirects to active room if user is already in one and room still exists
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, supabase } from '../utils/supabase';
import { ThemeToggle } from '../components/UI/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
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
  const [showModal, setShowModal] = useState(false);
  const modalInputRef = useRef(null);

  // Activate theme hook so data-theme attribute is set
  useTheme();

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

  const openModal = () => {
    setRoomName('');
    setShowModal(true);
    setTimeout(() => modalInputRef.current?.focus(), 100);
  };

  const closeModal = () => {
    setShowModal(false);
    setRoomName('');
    setError(null);
  };

  const handleModalKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') handleCreateRoom();
  };

  return (
    <div className="home">
      <header className="home__header">
        <div className="home__header-top">
          <ThemeToggle />
        </div>
        <h1 className="home__title">Talkie</h1>
        <p className="home__subtitle">Anonymous Chat Rooms</p>
      </header>

      <main className="home__content">
        {error && <p className="home__error">{error}</p>}

        <section className="home__rooms">
          <h2 className="home__section-title">Active Rooms</h2>
          
          {isLoading ? (
            <p className="home__loading">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <p className="home__empty">No active rooms. Tap + to create one!</p>
          ) : (
            <ul className="home__room-list">
              {rooms.map((room) => (
                <motion.li
                  key={room.id}
                  className="home__room-item"
                  onClick={() => handleJoinRoom(room.id)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="home__room-info">
                    <span className="home__room-name">{room.name || 'Untitled Room'}</span>
                    <span className="home__room-id">{room.id.slice(0, 8)}</span>
                  </div>
                  <button
                    className="home__join-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinRoom(room.id);
                    }}
                  >
                    Join
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* FAB Button */}
      <motion.button
        className="home__fab"
        onClick={openModal}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Create new room"
      >
        +
      </motion.button>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="home__modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              className="home__modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="home__modal-title">New Room</h2>
              <p className="home__modal-subtitle">Give your room a name to get started</p>
              <input
                ref={modalInputRef}
                type="text"
                className="home__modal-input"
                placeholder="Room name..."
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={handleModalKeyDown}
                maxLength={40}
                autoComplete="off"
              />
              <div className="home__modal-actions">
                <button className="home__modal-cancel" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  className="home__modal-create"
                  onClick={handleCreateRoom}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
