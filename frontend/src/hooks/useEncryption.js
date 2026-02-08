/**
 * useEncryption Hook
 * 
 * Provides encryption/decryption using room-specific keys from the server.
 * The key is fetched when joining a room and stored in localStorage.
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { encryptMessage, decryptMessage } from '../utils/crypto';
import { api } from '../utils/supabase';

export function useEncryption() {
  const { roomId } = useParams();
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize encryption key from localStorage or fetch from server
  useEffect(() => {
    const initKey = async () => {
      if (!roomId) {
        setIsReady(true);
        return;
      }

      const storageKey = `talkie_encryption_${roomId}`;
      let key = localStorage.getItem(storageKey);
      
      if (!key) {
        // Fetch room to get encryption key
        try {
          const data = await api.getRoom(roomId);
          if (data.room?.encryption_key) {
            key = data.room.encryption_key;
            localStorage.setItem(storageKey, key);
          }
        } catch (err) {
          console.error('Failed to fetch room key:', err);
        }
      }
      
      if (key) {
        setEncryptionKey(key);
      }
      setIsReady(true);
    };

    initKey();
  }, [roomId]);

  // Encrypt a message with the room's key
  const encrypt = useCallback(async (plaintext) => {
    if (!encryptionKey) {
      // No key available, return plaintext
      return plaintext;
    }
    try {
      return await encryptMessage(plaintext, encryptionKey);
    } catch (err) {
      console.error('Encryption failed:', err);
      return plaintext;
    }
  }, [encryptionKey]);

  // Decrypt a message with the room's key
  const decrypt = useCallback(async (ciphertext) => {
    if (!encryptionKey) {
      return ciphertext;
    }
    try {
      return await decryptMessage(ciphertext, encryptionKey);
    } catch (err) {
      // Decryption failed - might be plaintext
      console.warn('Decryption failed, treating as plaintext');
      return ciphertext;
    }
  }, [encryptionKey]);

  // Store key from server response (called after joining)
  const setKeyFromRoom = useCallback((key) => {
    if (key && roomId) {
      localStorage.setItem(`talkie_encryption_${roomId}`, key);
      setEncryptionKey(key);
    }
  }, [roomId]);

  return {
    encryptionKey,
    isReady,
    hasKey: true,
    encrypt,
    decrypt,
    setKeyFromRoom
  };
}
