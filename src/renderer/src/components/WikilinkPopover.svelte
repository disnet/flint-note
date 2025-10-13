<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    identifier: string;
    displayText: string;
    linkRect: { top: number; bottom: number; left: number; height: number } | null;
    onSave: (newDisplayText: string) => void;
    onCancel: () => void;
    onCommit?: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    identifier,
    displayText,
    linkRect,
    onSave,
    onCancel,
    onCommit
  }: Props = $props();

  let inputValue = $state(displayText);
  let inputElement: HTMLInputElement | undefined = $state();
  let popoverElement: HTMLDivElement | undefined = $state();

  // Derive the display label from the note metadata
  const displayLabel = $derived.by(() => {
    const note = notesStore.notes.find((n) => n.id === identifier);
    if (note) {
      return `${note.type}/${note.filename}`;
    }
    return identifier;
  });

  // Update input value when displayText changes (but only if we're not actively editing)
  $effect(() => {
    // Only update if the input doesn't have focus (not being edited)
    if (inputElement !== document.activeElement) {
      inputValue = displayText;
    }
  });

  // Focus the input when the popover becomes visible
  $effect(() => {
    if (visible && inputElement) {
      // Use setTimeout to ensure the DOM has rendered
      setTimeout(() => {
        inputElement?.focus();
        inputElement?.select(); // Also select all text for easier editing
      }, 0);
    }
  });

  export function hasFocus(): boolean {
    return inputElement === document.activeElement;
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

  function handleInput(): void {
    if (inputValue.trim()) {
      onSave(inputValue.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Only handle keys when popover is visible
    if (!visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Commit the current value and close
      if (inputValue.trim()) {
        onSave(inputValue.trim());
      }
      onCommit?.();
    }
  }
</script>

{#if visible}
  <div
    bind:this={popoverElement}
    class="wikilink-popover"
    style="left: {x}px; top: {y}px;"
  >
    <div class="popover-content">
      <div class="link-section">
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="link-value">{displayLabel}</span>
      </div>
      <div class="display-section">
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <input
          id="display-input"
          type="text"
          bind:this={inputElement}
          bind:value={inputValue}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Display text"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .wikilink-popover {
    position: fixed;
    z-index: 1000;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 12px;
    min-width: 180px;
    max-width: 400px;
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    width: 100%;
  }

  .link-section,
  .display-section {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .icon {
    width: 16px;
    height: 16px;
    color: #6b7280;
    flex-shrink: 0;
  }

  .link-value {
    font-size: 13px;
    color: #111827;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  input[type='text'] {
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    outline: none;
    transition: border-color 0.15s;
    flex: 1;
    min-width: 0;
  }

  input[type='text']:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .wikilink-popover {
      background: #1f2937;
      border-color: #374151;
    }

    .icon {
      color: #9ca3af;
    }

    .link-value {
      color: #e5e7eb;
    }

    input[type='text'] {
      background: #111827;
      border-color: #374151;
      color: #e5e7eb;
    }

    input[type='text']:focus {
      border-color: #3b82f6;
    }
  }
</style>
