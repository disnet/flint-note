<script lang="ts">
  import {
    getIsFileSyncEnabled,
    getSyncDirectory,
    enableFileSync,
    getActiveVault,
    setActiveSystemView
  } from '../lib/automerge/state.svelte';
  import {
    getCloudSyncStatus,
    isCloudAuthenticated
  } from '../lib/automerge/cloud-sync.svelte';
  import { isWeb } from '../lib/platform.svelte';
  import Tooltip from './Tooltip.svelte';

  // File sync state
  const fileSyncEnabled = $derived(getIsFileSyncEnabled());
  const syncDirectory = $derived(getSyncDirectory());
  const isWebUser = $derived(isWeb());

  // Cloud sync state
  const activeVault = $derived(getActiveVault());
  const cloudSyncEnabled = $derived(
    !!(activeVault?.cloudSyncEnabled && isCloudAuthenticated())
  );
  const cloudStatus = $derived(getCloudSyncStatus());

  // Loading state for enabling sync
  let isEnabling = $state(false);

  // Format path with ~ for home directory
  const displayPath = $derived.by(() => {
    if (!syncDirectory) return '';
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

  // Cloud status color
  const cloudDotColor = $derived.by(() => {
    if (!cloudSyncEnabled) return 'gray';
    switch (cloudStatus) {
      case 'connected':
        return 'green';
      case 'connecting':
        return 'yellow';
      case 'error':
        return 'red';
      case 'disconnected':
        return 'gray';
    }
  });

  // Tooltip text
  const tooltipText = $derived.by(() => {
    const parts: string[] = [];
    if (fileSyncEnabled && syncDirectory) {
      parts.push(`file sync to ${syncDirectory}`);
    }
    if (cloudSyncEnabled) {
      switch (cloudStatus) {
        case 'connected':
          parts.push('cloud sync');
          break;
        case 'connecting':
          parts.push('cloud sync connecting...');
          break;
        case 'error':
          parts.push('cloud sync error');
          break;
        case 'disconnected':
          parts.push('cloud sync disconnected');
          break;
      }
    }
    if (parts.length === 0) {
      return isWebUser ? 'Set up cloud sync' : 'Set up sync';
    }
    return 'Syncing: ' + parts.join(' + ');
  });

  // Whether neither sync is active
  const noSyncEnabled = $derived(!fileSyncEnabled && !cloudSyncEnabled);

  async function handleSetupSync(): Promise<void> {
    if (isWebUser) {
      // On web, file sync isn't available but cloud sync is — go to settings
      setActiveSystemView('settings');
      return;
    }
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

  function handleOpenCloudSettings(): void {
    setActiveSystemView('settings');
  }
</script>

<Tooltip text={tooltipText} position="bottom">
  <div class="sync-badge-container">
    {#if fileSyncEnabled}
      <!-- File sync indicator -->
      <button class="sync-badge enabled" onclick={handleOpenInFinder}>
        <span class="sync-indicator green"></span>
        <span class="sync-path">{displayPath}</span>
      </button>
    {/if}

    {#if cloudSyncEnabled}
      <!-- Cloud sync indicator -->
      <button class="sync-badge enabled" onclick={handleOpenCloudSettings}>
        <span
          class="sync-indicator {cloudDotColor}"
          class:pulse={cloudStatus === 'connecting'}
        ></span>
        <svg
          class="cloud-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
        {#if !fileSyncEnabled}
          <span class="sync-text">cloud sync</span>
        {/if}
      </button>
    {/if}

    {#if noSyncEnabled}
      <!-- No sync set up -->
      <button class="sync-badge setup" onclick={handleSetupSync} disabled={isEnabling}>
        <span class="sync-indicator gray"></span>
        <span class="sync-text">
          {#if isEnabling}
            selecting...
          {:else}
            set up sync
          {/if}
        </span>
      </button>
    {/if}
  </div>
</Tooltip>

<style>
  .sync-badge-container {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

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
    flex-shrink: 0;
  }

  .sync-indicator.green {
    background-color: #10b981;
  }

  .sync-indicator.yellow {
    background-color: #f59e0b;
  }

  .sync-indicator.red {
    background-color: #ef4444;
  }

  .sync-indicator.gray {
    background-color: var(--text-muted);
  }

  .sync-indicator.pulse {
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

  .cloud-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
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
