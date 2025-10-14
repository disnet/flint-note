# UI Design and User Experience

← [Previous: Implementation Phases](./05-IMPLEMENTATION-PHASES.md) | [Next: Cost and Scaling](./07-COST-SCALING.md) →

This document details the user interface design and user experience flows for multi-device sync in Flint.

## Overview

The sync UI follows these principles:
- **Local-first**: Sync is completely optional
- **Clarity**: AT Protocol sign-in required for sync (clear communication)
- **Security**: Passwordless by default, optional password backup
- **Simplicity**: Minimal steps to get syncing
- **Transparency**: Clear sync status and device management

---

## User Flows

### 1. First-Time Setup

#### A. AT Protocol Sign-In (Required)

**Entry Point:** Settings → Sync

**States:**
- Not signed in (sync disabled)
- Signed in (sync options available)

**Flow:**
1. User sees "Sign in with AT Protocol to enable sync"
2. User enters their AT Protocol handle (e.g., "alice.bsky.social")
3. System opens browser for OAuth flow
4. User authorizes Flint app on their PDS
5. System receives DID and stores session tokens in OS keychain
6. Sync setup options now available

**Messaging:**
- Explain that AT Protocol provides portable identity
- Clarify that vault encryption is separate (zero-knowledge)
- Local-only mode works without sign-in

#### B. New Vault vs Existing Vault

**After AT Protocol Sign-In:**

User chooses one of two paths:
1. **Set Up New Vault** (first device with sync)
2. **I Already Have a Vault** (joining existing vault)

### 2. New Vault Setup (Passwordless)

**Goal:** Set up sync on first device without requiring password

**Steps:**
1. **Device Name Entry**
   - Auto-populate with system hostname (e.g., "Alice's MacBook Pro")
   - User can customize
   - Helps identify devices in vault

2. **Security Notice**
   - Vault key will be stored in OS keychain
   - Biometric unlock (Touch ID/Windows Hello)
   - To add devices, authorize from this device
   - Optional: Add password backup later

3. **Enable Sync**
   - System generates random 256-bit vault key
   - Stores in OS keychain (biometric-protected)
   - Generates device ECDH key pair
   - Creates vault identity with DID
   - Uploads encrypted vault identity to R2
   - Sync active

**Result:** User has working sync without creating a password

### 3. Joining Existing Vault

**Two Methods:**

#### A. Device Authorization (Recommended)

**Goal:** Transfer vault key securely without password

**New Device Steps:**
1. Choose "Authorize from Another Device"
2. Enter device name
3. Generate authorization request (ephemeral ECDH key pair)
4. Display 6-character code (e.g., "A3F9K2")
5. Display QR code (same data)
6. Show "Waiting for authorization..." spinner
7. Poll for approval from existing device

**Existing Device Steps:**
1. Go to Settings → Sync → Authorize New Device
2. Enter code from new device (or scan QR)
3. Review new device info (name, timestamp)
4. Approve or deny
5. If approved:
   - Derive shared secret via ECDH
   - Wrap vault key with shared secret
   - Upload device key to R2
6. New device receives wrapped key
7. New device unwraps vault key
8. Stores in OS keychain
9. Sync active

**Security:**
- Authorization codes expire after 15 minutes
- Single-use only
- ECDH ensures vault key never transmitted in plaintext

#### B. Password (If Enabled)

**Goal:** Join vault using password backup

**Prerequisites:** Password backup must be enabled on another device

**Steps:**
1. Choose "Use Password"
2. Enter vault password
3. System downloads encrypted vault key from R2
4. Derives decryption key from password (scrypt)
5. Decrypts vault key
6. Stores in OS keychain
7. Sync active

**Errors:**
- "Incorrect password" if decryption fails
- "No password backup found" if not enabled on original device

### 4. Enabling Password Backup (Optional)

**Entry Point:** Settings → Sync → Add Password Backup

**When:** After sync is already enabled

**Steps:**
1. User clicks "Enable Password Backup"
2. Explains benefits:
   - Add devices without existing device
   - Recovery if all devices lost
   - Easier device setup
3. Enter new password
4. Confirm password
5. System:
   - Derives encryption key from password (scrypt)
   - Encrypts vault key with password key
   - Uploads encrypted backup to R2
6. Show confirmation: "Password backup enabled"

**Recommendations:**
- Suggest using password manager
- Warn that password compromise exposes vault key
- Clarify this is optional

### 5. Sync Status Indicators

**Locations:**
- Main app header (sync icon)
- Settings → Sync (detailed status)
- Per-note indicator (optional)

**States:**

| State | Icon | Text | Color | Description |
|-------|------|------|-------|-------------|
| Synced | ✓ check-circle | "Synced" | Green | All changes synced |
| Syncing | ↻ refresh (spin) | "Syncing..." | Blue | Sync in progress |
| Pending | ⏱ clock | "Pending (N)" | Yellow | N changes queued |
| Error | ⚠ alert-triangle | "Sync error" | Red | Sync failed, will retry |
| Offline | ⊘ wifi-off | "Offline" | Gray | No network, will sync when online |
| Disabled | - | - | - | Sync not enabled |

**Last Sync Time:**
- Display relative time: "Last synced 2 minutes ago"
- Hover for absolute timestamp

### 6. Device Management

**Entry Point:** Settings → Sync → Manage Devices

**Display:**
- List of authorized devices
- For each device:
  - Device name
  - Device ID (short hash)
  - Date added
  - Last seen (if available)
  - "This device" indicator
  - Remove button

**Actions:**
- **Authorize New Device:** Opens authorization flow
- **Remove Device:** Revokes device access
  - Confirmation dialog
  - Removes device public key from vault identity
  - Device can no longer decrypt new data
- **Rename Device:** Update device name for clarity

### 7. Settings and Preferences

**Sync Settings Panel:**

```
Cloud Sync
├── Status: Synced | Last sync: 2 minutes ago
├── [Sync Now] Button
│
├── Account
│   ├── AT Protocol: alice.bsky.social (did:plc:abc123xyz)
│   └── [Sign Out]
│
├── Devices (3)
│   ├── Alice's MacBook Pro (this device)
│   ├── Alice's iPad
│   ├── Alice's Work Laptop
│   └── [Authorize New Device]
│
├── Security
│   ├── Encryption: Device Keychain (biometric)
│   ├── Password Backup: Not enabled
│   │   └── [Enable Password Backup]
│   └── [Export Vault Key] (advanced)
│
├── Sync Options
│   ├── Sync Interval: Every 1 minute (configurable)
│   ├── Auto-sync: Enabled
│   └── Background sync: Enabled
│
└── Advanced
    ├── Storage Used: 12.5 MB / 1 GB
    ├── Documents: 247 notes
    ├── [View Sync Logs]
    └── [Disable Sync]
```

---

## Svelte Components

### SyncSettings.svelte

Complete sync settings component with all flows:

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
          <h4>Security Notice</h4>
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
        <p class="backup-enabled">Password backup enabled</p>
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
    padding: 20px;
  }

  h3 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  h4 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  p {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .hint {
    font-size: 14px;
    color: var(--text-tertiary);
    margin-top: 4px;
  }

  /* AT Protocol Sign-in */
  .signin-required {
    text-align: center;
  }

  .at-signin {
    margin: 20px 0;
    text-align: left;
  }

  .at-signin label {
    display: block;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .at-signin input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 16px;
  }

  /* Setup Flows */
  .setup-choice,
  .setup-new,
  .setup-join {
    text-align: center;
  }

  .device-info {
    text-align: left;
    margin-bottom: 24px;
  }

  .device-info label {
    display: block;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .device-info input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 16px;
  }

  /* Security Notice */
  .security-notice {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
    text-align: left;
  }

  .security-notice h4 {
    margin-top: 0;
  }

  .security-notice ul {
    margin: 8px 0 0 20px;
    padding: 0;
  }

  .security-notice li {
    margin-bottom: 8px;
    color: var(--text-secondary);
  }

  /* Info Box */
  .info-box {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
    text-align: left;
  }

  .info-box h4 {
    margin-top: 0;
  }

  /* Device Authorization */
  .device-auth {
    text-align: center;
  }

  .auth-code {
    font-size: 32px;
    font-weight: bold;
    letter-spacing: 0.2em;
    text-align: center;
    padding: 20px;
    background: var(--surface);
    border: 2px solid var(--primary);
    border-radius: 8px;
    margin: 20px 0;
    color: var(--primary);
  }

  #qr-code {
    display: block;
    margin: 20px auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .waiting {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    color: var(--text-secondary);
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Password Auth */
  .password-auth input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 16px;
    margin-bottom: 16px;
  }

  /* Sync Status */
  .sync-status {
    text-align: left;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--warning);
  }

  .status-dot.synced {
    background: var(--success);
  }

  .last-sync {
    font-size: 14px;
    color: var(--text-tertiary);
    margin-bottom: 16px;
  }

  /* Password Backup */
  .password-backup-prompt {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin: 24px 0;
  }

  .password-backup-prompt h4 {
    margin-top: 0;
  }

  .password-backup-prompt input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 16px;
    margin: 12px 0;
  }

  .backup-enabled {
    color: var(--success);
    font-weight: 500;
  }

  /* Device Management */
  .manage-devices {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }

  /* Buttons */
  button {
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    margin: 8px;
    transition: all 0.2s;
  }

  button.primary {
    background: var(--primary);
    color: white;
  }

  button.primary:hover {
    background: var(--primary-hover);
  }

  button.secondary {
    background: var(--surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  button.secondary:hover {
    background: var(--surface-hover);
  }

  button.tertiary {
    background: transparent;
    color: var(--text-secondary);
  }

  button.tertiary:hover {
    color: var(--text-primary);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

### SyncIndicator.svelte

Compact sync status indicator for app header:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let syncStatus = $state<'synced' | 'syncing' | 'error' | 'offline' | 'disabled'>('disabled');
  let pendingChanges = $state(0);

  onMount(() => {
    // Subscribe to sync events
    const unsubscribe = window.api.onSyncStatus((status) => {
      syncStatus = status.state;
      pendingChanges = status.pendingChanges;
    });

    return unsubscribe;
  });
</script>

{#if syncStatus !== 'disabled'}
  <div class="sync-indicator" class:syncing={syncStatus === 'syncing'}>
    {#if syncStatus === 'synced'}
      <svg class="icon check" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Synced</span>

    {:else if syncStatus === 'syncing'}
      <svg class="icon refresh spin" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 11-9-9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M21 3v9h-9" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Syncing{pendingChanges > 0 ? ` ${pendingChanges}` : ''}...</span>

    {:else if syncStatus === 'error'}
      <svg class="icon error" viewBox="0 0 24 24">
        <path d="M12 2l9 17H3L12 2z" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Sync error</span>

    {:else if syncStatus === 'offline'}
      <svg class="icon offline" viewBox="0 0 24 24">
        <path d="M5 13a10 10 0 0114 0" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M8.5 16.5a5 5 0 017 0" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="20" r="1" fill="currentColor"/>
        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Offline</span>
    {/if}
  </div>
{/if}

<style>
  .sync-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .icon {
    width: 16px;
    height: 16px;
  }

  .icon.check {
    color: var(--success);
  }

  .icon.refresh {
    color: var(--primary);
  }

  .icon.error {
    color: var(--error);
  }

  .icon.offline {
    color: var(--text-tertiary);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
```

---

## Error States and Recovery

### Common Errors

**1. Network Errors**
- Message: "Unable to sync - check your internet connection"
- Action: Auto-retry with exponential backoff
- Recovery: Sync when back online

**2. Authentication Errors**
- Message: "AT Protocol session expired - please sign in again"
- Action: Show re-authentication dialog
- Recovery: Refresh OAuth tokens

**3. Storage Quota Exceeded**
- Message: "Sync storage full (1 GB limit reached)"
- Action: Show quota management screen
- Recovery: Delete old notes or upgrade plan (future)

**4. Encryption Errors**
- Message: "Unable to decrypt vault - incorrect password"
- Action: Prompt for password again
- Recovery: Try password backup or device authorization

**5. Conflict Errors (Rare)**
- Message: "Note was edited on multiple devices - automatically merged"
- Action: Show merged result
- Recovery: User can review merged content

### Error Handling Patterns

```typescript
// Automatic retry with backoff
class SyncErrorHandler {
  private retryCount = 0;
  private maxRetries = 5;

  async handleSyncError(error: Error): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      this.showPersistentError(error);
      return;
    }

    const delayMs = Math.pow(2, this.retryCount) * 1000; // 1s, 2s, 4s, 8s, 16s

    await new Promise(resolve => setTimeout(resolve, delayMs));

    this.retryCount++;
    try {
      await this.performSync();
      this.retryCount = 0; // Reset on success
    } catch (e) {
      await this.handleSyncError(e);
    }
  }

  private showPersistentError(error: Error): void {
    this.ui.showNotification({
      type: 'error',
      message: 'Sync failed after multiple attempts',
      actions: [
        { label: 'Retry Now', action: () => this.performSync() },
        { label: 'View Logs', action: () => this.showSyncLogs() }
      ],
      persistent: true
    });
  }
}
```

---

## Accessibility

### Keyboard Navigation
- All flows navigable via Tab/Shift+Tab
- Enter to submit forms
- Escape to cancel/go back

### Screen Readers
- ARIA labels on all interactive elements
- Live regions for sync status updates
- Descriptive button labels

### Visual Indicators
- High contrast for status indicators
- Icons plus text (never icon-only)
- Clear focus states

### Error Messages
- Announced via ARIA live regions
- Persistent until resolved or dismissed
- Clear action items

---

## Animations and Transitions

### Sync Indicator
- Spinning refresh icon during sync
- Smooth transition between states
- Subtle green pulse on successful sync

### Setup Flows
- Fade transitions between steps
- Slide-in for authorization code
- Progress indicators for multi-step flows

### Device Authorization
- Loading spinner while waiting
- Success checkmark animation on approval
- QR code fade-in

### Performance
- CSS transforms (not layout properties)
- RequestAnimationFrame for smooth animations
- Reduced motion support (prefers-reduced-motion)

---

## Mobile Considerations (Future)

While initial implementation is Electron desktop only, UI should be designed with eventual mobile support in mind:

- Touch-friendly tap targets (44px minimum)
- Responsive layout (works on various screen sizes)
- Native platform patterns (iOS/Android)
- Biometric authentication (Face ID, fingerprint)
- Camera for QR code scanning
- Platform-specific keychain (Keychain/Keystore)

---

## Summary

The sync UI emphasizes:
- **Clarity**: AT Protocol sign-in required (communicated upfront)
- **Security**: Passwordless default with optional password backup
- **Simplicity**: Minimal steps to enable sync
- **Transparency**: Clear status indicators and device management
- **Recovery**: Multiple paths for device authorization and recovery

**Key UX Decisions:**
1. AT Protocol sign-in required before sync options (clear gate)
2. Passwordless by default (best UX + security)
3. Device authorization via QR/code (no password needed)
4. Optional password backup (user choice)
5. Real-time sync status (always visible)
6. Easy device management (add/remove devices)

← [Previous: Implementation Phases](./05-IMPLEMENTATION-PHASES.md) | [Next: Cost and Scaling](./07-COST-SCALING.md) →
