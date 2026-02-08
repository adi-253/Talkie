/**
 * useUserProfile Hook
 * 
 * Manages a global user profile stored in localStorage.
 * One browser = one user identity across all tabs and rooms.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'talkie_user_profile';

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load profile from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse user profile:', err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Save profile to localStorage
  const saveProfile = useCallback((username, avatar) => {
    const newProfile = { username, avatar, createdAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
    setProfile(newProfile);
    return newProfile;
  }, []);

  // Clear profile (for logout)
  const clearProfile = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  // Check if user has a profile
  const hasProfile = !!profile?.username;

  return {
    profile,
    hasProfile,
    isLoading,
    saveProfile,
    clearProfile,
    username: profile?.username || '',
    avatar: profile?.avatar || 'purple'
  };
}
