<script lang="ts">
  /**
   * Main App component using Automerge for data storage
   * This is a simplified version that will be gradually expanded
   */
  import { onMount } from 'svelte';
  import FirstTimeExperience from './components/FirstTimeExperience.svelte';
  import MainView from './components/MainView.svelte';
  import { initializeState, getIsLoading, getNonArchivedVaults } from './lib/automerge';
  import { settingsStore } from './stores/settingsStore.svelte';

  // Legacy vault config type (from old app's config.yml)
  interface LegacyVaultConfig {
    id: string;
    name: string;
    path: string;
    created?: string;
    last_accessed?: string;
  }

  // Track if we have vaults
  let hasVaults = $state(false);
  let initError = $state<string | null>(null);
  let detectedLegacyVaults = $state<LegacyVaultConfig[]>([]);

  // Derive loading state reactively
  const isLoading = $derived(getIsLoading());

  // Initialize automerge state
  onMount(async () => {
    try {
      await initializeState();
      // Check if we have vaults after initialization
      const vaults = getNonArchivedVaults();
      hasVaults = vaults.length > 0;

      // If no vaults, check for legacy vaults in old app's config.yml
      if (!hasVaults) {
        try {
          // Read legacy vault paths from old app's config.yml
          const legacyVaultConfigs =
            await window.api?.legacyMigration.readLegacyVaultPaths();

          if (legacyVaultConfigs && legacyVaultConfigs.length > 0) {
            // Store detected legacy vaults to pass to FirstTimeExperience
            detectedLegacyVaults = legacyVaultConfigs;
          }
        } catch (err) {
          console.warn('Failed to read legacy vault paths:', err);
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

  // Font application
  $effect(() => {
    const fontSettings = settingsStore.settings.appearance.font;

    let fontFamily: string;

    switch (fontSettings?.preset) {
      case 'serif':
        fontFamily = 'Georgia, "Times New Roman", Times, serif';
        break;
      case 'monospace':
        fontFamily =
          "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace";
        break;
      case 'custom':
        // Use custom font with sans-serif fallback
        fontFamily = fontSettings.customFont
          ? `"${fontSettings.customFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        break;
      case 'sans-serif':
      default:
        fontFamily =
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        break;
    }

    document.documentElement.style.setProperty('--font-editor', fontFamily);
  });

  // Font size application
  $effect(() => {
    const fontSize = settingsStore.settings.appearance.fontSize ?? 16;
    document.documentElement.style.setProperty('--font-editor-size', `${fontSize}px`);
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
  <!-- First-time experience -->
  <FirstTimeExperience
    onVaultCreated={handleVaultCreated}
    legacyVaults={detectedLegacyVaults}
  />
{:else}
  <!-- Main app interface -->
  <MainView />
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
