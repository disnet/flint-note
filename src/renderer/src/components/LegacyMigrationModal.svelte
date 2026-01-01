<script lang="ts">
  /**
   * Modal for migrating legacy SQLite-based vaults to Automerge
   */
  import {
    detectLegacyVaults,
    migrateLegacyVault,
    getMigrationProgress,
    resetMigrationState,
    type LegacyVaultInfo,
    type MigrationResult
  } from '../lib/automerge/legacy-migration.svelte';

  interface Props {
    onComplete: () => void;
    onCancel: () => void;
  }

  let { onComplete, onCancel }: Props = $props();

  // Component state
  type Stage = 'detecting' | 'progress' | 'complete' | 'error';
  let stage = $state<Stage>('detecting');
  let detectionError = $state<string | null>(null);

  // Multi-vault migration state
  let vaultsToMigrate = $state<LegacyVaultInfo[]>([]);
  let currentVaultIndex = $state(0);
  let migrationResults = $state<MigrationResult[]>([]);

  // Derived state
  let progress = $derived(getMigrationProgress());

  // Current vault being migrated
  let currentVault = $derived(vaultsToMigrate[currentVaultIndex] ?? null);

  // Aggregate stats from all migration results
  let aggregateStats = $derived.by(() => {
    const stats = {
      notes: 0,
      noteTypes: 0,
      workspaces: 0,
      epubs: 0,
      successCount: 0,
      failureCount: 0,
      totalErrors: [] as Array<{ vault: string; message: string }>
    };
    for (const result of migrationResults) {
      if (result.success && result.stats) {
        stats.notes += result.stats.notes;
        stats.noteTypes += result.stats.noteTypes;
        stats.workspaces += result.stats.workspaces;
        stats.epubs += result.stats.epubs;
        stats.successCount++;
      } else {
        stats.failureCount++;
        const vault = vaultsToMigrate[migrationResults.indexOf(result)];
        const errorMsg = result.errors?.[0]?.message ?? 'Unknown error';
        stats.totalErrors.push({ vault: vault?.name ?? 'Unknown', message: errorMsg });
      }
    }
    return stats;
  });

  // Initialize detection on mount
  $effect(() => {
    detectVaults();
    return () => {
      resetMigrationState();
    };
  });

  async function detectVaults(): Promise<void> {
    stage = 'detecting';
    detectionError = null;

    try {
      const vaults = await detectLegacyVaults();

      // Filter out already migrated vaults
      vaultsToMigrate = vaults.filter((v) => !v.hasExistingMigration);

      if (vaultsToMigrate.length === 0) {
        // No vaults to migrate - either none found or all already migrated
        onCancel();
        return;
      }

      // Start auto-migration
      await migrateAllVaults();
    } catch (error) {
      detectionError = error instanceof Error ? error.message : 'Failed to detect vaults';
      stage = 'error';
    }
  }

  async function migrateAllVaults(): Promise<void> {
    stage = 'progress';
    migrationResults = [];
    currentVaultIndex = 0;

    for (let i = 0; i < vaultsToMigrate.length; i++) {
      currentVaultIndex = i;
      const vault = vaultsToMigrate[i];

      const result = await migrateLegacyVault(
        vault.path,
        vault.name,
        vault.syncDirectoryName
      );

      migrationResults = [...migrationResults, result];
    }

    // All done - determine final stage based on results
    const anySuccess = migrationResults.some((r) => r.success);
    stage = anySuccess ? 'complete' : 'error';
  }

  function handleComplete(): void {
    resetMigrationState();
    onComplete();
  }

  function handleClose(): void {
    resetMigrationState();
    onCancel();
  }

  function progressPercentage(): number {
    if (!progress) return 0;
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  }
</script>

<div
  class="modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="migration-title"
>
  <div class="modal-container">
    <!-- Header -->
    <div class="modal-header">
      <h2 id="migration-title">
        {#if stage === 'detecting'}
          Detecting Legacy Vaults...
        {:else if stage === 'progress'}
          Migrating Vaults...
        {:else if stage === 'complete'}
          Migration Complete
        {:else}
          Migration Failed
        {/if}
      </h2>
    </div>

    <!-- Content -->
    <div class="modal-content">
      {#if stage === 'detecting'}
        <div class="detecting-content">
          <div class="spinner"></div>
          <p>Looking for legacy Flint vaults...</p>
        </div>
      {:else if stage === 'progress'}
        <div class="progress-content">
          <!-- Multi-vault progress indicator -->
          {#if vaultsToMigrate.length > 1}
            <div class="vault-progress-indicator">
              Vault {currentVaultIndex + 1} of {vaultsToMigrate.length}
            </div>
          {/if}

          <!-- Current vault name -->
          {#if currentVault}
            <div class="current-vault-name">{currentVault.name}</div>
          {/if}

          <div class="progress-info">
            <div class="progress-phase">
              {#if progress?.phase === 'extracting'}
                <span class="phase-icon">📖</span>
                Reading legacy data...
              {:else if progress?.phase === 'transforming'}
                <span class="phase-icon">🔄</span>
                Converting format...
              {:else if progress?.phase === 'writing'}
                <span class="phase-icon">💾</span>
                Creating new vault...
              {:else}
                <span class="phase-icon">⏳</span>
                {progress?.message || 'Processing...'}
              {/if}
            </div>
            <div class="progress-message">
              {progress?.message || 'Starting migration...'}
            </div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar" style="width: {progressPercentage()}%"></div>
          </div>

          {#if progress?.details}
            <div class="progress-details">
              {#if progress.details.notes !== undefined}
                <span class="detail">{progress.details.notes} notes</span>
              {/if}
              {#if progress.details.noteTypes !== undefined}
                <span class="detail">{progress.details.noteTypes} types</span>
              {/if}
              {#if progress.details.epubs !== undefined && progress.details.epubs > 0}
                <span class="detail">{progress.details.epubs} EPUBs</span>
              {/if}
            </div>
          {/if}
        </div>
      {:else if stage === 'complete'}
        <div class="complete-content">
          <div class="success-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h3>
            {#if vaultsToMigrate.length === 1}
              Migration Successful!
            {:else}
              Migrated {aggregateStats.successCount} of {vaultsToMigrate.length} Vaults
            {/if}
          </h3>

          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value">{aggregateStats.notes}</span>
              <span class="stat-label">Notes</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{aggregateStats.noteTypes}</span>
              <span class="stat-label">Note Types</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{aggregateStats.workspaces}</span>
              <span class="stat-label">Workspaces</span>
            </div>
            {#if aggregateStats.epubs > 0}
              <div class="stat-item">
                <span class="stat-value">{aggregateStats.epubs}</span>
                <span class="stat-label">EPUBs</span>
              </div>
            {/if}
          </div>

          {#if aggregateStats.totalErrors.length > 0}
            <div class="warnings-section">
              <h4>Failed Vaults ({aggregateStats.failureCount})</h4>
              <div class="warnings-list">
                {#each aggregateStats.totalErrors.slice(0, 5) as error, i (i)}
                  <div class="warning-item">
                    <span class="warning-type">{error.vault}</span>
                    <span class="warning-message">{error.message}</span>
                  </div>
                {/each}
                {#if aggregateStats.totalErrors.length > 5}
                  <div class="warning-more">
                    +{aggregateStats.totalErrors.length - 5} more failures
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="error-content">
          <div class="error-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h3>Migration Failed</h3>

          {#if detectionError}
            <div class="error-details">
              {detectionError}
            </div>
          {:else if aggregateStats.totalErrors.length > 0}
            <div class="error-details">
              {aggregateStats.totalErrors[0].message}
            </div>
          {/if}

          <p class="error-help">
            Your original vaults have not been modified. Please contact support if the
            issue persists.
          </p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      {#if stage === 'complete'}
        <button class="primary-button" onclick={handleComplete}> Open Vault </button>
      {:else if stage === 'error'}
        <button class="primary-button" onclick={handleClose}> Close </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal-container {
    background: var(--bg-primary);
    border-radius: 1rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  /* Detecting state */
  .detecting-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Progress state */
  .progress-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
  }

  .vault-progress-indicator {
    text-align: center;
    font-size: 0.875rem;
    color: var(--text-secondary);
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    align-self: center;
  }

  .current-vault-name {
    text-align: center;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .progress-info {
    text-align: center;
  }

  .progress-phase {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .phase-icon {
    font-size: 1.5rem;
  }

  .progress-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .progress-bar-container {
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--accent-primary);
    border-radius: 4px;
    transition: width 0.3s ease-out;
  }

  .progress-details {
    display: flex;
    justify-content: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  /* Complete state */
  .complete-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
  }

  .success-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--success-bg, rgba(16, 185, 129, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .success-icon svg {
    width: 32px;
    height: 32px;
    color: var(--success-text, #10b981);
  }

  .complete-content h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 1rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .warnings-section {
    width: 100%;
    margin-top: 1rem;
  }

  .warnings-section h4 {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .warnings-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 150px;
    overflow-y: auto;
  }

  .warning-item {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .warning-type {
    flex-shrink: 0;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }

  .warning-message {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warning-more {
    text-align: center;
    padding: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  /* Error state */
  .error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    text-align: center;
  }

  .error-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .error-icon svg {
    width: 32px;
    height: 32px;
    color: var(--error-text, #ef4444);
  }

  .error-content h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .error-details {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    color: var(--error-text, #ef4444);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    max-width: 100%;
    word-break: break-word;
  }

  .error-help {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  /* Buttons */
  .primary-button {
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
  }

  .primary-button:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .primary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
