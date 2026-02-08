/**
 * ParticipantList Component
 * 
 * Shows all users currently in the chat room.
 * Collapsible on mobile for better space usage.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '../UI/Avatar';
import './ParticipantList.css';

export function ParticipantList({ participants, currentParticipantId }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`participant-list ${isCollapsed ? 'participant-list--collapsed' : ''}`}>
      <button 
        className="participant-list__toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Show participants' : 'Hide participants'}
      >
        <span className="participant-list__toggle-icon">
          {isCollapsed ? '◀' : '▶'}
        </span>
        <span className="participant-list__count">{participants.length}</span>
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="participant-list__content"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
          >
            <h3 className="participant-list__title">
              Participants ({participants.length})
            </h3>
            
            <ul className="participant-list__users">
              {participants.map((participant) => (
                <motion.li
                  key={participant.id}
                  className="participant-list__user"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Avatar 
                    username={participant.username} 
                    color={participant.avatar} 
                    size="sm"
                    showOnline
                  />
                  <span className="participant-list__username">
                    {participant.username}
                    {participant.id === currentParticipantId && (
                      <span className="participant-list__you"> (you)</span>
                    )}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
