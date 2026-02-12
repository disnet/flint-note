<script lang="ts">
  import type { CloudSyncStatus } from '../../lib/automerge/cloud-sync.svelte';

  interface Props {
    status: CloudSyncStatus;
    error: string | null;
  }

  const { status, error }: Props = $props();

  const statusLabel = $derived.by(() => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Error';
    }
  });

  const statusColor = $derived.by(() => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'connecting':
        return 'yellow';
      case 'disconnected':
        return 'gray';
      case 'error':
        return 'red';
    }
  });
</script>

<div class="sync-status">
  <div class="status-row">
    <span class="status-dot {statusColor}" class:pulse={status === 'connecting'}></span>
    <span class="status-label">{statusLabel}</span>
  </div>
  {#if error}
    <span class="error-text">{error}</span>
  {/if}
</div>

<style>
  .sync-status {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.green {
    background-color: #10b981;
  }

  .status-dot.yellow {
    background-color: #f59e0b;
  }

  .status-dot.gray {
    background-color: #9ca3af;
  }

  .status-dot.red {
    background-color: #ef4444;
  }

  .status-dot.pulse {
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

  .status-label {
    font-size: 0.8125rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .error-text {
    font-size: 0.75rem;
    color: #ef4444;
    margin-left: 1.125rem;
  }
</style>
