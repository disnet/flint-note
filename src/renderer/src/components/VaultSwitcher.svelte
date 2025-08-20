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
  let confirmingArchive = $state<VaultInfo | null>(null);

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

  function confirmArchiveVault(vault: VaultInfo): void {
    confirmingArchive = vault;
    closeDropdown();
  }

  function cancelArchive(): void {
    confirmingArchive = null;
  }

  async function archiveVault(): Promise<void> {
    if (!confirmingArchive?.id) return;

    try {
      isLoading = true;
      const vaultToArchive = confirmingArchive;
      const isArchivingCurrentVault = currentVault?.id === vaultToArchive.id;
      
      // If we're archiving the current vault, find another vault to switch to
      let nextVault: VaultInfo | null = null;
      if (isArchivingCurrentVault) {
        nextVault = allVaults.find(vault => vault.id !== vaultToArchive.id) || null;
        
        // If there's another vault available, switch to it first
        if (nextVault?.id) {
          // Start vault switch mode - this clears tabs and blocks new ones
          temporaryTabsStore.startVaultSwitch();
          activeNoteStore.startVaultSwitch();

          // Close the active note since it's from the vault being archived
          onNoteClose();

          await service.switchVault({ vaultId: nextVault.id });
          
          // Refresh stores for the new vault
          await notesStore.refresh();
          await pinnedNotesStore.refreshForVault(nextVault.id);
          await temporaryTabsStore.refreshForVault(nextVault.id);
          await unifiedChatStore.refreshForVault(nextVault.id);
          await activeNoteStore.endVaultSwitch();

          // End vault switch mode
          temporaryTabsStore.endVaultSwitch();
        }
      }
      
      // Remove the vault
      await service.removeVault({ vaultId: vaultToArchive.id });
      
      // Refresh vault list
      await loadVaults();
      
      confirmingArchive = null;
    } catch (error) {
      console.error('Failed to archive vault:', error);
      // Make sure we end vault switch mode even on error
      temporaryTabsStore.endVaultSwitch();
      // Could show an error notification here
    } finally {
      isLoading = false;
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
          <div class="vault-item-container">
            <button
              class="dropdown-item vault-main-button"
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
            <button
              class="archive-button"
              class:disabled={isLoading}
              onclick={(e) => {
                e.stopPropagation();
                if (vault.id && !isLoading) {
                  confirmArchiveVault(vault);
                }
              }}
              title="Archive vault"
              aria-label="Archive vault"
            >
              🗃️
            </button>
          </div>
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

<!-- Archive Confirmation Dialog -->
{#if confirmingArchive}
  <div class="modal-overlay" onclick={cancelArchive}>
    <div class="confirmation-modal" onclick={(e) => e.stopPropagation()}>
      <div class="confirmation-header">
        <h3>🗃️ Archive Vault</h3>
      </div>
      <div class="confirmation-content">
        <p>Are you sure you want to archive the vault <strong>"{confirmingArchive.name}"</strong>?</p>
        {#if currentVault?.id === confirmingArchive.id}
          <p class="warning-text current-vault-warning">This is your current vault. If you proceed, you'll be switched to another vault automatically.</p>
        {/if}
        <p class="warning-text">This will remove the vault from your list, but the files will remain on disk at:</p>
        <code class="vault-path">{confirmingArchive.path}</code>
        <p class="warning-text">You can add it back later if needed.</p>
      </div>
      <div class="confirmation-actions">
        <button class="cancel-btn" onclick={cancelArchive}>Cancel</button>
        <button class="archive-btn" onclick={archiveVault} disabled={isLoading}>
          {isLoading ? 'Archiving...' : 'Archive Vault'}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  /* Unified hover state for vault items */
  .vault-item-container:hover .vault-main-button:not(.disabled) {
    background: var(--bg-secondary);
  }

  .vault-item-container:hover .archive-button:not(:disabled) {
    background: var(--bg-secondary);
    opacity: 1;
  }

  .vault-item-container:hover .archive-button:hover:not(:disabled) {
    background: var(--error-bg, #fee) !important;
    color: var(--error-text, #dc2626) !important;
  }

  /* Active state for vault items */
  .vault-item-container .vault-main-button.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .vault-item-container .vault-main-button.active + .archive-button {
    background: var(--accent-light);
    opacity: 0.8; /* Keep archive button slightly visible even for active vault */
  }

  .vault-item-container:hover .vault-main-button.active + .archive-button {
    opacity: 1; /* Show archive button fully on hover, even for active vault */
  }

  .vault-details {
    flex: 1;
    min-width: 0;
    overflow: hidden; /* Ensure text truncation works properly */
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

  .vault-item-container {
    display: flex;
    align-items: stretch;
    gap: 0;
    width: 100%;
  }

  .vault-main-button {
    flex: 1;
    min-width: 0; /* Allow flex item to shrink below content size */
    border-radius: 0.375rem 0 0 0.375rem;
    margin-right: 0; /* Ensure no gap */
  }

  /* Remove individual button hover to prevent conflicts */
  .vault-main-button:hover {
    background: inherit;
  }

  .archive-button {
    padding: 0.75rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    border-radius: 0 0.375rem 0.375rem 0;
    opacity: 0.7;
    width: 2.5rem;
    min-width: 2.5rem;
    flex-shrink: 0; /* Prevent the button from shrinking */
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0; /* Ensure no gap */
  }

  /* Individual archive button hover removed - handled by container hover */

  .archive-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Confirmation modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .confirmation-modal {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 100%;
    max-width: 400px;
    animation: slideIn 0.2s ease-out;
  }

  .confirmation-header {
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .confirmation-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .confirmation-content {
    padding: 1.5rem;
  }

  .confirmation-content p {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    line-height: 1.5;
  }

  .warning-text {
    color: var(--text-secondary) !important;
    font-size: 0.875rem;
  }

  .current-vault-warning {
    color: var(--accent-primary) !important;
    font-weight: 500;
    background: var(--accent-light);
    padding: 0.75rem;
    border-radius: 0.375rem;
    border-left: 3px solid var(--accent-primary);
  }

  .vault-path {
    display: block;
    background: var(--bg-secondary);
    padding: 0.5rem;
    border-radius: 0.375rem;
    font-family: monospace;
    font-size: 0.75rem;
    margin: 0.5rem 0;
    word-break: break-all;
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .confirmation-actions {
    padding: 1rem 1.5rem 1.5rem;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .cancel-btn,
  .archive-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-color: var(--border-light);
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .archive-btn {
    background: var(--error-primary, #dc2626);
    color: white;
  }

  .archive-btn:hover:not(:disabled) {
    background: var(--error-primary-hover, #b91c1c);
    transform: translateY(-1px);
  }

  .archive-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
</style>
