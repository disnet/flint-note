<script lang="ts">
  import {
    getIsFileSyncEnabled,
    getSyncDirectory,
    enableFileSync
  } from '../lib/automerge/state.svelte';
  import { isWeb } from '../lib/platform.svelte';
  import Tooltip from './Tooltip.svelte';

  // Sync state
  const isEnabled = $derived(getIsFileSyncEnabled());
  const syncDirectory = $derived(getSyncDirectory());
  const isWebUser = $derived(isWeb());

  // Loading state for enabling sync
  let isEnabling = $state(false);

  // Format path with ~ for home directory
  const displayPath = $derived.by(() => {
    if (!syncDirectory) return '';
    // Detect home directory patterns: /Users/username/... or /home/username/...
    const macMatch = syncDirectory.match(/^\/Users\/[^/]+(.*)$/);
    if (macMatch) {
      return '~' + macMatch[1];
    }
    const linuxMatch = syncDirectory.match(/^\/home\/[^/]+(.*)$/);
    if (linuxMatch) {
      return '~' + linuxMatch[1];
    }
    return syncDirectory;
  });

  async function handleSetupSync(): Promise<void> {
    // For web users, the tooltip handles the message
    if (isWebUser) return;

    if (isEnabling) return;
    isEnabling = true;
    try {
      await enableFileSync();
    } finally {
      isEnabling = false;
    }
  }

  async function handleOpenInFinder(): Promise<void> {
    if (!syncDirectory) return;
    await window.api?.showItemInFolder({ path: syncDirectory });
  }
</script>

{#if isEnabled}
  <!-- Sync enabled state -->
  <Tooltip text={`Syncing to ${syncDirectory}`} position="bottom">
    <button class="sync-badge enabled" onclick={handleOpenInFinder}>
      <span class="sync-indicator"></span>
      <span class="sync-path">{displayPath}</span>
    </button>
  </Tooltip>
{:else}
  <!-- Sync not set up state -->
  <Tooltip
    text={isWebUser ? 'Sync requires the desktop app' : 'Sync notes to your filesystem'}
    position="bottom"
  >
    <button
      class="sync-badge setup"
      onclick={handleSetupSync}
      disabled={isEnabling || isWebUser}
    >
      <span class="sync-indicator disabled"></span>
      <span class="sync-text">
        {#if isEnabling}
          selecting...
        {:else}
          set up sync
        {/if}
      </span>
    </button>
  </Tooltip>
{/if}

<style>
  .sync-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.375rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    -webkit-app-region: no-drag;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 0.25rem;
  }

  .sync-badge:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .sync-badge.setup:disabled {
    cursor: default;
  }

  .sync-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #10b981;
    flex-shrink: 0;
  }

  .sync-indicator.disabled {
    background-color: var(--text-muted);
  }

  .sync-path {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .sync-text {
    white-space: nowrap;
  }

  /* Mobile adjustments */
  :global(.main-view.mobile-layout) .sync-badge {
    padding: 0.25rem 0.5rem;
  }
</style>
