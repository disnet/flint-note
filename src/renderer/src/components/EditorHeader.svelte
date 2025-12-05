<script lang="ts">
  import NoteTitle from './NoteTitle.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
  import EditorChips from './EditorChips.svelte';
  import type { MetadataSchema } from '../../../server/core/metadata-schema';

  interface NoteData {
    id: string;
    type: string;
    created: string;
    updated: string;
    metadata: Record<string, unknown>;
  }

  interface Props {
    title: string;
    noteType: string;
    /** The note's content kind (markdown, epub, type, etc.) */
    noteKind?: string;
    onTitleChange: (newTitle: string) => Promise<void>;
    onTypeChange: (newType: string) => Promise<void>;
    onTabToContent?: () => void;
    disabled?: boolean;
    /** When true, disables type change (used for type notes) */
    disableTypeChange?: boolean;
    // Chips props
    note?: NoteData;
    metadataSchema?: MetadataSchema;
    editorChips?: string[];
    onMetadataChange?: (field: string, value: unknown) => void;
    // Action menu props
    isPinned?: boolean;
    isOnShelf?: boolean;
    previewMode?: boolean;
    reviewEnabled?: boolean;
    isLoadingReview?: boolean;
    suggestionsEnabled?: boolean;
    hasSuggestions?: boolean;
    isGeneratingSuggestions?: boolean;
    onPinToggle?: () => Promise<void>;
    onAddToShelf?: () => Promise<void>;
    onPreviewToggle?: () => void;
    onReviewToggle?: () => Promise<void>;
    onGenerateSuggestions?: () => Promise<void>;
    onArchiveNote?: () => Promise<void>;
  }

  let {
    title,
    noteType,
    noteKind,
    onTitleChange,
    onTypeChange,
    onTabToContent,
    disabled = false,
    disableTypeChange = false,
    note,
    metadataSchema,
    editorChips,
    onMetadataChange,
    isPinned = false,
    isOnShelf = false,
    previewMode = false,
    reviewEnabled = false,
    isLoadingReview = false,
    suggestionsEnabled = false,
    hasSuggestions = false,
    isGeneratingSuggestions = false,
    onPinToggle,
    onAddToShelf,
    onPreviewToggle,
    onReviewToggle,
    onGenerateSuggestions,
    onArchiveNote
  }: Props = $props();

  let titleComponent: { focus?: () => void } | null = null;
  let showMenu = $state(false);
  let menuButtonRef = $state<HTMLButtonElement | null>(null);
  let menuPosition = $state({ top: 0, left: 0 });

  export function focusTitle(): void {
    if (titleComponent && titleComponent.focus) {
      titleComponent.focus();
    }
  }

  function updateMenuPosition(): void {
    if (menuButtonRef) {
      const rect = menuButtonRef.getBoundingClientRect();
      menuPosition = {
        top: rect.bottom + 4,
        left: rect.left
      };
    }
  }

  function toggleMenu(): void {
    if (!showMenu) {
      updateMenuPosition();
    }
    showMenu = !showMenu;
  }

  function closeMenu(): void {
    showMenu = false;
  }
</script>

<div class="editor-header-container" role="group" aria-label="Note header">
  <div class="editor-header-title-row">
    <div class="gutter-menu-container">
      <button
        bind:this={menuButtonRef}
        class="gutter-menu-button"
        class:active={showMenu}
        onclick={toggleMenu}
        type="button"
        title="Note actions"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {#if showMenu}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="menu-backdrop" onclick={closeMenu}></div>
        <div
          class="action-menu"
          style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
        >
          {#if onPinToggle}
            <button
              class="menu-item"
              class:active={isPinned}
              onclick={() => {
                onPinToggle?.();
                closeMenu();
              }}
              type="button"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 17v5"></path>
                <path
                  d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
                ></path>
              </svg>
              {isPinned ? 'Unpin Note' : 'Pin Note'}
            </button>
          {/if}

          {#if onAddToShelf}
            <button
              class="menu-item"
              class:active={isOnShelf}
              onclick={() => {
                onAddToShelf?.();
                closeMenu();
              }}
              type="button"
              disabled={isOnShelf}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              {isOnShelf ? 'On Shelf' : 'Add to Shelf'}
            </button>
          {/if}

          {#if onPreviewToggle}
            <button
              class="menu-item"
              class:active={previewMode}
              onclick={() => {
                onPreviewToggle?.();
                closeMenu();
              }}
              type="button"
            >
              {#if previewMode}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                  <path d="m15 5 4 4"></path>
                </svg>
                Edit Mode
              {:else}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Preview Mode
              {/if}
            </button>
          {/if}

          {#if onReviewToggle}
            <button
              class="menu-item"
              class:active={reviewEnabled}
              onclick={() => {
                onReviewToggle?.();
                closeMenu();
              }}
              type="button"
              disabled={isLoadingReview}
            >
              {#if isLoadingReview}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="spinner"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
                Loading...
              {:else}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                {reviewEnabled ? 'Disable Review' : 'Enable Review'}
              {/if}
            </button>
          {/if}

          {#if suggestionsEnabled && onGenerateSuggestions}
            <button
              class="menu-item"
              onclick={() => {
                onGenerateSuggestions?.();
                closeMenu();
              }}
              type="button"
              disabled={isGeneratingSuggestions}
            >
              {#if isGeneratingSuggestions}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="spinner"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
                Generating...
              {:else}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
                  ></path>
                  <path d="M9 18h6"></path>
                  <path d="M10 22h4"></path>
                </svg>
                {hasSuggestions ? 'Regenerate Suggestions' : 'Generate Suggestions'}
              {/if}
            </button>
          {/if}

          {#if onArchiveNote}
            <button
              class="menu-item archive"
              onclick={() => {
                onArchiveNote?.();
                closeMenu();
              }}
              type="button"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="21 8 21 21 3 21 3 8"></polyline>
                <rect x="1" y="3" width="22" height="5"></rect>
                <line x1="10" y1="12" x2="14" y2="12"></line>
              </svg>
              Archive Note
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="title-area">
      <NoteTypeDropdown
        currentType={noteType}
        currentKind={noteKind}
        {onTypeChange}
        disabled={disabled || disableTypeChange}
        compact={true}
      />
      <NoteTitle
        bind:this={titleComponent}
        value={title}
        onSave={onTitleChange}
        {onTabToContent}
        {disabled}
      />
      {#if note && metadataSchema}
        <EditorChips
          {note}
          {metadataSchema}
          {editorChips}
          {onMetadataChange}
          {disabled}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  .editor-header-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    padding-left: 8px;
  }

  .editor-header-title-row {
    display: flex;
    align-items: flex-start;
    width: 100%;
    min-width: 0;
  }

  /* Container for type dropdown, title, and chips - all aligned */
  .title-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  /* Gutter menu button - extends into the left margin */
  .gutter-menu-container {
    position: relative;
    margin-left: -2rem;
    width: 1.5rem;
    flex-shrink: 0;
    /* Align with first line of title (title has 0.1em top padding + line-height adjustment) */
    margin-top: 0.5rem;
  }

  .gutter-menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    color: var(--text-muted);
    opacity: 0;
    transition: all 0.15s ease;
  }

  .editor-header-title-row:hover .gutter-menu-button,
  .gutter-menu-button:focus,
  .gutter-menu-button.active {
    opacity: 1;
  }

  .gutter-menu-button:hover {
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .gutter-menu-button.active {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  /* Menu backdrop */
  .menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  /* Dropdown menu */
  .action-menu {
    position: fixed;
    min-width: 180px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 1000;
    overflow: hidden;
    animation: menuSlideDown 0.15s ease-out;
  }

  @keyframes menuSlideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-primary);
    transition: background-color 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .menu-item:hover {
    background: var(--bg-secondary);
  }

  .menu-item.active {
    background: var(--bg-secondary);
    color: var(--accent-primary);
  }

  .menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-item:not(:last-child) {
    border-bottom: 1px solid var(--border-light);
  }

  .menu-item.archive {
    color: var(--text-secondary);
  }

  .menu-item svg {
    flex-shrink: 0;
  }

  /* Spinner animation */
  .spinner {
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

  /* Position type dropdown absolutely in the first line indent space */
  .title-area :global(.note-type-dropdown.compact) {
    position: absolute;
    top: 0.4em; /* Match title's top padding */
    left: 0;
    z-index: 1;
  }

  .title-area :global(.note-type-dropdown.compact .type-button) {
    padding: 0.1em 0.25rem;
  }

  .title-area :global(.note-type-dropdown.compact .type-icon) {
    font-size: 1.5rem;
  }

  /* Indent first line of title to make room for type dropdown */
  .title-area :global(.note-title-input) {
    text-indent: 2.3rem; /* Space for the type icon */
  }
</style>
