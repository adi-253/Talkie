/**
 * MessageInput Component
 * 
 * Input field for composing and sending messages.
 * Handles typing indicators, emoji support, and reply context.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './MessageInput.css';

export function MessageInput({ 
  onSend, 
  onTyping, 
  replyingTo, 
  onCancelReply,
  disabled 
}) {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  // Focus input when replying
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;

    onSend(message.trim(), replyingTo);
    setMessage('');
    if (onCancelReply) onCancelReply();
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    if (onTyping) onTyping();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
    if (e.key === 'Escape' && replyingTo) {
      onCancelReply?.();
    }
  };

  return (
    <div className="message-input-container">
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            className="message-input__reply-preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="message-input__reply-content">
              <span className="message-input__reply-label">Replying to {replyingTo.username}</span>
              <span className="message-input__reply-text">{replyingTo.content}</span>
            </div>
            <button 
              className="message-input__reply-cancel"
              onClick={onCancelReply}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <form className="message-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="message-input__field"
          placeholder="Type a message..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        <motion.button
          type="submit"
          className="message-input__send"
          disabled={!message.trim() || disabled}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </motion.button>
      </form>
    </div>
  );
}
