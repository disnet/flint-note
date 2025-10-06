<script lang="ts">
  interface Props {
    isPinned: boolean;
    metadataExpanded: boolean;
    onPinToggle: () => Promise<void>;
    onMetadataToggle: () => void;
  }

  let { isPinned, metadataExpanded, onPinToggle, onMetadataToggle }: Props = $props();
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
</style>
