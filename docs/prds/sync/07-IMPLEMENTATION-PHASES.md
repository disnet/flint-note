# Implementation Phases

[← Previous: Data Model](./06-DATA-MODEL.md) | [Next: UI Design →](./08-UI-DESIGN.md)

This document details the phased implementation approach for adding multi-device sync to Flint using Automerge CRDTs, Cloudflare R2, and AT Protocol identity.

---

## Phase 0: Prerequisites

**Goal:** Get external file editing working reliably.

### Tasks

#### 1. Implement File Watching

- Use `chokidar` for cross-platform file watching
- Detect: add, change, delete, rename events
- Debounce rapid changes (100-200ms)
- Filter ignored paths (`.git/`, `.flint-note/`, etc.)

**Deliverable:** File watcher service running in Electron main process

#### 2. Distinguish Internal vs External Changes

- Track file write operations by Flint
- Track expected modification times
- Ignore self-caused file changes
- Process external changes only

**Deliverable:** Change processor that filters internal writes

#### 3. Handle External Content Changes

- Read modified files
- Parse frontmatter + content
- Update database (notes, search, links)
- Notify UI of changes

**Deliverable:** External edits reflected in Flint UI

#### 4. Handle Renames

- Detect renames (unlink + add with same ID)
- Update database with new path/filename
- Update wikilinks in other notes
- Sync frontmatter filename with filesystem

**Deliverable:** Renames handled correctly

#### 5. Ensure ID Consistency

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

## Phase 1: Local Automerge (No Sync)

**Goal:** Replace filesystem as the primary data layer with Automerge documents, keeping everything local.

### Tasks

#### 1. Setup Automerge-Repo

Install dependencies:

```bash
npm install @automerge/automerge @automerge/automerge-repo @automerge/automerge-repo-storage-indexeddb
```

Initialize the repository:

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

#### 2. Create Automerge Documents from Files

Scan vault directory on startup and create documents:

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

#### 3. Bidirectional Sync: Automerge ↔ Filesystem

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

#### 4. Update Note Operations to Use Automerge

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

#### 5. Database Rebuild from Automerge

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

## Phase 2: Encryption + R2 Backup

**Goal:** Add encrypted cloud backup to R2 (single-device sync).

### Tasks

#### 1. Setup Flint Sync Backend Service

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
```

**Deliverable:** Flint Sync Service deployed to Cloudflare Workers

#### 2. Setup R2 Client in Electron App

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

#### 3. Implement Encryption Layer (Hybrid Approach)

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

  private generateUUID(): string {
    return crypto.randomUUID();
  }
}
```

**Deliverable:** Hybrid encryption service with passwordless default and optional password backup

#### 4. Add AT Protocol Identity (Required)

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
}
```

**Deliverable:** AT Protocol OAuth login with DPoP token support for Flint Sync API

#### 5. Implement R2 Storage Adapter

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

#### 6. Add Sync UI

See the complete sync UI implementation with AT Protocol sign-in flow in the original plan. Key components include:

- AT Protocol OAuth sign-in (required before enabling sync)
- New vault setup (passwordless with device keychain)
- Join existing vault (device authorization or password)
- Sync status indicators
- Optional password backup management
- Device management

**Deliverable:** Complete sync UI with AT Protocol sign-in required

#### 7. Periodic Background Sync

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

## Phase 3: Multi-Device Sync

**Goal:** Real multi-device sync with automatic conflict resolution.

### Tasks

#### 1. Add Network Adapter to Automerge

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

#### 2. Conflict Detection and Notification

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

#### 3. Sync Status Indicators

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

#### 4. Handle Deletion Conflicts

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

#### 5. Testing Concurrent Edits

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

## Phase 4: Polish and Optimization

**Goal:** Performance tuning, error handling, and UX improvements.

### Tasks

#### 1. Optimize Sync Performance

- Batch multiple document changes before syncing
- Implement incremental sync (only changed docs)
- Compress Automerge binaries before encryption
- Add sync progress indicators for large vaults

#### 2. Error Handling and Recovery

- Retry failed sync attempts with exponential backoff
- Handle network interruptions gracefully
- Detect and recover from corruption
- Provide manual conflict resolution UI (fallback)

#### 3. Key Management

- Store encryption key in OS keychain (Electron safeStorage)
- Allow password change (re-encrypt all documents)
- Implement key derivation with user-friendly prompts
- Add biometric unlock option (Touch ID, Windows Hello)

#### 4. Settings and Preferences

- Sync interval configuration
- Enable/disable sync per vault
- Bandwidth/data usage settings
- Manual sync trigger

#### 5. Monitoring and Logging

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

[← Previous: Data Model](./06-DATA-MODEL.md) | [Next: UI Design →](./08-UI-DESIGN.md)
