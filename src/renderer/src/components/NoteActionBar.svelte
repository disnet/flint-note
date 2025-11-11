<script lang="ts">
  interface Props {
    isPinned: boolean;
    metadataExpanded: boolean;
    isInSidebar: boolean;
    previewMode: boolean;
    reviewEnabled?: boolean;
    isLoadingReview?: boolean;
    onPinToggle: () => Promise<void>;
    onMetadataToggle: () => void;
    onAddToSidebar: () => Promise<void>;
    onPreviewToggle: () => void;
    onReviewToggle?: () => Promise<void>;
  }

  let {
    isPinned,
    metadataExpanded,
    isInSidebar,
    previewMode,
    reviewEnabled = false,
    isLoadingReview = false,
    onPinToggle,
    onMetadataToggle,
    onAddToSidebar,
    onPreviewToggle,
    onReviewToggle
  }: Props = $props();
</script>

<div class="note-action-bar">
  <button
    class="action-button"
    class:active={isPinned}
    onclick={onPinToggle}
    type="button"
    title={isPinned ? 'Unpin note' : 'Pin note'}
  >
    {isPinned ? '📌 Pinned' : '📌 Pin Note'}
  </button>
  <button
    class="action-button"
    class:active={metadataExpanded}
    onclick={onMetadataToggle}
    type="button"
    title={metadataExpanded ? 'Hide metadata' : 'Show metadata'}
  >
    {metadataExpanded ? '▼ Hide Metadata' : '▶ Show Metadata'}
  </button>
  <button
    class="action-button"
    class:active={isInSidebar}
    onclick={onAddToSidebar}
    type="button"
    title={isInSidebar ? 'Already in sidebar' : 'Add to sidebar'}
    disabled={isInSidebar}
  >
    {isInSidebar ? '📋 In Sidebar' : '📋 Add to Sidebar'}
  </button>
  <button
    class="action-button"
    class:active={previewMode}
    onclick={onPreviewToggle}
    type="button"
    title={previewMode ? 'Switch to edit mode' : 'Switch to preview mode'}
  >
    {previewMode ? '✏️ Edit' : '👁 Preview'}
  </button>
  {#if onReviewToggle}
    <button
      class="action-button"
      class:active={reviewEnabled}
      onclick={onReviewToggle}
      type="button"
      title={reviewEnabled
        ? 'Disable review for this note'
        : 'Enable review for this note'}
      disabled={isLoadingReview}
    >
      {isLoadingReview
        ? '⏳ ...'
        : reviewEnabled
          ? '🔁 Review Enabled'
          : '🔁 Enable Review'}
    </button>
  {/if}
</div>

<style>
  .note-action-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .action-button {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-button:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .action-button.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .action-button.active:hover {
    filter: brightness(0.9);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
