<script lang="ts">
  /**
   * First-time experience for automerge-based vaults
   * Shows detected legacy vaults for import or option to create new vault
   */
  import { createVault, initializeState } from '../lib/automerge';
  import {
    migrateLegacyVault,
    getMigrationProgress,
    resetMigrationState
  } from '../lib/automerge/legacy-migration.svelte';
  import {
    importMarkdownDirectory,
    getImportProgress,
    resetImportState
  } from '../lib/automerge/markdown-import.svelte';

  // Legacy vault config type (from old app's config.yml)
  interface LegacyVaultConfig {
    id: string;
    name: string;
    path: string;
    created?: string;
    last_accessed?: string;
  }

  interface Props {
    onVaultCreated: () => void;
    legacyVaults?: LegacyVaultConfig[];
  }

  let { onVaultCreated, legacyVaults = [] }: Props = $props();

  // Determine if we have legacy vaults to show
  const hasLegacyVaults = $derived(legacyVaults.length > 0);

  // Migration state (for both legacy and markdown imports)
  let isMigrating = $state(false);
  let migratingVaultName = $state<string | null>(null);
  let migrationError = $state<string | null>(null);
  const migrationProgress = $derived(getMigrationProgress());
  const markdownProgress = $derived(getImportProgress());
  // Use markdown progress when available, otherwise use legacy migration progress
  const currentProgress = $derived(markdownProgress || migrationProgress);

  // New vault creation state
  let vaultName = $state('My Notes');
  let isCreating = $state(false);
  let createError = $state<string | null>(null);

  /**
   * Import a legacy vault by migrating it
   */
  async function handleImportLegacyVault(vault: LegacyVaultConfig): Promise<void> {
    isMigrating = true;
    migratingVaultName = vault.name;
    migrationError = null;

    try {
      const result = await migrateLegacyVault(vault.path, vault.name);

      if (result.success && result.vault) {
        // Successfully migrated - initialize state and notify parent
        await initializeState();
        onVaultCreated();
      } else {
        // Handle migration failure
        const errorMsg =
          result.errors?.[0]?.message ?? 'Migration failed for unknown reason';
        migrationError = errorMsg;
        console.error('Migration failed:', result.errors);
      }
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
      console.error('Migration error:', error);
    } finally {
      isMigrating = false;
      migratingVaultName = null;
      resetMigrationState();
    }
  }

  /**
   * Browse for a vault directory to import
   * Supports both legacy vaults and plain markdown directories
   */
  async function handleBrowseForVault(): Promise<void> {
    try {
      const selectedPath = await window.api?.legacyMigration.browseForVault();
      if (!selectedPath) return;

      // First, check for legacy vault
      const detectedVault = await window.api?.legacyMigration.detectLegacyVaultAtPath({
        vaultPath: selectedPath,
        existingVaults: []
      });

      if (detectedVault) {
        // Import the detected legacy vault
        await handleImportLegacyVault({
          id: '',
          name: detectedVault.name,
          path: detectedVault.path
        });
        return;
      }

      // Check for markdown directory
      const markdownDir = await window.api?.markdownImport.detectMarkdownDirectory({
        dirPath: selectedPath
      });

      if (markdownDir) {
        // Import the markdown directory
        await handleImportMarkdownDirectory(markdownDir);
        return;
      }

      // Neither legacy vault nor markdown directory
      migrationError =
        "The selected directory doesn't contain a Flint vault or markdown files";
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
      console.error('Browse error:', error);
    }
  }

  /**
   * Import a plain markdown directory as a new vault
   */
  async function handleImportMarkdownDirectory(dirInfo: {
    path: string;
    name: string;
    fileCount: number;
    categories: string[];
  }): Promise<void> {
    isMigrating = true;
    migratingVaultName = dirInfo.name;
    migrationError = null;

    try {
      const result = await importMarkdownDirectory(dirInfo.path, dirInfo.name);

      if (result.success && result.vault) {
        // Successfully imported - initialize state and notify parent
        await initializeState();
        onVaultCreated();
      } else {
        // Handle import failure
        const errorMsg =
          result.errors?.[0]?.message ?? 'Import failed for unknown reason';
        migrationError = errorMsg;
        console.error('Markdown import failed:', result.errors);
      }
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
      console.error('Markdown import error:', error);
    } finally {
      isMigrating = false;
      migratingVaultName = null;
      resetImportState();
    }
  }

  /**
   * Dismiss migration error
   */
  function dismissError(): void {
    migrationError = null;
  }

  /**
   * Create a new empty vault
   */
  async function handleCreateVault(): Promise<void> {
    if (!vaultName.trim()) {
      createError = 'Please enter a vault name';
      return;
    }

    isCreating = true;
    createError = null;

    try {
      // Create the vault (this creates the automerge document)
      createVault(vaultName.trim());

      // Initialize state with the new vault
      await initializeState();

      // Notify parent
      onVaultCreated();
    } catch (err) {
      console.error('Failed to create vault:', err);
      createError = err instanceof Error ? err.message : 'Failed to create vault';
    } finally {
      isCreating = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCreateVault();
    }
  }
</script>

<div class="first-time-container">
  <div class="welcome-content">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <h1>Welcome to Flint</h1>
      </div>
      <p class="subtitle">Your intelligent note-taking companion</p>
    </div>

    <!-- Migration in progress overlay -->
    {#if isMigrating}
      <div class="migration-overlay">
        <div class="migration-modal">
          <div class="migration-spinner">🔥</div>
          <h3>Importing {migratingVaultName}...</h3>
          {#if currentProgress}
            <div class="progress-section">
              <p class="progress-phase">{currentProgress.message}</p>
              {#if currentProgress.total > 0}
                <div class="progress-bar-container">
                  <div
                    class="progress-bar"
                    style="width: {(currentProgress.current / currentProgress.total) *
                      100}%"
                  ></div>
                </div>
                <p class="progress-count">
                  {currentProgress.current} / {currentProgress.total}
                </p>
              {/if}
            </div>
          {:else}
            <p class="progress-phase">Preparing...</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Error modal -->
    {#if migrationError}
      <div class="error-overlay">
        <div class="error-modal">
          <h3>Import Failed</h3>
          <p>{migrationError}</p>
          <button class="dismiss-button" onclick={dismissError}>Dismiss</button>
        </div>
      </div>
    {/if}

    <!-- Main content -->
    <div class="main-content">
      {#if hasLegacyVaults}
        <!-- Legacy vaults detected - show import list -->
        <div class="vault-section">
          <h2>Import Your Vaults</h2>
          <p class="section-description">
            We found existing vaults from a previous version of Flint. Click to import:
          </p>

          <div class="legacy-vault-list">
            {#each legacyVaults as vault (vault.path)}
              <button
                class="legacy-vault-item"
                onclick={() => handleImportLegacyVault(vault)}
                disabled={isMigrating}
              >
                <span class="vault-icon">📁</span>
                <div class="vault-info">
                  <span class="vault-name">{vault.name}</span>
                  <span class="vault-path">{vault.path}</span>
                </div>
                <span class="import-icon">→</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="divider">
          <span>or</span>
        </div>

        <div class="action-buttons">
          <button
            class="secondary-action"
            onclick={handleBrowseForVault}
            disabled={isMigrating}
          >
            <span class="button-icon">📂</span>
            Open Vault from Directory
          </button>
        </div>
      {:else}
        <!-- No legacy vaults - show create new vault form -->
        <div class="vault-explanation">
          <h2>Get Started with Your First Vault</h2>
          <p>
            A <strong>vault</strong> is a collection of notes stored locally in your browser.
            Think of it as your personal knowledge workspace where all your notes, ideas, and
            thoughts are organized and interconnected.
          </p>

          <div class="features-list">
            <div class="feature">
              <span class="feature-icon">🔗</span>
              <div class="feature-text">
                <strong>Smart Linking:</strong> Connect your thoughts with automatic wikilinks
              </div>
            </div>
            <div class="feature">
              <span class="feature-icon">🔍</span>
              <div class="feature-text">
                <strong>Powerful Search:</strong> Find anything across all your notes instantly
              </div>
            </div>
            <div class="feature">
              <span class="feature-icon">💾</span>
              <div class="feature-text">
                <strong>Local First:</strong> Your notes are stored locally and work offline
              </div>
            </div>
            <div class="feature">
              <span class="feature-icon">📝</span>
              <div class="feature-text">
                <strong>Flexible Types:</strong> Organize notes with custom types and structures
              </div>
            </div>
          </div>
        </div>

        <!-- Vault creation form -->
        <div class="vault-form">
          <label for="vault-name" class="form-label">Vault Name</label>
          <input
            id="vault-name"
            type="text"
            class="vault-name-input"
            bind:value={vaultName}
            onkeydown={handleKeyDown}
            placeholder="Enter vault name..."
            maxlength="50"
            disabled={isCreating}
          />

          {#if createError}
            <div class="error-message">{createError}</div>
          {/if}

          <button
            class="primary-action"
            onclick={handleCreateVault}
            disabled={isCreating || !vaultName.trim()}
          >
            {#if isCreating}
              <span class="button-icon">⏳</span>
              Creating...
            {:else}
              <span class="button-icon">📁</span>
              Create Vault
            {/if}
          </button>
        </div>

        <div class="divider">
          <span>or</span>
        </div>

        <div class="action-buttons">
          <button
            class="secondary-action"
            onclick={handleBrowseForVault}
            disabled={isCreating}
          >
            <span class="button-icon">📂</span>
            Open Vault from Directory
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .first-time-container {
    height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    padding: 2rem;
    box-sizing: border-box;
  }

  .welcome-content {
    max-width: 600px;
    width: 100%;
    text-align: center;
    animation: fadeInUp 0.6s ease-out;
    position: relative;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .header {
    margin-bottom: 3rem;
  }

  .logo-section {
    margin-bottom: 1rem;
  }

  .header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 1.1rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .main-content {
    text-align: left;
  }

  /* Legacy vault list */
  .vault-section {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 2rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
  }

  .vault-section h2 {
    font-size: 1.5rem;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
    text-align: center;
  }

  .section-description {
    color: var(--text-secondary);
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .legacy-vault-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .legacy-vault-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
  }

  .legacy-vault-item:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .legacy-vault-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .vault-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .vault-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vault-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .vault-path {
    font-size: 0.8rem;
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .import-icon {
    font-size: 1.25rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  /* Divider */
  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
  }

  /* Action buttons */
  .action-buttons {
    display: flex;
    justify-content: center;
  }

  .secondary-action {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    padding: 0.875rem 1.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .secondary-action:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .secondary-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* New vault form */
  .vault-explanation {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
  }

  .vault-explanation h2 {
    font-size: 1.5rem;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
    text-align: center;
  }

  .vault-explanation > p {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feature {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .feature-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .feature-text {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .feature-text strong {
    color: var(--text-primary);
  }

  .vault-form {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .vault-name-input {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  .vault-name-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .vault-name-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    color: var(--error-text, #ef4444);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    border-radius: 0.375rem;
  }

  .primary-action {
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.75rem;
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .primary-action:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 12px -2px rgba(0, 0, 0, 0.15);
  }

  .primary-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .button-icon {
    font-size: 1rem;
  }

  /* Migration overlay */
  .migration-overlay,
  .error-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .migration-modal,
  .error-modal {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .migration-spinner {
    font-size: 3rem;
    animation: pulse 2s ease-in-out infinite alternate;
    margin-bottom: 1rem;
  }

  @keyframes pulse {
    from {
      opacity: 0.6;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  .migration-modal h3,
  .error-modal h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .error-modal h3 {
    color: var(--error-text, #ef4444);
  }

  .progress-section {
    margin-top: 1rem;
  }

  .progress-phase {
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
  }

  .progress-bar-container {
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.3s ease;
  }

  .progress-count {
    margin: 0.5rem 0 0 0;
    font-size: 0.8rem;
    color: var(--text-tertiary);
  }

  .dismiss-button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .dismiss-button:hover {
    background: var(--accent-primary-hover);
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .first-time-container {
      padding: 1rem;
    }

    .header h1 {
      font-size: 2rem;
    }

    .vault-section,
    .vault-explanation {
      padding: 1.5rem;
    }

    .features-list {
      gap: 0.75rem;
    }

    .feature {
      flex-direction: column;
      gap: 0.25rem;
      text-align: center;
    }

    .primary-action {
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
    }

    .legacy-vault-item {
      padding: 0.75rem;
    }
  }
</style>
