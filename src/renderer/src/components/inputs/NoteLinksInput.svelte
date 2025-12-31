<script lang="ts">
  /**
   * Multiple note links input with list dropdown
   * Shows collapsed preview, expands to list with add/remove
   */
  import ListDropdown from './ListDropdown.svelte';
  import NoteLinkPicker from './NoteLinkPicker.svelte';
  import {
    getNoteTitleById,
    calculateDropdownPosition,
    calculateSidePickerPosition
  } from '../../lib/input-utils.svelte';

  interface Props {
    /** Current note IDs */
    value: string[];
    /** Called when value changes */
    onChange: (value: string[]) => void;
    /** Called when a linked note is clicked for navigation */
    onNoteClick?: (noteId: string) => void;
    /** Whether input is disabled */
    disabled?: boolean;
    /** Note ID to exclude from picker (e.g., current note) */
    excludeNoteId?: string;
    /** CSS class for styling */
    class?: string;
  }

  let {
    value,
    onChange,
    onNoteClick,
    disabled = false,
    excludeNoteId,
    class: className = ''
  }: Props = $props();

  let triggerRef = $state<HTMLDivElement | null>(null);
  let listItemsContainer = $state<HTMLDivElement | null>(null);
  let pickerRef = $state<NoteLinkPicker | null>(null);

  // List dropdown state
  let showList = $state(false);
  let listPosition = $state<{ top: number; left: number } | null>(null);
  let listCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Note picker state
  let showPicker = $state(false);
  let pickerPosition = $state<{ top: number; left: number } | null>(null);
  let searchQuery = $state('');

  const excludeIds = $derived(excludeNoteId ? [excludeNoteId, ...value] : [...value]);

  function scrollListToBottom(): void {
    setTimeout(() => {
      if (listItemsContainer) {
        listItemsContainer.scrollTop = listItemsContainer.scrollHeight;
      }
    }, 0);
  }

  function openList(): void {
    if (disabled || !triggerRef) return;
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
    const rect = triggerRef.getBoundingClientRect();
    listPosition = calculateDropdownPosition(rect, { width: 240, height: 280 });
    showList = true;
  }

  function scheduleCloseList(): void {
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
    }
    listCloseTimeout = setTimeout(() => {
      showList = false;
      listPosition = null;
      closePicker();
      listCloseTimeout = null;
    }, 150);
  }

  function cancelCloseList(): void {
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
  }

  function openPicker(inputEl: HTMLElement): void {
    if (disabled) return;
    // Find the list dropdown container for positioning
    const listDropdown = inputEl.closest('.list-dropdown') as HTMLElement;
    if (listDropdown) {
      const rect = listDropdown.getBoundingClientRect();
      pickerPosition = calculateSidePickerPosition(rect, { width: 280, height: 300 });
    } else {
      const rect = inputEl.getBoundingClientRect();
      pickerPosition = calculateDropdownPosition(rect, { width: 280, height: 300 });
    }
    showPicker = true;
    searchQuery = '';
  }

  function closePicker(): void {
    showPicker = false;
    pickerPosition = null;
    searchQuery = '';
  }

  function handleSelect(noteId: string): void {
    if (!value.includes(noteId)) {
      onChange([...value, noteId]);
      scrollListToBottom();
    }
    // Clear search but keep picker open for more
    searchQuery = '';
  }

  function handleRemove(noteId: string): void {
    onChange(value.filter((id) => id !== noteId));
  }

  function handleItemClick(noteId: string): void {
    onNoteClick?.(noteId);
  }

  function handleTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  }
</script>

<div
  class="notelinks-trigger {className}"
  bind:this={triggerRef}
  role="button"
  tabindex={disabled ? -1 : 0}
  onmouseenter={openList}
  onmouseleave={scheduleCloseList}
  onfocus={openList}
  onkeydown={handleTriggerKeydown}
>
  {#if value.length === 0}
    <span class="list-empty">+</span>
  {:else if value.length === 1}
    <button
      type="button"
      class="list-preview-link"
      onclick={(e) => {
        e.stopPropagation();
        handleItemClick(value[0]);
      }}
    >
      {getNoteTitleById(value[0])}
    </button>
  {:else}
    <button
      type="button"
      class="list-preview-link"
      onclick={(e) => {
        e.stopPropagation();
        handleItemClick(value[0]);
      }}
    >
      {getNoteTitleById(value[0])}
    </button>
    <span class="list-count">+{value.length - 1}</span>
  {/if}
</div>

{#if showList && listPosition}
  <ListDropdown
    items={value}
    position={listPosition}
    clickable={true}
    renderItem={getNoteTitleById}
    onRemove={handleRemove}
    onItemClick={handleItemClick}
    onMouseEnter={cancelCloseList}
    onMouseLeave={scheduleCloseList}
    itemsContainerRef={(el) => (listItemsContainer = el)}
  >
    {#snippet addSection()}
      <input
        type="text"
        class="list-add-input"
        placeholder="Add note..."
        value={searchQuery}
        onfocus={(e) => openPicker(e.currentTarget)}
        onblur={() => setTimeout(closePicker, 150)}
        oninput={(e) => (searchQuery = e.currentTarget.value)}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            closePicker();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (showPicker && pickerRef) {
            // Forward navigation keys to the picker
            pickerRef.handleExternalKeydown(e);
          }
        }}
      />
    {/snippet}
  </ListDropdown>
{/if}

{#if showPicker && pickerPosition}
  <NoteLinkPicker
    bind:this={pickerRef}
    position={pickerPosition}
    excludeNoteIds={excludeIds}
    {searchQuery}
    onSearchChange={(q) => (searchQuery = q)}
    onSelect={handleSelect}
    onClose={closePicker}
    multiSelect={true}
    hideSearchInput={true}
  />
{/if}

<style>
  .notelinks-trigger {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }

  .notelinks-trigger:focus {
    outline: none;
    background: var(--bg-tertiary);
  }

  .list-empty {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .list-preview-link {
    background: none;
    border: none;
    color: var(--accent-primary);
    font-size: inherit;
    cursor: pointer;
    padding: 0;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-preview-link:hover {
    text-decoration: underline;
  }

  .list-count {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .list-add-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8rem;
    padding: 0.25rem;
    outline: none;
  }

  .list-add-input:focus {
    background: var(--bg-primary);
  }
</style>
