<script lang="ts">
  /**
   * Edit popover for markdown links in the editor.
   * Two input fields: link text and URL.
   */
  interface Props {
    visible: boolean;
    x: number;
    y: number;
    displayText: string;
    url: string;
    linkRect: { top: number; bottom: number; left: number; height: number } | null;
    onSave: (newDisplayText: string, newUrl: string) => void;
    onCancel: () => void;
    onCommit?: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    displayText,
    url,
    linkRect,
    onSave,
    onCancel,
    onCommit
  }: Props = $props();

  let textInputValue = $state(displayText);
  let urlInputValue = $state(url);
  let textInputElement: HTMLInputElement | undefined = $state();
  let urlInputElement: HTMLInputElement | undefined = $state();
  let popoverElement: HTMLDivElement | undefined = $state();

  // Update input values when props change (but only if we're not actively editing)
  $effect(() => {
    if (textInputElement !== document.activeElement) {
      textInputValue = displayText;
    }
  });

  $effect(() => {
    if (urlInputElement !== document.activeElement) {
      urlInputValue = url;
    }
  });

  // Focus the text input when the popover becomes visible
  $effect(() => {
    if (visible && textInputElement) {
      setTimeout(() => {
        textInputElement?.focus();
        textInputElement?.select();
      }, 0);
    }
  });

  // Close on click outside
  $effect(() => {
    if (!visible) return;

    function handleClickOutside(e: MouseEvent): void {
      if (popoverElement && !popoverElement.contains(e.target as Node)) {
        // Save current values before closing if they're valid
        if (textInputValue.trim() && urlInputValue.trim()) {
          onSave(textInputValue.trim(), urlInputValue.trim());
        }
        onCommit?.();
      }
    }

    // Delay adding listener to avoid immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });

  export function hasFocus(): boolean {
    return (
      textInputElement === document.activeElement ||
      urlInputElement === document.activeElement
    );
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
    if (textInputValue.trim() && urlInputValue.trim()) {
      onSave(textInputValue.trim(), urlInputValue.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (!visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Commit the current values and close
      if (textInputValue.trim() && urlInputValue.trim()) {
        onSave(textInputValue.trim(), urlInputValue.trim());
      }
      onCommit?.();
    }
  }
</script>

{#if visible}
  <div
    bind:this={popoverElement}
    class="markdown-link-popover"
    style="left: {x}px; top: {y}px;"
  >
    <div class="popover-content">
      <div class="input-group">
        <label for="text-input">Text</label>
        <input
          id="text-input"
          type="text"
          bind:this={textInputElement}
          bind:value={textInputValue}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Link text"
        />
      </div>
      <div class="input-group">
        <label for="url-input">URL</label>
        <input
          id="url-input"
          type="text"
          bind:this={urlInputElement}
          bind:value={urlInputValue}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="https://example.com"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .markdown-link-popover {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.75rem;
    min-width: 320px;
    max-width: 450px;
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  input[type='text'] {
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
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
