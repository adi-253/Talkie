/**
 * ChatRoom Page
 * 
 * The main chat interface where users send and receive messages.
 * Uses HTTP polling for message sync. Always asks for name/avatar when joining.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageList } from '../components/Chat/MessageList';
import { MessageInput } from '../components/Chat/MessageInput';
import { ParticipantList } from '../components/Room/ParticipantList';
import { JoinRoom } from '../components/Room/JoinRoom';
import { ThemeToggle } from '../components/UI/ThemeToggle';
import { useRoom } from '../hooks/useRoom';
import { useEncryption } from '../hooks/useEncryption';
import { api } from '../utils/supabase';
import { setActiveRoom, clearActiveRoom } from './Home';
import './ChatRoom.css';

const POLLING_INTERVAL = 2000; // Poll every 2 seconds

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
    leaveRoom
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
  
  // Track last message timestamp for polling
  const lastMessageTimeRef = useRef(null);
  const seenMessageIdsRef = useRef(new Set());

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

  // Clear active room on error
  useEffect(() => {
    if (error) {
      clearActiveRoom();
    }
  }, [error]);

  // Poll for new messages
  useEffect(() => {
    if (!roomId || !participantId) return;

    const pollMessages = async () => {
      try {
        const response = await api.getMessages(roomId, lastMessageTimeRef.current);
        const newMessages = response.messages || [];
        
        if (newMessages.length > 0) {
          for (const msg of newMessages) {
            // Skip already displayed messages (dedup by ID only)
            if (seenMessageIdsRef.current.has(msg.id)) continue;
            seenMessageIdsRef.current.add(msg.id);
            
            try {
              const decryptedContent = await decrypt(msg.content);
              setMessages(prev => [...prev, {
                ...msg,
                content: decryptedContent
              }]);
            } catch (err) {
              console.error('Failed to decrypt message:', err);
            }
          }
          
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg?.timestamp) {
            lastMessageTimeRef.current = lastMsg.timestamp;
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    const interval = setInterval(pollMessages, POLLING_INTERVAL);
    pollMessages();

    return () => clearInterval(interval);
  }, [roomId, participantId, decrypt]);

  // Handle joining room (always asks for name/avatar)
  const handleJoin = async (newUsername, newAvatar) => {
    setIsJoining(true);
    try {
      await joinRoom(newUsername, newAvatar);
      setUsername(newUsername);
      setAvatar(newAvatar);
      setActiveRoom(roomId);
    } catch (err) {
      console.error('Failed to join:', err);
    } finally {
      setIsJoining(false);
    }
  };

  // Handle sending a message via HTTP API
  const handleSend = async (content, replyTo) => {
    if (!participantId) return;

    try {
      const encryptedContent = await encrypt(content);
      
      const messageData = {
        participant_id: participantId,
        content: encryptedContent,
        username,
        avatar
      };

      if (replyTo) {
        messageData.reply_to = {
          username: replyTo.username,
          content: replyTo.content.substring(0, 100)
        };
      }

      const savedMsg = await api.sendMessage(roomId, messageData);
      seenMessageIdsRef.current.add(savedMsg.id);

      setMessages(prev => [...prev, {
        id: savedMsg.id,
        participant_id: participantId,
        content,
        timestamp: savedMsg.timestamp,
        username,
        avatar,
        reply_to: messageData.reply_to
      }]);
      
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle leaving
  const handleLeave = async () => {
    clearActiveRoom();
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
          <span className="chatroom__status">● Syncing</span>
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
            onTyping={() => {}}
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
