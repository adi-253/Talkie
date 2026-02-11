/**
 * useRealtime Hook
 * 
 * Manages Supabase Realtime Broadcast connection for real-time messaging.
 * Handles message broadcasting, typing indicators, and participant updates.
 * 
 * Uses Supabase Realtime Broadcast for reliable pub/sub communication.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';

export function useRealtime(roomId, participantId, onMessage, onTyping, onParticipantUpdate) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Store callbacks in refs to avoid recreating channel on callback changes
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onParticipantUpdateRef = useRef(onParticipantUpdate);
  const participantIdRef = useRef(participantId);

  // Keep refs up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
    onTypingRef.current = onTyping;
    onParticipantUpdateRef.current = onParticipantUpdate;
    participantIdRef.current = participantId;
  }, [onMessage, onTyping, onParticipantUpdate, participantId]);

  // Set up Supabase Realtime Broadcast channel
  useEffect(() => {
    if (!roomId || !participantId) return;

    console.log(`[Supabase Realtime] Subscribing to room: ${roomId}`);
    
    // Create a Broadcast channel for this room
    // Using 'self: true' so the sender also receives their own messages for consistency
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: true }
      }
    });

    // Listen for chat messages
    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      console.log('[Supabase Realtime] Received message:', payload.id?.slice(0, 8));
      if (onMessageRef.current) {
        onMessageRef.current(payload);
      }
    });

    // Listen for typing indicators
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      // Ignore our own typing events
      if (payload.participant_id !== participantIdRef.current && onTypingRef.current) {
        console.log('[Supabase Realtime] Received typing:', payload.username, payload.is_typing);
        onTypingRef.current(payload);
      }
    });

    // Listen for participant updates (join/leave)
    channel.on('broadcast', { event: 'participant' }, ({ payload }) => {
      console.log('[Supabase Realtime] Received participant update:', payload.action);
      if (onParticipantUpdateRef.current) {
        onParticipantUpdateRef.current(payload);
      }
    });

    // Subscribe to the channel
    channel.subscribe((status) => {
      console.log('[Supabase Realtime] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        console.log('[Supabase Realtime] ✓ Connected to room:', roomId);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setIsConnected(false);
        console.log('[Supabase Realtime] Disconnected from room:', roomId);
      }
    });

    channelRef.current = channel;

    // Cleanup on unmount or roomId/participantId change
    return () => {
      console.log('[Supabase Realtime] Cleaning up channel for room:', roomId);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [roomId, participantId]);

  // Send a message through Supabase Broadcast
  const sendMessage = useCallback(async (encryptedContent, metadata) => {
    if (!channelRef.current) {
      console.warn('[Supabase Realtime] Cannot send message - no channel');
      return;
    }

    const payload = {
      id: metadata?.id || crypto.randomUUID(),
      participant_id: participantIdRef.current,
      content: encryptedContent,
      timestamp: new Date().toISOString(),
      ...metadata
    };

    const result = await channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload
    });

    console.log('[Supabase Realtime] Message sent:', result);
  }, []);

  // Send typing indicator
  const sendTyping = useCallback(async (username) => {
    if (!channelRef.current) return;

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Send typing start
    await channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        participant_id: participantIdRef.current,
        username: username,
        is_typing: true
      }
    });

    // Auto-clear typing after 3 seconds
    typingTimeoutRef.current = setTimeout(async () => {
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            participant_id: participantIdRef.current,
            username: username,
            is_typing: false
          }
        });
      }
    }, 3000);
  }, []);

  // Send participant update
  const sendParticipantUpdate = useCallback(async (action, participant) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'participant',
      payload: {
        action, // 'join' or 'leave'
        participant
      }
    });
  }, []);

  return {
    isConnected,
    sendMessage,
    sendTyping,
    sendParticipantUpdate
  };
}
