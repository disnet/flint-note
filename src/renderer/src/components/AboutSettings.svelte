<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type CheckState =
    | 'idle'
    | 'checking'
    | 'available'
    | 'up-to-date'
    | 'downloading'
    | 'ready'
    | 'error';

  class AboutState {
    appVersion = $state('');
    appChannel = $state('');
    checkStatus: CheckState = $state('idle');
    availableVersion: string | null = $state(null);
    downloadProgress = $state(0);
    errorMsg: string | null = $state(null);
  }

  const about = new AboutState();

  async function loadVersion(): Promise<void> {
    try {
      const result = await window.api?.getAppVersion();
      if (result) {
        about.appVersion = result.version;
        about.appChannel = result.channel;
      }
    } catch (err) {
      console.error('Failed to get app version:', err);
    }
  }

  function setupListeners(): void {
    window.api?.onUpdateChecking(() => {
      about.checkStatus = 'checking';
      about.errorMsg = null;
    });

    window.api?.onUpdateAvailable((info) => {
      about.checkStatus = 'available';
      about.availableVersion = info.version;
    });

    window.api?.onUpdateNotAvailable(() => {
      about.checkStatus = 'up-to-date';
    });

    window.api?.onUpdateDownloadProgress((progress) => {
      about.checkStatus = 'downloading';
      about.downloadProgress = Math.round(progress.percent);
    });

    window.api?.onUpdateDownloaded((info) => {
      about.checkStatus = 'ready';
      about.availableVersion = info.version;
    });

    window.api?.onUpdateError((err) => {
      about.checkStatus = 'error';
      about.errorMsg = err.message;
    });
  }

  function handleCheckForUpdates(): void {
    about.checkStatus = 'checking';
    window.api?.checkForUpdates();
  }

  function handleInstallUpdate(): void {
    window.api?.installUpdate();
  }

  onMount(() => {
    loadVersion();
    setupListeners();
  });

  onDestroy(() => {
    window.api?.removeAllUpdateListeners();
  });

  const statusMessage = $derived.by(() => {
    switch (about.checkStatus) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return `Update ${about.availableVersion} available`;
      case 'up-to-date':
        return 'You are up to date';
      case 'downloading':
        return `Downloading update... ${about.downloadProgress}%`;
      case 'ready':
        return `Update ${about.availableVersion} ready to install`;
      case 'error':
        return about.errorMsg || 'Update check failed';
      default:
        return '';
    }
  });

  const showInstallButton = $derived(about.checkStatus === 'ready');
  const isChecking = $derived(
    about.checkStatus === 'checking' || about.checkStatus === 'downloading'
  );
</script>

<div class="about-settings">
  <h3>About</h3>

  <div class="version-section">
    <div class="version-info">
      <div class="app-name">Flint</div>
      <div class="version-row">
        <span class="version-label">Version</span>
        <span class="version-value">{about.appVersion || '...'}</span>
        {#if about.appChannel && about.appChannel !== 'latest'}
          <span class="channel-badge">{about.appChannel}</span>
        {/if}
      </div>
    </div>

    <div class="update-section">
      <div class="update-actions">
        {#if showInstallButton}
          <button class="action-btn primary" onclick={handleInstallUpdate}>
            Install & Restart
          </button>
        {:else}
          <button
            class="action-btn secondary"
            onclick={handleCheckForUpdates}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        {/if}
      </div>

      {#if about.checkStatus !== 'idle'}
        <div
          class="status-message"
          class:success={about.checkStatus === 'up-to-date'}
          class:info={about.checkStatus === 'available' || about.checkStatus === 'ready'}
          class:error={about.checkStatus === 'error'}
        >
          {#if about.checkStatus === 'checking'}
            <svg
              class="spinner"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
          {:else if about.checkStatus === 'downloading'}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {about.downloadProgress}%"></div>
            </div>
          {:else if about.checkStatus === 'up-to-date'}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          {:else if about.checkStatus === 'error'}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          {:else if about.checkStatus === 'available' || about.checkStatus === 'ready'}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          {/if}
          <span>{statusMessage}</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .about-settings {
    margin-top: 0;
  }

  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .version-section {
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .version-info {
    margin-bottom: 1rem;
  }

  .app-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .version-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .version-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .version-value {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    font-family: monospace;
  }

  .channel-badge {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.125rem 0.375rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.25rem;
  }

  .update-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .update-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .action-btn.primary {
    background: var(--accent-primary);
    color: var(--accent-text, white);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .action-btn.secondary {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
  }

  .status-message.success {
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    color: var(--success-text, #16a34a);
  }

  .status-message.info {
    background: var(--info-bg, rgba(59, 130, 246, 0.1));
    color: var(--info-text, #2563eb);
  }

  .status-message.error {
    background: var(--danger-bg, #fee2e2);
    color: var(--danger-text, #dc2626);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .progress-bar {
    width: 4rem;
    height: 4px;
    background: var(--border-primary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: currentColor;
    transition: width 0.2s ease;
  }
</style>
