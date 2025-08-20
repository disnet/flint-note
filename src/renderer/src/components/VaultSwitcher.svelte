<script lang="ts">
  import type { VaultInfo } from '@/server/utils/global-config';
  import { getChatService } from '../services/chatService';
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import { activeNoteStore } from '../stores/activeNoteStore.svelte';
  import CreateVaultModal from './CreateVaultModal.svelte';

  interface Props {
    onNoteClose: () => void;
  }

  let { onNoteClose }: Props = $props();

  let currentVault = $state<VaultInfo | null>(null);
  let allVaults = $state<VaultInfo[]>([]);
  let isLoading = $state(false);
  let isDropdownOpen = $state(false);
  let isCreateModalOpen = $state(false);

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
      activeNoteStore.startVaultSwitch();

      // Close the active note since it's from the previous vault
      onNoteClose();

      await service.switchVault({ vaultId });
      await loadVaults(); // Refresh vault info
      await notesStore.refresh(); // Refresh notes for the new vault

      // Refresh pinned notes, temporary tabs, and conversations for the new vault
      await pinnedNotesStore.refreshForVault(vaultId);
      await temporaryTabsStore.refreshForVault(vaultId);
      await unifiedChatStore.refreshForVault(vaultId);
      await activeNoteStore.endVaultSwitch();

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

  function openCreateModal(): void {
    isCreateModalOpen = true;
    closeDropdown();
  }

  function closeCreateModal(): void {
    isCreateModalOpen = false;
  }

  async function handleVaultCreated(vaultInfo: VaultInfo): Promise<void> {
    try {
      // Refresh vault list to include the new vault
      await loadVaults();
      
      // Optionally switch to the newly created vault
      if (vaultInfo.id) {
        await switchVault(vaultInfo.id);
      }
    } catch (error) {
      console.error('Failed to handle vault creation:', error);
    }
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
    class:open={isDropdownOpen}
    onclick={toggleDropdown}
    disabled={isLoading}
    aria-label="Switch vault"
    aria-haspopup="listbox"
    aria-expanded={isDropdownOpen}
  >
    <span class="vault-display">
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
    </span>
    <span class="dropdown-arrow" class:rotated={isDropdownOpen}>▼</span>
  </button>

  {#if isDropdownOpen}
    <div
      class="dropdown"
      role="listbox"
    >
      {#if allVaults.length === 0}
        <div class="dropdown-item disabled">No vaults available</div>
      {:else}
        {#each allVaults as vault (vault.id)}
          <button
            class="dropdown-item"
            class:active={currentVault?.id === vault.id}
            class:disabled={isLoading || currentVault?.id === vault.id || !vault.id}
            role="option"
            aria-selected={currentVault?.id === vault.id}
            onclick={() => {
              if (vault.id && !isLoading && currentVault?.id !== vault.id) {
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
          </button>
        {/each}
      {/if}
      
      <div class="dropdown-separator"></div>
      
      <button
        class="dropdown-item new-vault-item"
        onclick={openCreateModal}
        disabled={isLoading}
      >
        <span class="vault-icon new-vault-icon">✨</span>
        <div class="vault-details">
          <div class="vault-name">New Vault</div>
          <div class="vault-description">Create a new vault</div>
        </div>
      </button>
    </div>
  {/if}
</div>

<CreateVaultModal 
  isOpen={isCreateModalOpen} 
  onClose={closeCreateModal}
  onVaultCreated={handleVaultCreated}
/>

<style>
  .vault-switcher {
    position: relative;
    display: inline-block;
  }

  .vault-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 110px;
    justify-content: space-between;
  }

  .vault-button:hover:not(:disabled) {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .vault-button.open {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-light);
  }

  .vault-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .vault-display {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .vault-icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  .vault-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-arrow {
    font-size: 0.625rem;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-top: 0.25rem;
    max-height: 400px;
    overflow-y: auto;
    min-width: 280px;
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
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .dropdown-item:hover:not(.disabled) {
    background: var(--bg-secondary);
  }

  .dropdown-item.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .dropdown-item.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .vault-details {
    flex: 1;
    min-width: 0;
  }

  .vault-details .vault-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
  }

  .vault-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.25rem;
    line-height: 1.2;
  }

  .active-indicator {
    margin-left: auto;
    color: var(--accent-primary);
    font-weight: bold;
  }

  .dropdown-separator {
    margin: 0.25rem 0;
    border-top: 1px solid var(--border-light);
  }

  .new-vault-item {
    background: transparent !important;
  }

  .new-vault-item:hover:not(:disabled) {
    background: var(--bg-secondary) !important;
  }

  .new-vault-icon {
    opacity: 0.8;
  }

  .new-vault-item .vault-name {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .new-vault-item .vault-description {
    color: var(--text-secondary);
  }
</style>
