<script lang="ts">
  interface Props {
    visible: boolean;
    x: number;
    y: number;
    identifier: string;
    displayText: string;
    onSave: (newDisplayText: string) => void;
    onCancel: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    identifier,
    displayText,
    onSave,
    onCancel
  }: Props = $props();

  let inputValue = $state(displayText);
  let inputElement: HTMLInputElement | undefined = $state();
  let hasBeenOpened = $state(false);

  // Update input value when displayText changes (but only if we're not actively editing)
  $effect(() => {
    // Only update if the input doesn't have focus (not being edited)
    if (inputElement !== document.activeElement) {
      inputValue = displayText;
    }
  });

  // Focus input when popover becomes visible for the first time
  $effect(() => {
    if (visible && inputElement && !hasBeenOpened) {
      hasBeenOpened = true;
      inputElement.focus();
      inputElement.select();
    } else if (!visible) {
      hasBeenOpened = false;
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
    }
  }
</script>

{#if visible}
  <div class="wikilink-popover" style="left: {x}px; top: {y}px;">
    <div class="popover-content">
      <div class="display-section">
        <label for="display-input">{identifier}</label>
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
    min-width: 280px;
    max-width: 400px;
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .display-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  input[type='text'] {
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    outline: none;
    transition: border-color 0.15s;
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

    label {
      color: #9ca3af;
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
