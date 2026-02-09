/**
 * useRealtime Hook
 * 
 * Manages WebSocket connection to Go backend for real-time messaging.
 * Handles message broadcasting, typing indicators, and participant updates.
 * 
 * Uses native WebSocket for reliable connections instead of Supabase Realtime.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../utils/supabase';

// Convert HTTP URL to WebSocket URL
const getWsUrl = () => {
  const httpUrl = API_URL || 'http://localhost:8080';
  return httpUrl.replace(/^http/, 'ws');
};

export function useRealtime(roomId, participantId, onMessage, onTyping, onParticipantUpdate) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Store callbacks in refs to avoid recreating WebSocket on callback changes
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

  // Set up WebSocket connection
  useEffect(() => {
    if (!roomId || !participantId) return;

    const connectWebSocket = () => {
      const wsUrl = `${getWsUrl()}/ws/${roomId}?participant_id=${encodeURIComponent(participantId)}`;
      console.log(`[WebSocket] Connecting to: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] ✓ Connected');
        setIsConnected(true);
        
        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received:', data.type);

          switch (data.type) {
            case 'message':
              if (onMessageRef.current) {
                onMessageRef.current(data.payload);
              }
              break;
            case 'typing':
              if (onTypingRef.current && data.payload.participant_id !== participantIdRef.current) {
                onTypingRef.current(data.payload);
              }
              break;
            case 'participant_update':
              if (onParticipantUpdateRef.current) {
                onParticipantUpdateRef.current(data.payload);
              }
              break;
            default:
              console.warn('[WebSocket] Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect after 2 seconds (unless it was a clean close)
        if (event.code !== 1000) {
          console.log('[WebSocket] Reconnecting in 2 seconds...');
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount or roomId/participantId change
    return () => {
      console.log('[WebSocket] Cleaning up connection');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [roomId, participantId]);

  // Send a message through WebSocket
  const sendMessage = useCallback(async (encryptedContent, metadata) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send message - not connected');
      return;
    }

    const message = {
      type: 'message',
      payload: {
        id: metadata?.id || crypto.randomUUID(),
        participant_id: participantIdRef.current,
        content: encryptedContent,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };

    wsRef.current.send(JSON.stringify(message));
    console.log('[WebSocket] Message sent');
  }, []);

  // Send typing indicator
  const sendTyping = useCallback(async (username) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const message = {
      type: 'typing',
      payload: {
        participant_id: participantIdRef.current,
        username: username,
        is_typing: true
      }
    };

    wsRef.current.send(JSON.stringify(message));

    // Auto-clear typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'typing',
          payload: {
            participant_id: participantIdRef.current,
            username: username,
            is_typing: false
          }
        }));
      }
    }, 3000);
  }, []);

  // Send participant update
  const sendParticipantUpdate = useCallback(async (action, participant) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const message = {
      type: 'participant_update',
      payload: {
        action, // 'join' or 'leave'
        participant
      }
    };

    wsRef.current.send(JSON.stringify(message));
  }, []);

  return {
    isConnected,
    sendMessage,
    sendTyping,
    sendParticipantUpdate
  };
}
