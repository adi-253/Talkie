/**
 * MessageList Component
 * 
 * Renders the scrollable list of chat messages.
 * Automatically scrolls to bottom on new messages.
 * Groups consecutive messages from the same sender.
 */

import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import './MessageList.css';

export function MessageList({ 
  messages, 
  currentParticipantId, 
  currentUsername,
  typingUsers,
  onReply 
}) {
  const listRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Determine if a message should be grouped with the previous one
  const shouldGroupWithPrevious = (message, index) => {
    if (index === 0) return false;
    const prevMessage = messages[index - 1];
    
    // Group if same sender and within 2 minutes
    if (prevMessage.participant_id !== message.participant_id) return false;
    
    const prevTime = new Date(prevMessage.timestamp).getTime();
    const currTime = new Date(message.timestamp).getTime();
    return (currTime - prevTime) < 120000; // 2 minutes
  };

  return (
    <div className="message-list" ref={listRef}>
      {messages.length === 0 ? (
        <div className="message-list__empty">
          <div className="message-list__empty-icon">💬</div>
          <p>No messages yet</p>
          <p>Start the conversation!</p>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              isOwn={message.participant_id === currentParticipantId}
              isGrouped={shouldGroupWithPrevious(message, index)}
              currentUsername={currentUsername}
              onReply={() => onReply?.(message)}
            />
          ))}
        </>
      )}
      
      <TypingIndicator typingUsers={typingUsers} />
      
      <div ref={bottomRef} />
    </div>
  );
}
