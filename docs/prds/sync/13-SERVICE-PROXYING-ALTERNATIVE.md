# Service Proxying Alternative Architecture

[← Back to Overview](./00-OVERVIEW.md)

---

## Executive Summary

This document explores an alternative architecture for Flint sync that uses **AT Protocol service proxying** instead of direct R2 access. This approach aligns more closely with AT Protocol's native patterns and could provide a smoother migration path when the protocol adds native private data support.

**Key Trade-off:** Service proxying adds complexity and latency today, but enables client-agnostic data formats and better ecosystem integration long-term.

---

## Current Architecture vs. Service Proxying

### Current Architecture (Documented in Main Plan)

```
┌─────────────────────────────────────────────────────┐
│                    Flint Client                     │
│  - Markdown files (source of truth)                 │
│  - Local Automerge documents                        │
│  - SQLite cache/index                               │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 1. Request R2 credentials (DPoP token)
                   ↓
         ┌─────────────────────┐
         │ Flint Sync Service  │
         │ (Cloudflare Worker) │
         └──────────┬──────────┘
                    │
                    │ 2. Returns scoped R2 credentials
                    ↓
         ┌──────────────────────┐
         │  Client uses creds   │
         │  to access R2 directly│
         └──────────┬───────────┘
                    │
                    │ 3. Direct R2 operations
                    ↓
         ┌─────────────────┐
         │  Cloudflare R2  │
         │  (Encrypted     │
         │   Automerge)    │
         └─────────────────┘
```

**Properties:**
- Client talks directly to R2 after getting credentials
- Simple credential issuance service
- Low latency (no proxy hop)
- Works offline after initial auth
- R2 API (not XRPC)

---

### Service Proxying Architecture (Alternative)

```
┌─────────────────────────────────────────────────────┐
│                    Flint Client                     │
│  - Markdown files (source of truth)                 │
│  - Local Automerge documents                        │
│  - SQLite cache/index                               │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 1. XRPC request with atproto-proxy header
                   ↓
         ┌─────────────────────┐
         │   User's PDS        │
         │   (bsky.social or   │
         │    self-hosted)     │
         └──────────┬──────────┘
                    │
                    │ 2. Service auth JWT (signed by user's key)
                    ↓
         ┌─────────────────────┐
         │ Flint Notes Service │
         │ (XRPC endpoints)    │
         │ - Verifies JWT      │
         │ - Implements        │
         │   Lexicon schemas   │
         └──────────┬──────────┘
                    │
                    │ 3. Backend storage operations
                    ↓
         ┌─────────────────┐         ┌──────────────────┐
         │  Today:         │         │  Future:         │
         │  Your R2        │   OR    │  PDS Native      │
         │  Storage        │         │  Private Storage │
         └─────────────────┘         └──────────────────┘
```

**Properties:**
- All requests proxied through user's PDS
- XRPC endpoints following Lexicon schemas
- Service auth JWT verification
- Standard AT Protocol pattern
- Easier migration to native PDS storage

---

## Strategic Advantages of Service Proxying

### 1. Client Agnosticism & Zero Lock-in

**With Service Proxying:**
```
Flint publishes Lexicon schemas:
  - com.flint.note.create
  - com.flint.note.update
  - com.flint.note.list
  - com.flint.note.sync
  - com.flint.note.delete

→ Any developer can build a client for Flint notes
→ Users can switch between Flint Desktop, Flint Web, third-party apps
→ Data format is open and standardized
→ Massive trust signal: "Your notes aren't locked to our app"
```

**With Current Architecture:**
```
Flint-specific R2 storage format:
  - Encrypted Automerge documents
  - Custom vault-identity.json structure
  - R2 bucket organization

→ Only Flint clients can read/write data
→ Users dependent on Flint maintaining compatibility
→ No ecosystem of third-party clients possible
```

### 2. Smooth Migration Path to Native PDS Storage

**When AT Protocol adds native private data support:**

**Service Proxying:**
```
Change backend implementation:
  Before: Flint Service → R2
  After:  Flint Service → PDS native storage

Client code unchanged (still uses same XRPC methods)
Migration is backend-only data movement
```

**Current Architecture:**
```
Requires:
  - Rewriting entire sync layer
  - Changing client storage code
  - Migrating from R2 to new API
  - Potential data format changes
  - All clients must update
```

### 3. AT Protocol Ecosystem Alignment

**Benefits:**
- Flint becomes "native AT Protocol notes app"
- Could get featured in AT Protocol ecosystem
- Bluesky community adoption easier
- Interoperability with other AT Protocol apps
- Future collaboration features more natural

**Example Future Use Cases:**
- Share note with another Flint user via DID
- Mention someone in a note (@handle.bsky.social)
- Link notes to Bluesky posts
- Collaborative editing with AT Protocol identity

### 4. Data Portability & Transparency

**With Lexicon schemas:**
```json
// Published spec that anyone can implement
{
  "lexicon": 1,
  "id": "com.flint.note.create",
  "description": "Create a new note in Flint",
  "input": {
    "schema": {
      "type": "object",
      "required": ["content"],
      "properties": {
        "content": { "type": "string" },
        "title": { "type": "string" },
        "tags": { "type": "array" }
      }
    }
  }
}
```

Users can:
- Inspect exactly how their data is structured
- Build their own tools against published specs
- Trust that data format is stable and open
- Export to any client that implements the schema

---

## Technical Implementation

### Lexicon Schema Design

#### 1. Note Record Schema

```json
{
  "lexicon": 1,
  "id": "com.flint.note",
  "defs": {
    "main": {
      "type": "record",
      "description": "A markdown note in Flint",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["content", "createdAt"],
        "properties": {
          "content": {
            "type": "string",
            "description": "Markdown content",
            "maxLength": 1000000
          },
          "title": {
            "type": "string",
            "maxLength": 300
          },
          "tags": {
            "type": "array",
            "items": { "type": "string" },
            "maxLength": 50
          },
          "frontmatter": {
            "type": "string",
            "description": "YAML frontmatter"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "updatedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```

#### 2. Sync Procedure Schema

```json
{
  "lexicon": 1,
  "id": "com.flint.note.sync",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Sync Automerge changes for notes",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["changes"],
          "properties": {
            "changes": {
              "type": "array",
              "description": "Encrypted Automerge operations",
              "items": { "type": "ref", "ref": "#change" }
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["synced"],
          "properties": {
            "synced": {
              "type": "array",
              "items": { "type": "string" }
            },
            "serverChanges": {
              "type": "array",
              "description": "Changes from server to merge",
              "items": { "type": "ref", "ref": "#change" }
            }
          }
        }
      }
    },
    "change": {
      "type": "object",
      "required": ["noteId", "ops", "timestamp"],
      "properties": {
        "noteId": { "type": "string" },
        "ops": {
          "type": "string",
          "description": "Base64-encoded encrypted Automerge operations"
        },
        "timestamp": { "type": "string", "format": "datetime" }
      }
    }
  }
}
```

#### 3. List Notes Query

```json
{
  "lexicon": 1,
  "id": "com.flint.note.list",
  "defs": {
    "main": {
      "type": "query",
      "description": "List user's notes with pagination",
      "parameters": {
        "type": "params",
        "properties": {
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string",
            "description": "Pagination cursor"
          },
          "tag": {
            "type": "string",
            "description": "Filter by tag"
          }
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
              "items": { "type": "ref", "ref": "#noteView" }
            },
            "cursor": { "type": "string" }
          }
        }
      }
    },
    "noteView": {
      "type": "object",
      "required": ["uri", "cid", "title", "createdAt", "updatedAt"],
      "properties": {
        "uri": { "type": "string", "format": "at-uri" },
        "cid": { "type": "string", "format": "cid" },
        "title": { "type": "string" },
        "preview": { "type": "string", "maxLength": 200 },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        },
        "createdAt": { "type": "string", "format": "datetime" },
        "updatedAt": { "type": "string", "format": "datetime" }
      }
    }
  }
}
```

### Client Implementation with Service Proxying

```typescript
import { AtpAgent } from '@atproto/api';

class FlintSyncClient {
  private agent: AtpAgent;
  private serviceEndpoint: string = 'did:web:sync.flint.app#flint_notes';

  async initialize(session: OAuthSession): Promise<void> {
    this.agent = new AtpAgent({
      service: session.pdsUrl,
      persistSession: () => {},
    });

    // Restore OAuth session
    await this.agent.resumeSession(session);
  }

  /**
   * Sync Automerge changes using service proxying
   */
  async syncNotes(changes: NoteChange[]): Promise<SyncResult> {
    const response = await this.agent.api.com.flint.note.sync(
      {
        changes: changes.map(c => ({
          noteId: c.noteId,
          ops: Buffer.from(c.encryptedOps).toString('base64'),
          timestamp: c.timestamp.toISOString(),
        })),
      },
      {
        headers: {
          'atproto-proxy': this.serviceEndpoint,
        },
      }
    );

    return {
      synced: response.data.synced,
      serverChanges: response.data.serverChanges.map(c => ({
        noteId: c.noteId,
        encryptedOps: Buffer.from(c.ops, 'base64'),
        timestamp: new Date(c.timestamp),
      })),
    };
  }

  /**
   * List notes via service proxy
   */
  async listNotes(options?: ListOptions): Promise<NoteView[]> {
    const response = await this.agent.api.com.flint.note.list(
      {
        limit: options?.limit || 50,
        cursor: options?.cursor,
        tag: options?.tag,
      },
      {
        headers: {
          'atproto-proxy': this.serviceEndpoint,
        },
      }
    );

    return response.data.notes;
  }

  /**
   * Create new note via service proxy
   */
  async createNote(note: CreateNoteInput): Promise<NoteView> {
    const response = await this.agent.api.com.flint.note.create(
      {
        content: note.content,
        title: note.title,
        tags: note.tags,
        frontmatter: note.frontmatter,
      },
      {
        headers: {
          'atproto-proxy': this.serviceEndpoint,
        },
      }
    );

    return response.data;
  }
}
```

### Backend XRPC Service Implementation

```typescript
// Cloudflare Worker with XRPC endpoints

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Verify service auth JWT from PDS
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const serviceAuthJWT = authHeader.slice(7);
    const userDID = await verifyServiceAuthJWT(serviceAuthJWT, env);

    // Route to XRPC endpoints
    if (url.pathname === '/xrpc/com.flint.note.sync') {
      return handleNoteSync(request, userDID, env);
    }

    if (url.pathname === '/xrpc/com.flint.note.list') {
      return handleNoteList(request, userDID, env);
    }

    if (url.pathname === '/xrpc/com.flint.note.create') {
      return handleNoteCreate(request, userDID, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Verify service auth JWT from PDS
 */
async function verifyServiceAuthJWT(
  jwt: string,
  env: Env
): Promise<string> {
  // 1. Decode JWT
  const decoded = parseJWT(jwt);

  // 2. Verify claims
  if (decoded.aud !== 'did:web:sync.flint.app') {
    throw new Error('Invalid audience');
  }

  if (decoded.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  const userDID = decoded.iss; // User's DID

  // 3. Fetch user's DID document
  const didDoc = await resolveDID(userDID);

  // 4. Verify JWT signature with user's public key
  const publicKey = didDoc.verificationMethod.find(
    vm => vm.id === `${userDID}#atproto`
  );

  const isValid = await verifyJWTSignature(jwt, publicKey);
  if (!isValid) {
    throw new Error('Invalid signature');
  }

  return userDID;
}

/**
 * Handle note sync XRPC endpoint
 */
async function handleNoteSync(
  request: Request,
  userDID: string,
  env: Env
): Promise<Response> {
  const body = await request.json();

  // Process incoming changes
  const synced: string[] = [];
  for (const change of body.changes) {
    // Store encrypted Automerge ops in R2
    const key = `${userDID}/documents/${change.noteId}.automerge`;

    // Append operations (this is simplified - real implementation
    // would merge Automerge documents properly)
    await env.R2_BUCKET.put(key, change.ops, {
      customMetadata: {
        timestamp: change.timestamp,
      },
    });

    synced.push(change.noteId);
  }

  // Fetch any server-side changes
  const serverChanges = await fetchServerChanges(userDID, env);

  return new Response(
    JSON.stringify({
      synced,
      serverChanges,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
```

---

## Comparison: Current vs. Service Proxying

| Aspect | Current Architecture | Service Proxying |
|--------|---------------------|------------------|
| **Request Path** | Client → Sync Service → R2 credentials → Client → R2 | Client → PDS → Flint Service → R2 |
| **API Style** | REST (credential issuance) | XRPC (Lexicon schemas) |
| **Latency** | Lower (direct R2 access) | Higher (proxy hop through PDS) |
| **PDS Dependency** | Only initial auth + refresh | Every sync operation |
| **Offline After Auth** | Yes (cached R2 creds) | No (needs PDS for each request) |
| **Client Agnostic** | No (Flint-specific format) | Yes (published Lexicons) |
| **Ecosystem Alignment** | Minimal (uses AT Protocol for identity only) | Full (native AT Protocol pattern) |
| **Migration to PDS Storage** | Requires rewrite | Backend-only change |
| **Implementation Complexity** | Lower | Higher (XRPC + Lexicons) |
| **Development Time** | 3.5-5 months | 5-7 months (+30-40%) |

---

## Migration Strategies

### Option A: Pragmatic (Ship Current Plan)

**Approach:**
1. Launch with current architecture (direct R2, no service proxying)
2. Market as "encrypted, local-first notes with AT Protocol identity"
3. If/when PDS native storage arrives, evaluate migration
4. Can add service proxying later as "enhanced sync mode"

**Timeline:** Ship in 3.5-5 months as planned

**Pros:**
- ✅ Faster to market
- ✅ Simpler implementation
- ✅ Lower operational costs
- ✅ Better offline support

**Cons:**
- ⚠️ Harder migration to PDS native storage
- ⚠️ No client agnosticism
- ⚠️ Less AT Protocol ecosystem integration

---

### Option B: Strategic (Service Proxying Now)

**Approach:**
1. Implement XRPC service with Lexicon schemas from day 1
2. Use service proxying pattern (client → PDS → Flint service)
3. Backend stores in R2 today, PDS native storage tomorrow
4. Market as "AT Protocol native notes - your data, any client"

**Timeline:** 5-7 months (+4-6 weeks for XRPC implementation)

**Pros:**
- ✅ Smooth PDS migration path
- ✅ Client-agnostic data format
- ✅ Full AT Protocol ecosystem integration
- ✅ Strong trust signal (open specs)

**Cons:**
- ⚠️ Slower to market
- ⚠️ Higher complexity
- ⚠️ More PDS dependency
- ⚠️ Reduced offline capability

---

### Option C: Hybrid (Best of Both)

**Approach:**
1. Ship current plan for v1 (faster to market)
2. **Design and publish Lexicon schemas now** (specs only, low cost)
3. Add XRPC service proxying layer in v1.1 or v2
4. Maintain both direct R2 and service proxy modes initially

**Timeline:**
- v1: 3.5-5 months (current plan)
- Lexicon specs: +1-2 weeks (document only)
- v1.1 XRPC: +2-3 months (after v1 launch)

**Pros:**
- ✅ Fast initial launch
- ✅ User feedback before over-investing
- ✅ Clear migration path documented
- ✅ Trust signal via published specs
- ✅ Can support both modes (direct + proxy)

**Cons:**
- ⚠️ Maintaining two sync modes
- ⚠️ Deferred ecosystem benefits
- ⚠️ Specs may need revision after v1 feedback

---

## Recommendation

### Short Term: Option C (Hybrid Approach)

**Phase 1: Launch with Current Architecture (v1)**
- Ship local-first + direct R2 access
- Validate product-market fit
- Get user feedback on core experience

**Phase 2: Publish Lexicon Specs (Low Cost)**
- Design `com.flint.note.*` Lexicon schemas
- Publish on GitHub and AT Protocol community
- Signal commitment to openness: "Here's our open spec"
- Shows migration path even if not implemented yet

**Phase 3: Implement Service Proxying (v1.1+)**
- Add XRPC endpoints after v1 ships
- Offer both modes: "Direct sync" vs "AT Protocol sync"
- Migrate users gradually to service proxying
- Deprecate direct R2 mode when PDS storage available

### Long Term: Full Service Proxying

**When AT Protocol adds native private data support:**
- Flint already has XRPC infrastructure
- Backend switches from R2 to PDS storage
- Client code remains unchanged (same Lexicons)
- Users benefit from native PDS integration
- Third-party clients can emerge

---

## Critical Success Factors

### 1. Timing of PDS Private Data Support

**Need to know:**
- When will AT Protocol ship native private data?
- What will the API look like?
- How does it compare to service proxying today?

**Action:** Monitor https://github.com/bluesky-social/atproto/discussions/3049

### 2. User Value Proposition

**Key question:** Is "your notes, any client" a core differentiator?

**If yes:**
- Invest in Lexicons early
- Market open data format prominently
- Build trust through transparency

**If no:**
- Focus on integrated Flint experience
- Defer service proxying until PDS storage available

### 3. Ecosystem Adoption

**Key question:** Will third-party Flint clients actually emerge?

**Consider:**
- Size of AT Protocol developer community
- Interest in notes/PKM space
- Effort required to build a client
- Flint's market position

### 4. Implementation Complexity

**Service proxying adds:**
- XRPC endpoint implementation
- Lexicon schema maintenance
- Service auth JWT verification
- PDS compatibility testing
- More complex error handling

**Is the 30-40% time investment worth it?**
- Depends on strategic importance of client agnosticism
- Depends on timing of PDS native storage
- Depends on competitive landscape

---

## Next Steps

1. **Research:** Check AT Protocol roadmap for private data timeline
2. **Design:** Draft initial Lexicon schemas (low cost, high signal)
3. **Decide:** Choose Option A, B, or C based on strategic priorities
4. **Document:** Update implementation plan with chosen approach
5. **Communicate:** If choosing hybrid, publish Lexicons early to build trust

---

## References

- [AT Protocol Private Data Discussion](https://github.com/bluesky-social/atproto/discussions/3049)
- [XRPC Service Proxying Spec](https://atproto.com/specs/xrpc#service-proxying)
- [Lexicon Schema System](https://atproto.com/guides/lexicon)
- [Generic AT Protocol Notes Architecture](../atproto-notes-architecture.md)

---

[← Back to Overview](./00-OVERVIEW.md)
