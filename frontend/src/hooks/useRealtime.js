/**
 * useRealtime Hook
 * 
 * Manages Supabase Realtime subscriptions for a chat room.
 * Handles message broadcasting, typing indicators, and participant updates.
 * 
 * IMPORTANT: Uses refs for callbacks to prevent channel recreation on re-renders.
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

  // Set up realtime channel - only recreate when roomId changes
  useEffect(() => {
    if (!roomId) return;

    const channelName = `room:${roomId}`;
    console.log(`[Realtime] Creating channel: ${channelName}`);
    
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false } // Don't receive our own broadcasts
      }
    });

    // Listen for new messages
    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      if (onMessageRef.current) {
        onMessageRef.current(payload);
      }
    });

    // Listen for typing indicators
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (onTypingRef.current && payload.participant_id !== participantIdRef.current) {
        onTypingRef.current(payload);
      }
    });

    // Listen for participant updates (join/leave)
    channel.on('broadcast', { event: 'participant_update' }, ({ payload }) => {
      if (onParticipantUpdateRef.current) {
        onParticipantUpdateRef.current(payload);
      }
    });

    // Subscribe and track connection status with detailed logging
    channel.subscribe((status, err) => {
      console.log(`[Realtime] Channel ${channelName} status:`, status);
      
      if (err) {
        console.error('[Realtime] Subscription error:', err);
      }
      
      switch (status) {
        case 'SUBSCRIBED':
          console.log('[Realtime] ✓ Successfully connected to channel');
          setIsConnected(true);
          break;
        case 'CHANNEL_ERROR':
          console.error('[Realtime] ✗ Channel error - check Supabase Realtime settings');
          setIsConnected(false);
          break;
        case 'TIMED_OUT':
          console.error('[Realtime] ✗ Connection timed out');
          setIsConnected(false);
          break;
        case 'CLOSED':
          console.log('[Realtime] Channel closed');
          setIsConnected(false);
          break;
        default:
          setIsConnected(false);
      }
    });

    channelRef.current = channel;

    // Cleanup on unmount or roomId change
    return () => {
      console.log(`[Realtime] Cleaning up channel: ${channelName}`);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId]); // Only depend on roomId!

  // Broadcast an encrypted message
  const sendMessage = useCallback(async (encryptedContent, metadata) => {
    if (!channelRef.current) {
      console.warn('[Realtime] Cannot send message - channel not created');
      return;
    }

    // Wait a moment for WebSocket to be ready if not connected
    if (!isConnected) {
      console.log('[Realtime] Channel not yet subscribed, waiting...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const result = await channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: {
        id: crypto.randomUUID(),
        participant_id: participantIdRef.current,
        content: encryptedContent,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
    
    console.log('[Realtime] Message sent, result:', result);
  }, [isConnected]);

  // Broadcast typing indicator
  const sendTyping = useCallback(async (username) => {
    if (!channelRef.current) return;

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

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
    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current) {
        channelRef.current.send({
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

  // Broadcast participant update
  const sendParticipantUpdate = useCallback(async (action, participant) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: 'broadcast',
      event: 'participant_update',
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
