<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getStorageStats,
    compactVaultDocument,
    getActiveVaultId
  } from '../lib/automerge/repo';
  import { settingsStore } from '../stores/settingsStore.svelte';

  // State
  let stats = $state<{
    entryCount: number;
    totalSizeKB: number;
    entries: { key: string; sizeKB: number }[];
  } | null>(null);
  let isLoading = $state(false);
  let isCompacting = $state(false);
  let compactionResult = $state<'success' | 'error' | null>(null);
  let showDetails = $state(false);

  async function loadStats(): Promise<void> {
    isLoading = true;
    try {
      stats = await getStorageStats();
    } catch (error) {
      console.error('Failed to load storage stats:', error);
    } finally {
      isLoading = false;
    }
  }

  async function handleCompact(): Promise<void> {
    const vaultId = getActiveVaultId();
    if (!vaultId) {
      console.error('No active vault');
      return;
    }

    const confirmed = window.confirm(
      'This will compact the vault document, removing change history to speed up startup.\n\n' +
        'After compaction:\n' +
        '1. The app will need to be reloaded\n' +
        '2. You should clear IndexedDB in DevTools to reclaim space\n\n' +
        'Continue?'
    );

    if (!confirmed) return;

    isCompacting = true;
    compactionResult = null;

    try {
      const result = await compactVaultDocument(vaultId);
      if (result) {
        compactionResult = 'success';
        // Reload after a short delay to show success message
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        compactionResult = 'error';
      }
    } catch (error) {
      console.error('Compaction failed:', error);
      compactionResult = 'error';
    } finally {
      isCompacting = false;
    }
  }

  function handleClearIndexedDB(): void {
    const confirmed = window.confirm(
      'This will clear ALL IndexedDB data for this app.\n\n' +
        'WARNING: This will delete all vault data!\n' +
        'Only do this after compaction if you want to reclaim space.\n\n' +
        'Continue?'
    );

    if (!confirmed) return;

    try {
      indexedDB.deleteDatabase('flint-notes');
      alert('IndexedDB cleared. The app will now reload.');
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
      alert('Failed to clear IndexedDB. Check console for details.');
    }
  }

  onMount(() => {
    loadStats();
  });

  // Format size nicely
  function formatSize(kb: number): string {
    if (kb >= 1024) {
      return `${(kb / 1024).toFixed(1)} MB`;
    }
    return `${kb.toFixed(1)} KB`;
  }

  // Determine if storage is large (> 1MB)
  const isStorageLarge = $derived(stats ? stats.totalSizeKB > 1024 : false);
</script>

<div class="debug-settings">
  <h3>Debug / Performance</h3>

  <div class="stats-section">
    <div class="stats-header">
      <span class="stats-label">IndexedDB Storage</span>
      <button class="refresh-btn" onclick={loadStats} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Refresh'}
      </button>
    </div>

    {#if stats}
      <div class="stats-summary" class:warning={isStorageLarge}>
        <div class="stat-item">
          <span class="stat-value">{formatSize(stats.totalSizeKB)}</span>
          <span class="stat-label">Total Size</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{stats.entryCount}</span>
          <span class="stat-label">Entries</span>
        </div>
      </div>

      {#if isStorageLarge}
        <div class="warning-message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </svg>
          <span>Large storage size may cause slow startup. Consider compacting.</span>
        </div>
      {/if}

      <button class="toggle-details" onclick={() => (showDetails = !showDetails)}>
        {showDetails ? 'Hide' : 'Show'} Details
      </button>

      {#if showDetails}
        <div class="stats-details">
          <div class="details-header">Top entries by size:</div>
          {#each stats.entries.slice(0, 10) as entry (entry.key)}
            <div class="entry-row">
              <span class="entry-key" title={entry.key}>{entry.key.slice(0, 40)}...</span>
              <span class="entry-size">{formatSize(entry.sizeKB)}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else if !isLoading}
      <div class="stats-error">Failed to load storage stats</div>
    {/if}
  </div>

  <div class="actions-section">
    <div class="action-item">
      <div class="action-info">
        <span class="action-title">Compact Vault</span>
        <span class="action-description">
          Creates a fresh document with current state only, removing change history.
          Speeds up app startup significantly.
        </span>
      </div>
      <button class="action-btn primary" onclick={handleCompact} disabled={isCompacting}>
        {#if isCompacting}
          Compacting...
        {:else if compactionResult === 'success'}
          Done! Reloading...
        {:else}
          Compact
        {/if}
      </button>
    </div>

    {#if compactionResult === 'error'}
      <div class="error-message">Compaction failed. Check console for details.</div>
    {/if}

    <div class="action-item danger">
      <div class="action-info">
        <span class="action-title">Clear IndexedDB</span>
        <span class="action-description">
          Deletes ALL stored data. Only use after compaction to reclaim space, or to reset
          completely.
        </span>
      </div>
      <button class="action-btn danger" onclick={handleClearIndexedDB}>
        Clear All
      </button>
    </div>

    <div class="action-item">
      <div class="action-info">
        <span class="action-title">Simulate Windows Platform</span>
        <span class="action-description">
          Show Windows-style window controls instead of macOS traffic lights. Useful for
          testing cross-platform UI.
        </span>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={settingsStore.settings.advanced.simulateWindowsPlatform ?? false}
          onchange={async (e) => {
            await settingsStore.updateSettings({
              advanced: {
                ...settingsStore.settings.advanced,
                simulateWindowsPlatform: e.currentTarget.checked
              }
            });
          }}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</div>

<style>
  .debug-settings {
    margin-top: 0;
  }

  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stats-section {
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .stats-label {
    font-weight: 500;
    color: var(--text-primary);
  }

  .refresh-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--bg-primary);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stats-summary {
    display: flex;
    gap: 2rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border-radius: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .stats-summary.warning {
    border: 1px solid var(--warning-border, #f59e0b);
    background: var(--warning-bg, rgba(245, 158, 11, 0.1));
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .warning-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--warning-bg, rgba(245, 158, 11, 0.1));
    border: 1px solid var(--warning-border, #f59e0b);
    border-radius: 0.375rem;
    color: var(--warning-text, #d97706);
    font-size: 0.8125rem;
    margin-bottom: 0.75rem;
  }

  .toggle-details {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
  }

  .toggle-details:hover {
    color: var(--text-primary);
  }

  .stats-details {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border-radius: 0.375rem;
    font-size: 0.75rem;
  }

  .details-header {
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
  }

  .entry-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--border-light);
  }

  .entry-row:last-child {
    border-bottom: none;
  }

  .entry-key {
    color: var(--text-secondary);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry-size {
    color: var(--text-primary);
    font-weight: 500;
    flex-shrink: 0;
    margin-left: 0.5rem;
  }

  .stats-error {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-style: italic;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .action-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    gap: 1rem;
  }

  .action-item.danger {
    border: 1px solid var(--danger-border, #ef4444);
  }

  .action-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1;
  }

  .action-title {
    font-weight: 500;
    color: var(--text-primary);
  }

  .action-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
  }

  .action-btn.primary {
    background: var(--accent-primary);
    color: var(--accent-text, white);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .action-btn.primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .action-btn.danger {
    background: var(--danger-bg, #fee2e2);
    color: var(--danger-text, #dc2626);
    border: 1px solid var(--danger-border, #ef4444);
  }

  .action-btn.danger:hover {
    background: var(--danger-hover, #fecaca);
  }

  .error-message {
    padding: 0.5rem 0.75rem;
    background: var(--danger-bg, #fee2e2);
    border: 1px solid var(--danger-border, #ef4444);
    border-radius: 0.375rem;
    color: var(--danger-text, #dc2626);
    font-size: 0.8125rem;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-tertiary, #ccc);
    transition: 0.2s;
    border-radius: 24px;
  }

  .toggle-slider::before {
    position: absolute;
    content: '';
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.2s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: var(--accent-primary);
  }

  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }
</style>
