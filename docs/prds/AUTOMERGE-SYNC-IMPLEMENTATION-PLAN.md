# Automerge Multi-Device Sync Implementation Plan

## Executive Summary

This document outlines a phased approach to adding multi-device sync to Flint using:
- **Automerge CRDTs** for conflict-free document merging
- **Cloudflare R2** for encrypted cloud storage (Flint-hosted)
- **AT Protocol** for decentralized identity (**required** for sync)

**Scope:** Notes only (not UI state, slash commands, or note types initially)
**Conflict Resolution:** Automatic via Automerge (no conflict UI needed)
**Identity:** AT Protocol DID required to access Flint-hosted sync service

---

## Encryption & Key Management Strategy

### Hybrid Approach: Passwordless by Default

**Philosophy:** Balance security, user experience, and multi-device convenience.

### Three Setup Paths

#### 1. **Primary Path: Passwordless (Recommended)**

**First Device:**
1. User clicks "Enable Sync"
2. System generates random 256-bit vault key
3. Vault key stored in OS keychain (biometric-protected)
4. Device generates ECDH key pair for authorization
5. Sync enabled - no password to remember!

**Second Device:**
1. User clicks "Join Vault" → "Authorize from Another Device"
2. New device generates ephemeral ECDH key pair
3. Displays 6-character code or QR code
4. Existing device scans code and approves
5. Devices perform ECDH key agreement
6. Vault key wrapped and transferred via shared secret
7. New device stores vault key in its keychain

**Advantages:**
- ✅ No password to remember
- ✅ Biometric unlock (Touch ID, Windows Hello)
- ✅ Hardware-backed security (OS keychain)
- ✅ Zero-knowledge maintained
- ✅ Best UX for most users

**Disadvantages:**
- ⚠️ Requires access to existing device for setup
- ⚠️ If all devices lost without password backup, data unrecoverable

#### 2. **Optional Path: Password Backup**

**Enabling Password Backup:**
1. After sync enabled, user optionally adds password
2. Vault key encrypted with password-derived key (scrypt)
3. Encrypted vault key uploaded to R2 as backup
4. Password never leaves device

**Using Password Backup:**
1. New device: "Join Vault" → "Use Password"
2. Enter password
3. Download encrypted vault key from R2
4. Derive decryption key from password
5. Decrypt and store vault key in keychain

**Advantages:**
- ✅ Can set up new devices without existing device
- ✅ Recovery option if all devices lost
- ✅ Familiar authentication flow
- ✅ Still zero-knowledge (password not sent to server)

**Disadvantages:**
- ⚠️ Password to remember
- ⚠️ Password compromise exposes vault key
- ⚠️ Must be enabled explicitly

#### 3. **AT Protocol Identity (Required for Sync)**

Users **must** sign in with AT Protocol to enable sync:
- Provides portable DID for identity and authorization
- DID determines R2 storage namespace (`{did}/vault-identity.json`)
- Authorization checked by Flint's sync service backend
- Enables future collaboration features

**Note:** AT Protocol login is for identity and authorization only, **not encryption**. Vault keys remain managed via device keychain or password backup and are never sent to Flint's servers.

### Security Properties

| Property | Passwordless | Password Backup | AT Protocol |
|----------|--------------|-----------------|-------------|
| Zero-knowledge | ✅ Yes | ✅ Yes | ✅ Yes |
| Biometric unlock | ✅ Yes | ✅ Yes | ✅ Yes |
| No password | ✅ Yes | ❌ No | ✅ Yes |
| Easy device setup | ⚠️ Requires device | ✅ Password only | ⚠️ Requires device |
| Recovery option | ❌ No | ✅ Password | ❌ No |
| Hardware-backed | ✅ Yes | ✅ Yes | ✅ Yes |

### Recommended Strategy

**For most users:**
1. Sign in with AT Protocol (required for sync)
2. Start with passwordless (device keychain)
3. After using for a while, optionally add password backup

**For users who lose devices often:**
1. Sign in with AT Protocol
2. Enable password backup immediately
3. Store password in password manager

**For technical users:**
1. Sign in with AT Protocol
2. Passwordless by default
3. Export encrypted vault key to file as manual backup
4. Store backup securely (USB drive, encrypted cloud storage)

---

## Design Principles

### 1. **Local-First, Sync Optional**
- Flint works perfectly without an account or sync
- Sync is an optional feature for users with multiple devices
- Single-device users never see sync UI or prompts

### 2. **Filesystem as Source of Truth**
- Markdown files in vault folder are canonical
- Database is a derived cache/index
- Users can edit files externally (VSCode, git, etc.)

### 3. **Automerge for Automatic Conflict Resolution**
- No conflict resolution UI needed
- Trust Automerge's CRDT merging
- Concurrent edits merge automatically

### 4. **Encrypted and Private**
- Zero-knowledge encryption (Flint never sees plaintext)
- Passwordless by default (device keychain + biometric unlock)
- Optional password backup for easier multi-device setup
- Data stored encrypted on R2

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Device A                            │
│                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │  Markdown    │───▶│  Automerge  │───▶│  File System │  │
│  │    Files     │◀───│    Docs     │◀───│   Watcher    │  │
│  └──────────────┘    └─────────────┘    └──────────────┘  │
│         │                    │                              │
│         │                    │ Encrypted                    │
│         ↓                    ↓ Sync                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SQLite Database (Derived Cache)                     │  │
│  │  - Search index, link graph, hierarchies             │  │
│  └──────────────────────────────────────────────────────┘  │
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

## Flint Sync Service Architecture

The Flint Sync Service is a lightweight backend deployed as a Cloudflare Worker that provides:

### Core Responsibilities

1. **Identity Verification**
   - Verify AT Protocol DPoP tokens
   - Validate user's DID from token claims
   - Ensure token is properly bound to request

2. **Authorization**
   - Issue temporary, scoped R2 credentials per user
   - Credentials limited to `/{did}/*` prefix only
   - Automatic credential rotation (1-hour expiration)

3. **Resource Management**
   - Track storage usage per DID
   - Enforce storage quotas (default 1GB)
   - Rate limiting per DID

4. **Privacy**
   - Never sees vault encryption keys
   - Never sees plaintext note data
   - Only handles authorization metadata

### API Endpoints

```typescript
// POST /credentials
// Request scoped R2 credentials
interface CredentialsRequest {
  did: string;
  dpopToken: string;  // DPoP-bound access token from AT Protocol
}

interface CredentialsResponse {
  r2Credentials: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    bucketName: string;
    expiration: string;
  };
  storageQuota: {
    used: number;
    limit: number;
  };
}

// GET /quota/:did
// Check storage quota (requires valid DPoP token)
interface QuotaResponse {
  did: string;
  used: number;
  limit: number;
  percentUsed: number;
}
```

### Security Model

**DPoP Token Verification:**
1. Extract JWT from DPoP header
2. Fetch DID document to get public key
3. Verify JWT signature using public key
4. Check token expiration and audience claims
5. Verify token is bound to request (DPoP proof)

**R2 Credential Scoping:**
- Use Cloudflare R2 temporary access tokens API
- Scope each token to specific prefix: `/{did}/*`
- Tokens expire after 1 hour
- Automatic rotation on client side

**Storage Quota Enforcement:**
- Track usage via Cloudflare D1 or KV
- Update on each write operation (via R2 notifications or periodic scan)
- Reject writes exceeding quota

### Deployment

**Infrastructure:**
- Cloudflare Worker (edge compute)
- Cloudflare R2 (object storage)
- Cloudflare D1 (quota tracking) or KV

**Cost:**
- Workers: Free tier covers most usage (10M requests/day)
- R2: $0.015/GB/month storage, $4.50/M writes
- D1: Free tier covers quota tracking

**Scaling:**
- Serverless, auto-scales
- No server management
- Global edge deployment

---

## Automerge Document Schema

Each note is represented as an Automerge document with **separated metadata and content**:

```typescript
import { next as Automerge } from '@automerge/automerge';

interface FlintNote {
  // Immutable identifier
  id: string;

  // Structured metadata (from frontmatter)
  metadata: {
    title: string;
    filename: string;
    type: string;
    created: string;      // ISO 8601 timestamp
    updated: string;      // ISO 8601 timestamp
    tags: string[];
    [key: string]: any;   // Custom frontmatter fields
  };

  // Markdown content (CRDT for conflict-free merging)
  content: Automerge.Text;

  // Deletion flag (for soft deletes)
  deleted: boolean;
}

// Example: Create a note
const note = Automerge.init<FlintNote>();
const updatedNote = Automerge.change(note, doc => {
  doc.id = 'n-abc12345';
  doc.metadata = {
    title: 'My Note',
    filename: 'my-note',
    type: 'note',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    tags: ['important']
  };
  doc.content = new Automerge.Text('# My Note\n\nContent here...');
  doc.deleted = false;
});
```

**Why separate metadata from content?**
- Better conflict resolution: metadata changes don't conflict with content edits
- Easier to update frontmatter independently
- Cleaner mapping to filesystem (frontmatter + content)

---

## Phase 0: Prerequisites (2-3 weeks)

**Goal:** Get external file editing working reliably.

### Tasks

#### 1. **Implement File Watching**
- Use `chokidar` for cross-platform file watching
- Detect: add, change, delete, rename events
- Debounce rapid changes (100-200ms)
- Filter ignored paths (`.git/`, `.flint-note/`, etc.)

**Deliverable:** File watcher service running in Electron main process

#### 2. **Distinguish Internal vs External Changes**
- Track file write operations by Flint
- Track expected modification times
- Ignore self-caused file changes
- Process external changes only

**Deliverable:** Change processor that filters internal writes

#### 3. **Handle External Content Changes**
- Read modified files
- Parse frontmatter + content
- Update database (notes, search, links)
- Notify UI of changes

**Deliverable:** External edits reflected in Flint UI

#### 4. **Handle Renames**
- Detect renames (unlink + add with same ID)
- Update database with new path/filename
- Update wikilinks in other notes
- Sync frontmatter filename with filesystem

**Deliverable:** Renames handled correctly

#### 5. **Ensure ID Consistency**
- Auto-generate IDs for notes without them
- Detect and resolve ID conflicts
- Write IDs back to frontmatter
- Validate ID uniqueness on startup

**Deliverable:** All notes have stable, unique IDs

### Testing
- Edit files in VSCode while Flint is running
- Rename files in Finder/Explorer
- Delete and restore files
- Verify database stays in sync
- Check wikilinks update correctly

### Acceptance Criteria
- ✅ External edits appear in Flint within 1 second
- ✅ Renames update wikilinks automatically
- ✅ No duplicate IDs in database
- ✅ Internal writes don't trigger re-processing
- ✅ Database can be rebuilt from files at any time

---

## Phase 1: Local Automerge (No Sync) (3-4 weeks)

**Goal:** Replace filesystem as the primary data layer with Automerge documents, keeping everything local.

### Tasks

#### 1. **Setup Automerge-Repo**
```bash
npm install @automerge/automerge @automerge/automerge-repo @automerge/automerge-repo-storage-indexeddb
```

```typescript
import { Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';

class AutomergeManager {
  private repo: Repo;

  async initialize(vaultPath: string): Promise<void> {
    this.repo = new Repo({
      // Local persistence via IndexedDB
      storage: new IndexedDBStorageAdapter(`flint-${vaultPath}`),

      // No network adapters yet (Phase 1 is local-only)
      network: [],

      // Private by default (no sharing)
      sharePolicy: async () => false
    });

    await this.repo.storageSubsystem.ready();
  }
}
```

**Deliverable:** Automerge repo initialized per vault

#### 2. **Create Automerge Documents from Files**
- Scan vault directory on startup
- For each markdown file:
  - Parse frontmatter + content
  - Create Automerge document
  - Store in Automerge repo (IndexedDB)

```typescript
async function syncFilesToAutomerge(vaultPath: string): Promise<void> {
  const files = await findAllMarkdownFiles(vaultPath);

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseNoteContent(content);

    // Create Automerge document
    const noteId = parsed.metadata.id || generateNoteId();
    const handle = this.repo.find<FlintNote>(noteId);

    handle.change(doc => {
      doc.id = noteId;
      doc.metadata = parsed.metadata;
      doc.content = new Automerge.Text(parsed.content);
      doc.deleted = false;
    });
  }
}
```

**Deliverable:** All notes have corresponding Automerge documents

#### 3. **Bidirectional Sync: Automerge ↔ Filesystem**

**Automerge → Filesystem:**
```typescript
// When Automerge document changes, write to file
handle.on('change', async ({ doc }) => {
  if (doc.deleted) {
    // Delete file
    await fs.unlink(getNotePath(doc.id));
    return;
  }

  // Format content with frontmatter
  const fileContent = formatNoteFile(doc.metadata, doc.content.toString());

  // Write to filesystem
  const notePath = getNotePath(doc.id);
  await this.changeProcessor.trackWrite(notePath);
  await fs.writeFile(notePath, fileContent, 'utf-8');
  const stats = await fs.stat(notePath);
  await this.changeProcessor.completeWrite(notePath, stats);
});
```

**Filesystem → Automerge:**
```typescript
// When file changes externally, update Automerge doc
async function onExternalFileChange(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = parseNoteContent(content);
  const noteId = parsed.metadata.id;

  const handle = this.repo.find<FlintNote>(noteId);
  handle.change(doc => {
    doc.metadata = parsed.metadata;
    doc.content = new Automerge.Text(parsed.content);
  });
}
```

**Deliverable:** Changes in either direction propagate correctly

#### 4. **Update Note Operations to Use Automerge**

Modify `NoteManager` to work with Automerge:

```typescript
async createNote(
  typeName: string,
  title: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<NoteInfo> {
  // Generate ID
  const noteId = this.generateNoteId();

  // Create Automerge document
  const handle = this.automergeManager.repo.create<FlintNote>();
  handle.change(doc => {
    doc.id = noteId;
    doc.metadata = {
      title,
      filename: this.generateFilename(title).replace('.md', ''),
      type: typeName,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
      ...metadata
    };
    doc.content = new Automerge.Text(content);
    doc.deleted = false;
  });

  // Automerge change handler will write to filesystem
  // Filesystem change will trigger database rebuild

  return {
    id: noteId,
    type: typeName,
    title,
    filename: doc.metadata.filename,
    path: this.getNotePath(noteId),
    created: doc.metadata.created
  };
}

async updateNote(
  identifier: string,
  newContent: string,
  contentHash: string
): Promise<UpdateResult> {
  const handle = this.automergeManager.repo.find<FlintNote>(identifier);
  await handle.whenReady();

  // Validate content hash (optimistic locking)
  const currentContent = handle.doc.content.toString();
  if (generateContentHash(currentContent) !== contentHash) {
    throw new ContentHashMismatchError();
  }

  // Update Automerge document
  handle.change(doc => {
    doc.content = new Automerge.Text(newContent);
    doc.metadata.updated = new Date().toISOString();
  });

  return {
    id: identifier,
    updated: true,
    timestamp: handle.doc.metadata.updated
  };
}
```

**Deliverable:** All CRUD operations work via Automerge

#### 5. **Database Rebuild from Automerge**

Database becomes fully derived from Automerge documents:

```typescript
async rebuildDatabaseFromAutomerge(): Promise<void> {
  // Clear existing data
  await this.hybridSearchManager.rebuild();

  // Get all Automerge documents
  const handles = this.automergeManager.repo.handles;

  for (const [docId, handle] of handles) {
    await handle.whenReady();
    const doc = handle.doc as FlintNote;

    // Skip deleted notes
    if (doc.deleted) continue;

    // Insert into database
    await this.hybridSearchManager.upsertNote(
      doc.id,
      doc.metadata.title,
      doc.content.toString(),
      doc.metadata.type,
      `${doc.metadata.filename}.md`,
      this.getNotePath(doc.id),
      doc.metadata
    );

    // Rebuild link graph
    await this.updateLinkGraph(doc.id, doc.content.toString());
  }
}
```

**Deliverable:** Database fully rebuildable from Automerge

### Testing
- Create, edit, delete notes via Flint
- Edit files externally (changes propagate through Automerge)
- Rebuild database - verify consistency
- Verify no data loss in round-trip (file → Automerge → file)
- Check performance with 1000+ notes

### Acceptance Criteria
- ✅ All note operations work via Automerge
- ✅ Database can be fully rebuilt from Automerge docs
- ✅ External edits flow through Automerge layer
- ✅ No performance regression vs current filesystem approach
- ✅ Data consistency maintained at all times

---

## Phase 2: Encryption + R2 Backup (3-4 weeks)

**Goal:** Add encrypted cloud backup to R2 (single-device sync).

### Tasks

#### 1. **Setup Flint Sync Backend Service**

The Flint Sync Service is a lightweight backend that:
- Verifies AT Protocol DID tokens
- Issues scoped, temporary R2 credentials per user
- Enforces storage quotas and rate limits
- Provides monitoring and abuse prevention

```typescript
// Cloudflare Worker for Flint Sync API
interface SyncCredentialsRequest {
  did: string;           // User's AT Protocol DID
  dpopToken: string;     // DPoP-bound access token from AT Protocol OAuth
}

interface SyncCredentialsResponse {
  r2Credentials: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    sessionToken: string;     // Temporary token
    expiration: string;       // ISO timestamp
  };
  storageQuota: {
    used: number;              // Bytes used
    limit: number;             // Bytes allowed
  };
}

// Cloudflare Worker endpoint
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { did, dpopToken } = await request.json();

    // Verify AT Protocol DPoP token
    const verified = await verifyATProtocolToken(dpopToken, did);
    if (!verified) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Generate scoped R2 credentials for this DID
    // Uses Cloudflare's R2 temporary access tokens
    const credentials = await generateScopedR2Credentials(did, env);

    // Check storage quota
    const quota = await getStorageQuota(did, env);

    return new Response(JSON.stringify({
      r2Credentials: credentials,
      storageQuota: quota
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function generateScopedR2Credentials(did: string, env: Env) {
  // Use Cloudflare R2's temporary token API
  // Scope credentials to only allow access to /{did}/* prefix
  const token = await env.R2_BUCKET.createTemporaryAccessToken({
    prefix: `${did}/`,
    permissions: ['read', 'write', 'delete'],
    expiresIn: 3600 // 1 hour
  });

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: token.accessKeyId,
    secretAccessKey: token.secretAccessKey,
    bucketName: env.R2_BUCKET_NAME,
    sessionToken: token.sessionToken,
    expiration: new Date(Date.now() + 3600000).toISOString()
  };
}

async function verifyATProtocolToken(dpopToken: string, did: string): Promise<boolean> {
  // Verify DPoP token with AT Protocol PDS
  // 1. Parse JWT from DPoP token
  // 2. Verify signature using DID document's public key
  // 3. Check token expiration and scope
  // 4. Verify token is bound to correct DID

  // Implementation uses @atproto/oauth-client or similar
  return true; // Simplified for example
}

async function getStorageQuota(did: string, env: Env): Promise<{ used: number; limit: number }> {
  // Query R2 for storage usage under /{did}/ prefix
  // Or maintain usage tracking in Cloudflare KV/D1
  return {
    used: 0,
    limit: 1024 * 1024 * 1024 // 1GB default
  };
}
```

**Deliverable:** Flint Sync Service deployed to Cloudflare Workers

#### 2. **Setup R2 Client in Electron App**

```bash
npm install @aws-sdk/client-s3 @atproto/oauth-client-node
```

```typescript
import { S3Client } from '@aws-sdk/client-s3';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  bucketName: string;
  expiration: string;
}

class R2Manager {
  private client?: S3Client;
  private config?: R2Config;
  private identityManager: IdentityManager;

  constructor(identityManager: IdentityManager) {
    this.identityManager = identityManager;
  }

  /**
   * Get R2 credentials from Flint Sync Service
   */
  async initialize(): Promise<void> {
    const did = this.identityManager.getDID();
    if (!did) {
      throw new Error('Must sign in with AT Protocol to enable sync');
    }

    const dpopToken = await this.identityManager.getDPoPToken();

    // Request scoped R2 credentials from Flint Sync Service
    const response = await fetch('https://sync.flint.app/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DPoP': dpopToken
      },
      body: JSON.stringify({ did })
    });

    if (!response.ok) {
      throw new Error('Failed to obtain sync credentials');
    }

    const { r2Credentials, storageQuota } = await response.json();
    this.config = r2Credentials;

    // Initialize S3 client with temporary credentials
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2Credentials.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Credentials.accessKeyId,
        secretAccessKey: r2Credentials.secretAccessKey,
        sessionToken: r2Credentials.sessionToken
      }
    });

    // Schedule credential refresh before expiration
    this.scheduleCredentialRefresh(r2Credentials.expiration);
  }

  private scheduleCredentialRefresh(expiration: string): void {
    const expiresAt = new Date(expiration).getTime();
    const now = Date.now();
    const refreshIn = expiresAt - now - 5 * 60 * 1000; // Refresh 5 minutes early

    setTimeout(async () => {
      await this.initialize(); // Re-fetch credentials
    }, refreshIn);
  }

  getClient(): S3Client {
    if (!this.client) {
      throw new Error('R2 not initialized');
    }
    return this.client;
  }

  getConfig(): R2Config {
    if (!this.config) {
      throw new Error('R2 not initialized');
    }
    return this.config;
  }
}
```

**Deliverable:** R2 client configured with scoped, temporary credentials from Flint Sync Service

#### 3. **Implement Encryption Layer (Hybrid Approach)**

**Design Philosophy:**
- **Default:** Passwordless (device keychain + biometric unlock)
- **Optional:** Password backup for easier multi-device setup
- **Zero-knowledge:** Flint never sees vault keys in plaintext

**Vault Identity Structure:**
```typescript
interface VaultIdentity {
  vaultId: string;              // Stable UUID for this vault
  vaultSalt: number[];          // Random salt for key derivation (when using password)
  created: string;              // ISO timestamp
  did: string;                  // AT Protocol DID (required)
  devices: DeviceInfo[];        // Authorized devices
  hasPasswordBackup: boolean;   // Whether password backup is enabled
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;           // e.g., "Alice's MacBook Pro"
  publicKey: JsonWebKey;        // For device-to-device key sharing
  added: string;                // ISO timestamp
  lastSeen?: string;
}
```

**Implementation:**

```typescript
import { webcrypto as crypto } from 'crypto';
import { safeStorage } from 'electron';

class EncryptionService {
  private vaultKey?: CryptoKey;
  private deviceKeyPair?: CryptoKeyPair;
  private vaultId?: string;

  // ==================================================================
  // PRIMARY FLOW: Device Keychain (No Password)
  // ==================================================================

  /**
   * Initialize new vault with device keychain (passwordless)
   */
  async initializeNewVault(deviceName: string): Promise<VaultIdentity> {
    // Generate random vault key
    const vaultKeyBuffer = crypto.getRandomValues(new Uint8Array(32));
    this.vaultKey = await crypto.subtle.importKey(
      'raw',
      vaultKeyBuffer,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );

    // Generate vault identity
    this.vaultId = this.generateUUID();
    const vaultSalt = crypto.getRandomValues(new Uint8Array(32));

    // Store vault key in OS keychain (biometric-protected)
    const keychainKey = `flint-vault-${this.vaultId}`;
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(
        Buffer.from(vaultKeyBuffer).toString('base64')
      );
      // Store encrypted key in local storage
      await this.storageManager.set(keychainKey, encrypted.toString('base64'));
    } else {
      throw new Error('OS keychain encryption not available');
    }

    // Generate device key pair for device-to-device authorization
    this.deviceKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );

    const deviceId = this.generateUUID();
    const publicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      this.deviceKeyPair.publicKey
    );

    // Create vault identity
    const vaultIdentity: VaultIdentity = {
      vaultId: this.vaultId,
      vaultSalt: Array.from(vaultSalt),
      created: new Date().toISOString(),
      devices: [{
        deviceId,
        deviceName,
        publicKey: publicKeyJwk,
        added: new Date().toISOString()
      }],
      hasPasswordBackup: false
    };

    // Store device info locally
    await this.storageManager.set('device-id', deviceId);
    const privateKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      this.deviceKeyPair.privateKey
    );
    await this.storageManager.set('device-private-key', privateKeyJwk);

    return vaultIdentity;
  }

  /**
   * Load vault key from OS keychain
   */
  async loadFromKeychain(vaultId: string): Promise<void> {
    this.vaultId = vaultId;
    const keychainKey = `flint-vault-${vaultId}`;

    const encryptedBase64 = await this.storageManager.get(keychainKey);
    if (!encryptedBase64) {
      throw new Error('Vault key not found in keychain');
    }

    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decrypted = safeStorage.decryptString(encrypted);
    const vaultKeyBuffer = Buffer.from(decrypted, 'base64');

    this.vaultKey = await crypto.subtle.importKey(
      'raw',
      vaultKeyBuffer,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );

    // Load device key pair
    const privateKeyJwk = await this.storageManager.get('device-private-key');
    if (privateKeyJwk) {
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey']
      );

      // Reconstruct key pair (we don't need to store public key locally)
      this.deviceKeyPair = { privateKey } as CryptoKeyPair;
    }
  }

  // ==================================================================
  // DEVICE AUTHORIZATION FLOW
  // ==================================================================

  /**
   * Request authorization from existing device
   */
  async requestDeviceAuthorization(deviceName: string): Promise<string> {
    // Generate ephemeral device key pair
    this.deviceKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );

    const deviceId = this.generateUUID();
    const publicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      this.deviceKeyPair.publicKey
    );

    const authRequest = {
      deviceId,
      deviceName,
      publicKey: publicKeyJwk,
      timestamp: new Date().toISOString()
    };

    // Store locally
    await this.storageManager.set('device-id', deviceId);
    const privateKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      this.deviceKeyPair.privateKey
    );
    await this.storageManager.set('device-private-key', privateKeyJwk);

    // Generate short authorization code
    const authCode = await this.generateAuthCode(authRequest);

    return authCode;
  }

  /**
   * Approve new device (called on existing device)
   */
  async approveDevice(
    authRequest: DeviceAuthRequest,
    vaultIdentity: VaultIdentity
  ): Promise<DeviceKey> {
    if (!this.vaultKey || !this.deviceKeyPair) {
      throw new Error('Vault not initialized');
    }

    // Import new device's public key
    const newDevicePublicKey = await crypto.subtle.importKey(
      'jwk',
      authRequest.publicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: newDevicePublicKey },
      this.deviceKeyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'wrapKey']
    );

    // Wrap vault key with shared secret
    const wrappedKey = await crypto.subtle.wrapKey(
      'raw',
      this.vaultKey,
      sharedSecret,
      { name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }
    );

    const currentDeviceId = await this.storageManager.get('device-id');
    const authorizerPublicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      this.deviceKeyPair.publicKey
    );

    return {
      deviceId: authRequest.deviceId,
      wrappedKey: Array.from(new Uint8Array(wrappedKey)),
      authorizerDeviceId: currentDeviceId,
      authorizerPublicKey: authorizerPublicKeyJwk,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Complete device authorization (called on new device)
   */
  async completeDeviceAuthorization(
    deviceKey: DeviceKey,
    vaultId: string
  ): Promise<void> {
    if (!this.deviceKeyPair) {
      throw new Error('Device keys not initialized');
    }

    // Import authorizer's public key
    const authorizerPublicKey = await crypto.subtle.importKey(
      'jwk',
      deviceKey.authorizerPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    // Derive same shared secret
    const sharedSecret = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: authorizerPublicKey },
      this.deviceKeyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt', 'unwrapKey']
    );

    // Unwrap vault key
    const wrappedKeyBuffer = new Uint8Array(deviceKey.wrappedKey);
    this.vaultKey = await crypto.subtle.unwrapKey(
      'raw',
      wrappedKeyBuffer,
      sharedSecret,
      { name: 'AES-GCM', iv: wrappedKeyBuffer.slice(0, 12) },
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );

    // Store in OS keychain
    const vaultKeyBuffer = await crypto.subtle.exportKey('raw', this.vaultKey);
    const keychainKey = `flint-vault-${vaultId}`;

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(
        Buffer.from(vaultKeyBuffer).toString('base64')
      );
      await this.storageManager.set(keychainKey, encrypted.toString('base64'));
    }

    this.vaultId = vaultId;
  }

  // ==================================================================
  // OPTIONAL: PASSWORD BACKUP
  // ==================================================================

  /**
   * Enable password backup (optional feature)
   */
  async enablePasswordBackup(password: string): Promise<Uint8Array> {
    if (!this.vaultKey || !this.vaultId) {
      throw new Error('Vault not initialized');
    }

    // Export vault key
    const vaultKeyBuffer = await crypto.subtle.exportKey('raw', this.vaultKey);

    // Generate random salt for password derivation
    const salt = crypto.getRandomValues(new Uint8Array(32));

    // Derive password key
    const passwordKey = await this.derivePasswordKey(password, salt);

    // Encrypt vault key with password
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedVaultKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      passwordKey,
      vaultKeyBuffer
    );

    // Concatenate: salt || iv || ciphertext
    const backup = new Uint8Array(32 + 12 + encryptedVaultKey.byteLength);
    backup.set(salt, 0);
    backup.set(iv, 32);
    backup.set(new Uint8Array(encryptedVaultKey), 44);

    return backup;
  }

  /**
   * Initialize vault from password backup
   */
  async initializeFromPasswordBackup(
    password: string,
    encryptedBackup: Uint8Array,
    vaultId: string
  ): Promise<void> {
    // Extract components
    const salt = encryptedBackup.slice(0, 32);
    const iv = encryptedBackup.slice(32, 44);
    const ciphertext = encryptedBackup.slice(44);

    // Derive password key
    const passwordKey = await this.derivePasswordKey(password, salt);

    // Decrypt vault key
    try {
      const vaultKeyBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        passwordKey,
        ciphertext
      );

      // Import vault key
      this.vaultKey = await crypto.subtle.importKey(
        'raw',
        vaultKeyBuffer,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );

      // Store in OS keychain
      const keychainKey = `flint-vault-${vaultId}`;
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(
          Buffer.from(vaultKeyBuffer).toString('base64')
        );
        await this.storageManager.set(keychainKey, encrypted.toString('base64'));
      }

      this.vaultId = vaultId;
    } catch (error) {
      throw new Error('Incorrect password or corrupted backup');
    }
  }

  /**
   * Derive encryption key from password using scrypt
   */
  private async derivePasswordKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const { scrypt } = await import('crypto');
    const { promisify } = await import('util');
    const scryptAsync = promisify(scrypt);

    const keyMaterial = await scryptAsync(
      password,
      salt,
      32, // 256-bit key
      { N: 32768, r: 8, p: 1 }
    ) as Buffer;

    return await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ==================================================================
  // ENCRYPTION/DECRYPTION
  // ==================================================================

  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    if (!this.vaultKey) {
      throw new Error('Vault key not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.vaultKey,
      plaintext
    );

    // Concatenate: IV || ciphertext (includes auth tag)
    const encrypted = new Uint8Array(12 + ciphertext.byteLength);
    encrypted.set(iv, 0);
    encrypted.set(new Uint8Array(ciphertext), 12);

    return encrypted;
  }

  async decrypt(encrypted: Uint8Array): Promise<Uint8Array> {
    if (!this.vaultKey) {
      throw new Error('Vault key not initialized');
    }

    const iv = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.vaultKey,
      ciphertext
    );

    return new Uint8Array(plaintext);
  }

  // ==================================================================
  // UTILITIES
  // ==================================================================

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  private async generateAuthCode(authRequest: DeviceAuthRequest): string {
    // Generate short code (6 characters) for easy entry or QR code
    const json = JSON.stringify(authRequest);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    const base64 = Buffer.from(hash).toString('base64url');
    return base64.substring(0, 6).toUpperCase();
  }
}

// Supporting types
interface DeviceAuthRequest {
  deviceId: string;
  deviceName: string;
  publicKey: JsonWebKey;
  timestamp: string;
}

interface DeviceKey {
  deviceId: string;
  wrappedKey: number[];
  authorizerDeviceId: string;
  authorizerPublicKey: JsonWebKey;
  timestamp: string;
}
```

**Deliverable:** Hybrid encryption service with passwordless default and optional password backup

#### 4. **Add AT Protocol Identity (Required)**

Integrate AT Protocol OAuth for user authentication and authorization:

```bash
npm install @atproto/oauth-client-node
```

```typescript
import { NodeOAuthClient } from '@atproto/oauth-client-node';

class IdentityManager {
  private oauthClient?: NodeOAuthClient;
  private did?: string;

  async initializeATProtocol(): Promise<void> {
    this.oauthClient = await NodeOAuthClient.create({
      clientMetadata: {
        client_id: 'https://flint.yourapp.com/client-metadata.json',
        client_name: 'Flint',
        redirect_uris: ['http://localhost:3000/oauth/callback'],
        scope: 'atproto',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        application_type: 'native',
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true
      },
      stateStore: new NodeFileSystemStore('./oauth-state'),
      sessionStore: new NodeFileSystemStore('./oauth-sessions')
    });
  }

  async login(handle: string): Promise<string> {
    if (!this.oauthClient) {
      throw new Error('AT Protocol not initialized');
    }

    const authUrl = await this.oauthClient.authorize(handle, {
      scope: 'atproto'
    });

    // Open browser for OAuth flow
    // ... (handle callback)

    const session = await this.oauthClient.callback(callbackParams);
    this.did = session.sub; // e.g., "did:plc:abc123xyz"

    // Store session tokens securely in OS keychain
    await this.storeSession(session);

    return this.did;
  }

  getDID(): string | undefined {
    return this.did;
  }

  async getDPoPToken(): Promise<string> {
    if (!this.oauthClient || !this.did) {
      throw new Error('Not logged in');
    }

    // Get DPoP-bound access token for Flint Sync API
    const token = await this.oauthClient.getDPoPToken({
      audience: 'https://sync.flint.app',
      scope: 'atproto'
    });

    return token;
  }

  private async storeSession(session: OAuthSession): Promise<void> {
    // Store refresh token in OS keychain
    const sessionData = JSON.stringify({
      did: session.sub,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt
    });

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(sessionData);
      await storageManager.set('atproto-session', encrypted.toString('base64'));
    }
  }

  async restoreSession(): Promise<boolean> {
    const encryptedSession = await storageManager.get('atproto-session');
    if (!encryptedSession) return false;

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encryptedSession, 'base64'));
      const session = JSON.parse(decrypted);

      // Restore session with OAuth client
      await this.oauthClient.restoreSession(session);
      this.did = session.did;

      return true;
    } catch (error) {
      console.error('Failed to restore AT Protocol session:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.oauthClient) {
      await this.oauthClient.revoke();
    }

    this.did = undefined;
    await storageManager.remove('atproto-session');
  }
}
```

**Deliverable:** AT Protocol OAuth login with DPoP token support for Flint Sync API

#### 5. **Implement R2 Storage Adapter**

```typescript
import { StorageAdapter } from '@automerge/automerge-repo';
import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

class EncryptedR2StorageAdapter implements StorageAdapter {
  private r2: R2Manager;
  private encryption: EncryptionService;
  private identityManager: IdentityManager;

  constructor(r2: R2Manager, encryption: EncryptionService, identityManager: IdentityManager) {
    this.r2 = r2;
    this.encryption = encryption;
    this.identityManager = identityManager;
  }

  async save(documentId: string, binary: Uint8Array): Promise<void> {
    // Encrypt the Automerge binary
    const encrypted = await this.encryption.encrypt(binary);

    // Get DID for storage path
    const did = this.identityManager.getDID();
    if (!did) {
      throw new Error('Must be signed in to sync');
    }

    // Upload to R2 under /{did}/ prefix
    const key = `${did}/documents/${documentId}.automerge`;
    await this.r2.client.send(new PutObjectCommand({
      Bucket: this.r2.config.bucketName,
      Key: key,
      Body: encrypted,
      ContentType: 'application/octet-stream',
      Metadata: {
        timestamp: new Date().toISOString(),
        version: '1'
      }
    }));
  }

  async load(documentId: string): Promise<Uint8Array | undefined> {
    try {
      const did = this.identityManager.getDID();
      if (!did) {
        throw new Error('Must be signed in to sync');
      }

      const key = `${did}/documents/${documentId}.automerge`;

      // Download from R2
      const response = await this.r2.getClient().send(new GetObjectCommand({
        Bucket: this.r2.getConfig().bucketName,
        Key: key
      }));

      if (!response.Body) return undefined;

      // Read stream to buffer
      const encrypted = await streamToBuffer(response.Body);

      // Decrypt
      const decrypted = await this.encryption.decrypt(encrypted);

      return decrypted;
    } catch (error) {
      if (error.name === 'NoSuchKey') return undefined;
      throw error;
    }
  }

  async remove(documentId: string): Promise<void> {
    const did = this.identityManager.getDID();
    if (!did) {
      throw new Error('Must be signed in to sync');
    }

    const key = `${did}/documents/${documentId}.automerge`;
    await this.r2.getClient().send(new DeleteObjectCommand({
      Bucket: this.r2.getConfig().bucketName,
      Key: key
    }));
  }

  async loadRange(keyPrefix: string[]): Promise<Uint8Array[]> {
    const did = this.identityManager.getDID();
    if (!did) {
      throw new Error('Must be signed in to sync');
    }

    const prefix = `${did}/documents/`;
    const response = await this.r2.getClient().send(new ListObjectsV2Command({
      Bucket: this.r2.getConfig().bucketName,
      Prefix: prefix
    }));

    const documents: Uint8Array[] = [];

    for (const obj of response.Contents || []) {
      if (obj.Key) {
        const docId = obj.Key.replace(prefix, '').replace('.automerge', '');
        const doc = await this.load(docId);
        if (doc) documents.push(doc);
      }
    }

    return documents;
  }
}
```

**Deliverable:** Encrypted Automerge storage adapter for R2

#### 6. **Add Sync UI**

**First-Time Setup UI:**

User must sign in with AT Protocol before enabling sync.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let isSignedIn = $state(false);
  let did = $state<string | null>(null);
  let syncEnabled = $state(false);
  let setupMode = $state<'new' | 'existing' | null>(null);
  let joinMethod = $state<'device' | 'password' | null>(null);
  let authCode = $state<string>('');
  let deviceName = $state('');
  let lastSyncTime = $state<Date | null>(null);
  let syncInProgress = $state(false);
  let hasPasswordBackup = $state(false);
  let atHandle = $state('');

  onMount(async () => {
    // Check if already signed in with AT Protocol
    const atStatus = await window.api.getATProtocolStatus();
    isSignedIn = atStatus.isSignedIn;
    did = atStatus.did;

    if (isSignedIn) {
      const status = await window.api.getSyncStatus();
      syncEnabled = status.enabled;
      hasPasswordBackup = status.hasPasswordBackup;
      lastSyncTime = status.lastSyncTime;

      if (!syncEnabled) {
        deviceName = await window.api.getDeviceName(); // e.g., "Alice's MacBook Pro"
      }
    }
  });

  async function signInWithATProtocol() {
    try {
      did = await window.api.loginWithATProtocol(atHandle);
      isSignedIn = true;
    } catch (error) {
      console.error('Failed to sign in with AT Protocol:', error);
      // Show error to user
    }
  }

  async function startNewVault() {
    setupMode = 'new';
  }

  async function joinExistingVault() {
    setupMode = 'existing';
  }

  async function enableSyncPasswordless() {
    try {
      // Create new vault with device keychain
      // DID is automatically included from identity manager
      await window.api.initializeNewVault(deviceName);
      syncEnabled = true;
      setupMode = null;
    } catch (error) {
      console.error('Failed to enable sync:', error);
      // Show error to user
    }
  }

  async function requestDeviceAuth() {
    try {
      joinMethod = 'device';
      // Request authorization from existing device
      authCode = await window.api.requestDeviceAuthorization(deviceName);

      // Start polling for approval
      pollForApproval();
    } catch (error) {
      console.error('Device authorization failed:', error);
    }
  }

  async function pollForApproval() {
    const result = await window.api.waitForDeviceApproval();
    if (result.approved) {
      syncEnabled = true;
      setupMode = null;
      joinMethod = null;
    }
  }

  async function joinWithPassword() {
    joinMethod = 'password';
  }

  async function submitPassword() {
    const password = (document.getElementById('password-input') as HTMLInputElement).value;

    try {
      await window.api.joinVaultWithPassword(password);
      syncEnabled = true;
      setupMode = null;
      joinMethod = null;
    } catch (error) {
      console.error('Password authentication failed:', error);
      // Show error to user
    }
  }

  async function enablePasswordBackup() {
    const password = (document.getElementById('backup-password') as HTMLInputElement).value;

    try {
      await window.api.enablePasswordBackup(password);
      hasPasswordBackup = true;
    } catch (error) {
      console.error('Failed to enable password backup:', error);
    }
  }

  async function manualSync() {
    syncInProgress = true;
    try {
      await window.api.performSync();
      lastSyncTime = new Date();
    } finally {
      syncInProgress = false;
    }
  }
</script>

<div class="sync-settings">
  {#if !isSignedIn}
    <!-- Sign in with AT Protocol required -->
    <div class="signin-required">
      <h3>Enable Cloud Sync</h3>
      <p>Sign in with AT Protocol to sync your notes across multiple devices with end-to-end encryption.</p>

      <div class="at-signin">
        <label for="at-handle">AT Protocol Handle</label>
        <input
          id="at-handle"
          type="text"
          bind:value={atHandle}
          placeholder="alice.bsky.social"
        />
        <p class="hint">Your Bluesky or other AT Protocol handle</p>
      </div>

      <button onclick={signInWithATProtocol} class="primary">
        Sign In with AT Protocol
      </button>

      <div class="info-box">
        <h4>Why AT Protocol?</h4>
        <p>AT Protocol provides decentralized identity for secure, portable access to your encrypted notes. Your vault encryption key is separate and never shared with AT Protocol or Flint.</p>
      </div>
    </div>

  {:else if !syncEnabled}
    {#if !setupMode}
      <!-- Initial choice -->
      <div class="setup-choice">
        <h3>Enable Cloud Sync</h3>
        <p>Signed in as: <strong>{did}</strong></p>
        <p>Sync your notes across multiple devices with end-to-end encryption.</p>

        <button onclick={startNewVault} class="primary">
          Set Up New Vault
        </button>

        <button onclick={joinExistingVault} class="secondary">
          I Already Have a Vault
        </button>
      </div>

    {:else if setupMode === 'new'}
      <!-- New vault setup (passwordless) -->
      <div class="setup-new">
        <h3>Set Up Cloud Sync</h3>

        <div class="device-info">
          <label for="device-name">Device Name</label>
          <input
            id="device-name"
            type="text"
            bind:value={deviceName}
            placeholder="My MacBook Pro"
          />
          <p class="hint">This helps you identify devices in your vault.</p>
        </div>

        <div class="security-notice">
          <h4>🔒 Security Notice</h4>
          <ul>
            <li>Your vault key will be stored securely in your device's keychain</li>
            <li>Biometric unlock (Touch ID/Windows Hello) protects access</li>
            <li>To add more devices, you'll authorize them from this device</li>
            <li>Optionally add a password backup for easier device setup</li>
          </ul>
        </div>

        <button onclick={enableSyncPasswordless} class="primary">
          Enable Sync
        </button>
        <button onclick={() => setupMode = null} class="secondary">
          Cancel
        </button>
      </div>

    {:else if setupMode === 'existing'}
      <!-- Join existing vault -->
      <div class="setup-join">
        <h3>Join Existing Vault</h3>
        <p>How would you like to connect?</p>

        {#if !joinMethod}
          <button onclick={requestDeviceAuth} class="primary">
            Authorize from Another Device
          </button>

          <button onclick={joinWithPassword} class="secondary">
            Use Password (if you set one)
          </button>

          <button onclick={() => setupMode = null} class="tertiary">
            Back
          </button>

        {:else if joinMethod === 'device'}
          <div class="device-auth">
            <h4>Authorize from Another Device</h4>
            <p>On your other device, go to Settings → Sync → Authorize Device</p>
            <p>Enter this code or scan the QR code:</p>

            <div class="auth-code">
              {authCode}
            </div>

            <!-- QR code would go here -->
            <canvas id="qr-code"></canvas>

            <div class="waiting">
              <span class="spinner"></span>
              Waiting for authorization...
            </div>

            <button onclick={() => { joinMethod = null; }} class="secondary">
              Cancel
            </button>
          </div>

        {:else if joinMethod === 'password'}
          <div class="password-auth">
            <h4>Enter Vault Password</h4>
            <p>Enter the password you created for this vault:</p>

            <input
              id="password-input"
              type="password"
              placeholder="Vault password"
              autocomplete="off"
            />

            <button onclick={submitPassword} class="primary">
              Join Vault
            </button>

            <button onclick={() => { joinMethod = null; }} class="secondary">
              Back
            </button>
          </div>
        {/if}
      </div>
    {/if}

  {:else}
    <!-- Sync enabled - show status and options -->
    <div class="sync-status">
      <h3>Cloud Sync</h3>

      <div class="status-indicator">
        <span class="status-dot" class:synced={!syncInProgress}></span>
        {#if syncInProgress}
          <span>Syncing...</span>
        {:else}
          <span>Synced</span>
        {/if}
      </div>

      {#if lastSyncTime}
        <p class="last-sync">Last sync: {lastSyncTime.toLocaleString()}</p>
      {/if}

      <button onclick={manualSync} disabled={syncInProgress}>
        Sync Now
      </button>

      {#if !hasPasswordBackup}
        <div class="password-backup-prompt">
          <h4>Optional: Add Password Backup</h4>
          <p>Set a password to make adding new devices easier.</p>

          <input
            id="backup-password"
            type="password"
            placeholder="Create backup password"
          />

          <button onclick={enablePasswordBackup} class="secondary">
            Enable Password Backup
          </button>
        </div>
      {:else}
        <p class="backup-enabled">✓ Password backup enabled</p>
      {/if}

      <div class="manage-devices">
        <h4>Devices</h4>
        <!-- List of authorized devices would go here -->
        <button onclick={() => window.api.showDeviceManagement()}>
          Manage Devices
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .sync-settings {
    max-width: 600px;
    margin: 0 auto;
  }

  .auth-code {
    font-size: 32px;
    font-weight: bold;
    letter-spacing: 0.2em;
    text-align: center;
    padding: 20px;
    background: var(--surface);
    border-radius: 8px;
    margin: 20px 0;
  }

  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--warning);
    margin-right: 8px;
  }

  .status-dot.synced {
    background: var(--success);
  }

  .security-notice {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
  }

  .security-notice ul {
    margin: 8px 0 0 20px;
  }

  .info-box {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
  }

  .at-signin {
    margin: 20px 0;
  }
</style>
```

**Deliverable:** Complete sync UI with AT Protocol sign-in required

#### 7. **Periodic Background Sync**

```typescript
class SyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 60000; // 1 minute

  startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      await this.performSync();
    }, this.SYNC_INTERVAL_MS);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync(): Promise<void> {
    try {
      console.log('Sync started:', new Date().toISOString());

      // Automerge-repo handles sync automatically via storage adapters
      // This method triggers an explicit sync cycle
      await this.automergeManager.repo.networkSubsystem.sync();

      console.log('Sync completed:', new Date().toISOString());
    } catch (error) {
      console.error('Sync failed:', error);
      this.emit('sync-failed', error);
    }
  }
}
```

**Deliverable:** Background sync every minute

### Testing
- Deploy Flint Sync Service to Cloudflare Workers
- Sign in with test AT Protocol account
- Enable sync on Device A
- Create note on Device A, verify uploads to R2
- Sign in with same AT Protocol account on Device B
- Download encrypted vault from R2 on Device B
- Verify encryption (R2 content is unreadable without vault key)
- Test DPoP token verification
- Test scoped R2 credentials (can only access own DID prefix)
- Verify local-only mode still works (no sync without AT Protocol sign-in)

### Acceptance Criteria
- ✅ AT Protocol OAuth login works with DPoP tokens
- ✅ Flint Sync Service verifies DID and issues scoped R2 credentials
- ✅ Notes encrypted and uploaded to R2 under /{did}/ prefix
- ✅ New device can download and decrypt vault after AT Protocol sign-in
- ✅ Storage quotas enforced per DID
- ✅ Local-only mode unchanged (sync disabled without AT Protocol)
- ✅ No plaintext data in R2
- ✅ Users cannot access other users' data (scoped credentials)

---

## Phase 3: Multi-Device Sync (4-5 weeks)

**Goal:** Real multi-device sync with automatic conflict resolution.

### Tasks

#### 1. **Add Network Adapter to Automerge**

```typescript
// Initialize with R2 network adapter
this.repo = new Repo({
  storage: new IndexedDBStorageAdapter(`flint-${vaultPath}`),

  // Add R2 adapter for sync
  network: [
    new EncryptedR2StorageAdapter(
      this.r2Manager,
      this.encryption,
      this.identityManager
    )
  ],

  sharePolicy: async () => false
});
```

**Deliverable:** Automerge syncing via R2

#### 2. **Conflict Detection and Notification**

While Automerge handles conflicts automatically, notify users when concurrent edits occur:

```typescript
class ConflictDetector {
  detectConcurrentEdits(doc: FlintNote): boolean {
    // Check if document has multiple heads (divergent histories)
    const heads = Automerge.getHeads(doc);
    return heads.length > 1;
  }

  async notifyUserOfMerge(noteId: string, noteTitle: string): Promise<void> {
    // Show non-intrusive notification
    this.ui.showToast({
      type: 'info',
      message: `Note "${noteTitle}" was edited on multiple devices and merged automatically.`,
      duration: 5000
    });
  }
}
```

**Deliverable:** User awareness of concurrent edits

#### 3. **Sync Status Indicators**

```svelte
<script lang="ts">
  let syncStatus = $state<'synced' | 'syncing' | 'error' | 'offline'>('synced');
  let pendingChanges = $state(0);

  $effect(() => {
    // Subscribe to sync events
    const unsubscribe = window.api.onSyncStatus((status) => {
      syncStatus = status.state;
      pendingChanges = status.pendingChanges;
    });

    return unsubscribe;
  });
</script>

<div class="sync-indicator" class:syncing={syncStatus === 'syncing'}>
  {#if syncStatus === 'synced'}
    <Icon name="check-circle" />
    <span>Synced</span>
  {:else if syncStatus === 'syncing'}
    <Icon name="refresh" class="spin" />
    <span>Syncing {pendingChanges} changes...</span>
  {:else if syncStatus === 'error'}
    <Icon name="alert-triangle" />
    <span>Sync error</span>
  {:else if syncStatus === 'offline'}
    <Icon name="wifi-off" />
    <span>Offline</span>
  {/if}
</div>
```

**Deliverable:** Real-time sync status in UI

#### 4. **Handle Deletion Conflicts**

```typescript
async function handleDeletionConflict(noteId: string): Promise<void> {
  const handle = this.automergeManager.repo.find<FlintNote>(noteId);
  await handle.whenReady();

  const doc = handle.doc;

  // If note was deleted remotely but has local edits
  if (doc.deleted && this.hasLocalEdits(noteId)) {
    // Ask user what to do
    const action = await this.ui.showDialog({
      title: 'Note Deleted Remotely',
      message: `The note "${doc.metadata.title}" was deleted on another device, but you have local changes. What would you like to do?`,
      buttons: [
        { label: 'Keep Local Changes', value: 'keep' },
        { label: 'Discard Local Changes', value: 'discard' }
      ]
    });

    if (action === 'keep') {
      // Undelete the note
      handle.change(doc => {
        doc.deleted = false;
        doc.metadata.updated = new Date().toISOString();
      });
    } else {
      // Delete local file
      await fs.unlink(this.getNotePath(noteId));
    }
  }
}
```

**Deliverable:** Deletion conflict resolution

#### 5. **Testing Concurrent Edits**

Create test scenarios:

```typescript
describe('Concurrent Edit Scenarios', () => {
  it('should merge concurrent content edits', async () => {
    // Device A: Edit note content
    await deviceA.updateNote(noteId, 'Content from A', contentHash);

    // Device B: Edit same note content (different section)
    await deviceB.updateNote(noteId, 'Content from B', contentHash);

    // Sync both devices
    await deviceA.performSync();
    await deviceB.performSync();

    // Both devices should have merged content
    const noteA = await deviceA.getNote(noteId);
    const noteB = await deviceB.getNote(noteId);

    expect(noteA.content).toBe(noteB.content);
    expect(noteA.content).toContain('Content from A');
    expect(noteA.content).toContain('Content from B');
  });

  it('should handle rename conflicts', async () => {
    // Device A: Rename to "Alpha"
    await deviceA.renameNote(noteId, 'Alpha', contentHash);

    // Device B: Rename to "Beta"
    await deviceB.renameNote(noteId, 'Beta', contentHash);

    // Sync
    await deviceA.performSync();
    await deviceB.performSync();

    // One title should win (last-write-wins on metadata)
    const noteA = await deviceA.getNote(noteId);
    const noteB = await deviceB.getNote(noteId);

    expect(noteA.title).toBe(noteB.title);
    // Title is either "Alpha" or "Beta" (whichever synced last)
  });
});
```

**Deliverable:** Comprehensive multi-device test suite

### Testing
- Simulate 2-3 devices syncing simultaneously
- Edit same note on multiple devices
- Rename notes concurrently
- Delete notes with pending edits
- Test offline → online sync
- Verify eventual consistency

### Acceptance Criteria
- ✅ Concurrent edits merge automatically
- ✅ No data loss in conflict scenarios
- ✅ Sync works reliably across devices
- ✅ Offline edits sync when back online
- ✅ Users notified of concurrent edits

---

## Phase 4: Polish and Optimization (2-3 weeks)

**Goal:** Performance tuning, error handling, and UX improvements.

### Tasks

#### 1. **Optimize Sync Performance**
- Batch multiple document changes before syncing
- Implement incremental sync (only changed docs)
- Compress Automerge binaries before encryption
- Add sync progress indicators for large vaults

#### 2. **Error Handling and Recovery**
- Retry failed sync attempts with exponential backoff
- Handle network interruptions gracefully
- Detect and recover from corruption
- Provide manual conflict resolution UI (fallback)

#### 3. **Key Management**
- Store encryption key in OS keychain (Electron safeStorage)
- Allow password change (re-encrypt all documents)
- Implement key derivation with user-friendly prompts
- Add biometric unlock option (Touch ID, Windows Hello)

#### 4. **Settings and Preferences**
- Sync interval configuration
- Enable/disable sync per vault
- Bandwidth/data usage settings
- Manual sync trigger

#### 5. **Monitoring and Logging**
- Track sync success/failure rates
- Log sync duration and data transferred
- Provide debug mode for troubleshooting
- Export sync logs for support

### Acceptance Criteria
- ✅ Sync feels fast and responsive
- ✅ Errors handled gracefully with user feedback
- ✅ Encryption key management is secure
- ✅ Settings provide sufficient control
- ✅ Logging aids in debugging issues

---

## Security Considerations

### 1. **Zero-Knowledge Encryption**
- Flint never sees plaintext data or vault keys
- Vault keys stored encrypted in OS keychain (biometric-protected)
- R2 only stores encrypted blobs
- Device-to-device key sharing uses ECDH key agreement

### 2. **Key Management**

**Primary Flow (Passwordless):**
- Random 256-bit vault key generated per vault
- Stored in OS keychain using Electron `safeStorage`
  - macOS: Keychain with Touch ID/password protection
  - Windows: DPAPI with Windows Hello/password protection
  - Linux: Secret Service API / libsecret
- ECDH (P-256) key pairs for device authorization
- Vault keys wrapped with ephemeral shared secrets for device transfer

**Optional Password Backup:**
- Password derives encryption key via scrypt (N=32768, r=8, p=1)
- Random 32-byte salt stored with encrypted vault key
- Password-encrypted vault key uploaded to R2 as backup
- Only used for recovery or easier device setup

### 3. **Device Authorization Security**
- Each device has unique ECDH key pair (P-256 curve)
- New devices request authorization via short code (6 chars) or QR code
- Existing device approves and derives shared secret (ECDH)
- Vault key wrapped with shared secret, never transmitted in plaintext
- Authorization codes are single-use and expire after 15 minutes

### 4. **Biometric Protection**
- OS keychain access gated by biometric (Touch ID, Windows Hello, etc.)
- Flint never handles biometric data directly
- OS handles authentication and key unwrapping
- Fallback to device password if biometric unavailable

### 5. **Authentication (Required)**
- AT Protocol OAuth for portable identity (required for sync)
- DPoP token binding for token security
- Refresh tokens stored in OS keychain
- DID used for authorization and organizing R2 storage namespaces

### 6. **Data Privacy**

**What Flint Sync Service knows:**
- User's AT Protocol DID
- Number of documents per DID
- Storage usage per DID
- API request patterns and timestamps

**What Flint Sync Service doesn't know:**
- Content of notes (encrypted)
- Titles or metadata (encrypted)
- Vault encryption keys
- Device information
- Password backups (if enabled)

**What R2 knows:**
- Number of encrypted documents per DID
- File sizes and upload times
- Access patterns (IP addresses, request timing)
- DID associated with each storage namespace

**What R2 doesn't know:**
- Content of notes (encrypted)
- Titles or metadata (encrypted)
- Vault encryption keys
- Relationship between DIDs and real identities (unless correlated externally)

**What AT Protocol PDS knows:**
- User's DID and handle
- OAuth tokens for authentication
- That user has authorized Flint app

**What AT Protocol PDS doesn't know:**
- Note data (not stored on PDS)
- Vault encryption keys
- R2 storage details
- Whether user actually uses sync (just that they signed in)

### 7. **Threat Model**

**Protected Against:**
- ✅ R2 compromise (data encrypted)
- ✅ Flint Sync Service compromise (data encrypted, service never sees keys)
- ✅ Network eavesdropping (TLS + encrypted payloads)
- ✅ Stolen laptop (keychain encrypted by OS)
- ✅ Malicious devices (authorization required)
- ✅ Password guessing (scrypt with high N factor if using password backup)
- ✅ Unauthorized R2 access (scoped credentials per DID)
- ✅ Cross-user data access (enforced by R2 credential scoping)

**Not Protected Against:**
- ❌ Compromised device with unlocked keychain
- ❌ Malware with keychain access
- ❌ User sharing password backup with attacker
- ❌ Physical access to unlocked device
- ❌ Compromised AT Protocol DID (attacker could access encrypted data, but not decrypt without vault key)

### 8. **Key Rotation and Recovery**

**Password Change:**
- Re-encrypt vault key with new password
- Update R2 password backup
- Existing device keys unchanged

**Lost Device:**
- Revoke device from vault identity
- Remove device's public key from authorized list
- Device can no longer decrypt new data

**Lost All Devices:**
- If password backup enabled: recover with password
- If no password backup: data unrecoverable
- Prominent warnings during setup about this risk

**Compromised Password:**
- Change password immediately
- Revoke all device authorizations
- Re-authorize known devices only

---

## Cost Estimates

### Cloudflare R2 Pricing
- Storage: $0.015/GB/month
- Class A operations (write): $4.50/million
- Class B operations (read): $0.36/million
- Egress: Free

### Example User (1000 notes @ 10KB each = 10MB)
- Storage: $0.015 × 0.01 GB = **$0.00015/month**
- Writes (100 edits/day): **$0.00001/month**
- Reads (500 syncs/month): **$0.00018/month**
- **Total: ~$0.0003/user/month** (essentially free)

### Scale
- 10,000 users: ~$3/month
- 100,000 users: ~$30/month

---

## Risks and Mitigations

### Risk 1: Automerge Performance at Scale
**Mitigation:** Test with large vaults (10,000+ notes). Optimize document size. Consider splitting very large notes.

### Risk 2: Sync Conflicts Despite CRDT
**Mitigation:** Metadata (title, tags) uses last-write-wins. Content uses Automerge Text CRDT. Accept that some conflicts require user review.

### Risk 3: Encryption Key Loss
**Mitigation:**
- OS keychain provides reliable storage across device reboots
- Optional password backup enables recovery
- Prominent warnings during setup if password backup not enabled
- Device authorization allows recovering vault on new device if any authorized device still works
- Export encrypted vault key to file as manual backup option

### Risk 4: R2 Costs at Scale
**Mitigation:** Monitor usage. Implement compression. Consider alternative storage backends.

### Risk 5: AT Protocol Dependency
**Mitigation:**
- Local-only mode works without AT Protocol (no sync)
- AT Protocol is decentralized (users can choose their PDS)
- If AT Protocol ecosystem has issues, users still have local access to all notes
- Future: Consider adding alternative identity providers (OAuth, email, etc.)
- Vault encryption keys are independent of AT Protocol (can migrate if needed)

---

## Success Metrics

- ✅ 90%+ of users can set up sync without issues
- ✅ < 1% sync conflict rate requiring manual intervention
- ✅ < 5 second sync latency for typical edits
- ✅ Zero data loss incidents
- ✅ Positive user feedback on sync reliability

---

## Future Enhancements

### Web Client (Phase 5)
- Browser-based access to notes without Electron
- Same Automerge + R2 sync infrastructure
- Progressive Web App (PWA) with offline support
- See [Web Client Implementation Plan](./WEB-CLIENT-IMPLEMENTATION-PLAN.md) for details

### Real-Time Sync (Phase 6)
- WebSocket or long-polling for immediate propagation
- Live cursors for collaborative editing
- Presence indicators

### Sharing and Collaboration (Phase 7)
- Share individual notes with other DIDs
- Real-time collaborative editing
- Permission management (read/write)

### Mobile Apps (Phase 8)
- React Native implementation
- Same Automerge + R2 architecture
- Platform-specific key storage (Keychain/Keystore)

### Selective Sync (Phase 9)
- Choose which note types to sync
- Bandwidth optimization
- Mobile data usage controls

---

## Summary

This plan delivers multi-device sync in 4 focused phases:

1. **Phase 0 (2-3 weeks):** External edit handling
2. **Phase 1 (3-4 weeks):** Local Automerge integration
3. **Phase 2 (3-4 weeks):** Encrypted R2 backup
4. **Phase 3 (4-5 weeks):** Multi-device sync
5. **Phase 4 (2-3 weeks):** Polish and optimization

**Total Timeline:** 14-19 weeks (~3.5-5 months)

**Key Outcomes:**
- ✅ Conflict-free multi-device sync via Automerge CRDTs
- ✅ Zero-knowledge encryption with device keychain
- ✅ Passwordless by default (biometric unlock)
- ✅ Optional password backup for easier multi-device setup
- ✅ Device-to-device authorization with QR codes
- ✅ AT Protocol identity for secure, portable DID (required for sync)
- ✅ Flint-hosted R2 storage with scoped access per DID
- ✅ Local-first remains core experience
- ✅ Markdown files remain source of truth

**Encryption Model:**
- **Default:** Device keychain + biometric (Touch ID, Windows Hello)
- **Multi-device:** Device authorization flow (QR code or short code)
- **Optional:** Password backup for recovery and easier setup
- **Zero-knowledge:** Flint never sees vault keys or plaintext data

**Identity & Authorization Model:**
- **Identity:** AT Protocol DID (required for sync)
- **Authorization:** DPoP-bound OAuth tokens
- **Storage:** Scoped R2 credentials per DID from Flint Sync Service
- **Privacy:** Encrypted data, zero-knowledge architecture
