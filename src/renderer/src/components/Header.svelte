<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import LLMSettings from './LLMSettings.svelte';
  import { vaultService, type VaultInfo } from '../services/vaultService';

  // Reactive state
  let currentVault = $state('Loading...');
  let availableVaults = $state<VaultInfo[]>([]);
  let isVaultDropdownOpen = $state(false);
  let isSettingsOpen = $state(false);
  let vaultStatus = $state<'initializing' | 'ready' | 'error'>('initializing');
  let retryCount = $state(0);

  // Store unsubscribe functions
  let unsubscribeFunctions: (() => void)[] = [];

  onMount(async () => {
    // Subscribe to vault service events
    const unsubscribeReady = vaultService.on('ready', () => {
      console.log('✅ Vault service ready');
      currentVault = vaultService.getCurrentVault() || 'No Vault';
      availableVaults = vaultService.getAvailableVaults();
      vaultStatus = 'ready';
    });

    const unsubscribeVaultChanged = vaultService.on('vaultChanged', (vaultName) => {
      console.log('🔄 Vault changed to:', vaultName);
      currentVault = vaultName;
    });

    const unsubscribeVaultsUpdated = vaultService.on('vaultsUpdated', (vaults) => {
      console.log('📁 Vaults updated:', vaults);
      availableVaults = vaults;
    });

    const unsubscribeError = vaultService.on('error', (error) => {
      console.error('❌ Vault service error:', error);
      vaultStatus = 'error';
      currentVault = 'Error';
    });

    const unsubscribeStatusChanged = vaultService.on('statusChanged', (status) => {
      console.log('🔄 Vault service status changed:', status);
      vaultStatus = status;

      if (status === 'initializing') {
        currentVault = 'Loading...';
      } else if (status === 'error') {
        currentVault = 'Error';
      }
    });

    // Store unsubscribe functions for cleanup
    unsubscribeFunctions = [
      unsubscribeReady,
      unsubscribeVaultChanged,
      unsubscribeVaultsUpdated,
      unsubscribeError,
      unsubscribeStatusChanged
    ];

    // Check if already initialized
    if (vaultService.isReady()) {
      currentVault = vaultService.getCurrentVault() || 'No Vault';
      availableVaults = vaultService.getAvailableVaults();
      vaultStatus = 'ready';
    } else {
      // Initialize vault service (this will trigger events)
      try {
        await vaultService.initialize();
      } catch (error) {
        console.error('Failed to initialize vault service:', error);
        // Error handling is done through events
      }
    }
  });

  onDestroy(() => {
    // Clean up event subscriptions
    unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  });

  const retryVaultLoading = async (): Promise<void> => {
    try {
      retryCount++;
      console.log(`🔄 Manual retry attempt ${retryCount}`);

      // Use the vault service's refresh method
      await vaultService.refresh();
    } catch (error) {
      console.error('Manual retry failed:', error);
      // Error handling is done through events
    }
  };

  const handleVaultChange = async (vault: string): Promise<void> => {
    const previousVault = currentVault;
    try {
      isVaultDropdownOpen = false;
      if (vault === currentVault) return;

      currentVault = 'Switching...';

      await vaultService.switchVault(vault);
      // Success is handled through events
    } catch (error) {
      console.error('Failed to switch vault:', error);
      // Restore previous vault name on error
      currentVault = vaultService.getCurrentVault() || previousVault || 'Default Vault';

      // Show user-friendly error (could be replaced with toast notification)
      alert(
        `Failed to switch to vault "${vault}". The vault tools may not be available.`
      );
    }
  };

  const toggleVaultDropdown = (): void => {
    isVaultDropdownOpen = !isVaultDropdownOpen;
  };

  const handleSettings = (): void => {
    isSettingsOpen = true;
  };

  const closeSettings = (): void => {
    isSettingsOpen = false;
  };

  // Computed properties for better UX
  const isLoading = $derived(vaultStatus === 'initializing');
  const hasError = $derived(vaultStatus === 'error');
  const showRetryButton = $derived(
    hasError ||
      currentVault === 'Default Vault' ||
      currentVault === 'No Vault' ||
      currentVault === 'Error'
  );
</script>

<header class="header">
  <div class="header-left">
    <h1 class="logo">Flint</h1>

    <div class="vault-selector">
      <button
        class="vault-button"
        class:loading={isLoading}
        class:error={hasError}
        onclick={toggleVaultDropdown}
        aria-expanded={isVaultDropdownOpen}
        aria-haspopup="true"
      >
        <span class="vault-icon">
          {#if isLoading}
            ⏳
          {:else if hasError}
            ⚠️
          {:else}
            📁
          {/if}
        </span>
        <span class="vault-name">{currentVault}</span>
        <svg
          class="dropdown-arrow"
          class:rotated={isVaultDropdownOpen}
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" fill="none" />
        </svg>
      </button>

      {#if showRetryButton}
        <button
          class="retry-button"
          onclick={retryVaultLoading}
          disabled={isLoading}
          title="Retry loading vault data"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M4 4.5V2L1 4.5L4 7V4.5H8C9.1046 4.5 10 5.3954 10 6.5V7.5C10 8.6046 9.1046 9.5 8 9.5H6V11H8C10.2091 11 12 9.2091 12 7.5V6.5C12 4.7909 10.2091 3 8 3H4Z"
              fill="currentColor"
            />
          </svg>
          {#if retryCount > 0}
            <span class="retry-count">{retryCount}</span>
          {/if}
        </button>
      {/if}

      {#if isVaultDropdownOpen}
        <div class="vault-dropdown">
          {#if isLoading}
            <div class="vault-loading">
              <span class="loading-spinner">⏳</span>
              Loading vaults...
            </div>
          {:else if availableVaults.length === 0}
            <div class="vault-empty">
              <span class="vault-icon">📁</span>
              No vaults available
            </div>
          {:else}
            {#each availableVaults as vault (vault.id)}
              <button
                class="vault-option"
                class:active={vault.name === currentVault}
                onclick={() => handleVaultChange(vault.name)}
                title={vault.description || vault.path}
              >
                <div class="vault-info">
                  <span class="vault-icon">📁</span>
                  <div class="vault-details">
                    <span class="vault-name">{vault.name}</span>
                    {#if vault.description}
                      <span class="vault-description">{vault.description}</span>
                    {/if}
                  </div>
                </div>
                {#if vault.isActive}
                  <span class="active-indicator">✓</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="header-right">
    <button class="settings-button" onclick={handleSettings} aria-label="Settings">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>
  </div>
</header>

<LLMSettings isOpen={isSettingsOpen} onClose={closeSettings} />

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background-color: white;
    border-bottom: 1px solid #e9ecef;
    height: 60px;
    position: relative;
    z-index: 1000;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .logo {
    font-size: 1.5rem;
    font-weight: 700;
    color: #007bff;
    margin: 0;
  }

  .vault-selector {
    position: relative;
  }

  .vault-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  .vault-button:hover {
    background-color: #e9ecef;
    border-color: #adb5bd;
  }

  .vault-button.loading {
    background-color: #fff3cd;
    border-color: #ffeaa7;
  }

  .vault-button.error {
    background-color: #f8d7da;
    border-color: #f5c6cb;
  }

  .vault-icon {
    font-size: 1rem;
  }

  .vault-name {
    font-weight: 500;
    color: #495057;
  }

  .dropdown-arrow {
    transition: transform 0.2s;
    color: #6c757d;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  .vault-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: white;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    margin-top: 0.25rem;
    z-index: 1001;
    min-width: 200px;
  }

  .vault-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 0.9rem;
  }

  .vault-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-grow: 1;
  }

  .vault-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vault-name {
    font-weight: 500;
  }

  .vault-description {
    font-size: 0.8rem;
    color: #6c757d;
    line-height: 1.2;
  }

  .vault-option:hover {
    background-color: #f8f9fa;
  }

  .vault-option.active {
    background-color: #e3f2fd;
    color: #007bff;
  }

  .vault-option:first-child {
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .vault-option:last-child {
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .settings-button {
    padding: 0.5rem;
    background: none;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    color: #6c757d;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-button:hover {
    background-color: #f8f9fa;
    color: #495057;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .header {
      background-color: #212529;
      border-color: #495057;
    }

    .logo {
      color: #007bff;
    }

    .vault-button {
      background-color: #343a40;
      border-color: #495057;
      color: #f8f9fa;
    }

    .vault-button:hover {
      background-color: #495057;
      border-color: #6c757d;
    }

    .vault-button.loading {
      background-color: #664d03;
      border-color: #997404;
    }

    .vault-button.error {
      background-color: #58151c;
      border-color: #721c24;
    }

    .vault-name {
      color: #f8f9fa;
    }

    .vault-dropdown {
      background-color: #343a40;
      border-color: #495057;
    }

    .vault-option:hover {
      background-color: #495057;
    }

    .vault-option.active {
      background-color: #1a365d;
      color: #66b2ff;
    }

    .vault-description {
      color: #adb5bd;
    }

    .settings-button {
      color: #adb5bd;
    }

    .settings-button:hover {
      background-color: #343a40;
      color: #f8f9fa;
    }
  }

  .retry-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background-color: #ffc107;
    color: #212529;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
    margin-left: 0.5rem;
  }

  .retry-button:hover:not(:disabled) {
    background-color: #ffca2c;
  }

  .retry-button:disabled {
    background-color: #6c757d;
    color: #fff;
    cursor: not-allowed;
  }

  .retry-count {
    background-color: #dc3545;
    color: white;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: bold;
  }

  .vault-loading,
  .vault-empty {
    padding: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .loading-spinner {
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

  .active-indicator {
    margin-left: auto;
    color: #007bff;
    font-weight: bold;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .header {
      padding: 0.5rem;
    }

    .header-left {
      gap: 1rem;
    }

    .logo {
      font-size: 1.25rem;
    }

    .vault-name {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .vault-dropdown {
      min-width: 180px;
    }
  }
</style>
