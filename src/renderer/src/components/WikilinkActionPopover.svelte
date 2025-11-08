<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    identifier: string;
    linkRect: { top: number; bottom: number; left: number; height: number } | null;
    onOpen: () => void;
    onEdit: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    identifier,
    linkRect,
    onOpen,
    onEdit
  }: Props = $props();

  let popoverElement: HTMLDivElement | undefined = $state();

  // Derive the display label from the note metadata
  const displayLabel = $derived.by(() => {
    const note = notesStore.notes.find((n) => n.id === identifier);
    if (note) {
      return `${note.type}/${note.filename}`;
    }
    return identifier;
  });

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
    <div class="popover-content">
      <div class="link-info">
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="link-value">{displayLabel}</span>
      </div>
      <div class="actions">
        <button
          type="button"
          class="action-button"
          onclick={handleOpenClick}
          onmousedown={handleMouseDown}
        >
          <span>Open</span>
          <kbd>{cmdKey}↵</kbd>
        </button>
        <button
          type="button"
          class="action-button"
          onclick={handleEditClick}
          onmousedown={handleMouseDown}
        >
          <span>Edit</span>
          <kbd>{altKey}↵</kbd>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .action-popover {
    position: fixed;
    z-index: 1000;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 12px;
    min-width: 140px;
    max-width: 250px;
    pointer-events: auto;
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
  }

  .link-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
    min-width: 0;
  }

  .icon {
    width: 14px;
    height: 14px;
    color: #6b7280;
    flex-shrink: 0;
  }

  .link-value {
    font-size: 12px;
    color: #6b7280;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .action-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-button:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .action-button:active {
    background: #e5e7eb;
  }

  kbd {
    background: rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 3px;
    padding: 2px 5px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .action-popover {
      background: #1f2937;
      border-color: #374151;
    }

    .link-info {
      border-bottom-color: #374151;
    }

    .icon {
      color: #9ca3af;
    }

    .link-value {
      color: #9ca3af;
    }

    .action-button {
      background: #111827;
      border-color: #374151;
      color: #e5e7eb;
    }

    .action-button:hover {
      background: #1f2937;
      border-color: #4b5563;
    }

    .action-button:active {
      background: #374151;
    }

    kbd {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.3);
    }
  }
</style>
