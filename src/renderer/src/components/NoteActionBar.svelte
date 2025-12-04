<script lang="ts">
  interface Props {
    isPinned: boolean;
    isOnShelf: boolean;
    previewMode: boolean;
    reviewEnabled?: boolean;
    isLoadingReview?: boolean;
    suggestionsEnabled?: boolean;
    hasSuggestions?: boolean;
    isGeneratingSuggestions?: boolean;
    onPinToggle: () => Promise<void>;
    onAddToShelf: () => Promise<void>;
    onPreviewToggle: () => void;
    onReviewToggle?: () => Promise<void>;
    onGenerateSuggestions?: () => Promise<void>;
    onArchiveNote?: () => Promise<void>;
  }

  let {
    isPinned,
    isOnShelf,
    previewMode,
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

  let showPopover = $state(false);

  function togglePopover(): void {
    showPopover = !showPopover;
  }

  function closePopover(): void {
    showPopover = false;
  }
</script>

<div class="note-action-bar">
  <button
    class="action-button"
    class:active={isPinned}
    onclick={onPinToggle}
    type="button"
    title={isPinned ? 'Unpin note' : 'Pin note'}
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
    {isPinned ? 'Pinned' : 'Pin'}
  </button>
  <button
    class="action-button"
    class:active={isOnShelf}
    onclick={onAddToShelf}
    type="button"
    title={isOnShelf ? 'Already on shelf' : 'Add to shelf'}
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
    {isOnShelf ? 'On Shelf' : 'Shelf'}
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
              {reviewEnabled ? 'Review Enabled' : 'Enable Review'}
            {/if}
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
            class="popover-item"
            onclick={() => {
              onArchiveNote?.();
              closePopover();
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

  /* Spinner animation for loading states */
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

  /* SVG icon styling */
  .action-button svg,
  .popover-item svg {
    flex-shrink: 0;
  }
</style>
