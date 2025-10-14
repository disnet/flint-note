# Automerge Multi-Device Sync Implementation Plan

## Executive Summary

This document outlines a phased approach to adding multi-device sync to Flint using:
- **Automerge CRDTs** for conflict-free document merging
- **Cloudflare R2** for encrypted cloud storage
- **AT Protocol** for decentralized identity (optional)

**Timeline:** 12-16 weeks across 4 phases
**Scope:** Notes only (not UI state, slash commands, or note types initially)
**Conflict Resolution:** Automatic via Automerge (no conflict UI needed)

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
- User controls encryption key
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
│              Identity Layer (AT Protocol - Optional)         │
│                                                              │
│  ┌──────────┐       ┌──────────┐       ┌──────────────┐   │
│  │   DID    │──────▶│   PDS    │◀──────│ OAuth Client │   │
│  │ Registry │       │ (User's) │       │  (Electron)  │   │
│  └──────────┘       └──────────┘       └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

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

#### 1. **Setup Cloudflare R2**
```bash
npm install @aws-sdk/client-s3
```

```typescript
import { S3Client } from '@aws-sdk/client-s3';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

class R2Manager {
  private client: S3Client;

  initialize(config: R2Config): void {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }
}
```

**Deliverable:** R2 client configured and tested

#### 2. **Implement Encryption Layer**

```typescript
import { webcrypto as crypto } from 'crypto';

class EncryptionService {
  private key: CryptoKey;

  async initialize(password: string, userIdentifier: string): Promise<void> {
    // Derive encryption key from password + user identifier (salt)
    const salt = await this.hashString(userIdentifier);
    const keyMaterial = await this.deriveKey(password, salt);

    this.key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.key,
      plaintext
    );

    // Concatenate: IV || ciphertext (includes auth tag)
    const encrypted = new Uint8Array(12 + ciphertext.byteLength);
    encrypted.set(iv, 0);
    encrypted.set(new Uint8Array(ciphertext), 12);

    return encrypted;
  }

  async decrypt(encrypted: Uint8Array): Promise<Uint8Array> {
    // Extract IV and ciphertext
    const iv = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.key,
      ciphertext
    );

    return new Uint8Array(plaintext);
  }

  private async deriveKey(password: string, salt: Uint8Array): Promise<Buffer> {
    // Use scrypt for key derivation (memory-hard, GPU-resistant)
    const { scrypt } = await import('crypto');
    const { promisify } = await import('util');
    const scryptAsync = promisify(scrypt);

    return await scryptAsync(
      password,
      salt,
      32, // 256-bit key
      { N: 32768, r: 8, p: 1 }
    ) as Buffer;
  }

  private async hashString(input: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }
}
```

**Deliverable:** Encryption service with AES-256-GCM

#### 3. **Add AT Protocol Identity (Optional)**

Allow users to optionally sign in with AT Protocol for portable identity:

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

    return this.did;
  }

  getUserIdentifier(): string {
    // Return DID if logged in, otherwise use local vault ID
    return this.did || this.generateLocalVaultId();
  }

  private generateLocalVaultId(): string {
    // Generate stable ID for local-only users
    const vaultPath = this.workspace.rootPath;
    return `local-${hashString(vaultPath)}`;
  }
}
```

**Deliverable:** Optional AT Protocol OAuth login

#### 4. **Implement R2 Storage Adapter**

```typescript
import { StorageAdapter } from '@automerge/automerge-repo';
import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

class EncryptedR2StorageAdapter implements StorageAdapter {
  private r2: R2Manager;
  private encryption: EncryptionService;
  private userIdentifier: string;

  async save(documentId: string, binary: Uint8Array): Promise<void> {
    // Encrypt the Automerge binary
    const encrypted = await this.encryption.encrypt(binary);

    // Upload to R2
    const key = `${this.userIdentifier}/documents/${documentId}.automerge`;
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
      const key = `${this.userIdentifier}/documents/${documentId}.automerge`;

      // Download from R2
      const response = await this.r2.client.send(new GetObjectCommand({
        Bucket: this.r2.config.bucketName,
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
    const key = `${this.userIdentifier}/documents/${documentId}.automerge`;
    await this.r2.client.send(new DeleteObjectCommand({
      Bucket: this.r2.config.bucketName,
      Key: key
    }));
  }

  async loadRange(keyPrefix: string[]): Promise<Uint8Array[]> {
    const prefix = `${this.userIdentifier}/documents/`;
    const response = await this.r2.client.send(new ListObjectsV2Command({
      Bucket: this.r2.config.bucketName,
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

#### 5. **Add Sync UI**

Simple UI for managing sync:

```svelte
<script lang="ts">
  let syncEnabled = $state(false);
  let lastSyncTime = $state<Date | null>(null);
  let syncInProgress = $state(false);

  async function enableSync() {
    // Prompt for password
    const password = await promptForPassword();

    // Initialize encryption
    await window.api.initializeEncryption(password);

    // Initialize R2 adapter
    await window.api.initializeR2Sync();

    syncEnabled = true;
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
  {#if !syncEnabled}
    <button onclick={enableSync}>Enable Cloud Sync</button>
  {:else}
    <div class="sync-status">
      <span>Sync enabled</span>
      {#if lastSyncTime}
        <span>Last sync: {lastSyncTime.toLocaleString()}</span>
      {/if}
      <button onclick={manualSync} disabled={syncInProgress}>
        {syncInProgress ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  {/if}
</div>
```

**Deliverable:** Basic sync settings UI

#### 6. **Periodic Background Sync**

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
- Enable sync with test R2 credentials
- Create note on Device A, verify uploads to R2
- Download on Device B (fresh vault)
- Verify encryption (R2 content is unreadable)
- Test with/without AT Protocol identity
- Verify local-only mode still works

### Acceptance Criteria
- ✅ Notes encrypted and uploaded to R2
- ✅ New device can download and decrypt vault
- ✅ AT Protocol login works (optional)
- ✅ Local-only mode unchanged
- ✅ No plaintext data in R2

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
    new EncryptedR2StorageAdapter({
      r2Manager: this.r2Manager,
      encryption: this.encryption,
      userIdentifier: this.identityManager.getUserIdentifier()
    })
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
- Flint never sees plaintext data
- Encryption key derived from user password
- R2 only stores encrypted blobs

### 2. **Key Derivation**
- Use scrypt for memory-hard key derivation
- Salt with user identifier (DID or vault ID)
- 256-bit AES-GCM encryption

### 3. **Authentication**
- AT Protocol OAuth for identity (optional)
- DPoP token binding
- Refresh tokens stored securely

### 4. **Data Privacy**
- R2 knows: number of documents, file sizes, access patterns
- R2 doesn't know: content, titles, metadata
- AT Protocol PDS doesn't see note data

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
**Mitigation:** Warn users prominently. Consider key backup options (encrypted with recovery phrase).

### Risk 4: R2 Costs at Scale
**Mitigation:** Monitor usage. Implement compression. Consider alternative storage backends.

### Risk 5: AT Protocol Dependency
**Mitigation:** Make AT Protocol optional. Support local-only and custom identity providers.

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
- ✅ Conflict-free multi-device sync
- ✅ Zero-knowledge encryption
- ✅ Optional AT Protocol identity
- ✅ Local-first remains core experience
- ✅ Markdown files remain source of truth
