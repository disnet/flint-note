<script lang="ts">
  /**
   * Floating toolbar that appears when text is selected in the editor.
   * Provides quick access to formatting actions: Bold, Italic, Code, Link, Wikilink
   */
  import type { FormatType } from '../lib/automerge/selection-toolbar.svelte';
  import { useTouchInteractions } from '../stores/deviceState.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    visible: boolean;
    x: number;
    selectionRect: { top: number; bottom: number; left: number; right: number } | null;
    onFormat: (format: FormatType) => void;
    onClose: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    selectionRect,
    onFormat,
    onClose
  }: Props = $props();

  // Detect if we're on macOS for showing the right symbol
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  // Toolbar buttons configuration
  const buttons: Array<{
    format: FormatType;
    icon: string;
    label: string;
    shortcut?: string;
  }> = [
    { format: 'bold', icon: 'B', label: 'Bold', shortcut: `${cmdKey}B` },
    { format: 'italic', icon: 'I', label: 'Italic', shortcut: `${cmdKey}I` },
    { format: 'strikethrough', icon: 'S', label: 'Strikethrough' },
    { format: 'code', icon: '<>', label: 'Code' },
    { format: 'link', icon: '🔗', label: 'Link', shortcut: `${cmdKey}K` },
    { format: 'wikilink', icon: '[[', label: 'Wiki Link' }
  ];

  function handleFormatClick(format: FormatType): void {
    onFormat(format);
    onClose();
  }

  function handleMouseDown(e: MouseEvent): void {
    // Prevent the mousedown from blurring the editor
    e.preventDefault();
  }

  // Calculate final position avoiding viewport edges
  const toolbarWidth = 240;
  const toolbarHeight = 40;
  const padding = 8;
  const gap = 8;

  const position = $derived.by(() => {
    if (!visible || !selectionRect) return { x: 0, y: 0 };

    let finalX = x - toolbarWidth / 2; // Center on selection
    let finalY = selectionRect.top - toolbarHeight - gap; // Above selection

    // Keep within horizontal bounds
    if (finalX < padding) finalX = padding;
    if (finalX + toolbarWidth > window.innerWidth - padding) {
      finalX = window.innerWidth - toolbarWidth - padding;
    }

    // If not enough room above, position below selection
    if (finalY < padding) {
      finalY = selectionRect.bottom + gap;
    }

    // On touch devices, prefer below to avoid covering selection handles
    if (useTouchInteractions()) {
      const belowY = selectionRect.bottom + gap;
      if (belowY + toolbarHeight < window.innerHeight - padding) {
        finalY = belowY;
      }
    }

    return { x: finalX, y: finalY };
  });
</script>

{#if visible}
  <div
    class="selection-toolbar"
    class:touch={useTouchInteractions()}
    style="left: {position.x}px; top: {position.y}px;"
    role="toolbar"
    aria-label="Text formatting"
  >
    {#each buttons as button (button.format)}
      <Tooltip
        text={button.shortcut ? `${button.label} (${button.shortcut})` : button.label}
        position="bottom"
      >
        <button
          type="button"
          class="toolbar-button"
          class:icon-only={button.format === 'link'}
          onclick={() => handleFormatClick(button.format)}
          onmousedown={handleMouseDown}
        >
          {#if button.format === 'bold'}
            <span class="icon bold">B</span>
          {:else if button.format === 'italic'}
            <span class="icon italic">I</span>
          {:else if button.format === 'strikethrough'}
            <span class="icon strikethrough">S</span>
          {:else if button.format === 'code'}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          {:else if button.format === 'link'}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
              ></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
              ></path>
            </svg>
          {:else if button.format === 'wikilink'}
            <span class="icon wikilink">[[</span>
          {/if}
        </button>
      </Tooltip>
    {/each}
  </div>
{/if}

<style>
  .selection-toolbar {
    position: fixed;
    z-index: 1001;
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
    pointer-events: auto;
  }

  .selection-toolbar.touch {
    padding: 6px;
    gap: 4px;
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .selection-toolbar.touch .toolbar-button {
    width: 44px;
    height: 44px;
  }

  .toolbar-button:hover {
    background: var(--bg-secondary);
  }

  .toolbar-button:active {
    background: var(--bg-tertiary);
  }

  .toolbar-button svg {
    flex-shrink: 0;
  }

  .icon {
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-editor), serif;
  }

  .selection-toolbar.touch .icon {
    font-size: 16px;
  }

  .icon.bold {
    font-weight: 700;
  }

  .icon.italic {
    font-style: italic;
  }

  .icon.strikethrough {
    text-decoration: line-through;
  }

  .icon.wikilink {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-mono), monospace;
  }

  .selection-toolbar.touch .icon.wikilink {
    font-size: 14px;
  }

  /* Separator between format groups could be added here */

  @media (hover: hover) {
    .toolbar-button:hover {
      background: var(--bg-secondary);
    }
  }

  @media (hover: none) {
    .toolbar-button:active {
      background: var(--bg-secondary);
    }
  }
</style>
