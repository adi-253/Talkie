# Talkie — System Architecture & Flow Explanation

A detailed walkthrough of how Talkie works under the hood.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Room Lifecycle](#2-room-lifecycle)
3. [Heartbeat System](#3-heartbeat-system)
4. [Row Level Security (RLS)](#4-row-level-security-rls)
5. [End-to-End Encryption](#5-end-to-end-encryption)
6. [Real-Time Messaging](#6-real-time-messaging)
7. [localStorage & Session Persistence](#7-localstorage--session-persistence)
8. [Cleanup Service](#8-cleanup-service)
9. [Key Files Reference](#9-key-files-reference)

---

## 1. High-Level Architecture

Talkie uses a split architecture where the **Go backend** handles data management and the **React frontend** handles real-time communication and encryption.

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  useRoom.js  │  │ useRealtime  │  │   useEncryption.js     │  │
│  │  (lifecycle) │  │ (messaging)  │  │   (AES-GCM encrypt)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘  │
│         │                 │                       │              │
│         │ HTTP            │ WebSocket             │              │
│         ▼                 ▼                       │              │
│  ┌─────────────┐  ┌──────────────┐               │              │
│  │ Go Backend  │  │  Supabase    │               │              │
│  │ (REST API)  │  │  Realtime    │               │              │
│  └──────┬───────┘  └──────────────┘               │              │
│         │                                         │              │
└─────────┼─────────────────────────────────────────┘──────────────┘
          │ service_role key (bypasses RLS)
          ▼
   ┌──────────────┐
   │   Supabase   │
   │  PostgreSQL  │
   │  (rooms,     │
   │ participants)│
   └──────────────┘
```

### Two keys, two roles:

| Key | Who uses it | RLS applies? | Purpose |
|-----|-------------|-------------|---------|
| **anon key** | Frontend (React) | ✅ Yes | Realtime subscriptions, reading public data |
| **service_role key** | Backend (Go) | ❌ Bypassed | Full database access for room CRUD, heartbeats, cleanup |

---

## 2. Room Lifecycle

### 2.1 Creating a Room

**Flow:** User clicks "Create Room" → Frontend calls Go backend → Backend creates room in Supabase

```
Frontend                    Go Backend                    Supabase
   │                            │                            │
   │  POST /api/rooms           │                            │
   │  { name: "My Room" }       │                            │
   │ ──────────────────────────►│                            │
   │                            │  Generate room ID (8 hex)  │
   │                            │  Generate AES-256 key      │
   │                            │                            │
   │                            │  INSERT INTO rooms          │
   │                            │ ──────────────────────────►│
   │                            │                            │
   │  { room_id: "a1b2c3d4" }  │                            │
   │ ◄──────────────────────────│                            │
```

**Relevant code** — [`backend/internal/services/room.go`](backend/internal/services/room.go):
```go
func (s *RoomService) CreateRoom(name string) (*models.Room, error) {
    // Generate a short, memorable room ID (8 characters)
    roomID, err := generateRoomID()

    // Generate encryption key (32 bytes = 256 bits for AES-256)
    encryptionKey, err := generateEncryptionKey()

    room := &models.Room{
        ID:            roomID,
        Name:          name,
        EncryptionKey: encryptionKey,
        CreatedAt:     now,
        LastActiveAt:  now,
    }
    s.db.CreateRoom(room)
}
```

### 2.2 Joining a Room

**Flow:** User enters username/avatar → Frontend calls Go backend → Backend adds participant → Frontend stores session in localStorage

```
Frontend                         Go Backend                  Supabase
   │                                 │                          │
   │  POST /api/rooms/{id}/join      │                          │
   │  { username, avatar }           │                          │
   │ ───────────────────────────────►│                          │
   │                                 │  Verify room exists      │
   │                                 │  Create participant UUID │
   │                                 │  INSERT INTO participants │
   │                                 │ ────────────────────────►│
   │                                 │                          │
   │  { participant_id,              │                          │
   │    room, participants }         │                          │
   │ ◄───────────────────────────────│                          │
   │                                 │                          │
   │  localStorage.setItem(                                     │
   │    "talkie_participant_{id}",                              │
   │    participant_id)                                         │
```

**Relevant code** — [`frontend/src/hooks/useRoom.js`](frontend/src/hooks/useRoom.js):
```js
const joinRoom = useCallback(async (username, avatar) => {
    const data = await api.joinRoom(roomId, username, avatar);
    setParticipantId(data.participant_id);

    // Persist for page refresh survival
    localStorage.setItem(`talkie_participant_${roomId}`, data.participant_id);
    localStorage.setItem(`talkie_user_${roomId}`, JSON.stringify({ username, avatar }));
}, [roomId]);
```

### 2.3 Leaving a Room

When a user leaves:
1. Frontend calls `POST /api/rooms/{id}/leave`
2. Backend removes the participant from the database
3. If the room is now empty (0 participants), the room is **immediately deleted**
4. Frontend clears localStorage

```go
// backend/internal/services/room.go
func (s *RoomService) LeaveRoom(roomID, participantID string) error {
    s.db.RemoveParticipant(participantID)

    count, _ := s.db.CountParticipants(roomID)
    if count == 0 {
        s.db.DeleteRoom(roomID) // Room auto-deleted when empty
    }
}
```

---

## 3. Heartbeat System

The heartbeat is how Talkie knows users are still active. Without it, stale rooms would persist forever.

### How it works:

```
Every 30 seconds:

Browser Tab                   Go Backend                    Supabase
    │                             │                            │
    │  POST /rooms/{id}/heartbeat │                            │
    │  { participant_id: "..." }  │                            │
    │ ───────────────────────────►│                            │
    │                             │  UPDATE rooms              │
    │                             │  SET last_active_at = NOW()│
    │                             │ ──────────────────────────►│
    │                             │                            │
    │                             │  UPDATE participants       │
    │                             │  SET last_active_at = NOW()│
    │                             │ ──────────────────────────►│
    │                             │                            │
    │         204 No Content      │                            │
    │ ◄───────────────────────────│                            │
```

### Frontend — sending heartbeats every 30s:

```js
// frontend/src/hooks/useRoom.js
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

useEffect(() => {
    if (!roomId || !participantId) return;

    // Send heartbeat every 30 seconds
    heartbeatRef.current = setInterval(() => {
        api.heartbeat(roomId, participantId).catch(console.error);
    }, HEARTBEAT_INTERVAL);

    // Send initial heartbeat immediately on join
    api.heartbeat(roomId, participantId).catch(console.error);

    return () => clearInterval(heartbeatRef.current);
}, [roomId, participantId]);
```

### Backend — updating timestamps:

```go
// backend/internal/services/room.go
func (s *RoomService) UpdateHeartbeat(roomID, participantID string) error {
    // Update room's last_active_at → NOW()
    s.db.UpdateRoomActivity(roomID)
    // Update participant's last_active_at → NOW()
    s.db.UpdateParticipantActivity(participantID)
}
```

### What happens when heartbeats stop:

| Time since last heartbeat | What happens |
|---------------------------|--------------|
| 0 – 30s | Normal, next heartbeat coming |
| 30s – 5min | Missed heartbeats, user might have closed tab |
| **> 5 minutes** | **Cleanup service removes the participant** |
| Room has 0 participants | **Room is deleted** |

---

## 4. Row Level Security (RLS)

### What is RLS?

RLS is a PostgreSQL feature that controls which rows a user can access in a table. It acts as an automatic filter between the user and the data.

### Why Talkie needs RLS:

Supabase exposes the database directly to the frontend via its API. The **anon key** is public (embedded in frontend JS). Without RLS, anyone with the anon key could:

```js
// Anyone could run this in their browser console:
supabase.from('rooms').delete().eq('id', 'any-room-id')  // Delete any room!
supabase.from('participants').select('*')                 // Read all participants!
```

### Talkie's RLS configuration:

Since Talkie is **anonymous** (no auth), all writes go through the Go backend (which uses the `service_role` key that bypasses RLS). The frontend only needs read access.

```sql
-- RLS is ENABLED on both tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Frontend (anon role) can ONLY read
CREATE POLICY "Allow public read access on rooms"
    ON public.rooms FOR SELECT USING (true);

CREATE POLICY "Allow public read access on participants"
    ON public.participants FOR SELECT USING (true);

-- Frontend CANNOT insert, update, or delete
CREATE POLICY "Deny anon insert on rooms"
    ON public.rooms FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "Deny anon update on rooms"
    ON public.rooms FOR UPDATE TO anon USING (false);
CREATE POLICY "Deny anon delete on rooms"
    ON public.rooms FOR DELETE TO anon USING (false);

-- (Same deny policies for participants table)
```

### How it works visually:

```
Frontend (anon key):
  SELECT * FROM rooms        ✅ Allowed (policy: USING true)
  DELETE FROM rooms           ❌ Denied  (policy: USING false)
  INSERT INTO rooms           ❌ Denied  (policy: WITH CHECK false)
  UPDATE rooms                ❌ Denied  (policy: USING false)

Go Backend (service_role key):
  SELECT * FROM rooms        ✅ Allowed (RLS bypassed)
  DELETE FROM rooms           ✅ Allowed (RLS bypassed)
  INSERT INTO rooms           ✅ Allowed (RLS bypassed)
  UPDATE rooms                ✅ Allowed (RLS bypassed)
```

---

## 5. End-to-End Encryption

Messages are encrypted **in the browser** before being sent. The server **never sees plaintext**.

### Flow:

```
1. Room created → Backend generates AES-256 key, stores in DB
2. User joins room → Backend returns encryption key to frontend
3. Frontend stores key in localStorage
4. User types message:
   "Hello!" → encrypt("Hello!", key) → "aGVsbG8gd29ybGQ=..."
5. Encrypted blob is broadcast via Supabase Realtime
6. Other clients receive blob → decrypt(blob, key) → "Hello!"
```

### Encryption code:

```js
// frontend/src/hooks/useEncryption.js
export function useEncryption() {
    const [encryptionKey, setEncryptionKey] = useState(null);

    // Load key: localStorage first, then fetch from server
    useEffect(() => {
        const storageKey = `talkie_encryption_${roomId}`;
        let key = localStorage.getItem(storageKey);

        if (!key) {
            const data = await api.getRoom(roomId);
            key = data.room?.encryption_key;
            localStorage.setItem(storageKey, key);
        }
        setEncryptionKey(key);
    }, [roomId]);

    // Encrypt before sending
    const encrypt = async (plaintext) => {
        return await encryptMessage(plaintext, encryptionKey);
    };

    // Decrypt on receive
    const decrypt = async (ciphertext) => {
        return await decryptMessage(ciphertext, encryptionKey);
    };
}
```

### Security model:

```
┌───────────┐     encrypted blob      ┌───────────┐
│  Sender   │ ───────────────────────► │  Supabase │  ← only sees encrypted data
│  Browser  │                          │  Realtime  │
└───────────┘                          └─────┬─────┘
                                             │
                                    encrypted blob
                                             │
                                       ┌─────▼─────┐
                                       │ Receiver  │  ← decrypts with same key
                                       │ Browser   │
                                       └───────────┘
```

> **Note:** The encryption key is stored in the database and returned via the API. This means it's not truly end-to-end encrypted against the server — the server *could* decrypt if it wanted to. True E2E would require the key to only exist in the URL hash fragment (never sent to the server).

---

## 6. Real-Time Messaging

Talkie uses **Supabase Realtime Broadcast** for instant messaging. This is pure pub/sub — messages are NOT stored in the database.

### How Supabase Broadcast works:

```
User A types "Hello"
       │
       ▼
┌──────────────┐   broadcast    ┌──────────────────┐
│ Channel      │ ──────────────►│ Supabase Realtime │
│ room:{id}    │                │ Server            │
└──────────────┘                └────────┬─────────┘
                                         │
                              ┌──────────┼──────────┐
                              │          │          │
                              ▼          ▼          ▼
                           User A    User B     User C
                          (self:true  (receives  (receives
                           echoes)    message)   message)
```

### Event types on the channel:

| Event | Purpose | Example payload |
|-------|---------|-----------------|
| `message` | Chat message | `{ id, participant_id, content (encrypted), timestamp }` |
| `typing` | Typing indicator | `{ participant_id, username, is_typing: true/false }` |
| `participant` | Join/leave notification | `{ action: "join"/"leave", participant }` |

### Relevant code:

```js
// frontend/src/hooks/useRealtime.js
const channel = supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: true } }  // sender also receives their own messages
});

// Listen for messages
channel.on('broadcast', { event: 'message' }, ({ payload }) => {
    onMessage(payload);
});

// Listen for typing indicators
channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    // Ignore own typing events
    if (payload.participant_id !== participantId) {
        onTyping(payload);
    }
});

// Send a message
const sendMessage = async (encryptedContent, metadata) => {
    await channel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
            id: crypto.randomUUID(),
            participant_id: participantId,
            content: encryptedContent,           // encrypted!
            timestamp: new Date().toISOString()
        }
    });
};
```

### Typing indicator with auto-clear:

When a user types, a "typing" event is broadcast. After 3 seconds of no typing, a "stop typing" event is sent:

```js
const sendTyping = async (username) => {
    // Send typing start
    await channel.send({
        type: 'broadcast', event: 'typing',
        payload: { participant_id, username, is_typing: true }
    });

    // Auto-clear after 3 seconds
    typingTimeoutRef.current = setTimeout(async () => {
        await channel.send({
            type: 'broadcast', event: 'typing',
            payload: { participant_id, username, is_typing: false }
        });
    }, 3000);
};
```

---

## 7. localStorage & Session Persistence

localStorage allows users to survive **page refreshes** without having to rejoin the room.

### What's stored:

| Key | Value | Purpose |
|-----|-------|---------|
| `talkie_participant_{roomId}` | Participant UUID | Reconnect without rejoining |
| `talkie_user_{roomId}` | `{ username, avatar }` | Restore display identity |
| `talkie_encryption_{roomId}` | AES-256 key string | Decrypt messages after refresh |
| `talkie_theme` | `"dark"` / `"light"` | Theme preference |
| `talkie_active_room` | `{ roomId, participantId }` | Home page "rejoin" prompt |

### Session restore flow on page refresh:

```
Page loads → useRoom.js runs
    │
    ├── Read localStorage: talkie_participant_{roomId}
    │       │
    │       ├── Found? → Fetch room from API
    │       │       │
    │       │       ├── Participant still exists in room?
    │       │       │       ├── YES → Restore session (skip join dialog)
    │       │       │       └── NO  → Clear localStorage, show join dialog
    │       │       │
    │       │       └── Room not found? → Show error
    │       │
    │       └── Not found? → Show join dialog (new user)
    │
    └── Read localStorage: talkie_encryption_{roomId}
            │
            ├── Found? → Use cached key for encryption
            └── Not found? → Fetch key from API, cache it
```

### Relevant code:

```js
// frontend/src/hooks/useRoom.js  —  On mount
const storedParticipantId = localStorage.getItem(`talkie_participant_${roomId}`);
if (storedParticipantId) {
    // Verify the participant still exists (not removed by cleanup)
    const stillExists = (data.participants || []).some(p => p.id === storedParticipantId);
    if (stillExists) {
        setParticipantId(storedParticipantId);  // ← Session restored!
    } else {
        localStorage.removeItem(`talkie_participant_${roomId}`);  // ← Stale, clean up
        localStorage.removeItem(`talkie_user_${roomId}`);
    }
}
```

---

## 8. Cleanup Service

A background goroutine in the Go backend that periodically removes inactive participants and empty rooms.

### Configuration (from `main.go`):

```go
cleanupService := services.NewCleanupService(
    db,
    1*time.Minute,  // Check every 1 minute
    5*time.Minute,  // Inactive threshold: 5 minutes
)
go cleanupService.Start()
```

### Cleanup algorithm:

```
Every 1 minute:
    │
    ├── Step 1: Find inactive PARTICIPANTS
    │   │   WHERE last_active_at < (now - 5 minutes)
    │   │
    │   ├── Remove each inactive participant
    │   │
    │   └── For each affected room:
    │       └── Count remaining participants
    │           └── If 0 → Delete room immediately
    │
    └── Step 2: Find inactive ROOMS
        │   WHERE last_active_at < (now - 5 minutes)
        │
        └── Delete each inactive room
```

### Relevant code:

```go
// backend/internal/services/cleanup.go
func (s *CleanupService) cleanup() {
    threshold := time.Now().UTC().Add(-s.timeout)  // 5 minutes ago

    // Step 1: Remove inactive participants
    s.cleanupParticipants(threshold)

    // Step 2: Remove inactive rooms
    s.cleanupRooms(threshold)
}

func (s *CleanupService) cleanupParticipants(threshold time.Time) {
    participants, _ := s.db.GetInactiveParticipants(threshold)

    for _, p := range participants {
        s.db.RemoveParticipant(p.ID)
        roomsToCheck[p.RoomID] = true
    }

    // Delete empty rooms
    for roomID := range roomsToCheck {
        count, _ := s.db.CountParticipants(roomID)
        if count == 0 {
            s.db.DeleteRoom(roomID)
        }
    }
}
```

---

## 9. Key Files Reference

### Backend (Go)

| File | Responsibility |
|------|---------------|
| [`cmd/server/main.go`](backend/cmd/server/main.go) | Server startup, router setup, CORS, cleanup service init |
| [`internal/handlers/room.go`](backend/internal/handlers/room.go) | HTTP handlers for room CRUD, join, leave, heartbeat |
| [`internal/services/room.go`](backend/internal/services/room.go) | Business logic: create room, join, leave, heartbeat |
| [`internal/services/cleanup.go`](backend/internal/services/cleanup.go) | Background cleanup of inactive participants & rooms |
| [`internal/supabase/client.go`](backend/internal/supabase/client.go) | Supabase DB client (uses `service_role` key) |
| [`internal/models/room.go`](backend/internal/models/room.go) | Data models for Room, Participant, request/response types |

### Frontend (React)

| File | Responsibility |
|------|---------------|
| [`src/utils/supabase.js`](frontend/src/utils/supabase.js) | Supabase client init + API helper for Go backend calls |
| [`src/hooks/useRoom.js`](frontend/src/hooks/useRoom.js) | Room lifecycle: fetch, join, leave, heartbeat |
| [`src/hooks/useRealtime.js`](frontend/src/hooks/useRealtime.js) | Supabase Broadcast: messages, typing, participant events |
| [`src/hooks/useEncryption.js`](frontend/src/hooks/useEncryption.js) | AES-GCM encrypt/decrypt with room key |
| [`src/hooks/useTheme.js`](frontend/src/hooks/useTheme.js) | Dark/light theme toggle with localStorage |
| [`src/pages/ChatRoom.jsx`](frontend/src/pages/ChatRoom.jsx) | Main chat UI: messages, input, participants |
| [`src/pages/Home.jsx`](frontend/src/pages/Home.jsx) | Home page: create/join rooms |

### Database (Supabase PostgreSQL)

| Table | Columns | Purpose |
|-------|---------|---------|
| `rooms` | `id`, `name`, `encryption_key`, `created_at`, `last_active_at` | Active chat rooms |
| `participants` | `id`, `room_id`, `username`, `avatar`, `joined_at`, `last_active_at` | Users in rooms |

### API Routes

| Method | Route | Handler | Description |
|--------|-------|---------|-------------|
| `GET` | `/api/rooms` | `ListRooms` | List all active rooms |
| `POST` | `/api/rooms` | `CreateRoom` | Create a new room |
| `GET` | `/api/rooms/{id}` | `GetRoom` | Get room info + participants |
| `POST` | `/api/rooms/{id}/join` | `JoinRoom` | Join with username/avatar |
| `POST` | `/api/rooms/{id}/leave` | `LeaveRoom` | Leave the room |
| `POST` | `/api/rooms/{id}/heartbeat` | `Heartbeat` | Keep room alive |
