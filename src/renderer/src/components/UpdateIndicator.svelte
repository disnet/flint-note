<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { settingsStore } from '../stores/settingsStore.svelte';
  import ChangelogViewer from './ChangelogViewer.svelte';

  // Update state
  let updateState = $state<'idle' | 'downloading' | 'ready' | 'whats-new'>('idle');
  let downloadProgress = $state(0);
  let currentVersion = $state('');
  let isCanaryVersion = $state(false);
  let showChangelogModal = $state(false);

  async function handleClick(): Promise<void> {
    if (updateState === 'ready' && window.api) {
      try {
        await window.api.installUpdate();
      } catch (error) {
        console.error('Failed to install update:', error);
      }
    } else if (updateState === 'whats-new') {
      showChangelogModal = true;
    }
  }

  function closeChangelogModal(): void {
    showChangelogModal = false;
    updateState = 'idle';
  }

  async function loadCurrentVersion(): Promise<void> {
    try {
      const versionInfo = await window.api?.getAppVersion();
      if (versionInfo) {
        currentVersion = versionInfo.version;
        isCanaryVersion = versionInfo.channel === 'canary';
      }
    } catch (error) {
      console.error('Failed to get current version:', error);
    }
  }

  async function checkForNewVersion(): Promise<void> {
    if (!currentVersion) return;

    await settingsStore.ensureInitialized();
    const lastSeenVersion = settingsStore.getLastSeenVersion(isCanaryVersion);

    // Check if this is a new version
    if (lastSeenVersion && lastSeenVersion !== currentVersion) {
      updateState = 'whats-new';
    }

    // Update the last seen version to current
    await settingsStore.updateLastSeenVersion(currentVersion, isCanaryVersion);
  }

  onMount(async () => {
    if (!window.api) return;

    await loadCurrentVersion();
    await checkForNewVersion();

    // When update is available, it will start downloading automatically
    // due to autoDownload=true in auto-updater-service.ts
    window.api.onUpdateAvailable(() => {
      updateState = 'downloading';
      downloadProgress = 0;
    });

    window.api.onUpdateDownloadProgress((progress) => {
      updateState = 'downloading';
      downloadProgress = progress.percent;
    });

    window.api.onUpdateDownloaded(() => {
      updateState = 'ready';
    });

    window.api.onUpdateError(() => {
      // Silently fail - reset to idle state
      if (updateState !== 'whats-new') {
        updateState = 'idle';
      }
    });

    window.api.onUpdateNotAvailable(() => {
      if (updateState !== 'whats-new') {
        updateState = 'idle';
      }
    });
  });

  onDestroy(() => {
    window.api?.removeAllUpdateListeners();
  });
</script>

{#if showChangelogModal}
  <div class="changelog-modal-overlay" onclick={closeChangelogModal}>
    <div class="changelog-modal" onclick={(e) => e.stopPropagation()}>
      <ChangelogViewer
        version={currentVersion}
        isCanary={isCanaryVersion}
        onClose={closeChangelogModal}
      />
    </div>
  </div>
{/if}

{#if updateState === 'downloading'}
  <div class="update-indicator">
    <div class="update-content">
      <div class="update-spinner"></div>
      <span class="update-text"
        >Downloading update... {Math.round(downloadProgress)}%</span
      >
    </div>
  </div>
{:else if updateState === 'ready'}
  <button
    class="update-indicator ready"
    onclick={handleClick}
    title="Install update and restart"
  >
    <div class="update-content">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
      <span class="update-text">Click to restart and install</span>
    </div>
  </button>
{:else if updateState === 'whats-new'}
  <button
    class="update-indicator whats-new"
    onclick={handleClick}
    title="View what's new"
  >
    <div class="update-content">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
      <span class="update-text">What's new...</span>
    </div>
  </button>
{/if}

<style>
  .update-indicator {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    user-select: none;
    margin-right: 0.5rem;
  }

  .update-indicator.ready,
  .update-indicator.whats-new {
    cursor: pointer;
    border: 1px solid var(--accent-primary);
    background: var(--bg-primary);
    color: var(--accent-primary);
  }

  .update-indicator.ready:hover,
  .update-indicator.whats-new:hover {
    background: var(--bg-tertiary);
    transform: translateY(-1px);
  }

  .changelog-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .changelog-modal {
    width: 90%;
    max-width: 800px;
    height: 80vh;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .update-content {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .update-text {
    font-weight: 500;
    white-space: nowrap;
  }

  .update-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-light);
    border-top: 2px solid var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
