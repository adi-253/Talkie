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
7. [Server-Side Broadcasts](#7-server-side-broadcasts)
8. [Message Storage](#8-message-storage)
9. [localStorage & Session Persistence](#9-localstorage--session-persistence)
10. [Cleanup Service](#10-cleanup-service)
11. [Key Files Reference](#11-key-files-reference)
12. [Rate Limiting (TODO)](#12-rate-limiting-todo)

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
│  │ (REST API)  │──│  Realtime    │               │              │
│  └──────┬───────┘  └──────────────┘               │              │
│         │          ▲                              │              │
│         │          │ HTTP POST (broadcast)        │              │
│         │          │ for participant + room events│              │
└─────────┼──────────┼─────────────────────────────┘──────────────┘
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
| **service_role key** | Backend (Go) | ❌ Bypassed | Full database access, Realtime broadcast API |

### Data flow summary:

| What | How | Path |
|------|-----|------|
| Room CRUD, join, leave, heartbeat | HTTP REST | Frontend → Go Backend → Supabase DB |
| Chat messages, typing indicators | WebSocket (Supabase Broadcast) | Frontend ↔ Supabase Realtime ↔ Frontend |
| Participant join/leave notifications | HTTP POST (Supabase Broadcast REST API) | Go Backend → Supabase Realtime → Frontend |
| Room created/deleted notifications | HTTP POST (Supabase Broadcast REST API) | Go Backend → Supabase Realtime → Frontend (lobby) |

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
   │                            │                            │
   │                            │  POST /realtime/v1/api/broadcast
   │                            │  { event: "room", action: "created" }
   │                            │  (on rooms:lobby channel)
   │                            │ ──────────────────────────►│ Supabase Realtime
```

**Relevant code** — [`backend/internal/services/room.go`](backend/internal/services/room.go):
```go
func (s *RoomService) CreateRoom(name string) (*models.Room, error) {
    roomID, err := generateRoomID()           // 8 hex chars
    encryptionKey, err := generateEncryptionKey() // 256-bit AES key
    room := &models.Room{
        ID: roomID, Name: name, EncryptionKey: encryptionKey,
    }
    s.db.CreateRoom(room)
    s.db.BroadcastRoomEvent("created", room) // notify lobby
}
```

### 2.2 Joining a Room

**Flow:** User enters username/avatar → Frontend calls Go backend → Backend adds participant to DB → Backend broadcasts "join" event → Frontend stores session in localStorage

```
Frontend                    Go Backend                 Supabase DB     Supabase Realtime
   │                            │                          │                  │
   │  POST /api/rooms/{id}/join │                          │                  │
   │  { username, avatar }      │                          │                  │
   │ ──────────────────────────►│                          │                  │
   │                            │  INSERT INTO participants│                  │
   │                            │ ────────────────────────►│                  │
   │                            │                          │                  │
   │                            │  POST /realtime/v1/api/broadcast            │
   │                            │  { event: "participant", action: "join" }   │
   │                            │ ───────────────────────────────────────────►│
   │                            │                          │                  │
   │  { participant_id,         │                          │     WebSocket    │
   │    room, participants }    │                          │     push to all  │
   │ ◄──────────────────────────│                          │     clients      │
   │                            │                          │                  │
   │  localStorage.setItem(                                │                  │
   │    "talkie_participant_                               │                  │
   │     {id}", participant_id)                            │                  │
```

**Key point:** The backend broadcasts the join event via the Supabase Realtime REST API, so other clients see the new participant instantly without polling.

### 2.3 Leaving a Room

When a user clicks the **Leave** button:
1. Frontend calls `POST /api/rooms/{id}/leave`
2. Backend fetches participant data (for broadcast)
3. Backend removes the participant from the database
4. Backend broadcasts "leave" event via Supabase Realtime
5. If the room is now empty (0 participants), the room is **immediately deleted**
6. Backend broadcasts "deleted" event on the `rooms:lobby` channel
7. Frontend clears localStorage

```
Frontend                    Go Backend                 Supabase DB     Supabase Realtime
   │                            │                          │                  │
   │  POST /api/rooms/{id}/leave│                          │                  │
   │  { participant_id }        │                          │                  │
   │ ──────────────────────────►│                          │                  │
   │                            │  SELECT participant      │                  │
   │                            │  (get username/avatar)   │                  │
   │                            │ ────────────────────────►│                  │
   │                            │                          │                  │
   │                            │  DELETE participant      │                  │
   │                            │ ────────────────────────►│                  │
   │                            │                          │                  │
   │                            │  POST /realtime/v1/api/broadcast            │
   │                            │  { event: "participant", action: "leave" }  │
   │                            │ ───────────────────────────────────────────►│
   │                            │                          │                  │
   │                            │  (if room empty: DELETE room + broadcast    │
   │                            │   "deleted" on rooms:lobby channel)         │
   │                            │ ───────────────────────────────────────────►│
   │                            │                          │                  │
   │         204 No Content     │                          │     WebSocket    │
   │ ◄──────────────────────────│                          │     push to all  │
```

When a user **closes the tab** (without clicking Leave):
- Nothing happens immediately — no broadcast, no DB change
- The heartbeat stops, and after **~5 minutes**, the cleanup service removes the participant and broadcasts the leave event
- This ensures **consistency** — the sidebar and DB always agree

```go
// backend/internal/services/room.go
func (s *RoomService) LeaveRoom(roomID, participantID string) error {
    participant, _ := s.db.GetParticipant(participantID)  // fetch before delete
    s.db.RemoveParticipant(participantID)
    s.db.BroadcastParticipantEvent(roomID, "leave", participant) // notify others
    count, _ := s.db.CountParticipants(roomID)
    if count == 0 {
        room, _ := s.db.GetRoom(roomID)
        s.db.DeleteRoom(roomID)                   // Auto-delete empty rooms
        s.db.BroadcastRoomEvent("deleted", room)   // Notify lobby
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
    heartbeatRef.current = setInterval(() => {
        api.heartbeat(roomId, participantId).catch(console.error);
    }, HEARTBEAT_INTERVAL);

    api.heartbeat(roomId, participantId).catch(console.error); // initial

    return () => clearInterval(heartbeatRef.current);
}, [roomId, participantId]);
```

### What happens when heartbeats stop:

| Time since last heartbeat | What happens |
|---------------------------|--------------|
| 0 – 30s | Normal, next heartbeat coming |
| 30s – 5min | Missed heartbeats, user might have closed tab |
| **> 5 minutes** | **Cleanup service removes the participant + broadcasts leave** |
| Room has 0 participants | **Room is deleted** |

### Why not remove on tab close?

We intentionally **don't** use `beforeunload` to remove participants because it also fires on **page refresh**. That would kick users out of the room every time they refresh. Instead, we rely on the heartbeat-based cleanup (5 min timeout). This means:

- **Refresh** → Heartbeat keeps going, participant stays
- **Close tab** → Heartbeat stops, cleanup removes after ~5 min

---

## 4. Row Level Security (RLS)

### What is RLS?

RLS is a PostgreSQL feature that controls which rows a user can access in a table. It acts as an automatic filter between the user and the data.

### Why Talkie needs RLS:

Supabase exposes the database directly to the frontend via its API. The **anon key** is public (embedded in frontend JS). Without RLS, anyone could:

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
-- (Same deny policies for update, delete, and participants table)
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

Talkie uses **Supabase Realtime Broadcast** for instant messaging. This is pure pub/sub — messages flow through Supabase Realtime but are NOT stored in its database.

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

| Event | Sent by | Purpose | Example payload |
|-------|---------|---------|-----------------|
| `message` | Frontend (WebSocket) | Chat message | `{ id, participant_id, content (encrypted), timestamp }` |
| `typing` | Frontend (WebSocket) | Typing indicator | `{ participant_id, username, is_typing: true/false }` |
| `participant` | **Backend (HTTP POST)** | Join/leave notification | `{ action: "join"/"leave", participant }` |

### Frontend code — subscribing and sending:

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
    if (payload.participant_id !== participantId) {
        onTyping(payload);
    }
});

// Listen for participant join/leave (sent by backend)
channel.on('broadcast', { event: 'participant' }, ({ payload }) => {
    onParticipantUpdate(payload); // { action: 'join'/'leave', participant }
});

// Send a message (frontend → Supabase Realtime → all clients)
const sendMessage = async (encryptedContent, metadata) => {
    await channel.send({
        type: 'broadcast',
        event: 'message',
        payload: { id: crypto.randomUUID(), content: encryptedContent, ... }
    });
};
```

### Typing indicator with auto-clear:

When a user types, a "typing" event is broadcast. After 3 seconds of no typing, a "stop typing" event is sent:

```js
const sendTyping = async (username) => {
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

## 7. Server-Side Broadcasts

Participant join/leave events are broadcast **from the Go backend**, not the frontend. This ensures the broadcast only fires **after the database is updated**, keeping everything consistent.

### Why backend broadcasts?

If the frontend sent optimistic broadcasts ("I'm leaving!") before the DB was updated, you'd get inconsistencies:
- Tab B sees "User left" immediately (broadcast arrived)
- Tab B refreshes → user reappears (DB hasn't removed them yet)

By having the backend broadcast **after** the DB operation, the sidebar and database always agree.

### How it works:

The Go backend sends an HTTP POST to the **Supabase Realtime REST API** — no WebSocket connection needed:

```
┌──────────┐   POST /realtime/v1/api/broadcast   ┌───────────────────┐
│ Go       │ ──────────────────────────────────►  │ Supabase Realtime │
│ Backend  │                                      │ (managed service) │
└──────────┘                                      └────────┬──────────┘
                                                           │ WebSocket push
                                                  ┌────────▼──────────┐
                                                  │ Frontend clients  │
                                                  │ (already connected│
                                                  │  via useRealtime) │
                                                  └───────────────────┘
```

### The broadcast method:

```go
// backend/internal/supabase/client.go
func (c *Client) BroadcastParticipantEvent(roomID, action string, participant *models.Participant) error {
    payload := map[string]interface{}{
        "messages": []map[string]interface{}{{
            "topic": fmt.Sprintf("room:%s", roomID),
            "event": "participant",
            "payload": map[string]interface{}{
                "action":      action,    // "join" or "leave"
                "participant": map[string]interface{}{
                    "id": participant.ID, "room_id": participant.RoomID,
                    "username": participant.Username, "avatar": participant.Avatar,
                },
            },
        }},
    }
    // POST to https://<project>.supabase.co/realtime/v1/api/broadcast
    // Headers: apikey: <service_role_key>, Content-Type: application/json
}
```

### Where broadcasts are triggered:

**Participant events** (on `room:{id}` channel, event `participant`):

| Trigger | Location | Action | When |
|---------|----------|--------|------|
| User clicks Join | `room.go` → `JoinRoom()` | `"join"` | After INSERT into participants |
| User clicks Leave | `room.go` → `LeaveRoom()` | `"leave"` | After DELETE from participants |
| Inactive user cleaned up | `cleanup.go` → `cleanupParticipants()` | `"leave"` | After cleanup removes participant |

**Room events** (on `rooms:lobby` channel, event `room`):

| Trigger | Location | Action | When |
|---------|----------|--------|------|
| Room created | `room.go` → `CreateRoom()` | `"created"` | After INSERT into rooms |
| Room deleted (last user leaves) | `room.go` → `LeaveRoom()` | `"deleted"` | After DELETE from rooms |
| Room deleted (cleanup: empty) | `cleanup.go` → `cleanupParticipants()` | `"deleted"` | After cleanup deletes empty room |
| Room deleted (cleanup: stale) | `cleanup.go` → `cleanupRooms()` | `"deleted"` | After cleanup deletes inactive room |

### Frontend handling:

```js
// frontend/src/hooks/useRealtime.js — receives broadcasts from backend
channel.on('broadcast', { event: 'participant' }, ({ payload }) => {
    onParticipantUpdate(payload);
});

// frontend/src/hooks/useRoom.js — updates sidebar
const updateParticipants = useCallback((action, participant) => {
    if (action === 'join') {
        setParticipants(prev => [...prev, participant]); // Add to sidebar
    } else if (action === 'leave') {
        setParticipants(prev => prev.filter(p => p.id !== participant.id)); // Remove
    }
}, []);
```

---

## 8. Message Storage

Messages are stored **in the Go backend's memory** — not in Supabase, not in the frontend.

```go
// backend/internal/services/message.go
type MessageService struct {
    messages map[string][]Message  // roomID → []Message (in RAM)
    mu       sync.RWMutex
}
```

### What this means:

| Storage | Where | Survives server restart? | Survives browser refresh? |
|---------|-------|--------------------------|---------------------------|
| Messages | Go backend RAM (`map`) | ❌ No | N/A (fetched from server) |
| Chat display | React state (`useState`) | N/A | ❌ No (re-fetched from backend) |
| Participant ID | `localStorage` | ✅ Yes | ✅ Yes |
| Encryption key | `localStorage` | ✅ Yes | ✅ Yes |

Messages are fully **ephemeral** — once the Go server restarts or the room is deleted, they're gone forever. There is no database table for messages.

### Why in-memory?

Messages are broadcast via Supabase Realtime (instant delivery). The in-memory store exists only so that:
- New users joining a room can load **message history** (messages sent before they joined)
- Users refreshing the page can re-fetch recent messages via `GET /api/rooms/{id}/messages`

If the server restarts, message history is lost, but the room and participants survive (they're in Supabase DB). Also if accidentally the server goes down, when it launches again the room stays until inactivity (heartbeat check). This helps in case of emergency shutdown.

---

## 9. localStorage & Session Persistence

localStorage allows users to survive **page refreshes** without having to rejoin the room.

### What's stored:

| Key | Value | Purpose |
|-----|-------|---------|
| `talkie_participant_{roomId}` | Participant UUID | Reconnect without rejoining |
| `talkie_user_{roomId}` | `{ username, avatar }` | Restore display identity |
| `talkie_encryption_{roomId}` | AES-256 key string | Decrypt messages after refresh |
| `talkie_theme` | `"dark"` / `"light"` | Theme preference |
| `talkie_active_room` | Room ID string | Auto-redirect to active room on Home page |

> **Design note:** `talkie_active_room` stores just the room ID — no client-side timestamp expiry. The backend is the single source of truth for whether a room/participant is still valid. On page load, the frontend always verifies with `api.getRoom()` before redirecting.

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

---

## 10. Cleanup Service

A background goroutine in the Go backend that removes inactive participants and empty rooms, **then broadcasts events** so other clients update instantly.

### Configuration:

```go
// backend/cmd/server/main.go
cleanupService := services.NewCleanupService(
    db,
    1*time.Minute,  // Check every 1 minute
    5*time.Minute,  // Inactive threshold: 5 minutes
)
go cleanupService.Start()
```

### Startup cleanup:

The cleanup service runs **immediately on startup** before entering the periodic loop. This purges any stale data that accumulated while the server was down (e.g., participants/rooms left over from a crash). Since room deletions are broadcast, connected frontends see stale rooms disappear right away.

```go
func (s *CleanupService) Start() {
    s.cleanup() // Run immediately on startup
    ticker := time.NewTicker(s.interval)
    // ... periodic loop
}
```

### Cleanup algorithm:

```
On startup + every 1 minute:
    │
    ├── Step 1: Find inactive PARTICIPANTS
    │   │   WHERE last_active_at < (now - 5 minutes)
    │   │
    │   ├── For each inactive participant:
    │   │   ├── Remove from database
    │   │   └── Broadcast "leave" event via Supabase Realtime
    │   │
    │   └── For each affected room:
    │       └── Count remaining participants
    │           └── If 0 → Delete room + broadcast "deleted" on rooms:lobby
    │
    └── Step 2: Find inactive ROOMS
        │   WHERE last_active_at < (now - 5 minutes)
        │
        └── Delete each inactive room + broadcast "deleted" on rooms:lobby
```

### Code:

```go
// backend/internal/services/cleanup.go
func (s *CleanupService) cleanupParticipants(threshold time.Time) {
    participants, _ := s.db.GetInactiveParticipants(threshold)

    for _, p := range participants {
        if err := s.db.RemoveParticipant(p.ID); err == nil {
            // Broadcast so other clients update their sidebar instantly
            s.db.BroadcastParticipantEvent(p.RoomID, "leave", &p)
            roomsToCheck[p.RoomID] = true
        }
    }

    for roomID := range roomsToCheck {
        count, _ := s.db.CountParticipants(roomID)
        if count == 0 {
            s.db.DeleteRoom(roomID)
        }
    }
}
```

### Tab close timeline:

```
Tab closed (user didn't click Leave)
    │
    │  t=0               Heartbeat stops. No broadcast. Sidebar unchanged.
    │  t=30s              First missed heartbeat.
    │  t=1min             Missed 2 heartbeats.
    │  ...
    │  t=5min             last_active_at is now > 5 minutes ago.
    │  t=5min + cleanup   Cleanup service runs:
    │                       1. Removes participant from DB
    │                       2. Broadcasts "leave" to Supabase Realtime
    │                       3. All other clients see participant disappear
    ▼
```

---

## 11. Key Files Reference

### Backend (Go)

| File | Responsibility |
|------|---------------|
| [`cmd/server/main.go`](backend/cmd/server/main.go) | Server startup, router setup, CORS, cleanup service init |
| [`internal/handlers/room.go`](backend/internal/handlers/room.go) | HTTP handlers for room CRUD, join, leave, heartbeat |
| [`internal/services/room.go`](backend/internal/services/room.go) | Business logic: create room, join (+ broadcast), leave (+ broadcast), heartbeat |
| [`internal/services/cleanup.go`](backend/internal/services/cleanup.go) | Background cleanup of inactive participants (+ broadcast) & rooms |
| [`internal/services/message.go`](backend/internal/services/message.go) | In-memory message storage for history/polling |
| [`internal/supabase/client.go`](backend/internal/supabase/client.go) | Supabase DB client + Realtime broadcast API |
| [`internal/models/room.go`](backend/internal/models/room.go) | Data models: Room, Participant, request/response types |
| [`internal/models/message.go`](backend/internal/models/message.go) | Data models: Message, SendMessageRequest |

### Frontend (React)

| File | Responsibility |
|------|---------------|
| [`src/utils/supabase.js`](frontend/src/utils/supabase.js) | Supabase client init + API helper for Go backend calls |
| [`src/hooks/useRoom.js`](frontend/src/hooks/useRoom.js) | Room lifecycle: fetch, join, leave, heartbeat, participant state |
| [`src/hooks/useRealtime.js`](frontend/src/hooks/useRealtime.js) | Supabase Broadcast: messages, typing, participant events |
| [`src/hooks/useEncryption.js`](frontend/src/hooks/useEncryption.js) | AES-GCM encrypt/decrypt with room key |
| [`src/hooks/useTheme.js`](frontend/src/hooks/useTheme.js) | Dark/light theme toggle with localStorage |
| [`src/pages/ChatRoom.jsx`](frontend/src/pages/ChatRoom.jsx) | Main chat UI: messages, input, participants sidebar |
| [`src/pages/Home.jsx`](frontend/src/pages/Home.jsx) | Home page: create/join rooms |
| [`src/components/Chat/TypingIndicator.jsx`](frontend/src/components/Chat/TypingIndicator.jsx) | Shows "X is typing..." with animated dots |
| [`src/components/Chat/MessageInput.jsx`](frontend/src/components/Chat/MessageInput.jsx) | Chat input with emoji support and reply context |
| [`src/components/Chat/MessageList.jsx`](frontend/src/components/Chat/MessageList.jsx) | Scrollable message list with typing indicator |

### Database (Supabase PostgreSQL)

| Table | Columns | Purpose |
|-------|---------|---------|
| `rooms` | `id`, `name`, `encryption_key`, `created_at`, `last_active_at` | Active chat rooms |
| `participants` | `id`, `room_id`, `username`, `avatar`, `joined_at`, `last_active_at` | Users in rooms |

> **Note:** Messages are NOT stored in the database. They live in Go backend memory only.

### API Routes

| Method | Route | Handler | Description |
|--------|-------|---------|-------------|
| `GET` | `/api/rooms` | `ListRooms` | List all active rooms |
| `POST` | `/api/rooms` | `CreateRoom` | Create a new room |
| `GET` | `/api/rooms/{id}` | `GetRoom` | Get room info + participants |
| `POST` | `/api/rooms/{id}/join` | `JoinRoom` | Join with username/avatar (broadcasts "join") |
| `POST` | `/api/rooms/{id}/leave` | `LeaveRoom` | Leave the room (broadcasts "leave") |
| `POST` | `/api/rooms/{id}/heartbeat` | `Heartbeat` | Keep room alive |
| `POST` | `/api/rooms/{id}/messages` | `SendMessage` | Send a message (stored in memory) |
| `GET` | `/api/rooms/{id}/messages` | `GetMessages` | Fetch message history |

---

## 12. Rate Limiting (TODO)

Rate limiting is not yet implemented but is planned to prevent DoS and spam attacks.

### Planned approach:

| Tier | Limit | Scope |
|------|-------|-------|
| **Global** | ~100 requests/min per IP | All endpoints |
| **Strict** | ~20 requests/min per IP | `POST /api/rooms`, `POST /api/rooms/{id}/messages` |

- IP-based token bucket algorithm
- Returns `429 Too Many Requests` with `Retry-After` header when exceeded
- Implementation location: `backend/cmd/server/main.go` (as chi middleware)