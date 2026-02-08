/**
 * JoinRoom Component
 * 
 * Modal/form for entering username and selecting avatar before joining a room.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarPicker, AVATAR_COLORS } from '../UI/Avatar';
import './JoinRoom.css';

export function JoinRoom({ onJoin, isLoading }) {
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_COLORS[0].id);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim() || isLoading) return;
    onJoin(username.trim(), selectedAvatar);
  };

  return (
    <motion.div
      className="join-room"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="join-room__card">
        <div className="join-room__header">
          <h2>Join the Conversation</h2>
          <p>Choose a name and avatar to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="join-room__form">
          <div className="join-room__preview">
            <Avatar username={username || '?'} color={selectedAvatar} size="lg" />
          </div>

          <div className="join-room__field">
            <label htmlFor="username">Display Name</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              maxLength={20}
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="join-room__field">
            <label>Avatar Color</label>
            <AvatarPicker selected={selectedAvatar} onSelect={setSelectedAvatar} />
          </div>

          <motion.button
            type="submit"
            className="join-room__submit"
            disabled={!username.trim() || isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? 'Joining...' : 'Join Chat'}
          </motion.button>
        </form>

        <p className="join-room__privacy">
          🔒 Your messages are end-to-end encrypted
        </p>
      </div>
    </motion.div>
  );
}
