# Encryption & Key Management Strategy

[← Back to Design Principles](./01-DESIGN-PRINCIPLES.md) | [Next: Backend Service →](./03-BACKEND-SERVICE.md)

---

## Hybrid Approach: Passwordless by Default

**Philosophy:** Balance security, user experience, and multi-device convenience.

---

## Three Setup Paths

### 1. Primary Path: Passwordless (Recommended)

#### First Device

1. User clicks "Enable Sync"
2. System generates random 256-bit vault key
3. Vault key stored in OS keychain (biometric-protected)
4. Device generates ECDH key pair for authorization
5. Sync enabled - no password to remember!

#### Second Device

1. User clicks "Join Vault" → "Authorize from Another Device"
2. New device generates ephemeral ECDH key pair
3. Displays 6-character code or QR code
4. Existing device scans code and approves
5. Devices perform ECDH key agreement
6. Vault key wrapped and transferred via shared secret
7. New device stores vault key in its keychain

#### Advantages

- ✅ No password to remember
- ✅ Biometric unlock (Touch ID, Windows Hello)
- ✅ Hardware-backed security (OS keychain)
- ✅ Zero-knowledge maintained
- ✅ Best UX for most users

#### Disadvantages

- ⚠️ Requires access to existing device for setup
- ⚠️ If all devices lost without password backup, data unrecoverable

---

### 2. Optional Path: Password Backup

#### Enabling Password Backup

1. After sync enabled, user optionally adds password
2. Vault key encrypted with password-derived key (scrypt)
3. Encrypted vault key uploaded to R2 as backup
4. Password never leaves device

#### Using Password Backup

1. New device: "Join Vault" → "Use Password"
2. Enter password
3. Download encrypted vault key from R2
4. Derive decryption key from password
5. Decrypt and store vault key in keychain

#### Advantages

- ✅ Can set up new devices without existing device
- ✅ Recovery option if all devices lost
- ✅ Familiar authentication flow
- ✅ Still zero-knowledge (password not sent to server)

#### Disadvantages

- ⚠️ Password to remember
- ⚠️ Password compromise exposes vault key
- ⚠️ Must be enabled explicitly

---

### 3. AT Protocol Identity (Required for Sync)

Users **must** sign in with AT Protocol to enable sync:

- Provides portable DID for identity and authorization
- DID determines R2 storage namespace (`{did}/vault-identity.json`)
- Authorization checked by Flint's sync service backend
- Enables future collaboration features

**Note:** AT Protocol login is for identity and authorization only, **not encryption**. Vault keys remain managed via device keychain or password backup and are never sent to Flint's servers.

---

## Security Properties Comparison

| Property | Passwordless | Password Backup | AT Protocol |
|----------|--------------|-----------------|-------------|
| Zero-knowledge | ✅ Yes | ✅ Yes | ✅ Yes |
| Biometric unlock | ✅ Yes | ✅ Yes | ✅ Yes |
| No password | ✅ Yes | ❌ No | ✅ Yes |
| Easy device setup | ⚠️ Requires device | ✅ Password only | ⚠️ Requires device |
| Recovery option | ❌ No | ✅ Password | ❌ No |
| Hardware-backed | ✅ Yes | ✅ Yes | ✅ Yes |

---

## Recommended Strategy

### For Most Users

1. Sign in with AT Protocol (required for sync)
2. Start with passwordless (device keychain)
3. After using for a while, optionally add password backup

### For Users Who Lose Devices Often

1. Sign in with AT Protocol
2. Enable password backup immediately
3. Store password in password manager

### For Technical Users

1. Sign in with AT Protocol
2. Passwordless by default
3. Export encrypted vault key to file as manual backup
4. Store backup securely (USB drive, encrypted cloud storage)

---

## Vault Identity Structure

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

---

## Encryption Implementation

### Primary Flow: Device Keychain (No Password)

```typescript
import { webcrypto as crypto } from 'crypto';
import { safeStorage } from 'electron';

class EncryptionService {
  private vaultKey?: CryptoKey;
  private deviceKeyPair?: CryptoKeyPair;
  private vaultId?: string;

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
      did: this.identityManager.getDID()!,
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
      this.deviceKeyPair = { privateKey } as CryptoKeyPair;
    }
  }
}
```

### Device Authorization Flow

```typescript
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
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    this.vaultKey,
    sharedSecret,
    { name: 'AES-GCM', iv }
  );

  const currentDeviceId = await this.storageManager.get('device-id');
  const authorizerPublicKeyJwk = await crypto.subtle.exportKey(
    'jwk',
    this.deviceKeyPair.publicKey
  );

  return {
    deviceId: authRequest.deviceId,
    wrappedKey: Array.from(new Uint8Array(wrappedKey)),
    iv: Array.from(iv),
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
  const iv = new Uint8Array(deviceKey.iv);

  this.vaultKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBuffer,
    sharedSecret,
    { name: 'AES-GCM', iv },
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
```

### Optional: Password Backup

```typescript
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
```

### Encryption/Decryption

```typescript
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
```

---

## Security Properties

### Zero-Knowledge Architecture

**What is encrypted:**
- All note content (markdown)
- All note metadata (titles, tags, frontmatter)
- Automerge document binaries
- Everything stored in R2

**Who has encryption keys:**
- User's devices (in OS keychain)
- Optionally: password-encrypted backup in R2

**Who CANNOT decrypt:**
- Flint servers
- Cloudflare R2
- AT Protocol PDS
- Network observers
- Database administrators

### Key Management Security

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

### Device Authorization Security

- Each device has unique ECDH key pair (P-256 curve)
- New devices request authorization via short code (6 chars) or QR code
- Existing device approves and derives shared secret (ECDH)
- Vault key wrapped with shared secret, never transmitted in plaintext
- Authorization codes are single-use and expire after 15 minutes

### Biometric Protection

- OS keychain access gated by biometric (Touch ID, Windows Hello, etc.)
- Flint never handles biometric data directly
- OS handles authentication and key unwrapping
- Fallback to device password if biometric unavailable

---

## Threat Model

### Protected Against

- ✅ R2 compromise (data encrypted)
- ✅ Flint Sync Service compromise (data encrypted, service never sees keys)
- ✅ Network eavesdropping (TLS + encrypted payloads)
- ✅ Stolen laptop (keychain encrypted by OS)
- ✅ Malicious devices (authorization required)
- ✅ Password guessing (scrypt with high N factor if using password backup)
- ✅ Unauthorized R2 access (scoped credentials per DID)
- ✅ Cross-user data access (enforced by R2 credential scoping)

### Not Protected Against

- ❌ Compromised device with unlocked keychain
- ❌ Malware with keychain access
- ❌ User sharing password backup with attacker
- ❌ Physical access to unlocked device
- ❌ Compromised AT Protocol DID (attacker could access encrypted data, but not decrypt without vault key)

---

## Key Rotation and Recovery

### Password Change

- Re-encrypt vault key with new password
- Update R2 password backup
- Existing device keys unchanged

### Lost Device

- Revoke device from vault identity
- Remove device's public key from authorized list
- Device can no longer decrypt new data

### Lost All Devices

- If password backup enabled: recover with password
- If no password backup: data unrecoverable
- Prominent warnings during setup about this risk

### Compromised Password

- Change password immediately
- Revoke all device authorizations
- Re-authorize known devices only

---

**Next:** [Backend Service Architecture →](./03-BACKEND-SERVICE.md)
