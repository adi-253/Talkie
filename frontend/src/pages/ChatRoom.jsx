/**
 * ChatRoom Page
 * 
 * The main chat interface where users send and receive messages.
 * Uses Supabase Realtime for instant message sync via WebSocket.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageList } from '../components/Chat/MessageList';
import { MessageInput } from '../components/Chat/MessageInput';
import { ParticipantList } from '../components/Room/ParticipantList';
import { JoinRoom } from '../components/Room/JoinRoom';
import { ThemeToggle } from '../components/UI/ThemeToggle';
import { useRoom } from '../hooks/useRoom';
import { useRealtime } from '../hooks/useRealtime';
import { useEncryption } from '../hooks/useEncryption';
import { api } from '../utils/supabase';
import { setActiveRoom, clearActiveRoom } from './Home';
import './ChatRoom.css';

export function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  // Room state
  const {
    room,
    participants,
    participantId,
    isLoading,
    error,
    joinRoom,
    leaveRoom,
    updateParticipants
  } = useRoom(roomId);

  // Encryption
  const { encrypt, decrypt } = useEncryption();

  // Local state
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  
  // Track seen message IDs to prevent duplicates
  const [seenMessageIds] = useState(() => new Set());

  // Handle incoming message from Supabase Realtime
  const handleIncomingMessage = useCallback(async (payload) => {
    // Skip if we've already seen this message
    if (seenMessageIds.has(payload.id)) return;
    seenMessageIds.add(payload.id);

    try {
      // Decrypt the message content
      const decryptedContent = await decrypt(payload.content);
      
      setMessages(prev => [...prev, {
        id: payload.id,
        participant_id: payload.participant_id,
        content: decryptedContent,
        timestamp: payload.timestamp,
        username: payload.username,
        avatar: payload.avatar,
        reply_to: payload.reply_to
      }]);
    } catch (err) {
      console.error('Failed to decrypt message:', err);
    }
  }, [decrypt, seenMessageIds]);

  // Handle typing indicator
  const handleTyping = useCallback((payload) => {
    if (payload.is_typing) {
      setTypingUsers(prev => {
        if (prev.some(u => u.participant_id === payload.participant_id)) return prev;
        return [...prev, { participant_id: payload.participant_id, username: payload.username }];
      });
      // Auto-remove after 3 seconds
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.participant_id !== payload.participant_id));
      }, 3000);
    } else {
      setTypingUsers(prev => prev.filter(u => u.participant_id !== payload.participant_id));
    }
  }, []);

  // Handle participant update from backend broadcast
  const handleParticipantUpdate = useCallback((payload) => {
    console.log('[ChatRoom] Participant update:', payload.action, payload.participant?.username);
    if (payload.action && payload.participant) {
      updateParticipants(payload.action, payload.participant);
    }
  }, [updateParticipants]);

  // Connect to Supabase Realtime
  const {
    isConnected,
    sendMessage: realtimeSendMessage,
    sendTyping,
    sendParticipantUpdate
  } = useRealtime(roomId, participantId, handleIncomingMessage, handleTyping, handleParticipantUpdate);

  // Restore username/avatar when participant is auto-restored from localStorage
  useEffect(() => {
    if (participantId && !username && roomId) {
      const storedUser = localStorage.getItem(`talkie_user_${roomId}`);
      if (storedUser) {
        try {
          const { username: storedName, avatar: storedAvatar } = JSON.parse(storedUser);
          setUsername(storedName);
          setAvatar(storedAvatar);
          setActiveRoom(roomId);
        } catch (err) {
          console.error('Failed to restore user info:', err);
        }
      }
    }
  }, [participantId, username, roomId]);

  // Fetch existing messages when joining a room
  useEffect(() => {
    if (!roomId || !participantId) return;

    const fetchExistingMessages = async () => {
      try {
        const { messages: existingMessages } = await api.getMessages(roomId);
        if (existingMessages && existingMessages.length > 0) {
          // Decrypt and add messages, avoiding duplicates
          for (const msg of existingMessages) {
            if (!seenMessageIds.has(msg.id)) {
              seenMessageIds.add(msg.id);
              const decryptedContent = await decrypt(msg.content);
              setMessages(prev => [...prev, {
                ...msg,
                content: decryptedContent
              }]);
            }
          }
          console.log(`[ChatRoom] Loaded ${existingMessages.length} existing messages`);
        }
      } catch (err) {
        console.error('Failed to fetch existing messages:', err);
      }
    };

    fetchExistingMessages();
  }, [roomId, participantId, decrypt, seenMessageIds]);

  // Clear active room on error
  useEffect(() => {
    if (error) {
      clearActiveRoom();
    }
  }, [error]);

  // Handle joining room (always asks for name/avatar)
  const handleJoin = async (newUsername, newAvatar) => {
    setIsJoining(true);
    try {
      await joinRoom(newUsername, newAvatar);
      setUsername(newUsername);
      setAvatar(newAvatar);
      setActiveRoom(roomId);
      // Backend broadcasts the join event after adding to DB
    } catch (err) {
      console.error('Failed to join:', err);
    } finally {
      setIsJoining(false);
    }
  };

  // Handle sending a message via Supabase Realtime
  const handleSend = async (content, replyTo) => {
    if (!participantId) return;

    try {
      // Encrypt the message content
      const encryptedContent = await encrypt(content);
      
      const messageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Build reply context if replying
      let replyContext = null;
      if (replyTo) {
        replyContext = {
          username: replyTo.username,
          content: replyTo.content.substring(0, 100)
        };
      }

      // Add message to local state immediately (optimistic update)
      seenMessageIds.add(messageId);
      setMessages(prev => [...prev, {
        id: messageId,
        participant_id: participantId,
        content, // Store decrypted for local display
        timestamp,
        username,
        avatar,
        reply_to: replyContext
      }]);

      // Broadcast encrypted message via Supabase Realtime (for live users)
      await realtimeSendMessage(encryptedContent, {
        id: messageId,
        username,
        avatar,
        reply_to: replyContext
      });

      // Also persist to backend API (for message history on new joins)
      try {
        await api.sendMessage(roomId, {
          participant_id: participantId,
          content: encryptedContent,
          username,
          avatar,
          reply_to: replyContext
        });
      } catch (err) {
        console.warn('Failed to persist message to API:', err);
        // Don't fail the whole send if persistence fails
      }
      
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle typing indicator
  const handleTypingInput = () => {
    if (username) {
      sendTyping(username);
    }
  };

  // Handle leaving
  const handleLeave = async () => {
    clearActiveRoom();
    // Backend broadcasts the leave event after removing from DB
    await leaveRoom();
    navigate('/');
  };

  // Copy share link
  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="chatroom chatroom--loading">
        <div className="chatroom__loader">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            💬
          </motion.div>
          <p>Loading room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="chatroom chatroom--error">
        <div className="chatroom__error-content">
          <h2>😕 Oops!</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  // Not joined yet - show join form (always asks for name/avatar)
  if (!participantId) {
    return <JoinRoom onJoin={handleJoin} isLoading={isJoining} />;
  }

  // Main chat view
  return (
    <div className="chatroom">
      <header className="chatroom__header">
        <div className="chatroom__header-left">
          <h1 className="chatroom__title">
            <span className="chatroom__title-icon">💬</span>
            {room?.name || 'Talkie'}
          </h1>
          <span className={`chatroom__status ${isConnected ? 'chatroom__status--connected' : ''}`}>
            {isConnected ? '● Connected' : '○ Connecting...'}
          </span>
        </div>

        <div className="chatroom__header-right">
          <button className="chatroom__share" onClick={copyShareLink}>
            📋 Copy Link
          </button>
          <ThemeToggle />
          <button className="chatroom__leave" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="chatroom__body">
        <main className="chatroom__main">
          <MessageList
            messages={messages}
            currentParticipantId={participantId}
            currentUsername={username}
            typingUsers={typingUsers}
            onReply={setReplyingTo}
          />
          <MessageInput
            onSend={handleSend}
            onTyping={handleTypingInput}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        </main>

        <ParticipantList
          participants={participants}
          currentParticipantId={participantId}
        />
      </div>
    </div>
  );
}
