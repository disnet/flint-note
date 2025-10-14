# Design Principles & Architecture

[← Back to Overview](./00-OVERVIEW.md) | [Next: AT Protocol Identity →](./02-AT-PROTOCOL-IDENTITY.md)

---

## Core Design Principles

### 1. Local-First, Sync Optional

- Flint works perfectly without an account or sync
- Sync is an optional feature for users with multiple devices
- Single-device users never see sync UI or prompts
- All functionality available offline

### 2. Filesystem as Source of Truth

- Markdown files in vault folder are canonical
- Database is a derived cache/index
- Users can edit files externally (VSCode, git, etc.)
- Flint watches and responds to external changes
- Database can be rebuilt from files at any time

### 3. Automerge for Automatic Conflict Resolution

- No conflict resolution UI needed
- Trust Automerge's CRDT merging
- Concurrent edits merge automatically
- Content changes use operational transformation
- Metadata changes use last-write-wins

### 4. Encrypted and Private

- Zero-knowledge encryption (Flint never sees plaintext)
- Passwordless by default (device keychain + biometric unlock)
- Optional password backup for easier multi-device setup
- Data stored encrypted on R2
- End-to-end encryption from device to device

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Device A                            │
│                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │  Markdown    │───▶│  Automerge  │───▶│  File System │    │
│  │    Files     │◀───│    Docs     │◀───│   Watcher    │    │
│  └──────────────┘    └─────────────┘    └──────────────┘    │
│         │                    │                              │
│         │                    │ Encrypted                    │
│         ↓                    ↓ Sync                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SQLite Database (Derived Cache)                     │   │
│  │  - Search index, link graph, hierarchies             │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────┼────────┐
                  │  Encryption     │
                  │  (AES-256-GCM)  │
                  └────────┼────────┘
                           │
                           ↓
                  ┌─────────────────┐
                  │  Cloudflare R2  │
                  │  (Encrypted     │
                  │   Documents)    │
                  └─────────────────┘
                           ↑
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                       Device B                               │
│  (Same architecture, syncs via R2)                           │
└──────────────────────────────────────────────────────────────┘
```

### Identity & Authorization Layer

```
┌──────────────────────────────────────────────────────────────┐
│          Identity & Authorization (AT Protocol)              │
│                                                              │
│  ┌──────────┐       ┌──────────┐       ┌──────────────┐   │
│  │   DID    │──────▶│   PDS    │◀──────│ OAuth Client │   │
│  │ Registry │       │ (User's) │       │  (Electron)  │   │
│  └──────────┘       └──────────┘       └──────────────┘   │
│                             │                               │
│                             ↓                               │
│                    ┌─────────────────┐                     │
│                    │ Flint Sync API  │                     │
│                    │ (Verifies DID,  │                     │
│                    │  Returns R2     │                     │
│                    │  Credentials)   │                     │
│                    └─────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Local Editing (No Sync)

```
User edits note
    ↓
Update Automerge document
    ↓
Write to markdown file
    ↓
Update SQLite database (search index, links)
    ↓
UI reflects changes
```

### 2. External File Edit

```
User edits file in VSCode
    ↓
File watcher detects change
    ↓
Read file content
    ↓
Update Automerge document
    ↓
Update SQLite database
    ↓
UI reflects changes
```

### 3. Sync to Cloud

```
Automerge document changes
    ↓
Serialize to binary format
    ↓
Encrypt with vault key (AES-256-GCM)
    ↓
Upload to R2 (/{did}/documents/{docId}.automerge)
    ↓
Background sync completes
```

### 4. Sync from Cloud

```
Periodic sync check
    ↓
Download documents from R2
    ↓
Decrypt with vault key
    ↓
Merge into local Automerge documents
    ↓
Write merged content to markdown files
    ↓
Update SQLite database
    ↓
UI reflects changes
```

### 5. Conflict Resolution

```
Device A edits note (section 1)
Device B edits same note (section 2)
    ↓
Both sync to R2
    ↓
Device A downloads B's changes
Device B downloads A's changes
    ↓
Automerge CRDTs merge automatically
    ↓
Both devices converge to same state
    ↓
No user intervention needed
```

---

## Component Responsibilities

### Automerge Layer

**Purpose:** Conflict-free document representation
- Store note content as CRDTs
- Automatic conflict resolution
- Efficient binary serialization
- History tracking and versioning

### Encryption Layer

**Purpose:** Zero-knowledge security
- Generate and manage vault keys
- Encrypt/decrypt Automerge documents
- Device authorization via ECDH
- Optional password backup

### R2 Storage Layer

**Purpose:** Cloud persistence
- Store encrypted Automerge documents
- Namespaced by DID (/{did}/*)
- Temporary scoped credentials
- Cost-effective object storage

### File System Layer

**Purpose:** User-visible storage
- Markdown files as source of truth
- Bidirectional sync with Automerge
- Watch for external changes
- Maintain consistency

### Database Layer

**Purpose:** Performance optimization
- Full-text search index
- Link graph and backlinks
- Note hierarchies
- Derived from Automerge/files

### Sync Service Layer

**Purpose:** Authorization and access control
- Verify AT Protocol DIDs
- Issue scoped R2 credentials
- Track storage quotas
- Rate limiting and abuse prevention

---

## Key Design Decisions

### Why Automerge?

- **Automatic conflict resolution:** No manual conflict UI needed
- **Battle-tested CRDT:** Proven in production applications
- **Text-specific CRDTs:** Optimized for document editing
- **Binary format:** Efficient storage and transmission
- **Active development:** Well-maintained with growing ecosystem

### Why Cloudflare R2?

- **Cost-effective:** ~$0.0003/user/month for typical usage
- **S3-compatible:** Standard APIs and tooling
- **Free egress:** No bandwidth charges
- **Edge deployment:** Global distribution
- **Integrated with Workers:** Easy authorization layer

### Why AT Protocol?

- **Decentralized identity:** User-controlled DIDs
- **Portable:** Not locked to any single provider
- **Growing ecosystem:** Bluesky and other apps
- **OAuth standard:** Familiar authentication flow
- **DPoP tokens:** Enhanced security via token binding

### Why Device Keychain?

- **Best UX:** No passwords to remember
- **Biometric unlock:** Touch ID, Windows Hello
- **OS-level security:** Hardware-backed encryption
- **Per-device isolation:** Lost device doesn't compromise others
- **Optional backup:** Password available for recovery

---

## Trade-offs and Alternatives Considered

### Automerge vs. Yjs

**Chose Automerge because:**
- More focused on document editing
- Better TypeScript support
- Cleaner API for our use case
- Storage adapter pattern fits our needs

**Yjs advantages (not chosen):**
- Slightly better performance in benchmarks
- More real-time focused
- Larger ecosystem

### R2 vs. S3 vs. Self-hosted

**Chose R2 because:**
- 10x cheaper than S3 for storage
- Free egress (S3 charges for downloads)
- Integrated with Cloudflare Workers
- Simple pricing model

**S3 advantages (not chosen):**
- More mature ecosystem
- More regions and availability zones
- Enterprise SLAs

**Self-hosted advantages (not chosen):**
- Complete control
- No vendor lock-in
- But: operational complexity, scaling challenges

### AT Protocol vs. Email/OAuth vs. Web3

**Chose AT Protocol because:**
- Decentralized but practical
- Growing adoption (Bluesky)
- Good TypeScript libraries
- User-controlled identity

**Email/OAuth advantages (not chosen):**
- More familiar to users
- Broader adoption
- But: centralized, privacy concerns

**Web3 advantages (not chosen):**
- Fully decentralized
- But: poor UX, complexity, cost

---

## Architectural Principles

### 1. Separation of Concerns

- **Data layer:** Automerge documents (conflict-free)
- **Storage layer:** Markdown files (user-visible)
- **Index layer:** SQLite (performance)
- **Sync layer:** R2 (cloud backup)
- **Auth layer:** AT Protocol (identity)

### 2. Progressive Enhancement

- Core functionality works offline
- Sync adds multi-device capability
- Collaboration features layer on top
- Each layer optional

### 3. Zero Trust Security

- Never trust server with plaintext
- Never trust network with plaintext
- Encrypt at rest and in transit
- Verify all inputs

### 4. Graceful Degradation

- Work offline when network unavailable
- Queue changes for later sync
- Handle partial sync states
- Recover from interruptions

### 5. User Control

- Users own their files
- Users own their keys
- Users choose their PDS
- Users can export/migrate

---

**Next:** [AT Protocol Identity →](./02-AT-PROTOCOL-IDENTITY.md)
