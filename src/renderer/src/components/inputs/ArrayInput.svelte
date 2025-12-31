<script lang="ts">
  /**
   * Array input with list dropdown
   * Shows collapsed preview, expands to list with add/remove
   */
  import ListDropdown from './ListDropdown.svelte';
  import { calculateDropdownPosition } from '../../lib/input-utils.svelte';

  interface Props {
    /** Current array value */
    value: string[];
    /** Called when value changes */
    onChange: (value: string[]) => void;
    /** Whether input is disabled */
    disabled?: boolean;
    /** Placeholder for add input */
    addPlaceholder?: string;
    /** CSS class for styling */
    class?: string;
  }

  let {
    value,
    onChange,
    disabled = false,
    addPlaceholder = 'Add item...',
    class: className = ''
  }: Props = $props();

  let triggerRef = $state<HTMLButtonElement | null>(null);
  let listItemsContainer = $state<HTMLDivElement | null>(null);

  // List dropdown state
  let showList = $state(false);
  let listPosition = $state<{ top: number; left: number } | null>(null);
  let listCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Add input state
  let addInputValue = $state('');

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
      listCloseTimeout = null;
    }, 150);
  }

  function cancelCloseList(): void {
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
  }

  function addItem(): void {
    const trimmed = addInputValue.trim();
    if (!trimmed) return;
    // Don't add duplicates
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed]);
      scrollListToBottom();
    }
    addInputValue = '';
  }

  function handleRemove(item: string): void {
    onChange(value.filter((i) => i !== item));
  }

  function handleAddKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  }
</script>

<button
  type="button"
  class="array-trigger {className}"
  bind:this={triggerRef}
  {disabled}
  onmouseenter={openList}
  onmouseleave={scheduleCloseList}
  onfocus={openList}
>
  {#if value.length === 0}
    <span class="list-empty">+</span>
  {:else if value.length === 1}
    <span class="list-preview">{value[0]}</span>
  {:else}
    <span class="list-preview">{value[0]}</span>
    <span class="list-count">+{value.length - 1}</span>
  {/if}
</button>

{#if showList && listPosition}
  <ListDropdown
    items={value}
    position={listPosition}
    onRemove={handleRemove}
    onMouseEnter={cancelCloseList}
    onMouseLeave={scheduleCloseList}
    itemsContainerRef={(el) => (listItemsContainer = el)}
  >
    {#snippet addSection()}
      <input
        type="text"
        class="list-add-input"
        placeholder={addPlaceholder}
        bind:value={addInputValue}
        onkeydown={handleAddKeydown}
      />
      <button type="button" class="list-add-btn" onclick={addItem}> + </button>
    {/snippet}
  </ListDropdown>
{/if}

<style>
  .array-trigger {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: inherit;
    color: inherit;
  }

  .array-trigger:focus {
    outline: none;
    background: var(--bg-tertiary);
  }

  .array-trigger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .list-empty {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .list-preview {
    color: var(--text-secondary);
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .list-add-btn {
    flex-shrink: 0;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .list-add-btn:hover {
    opacity: 0.9;
  }
</style>
