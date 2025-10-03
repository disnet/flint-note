<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { settingsStore } from '../stores/settingsStore.svelte';

  interface Props {
    onShowChangelog?: (version: string, isCanary: boolean) => void;
  }

  let { onShowChangelog }: Props = $props();

  // State for update status
  let updateState = $state<
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'whats-new'
  >('idle');
  let updateInfo = $state<{
    version?: string;
    releaseDate?: string;
    releaseName?: string;
    releaseNotes?: string;
  }>({});
  let downloadProgress = $state(0);
  let errorMessage = $state('');
  let currentVersion = $state('');
  let isCanaryVersion = $state(false);

  // UI state
  let showNotification = $state(false);
  let showDetails = $state(false);

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
      showNotification = true;
    }

    // Update the last seen version to current
    await settingsStore.updateLastSeenVersion(currentVersion, isCanaryVersion);
  }

  function showChangelogViewer(): void {
    if (onShowChangelog && currentVersion) {
      onShowChangelog(currentVersion, isCanaryVersion);
      dismissNotification();
    }
  }

  async function checkForUpdates(): Promise<void> {
    if (!window.api) return;

    updateState = 'checking';
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
      updateState = 'error';
      errorMessage = 'Failed to check for updates';
    }
  }

  async function downloadUpdate(): Promise<void> {
    if (!window.api) return;

    updateState = 'downloading';
    try {
      await window.api.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      updateState = 'error';
      errorMessage = 'Failed to download update';
    }
  }

  async function installUpdate(): Promise<void> {
    if (!window.api) return;

    try {
      await window.api.installUpdate();
    } catch (error) {
      console.error('Failed to install update:', error);
      updateState = 'error';
      errorMessage = 'Failed to install update';
    }
  }

  function dismissNotification(): void {
    showNotification = false;
  }

  function formatReleaseNotes(notes?: string): string {
    if (!notes) return '';
    // Basic markdown-to-HTML conversion for display
    return notes
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  onMount(async () => {
    if (!window.api) return;

    await loadCurrentVersion();
    await checkForNewVersion();

    // Set up event listeners
    window.api.onUpdateChecking(() => {
      updateState = 'checking';
    });

    window.api.onUpdateAvailable((info) => {
      updateState = 'available';
      updateInfo = info;
      showNotification = true;
    });

    window.api.onUpdateNotAvailable(() => {
      updateState = 'idle';
      if (showNotification) {
        // Only show "up to date" message if user manually checked
        showNotification = false;
      }
    });

    window.api.onUpdateError((error) => {
      updateState = 'error';
      errorMessage = error.message;
      showNotification = true;
    });

    window.api.onUpdateDownloadProgress((progress) => {
      downloadProgress = progress.percent;
    });

    window.api.onUpdateDownloaded((info) => {
      updateState = 'downloaded';
      updateInfo = info;
      showNotification = true;
    });
  });

  onDestroy(() => {
    window.api?.removeAllUpdateListeners();
  });
</script>

<!-- Update Button in UI -->
<div class="update-controls">
  <button
    onclick={checkForUpdates}
    disabled={updateState === 'checking'}
    class="update-check-btn"
    title="Check for updates"
  >
    {updateState === 'checking' ? 'Checking...' : 'Check for Updates'}
  </button>

  {#if currentVersion}
    <span class="version-info">v{currentVersion}</span>
  {/if}
</div>

<!-- Update Notification -->
{#if showNotification}
  <div class="update-notification" class:error={updateState === 'error'}>
    <div class="notification-content">
      {#if updateState === 'available'}
        <div class="notification-header">
          <h3>Update Available</h3>
          <button onclick={dismissNotification} class="close-btn">&times;</button>
        </div>
        <p>Version {updateInfo.version} is available</p>
        {#if updateInfo.releaseName}
          <p class="release-name">{updateInfo.releaseName}</p>
        {/if}
        <div class="notification-actions">
          <button onclick={() => (showDetails = !showDetails)} class="details-btn">
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
          <button onclick={downloadUpdate} class="download-btn">Download</button>
        </div>

        {#if showDetails && updateInfo.releaseNotes}
          <div class="release-notes">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatReleaseNotes(updateInfo.releaseNotes)}
          </div>
        {/if}
      {:else if updateState === 'downloading'}
        <div class="notification-header">
          <h3>Downloading Update...</h3>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {downloadProgress}%"></div>
        </div>
        <p>{Math.round(downloadProgress)}% complete</p>
      {:else if updateState === 'downloaded'}
        <div class="notification-header">
          <h3>Update Ready</h3>
          <button onclick={dismissNotification} class="close-btn">&times;</button>
        </div>
        <p>Version {updateInfo.version} has been downloaded and is ready to install</p>
        <div class="notification-actions">
          <button onclick={dismissNotification} class="later-btn">Install Later</button>
          <button onclick={installUpdate} class="install-btn">Restart & Install</button>
        </div>
      {:else if updateState === 'error'}
        <div class="notification-header">
          <h3>Update Error</h3>
          <button onclick={dismissNotification} class="close-btn">&times;</button>
        </div>
        <p class="error-message">{errorMessage}</p>
        <div class="notification-actions">
          <button onclick={checkForUpdates} class="retry-btn">Retry</button>
        </div>
      {:else if updateState === 'whats-new'}
        <div class="notification-header">
          <h3>What's New</h3>
          <button onclick={dismissNotification} class="close-btn">&times;</button>
        </div>
        <p>Flint has been updated to version {currentVersion}</p>
        <div class="notification-actions">
          <button onclick={showChangelogViewer} class="changelog-btn"
            >View Changelog</button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .update-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .update-check-btn {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--bg-color, white);
    color: var(--text-color, black);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .update-check-btn:hover:not(:disabled) {
    background: var(--hover-bg-color, #f0f0f0);
  }

  .update-check-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .version-info {
    font-size: 0.75rem;
    color: var(--text-muted-color, #666);
  }

  .update-notification {
    position: fixed;
    top: 1rem;
    right: 1rem;
    background: var(--bg-color, white);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 400px;
    z-index: 1000;
  }

  .update-notification.error {
    border-color: #ff6b6b;
    background: #fff5f5;
  }

  .notification-content {
    padding: 1rem;
  }

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .notification-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: var(--text-muted-color, #666);
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--text-color, black);
  }

  .release-name {
    font-weight: 500;
    color: var(--primary-color, #007acc);
    margin: 0.25rem 0;
  }

  .notification-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .notification-actions button {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .details-btn,
  .later-btn,
  .retry-btn {
    background: var(--bg-color, white);
    color: var(--text-color, black);
  }

  .download-btn,
  .install-btn,
  .changelog-btn {
    background: var(--primary-color, #007acc);
    color: white;
    border-color: var(--primary-color, #007acc);
  }

  .notification-actions button:hover {
    opacity: 0.9;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-secondary-color, #f0f0f0);
    border-radius: 4px;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary-color, #007acc);
    transition: width 0.3s ease;
  }

  .release-notes {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary-color, #f8f9fa);
    border-radius: 4px;
    font-size: 0.875rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .error-message {
    color: #dc3545;
    font-size: 0.875rem;
  }
</style>
