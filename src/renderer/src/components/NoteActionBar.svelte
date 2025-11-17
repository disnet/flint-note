<script lang="ts">
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';

  interface Props {
    noteType: string;
    onTypeChange: (newType: string) => Promise<void>;
    disabled?: boolean;
    isPinned: boolean;
    metadataExpanded: boolean;
    isOnShelf: boolean;
    previewMode: boolean;
    reviewEnabled?: boolean;
    isLoadingReview?: boolean;
    suggestionsEnabled?: boolean;
    hasSuggestions?: boolean;
    isGeneratingSuggestions?: boolean;
    onPinToggle: () => Promise<void>;
    onMetadataToggle: () => void;
    onAddToShelf: () => Promise<void>;
    onPreviewToggle: () => void;
    onReviewToggle?: () => Promise<void>;
    onGenerateSuggestions?: () => Promise<void>;
    onArchiveNote?: () => Promise<void>;
  }

  let {
    noteType,
    onTypeChange,
    disabled = false,
    isPinned,
    metadataExpanded,
    isOnShelf,
    previewMode,
    reviewEnabled = false,
    isLoadingReview = false,
    suggestionsEnabled = false,
    hasSuggestions = false,
    isGeneratingSuggestions = false,
    onPinToggle,
    onMetadataToggle,
    onAddToShelf,
    onPreviewToggle,
    onReviewToggle,
    onGenerateSuggestions,
    onArchiveNote
  }: Props = $props();

  let showPopover = $state(false);

  function togglePopover(): void {
    showPopover = !showPopover;
  }

  function closePopover(): void {
    showPopover = false;
  }
</script>

<div class="note-action-bar">
  <NoteTypeDropdown currentType={noteType} {onTypeChange} {disabled} />
  <button
    class="action-button"
    class:active={isPinned}
    onclick={onPinToggle}
    type="button"
    title={isPinned ? 'Unpin note' : 'Pin note'}
  >
    {isPinned ? '📌 Pinned' : '📌 Pin'}
  </button>
  <button
    class="action-button"
    class:active={metadataExpanded}
    onclick={onMetadataToggle}
    type="button"
    title={metadataExpanded ? 'Hide metadata' : 'Show metadata'}
  >
    {metadataExpanded ? '▼ Metadata' : '▶ Metadata'}
  </button>
  <button
    class="action-button"
    class:active={isOnShelf}
    onclick={onAddToShelf}
    type="button"
    title={isOnShelf ? 'Already on shelf' : 'Add to shelf'}
    disabled={isOnShelf}
  >
    {isOnShelf ? '📋 On Shelf' : '📋 Shelf'}
  </button>
  <div class="overflow-menu-container">
    <button
      class="action-button overflow-button"
      class:active={showPopover}
      onclick={togglePopover}
      type="button"
      title="More actions"
    >
      ⋯
    </button>

    {#if showPopover}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="popover-backdrop" onclick={closePopover}></div>
      <div class="popover">
        <button
          class="popover-item"
          class:active={previewMode}
          onclick={() => {
            onPreviewToggle();
            closePopover();
          }}
          type="button"
        >
          {previewMode ? '✏️ Edit Mode' : '👁 Preview Mode'}
        </button>
        {#if onReviewToggle}
          <button
            class="popover-item"
            class:active={reviewEnabled}
            onclick={() => {
              onReviewToggle?.();
              closePopover();
            }}
            type="button"
            disabled={isLoadingReview}
          >
            {isLoadingReview
              ? '⏳ Loading...'
              : reviewEnabled
                ? '🔁 Review Enabled'
                : '🔁 Enable Review'}
          </button>
        {/if}
        {#if suggestionsEnabled && onGenerateSuggestions}
          <button
            class="popover-item"
            onclick={() => {
              onGenerateSuggestions?.();
              closePopover();
            }}
            type="button"
            disabled={isGeneratingSuggestions}
          >
            {isGeneratingSuggestions
              ? '⏳ Generating...'
              : hasSuggestions
                ? '💡 Regenerate Suggestions'
                : '💡 Generate Suggestions'}
          </button>
        {/if}
        {#if onArchiveNote}
          <button
            class="popover-item"
            onclick={() => {
              onArchiveNote?.();
              closePopover();
            }}
            type="button"
          >
            🗄️ Archive Note
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .note-action-bar {
    position: relative;
    display: flex;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .action-button {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-button:hover {
    background: var(--bg-secondary);
    border-color: var(--border-light);
    color: var(--text-primary);
  }

  .action-button.active {
    background: var(--bg-secondary);
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .action-button.active:hover {
    background: var(--bg-primary);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .overflow-button {
    font-weight: bold;
    font-size: 1rem;
  }

  .overflow-menu-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .popover-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 1000;
    min-width: 200px;
    overflow: hidden;
  }

  .popover-item {
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: background-color 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .popover-item:hover {
    background: var(--bg-primary);
  }

  .popover-item.active {
    background: var(--bg-primary);
    border-left: 2px solid var(--accent-primary);
    padding-left: calc(0.875rem - 2px);
  }

  .popover-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .popover-item:not(:last-child) {
    border-bottom: 1px solid var(--border-light);
  }
</style>
