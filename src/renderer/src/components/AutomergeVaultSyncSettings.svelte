<script lang="ts">
  import {
    getIsFileSyncAvailable,
    getIsFileSyncEnabled,
    getSyncDirectory,
    getIsSyncing,
    enableFileSync,
    disableFileSync
  } from '../lib/automerge/state.svelte';

  let isEnabling = $state(false);
  let isDisabling = $state(false);

  // Reactive getters
  const isAvailable = $derived(getIsFileSyncAvailable());
  const isEnabled = $derived(getIsFileSyncEnabled());
  const syncDirectory = $derived(getSyncDirectory());
  const isSyncing = $derived(getIsSyncing());

  async function handleEnableSync(): Promise<void> {
    if (isEnabling) return;
    isEnabling = true;
    try {
      await enableFileSync();
    } finally {
      isEnabling = false;
    }
  }

  async function handleDisableSync(): Promise<void> {
    if (isDisabling) return;
    isDisabling = true;
    try {
      await disableFileSync();
    } finally {
      isDisabling = false;
    }
  }
</script>

<div class="sync-settings">
  <h3 class="section-title">File Sync</h3>

  {#if !isAvailable}
    <p class="unavailable-message">File sync is not available in this environment.</p>
  {:else if isEnabled}
    <div class="sync-status">
      <div class="status-row">
        <span class="status-indicator" class:syncing={isSyncing}></span>
        <span class="status-text">
          {#if isSyncing}
            Syncing to filesystem
          {:else}
            File sync enabled
          {/if}
        </span>
      </div>

      <div class="directory-path">
        <span class="label">Directory:</span>
        <span class="path" title={syncDirectory}>{syncDirectory}</span>
      </div>

      <p class="description">
        Notes are automatically synced to markdown files in this directory. You can edit
        them with any text editor.
      </p>

      <button
        class="action-button danger"
        onclick={handleDisableSync}
        disabled={isDisabling}
      >
        {#if isDisabling}
          Disconnecting...
        {:else}
          Disconnect Sync
        {/if}
      </button>
    </div>
  {:else}
    <div class="sync-disabled">
      <p class="description">
        Enable file sync to automatically sync your notes to markdown files on your
        filesystem. This allows you to:
      </p>
      <ul class="benefits-list">
        <li>Edit notes with your favorite text editor</li>
        <li>Use version control (git) with your notes</li>
        <li>Access notes from other applications</li>
      </ul>

      <button
        class="action-button primary"
        onclick={handleEnableSync}
        disabled={isEnabling}
      >
        {#if isEnabling}
          Selecting...
        {:else}
          Choose Sync Directory
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .sync-settings {
    padding: 1rem;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--text-color);
  }

  .unavailable-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .sync-status {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #10b981;
  }

  .status-indicator.syncing {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .status-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-color);
  }

  .directory-path {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8125rem;
    background: var(--bg-tertiary);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
  }

  .directory-path .label {
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .directory-path .path {
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }

  .description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .sync-disabled {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .benefits-list {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .benefits-list li {
    margin-bottom: 0.25rem;
  }

  .action-button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s ease;
    align-self: flex-start;
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

  .action-button.danger {
    background-color: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
  }

  .action-button.danger:hover:not(:disabled) {
    background-color: rgba(239, 68, 68, 0.1);
  }
</style>
