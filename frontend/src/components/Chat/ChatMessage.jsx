/**
 * ChatMessage Component
 * 
 * Renders a single chat message with avatar, username, and timestamps.
 * Supports message grouping, replies, and @mentions highlighting.
 */

import { motion } from 'framer-motion';
import { Avatar } from '../UI/Avatar';
import './ChatMessage.css';

export function ChatMessage({ 
  message, 
  isOwn, 
  isGrouped, 
  currentUsername,
  onReply 
}) {
  const { username, avatar, content, timestamp, replyTo } = message;

  // Highlight @mentions in the message content
  const renderContent = (text) => {
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, index) => {
      // Every odd index is a username match
      if (index % 2 === 1) {
        const isCurrentUser = part.toLowerCase() === currentUsername?.toLowerCase();
        return (
          <span 
            key={index} 
            className={`message__mention ${isCurrentUser ? 'message__mention--self' : ''}`}
          >
            @{part}
          </span>
        );
      }
      return part;
    });
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      className={`message ${isOwn ? 'message--own' : ''} ${isGrouped ? 'message--grouped' : ''}`}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {!isGrouped && !isOwn && (
        <Avatar username={username} color={avatar} size="sm" />
      )}
      
      <div className="message__content-wrapper">
        {!isGrouped && !isOwn && (
          <span className="message__username">{username}</span>
        )}
        
        {replyTo && (
          <div className="message__reply-preview">
            <span className="message__reply-author">↩ {replyTo.username}</span>
            <span className="message__reply-text">{replyTo.content.substring(0, 50)}...</span>
          </div>
        )}
        
        <div className="message__bubble">
          <p className="message__text">{renderContent(content)}</p>
          <span className="message__time">{formatTime(timestamp)}</span>
        </div>

        {onReply && (
          <button 
            className="message__reply-btn"
            onClick={() => onReply(message)}
            aria-label="Reply to message"
          >
            Reply
          </button>
        )}
      </div>
    </motion.div>
  );
}
