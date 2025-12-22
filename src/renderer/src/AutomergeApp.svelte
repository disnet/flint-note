<script lang="ts">
  /**
   * Main App component using Automerge for data storage
   * This is a simplified version that will be gradually expanded
   */
  import { onMount } from 'svelte';
  import AutomergeFirstTimeExperience from './components/AutomergeFirstTimeExperience.svelte';
  import AutomergeMainView from './components/AutomergeMainView.svelte';
  import AutomergeLegacyMigrationModal from './components/AutomergeLegacyMigrationModal.svelte';
  import { initializeState, getIsLoading, getNonArchivedVaults } from './lib/automerge';
  import { detectLegacyVaults } from './lib/automerge/legacy-migration.svelte';
  import { settingsStore } from './stores/settingsStore.svelte';

  // Track if we have vaults
  let hasVaults = $state(false);
  let initError = $state<string | null>(null);

  // Legacy vault detection state
  let showMigrationModal = $state(false);

  // Derive loading state reactively
  const isLoading = $derived(getIsLoading());

  // Initialize automerge state
  onMount(async () => {
    try {
      await initializeState();
      // Check if we have vaults after initialization
      const vaults = getNonArchivedVaults();
      hasVaults = vaults.length > 0;

      // If no vaults, check for legacy vaults to migrate
      if (!hasVaults) {
        try {
          const legacyVaults = await detectLegacyVaults();
          // If we found legacy vaults, show the migration modal
          if (legacyVaults.length > 0) {
            showMigrationModal = true;
          }
        } catch (err) {
          console.warn('Failed to detect legacy vaults:', err);
        }
      }
    } catch (err) {
      console.error('Failed to initialize automerge:', err);
      initError = err instanceof Error ? err.message : 'Failed to initialize';
    }
  });

  // Handle vault creation
  function handleVaultCreated(): void {
    hasVaults = true;
  }

  // Handle migration completion
  async function handleMigrationComplete(): Promise<void> {
    showMigrationModal = false;
    // Re-initialize state to load the newly created vault
    await initializeState();
    hasVaults = getNonArchivedVaults().length > 0;
  }

  // Handle migration cancel
  function handleMigrationCancel(): void {
    showMigrationModal = false;
  }

  // Theme application
  $effect(() => {
    const theme = settingsStore.settings.appearance.theme;

    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });

  // Platform detection
  $effect(() => {
    const isMacOS = navigator.platform.includes('Mac');
    document.documentElement.setAttribute('data-platform', isMacOS ? 'macos' : 'other');
  });
</script>

{#if isLoading}
  <!-- Loading state -->
  <div class="app loading-state">
    <div class="loading-content">
      <div class="loading-spinner">🔥</div>
      <p>Loading Flint...</p>
    </div>
  </div>
{:else if initError}
  <!-- Error state -->
  <div class="app error-state">
    <div class="error-content">
      <h2>Failed to Initialize</h2>
      <p>{initError}</p>
      <button onclick={() => window.location.reload()}>Retry</button>
    </div>
  </div>
{:else if !hasVaults}
  <!-- First-time experience or migration modal -->
  {#if showMigrationModal}
    <AutomergeLegacyMigrationModal
      onComplete={handleMigrationComplete}
      onCancel={handleMigrationCancel}
    />
  {:else}
    <AutomergeFirstTimeExperience onVaultCreated={handleVaultCreated} />
  {/if}
{:else}
  <!-- Main app interface -->
  <AutomergeMainView />
{/if}

<style>
  .app {
    height: 100vh;
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
    display: flex;
    flex-direction: column;
  }

  .app.loading-state,
  .app.error-state {
    align-items: center;
    justify-content: center;
  }

  .loading-content,
  .error-content {
    text-align: center;
    color: var(--text-secondary);
  }

  .loading-spinner {
    font-size: 3rem;
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite alternate;
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

  .loading-content p,
  .error-content p {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .error-content h2 {
    color: var(--error-text, #ef4444);
    margin-bottom: 0.5rem;
  }

  .error-content button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .error-content button:hover {
    background: var(--accent-primary-hover);
  }
</style>
