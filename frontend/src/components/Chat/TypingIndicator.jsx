/**
 * TypingIndicator Component
 * 
 * Shows animated dots when other users are typing.
 */

import { motion, AnimatePresence } from 'framer-motion';
import './TypingIndicator.css';

export function TypingIndicator({ typingUsers }) {
  if (!typingUsers || typingUsers.length === 0) {
    return null;
  }

  const formatTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is typing`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0]} and ${typingUsers[1]} are typing`;
    } else {
      return 'Several people are typing';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="typing-indicator"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
      >
        <div className="typing-indicator__dots">
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          />
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
          />
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
          />
        </div>
        <span className="typing-indicator__text">{formatTypingText()}</span>
      </motion.div>
    </AnimatePresence>
  );
}
