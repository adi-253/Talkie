/**
 * Avatar Component
 * 
 * Displays a user avatar with customizable colors and animated presence.
 */

import { motion } from 'framer-motion';
import './Avatar.css';

// Predefined avatar colors for selection
export const AVATAR_COLORS = [
  { id: 'purple', bg: '#8b5cf6', text: '#fff' },
  { id: 'blue', bg: '#3b82f6', text: '#fff' },
  { id: 'green', bg: '#10b981', text: '#fff' },
  { id: 'orange', bg: '#f97316', text: '#fff' },
  { id: 'pink', bg: '#ec4899', text: '#fff' },
  { id: 'teal', bg: '#14b8a6', text: '#fff' },
  { id: 'red', bg: '#ef4444', text: '#fff' },
  { id: 'yellow', bg: '#eab308', text: '#000' },
];

export function Avatar({ username, color, size = 'md', showOnline = false }) {
  const avatarColor = AVATAR_COLORS.find(c => c.id === color) || AVATAR_COLORS[0];
  const initial = username ? username.charAt(0).toUpperCase() : '?';

  const sizeClasses = {
    sm: 'avatar--sm',
    md: 'avatar--md',
    lg: 'avatar--lg'
  };

  return (
    <motion.div
      className={`avatar ${sizeClasses[size]}`}
      style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      {initial}
      {showOnline && <span className="avatar__online-indicator" />}
    </motion.div>
  );
}

export function AvatarPicker({ selected, onSelect }) {
  return (
    <div className="avatar-picker">
      {AVATAR_COLORS.map((color) => (
        <motion.button
          key={color.id}
          className={`avatar-picker__option ${selected === color.id ? 'avatar-picker__option--selected' : ''}`}
          style={{ backgroundColor: color.bg }}
          onClick={() => onSelect(color.id)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        />
      ))}
    </div>
  );
}
