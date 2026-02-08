# Talkie — Secure, Ephemeral Chat Application  


---

## Overview

**Talkie** is a modern, secure, and ephemeral chat application for instant, anonymous communication.

Design principles:
- No sign-ups
- No tracking
- No stored message history
- End-to-end encryption
- Temporary chat rooms accessed via shareable links

This document is a complete, single-file specification intended for LLMs or developers to implement the system without ambiguity.

---

## Core Concept

Users create temporary chat rooms and invite others by sharing a link.  
All messages are encrypted on the client before being sent.  
The server never sees plaintext messages and only relays encrypted data.

Rooms exist only while users are active and are deleted automatically when inactive.

---

## Security & Privacy Model

### Client-Side Encryption
- All messages are encrypted **in the browser**.
- Use **AES-GCM** for encryption and decryption.
- The encryption key:
  - Is generated client-side
  - Is embedded in the **URL hash**
  - Is **never sent to the server**
- The backend only handles encrypted payloads.

### Anonymous Usage
- No authentication system.
- No user accounts.
- On joining a room, the user selects:
  - A temporary username
  - An avatar

### No Message History
- The backend does not persist decrypted messages.
- Messages exist only in memory during active sessions.
- The database may temporarily store encrypted payloads only for relay purposes.

---

## Room Lifecycle Management

### Room Creation
- Rooms are created when the first user joins.
- Each room has:
  - A unique room ID
  - A `last_active_at` timestamp

### Heartbeat System
- Each active client sends periodic heartbeats.
- Backend updates `last_active_at` on heartbeat.
- If a user disconnects and reconnects within:
the room remains active and visible.

### Auto Deletion
- When the last participant leaves:
- The room is immediately deleted from the database.
- Rooms without heartbeats beyond the allowed inactivity window are cleaned up automatically.

---

## Real-Time Messaging

- Use **Supabase Realtime** for:
- Broadcasting messages
- Typing indicators
- Messages are:
- Encrypted client-side
- Sent as encrypted blobs
- Relayed without inspection by the backend

### Messaging Features
- Real-time message delivery
- Typing indicators
- Emoji support
- Meme search integration
- Message replies
- `@username` mentions

---

## UI / UX Requirements

### Messaging Interface
- Group consecutive messages from the same sender.
- Support replies with clear visual context.
- Mentions should visually highlight referenced users.

### Animations
- Use **Framer Motion**.
- Apply smooth entry animations for:
- Messages
- UI components
- Animations should enhance clarity, not distract.

### Themes
- Fully support dark mode and light mode.
- Theme switching must work instantly during the session.

### Responsive Design
- Optimized for desktop and mobile.
- Mobile layout must include:
- Collapsible participant drawer
- UI should remain minimal and readable on small screens.

---

## Tech Stack

### Backend
- Language: **Golang**
- Database: **Supabase (PostgreSQL + Realtime)**
- Responsibilities:
- Room creation and deletion
- Heartbeat tracking
- Encrypted message relay
- Cleanup of inactive rooms

### Frontend
- Framework: **React**
- Animation Library: **Framer Motion**
- Responsibilities:
- Encryption and decryption
- Realtime subscriptions
- UI rendering
- Theme handling
- Emoji and meme support

---

## Repository Structure

Use a monorepo with strict separation of concerns.


- The Go module lives inside `/backend`.
- Frontend and backend must remain fully decoupled.
- Each feature must live in its own file.

---

## Environment Configuration

- Create a `.env` file.
- Store all secrets and configuration values in `.env`.
- Required variables include:
  - Supabase project URL
  - Supabase anon key
  - Supabase service role key (backend only)
- Never hardcode secrets in source code.

---

## Coding Guidelines

### General Rules
- Keep implementations simple.
- Avoid unnecessary abstractions.
- Prioritize clarity and maintainability.

### Golang
- Follow idiomatic Go practices.
- Use clear package boundaries.
- Separate:
  - HTTP handlers
  - Business logic
  - Data models
- Each file must have a single responsibility.
- Add comments explaining intent and logic.

### React
- Use functional components only.
- Keep components small and focused.
- Extract reusable logic into hooks.
- Avoid deeply nested component trees.
- Comment non-trivial logic clearly.

---

## Documentation Expectations

- Comment code generously.
- Explain:
  - Why a feature exists
  - How it interacts with other parts of the system
- Assume the reader is another developer or an LLM implementing the system from scratch.

---

## Explicit Non-Goals

- No user accounts
- No persistent chat history
- No analytics or tracking
- No complex permissions or roles

---

## Final Objective

Deliver a secure, anonymous, ephemeral chat application that is:
- Simple to understand
- Safe by default
- Easy to deploy
- Easy to extend without redesigning core systems


