<script lang="ts">
  import LLMSettings from './LLMSettings.svelte';

  // Mock data for now
  let currentVault = 'Personal Notes';
  let availableVaults = ['Personal Notes', 'Work Projects', 'Research'];
  let isVaultDropdownOpen = false;
  let isSettingsOpen = false;

  const handleVaultChange = (vault: string) => {
    currentVault = vault;
    isVaultDropdownOpen = false;
    // TODO: Implement vault switching logic
    console.log('Switching to vault:', vault);
  };

  const toggleVaultDropdown = () => {
    isVaultDropdownOpen = !isVaultDropdownOpen;
  };

  const handleSettings = () => {
    isSettingsOpen = true;
  };

  const closeSettings = () => {
    isSettingsOpen = false;
  };
</script>

<header class="header">
  <div class="header-left">
    <h1 class="logo">Flint</h1>

    <div class="vault-selector">
      <button
        class="vault-button"
        on:click={toggleVaultDropdown}
        aria-expanded={isVaultDropdownOpen}
        aria-haspopup="true"
      >
        <span class="vault-icon">📁</span>
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

      {#if isVaultDropdownOpen}
        <div class="vault-dropdown">
          {#each availableVaults as vault}
            <button
              class="vault-option"
              class:active={vault === currentVault}
              on:click={() => handleVaultChange(vault)}
            >
              <span class="vault-icon">📁</span>
              {vault}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="header-right">
    <button class="settings-button" on:click={handleSettings} aria-label="Settings">
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
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 0.9rem;
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

    .settings-button {
      color: #adb5bd;
    }

    .settings-button:hover {
      background-color: #343a40;
      color: #f8f9fa;
    }
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
