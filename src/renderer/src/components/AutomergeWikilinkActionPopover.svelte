<script lang="ts">
  /**
   * Action popover for wikilinks in the Automerge editor.
   * Shows actions: Open note, Edit display text
   */
  interface Props {
    visible: boolean;
    x: number;
    y: number;
    linkRect: { top: number; bottom: number; left: number; height: number } | null;
    onOpen: () => void;
    onEdit: () => void;
  }

  let { visible = $bindable(false), x, y, linkRect, onOpen, onEdit }: Props = $props();

  let popoverElement: HTMLDivElement | undefined = $state();

  // Detect if we're on macOS for showing the right symbol
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';
  const altKey = isMac ? '⌥' : 'Alt';

  function handleOpenClick(): void {
    onOpen();
  }

  function handleEditClick(): void {
    onEdit();
  }

  function handleMouseDown(e: MouseEvent): void {
    // Prevent the mousedown from blurring the editor
    e.preventDefault();
  }

  // Adjust position when visible to avoid covering the link
  $effect(() => {
    if (visible && popoverElement && linkRect) {
      const rect = popoverElement.getBoundingClientRect();
      const actualHeight = rect.height;

      // Check if popover is covering the link
      const popoverBottom = rect.top + actualHeight;
      const isCoveringLink = rect.top < linkRect.bottom && popoverBottom > linkRect.top;

      if (isCoveringLink) {
        // Position above the link instead
        const newY = linkRect.top - 4 - actualHeight;
        popoverElement.style.top = `${newY}px`;
      }
    }
  });
</script>

{#if visible}
  <div bind:this={popoverElement} class="action-popover" style="left: {x}px; top: {y}px;">
    <button
      type="button"
      class="action-item"
      onclick={handleOpenClick}
      onmousedown={handleMouseDown}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>Open</span>
      <kbd>{cmdKey}↵</kbd>
    </button>
    <button
      type="button"
      class="action-item"
      onclick={handleEditClick}
      onmousedown={handleMouseDown}
    >
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
      <span>Edit Display Text</span>
      <kbd>{altKey}↵</kbd>
    </button>
  </div>
{/if}

<style>
  .action-popover {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 180px;
    padding: 0.25rem;
    pointer-events: auto;
  }

  .action-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.25rem;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .action-item:hover {
    background: var(--bg-secondary);
  }

  .action-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .action-item span {
    flex: 1;
  }

  kbd {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 3px;
    padding: 2px 5px;
    font-family: inherit;
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }
</style>
