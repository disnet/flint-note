# Local-First Markdown Sync Architecture

## Automerge + Cloudflare R2 + AT Protocol Identity

**Version:** 1.0  
**Date:** 2025-01-13  
**Status:** Design Specification

---

## Executive Summary

This document specifies the architecture for a local-first Electron markdown application with multi-device sync. The system uses:

- **AT Protocol (atproto)** for decentralized, portable user identity
- **Automerge CRDTs** for automatic conflict-free document merging
- **Cloudflare R2** for zero-knowledge encrypted cloud storage
- **Local-first design** ensuring full offline functionality

**Key Benefits:**

- No custom authentication system required (leverage AT Protocol OAuth)
- Guaranteed conflict-free sync via Automerge CRDTs
- Complete privacy with end-to-end encryption
- User data sovereignty with portable DIDs
- Low operational costs (~$0.015/GB/month for R2)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Device (Electron)                │
│                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │  Markdown    │───▶│  Automerge  │───▶│  IndexedDB   │  │
│  │    Editor    │    │    Repo     │    │   (Local)    │  │
│  └──────────────┘    └─────────────┘    └──────────────┘  │
│                            │ ▲                              │
│                            │ │ Encrypted                    │
│                            ▼ │ Sync                         │
└────────────────────────────┼─┼──────────────────────────────┘
                             │ │
                    ┌────────┼─┼────────┐
                    │  Encryption Layer  │
                    │  (AES-256-GCM)     │
                    └────────┼─┼────────┘
                             │ │
                             ▼ │
                    ┌─────────────────┐
                    │  Cloudflare R2  │
                    │  (Encrypted     │
                    │   Blob Storage) │
                    └─────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Identity Layer (AT Protocol)                    │
│                                                              │
│  ┌──────────┐       ┌──────────┐       ┌──────────────┐   │
│  │   DID    │──────▶│   PDS    │◀──────│ OAuth Client │   │
│  │ Registry │       │ (User's) │       │  (Electron)  │   │
│  └──────────┘       └──────────┘       └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Authentication:** User logs in via AT Protocol OAuth → receives DID
2. **Key Derivation:** App derives encryption key from DID + user password
3. **Local Editing:** User edits markdown → Automerge tracks changes locally
4. **Background Sync:** Periodic sync encrypts Automerge documents → uploads to R2
5. **Multi-Device:** Other devices download encrypted blobs → decrypt → Automerge merges changes

---

## Component Specifications

### 1. Identity Layer: AT Protocol

**Purpose:** Provide decentralized, portable user identity without custom authentication.

#### 1.1 Identity Primitives

**DID (Decentralized Identifier):**

- Format: `did:plc:abc123xyz` or `did:web:alice.com`
- Properties: Permanent, globally unique, cryptographically verifiable
- Resolution: Maps to DID Document containing public keys and service endpoints

**Handle (Human-Readable Name):**

- Format: DNS domain (e.g., `alice.bsky.social` or `alice.com`)
- Properties: User-facing, memorable, mutable
- Verification: Bidirectional DNS TXT record validation

**DID Document:**

```json
{
  "id": "did:plc:abc123xyz",
  "alsoKnownAs": ["https://alice.bsky.social"],
  "verificationMethod": [
    {
      "id": "did:plc:abc123xyz#atproto",
      "type": "Multikey",
      "controller": "did:plc:abc123xyz",
      "publicKeyMultibase": "z6Mk..."
    }
  ],
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://pds.example.com"
    }
  ]
}
```

#### 1.2 OAuth Authentication Flow

**Libraries:**

- `@atproto/oauth-client-node` for Electron main process
- Custom OAuth handler for renderer process

**Implementation Pattern:**

```typescript
// Initialize OAuth client
import { NodeOAuthClient } from '@atproto/oauth-client-node';

const oauthClient = await NodeOAuthClient.create({
  clientMetadata: {
    client_id: 'https://your-app.com/client-metadata.json',
    client_name: 'Your Markdown App',
    client_uri: 'https://your-app.com',
    redirect_uris: ['http://localhost:3000/oauth/callback'],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'native',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true
  },
  stateStore: new NodeFileSystemStore('./oauth-state'),
  sessionStore: new NodeFileSystemStore('./oauth-sessions')
});

// Login flow
async function login(handle: string) {
  // 1. User enters handle (alice.bsky.social)
  const authUrl = await oauthClient.authorize(handle, {
    scope: 'atproto'
  });

  // 2. Open browser window for OAuth flow
  // 3. Handle callback with authorization code
  // 4. Exchange code for tokens
  const session = await oauthClient.callback(callbackParams);

  // 5. Extract DID from session
  const did = session.sub; // e.g., "did:plc:abc123xyz"

  return { did, session };
}
```

**Session Management:**

- Store refresh tokens securely (Electron safeStorage API)
- Auto-refresh access tokens (2-hour lifetime)
- Handle token expiration gracefully

**Security Requirements:**

- MUST verify `sub` field matches expected DID
- MUST validate Authorization Server is authoritative for DID
- MUST use DPoP (Demonstration of Proof-of-Possession) for token binding
- MUST implement PKCE (Proof Key for Code Exchange)

#### 1.3 Client Metadata Document

Host at `https://your-app.com/client-metadata.json`:

```json
{
  "client_id": "https://your-app.com/client-metadata.json",
  "client_name": "Your Markdown App",
  "client_uri": "https://your-app.com",
  "logo_uri": "https://your-app.com/logo.png",
  "tos_uri": "https://your-app.com/terms",
  "policy_uri": "https://your-app.com/privacy",
  "redirect_uris": ["http://localhost:3000/oauth/callback", "yourapp://oauth/callback"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "application_type": "native",
  "token_endpoint_auth_method": "none",
  "dpop_bound_access_tokens": true
}
```

---

### 2. Sync Layer: Automerge CRDTs

**Purpose:** Provide automatic conflict-free merging of concurrent document edits.

#### 2.1 Automerge Fundamentals

**Core Concepts:**

- **Document:** Self-contained CRDT data structure
- **Change:** Atomic operation representing a document modification
- **Sync Protocol:** Efficient exchange of changes between peers
- **Heads:** Current state pointers (multiple heads = concurrent edits)

**Why Automerge for Markdown:**

- Text data type optimized for collaborative editing
- Full operation history enables version control
- Efficient binary encoding (~75 bytes per edit)
- Mature ecosystem with Rust core + WASM/JS bindings

#### 2.2 Document Schema

**Markdown Document Structure:**

```typescript
import { next as Automerge } from '@automerge/automerge';

interface MarkdownDocument {
  content: Automerge.Text; // The markdown content
  metadata: {
    title: string;
    createdAt: string; // ISO 8601 timestamp
    updatedAt: string; // ISO 8601 timestamp
    tags: string[];
  };
  frontmatter?: Record<string, any>; // YAML frontmatter
}

// Create a new document
const doc = Automerge.init<MarkdownDocument>();
const updatedDoc = Automerge.change(doc, (doc) => {
  doc.content = new Automerge.Text();
  doc.content.insertAt(0, '# My Note\n\nContent here...');
  doc.metadata = {
    title: 'My Note',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: []
  };
});
```

#### 2.3 Automerge-Repo Integration

**Repository Setup:**

```typescript
import { Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';

// Custom network adapter for R2 sync (see Section 3)
import { EncryptedR2SyncAdapter } from './encrypted-r2-sync';

class MarkdownRepo {
  private repo: Repo;

  async initialize(did: string, encryptionKey: CryptoKey) {
    this.repo = new Repo({
      // Local persistence
      storage: new IndexedDBStorageAdapter('markdown-app'),

      // Network adapters
      network: [
        // Primary: Encrypted R2 sync
        new EncryptedR2SyncAdapter({
          endpoint: 'https://r2-endpoint.example.com',
          encryptionKey,
          did
        })

        // Optional: WebSocket for real-time collaboration
        // new BrowserWebSocketClientAdapter('wss://sync.example.com')
      ],

      // Share policy (private for now)
      sharePolicy: async (peerId) => false
    });

    await this.repo.storageSubsystem.ready();
  }

  // Create new document
  async createDocument(initialContent: string): Promise<string> {
    const handle = this.repo.create<MarkdownDocument>();
    handle.change((doc) => {
      doc.content = new Automerge.Text(initialContent);
      doc.metadata = {
        title: extractTitle(initialContent),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: []
      };
    });
    return handle.documentId;
  }

  // Get document
  async getDocument(docId: string) {
    const handle = this.repo.find<MarkdownDocument>(docId);
    await handle.whenReady();
    return handle;
  }

  // Update document
  async updateDocument(docId: string, updater: (doc: MarkdownDocument) => void) {
    const handle = await this.getDocument(docId);
    handle.change((doc) => {
      updater(doc);
      doc.metadata.updatedAt = new Date().toISOString();
    });
  }

  // List all documents
  async listDocuments(): Promise<string[]> {
    return Array.from(this.repo.handles.keys());
  }
}
```

#### 2.4 Conflict Resolution

**Automatic by Design:**

- Text edits use list CRDT (character-level merging)
- Concurrent insertions at same position → deterministic ordering
- Deletions and insertions commute (can apply in any order)
- No user intervention required

**Example Scenario:**

```
Device A (offline):     Device B (offline):
"Hello world"           "Hello world"
↓                       ↓
"Hello beautiful world" "Hello cruel world"

After sync (automatic merge):
"Hello beautiful cruel world"
```

**Handling Semantic Conflicts:**

- CRDTs prevent data loss, not semantic conflicts
- Consider UI indicator for "concurrent edit regions"
- Optional: Show document history/timeline for manual review

---

### 3. Storage Layer: Cloudflare R2

**Purpose:** Provide encrypted cloud storage for Automerge documents.

#### 3.1 Bucket Structure

**Path Organization:**

```
your-bucket/
├── {did}/
│   ├── documents/
│   │   ├── {document-id}.automerge    # Encrypted document
│   │   └── {document-id}.meta.json    # Encrypted metadata
│   └── sync/
│       ├── device-{device-id}.sync    # Sync state per device
│       └── manifest.json              # Document index
```

**Naming Conventions:**

- DID as top-level folder (ensures isolation)
- Document IDs from Automerge (UUIDs)
- Device IDs for tracking sync state

#### 3.2 R2 API Configuration

**Cloudflare R2 Setup:**

```typescript
// Configure R2 access
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string; // https://{accountId}.r2.cloudflarestorage.com
}

// Use S3-compatible API
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey
  }
});
```

**Security Considerations:**

- Store R2 credentials securely (environment variables or Electron safeStorage)
- Use bucket policies to restrict access
- Enable R2 versioning for recovery
- Consider R2 lifecycle rules for automatic cleanup

#### 3.3 Encryption Layer

**Encryption Strategy:**

```typescript
import { webcrypto as crypto } from 'crypto';

class EncryptionService {
  private key: CryptoKey;

  constructor(key: CryptoKey) {
    this.key = key;
  }

  /**
   * Encrypt data with AES-256-GCM
   * Format: [12-byte IV][encrypted data][16-byte auth tag]
   */
  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128 // 16-byte authentication tag
      },
      this.key,
      plaintext
    );

    // Concatenate: IV || ciphertext (includes auth tag)
    const encrypted = new Uint8Array(12 + ciphertext.byteLength);
    encrypted.set(iv, 0);
    encrypted.set(new Uint8Array(ciphertext), 12);

    return encrypted;
  }

  /**
   * Decrypt data encrypted with AES-256-GCM
   */
  async decrypt(encrypted: Uint8Array): Promise<Uint8Array> {
    // Extract IV and ciphertext
    const iv = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128
      },
      this.key,
      ciphertext
    );

    return new Uint8Array(plaintext);
  }
}
```

**Key Derivation:**

```typescript
import { scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/**
 * Derive encryption key from DID + user password
 * Uses scrypt for key derivation (memory-hard, resistant to GPU attacks)
 */
async function deriveEncryptionKey(did: string, password: string): Promise<CryptoKey> {
  // Parameters for scrypt
  const SALT_LENGTH = 32;
  const KEY_LENGTH = 32; // 256 bits
  const N = 32768; // CPU/memory cost (2^15)
  const r = 8; // Block size
  const p = 1; // Parallelization

  // Use DID as salt component (ensures uniqueness per user)
  // Hash DID to get fixed-length salt
  const didHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(did));
  const salt = new Uint8Array(didHash);

  // Derive key material
  const keyMaterial = (await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r,
    p
  })) as Buffer;

  // Import as CryptoKey
  return await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false, // Non-extractable
    ['encrypt', 'decrypt']
  );
}
```

**Password Requirements:**

- Minimum 12 characters
- Recommend passphrase (multiple words)
- Show strength indicator in UI
- Consider optional biometric unlock (store key in Electron safeStorage)

#### 3.4 Sync Protocol

**Custom Storage Adapter for Automerge-Repo:**

```typescript
import { StorageAdapter } from '@automerge/automerge-repo';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';

export class EncryptedR2SyncAdapter implements StorageAdapter {
  private r2: S3Client;
  private encryption: EncryptionService;
  private did: string;
  private bucketName: string;
  private deviceId: string;

  constructor(config: {
    r2Client: S3Client;
    encryptionKey: CryptoKey;
    did: string;
    bucketName: string;
  }) {
    this.r2 = config.r2Client;
    this.encryption = new EncryptionService(config.encryptionKey);
    this.did = config.did;
    this.bucketName = config.bucketName;
    this.deviceId = generateDeviceId(); // Unique per device
  }

  /**
   * Save document to R2 (called by Automerge when doc changes)
   */
  async save(documentId: string, binary: Uint8Array): Promise<void> {
    try {
      // Encrypt the Automerge binary
      const encrypted = await this.encryption.encrypt(binary);

      // Upload to R2
      const key = `${this.did}/documents/${documentId}.automerge`;
      await this.r2.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: encrypted,
          ContentType: 'application/octet-stream',
          Metadata: {
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            version: '1'
          }
        })
      );

      // Update sync manifest
      await this.updateSyncManifest(documentId);
    } catch (error) {
      console.error(`Failed to save document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Load document from R2 (called by Automerge on startup)
   */
  async load(documentId: string): Promise<Uint8Array | undefined> {
    try {
      const key = `${this.did}/documents/${documentId}.automerge`;

      // Download from R2
      const response = await this.r2.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        })
      );

      if (!response.Body) {
        return undefined;
      }

      // Read stream to buffer
      const encrypted = await streamToBuffer(response.Body);

      // Decrypt
      const decrypted = await this.encryption.decrypt(encrypted);

      return decrypted;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return undefined; // Document doesn't exist yet
      }
      console.error(`Failed to load document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Remove document from R2
   */
  async remove(documentId: string): Promise<void> {
    const key = `${this.did}/documents/${documentId}.automerge`;
    await this.r2.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      })
    );
  }

  /**
   * Load all document IDs (for discovery on new device)
   */
  async loadRange(keyPrefix: string[]): Promise<Uint8Array[]> {
    const prefix = `${this.did}/documents/`;
    const response = await this.r2.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix
      })
    );

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

  /**
   * Update sync manifest (tracks which documents exist)
   */
  private async updateSyncManifest(documentId: string): Promise<void> {
    const manifestKey = `${this.did}/sync/manifest.json`;

    // Load existing manifest
    let manifest: { documents: string[]; updatedAt: string } = {
      documents: [],
      updatedAt: new Date().toISOString()
    };

    try {
      const existing = await this.r2.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: manifestKey
        })
      );

      if (existing.Body) {
        const encrypted = await streamToBuffer(existing.Body);
        const decrypted = await this.encryption.decrypt(encrypted);
        manifest = JSON.parse(new TextDecoder().decode(decrypted));
      }
    } catch (error) {
      // Manifest doesn't exist yet, use empty
    }

    // Add document if not already present
    if (!manifest.documents.includes(documentId)) {
      manifest.documents.push(documentId);
      manifest.updatedAt = new Date().toISOString();
    }

    // Save updated manifest
    const manifestJson = JSON.stringify(manifest);
    const encrypted = await this.encryption.encrypt(
      new TextEncoder().encode(manifestJson)
    );

    await this.r2.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: manifestKey,
        Body: encrypted,
        ContentType: 'application/json'
      })
    );
  }
}

// Helper function
async function streamToBuffer(stream: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function generateDeviceId(): string {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

#### 3.5 Sync Strategy

**Periodic Background Sync:**

```typescript
class SyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 60000; // 1 minute

  startPeriodicSync() {
    this.syncInterval = setInterval(async () => {
      await this.performSync();
    }, this.SYNC_INTERVAL_MS);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync(): Promise<void> {
    try {
      // Automerge-repo handles sync automatically
      // This method can be used for:
      // 1. Triggering manual sync
      // 2. Checking sync status
      // 3. Showing sync UI indicators

      console.log('Sync started:', new Date().toISOString());

      // The storage adapter will automatically upload changed docs
      // and download new docs from other devices

      // Optional: Emit events for UI updates
      this.emit('sync-started');
      await this.repo.networkSubsystem.sync();
      this.emit('sync-completed');
    } catch (error) {
      console.error('Sync failed:', error);
      this.emit('sync-failed', error);
    }
  }
}
```

**Conflict-Free Guarantee:**

- Automerge CRDTs ensure automatic merging
- No explicit conflict resolution needed
- All devices converge to same state eventually

---

## Security Architecture

### 4.1 Threat Model

**Trusted Components:**

- User's devices (Electron app instances)
- User's encryption password (known only to user)

**Untrusted Components:**

- Cloudflare R2 (honest-but-curious: follows protocol but can read data)
- Network (can observe encrypted traffic)
- AT Protocol infrastructure (PDS, relay servers)

**Security Goals:**

1. **Confidentiality:** R2 cannot read document contents
2. **Integrity:** Tampering with encrypted data is detected
3. **Authenticity:** Documents verifiably from correct user (DID)
4. **Forward Secrecy:** Compromising current key doesn't reveal past documents (optional, via key rotation)

### 4.2 Encryption Properties

**AES-256-GCM:**

- **Confidentiality:** 256-bit key provides ~2^256 security
- **Authenticity:** GCM mode includes authentication tag (prevents tampering)
- **Performance:** Hardware-accelerated on modern CPUs
- **Nonce:** 12-byte random IV (never reused with same key)

**Key Derivation (scrypt):**

- **Memory-hard:** Resistant to GPU/ASIC attacks
- **Parameters:** N=32768, r=8, p=1 (~100ms on modern CPU)
- **Salt:** DID provides unique salt per user

**Threat Mitigation:**

- **Eavesdropping:** All data encrypted before leaving device
- **Tampering:** GCM auth tag detects modifications
- **Rainbow Tables:** scrypt with unique salt prevents precomputation
- **Brute Force:** Strong password + memory-hard KDF increases attack cost

### 4.3 Key Management

**Key Storage:**

```typescript
import { safeStorage } from 'electron';

class KeyManager {
  /**
   * Store encryption key securely (encrypted by OS keychain)
   */
  async storeKey(did: string, key: CryptoKey): Promise<void> {
    // Export key as raw bytes
    const keyBytes = await crypto.subtle.exportKey('raw', key);

    // Encrypt with OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret)
    const encrypted = safeStorage.encryptString(Buffer.from(keyBytes).toString('base64'));

    // Store in secure location
    await electronStore.set(`encryption-key-${did}`, encrypted);
  }

  /**
   * Retrieve encryption key
   */
  async retrieveKey(did: string): Promise<CryptoKey | null> {
    const encrypted = await electronStore.get(`encryption-key-${did}`);
    if (!encrypted) return null;

    // Decrypt using OS keychain
    const keyBase64 = safeStorage.decryptString(encrypted);
    const keyBytes = Buffer.from(keyBase64, 'base64');

    // Import as CryptoKey
    return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ]);
  }

  /**
   * Clear all keys (logout)
   */
  async clearKeys(): Promise<void> {
    // Remove all stored keys
    const keys = await electronStore.keys();
    for (const key of keys) {
      if (key.startsWith('encryption-key-')) {
        await electronStore.delete(key);
      }
    }
  }
}
```

**Session Management:**

- Prompt for password on first launch or after timeout
- Store derived key in memory for session duration
- Optional: Persist encrypted key using Electron safeStorage (OS keychain)
- Clear keys on logout or app quit

**Password Change:**

1. Derive new encryption key from new password
2. Download all documents from R2
3. Decrypt with old key
4. Re-encrypt with new key
5. Upload back to R2
6. Update locally stored key

### 4.4 Privacy Considerations

**Zero-Knowledge Design:**

- R2 never sees plaintext or encryption keys
- Only encrypted blobs stored in cloud
- DID is pseudonymous (not directly linked to real identity)

**Metadata Leakage:**

- R2 knows: number of documents, file sizes, access patterns
- R2 doesn't know: content, document relationships, titles
- Mitigation: Consider padding file sizes, dummy access patterns (overkill for most use cases)

**DID Privacy:**

- DID is public and permanent
- Links user's devices and documents
- Consider: Separate DID for different contexts (work vs personal)

---

## Implementation Roadmap

### Phase 1: Core Functionality (MVP)

**Week 1-2: Authentication**

- [ ] Integrate @atproto/oauth-client-node
- [ ] Implement OAuth flow in Electron
- [ ] Handle callback and token storage
- [ ] DID extraction and validation

**Week 3-4: Encryption**

- [ ] Key derivation (scrypt + DID)
- [ ] AES-GCM encryption/decryption
- [ ] Key storage (Electron safeStorage)
- [ ] Password UI and validation

**Week 5-6: Local Storage**

- [ ] Automerge document schema
- [ ] Automerge-repo setup with IndexedDB
- [ ] Basic CRUD operations
- [ ] Document list UI

**Week 7-8: Cloud Sync**

- [ ] R2 client configuration
- [ ] EncryptedR2SyncAdapter implementation
- [ ] Upload/download with encryption
- [ ] Background sync manager

**Week 9-10: Testing & Polish**

- [ ] Multi-device testing
- [ ] Conflict resolution validation
- [ ] Error handling and retry logic
- [ ] UI feedback (sync status, conflicts)

### Phase 2: Enhanced Features

- [ ] Document search (encrypted, local-only)
- [ ] Version history UI
- [ ] Export/import (encrypted backup)
- [ ] Sharing (with other DIDs)
- [ ] Real-time collaboration (WebRTC)
- [ ] Mobile apps (React Native)

### Phase 3: Production Hardening

- [ ] Comprehensive error handling
- [ ] Offline queue with retry
- [ ] Performance optimization (large vaults)
- [ ] Security audit
- [ ] User documentation
- [ ] Beta testing program

---

## Testing Strategy

### 5.1 Unit Tests

**Encryption:**

```typescript
describe('EncryptionService', () => {
  it('should encrypt and decrypt correctly', async () => {
    const key = await deriveEncryptionKey('did:plc:test123', 'password');
    const service = new EncryptionService(key);

    const plaintext = new TextEncoder().encode('Hello, world!');
    const encrypted = await service.encrypt(plaintext);
    const decrypted = await service.decrypt(encrypted);

    expect(decrypted).toEqual(plaintext);
  });

  it('should detect tampering', async () => {
    const key = await deriveEncryptionKey('did:plc:test123', 'password');
    const service = new EncryptionService(key);

    const plaintext = new TextEncoder().encode('Hello, world!');
    const encrypted = await service.encrypt(plaintext);

    // Tamper with ciphertext
    encrypted[20] ^= 0xff;

    await expect(service.decrypt(encrypted)).rejects.toThrow();
  });
});
```

**Automerge:**

```typescript
describe('MarkdownDocument', () => {
  it('should merge concurrent edits', async () => {
    // Device A
    let docA = Automerge.init<MarkdownDocument>();
    docA = Automerge.change(docA, (doc) => {
      doc.content = new Automerge.Text('Hello ');
    });

    // Device B (from same starting state)
    let docB = Automerge.clone(docA);

    // Concurrent edits
    docA = Automerge.change(docA, (doc) => {
      doc.content.insertAt(6, 'beautiful ');
    });

    docB = Automerge.change(docB, (doc) => {
      doc.content.insertAt(6, 'world');
    });

    // Merge
    const merged = Automerge.merge(docA, docB);

    expect(merged.content.toString()).toBe('Hello beautiful world');
  });
});
```

### 5.2 Integration Tests

**Multi-Device Sync:**

```typescript
describe('Multi-Device Sync', () => {
  it('should sync document across devices', async () => {
    // Setup Device A
    const deviceA = await setupDevice('did:plc:alice', 'password123');
    const docId = await deviceA.createDocument('# Note\nOriginal content');

    // Wait for sync
    await deviceA.syncManager.performSync();
    await delay(2000);

    // Setup Device B (same user)
    const deviceB = await setupDevice('did:plc:alice', 'password123');
    await deviceB.syncManager.performSync();

    // Device B should have the document
    const doc = await deviceB.getDocument(docId);
    expect(doc.content.toString()).toContain('Original content');

    // Edit on Device B
    await deviceB.updateDocument(docId, (doc) => {
      doc.content.insertAt(doc.content.length, '\nNew line from Device B');
    });

    await deviceB.syncManager.performSync();
    await delay(2000);

    // Sync Device A
    await deviceA.syncManager.performSync();

    // Device A should have the update
    const updated = await deviceA.getDocument(docId);
    expect(updated.content.toString()).toContain('New line from Device B');
  });
});
```

### 5.3 Security Tests

**Encryption Validation:**

- Verify R2 stores only encrypted data (no plaintext leakage)
- Confirm wrong password fails decryption
- Validate tampering detection (modify encrypted bytes)
- Test key derivation uniqueness (same password, different DID → different keys)

**OAuth Security:**

- Verify DID validation (reject invalid DIDs)
- Test token refresh flow
- Confirm PKCE implementation
- Validate DPoP binding

### 5.4 Performance Tests

**Benchmarks:**

- Document encryption/decryption speed (target: <10ms for 1MB)
- Sync latency (target: <5s for 100KB document)
- Automerge merge performance (target: <100ms for typical conflicts)
- Memory usage (target: <200MB for 1000 documents)

**Load Tests:**

- Large vaults (10,000+ documents)
- Large documents (10MB+ markdown files)
- Concurrent device sync (5+ devices simultaneously)

---

## Operational Considerations

### 6.1 Cost Estimates

**Cloudflare R2 Pricing (as of 2025):**

- Storage: $0.015/GB/month
- Class A operations (write): $4.50/million
- Class B operations (read): $0.36/million
- Egress: Free

**Example User:**

- 1,000 notes @ 10KB each = 10MB storage
- 100 edits/day = 3,000/month writes
- 500 syncs/month = reads

**Monthly Cost:**

- Storage: $0.015 × 0.01 GB = $0.00015
- Writes: $4.50 × 0.000003 = $0.00001
- Reads: $0.36 × 0.0005 = $0.00018
- **Total: ~$0.0003/user/month** (essentially free)

**Scale:**

- 10,000 users: ~$3/month
- 100,000 users: ~$30/month

### 6.2 Monitoring

**Metrics to Track:**

- Sync success/failure rates
- Encryption/decryption latency
- R2 API error rates
- Document conflict frequency
- Active users per day

**Logging:**

- Sanitize logs (never log passwords, keys, or document content)
- Log DID (for debugging user-specific issues)
- Log document IDs and sync events
- Structured logging (JSON) for analysis

### 6.3 Backup and Recovery

**R2 Versioning:**

- Enable R2 object versioning
- Retain previous versions (configurable retention)
- Allow users to restore from version history

**Export Feature:**

- Provide encrypted backup export
- Include all documents + metadata
- Importable on any device

**Disaster Recovery:**

- Users can re-download from R2 on new device
- Local IndexedDB is authoritative during conflicts
- Document history enables recovery from corruption

---

## Open Questions and Future Work

### 7.1 Collaboration Features

**Multi-User Editing:**

- Share documents with other DIDs
- Permission model (read/write/comment)
- Real-time presence indicators
- WebRTC for P2P collaboration

**Technical Approach:**

- Automerge supports multi-user inherently
- Add `sharePolicy` to allow specific DIDs
- Implement WebRTC signaling server
- Consider separate encryption for shared docs (shared key)

### 7.2 Mobile Support

**React Native Implementation:**

- Same architecture (Automerge + R2 + AT Protocol)
- Platform-specific considerations:
  - iOS: Keychain for key storage
  - Android: Keystore for key storage
  - Background sync limitations
  - Battery optimization

### 7.3 Web Version

**Browser Limitations:**

- Cannot run full Electron OAuth flow
- Storage limits (IndexedDB quota)
- Service Worker for offline support

**Possible Approach:**

- Progressive Web App (PWA)
- Use @atproto/oauth-client in browser
- Same encryption and sync logic
- Warn users about browser storage limits

### 7.4 Advanced Features

**Encrypted Search:**

- Client-side search index (encrypted)
- Full-text search over markdown content
- Tag-based filtering

**Linked Notes:**

- Wiki-style links between documents
- Graph view of relationships
- Backlinks

**Plugins/Extensions:**

- Custom markdown renderers
- Syntax highlighting
- Diagram support (Mermaid)

---

## References

### Documentation

**AT Protocol:**

- Specification: https://atproto.com/specs/atp
- OAuth Guide: https://atproto.com/specs/oauth
- Identity System: https://atproto.com/guides/identity

**Automerge:**

- Documentation: https://automerge.org/docs/
- Automerge-Repo: https://automerge.org/docs/repositories/
- CRDT Theory: https://crdt.tech/

**Cloudflare R2:**

- Documentation: https://developers.cloudflare.com/r2/
- S3 Compatibility: https://developers.cloudflare.com/r2/api/s3/

### Libraries

```json
{
  "dependencies": {
    "@atproto/oauth-client-node": "^0.1.0",
    "@automerge/automerge": "^2.2.0",
    "@automerge/automerge-repo": "^1.2.0",
    "@automerge/automerge-repo-storage-indexeddb": "^1.2.0",
    "@aws-sdk/client-s3": "^3.490.0",
    "electron": "^28.0.0"
  }
}
```

---

## Appendix A: Decision Log

### Why AT Protocol over alternatives?

**Alternatives Considered:**

- Custom auth (more work, less portable)
- WebAuthn/Passkeys (no portable identity)
- OAuth with traditional providers (centralized)

**AT Protocol Wins:**

- Decentralized, portable identity
- Built-in public key infrastructure
- No custom auth server needed
- Integration with Bluesky ecosystem

### Why Automerge over alternatives?

**Alternatives Considered:**

- Yjs (smaller bundle, less history)
- Operational Transforms (more complex)
- Last-write-wins (loses data)

**Automerge Wins:**

- Full operation history (version control)
- Mature, production-ready
- Cross-platform support (Rust core)
- Better for file-based storage

### Why Cloudflare R2 over alternatives?

**Alternatives Considered:**

- AWS S3 (more expensive egress)
- Google Cloud Storage (more complex)
- Self-hosted (operational burden)

**R2 Wins:**

- Free egress (major cost savings)
- S3-compatible API (easy migration)
- Competitive pricing
- Cloudflare infrastructure reliability

---

## Appendix B: Example Code Snippets

### Complete Initialization Flow

```typescript
import { app, BrowserWindow } from 'electron';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Repo } from '@automerge/automerge-repo';
import { S3Client } from '@aws-sdk/client-s3';

async function initializeApp() {
  // 1. Setup OAuth client
  const oauthClient = await NodeOAuthClient.create({
    clientMetadata: {
      client_id: 'https://your-app.com/client-metadata.json'
      // ... other metadata
    }
    // ... storage config
  });

  // 2. User login
  const session = await oauthClient.authorize('alice.bsky.social');
  const did = session.sub;

  // 3. Derive encryption key
  const password = await promptForPassword();
  const encryptionKey = await deriveEncryptionKey(did, password);

  // 4. Setup R2 client
  const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });

  // 5. Initialize Automerge repo
  const repo = new Repo({
    storage: new IndexedDBStorageAdapter('markdown-app'),
    network: [
      new EncryptedR2SyncAdapter({
        r2Client,
        encryptionKey,
        did,
        bucketName: 'markdown-vault'
      })
    ]
  });

  // 6. Start sync
  const syncManager = new SyncManager(repo);
  syncManager.startPeriodicSync();

  // 7. Create main window
  const mainWindow = createWindow();

  // 8. Load UI
  mainWindow.loadFile('index.html');

  return { oauthClient, repo, syncManager, did };
}

app.whenReady().then(initializeApp);
```

---

**End of Document**
