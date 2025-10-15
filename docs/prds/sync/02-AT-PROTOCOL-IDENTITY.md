# AT Protocol Identity: Integration and Implementation

[← Previous: Design Principles](./01-DESIGN-PRINCIPLES.md) | [Next: Identity Alternatives Analysis →](./03-IDENTITY-ALTERNATIVES-ANALYSIS.md)

---

## Executive Summary

This document provides comprehensive guidance on **how AT Protocol identity is integrated** into Flint's sync architecture. While [Identity Alternatives Analysis](./03-IDENTITY-ALTERNATIVES-ANALYSIS.md) explains **why** AT Protocol was chosen, this document focuses on the **practical implementation** of AT Protocol DIDs, authentication flows, and authorization mechanisms.

**Key Points:**

- AT Protocol provides **identity and authorization only**, not encryption
- User's DID serves as stable identifier for R2 storage namespacing
- DPoP tokens ensure secure, token-bound authorization
- Identity layer is **completely separate** from vault encryption keys
- Graceful degradation: local-first works without AT Protocol

---

## Role Separation: Identity vs. Encryption

### Critical Distinction

```
┌─────────────────────────────────────────────────────────┐
│                   IDENTITY LAYER                        │
│            (AT Protocol - Authorization)                │
│                                                         │
│  Purpose: Who are you? Can you access this storage?    │
│  Technology: AT Protocol DID + DPoP tokens             │
│  Stored: DID, PDS endpoint, public profile             │
│  Managed by: User's PDS (Bluesky or other)             │
│  Security: OAuth 2.0 + DPoP token binding              │
└─────────────────────────────────────────────────────────┘
                           │
                           │ SEPARATE CONCERNS
                           │
┌─────────────────────────────────────────────────────────┐
│                  ENCRYPTION LAYER                       │
│           (Vault Keys - Data Protection)                │
│                                                         │
│  Purpose: Encrypt/decrypt note content                 │
│  Technology: AES-256-GCM with vault keys               │
│  Stored: Device keychain + optional password backup    │
│  Managed by: User's devices (Electron safeStorage)     │
│  Security: Zero-knowledge, never leaves device         │
└─────────────────────────────────────────────────────────┘
```

### Why Separate?

1. **Security:** Compromise of identity doesn't expose encrypted data
2. **Privacy:** PDS never sees or handles encryption keys
3. **Flexibility:** Can change identity provider without re-encrypting vault
4. **Zero-knowledge:** Flint servers only authorize access, never decrypt
5. **Future-proof:** Can add collaboration features without changing encryption

---

## AT Protocol Components

### 1. Decentralized Identifier (DID)

**Format:** `did:plc:abc123xyz...` or `did:web:example.com`

**Properties:**

- Stable, globally unique identifier
- User-controlled and portable
- Resolves to DID document with verification keys
- Independent of specific services

**Used For:**

- R2 storage namespace: `/{did}/vault-identity.json`
- Authorization checks by Flint Sync Service
- Future collaboration features (DID-to-DID sharing)

**Example:**

```typescript
interface UserIdentity {
  did: string; // e.g., "did:plc:z72i7hdynmk6r22z27h6tvur"
  pdsEndpoint: string; // e.g., "https://bsky.social"
  handle?: string; // e.g., "@alice.bsky.social"
}
```

### 2. Personal Data Server (PDS)

**Role:**

- Hosts user's AT Protocol data
- Manages user authentication
- Issues access tokens and refresh tokens
- Handles DID document resolution

**Common Providers:**

- Bluesky PDS (`bsky.social`)
- Self-hosted PDS instances
- Future: Flint-operated PDS (simplified onboarding)

**Flint's Interaction:**

- OAuth flow redirects to user's PDS
- Receives access/refresh tokens
- Verifies tokens with DPoP proofs
- Never stores password or long-lived credentials

### 3. DPoP (Demonstrating Proof-of-Possession)

**Purpose:** Token binding to prevent token theft and replay attacks

**How It Works:**

```
Client generates key pair
     ↓
Creates DPoP proof (signed JWT) for each request
     ↓
Attaches proof to Authorization header
     ↓
Server verifies proof matches token
```

**Security Benefits:**

- Stolen tokens useless without private key
- Each request has unique proof
- Prevents token replay attacks
- Enhanced security over bearer tokens

---

## Authentication Flow

### Initial Setup: Enabling Sync

```
┌──────────────┐
│ User clicks  │
│ "Enable Sync"│
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│  Step 1: Check for AT Protocol Session               │
│  - Is user already signed in?                        │
│  - If yes: proceed to vault setup                    │
│  - If no: start OAuth flow                           │
└──────┬───────────────────────────────────────────────┘
       │
       ↓ [No Session]
┌──────────────────────────────────────────────────────┐
│  Step 2: AT Protocol OAuth Flow                      │
│                                                       │
│  1. Discover user's PDS (from handle/DID)            │
│  2. Redirect to PDS OAuth authorization              │
│  3. User authenticates with PDS (Bluesky login)      │
│  4. PDS redirects back with authorization code       │
│  5. Exchange code for access token + refresh token   │
│  6. Generate DPoP key pair for token binding         │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│  Step 3: Store Identity Session                      │
│  - Store DID, PDS endpoint, handle                   │
│  - Store access token + refresh token (encrypted)    │
│  - Store DPoP key pair                               │
│  - Never store password                              │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│  Step 4: Vault Setup                                 │
│  [Separate from identity - see Encryption doc]       │
│  - Generate vault key                                │
│  - Store in device keychain                          │
│  - Create vault-identity.json                        │
│  - Upload to R2 under /{did}/                        │
└──────────────────────────────────────────────────────┘
```

### Code Example: OAuth Flow

```typescript
import { OAuthClient, LoopbackAuthServer } from '@atproto/oauth-client-node';

class AtProtocolIdentityManager {
  private oauthClient: OAuthClient;
  private session?: {
    did: string;
    tokens: {
      access: string;
      refresh: string;
    };
    dpopKey: CryptoKeyPair;
    pdsEndpoint: string;
  };

  async initialize(): Promise<void> {
    // Initialize OAuth client with Flint's client metadata
    this.oauthClient = await OAuthClient.create({
      clientMetadata: {
        client_id: 'https://flint.app/client-metadata.json',
        client_name: 'Flint',
        client_uri: 'https://flint.app',
        redirect_uris: ['http://127.0.0.1:PORT/callback'],
        scope: 'atproto transition:generic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true
      }
    });
  }

  /**
   * Start OAuth flow for user authentication
   */
  async signIn(handle: string): Promise<void> {
    // Discover user's PDS from handle
    const pdsEndpoint = await this.resolvePDSFromHandle(handle);

    // Start loopback server for OAuth callback
    const callbackServer = new LoopbackAuthServer();
    await callbackServer.start();

    try {
      // Build authorization URL
      const authUrl = await this.oauthClient.authorize({
        pdsEndpoint,
        callbackUrl: callbackServer.callbackUrl,
        scope: 'atproto transition:generic'
      });

      // Open browser for user authentication
      await this.openBrowser(authUrl);

      // Wait for callback
      const callbackParams = await callbackServer.waitForCallback();

      // Exchange authorization code for tokens
      const tokenResponse = await this.oauthClient.callback({
        code: callbackParams.code,
        codeVerifier: callbackParams.state
      });

      // Store session
      this.session = {
        did: tokenResponse.sub,
        tokens: {
          access: tokenResponse.access_token,
          refresh: tokenResponse.refresh_token
        },
        dpopKey: tokenResponse.dpopKey,
        pdsEndpoint
      };

      // Persist session securely
      await this.persistSession();
    } finally {
      await callbackServer.stop();
    }
  }

  /**
   * Resolve PDS endpoint from AT Protocol handle
   */
  private async resolvePDSFromHandle(handle: string): Promise<string> {
    // Remove @ prefix if present
    handle = handle.replace(/^@/, '');

    // Try DNS-based resolution first
    try {
      const dnsResult = await fetch(`https://${handle}/.well-known/atproto-did`);
      const did = (await dnsResult.text()).trim();
      return await this.resolvePDSFromDID(did);
    } catch {
      // Fallback to DID:PLC directory
      const response = await fetch(`https://plc.directory/${handle}`);
      const didDoc = await response.json();
      return didDoc.service.find((s: any) => s.type === 'AtprotoPersonalDataServer')
        .serviceEndpoint;
    }
  }

  /**
   * Resolve PDS endpoint from DID
   */
  private async resolvePDSFromDID(did: string): Promise<string> {
    if (did.startsWith('did:plc:')) {
      const response = await fetch(`https://plc.directory/${did}`);
      const didDoc = await response.json();
      return didDoc.service.find((s: any) => s.type === 'AtprotoPersonalDataServer')
        .serviceEndpoint;
    } else if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '');
      const response = await fetch(`https://${domain}/.well-known/did.json`);
      const didDoc = await response.json();
      return didDoc.service.find((s: any) => s.type === 'AtprotoPersonalDataServer')
        .serviceEndpoint;
    }
    throw new Error(`Unsupported DID method: ${did}`);
  }

  /**
   * Persist session to encrypted storage
   */
  private async persistSession(): Promise<void> {
    if (!this.session) return;

    // Encrypt sensitive data with device key
    const encrypted = await this.encryptWithDeviceKey({
      did: this.session.did,
      tokens: this.session.tokens,
      dpopKey: await crypto.subtle.exportKey('jwk', this.session.dpopKey.privateKey),
      pdsEndpoint: this.session.pdsEndpoint
    });

    await this.storageManager.set('at-protocol-session', encrypted);
  }

  /**
   * Load session from storage
   */
  async loadSession(): Promise<boolean> {
    const encrypted = await this.storageManager.get('at-protocol-session');
    if (!encrypted) return false;

    const decrypted = await this.decryptWithDeviceKey(encrypted);

    // Import DPoP key
    const dpopPrivateKey = await crypto.subtle.importKey(
      'jwk',
      decrypted.dpopKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    this.session = {
      did: decrypted.did,
      tokens: decrypted.tokens,
      dpopKey: { privateKey: dpopPrivateKey } as CryptoKeyPair,
      pdsEndpoint: decrypted.pdsEndpoint
    };

    return true;
  }

  /**
   * Get current DID
   */
  getDID(): string | undefined {
    return this.session?.did;
  }

  /**
   * Sign out and clear session
   */
  async signOut(): Promise<void> {
    if (this.session) {
      // Revoke tokens if possible
      try {
        await this.revokeTokens();
      } catch (error) {
        console.error('Token revocation failed:', error);
      }
    }

    this.session = undefined;
    await this.storageManager.delete('at-protocol-session');
  }
}
```

---

## Authorization with Flint Sync Service

### Request Flow with DPoP Tokens

```typescript
/**
 * Make authorized request to Flint Sync Service with DPoP proof
 */
async requestR2Credentials(): Promise<R2Credentials> {
  if (!this.session) {
    throw new Error('Not authenticated with AT Protocol');
  }

  // Generate DPoP proof for this request
  const dpopProof = await this.createDPoPProof({
    method: 'POST',
    url: 'https://sync.flint.app/api/r2-credentials',
    accessToken: this.session.tokens.access,
  });

  // Make request with DPoP proof
  const response = await fetch('https://sync.flint.app/api/r2-credentials', {
    method: 'POST',
    headers: {
      'Authorization': `DPoP ${this.session.tokens.access}`,
      'DPoP': dpopProof,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      did: this.session.did,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, refresh and retry
      await this.refreshTokens();
      return this.requestR2Credentials();
    }
    throw new Error(`Failed to get R2 credentials: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Create DPoP proof JWT
 */
private async createDPoPProof(params: {
  method: string;
  url: string;
  accessToken: string;
}): Promise<string> {
  if (!this.session?.dpopKey) {
    throw new Error('DPoP key not available');
  }

  // Create JWT header
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: await crypto.subtle.exportKey('jwk', this.session.dpopKey.publicKey),
  };

  // Create JWT payload
  const payload = {
    jti: this.generateJti(),
    htm: params.method,
    htu: params.url,
    iat: Math.floor(Date.now() / 1000),
    ath: await this.hashAccessToken(params.accessToken),
  };

  // Sign JWT
  return await this.signJWT(header, payload, this.session.dpopKey.privateKey);
}

/**
 * Hash access token for DPoP proof
 */
private async hashAccessToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return this.base64UrlEncode(hashBuffer);
}

/**
 * Refresh access token using refresh token
 */
private async refreshTokens(): Promise<void> {
  if (!this.session) {
    throw new Error('No session to refresh');
  }

  const response = await fetch(`${this.session.pdsEndpoint}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: this.session.tokens.refresh,
      client_id: 'https://flint.app/client-metadata.json',
    }),
  });

  if (!response.ok) {
    // Refresh failed, need to re-authenticate
    await this.signOut();
    throw new Error('Session expired, please sign in again');
  }

  const tokens = await response.json();
  this.session.tokens = {
    access: tokens.access_token,
    refresh: tokens.refresh_token,
  };

  await this.persistSession();
}
```

### Backend Verification (Flint Sync Service)

```typescript
// Cloudflare Worker - Flint Sync Service
import { verifyDPoPProof, verifyAccessToken } from '@atproto/oauth-client';

async function handleR2CredentialsRequest(request: Request): Promise<Response> {
  // Extract authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('DPoP ')) {
    return new Response('Missing DPoP Authorization', { status: 401 });
  }

  const accessToken = authHeader.slice(5);
  const dpopProof = request.headers.get('DPoP');

  if (!dpopProof) {
    return new Response('Missing DPoP proof', { status: 401 });
  }

  try {
    // 1. Verify DPoP proof
    const proofResult = await verifyDPoPProof({
      proof: dpopProof,
      method: request.method,
      url: request.url,
      accessToken
    });

    if (!proofResult.valid) {
      return new Response('Invalid DPoP proof', { status: 401 });
    }

    // 2. Verify access token and extract DID
    const tokenResult = await verifyAccessToken(accessToken, {
      expectedPublicKey: proofResult.publicKey
    });

    if (!tokenResult.valid) {
      return new Response('Invalid access token', { status: 401 });
    }

    const did = tokenResult.sub;

    // 3. Issue scoped R2 credentials for this DID
    const r2Credentials = await issueR2Credentials(did);

    return new Response(JSON.stringify(r2Credentials), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Authorization failed:', error);
    return new Response('Authorization failed', { status: 401 });
  }
}
```

---

## Storage Namespacing with DIDs

### R2 Bucket Structure

```
flint-sync-storage/
├── did:plc:abc123.../
│   ├── vault-identity.json          # Vault metadata + device list
│   ├── password-backup.encrypted    # Optional password-encrypted vault key
│   ├── documents/
│   │   ├── note-123.automerge      # Encrypted Automerge documents
│   │   ├── note-456.automerge
│   │   └── ...
│   └── metadata/
│       └── sync-state.json          # Sync coordination metadata
│
├── did:plc:xyz789.../
│   ├── vault-identity.json
│   └── documents/
│       └── ...
└── ...
```

### Scoped Credential Generation

```typescript
/**
 * Issue temporary R2 credentials scoped to user's DID namespace
 */
async function issueR2Credentials(did: string): Promise<R2Credentials> {
  // Create IAM policy allowing access only to /{did}/* prefix
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        Resource: [`arn:aws:s3:::flint-sync-storage/${did}/*`],
        Condition: {
          StringLike: {
            's3:prefix': [`${did}/*`]
          }
        }
      }
    ]
  };

  // Generate temporary credentials (1 hour expiry)
  const credentials = await cloudflareR2.generateTemporaryCredentials({
    policy,
    durationSeconds: 3600
  });

  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    endpoint: 'https://r2.flint.app',
    bucket: 'flint-sync-storage',
    prefix: `${did}/`,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
  };
}
```

---

## Graceful Degradation

### Offline and PDS Unavailability

AT Protocol identity is **only required for**:

1. Initial sync setup (first device)
2. Authorizing new devices
3. Refreshing R2 credentials (every 1 hour)

**App remains functional without AT Protocol:**

```typescript
class SyncService {
  private identityManager: AtProtocolIdentityManager;
  private r2Credentials?: R2Credentials;

  /**
   * Attempt to sync, gracefully degrade on failure
   */
  async sync(): Promise<SyncResult> {
    // Check if we have valid R2 credentials
    if (!this.r2Credentials || this.isExpired(this.r2Credentials)) {
      try {
        // Try to refresh credentials (requires AT Protocol)
        this.r2Credentials = await this.identityManager.requestR2Credentials();
      } catch (error) {
        // AT Protocol unavailable - continue in offline mode
        console.warn('Sync credentials unavailable, working offline:', error);
        return {
          status: 'offline',
          message: 'Working offline - sync will resume when connection restored'
        };
      }
    }

    // Credentials available - proceed with sync
    try {
      await this.performSync(this.r2Credentials);
      return { status: 'success' };
    } catch (error) {
      console.error('Sync failed:', error);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Check if app is functional without sync
   */
  isOfflineCapable(): boolean {
    // All core features work offline
    return true;
  }
}
```

### User Experience During Degradation

| Scenario                   | User Experience                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- |
| **PDS Down**               | Existing devices work normally. New device authorization delayed until PDS available. |
| **R2 Credentials Expired** | Queue local changes. Sync resumes when credentials refreshed.                         |
| **No Internet**            | Full offline functionality. Sync queued for later.                                    |
| **Sync Service Down**      | Continue with existing credentials until expiry. Then offline mode.                   |
| **DID Resolution Fails**   | Use cached DID document. Retry periodically.                                          |

---

## Device Management

### Listing Devices

```typescript
/**
 * Get list of authorized devices for this vault
 */
async getAuthorizedDevices(): Promise<DeviceInfo[]> {
  const vaultIdentity = await this.r2Service.download('vault-identity.json');
  return vaultIdentity.devices;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  publicKey: JsonWebKey;
  added: string;              // ISO timestamp
  lastSeen?: string;          // Updated on sync
  userAgent?: string;         // OS and app version
}
```

### Revoking Devices

```typescript
/**
 * Revoke access for a device
 */
async revokeDevice(deviceId: string): Promise<void> {
  // Load vault identity
  const vaultIdentity = await this.r2Service.download('vault-identity.json');

  // Remove device from list
  vaultIdentity.devices = vaultIdentity.devices.filter(
    d => d.deviceId !== deviceId
  );

  // Update vault identity
  await this.r2Service.upload('vault-identity.json', vaultIdentity);

  // Revoked device will fail to decrypt new data
  // (vault key not re-wrapped for revoked device)
}
```

### Device Authorization Expiry

- Device authorization does **not expire** by default
- User can revoke devices manually
- Lost device revocation prevents future decryption
- Existing cached data on revoked device remains encrypted

---

## Future Collaboration Features

### DID-to-DID Sharing (Post-Launch)

AT Protocol identity provides foundation for sharing:

```typescript
/**
 * Share note with another Flint user
 */
async shareNote(noteId: string, recipientDID: string): Promise<void> {
  // 1. Resolve recipient's DID document
  const recipientDIDDoc = await this.resolveDID(recipientDID);

  // 2. Generate shared encryption key for note
  const sharedKey = await this.generateSharedKey();

  // 3. Encrypt note content with shared key
  const encryptedNote = await this.encryptNote(noteId, sharedKey);

  // 4. Wrap shared key for recipient's public key
  const wrappedKey = await this.wrapKeyForRecipient(
    sharedKey,
    recipientDIDDoc.publicKey
  );

  // 5. Upload to shared namespace
  await this.r2Service.upload(
    `shared/${recipientDID}/${noteId}.automerge`,
    encryptedNote
  );

  // 6. Notify recipient via AT Protocol messaging
  await this.sendATProtocolMessage(recipientDID, {
    type: 'note-shared',
    noteId,
    wrappedKey,
    sharedBy: this.identityManager.getDID(),
  });
}
```

### Team Vaults

- Shared DID for team identity
- Multi-sig authorization for vault access
- Audit log of access via AT Protocol records

---

## Security Considerations

### Separation of Concerns

```
┌─────────────────────────────────────────────────────┐
│  AT Protocol Compromise                             │
│                                                     │
│  If attacker gains access to DID:                  │
│  ✅ Can access R2 storage (encrypted data)          │
│  ❌ Cannot decrypt vault (needs vault key)          │
│  ❌ Cannot authorize new devices (needs device key) │
│  ❌ Cannot impersonate user (needs DPoP key)        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Vault Key Compromise                               │
│                                                     │
│  If attacker gets vault key:                       │
│  ❌ Cannot access R2 without DID credentials        │
│  ✅ Can decrypt data IF they already have access    │
│  ❌ Cannot sync to R2 (needs AT Protocol auth)      │
└─────────────────────────────────────────────────────┘
```

### Defense in Depth

1. **DPoP Token Binding:** Prevents token theft
2. **Scoped R2 Credentials:** Limits blast radius
3. **Short Credential Expiry:** 1-hour window
4. **Device Authorization:** Separate from identity
5. **Zero-Knowledge Encryption:** Identity separate from data protection

---

## Implementation Checklist

### Phase 1: Basic AT Protocol Integration

- [ ] Implement OAuth client with DPoP support
- [ ] Handle discovery (PDS resolution from handle/DID)
- [ ] Session management (token storage, refresh)
- [ ] Error handling (network failures, auth errors)
- [ ] Graceful degradation (offline mode)

### Phase 2: Sync Service Integration

- [ ] Request R2 credentials from sync service
- [ ] Verify DPoP proofs on backend
- [ ] Handle credential expiry and refresh
- [ ] Monitor and log authorization events

### Phase 3: Device Management

- [ ] Store device list in vault-identity.json
- [ ] UI for viewing authorized devices
- [ ] Device revocation flow
- [ ] Last seen timestamp updates

### Phase 4: Polish

- [ ] Onboarding wizard for AT Protocol signup
- [ ] "Sign in with Bluesky" branding
- [ ] Help docs explaining AT Protocol benefits
- [ ] Error messages with recovery instructions

---

## Troubleshooting Guide

### Common Issues

**Issue:** "Failed to resolve PDS from handle"

- **Cause:** DNS resolution failed or invalid handle
- **Solution:** Try with DID directly, check DNS records

**Issue:** "DPoP proof verification failed"

- **Cause:** Clock skew or invalid signature
- **Solution:** Sync device clock, regenerate DPoP key pair

**Issue:** "Access token expired"

- **Cause:** Token refresh failed or network issue
- **Solution:** Sign out and sign in again

**Issue:** "Cannot authorize new device"

- **Cause:** PDS unavailable or session expired
- **Solution:** Refresh session on existing device first

---

## Testing Strategy

### Unit Tests

- DID resolution (various formats)
- DPoP proof generation and verification
- Token refresh logic
- Session persistence and recovery

### Integration Tests

- Full OAuth flow (with mock PDS)
- R2 credential request flow
- Device authorization flow
- Graceful degradation scenarios

### End-to-End Tests

- Sign in with real Bluesky account
- Multi-device setup with QR codes
- Sync across devices
- Device revocation

---

## Monitoring and Metrics

### Key Metrics to Track

1. **Authentication Success Rate**
   - OAuth flow completion rate
   - Token refresh success rate
   - DPoP verification success rate

2. **Authorization Performance**
   - DID resolution latency
   - R2 credential request latency
   - Token refresh latency

3. **Error Rates**
   - Failed authentications by error type
   - PDS unavailability incidents
   - DPoP proof failures

4. **User Behavior**
   - Time to complete OAuth flow
   - Drop-off points in onboarding
   - Frequency of device authorizations

---

## Related Documentation

- [Identity Alternatives Analysis](./03-IDENTITY-ALTERNATIVES-ANALYSIS.md) - Why AT Protocol was chosen
- [Encryption & Key Management](./04-ENCRYPTION-KEY-MANAGEMENT.md) - Vault encryption (separate from identity)
- [Backend Service](./05-BACKEND-SERVICE.md) - Flint Sync Service architecture
- [UI Design](./08-UI-DESIGN.md) - User-facing authentication flows

---

[← Previous: Design Principles](./01-DESIGN-PRINCIPLES.md) | [Next: Identity Alternatives Analysis →](./03-IDENTITY-ALTERNATIVES-ANALYSIS.md)
