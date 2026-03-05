<script lang="ts">
  import {
    getCloudSyncStatus,
    getCloudUserDid,
    isCloudAuthenticated,
    startBlueskyLogin,
    clearCloudSession,
    getLastSyncError,
    isInviteRequired,
    redeemInviteCode
  } from '../../lib/automerge/cloud-sync.svelte';
  import {
    getActiveVault,
    enableCloudSync,
    disableCloudSync
  } from '../../lib/automerge/state.svelte';
  import {
    getCloudFileSyncStatus,
    clearCloudFileSyncWarnings
  } from '../../lib/automerge/cloud-file-sync.svelte';
  import SyncStatus from './SyncStatus.svelte';

  let blueskyHandle = $state('');
  let inviteCodeInput = $state('');
  let isLoggingIn = $state(false);
  let isEnabling = $state(false);
  let isDisabling = $state(false);
  let isLoggingOut = $state(false);
  let isRedeemingInvite = $state(false);

  const authenticated = $derived(isCloudAuthenticated());
  const userDid = $derived(getCloudUserDid());
  const syncStatus = $derived(getCloudSyncStatus());
  const activeVault = $derived(getActiveVault());
  const cloudSyncEnabled = $derived(activeVault?.cloudSyncEnabled ?? false);
  const syncError = $derived(getLastSyncError());
  const needsInvite = $derived(isInviteRequired());
  const fileSyncStatus = $derived(getCloudFileSyncStatus());
  const fileSyncWarnings = $derived(fileSyncStatus.warnings);
  const fileSyncActive = $derived(
    fileSyncStatus.isSyncing ||
      fileSyncStatus.uploadQueue > 0 ||
      fileSyncStatus.downloadQueue > 0
  );
  const ownerMismatch = $derived(
    activeVault?.cloudOwnerDid != null &&
      activeVault.cloudOwnerDid !== '' &&
      activeVault.cloudOwnerDid !== userDid
  );

  async function handleLogin(): Promise<void> {
    if (!blueskyHandle.trim() || isLoggingIn) return;
    isLoggingIn = true;
    try {
      await startBlueskyLogin(blueskyHandle.trim());
    } finally {
      isLoggingIn = false;
    }
  }

  async function handleRedeemInvite(): Promise<void> {
    if (!inviteCodeInput.trim() || isRedeemingInvite) return;
    isRedeemingInvite = true;
    try {
      await redeemInviteCode(inviteCodeInput.trim());
    } finally {
      isRedeemingInvite = false;
    }
  }

  function handleInviteKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      handleRedeemInvite();
    }
  }

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      await clearCloudSession();
    } finally {
      isLoggingOut = false;
    }
  }

  async function handleEnableSync(): Promise<void> {
    if (isEnabling) return;
    isEnabling = true;
    try {
      await enableCloudSync();
    } finally {
      isEnabling = false;
    }
  }

  function handleDisableSync(): void {
    if (isDisabling) return;
    isDisabling = true;
    try {
      disableCloudSync();
    } finally {
      isDisabling = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<div class="cloud-sync-settings">
  <h3 class="section-title">Cloud Sync</h3>

  {#if !authenticated}
    <div class="login-section">
      <p class="description">
        Sign in with your Bluesky account to sync your notes across devices. Your notes
        are encrypted and stored securely.
      </p>

      <div class="login-form">
        <input
          type="text"
          class="handle-input"
          placeholder="your.handle.bsky.social"
          bind:value={blueskyHandle}
          onkeydown={handleKeydown}
          disabled={isLoggingIn}
        />
        <button
          class="action-button primary"
          onclick={handleLogin}
          disabled={isLoggingIn || !blueskyHandle.trim()}
        >
          {#if isLoggingIn}
            Connecting...
          {:else}
            Sign in with Bluesky
          {/if}
        </button>
      </div>

      {#if syncError}
        <p class="error-message">{syncError}</p>
      {/if}
    </div>
  {:else if needsInvite}
    <div class="invite-section">
      <p class="description">
        An invite code is required to use cloud sync. Enter your code below.
      </p>

      <div class="login-form">
        <input
          type="text"
          class="handle-input"
          placeholder="Invite code"
          bind:value={inviteCodeInput}
          onkeydown={handleInviteKeydown}
          disabled={isRedeemingInvite}
        />
        <button
          class="action-button primary"
          onclick={handleRedeemInvite}
          disabled={isRedeemingInvite || !inviteCodeInput.trim()}
        >
          {isRedeemingInvite ? 'Verifying...' : 'Submit Invite Code'}
        </button>
      </div>

      {#if syncError}
        <p class="error-message">{syncError}</p>
      {/if}
    </div>
  {:else}
    <div class="account-section">
      <div class="account-info">
        <span class="account-label">Signed in as</span>
        <span class="account-did" title={userDid}>{userDid}</span>
      </div>

      <SyncStatus status={syncStatus} error={syncError} />

      {#if fileSyncActive}
        <div class="file-sync-status">
          <span class="file-sync-indicator pulse"></span>
          <span class="file-sync-text">
            Syncing files...
            {#if fileSyncStatus.uploadQueue > 0}
              (uploading {fileSyncStatus.uploadQueue})
            {/if}
            {#if fileSyncStatus.downloadQueue > 0}
              (downloading {fileSyncStatus.downloadQueue})
            {/if}
          </span>
        </div>
      {/if}

      {#if fileSyncWarnings.length > 0}
        <div class="file-sync-warnings">
          <div class="warnings-header">
            <span class="warnings-title"
              >{fileSyncWarnings.length} file{fileSyncWarnings.length === 1 ? '' : 's'} could
              not sync</span
            >
            <button class="dismiss-warnings" onclick={clearCloudFileSyncWarnings}>
              dismiss
            </button>
          </div>
          <ul class="warnings-list">
            {#each fileSyncWarnings as warning (warning.hash)}
              <li>{warning.fileType}: {warning.reason}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if activeVault}
        <div class="vault-sync-toggle">
          <div class="vault-info">
            <span class="vault-name">{activeVault.name}</span>
            <span class="vault-sync-status">
              {#if cloudSyncEnabled}
                Cloud sync enabled
              {:else}
                Cloud sync disabled
              {/if}
            </span>
          </div>

          {#if cloudSyncEnabled}
            <button
              class="action-button danger"
              onclick={handleDisableSync}
              disabled={isDisabling}
            >
              {isDisabling ? 'Disabling...' : 'Disable Sync'}
            </button>
          {:else if ownerMismatch}
            <p class="owner-mismatch-warning">
              This vault was synced by a different account. Disable sync from the original
              account, or create a new vault.
            </p>
          {:else}
            <button
              class="action-button primary"
              onclick={handleEnableSync}
              disabled={isEnabling}
            >
              {isEnabling ? 'Enabling...' : 'Enable Sync'}
            </button>
          {/if}
        </div>
      {/if}

      <button
        class="action-button secondary logout-button"
        onclick={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  {/if}
</div>

<style>
  .cloud-sync-settings {
    padding: 1rem;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--text-color);
  }

  .description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  .login-section,
  .invite-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .error-message {
    color: #ef4444;
    font-size: 0.8125rem;
    margin: 0;
  }

  .handle-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .handle-input:focus {
    outline: none;
    border-color: var(--accent-color, #3b82f6);
  }

  .account-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .account-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 6px;
  }

  .account-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .account-did {
    font-size: 0.8125rem;
    color: var(--text-primary);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-sync-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
  }

  .vault-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vault-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .vault-sync-status {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .owner-mismatch-warning {
    font-size: 0.8125rem;
    color: #f59e0b;
    margin: 0;
    line-height: 1.4;
  }

  .logout-button {
    align-self: flex-start;
  }

  .action-button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s ease;
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-button.primary {
    background-color: var(--accent-color, #3b82f6);
    color: white;
  }

  .action-button.primary:hover:not(:disabled) {
    background-color: var(--accent-color-hover, #2563eb);
  }

  .action-button.secondary {
    background-color: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
  }

  .action-button.secondary:hover:not(:disabled) {
    background-color: var(--bg-hover);
  }

  .action-button.danger {
    background-color: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
  }

  .action-button.danger:hover:not(:disabled) {
    background-color: rgba(239, 68, 68, 0.1);
  }

  .file-sync-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 6px;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .file-sync-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #3b82f6;
    flex-shrink: 0;
  }

  .file-sync-indicator.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .file-sync-text {
    font-size: 0.8125rem;
  }

  .file-sync-warnings {
    padding: 0.75rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 6px;
  }

  .warnings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .warnings-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #f59e0b;
  }

  .dismiss-warnings {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .dismiss-warnings:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .warnings-list {
    margin: 0;
    padding: 0 0 0 1.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }
</style>
