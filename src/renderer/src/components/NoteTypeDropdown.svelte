<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    currentType: string;
    onTypeChange: (newType: string) => Promise<void>;
    disabled?: boolean;
  }

  let { currentType, onTypeChange, disabled = false }: Props = $props();

  let isOpen = $state(false);
  let isSaving = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Get available note types from the store
  let availableTypes = $derived(notesStore.noteTypes);

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
    return undefined;
  });

  function toggleDropdown(): void {
    if (!disabled && !isSaving) {
      isOpen = !isOpen;
    }
  }

  async function selectType(type: string): Promise<void> {
    if (type === currentType || isSaving) return;

    try {
      isSaving = true;
      isOpen = false;
      await onTypeChange(type);
    } catch (error) {
      console.error('Failed to change type:', error);
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={dropdownRef}
  class="note-type-dropdown"
  class:disabled
  class:saving={isSaving}
  onkeydown={handleKeyDown}
>
  <button
    class="type-button"
    onclick={toggleDropdown}
    type="button"
    title="Change note type"
    {disabled}
    aria-haspopup="true"
    aria-expanded={isOpen}
  >
    {#if availableTypes.find((t) => t.name === currentType)?.icon}
      <span class="type-icon"
        >{availableTypes.find((t) => t.name === currentType)?.icon}</span
      >
    {/if}
    <span class="type-name">{currentType}</span>
    <span class="dropdown-icon" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div class="dropdown-menu" role="menu">
      {#each availableTypes as noteType (noteType.name)}
        <button
          class="dropdown-item"
          class:selected={noteType.name === currentType}
          onclick={() => selectType(noteType.name)}
          type="button"
          role="menuitem"
        >
          <div class="item-main">
            {#if noteType.icon}
              <span class="item-icon">{noteType.icon}</span>
            {/if}
            <span class="item-name">{noteType.name}</span>
          </div>
          <span class="item-count">{noteType.count}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .note-type-dropdown {
    position: relative;
    display: inline-block;
  }

  .type-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    border-radius: 1rem;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: white;
    transition: all 0.2s ease;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .type-button:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    filter: brightness(1.1);
  }

  .type-button:focus {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg-primary),
      0 0 0 4px var(--accent-primary);
  }

  .type-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note-type-dropdown.saving .type-button {
    opacity: 0.7;
    cursor: wait;
  }

  .type-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .type-name {
    font-weight: 600;
    text-transform: capitalize;
  }

  .dropdown-icon {
    font-size: 0.625rem;
    transition: transform 0.2s ease;
    opacity: 0.8;
  }

  .dropdown-icon.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    min-width: 100%;
    max-height: 24rem; /* ~10 items at 2.4rem each */
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: slideDown 0.15s ease-out;
    overflow-y: auto;
    overflow-x: hidden;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg-secondary);
  }

  .dropdown-item.selected {
    background: var(--accent-primary);
    color: white;
  }

  .dropdown-item.selected:hover {
    background: var(--accent-hover);
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .item-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .item-name {
    font-weight: 500;
    text-transform: capitalize;
  }

  .item-count {
    font-size: 0.7rem;
    opacity: 0.7;
    font-weight: 400;
  }

  .dropdown-item.selected .item-count {
    opacity: 0.9;
  }
</style>
