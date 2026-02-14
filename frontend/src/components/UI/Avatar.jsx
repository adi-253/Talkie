/**
 * Avatar Component
 * 
 * Displays a DiceBear animal-style avatar. Uses the "thumbs" style
 * for fun, unique creature avatars. Each avatar ID maps to a specific
 * seed that generates a consistent avatar.
 */

import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { thumbs } from '@dicebear/collection';
import { motion } from 'framer-motion';
import './Avatar.css';

// Predefined avatar options — each seed produces a unique creature
export const AVATAR_OPTIONS = [
  { id: 'fox', seed: 'Felix' },
  { id: 'bear', seed: 'Aneka' },
  { id: 'owl', seed: 'Midnight' },
  { id: 'cat', seed: 'Whiskers' },
  { id: 'dog', seed: 'Buddy' },
  { id: 'panda', seed: 'Bamboo' },
  { id: 'bunny', seed: 'Clover' },
  { id: 'wolf', seed: 'Shadow' },
  { id: 'koala', seed: 'Eucalyptus' },
  { id: 'penguin', seed: 'Waddle' },
  { id: 'lion', seed: 'Roary' },
  { id: 'frog', seed: 'Leap' },
];

function generateAvatarSvg(seed, size = 40) {
  const avatar = createAvatar(thumbs, {
    seed: seed,
    size: size,
    radius: 50,
  });
  return avatar.toDataUri();
}

export function Avatar({ username, color, size = 'md', showOnline = false }) {
  // `color` is actually the avatar ID (e.g. 'fox', 'bear')
  const avatarOption = AVATAR_OPTIONS.find(a => a.id === color);
  // Fall back to using the username as seed if no matching option
  const seed = avatarOption ? avatarOption.seed : (username || 'default');

  const sizeMap = { sm: 32, md: 40, lg: 56 };
  const px = sizeMap[size] || 40;

  const dataUri = useMemo(() => generateAvatarSvg(seed, px), [seed, px]);

  const sizeClasses = {
    sm: 'avatar--sm',
    md: 'avatar--md',
    lg: 'avatar--lg'
  };

  return (
    <motion.div
      className={`avatar ${sizeClasses[size]}`}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <img
        className="avatar__img"
        src={dataUri}
        alt={username || 'avatar'}
        width={px}
        height={px}
      />
      {showOnline && <span className="avatar__online-indicator" />}
    </motion.div>
  );
}

export function AvatarPicker({ selected, onSelect }) {
  return (
    <div className="avatar-picker">
      {AVATAR_OPTIONS.map((option) => {
        const dataUri = generateAvatarSvg(option.seed, 44);
        return (
          <motion.button
            key={option.id}
            className={`avatar-picker__option ${selected === option.id ? 'avatar-picker__option--selected' : ''}`}
            onClick={() => onSelect(option.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            title={option.id}
          >
            <img src={dataUri} alt={option.id} width={44} height={44} />
          </motion.button>
        );
      })}
    </div>
  );
}
