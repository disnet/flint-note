# Service Proxying Deep Dive: E2EE and Automerge Analysis

[← Back to Service Proxying Alternative](./13-SERVICE-PROXYING-ALTERNATIVE.md)

---

## Executive Summary

This document examines two critical technical questions about the service proxying architecture:

1. **Does E2EE work with service proxying?** ✅ Yes, but with important caveats
2. **Does Automerge conflict resolution work?** ⚠️ Partially - needs careful design

**Key Finding:** Service proxying is **compatible** with E2EE + Automerge, but the server becomes a "dumb encrypted blob store" with limited ability to provide useful metadata or indexing. This significantly impacts the value proposition of service proxying.

---

## Part 1: E2EE Compatibility Analysis

### The Fundamental Tension

**Service Proxying Promise:**

- Open Lexicon schemas that any client can implement
- Server can provide metadata, search, indexing
- Rich XRPC endpoints with queryable data

**E2EE Reality:**

- Server only sees encrypted blobs
- No server-side indexing or search
- Metadata must be either unencrypted (privacy risk) or encrypted (server can't use it)

### What E2EE Looks Like with Service Proxying

#### Encrypted Data Flow

```
┌─────────────────────────────────────────┐
│           Flint Client                  │
│                                         │
│  1. User types: "Meeting notes"        │
│  2. Create Automerge doc locally       │
│  3. Encrypt with user's symmetric key  │
│  4. Prepare XRPC request                │
└──────────────┬──────────────────────────┘
               │
               │ XRPC: com.flint.note.sync
               │ {
               │   noteId: "abc123",
               │   ops: "base64(encrypted_blob)",
               │   timestamp: "2024-01-15T10:00:00Z"
               │ }
               ↓
┌─────────────────────────────────────────┐
│         User's PDS (bsky.social)        │
│                                         │
│  - Forwards request with service auth   │
│  - Sees encrypted blob, can't read it  │
└──────────────┬──────────────────────────┘
               │
               │ Service Auth JWT
               │ + Same encrypted payload
               ↓
┌─────────────────────────────────────────┐
│       Flint Notes Service               │
│                                         │
│  - Verifies user's identity (DID)       │
│  - Stores encrypted blob in R2          │
│  - CANNOT read note content             │
│  - CANNOT index or search               │
└──────────────┬──────────────────────────┘
               │
               │ Stores as-is
               ↓
┌─────────────────────────────────────────┐
│         Cloudflare R2                   │
│                                         │
│  Key: did:plc:abc123/notes/note456.blob │
│  Value: [encrypted Automerge document]  │
└─────────────────────────────────────────┘
```

#### What the Server Can and Cannot Do

**Server CAN:**

- ✅ Verify user identity (via service auth JWT)
- ✅ Store encrypted blobs
- ✅ Return encrypted blobs to authenticated user
- ✅ Track blob sizes and timestamps
- ✅ Provide basic pagination (by timestamp only)

**Server CANNOT:**

- ❌ Read note content
- ❌ Search note text
- ❌ Index by tags
- ❌ Show preview text
- ❌ Filter by title
- ❌ Provide rich metadata
- ❌ Enable cross-note links server-side
- ❌ Detect conflicts beyond Automerge's built-in CRDT

### Lexicon Schema Reality Check

#### Original Lexicon (from Service Proxying doc)

```json
{
  "lexicon": 1,
  "id": "com.flint.note.list",
  "output": {
    "schema": {
      "properties": {
        "notes": {
          "items": {
            "uri": "string",
            "title": "string", // ❌ Server can't provide if E2EE
            "preview": "string", // ❌ Server can't provide if E2EE
            "tags": ["string"], // ❌ Server can't provide if E2EE
            "createdAt": "datetime", // ✅ Can provide
            "updatedAt": "datetime" // ✅ Can provide
          }
        }
      }
    }
  }
}
```

**Problem:** This schema assumes server can read note metadata. With E2EE, it can't.

#### E2EE-Compatible Lexicon (Realistic)

```json
{
  "lexicon": 1,
  "id": "com.flint.note.list",
  "description": "List encrypted note blobs (metadata in client only)",
  "output": {
    "schema": {
      "type": "object",
      "properties": {
        "notes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "uri": {
                "type": "string",
                "format": "at-uri",
                "description": "AT URI for this note blob"
              },
              "cid": {
                "type": "string",
                "format": "cid",
                "description": "Content identifier"
              },
              "blob": {
                "type": "string",
                "description": "Base64 encrypted Automerge document"
              },
              "sizeBytes": {
                "type": "integer",
                "description": "Size of encrypted blob"
              },
              "createdAt": {
                "type": "string",
                "format": "datetime",
                "description": "Server first saw this blob"
              },
              "updatedAt": {
                "type": "string",
                "format": "datetime",
                "description": "Server last updated this blob"
              }
            }
          }
        },
        "cursor": {
          "type": "string",
          "description": "Pagination cursor (timestamp-based only)"
        }
      }
    }
  }
}
```

**This is essentially a "dumb blob store" API.** The server provides no semantic value beyond storage and retrieval.

### Alternative: Unencrypted Metadata

**Option:** Store metadata unencrypted, content encrypted

```json
{
  "noteId": "abc123",
  "metadata": {
    // ⚠️ UNENCRYPTED - server and PDS can read
    "title": "Meeting Notes",
    "tags": ["work", "project-x"],
    "preview": "Discussed Q4 roadmap...",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "content": {
    // ✅ ENCRYPTED
    "encryptedBlob": "base64(encrypted_automerge_doc)",
    "encryptionMethod": "AES-256-GCM",
    "nonce": "..."
  }
}
```

**Pros:**

- ✅ Server can index, search, filter
- ✅ Rich Lexicon schemas with semantic value
- ✅ Better UX (server-side search, preview generation)

**Cons:**

- ❌ Metadata visible to server operators
- ❌ Metadata visible to PDS operators (bsky.social sees your note titles)
- ❌ Regulatory/privacy concerns (GDPR, subpoenas)
- ❌ Trust implications ("encrypted" but metadata leaks)

**User Mental Model:**

```
User thinks: "My notes are encrypted and private"
Reality: "Your note content is encrypted, but Bluesky/Flint can see all titles and tags"
```

This is a **significant trust issue** for a notes app marketed on privacy.

---

## Part 2: Automerge Conflict Resolution

### How Automerge CRDTs Work

Automerge uses **operation-based CRDTs**:

1. Each edit produces a set of operations (ops)
2. Operations have logical timestamps (Lamport clocks)
3. Operations are commutative - can be applied in any order
4. Conflicts are resolved deterministically using LWW (Last-Write-Wins) with tiebreakers

**Key Property:** Given the same set of operations, all peers arrive at the same state.

### Conflict Scenarios with Service Proxying

#### Scenario 1: Simple Offline Edits (✅ Works)

```
Device A (offline):
  - Edits note: "Hello" → "Hello World"
  - Generates ops: [op1, op2, op3]
  - Syncs when online → sends ops to server

Device B (offline):
  - Edits same note: "Hello" → "Hello Alice"
  - Generates ops: [op4, op5, op6]
  - Syncs when online → sends ops to server

Server:
  - Stores all ops: [op1, op2, op3, op4, op5, op6]
  - Doesn't understand content (E2EE)
  - Just appends operations

Device A syncs again:
  - Downloads [op4, op5, op6]
  - Automerge merges: "Hello World" + "Hello Alice" → "Hello Alice World" (deterministic)

Device B syncs again:
  - Downloads [op1, op2, op3]
  - Automerge merges: same result "Hello Alice World"
```

**Result:** ✅ Automerge CRDT properties ensure convergence

#### Scenario 2: Rapid Concurrent Edits (✅ Works, with caveats)

```
Device A:
  10:00:00 - Edits paragraph 1
  10:00:01 - Syncs ops to server

Device B:
  10:00:00 - Edits paragraph 2 (hasn't synced yet)
  10:00:02 - Syncs ops to server
  10:00:03 - Downloads Device A's ops
  10:00:03 - Automerge merges both edits

Result: Both edits preserved, no data loss
```

**Result:** ✅ Works, but user might see surprising merges

**Example:**

```
Device A types: "Project deadline: Friday"
Device B types: "Project deadline: Monday"

After merge (LWW): "Project deadline: Monday"
                   (if Device B's edit has later timestamp)
```

User on Device A might be confused why their edit "disappeared".

#### Scenario 3: Encrypted Blob Conflicts (⚠️ Needs Design)

**Problem:** With E2EE, the server stores entire encrypted Automerge documents, not individual operations.

**Current Service Proxying Design (from doc):**

```typescript
// Server endpoint
async function handleNoteSync(userDID: string, changes: Change[]) {
  for (const change of changes) {
    const key = `${userDID}/documents/${change.noteId}.automerge`;

    // ⚠️ This overwrites the entire document!
    await R2_BUCKET.put(key, change.ops, {
      customMetadata: { timestamp: change.timestamp }
    });
  }
}
```

**Problem:** If two devices sync concurrently, one device's changes will overwrite the other's!

**Solution 1: Store Operations, Not Full Documents**

```typescript
// Server stores individual encrypted operation batches
async function handleNoteSync(userDID: string, changes: Change[]) {
  for (const change of changes) {
    // Store each operation batch with unique ID
    const opKey = `${userDID}/ops/${change.noteId}/${change.opId}.ops`;

    await R2_BUCKET.put(opKey, change.encryptedOps);
  }

  // Return all operation batches for this note
  const allOps = await fetchAllOps(userDID, change.noteId);
  return { serverOps: allOps };
}
```

**Client merges operations:**

```typescript
class FlintSyncClient {
  async syncNote(noteId: string) {
    // 1. Get local Automerge doc
    const localDoc = this.automerge.getDoc(noteId);

    // 2. Get new operations since last sync
    const localOps = this.automerge.getChangesSince(noteId, lastSyncState);

    // 3. Encrypt operations
    const encryptedOps = this.crypto.encrypt(localOps);

    // 4. Send to server
    const response = await this.agent.api.com.flint.note.sync({
      noteId,
      encryptedOps: base64(encryptedOps),
      opId: generateUniqueId()
    });

    // 5. Receive all server operations
    const serverOps = response.data.serverOps.map((op) =>
      this.crypto.decrypt(op.encryptedOps)
    );

    // 6. Automerge applies all operations (including our own)
    for (const ops of serverOps) {
      this.automerge.applyChanges(noteId, ops);
    }

    // 7. Result: converged document state
  }
}
```

**Result:** ✅ Automerge conflict resolution works correctly

**Storage Growth:**

```
Initial note: 1KB
After 1000 edits: 1KB + (1000 × 0.5KB ops) = 501KB

Need compaction strategy:
- Periodically create snapshot
- Discard old operations
- Store: [snapshot] + [recent ops]
```

**Solution 2: Operational Transform with Server Coordination (❌ Complex)**

Server tries to merge operations server-side:

- ❌ Can't work with E2EE (server can't read ops)
- ❌ Requires server to understand Automerge format
- ❌ Breaks E2EE promise

**Recommendation:** Use Solution 1 (operation-based storage)

---

## Part 3: Practical Architecture with E2EE + Automerge

### Revised Service Proxying Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Flint Client                     │
│  - Markdown files (source of truth)                 │
│  - Local Automerge documents (plaintext)            │
│  - SQLite cache/index (plaintext, local only)       │
│  - Encryption key (derived from user secret)        │
└──────────────────┬────────────────────────────────┘
                   │
                   │ 1. XRPC: com.flint.note.sync
                   │    {
                   │      noteId: "abc123",
                   │      encryptedOps: [...],
                   │      opId: "unique-id"
                   │    }
                   ↓
         ┌─────────────────────┐
         │   User's PDS        │
         │   (bsky.social)     │
         └──────────┬──────────┘
                    │
                    │ 2. Service auth JWT
                    ↓
         ┌─────────────────────┐
         │ Flint Notes Service │
         │                     │
         │ Stores:             │
         │  - Encrypted ops    │
         │  - Op IDs           │
         │  - Timestamps       │
         │                     │
         │ CANNOT:             │
         │  - Read content     │
         │  - Index by tags    │
         │  - Search text      │
         └──────────┬──────────┘
                    │
                    │ 3. Store operation batch
                    ↓
         ┌─────────────────────────────────────┐
         │  Cloudflare R2                      │
         │                                     │
         │  did:plc:abc/ops/note1/op001.blob  │
         │  did:plc:abc/ops/note1/op002.blob  │
         │  did:plc:abc/ops/note1/op003.blob  │
         │  ...                                │
         │                                     │
         │  Periodic snapshots:                │
         │  did:plc:abc/snapshots/note1.blob  │
         └─────────────────────────────────────┘
```

### E2EE-Compatible Lexicon Schemas

#### 1. Note Sync (Operation-Based)

```json
{
  "lexicon": 1,
  "id": "com.flint.note.sync",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Sync encrypted Automerge operations",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["operations"],
          "properties": {
            "operations": {
              "type": "array",
              "description": "Encrypted operation batches to sync",
              "items": { "type": "ref", "ref": "#operationBatch" }
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["allOperations"],
          "properties": {
            "allOperations": {
              "type": "array",
              "description": "All encrypted operations from server",
              "items": { "type": "ref", "ref": "#operationBatch" }
            }
          }
        }
      }
    },
    "operationBatch": {
      "type": "object",
      "required": ["noteId", "opId", "encryptedOps", "timestamp"],
      "properties": {
        "noteId": {
          "type": "string",
          "description": "Note identifier (may be encrypted)"
        },
        "opId": {
          "type": "string",
          "description": "Unique operation batch ID"
        },
        "encryptedOps": {
          "type": "string",
          "description": "Base64-encoded encrypted Automerge operations"
        },
        "timestamp": {
          "type": "string",
          "format": "datetime"
        },
        "sizeBytes": {
          "type": "integer"
        }
      }
    }
  }
}
```

#### 2. List Notes (Minimal Metadata)

```json
{
  "lexicon": 1,
  "id": "com.flint.note.list",
  "defs": {
    "main": {
      "type": "query",
      "description": "List encrypted note identifiers (no content metadata)",
      "parameters": {
        "type": "params",
        "properties": {
          "limit": { "type": "integer", "default": 50 },
          "cursor": { "type": "string" }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["notes"],
          "properties": {
            "notes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "noteId": { "type": "string" },
                  "uri": { "type": "string", "format": "at-uri" },
                  "cid": { "type": "string", "format": "cid" },
                  "operationCount": { "type": "integer" },
                  "totalSizeBytes": { "type": "integer" },
                  "createdAt": { "type": "string", "format": "datetime" },
                  "updatedAt": { "type": "string", "format": "datetime" }
                }
              }
            },
            "cursor": { "type": "string" }
          }
        }
      }
    }
  }
}
```

**Note:** No `title`, `preview`, or `tags` - all semantic metadata is client-side only.

---

## Part 4: Critical Assessment

### What Service Proxying Loses with E2EE

**Original Promise:**

- ✅ Client-agnostic data format anyone can implement
- ✅ Rich Lexicon schemas with semantic metadata
- ✅ Server-side search and indexing
- ✅ Ecosystem integration possibilities

**E2EE Reality:**

- ✅ Client-agnostic (still true - anyone can implement encryption)
- ⚠️ Lexicon schemas are "dumb blob store" (little semantic value)
- ❌ No server-side search (client must download + decrypt all notes)
- ⚠️ Limited ecosystem integration (third-party apps need encryption key)

### The "Client Agnostic" Question with E2EE

**Scenario:** Third-party developer wants to build "Flint Web Client"

**What they need:**

1. ✅ Implement Lexicon schemas (easy - just blob storage API)
2. ✅ Implement Automerge document handling (moderate - use Automerge library)
3. ❌ **Get user's encryption key** (HARD - how?)

**Encryption Key Distribution Problem:**

```
Option A: User types encryption password in third-party client
  - ⚠️ Requires extreme trust in third-party
  - ⚠️ Phishing risk (malicious client steals key)
  - ⚠️ No way to verify third-party client integrity

Option B: Derive key from AT Protocol identity (e.g., signing key)
  - ✅ No password needed
  - ⚠️ Key stored in PDS or local keychain
  - ⚠️ Third-party client needs access to signing key (risky)

Option C: Key stored in user's PDS, encrypted with PDS password
  - ⚠️ PDS operator (Bluesky) can access key
  - ⚠️ Defeats E2EE purpose

Option D: Key sharing protocol (like Signal's safety numbers)
  - ✅ Secure
  - ❌ Complex UX
  - ❌ Users must explicitly authorize each client
```

**Conclusion:** E2EE + client agnosticism is **theoretically possible** but **practically difficult** for average users.

### Automerge Performance Concerns

**Operation accumulation:**

```
Day 1: 1 note, 50 edits → 50 ops stored
Day 30: 1 note, 1500 edits → 1500 ops stored
Day 365: 1 note, 18,000 edits → 18,000 ops stored

Sync operation:
  - Download 18,000 encrypted operation batches
  - Decrypt each batch
  - Apply to Automerge document
  - Time: ~3-5 seconds for 18K ops
```

**Mitigation: Periodic snapshots**

```typescript
// Every 100 operations, create a snapshot
if (operationCount % 100 === 0) {
  const snapshot = automerge.save(doc);
  const encrypted = crypto.encrypt(snapshot);

  await uploadSnapshot(noteId, encrypted);

  // Can now discard old operations
  await deleteOpsBeforeSnapshot(noteId, snapshotId);
}
```

**Revised sync:**

```typescript
async syncNote(noteId: string) {
  // 1. Download latest snapshot (if exists)
  const snapshot = await downloadLatestSnapshot(noteId);
  let doc = snapshot
    ? automerge.load(crypto.decrypt(snapshot))
    : automerge.init();

  // 2. Download operations since snapshot
  const ops = await downloadOpsSinceSnapshot(noteId, snapshotId);

  // 3. Apply operations
  for (const op of ops) {
    doc = automerge.applyChanges(doc, crypto.decrypt(op));
  }

  return doc;
}
```

**Result:** Manageable performance (download snapshot + ~100 ops instead of 18,000 ops)

---

## Part 5: Comparison Matrix

### Current Architecture vs. Service Proxying (with E2EE reality)

| Feature                       | Current (Direct R2)        | Service Proxying (E2EE)                             |
| ----------------------------- | -------------------------- | --------------------------------------------------- |
| **E2EE**                      | ✅ Full E2EE               | ✅ Full E2EE                                        |
| **Automerge**                 | ✅ Works (operation-based) | ✅ Works (operation-based, needs snapshot strategy) |
| **Server-side search**        | ❌ N/A (direct storage)    | ❌ No (encrypted blobs)                             |
| **Server-side indexing**      | ❌ N/A                     | ❌ No (encrypted blobs)                             |
| **Rich Lexicon metadata**     | ❌ N/A                     | ❌ No (blob store only)                             |
| **Client agnosticism**        | ❌ Flint-specific format   | ⚠️ Theoretically yes, but needs encryption key      |
| **Third-party clients**       | ❌ Not practical           | ⚠️ Possible but requires key sharing UX             |
| **PDS migration path**        | ⚠️ Requires rewrite        | ✅ Backend-only change                              |
| **Offline support**           | ✅ Good (cached R2 creds)  | ⚠️ Requires PDS for each sync                       |
| **Latency**                   | ✅ Low (direct R2)         | ⚠️ Higher (PDS proxy hop)                           |
| **Implementation complexity** | ✅ Lower                   | ⚠️ Higher (XRPC + Lexicons)                         |
| **Development time**          | ✅ 3.5-5 months            | ⚠️ 5-7 months                                       |

### Value Proposition Assessment

**If E2EE is non-negotiable:**

**Service Proxying Advantages Remaining:**

1. ✅ **PDS Migration Path** - When AT Protocol adds native private data, backend switches seamlessly
2. ⚠️ **Open Specs** - Lexicons are public, but limited to "blob store" semantics
3. ⚠️ **Ecosystem Alignment** - Uses AT Protocol patterns, but minimal ecosystem value without metadata
4. ⚠️ **Third-party Clients** - Theoretically possible, but key distribution is major UX hurdle

**Service Proxying Disadvantages:**

1. ❌ **No Rich Metadata** - Server can't provide titles, tags, previews, search
2. ❌ **Higher Latency** - PDS proxy hop for every operation
3. ❌ **More Complexity** - XRPC implementation, Lexicon maintenance, service auth
4. ❌ **Reduced Offline** - Needs PDS connection for sync (can't cache server creds)

**Current Architecture Advantages:**

1. ✅ **Simpler** - Direct R2 access, straightforward credential issuance
2. ✅ **Faster** - No PDS proxy hop
3. ✅ **Better Offline** - Cached R2 credentials work without PDS
4. ✅ **Faster to Ship** - 30-40% less development time

---

## Part 6: Critical Insight - Current Architecture Already Supports Multiple Clients

### The R2 Architecture IS Client-Agnostic

**Key Realization:** The current R2 architecture with AT Protocol identity **already provides client agnosticism** - just at a different layer.

**How it works:**

```
Any client implementation can:
  1. ✅ Use AT Protocol OAuth (same flow)
  2. ✅ Get DPoP token from user's PDS
  3. ✅ Request R2 credentials from Flint Sync Service
  4. ✅ Access R2 storage at /{user_did}/*
  5. ✅ Read/write encrypted Automerge documents
```

**What a third-party client needs:**

1. **AT Protocol OAuth library** - Standard, well-documented
2. **Automerge library** - Standard, well-documented
3. **User's encryption key** - Same problem as service proxying (must trust client)
4. **Knowledge of R2 storage format** - Document this openly

### Comparison: R2 vs Service Proxying for Third-Party Clients

| Requirement                | Current R2 Architecture                      | Service Proxying                      |
| -------------------------- | -------------------------------------------- | ------------------------------------- |
| **AT Protocol identity**   | ✅ Required                                  | ✅ Required                           |
| **Get user authorization** | ✅ OAuth + DPoP token                        | ✅ OAuth + DPoP token                 |
| **Access user's data**     | ✅ Request R2 credentials from Flint Service | ✅ Make XRPC calls through PDS        |
| **Implement data format**  | ⚠️ Must understand R2 storage layout         | ⚠️ Must understand Lexicon schemas    |
| **Get encryption key**     | ❌ User must trust third-party client        | ❌ User must trust third-party client |
| **Use standard libraries** | ✅ Automerge + S3-compatible client          | ✅ Automerge + XRPC client            |

**Result:** Both architectures require essentially the same trust and implementation effort for third-party clients.

### What Makes Something "Open" and "Client-Agnostic"?

**Service Proxying Claim:**

- "Open Lexicon schemas anyone can implement"
- "Third-party clients can use XRPC endpoints"

**Current R2 Architecture Can Provide Same Thing:**

- **Open storage format specification** - Document R2 layout and Automerge schema
- **Open sync protocol** - Document R2 credential API
- **Third-party clients can use R2** - Same credential issuance flow

**Example: Published R2 Storage Spec**

```markdown
# Flint Notes Storage Format v1.0

## Overview

Flint uses AT Protocol for identity and R2 for encrypted storage.
Any client can implement this spec to access user's notes.

## Authentication

1. User authorizes via AT Protocol OAuth
2. Client requests R2 credentials: POST https://sync.flint.app/credentials
3. Server returns scoped credentials for /{user_did}/\*

## Storage Layout

/{did}/vault-identity.json - Encrypted vault metadata
/{did}/documents/{noteId}.am - Encrypted Automerge document
/{did}/snapshots/{noteId}.snap - Periodic snapshots

## Encryption

- User's encryption key required (derived from password or device keychain)
- AES-256-GCM encryption
- See encryption spec: https://docs.flint.app/encryption

## Automerge Format

- Standard Automerge document format
- See data model: https://docs.flint.app/data-model
```

**Result:** Third-party developers can implement Flint clients using:

- Standard AT Protocol libraries
- Standard Automerge libraries
- S3-compatible R2 client
- Published storage format spec

### The Only Real Difference: API Style

**Service Proxying:**

```typescript
// XRPC-style (AT Protocol native)
const notes = await agent.api.com.flint.note.list({ limit: 50 });
await agent.api.com.flint.note.sync({ operations: [...] });
```

**Current R2 Architecture:**

```typescript
// S3-style (industry standard)
const creds = await flintSync.getCredentials(did, dpopToken);
const s3 = new S3Client(creds);
const notes = await s3.listObjects({ Prefix: `${did}/documents/` });
await s3.putObject({ Key: `${did}/documents/note1.am`, Body: encrypted });
```

**Both are well-documented, standard APIs.** The difference is stylistic, not fundamental.

### Service Proxying's Remaining Unique Value

After this realization, service proxying's **only remaining unique benefit** is:

**Smoother migration to native PDS storage** when AT Protocol adds private data support.

**But:**

- This is **speculative** (timeline unknown)
- Current architecture can migrate too (just requires updating clients)
- Trade-off: 30-40% longer development time for speculative future benefit

### Conclusion: R2 Architecture Is Already Client-Agnostic

The current R2 architecture with AT Protocol identity provides:

- ✅ Decentralized identity (AT Protocol)
- ✅ Open storage format (can document publicly)
- ✅ Third-party client support (same as service proxying)
- ✅ Standard protocols (OAuth, S3, Automerge)
- ✅ Simpler implementation
- ✅ Better offline support
- ✅ Lower latency

**Service proxying adds:**

- ⚠️ AT Protocol-native API style (aesthetic, not functional difference)
- ⚠️ Potential easier migration to PDS storage (speculative)

**Service proxying loses:**

- ❌ 30-40% longer development time
- ❌ Higher operational complexity
- ❌ Worse offline support
- ❌ Higher latency

---

## Part 7: Recommendations

### Recommendation 1: Ship Current Architecture for V1

**Rationale:**

- Service proxying's main value (rich Lexicon metadata, server-side search) is **lost with E2EE**
- **Current R2 architecture is already client-agnostic** via AT Protocol identity + open storage spec
- Remaining unique benefit (PDS migration path) is **speculative** - AT Protocol private data timeline unknown
- Current architecture is simpler, faster, and ships sooner
- E2EE and Automerge work identically in both approaches

**Action:**

- ✅ Ship V1 with direct R2 access
- ✅ Implement operation-based Automerge storage (not full document overwrites)
- ✅ Add snapshot compaction strategy (every 100 ops)

### Recommendation 2: Publish Open Storage Format Specification

**Rationale:**

- Demonstrates commitment to openness and client agnosticism
- Enables third-party client development
- Low cost, high trust signal
- Provides same ecosystem benefits as Lexicons

**Action:**

- ✅ Document R2 storage layout and credential API
- ✅ Publish Automerge schema and encryption spec
- ✅ Provide example client implementations
- ✅ Market as "Open storage format - your data, any client"

### Recommendation 3: Reconsider Service Proxying If...

**Trigger conditions for revisiting:**

1. **AT Protocol ships private data storage** with clear API
   - Service proxying migration path becomes concrete value

2. **Strong ecosystem pressure for XRPC-native APIs** emerges
   - Current R2 approach already enables third-party clients
   - Only switch if XRPC becomes significantly more important

3. **Competitive pressure** from AT Protocol-native apps
   - Need to position as "native AT Protocol notes"

4. **Unencrypted metadata** becomes acceptable
   - Users explicitly opt for "search/metadata over full E2EE"
   - Would enable rich Lexicons with semantic value

### Recommendation 4: Hybrid Metadata Approach (Future)

**If E2EE is negotiable for some users:**

```typescript
// User preference
enum PrivacyMode {
  FULL_E2EE = 'full', // Content + metadata encrypted
  METADATA_SHARED = 'hybrid' // Only content encrypted
}
```

**Full E2EE mode:**

- Everything encrypted, local search only
- "Maximum privacy" badge

**Hybrid mode:**

- Content encrypted, metadata (titles, tags) unencrypted
- Server-side search, rich Lexicons
- "Convenience mode" badge

**Marketing:**

- "You choose: Maximum privacy or maximum convenience"
- Transparent about trade-offs

---

## Conclusion

### Key Findings

1. **E2EE works with service proxying** ✅
   - But server becomes "dumb blob store"
   - No semantic value in Lexicon schemas

2. **Automerge works with service proxying** ✅
   - Must use operation-based storage (not document overwrites)
   - Needs snapshot compaction strategy

3. **Service proxying's value proposition is severely diminished with E2EE** ⚠️
   - Main benefits (rich metadata, server search, ecosystem integration) are lost
   - Remaining benefit (PDS migration path) is speculative

4. **Current architecture is pragmatic choice for V1** ✅
   - Simpler, faster to ship, better offline support
   - E2EE works identically
   - Can always migrate to service proxying later if needed

### Final Recommendation

**Ship V1 with current architecture (direct R2)**

- ✅ Implement operation-based Automerge storage
- ✅ Add snapshot compaction (every 100 ops)
- ✅ **Publish open storage format specification** - Provides client agnosticism without service proxying overhead
- ✅ Market as "Open storage, powered by AT Protocol identity"

**Key insight:** Current R2 architecture + published spec provides same client agnosticism benefits as service proxying, with:

- ✅ 30-40% faster time to market
- ✅ Lower operational complexity
- ✅ Better offline support
- ✅ Same E2EE and Automerge properties

**Revisit service proxying only if:**

- AT Protocol private data support ships with compelling benefits
- Strong ecosystem pressure for XRPC-native APIs emerges
- Competitive landscape shifts dramatically

**Alternative path (if privacy requirements relax):**

- Offer "hybrid mode" with unencrypted metadata for better UX
- Makes service proxying's rich Lexicons valuable again

---

[← Back to Service Proxying Alternative](./13-SERVICE-PROXYING-ALTERNATIVE.md)
