/**
 * useRoom Hook
 * 
 * Manages room state, participant info, and handles room lifecycle events.
 * Includes heartbeat mechanism to keep the room alive.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/supabase';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function useRoom(roomId) {
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantId, setParticipantId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const heartbeatRef = useRef(null);

  // Fetch room info
  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    
    try {
      setIsLoading(true);
      const data = await api.getRoom(roomId);
      setRoom(data.room);
      setParticipants(data.participants || []);
      
      // Check if we have an existing participant ID in localStorage
      const storedParticipantId = localStorage.getItem(`talkie_participant_${roomId}`);
      if (storedParticipantId) {
        // Verify the participant still exists in the room (not removed by cleanup)
        const stillExists = (data.participants || []).some(p => p.id === storedParticipantId);
        if (stillExists) {
          // User is still active in room - restore session
          setParticipantId(storedParticipantId);
        } else {
          // Participant was removed (inactivity cleanup), clear storage
          // User will be asked for name/avatar again
          localStorage.removeItem(`talkie_participant_${roomId}`);
          localStorage.removeItem(`talkie_user_${roomId}`);
        }
      }
      
      setError(null);
    } catch (err) {
      setError('Room not found');
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // Join room with username and avatar
  const joinRoom = useCallback(async (username, avatar) => {
    if (!roomId) throw new Error('No room ID');
    
    try {
      const data = await api.joinRoom(roomId, username, avatar);
      setParticipantId(data.participant_id);
      setRoom(data.room);
      setParticipants(data.participants || []);
      
      // Store participant ID in localStorage for persistence across tabs
      localStorage.setItem(`talkie_participant_${roomId}`, data.participant_id);
      localStorage.setItem(`talkie_user_${roomId}`, JSON.stringify({ username, avatar }));
      
      return data;
    } catch (err) {
      throw new Error('Failed to join room');
    }
  }, [roomId]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!roomId || !participantId) return;
    
    try {
      await api.leaveRoom(roomId, participantId);
      localStorage.removeItem(`talkie_participant_${roomId}`);
      localStorage.removeItem(`talkie_user_${roomId}`);
      setParticipantId(null);
      
      // Clear heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    } catch (err) {
      console.error('Failed to leave room:', err);
    }
  }, [roomId, participantId]);

  // Update participants list (called from realtime updates)
  const updateParticipants = useCallback((action, participant) => {
    if (action === 'join') {
      setParticipants(prev => {
        // Avoid duplicates
        if (prev.some(p => p.id === participant.id)) return prev;
        return [...prev, participant];
      });
    } else if (action === 'leave') {
      setParticipants(prev => prev.filter(p => p.id !== participant.id));
    }
  }, []);

  // Start heartbeat when joined
  useEffect(() => {
    if (!roomId || !participantId) return;

    // Send heartbeat every 30 seconds
    heartbeatRef.current = setInterval(() => {
      api.heartbeat(roomId, participantId).catch(console.error);
    }, HEARTBEAT_INTERVAL);

    // Send initial heartbeat
    api.heartbeat(roomId, participantId).catch(console.error);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [roomId, participantId]);

  // NOTE: We don't use beforeunload to leave room because it fires on refresh too
  // Instead, we rely on heartbeat-based cleanup (5 min inactivity)

  // Fetch room on mount
  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  return {
    room,
    participants,
    participantId,
    isLoading,
    error,
    joinRoom,
    leaveRoom,
    updateParticipants,
    refetch: fetchRoom
  };
}
