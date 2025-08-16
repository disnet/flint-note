<script lang="ts">
  import type { VaultInfo } from '@flint-note/server/dist/utils/global-config';
  import { getChatService } from '../services/chatService';
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';

  interface Props {
    onNoteClose: () => void;
  }

  let { onNoteClose }: Props = $props();

  let currentVault = $state<VaultInfo | null>(null);
  let allVaults = $state<VaultInfo[]>([]);
  let isLoading = $state(false);
  let isDropdownOpen = $state(false);

  const service = getChatService();

  async function loadVaults(): Promise<void> {
    try {
      isLoading = true;
      const [current, vaults] = await Promise.all([
        service.getCurrentVault(),
        service.listVaults()
      ]);
      currentVault = current;
      allVaults = vaults;
    } catch (error) {
      console.error('Failed to load vaults:', error);
    } finally {
      isLoading = false;
    }
  }

  async function switchVault(vaultId: string): Promise<void> {
    try {
      isLoading = true;

      // Start vault switch mode - this clears tabs and blocks new ones
      temporaryTabsStore.startVaultSwitch();

      // Close the active note since it's from the previous vault
      onNoteClose();

      await service.switchVault({ vaultId });
      await loadVaults(); // Refresh vault info
      await notesStore.refresh(); // Refresh notes for the new vault

      // Refresh pinned notes, temporary tabs, and conversations for the new vault
      await pinnedNotesStore.refreshForVault(vaultId);
      await temporaryTabsStore.refreshForVault(vaultId);
      await unifiedChatStore.refreshForVault(vaultId);

      // End vault switch mode
      temporaryTabsStore.endVaultSwitch();

      isDropdownOpen = false;
    } catch (error) {
      console.error('Failed to switch vault:', error);
      // Make sure we end vault switch mode even on error
      temporaryTabsStore.endVaultSwitch();
    } finally {
      isLoading = false;
    }
  }

  function toggleDropdown(): void {
    isDropdownOpen = !isDropdownOpen;
  }

  function closeDropdown(): void {
    isDropdownOpen = false;
  }

  // Load vaults on mount
  $effect(() => {
    loadVaults();
  });

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (isDropdownOpen && !target.closest('.vault-switcher')) {
        closeDropdown();
      }
    }

    if (isDropdownOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return () => {};
  });
</script>

<div class="vault-switcher">
  <button
    class="vault-button"
    onclick={toggleDropdown}
    disabled={isLoading}
    aria-label="Switch vault"
  >
    <span class="vault-icon">📁</span>
    <span class="vault-name">
      {#if isLoading}
        Loading...
      {:else if currentVault}
        {currentVault.name}
      {:else}
        No Vault
      {/if}
    </span>
    <span class="dropdown-arrow" class:open={isDropdownOpen}>▼</span>
  </button>

  {#if isDropdownOpen}
    <div class="dropdown">
      {#if allVaults.length === 0}
        <div class="dropdown-item disabled">No vaults available</div>
      {:else}
        {#each allVaults as vault (vault.id)}
          <div
            class="dropdown-item"
            class:active={currentVault?.id === vault.id}
            class:disabled={isLoading || currentVault?.id === vault.id || !vault.id}
            role="button"
            tabindex="0"
            onclick={() => {
              if (vault.id && !isLoading && currentVault?.id !== vault.id) {
                switchVault(vault.id);
              }
            }}
            onkeydown={(e) => {
              if (
                (e.key === 'Enter' || e.key === ' ') &&
                vault.id &&
                !isLoading &&
                currentVault?.id !== vault.id
              ) {
                e.preventDefault();
                switchVault(vault.id);
              }
            }}
          >
            <span class="vault-icon">📁</span>
            <div class="vault-details">
              <div class="vault-name">{vault.name}</div>
              {#if vault.description}
                <div class="vault-description">{vault.description}</div>
              {/if}
            </div>
            {#if currentVault?.id === vault.id}
              <span class="active-indicator">✓</span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .vault-switcher {
    position: relative;
    display: inline-block;
  }

  .vault-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 140px;
    box-shadow: 0 1px 2px var(--shadow-light);
  }

  .vault-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    box-shadow: 0 2px 4px var(--shadow-medium);
    transform: translateY(-1px);
  }

  .vault-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .vault-icon {
    font-size: 1rem;
    opacity: 0.8;
    filter: grayscale(0.2);
  }

  .vault-name {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-arrow {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
    opacity: 0.7;
  }

  .dropdown-arrow.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    margin-top: 0.375rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    max-height: 280px;
    overflow-y: auto;
    backdrop-filter: blur(8px);
    min-width: 200px;
    width: max-content;
    max-width: 280px;
  }

  .dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .dropdown::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }

  .dropdown::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Firefox scrollbar styling */
  .dropdown {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer !important;
    transition: all 0.2s ease;
    margin: 0 0.25rem;
    border-radius: 0.375rem;
    width: calc(100% - 0.5rem);
  }

  .dropdown-item:first-child {
    margin-top: 0.25rem;
  }

  .dropdown-item:last-child {
    margin-bottom: 0.25rem;
  }

  .dropdown-item + .dropdown-item {
    margin-top: 0.125rem;
  }

  .dropdown-item:hover:not(.disabled) {
    background: var(--bg-secondary);
    transform: translateX(2px);
  }

  .dropdown-item.disabled {
    opacity: 0.6;
    cursor: not-allowed !important;
    pointer-events: none;
  }

  .dropdown-item.active {
    background: var(--bg-tertiary);
    border-left: 2px solid var(--accent-primary);
    padding-left: calc(1rem - 2px);
  }

  .vault-details {
    flex: 1;
    min-width: 0;
  }

  .vault-details .vault-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
  }

  .vault-description {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.125rem;
    opacity: 0.8;
    line-height: 1.2;
  }

  .active-indicator {
    color: var(--accent-primary);
    font-weight: bold;
    font-size: 0.875rem;
    opacity: 0.9;
  }
</style>
