# Lean Sync Server

## Problem

A single user with ~2k notes consumes ~800MB of server memory during sync. The root cause: `automerge-repo`'s `Repo` loads **all** documents into memory when a peer connects to participate in the sync protocol.

## Solution

Replace `automerge-repo`'s `Repo` on the server with a custom implementation that loads documents **one at a time** during sync, then frees them from memory.

### Memory Profile

| Scenario               | Before (Repo) | After (Lean)  |
| ---------------------- | ------------- | ------------- |
| Idle (no active users) | ~0            | ~0            |
| During sync (2k notes) | ~800MB        | ~1MB peak     |
| Per-document peak      | N/A           | Size of 1 doc |

### How It Works

1. Client connects via WebSocket (same auth flow as before)
2. CBOR join/peer handshake (fully compatible with automerge-repo client)
3. Client sends sync and request messages for each document
4. For each message, server:
   - Loads the specific document from disk
   - Uses `Automerge.receiveSyncMessage()` / `generateSyncMessage()` (low-level API)
   - Saves updated document back to disk (compacted)
   - Fans out changes to other connected clients for the same user
   - Frees document from memory
5. After initial client burst, server initiates sync for any docs the client is missing

### Bare Request Handling

automerge-repo sends `request` messages (without sync data) in two cases:

- **New device**: A second device calling `repo.find()` for a doc it doesn't have yet. The server responds with a sync message containing the document data.
- **New document**: A device announcing a doc it just created. The server responds with a sync message from an empty doc, which tells the client "I have nothing, send me everything" — enabling the client to push its data to the server via the normal sync exchange.

Without this, bare requests would be silently dropped, causing `repo.find()` to time out and mark documents as "unavailable".

### Real-Time Fan-Out

When one client syncs changes to the server, the server immediately pushes those changes to all other connected clients for the same user. This enables real-time collaboration without polling:

1. Client A sends sync message with changes
2. Server processes and saves the updated document
3. For each other connection belonging to the same user:
   - Loads the updated document binary
   - Generates a sync message using that peer's sync state
   - Sends it to the peer
4. Client B receives the update and applies it locally

Fan-out is scoped per-user — changes are never leaked to other users' connections.

### Wire Protocol Compatibility

The lean server speaks the exact same CBOR wire protocol as automerge-repo:

- `join` / `peer` handshake messages
- `sync` messages with document IDs and Automerge sync data
- `request` messages — with or without sync data
- `doc-unavailable` for access-denied documents

**The client (automerge-repo) requires zero changes.**

## Storage

Documents are stored as single compacted binary files:

```
data/automerge-docs/{user_dir}/docs/{docId}.bin
```

Documents are automatically compacted when saved after sync.

### Sync States

Stored in SQLite (`sync_states` table) instead of on disk, for easier querying and cleanup.

## Diagnostics

Two diagnostic endpoints are available (authenticated):

- `GET /api/diagnostics/server` - Server-wide memory and connection info
- `GET /api/diagnostics/user` - Per-user document counts and disk sizes

## Tests

`sync-server/tests/sync/lean-sync-server.test.ts` covers:

- **Connection auth**: rejects invalid paths, missing/bad session tokens
- **Handshake**: join/peer exchange
- **Sync messages**: access control (doc-unavailable), sync responses, full round-trip with disk verification
- **Bare requests**: inaccessible docs, docs not on disk (empty-doc sync), docs on disk, full second-device retrieval
- **Client push via request**: device announces new doc, server pulls it; device 1 pushes, device 2 retrieves
- **Real-time fan-out**: changes pushed to other connections, subsequent edits propagated, cross-user isolation

## Files

- `sync-server/src/sync/lean-sync-server.ts` - Main implementation
- `sync-server/src/sync/doc-storage.ts` - Document binary storage layer
- `sync-server/src/sync/diagnostics.ts` - Diagnostic endpoints
- `sync-server/tests/sync/lean-sync-server.test.ts` - Integration tests
