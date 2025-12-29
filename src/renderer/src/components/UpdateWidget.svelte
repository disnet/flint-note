<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

  interface UpdateInfo {
    version: string;
    releaseDate?: string;
    releaseName?: string;
    releaseNotes?: string;
  }

  interface DownloadProgress {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  }

  // Use class-based state management to ensure proper Svelte 5 recognition
  class UpdateWidgetState {
    state: UpdateState = $state('idle');
    downloadProgress = $state(0);
    newVersion: string | null = $state(null);
  }

  const widgetState = new UpdateWidgetState();

  function setupListeners(): void {
    window.api?.onUpdateChecking(() => {
      widgetState.state = 'checking';
    });

    window.api?.onUpdateAvailable((info: UpdateInfo) => {
      widgetState.newVersion = info.version;
      // Auto-download is enabled, so we'll see download progress
    });

    window.api?.onUpdateNotAvailable(() => {
      widgetState.state = 'idle';
    });

    window.api?.onUpdateDownloadProgress((progress: DownloadProgress) => {
      widgetState.state = 'downloading';
      widgetState.downloadProgress = Math.round(progress.percent);
    });

    window.api?.onUpdateDownloaded((info: UpdateInfo) => {
      widgetState.state = 'ready';
      widgetState.newVersion = info.version;
    });

    window.api?.onUpdateError((error: { message: string; stack?: string }) => {
      console.error('Update error:', error.message);
      widgetState.state = 'error';
      // Reset to idle after a few seconds
      setTimeout(() => {
        widgetState.state = 'idle';
      }, 5000);
    });
  }

  function handleInstall(): void {
    window.api?.installUpdate();
  }

  function handleDismiss(): void {
    widgetState.state = 'idle';
  }

  onMount(() => {
    setupListeners();
    // Check for updates on startup
    window.api?.checkForUpdates();
  });

  onDestroy(() => {
    window.api?.removeAllUpdateListeners();
  });

  // Format progress for display
  const progressText = $derived(
    widgetState.state === 'downloading' ? `${widgetState.downloadProgress}%` : ''
  );

  // Should we show the widget?
  const visible = $derived(
    widgetState.state === 'downloading' || widgetState.state === 'ready'
  );
</script>

{#if visible}
  <div class="update-widget" class:ready={widgetState.state === 'ready'}>
    {#if widgetState.state === 'downloading'}
      <div class="update-content" title="Downloading update...">
        <svg
          class="download-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span class="progress-text">{progressText}</span>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {widgetState.downloadProgress}%"></div>
        </div>
      </div>
    {:else if widgetState.state === 'ready'}
      <button
        class="update-button"
        onclick={handleInstall}
        title="Click to install update and restart"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>Update {widgetState.newVersion}</span>
      </button>
      <button class="dismiss-button" onclick={handleDismiss} title="Dismiss">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  .update-widget {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    -webkit-app-region: no-drag;
  }

  .update-widget.ready {
    background: var(--accent-primary);
    color: white;
  }

  .update-content {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--text-secondary);
  }

  .download-icon {
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

  .progress-text {
    min-width: 2rem;
    text-align: right;
  }

  .progress-bar {
    width: 3rem;
    height: 4px;
    background: var(--border-primary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.2s ease;
  }

  .update-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .update-button:hover {
    text-decoration: underline;
  }

  .dismiss-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    margin-left: 0.125rem;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    border-radius: 0.125rem;
  }

  .dismiss-button:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.2);
  }
</style>
