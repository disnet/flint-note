<script lang="ts">
  /**
   * Single note link input with picker dropdown
   * Shows note title when selected, search picker when empty
   */
  import NoteLinkPicker from './NoteLinkPicker.svelte';
  import {
    getNoteTitleById,
    calculateDropdownPosition
  } from '../../lib/input-utils.svelte';

  interface Props {
    /** Current note ID value */
    value: string | null;
    /** Called when value changes */
    onChange: (value: string | null) => void;
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

  let containerRef = $state<HTMLDivElement | null>(null);
  let pickerRef = $state<NoteLinkPicker | null>(null);
  let showPicker = $state(false);
  let pickerPosition = $state<{ top: number; left: number } | null>(null);
  let searchQuery = $state('');

  const excludeIds = $derived(excludeNoteId ? [excludeNoteId] : []);

  function openPicker(): void {
    if (disabled || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    pickerPosition = calculateDropdownPosition(rect, { width: 280, height: 300 });
    showPicker = true;
    searchQuery = '';
  }

  function closePicker(): void {
    showPicker = false;
    pickerPosition = null;
    searchQuery = '';
  }

  function handleSelect(noteId: string): void {
    onChange(noteId);
    closePicker();
  }

  function handleClear(): void {
    onChange(null);
  }

  function handleNoteClick(): void {
    if (value && onNoteClick) {
      onNoteClick(value);
    }
  }

  function handleInputFocus(): void {
    openPicker();
  }

  function handleInputBlur(): void {
    // Delay to allow click on picker item
    setTimeout(closePicker, 150);
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      closePicker();
      (e.currentTarget as HTMLInputElement).blur();
    } else if (showPicker && pickerRef) {
      // Forward navigation keys to the picker
      pickerRef.handleExternalKeydown(e);
    }
  }
</script>

<div class="notelink-input-container {className}" bind:this={containerRef}>
  {#if value}
    <button type="button" class="notelink-value" onclick={handleNoteClick} {disabled}>
      {getNoteTitleById(value)}
    </button>
    {#if !disabled}
      <button type="button" class="clear-btn" onclick={handleClear}> &times; </button>
    {/if}
  {:else}
    <input
      type="text"
      class="notelink-search"
      value={searchQuery}
      placeholder="+"
      {disabled}
      onfocus={handleInputFocus}
      onblur={handleInputBlur}
      oninput={(e) => (searchQuery = e.currentTarget.value)}
      onkeydown={handleInputKeydown}
    />
  {/if}
</div>

{#if showPicker && pickerPosition}
  <NoteLinkPicker
    bind:this={pickerRef}
    position={pickerPosition}
    excludeNoteIds={excludeIds}
    {searchQuery}
    onSearchChange={(q) => (searchQuery = q)}
    onSelect={handleSelect}
    onClose={closePicker}
    hideSearchInput={true}
  />
{/if}

<style>
  .notelink-input-container {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .notelink-value {
    background: none;
    border: none;
    color: var(--accent-primary);
    font-size: inherit;
    cursor: pointer;
    padding: 0;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notelink-value:hover:not(:disabled) {
    text-decoration: underline;
  }

  .notelink-value:disabled {
    cursor: default;
    opacity: 0.8;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    font-size: 0.9rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: var(--text-secondary);
  }

  .notelink-search {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: inherit;
    padding: 0;
    width: 2rem;
    outline: none;
    text-align: center;
  }

  .notelink-search:focus {
    background: var(--bg-primary);
    width: 6rem;
    text-align: left;
  }

  .notelink-search:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
