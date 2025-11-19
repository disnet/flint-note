<script lang="ts">
  interface Props {
    visible: boolean;
    x: number;
    y: number;
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
    displayText,
    linkRect,
    onSave,
    onCancel,
    onCommit
  }: Props = $props();

  let inputValue = $state(displayText);
  let inputElement: HTMLInputElement | undefined = $state();
  let popoverElement: HTMLDivElement | undefined = $state();

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
{/if}

<style>
  .wikilink-popover {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.5rem;
    min-width: 280px;
    max-width: 400px;
  }

  .popover-content {
    display: flex;
    min-width: 0;
    width: 100%;
  }

  input[type='text'] {
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    outline: none;
    transition: border-color 0.15s;
    flex: 1;
    min-width: 0;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  input[type='text']:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  input[type='text']::placeholder {
    color: var(--text-secondary);
  }
</style>
