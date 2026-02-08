/**
 * AES-GCM Encryption Utilities for Talkie
 * 
 * All messages are encrypted client-side before being sent to the server.
 * The encryption key is derived from the URL hash and never touches the server.
 * 
 * Key features:
 * - AES-GCM with 256-bit keys for authenticated encryption
 * - Random IV for each message to prevent pattern analysis
 * - Base64 encoding for transmission
 */

/**
 * Generate a new AES-GCM encryption key
 * This key should be generated when creating a room and shared via URL hash
 * @returns {Promise<string>} Base64-encoded encryption key
 */
export async function generateKey() {
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
  
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import a Base64-encoded key string into a CryptoKey object
 * @param {string} keyString - Base64-encoded key
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(keyString) {
  const keyBuffer = base64ToArrayBuffer(keyString);
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message using AES-GCM
 * @param {string} plaintext - Message to encrypt
 * @param {string} keyString - Base64-encoded encryption key
 * @returns {Promise<string>} Base64-encoded ciphertext (iv + encrypted data)
 */
export async function encryptMessage(plaintext, keyString) {
  const key = await importKey(keyString);
  
  // Generate random 12-byte IV for each message
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );
  
  // Prepend IV to ciphertext for transmission
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt an encrypted message using AES-GCM
 * @param {string} ciphertext - Base64-encoded ciphertext (iv + encrypted data)
 * @param {string} keyString - Base64-encoded encryption key
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptMessage(ciphertext, keyString) {
  const key = await importKey(keyString);
  
  const combined = new Uint8Array(base64ToArrayBuffer(ciphertext));
  
  // Extract IV (first 12 bytes) and encrypted data
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Extract encryption key from URL hash
 * The key is stored after the # symbol and never sent to the server
 * @returns {string|null} Encryption key or null if not present
 */
export function getKeyFromHash() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) {
    return null;
  }
  return hash.substring(1); // Remove the # symbol
}

/**
 * Set the encryption key in the URL hash
 * @param {string} key - Base64-encoded encryption key
 */
export function setKeyInHash(key) {
  window.history.replaceState(null, '', `#${key}`);
}

// Helper: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
