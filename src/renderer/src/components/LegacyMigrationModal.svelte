<script lang="ts">
  /**
   * Modal for migrating legacy SQLite-based vaults to Automerge
   */
  import {
    detectLegacyVaults,
    detectLegacyVaultAtPath,
    browseForVault,
    migrateLegacyVault,
    getMigrationProgress,
    getIsMigrating,
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
  type Stage = 'detecting' | 'select' | 'progress' | 'complete' | 'error';
  let stage = $state<Stage>('detecting');
  let detectedVaults = $state<LegacyVaultInfo[]>([]);
  let selectedVault = $state<LegacyVaultInfo | null>(null);
  let migrationResult = $state<MigrationResult | null>(null);
  let detectionError = $state<string | null>(null);

  // Derived state
  let progress = $derived(getMigrationProgress());
  let isMigrating = $derived(getIsMigrating());

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
      detectedVaults = vaults;
      stage = 'select';
    } catch (error) {
      detectionError = error instanceof Error ? error.message : 'Failed to detect vaults';
      stage = 'select';
    }
  }

  async function handleBrowse(): Promise<void> {
    const path = await browseForVault();
    if (!path) return;

    const vaultInfo = await detectLegacyVaultAtPath(path);
    if (vaultInfo) {
      // Check if already in list
      const exists = detectedVaults.some((v) => v.path === vaultInfo.path);
      if (!exists) {
        detectedVaults = [...detectedVaults, vaultInfo];
      }
      selectedVault = vaultInfo;
    } else {
      detectionError = 'No legacy Flint vault found at that location';
    }
  }

  async function handleMigrate(): Promise<void> {
    if (!selectedVault) return;

    stage = 'progress';
    migrationResult = null;

    const result = await migrateLegacyVault(
      selectedVault.path,
      selectedVault.name,
      selectedVault.syncDirectoryName
    );

    migrationResult = result;
    stage = result.success ? 'complete' : 'error';
  }

  function handleComplete(): void {
    resetMigrationState();
    onComplete();
  }

  function handleCancel(): void {
    if (!isMigrating) {
      resetMigrationState();
      onCancel();
    }
  }

  function formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
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
        {:else if stage === 'select'}
          Import Legacy Vault
        {:else if stage === 'progress'}
          Migration in Progress
        {:else if stage === 'complete'}
          Migration Complete
        {:else}
          Migration Failed
        {/if}
      </h2>
      {#if stage === 'select' && !isMigrating}
        <button class="close-button" onclick={handleCancel} aria-label="Close">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="modal-content">
      {#if stage === 'detecting'}
        <div class="detecting-content">
          <div class="spinner"></div>
          <p>Looking for legacy Flint vaults...</p>
        </div>
      {:else if stage === 'select'}
        <div class="select-content">
          {#if detectionError}
            <div class="error-banner">{detectionError}</div>
          {/if}

          <p class="intro-text">
            Select a legacy vault to migrate to the new Automerge format. Your original
            files will not be modified.
          </p>

          {#if detectedVaults.length > 0}
            <div class="vault-list">
              {#each detectedVaults as vault (vault.path)}
                <button
                  class="vault-item"
                  class:selected={selectedVault?.path === vault.path}
                  class:already-migrated={vault.hasExistingMigration}
                  onclick={() => (selectedVault = vault)}
                  disabled={vault.hasExistingMigration}
                >
                  <div class="vault-info">
                    <span class="vault-icon">
                      {vault.hasExistingMigration ? '✓' : '📁'}
                    </span>
                    <div class="vault-details">
                      <span class="vault-name">{vault.name}</span>
                      <span class="vault-path">{vault.path}</span>
                    </div>
                  </div>
                  <div class="vault-stats">
                    <span class="stat">{vault.noteCount} notes</span>
                    {#if vault.epubCount > 0}
                      <span class="stat">{vault.epubCount} EPUBs</span>
                    {/if}
                    <span class="stat date">{formatDate(vault.lastModified)}</span>
                    {#if vault.hasExistingMigration}
                      <span class="migrated-badge">Already migrated</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <p>No legacy vaults found automatically.</p>
              <p class="subtle">Use the browse button to locate a vault manually.</p>
            </div>
          {/if}

          <button class="browse-button" onclick={handleBrowse}>
            <span class="button-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                ></path>
              </svg>
            </span>
            Browse for Vault...
          </button>
        </div>
      {:else if stage === 'progress'}
        <div class="progress-content">
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
          <h3>Migration Successful!</h3>

          {#if migrationResult?.stats}
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-value">{migrationResult.stats.notes}</span>
                <span class="stat-label">Notes</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{migrationResult.stats.noteTypes}</span>
                <span class="stat-label">Note Types</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{migrationResult.stats.workspaces}</span>
                <span class="stat-label">Workspaces</span>
              </div>
              {#if migrationResult.stats.epubs > 0}
                <div class="stat-item">
                  <span class="stat-value">{migrationResult.stats.epubs}</span>
                  <span class="stat-label">EPUBs</span>
                </div>
              {/if}
            </div>
          {/if}

          {#if migrationResult?.errors && migrationResult.errors.length > 0}
            <div class="warnings-section">
              <h4>Warnings ({migrationResult.errors.length})</h4>
              <div class="warnings-list">
                {#each migrationResult.errors.slice(0, 5) as error, i (i)}
                  <div class="warning-item">
                    <span class="warning-type">{error.entity}</span>
                    <span class="warning-message">{error.message}</span>
                  </div>
                {/each}
                {#if migrationResult.errors.length > 5}
                  <div class="warning-more">
                    +{migrationResult.errors.length - 5} more warnings
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

          {#if migrationResult?.errors && migrationResult.errors.length > 0}
            <div class="error-details">
              {migrationResult.errors[0].message}
            </div>
          {/if}

          <p class="error-help">
            Your original vault has not been modified. You can try again or contact
            support.
          </p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      {#if stage === 'select'}
        <button class="secondary-button" onclick={handleCancel}> Cancel </button>
        <button
          class="primary-button"
          onclick={handleMigrate}
          disabled={!selectedVault || selectedVault.hasExistingMigration}
        >
          Migrate Vault
        </button>
      {:else if stage === 'complete'}
        <button class="primary-button" onclick={handleComplete}> Open Vault </button>
      {:else if stage === 'error'}
        <button class="secondary-button" onclick={() => (stage = 'select')}>
          Try Again
        </button>
        <button class="primary-button" onclick={handleCancel}> Close </button>
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

  .close-button {
    background: none;
    border: none;
    padding: 0.5rem;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .close-button svg {
    width: 1.25rem;
    height: 1.25rem;
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

  /* Select state */
  .select-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .intro-text {
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .error-banner {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    color: var(--error-text, #ef4444);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .vault-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .vault-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid transparent;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
  }

  .vault-item:hover:not(:disabled) {
    border-color: var(--accent-primary);
  }

  .vault-item.selected {
    border-color: var(--accent-primary);
    background: rgba(59, 130, 246, 0.05);
  }

  .vault-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .vault-info {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .vault-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .vault-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .vault-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .vault-path {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-left: 2.25rem;
  }

  .stat {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .stat.date {
    color: var(--text-tertiary);
  }

  .migrated-badge {
    font-size: 0.75rem;
    color: var(--success-text, #10b981);
    background: var(--success-bg, rgba(16, 185, 129, 0.1));
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .empty-state .subtle {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .browse-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-light);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .browse-button:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    background: rgba(59, 130, 246, 0.05);
  }

  .browse-button svg {
    width: 1rem;
    height: 1rem;
  }

  /* Progress state */
  .progress-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
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
  .primary-button,
  .secondary-button {
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .primary-button {
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

  .secondary-button {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .secondary-button:hover {
    background: var(--bg-tertiary);
  }
</style>
