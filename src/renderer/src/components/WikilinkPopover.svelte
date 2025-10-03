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

  // Update input value when displayText changes
  $effect(() => {
    inputValue = displayText;
  });

  // Focus input when popover becomes visible
  $effect(() => {
    if (visible && inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  });

  function handleSave() {
    if (inputValue.trim()) {
      onSave(inputValue.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // Only handle keys when popover is visible
    if (!visible) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }
</script>

{#if visible}
  <div class="wikilink-popover" style="left: {x}px; top: {y}px;">
    <div class="popover-content">
      <div class="identifier-section">
        <div class="label-text">Link to:</div>
        <div class="identifier-value">{identifier}</div>
      </div>
      <div class="display-section">
        <label for="display-input">Display as:</label>
        <input
          id="display-input"
          type="text"
          bind:this={inputElement}
          bind:value={inputValue}
          onkeydown={handleKeydown}
          placeholder="Display text"
        />
      </div>
      <div class="button-section">
        <button class="save-btn" onclick={handleSave}>Save</button>
        <button class="cancel-btn" onclick={onCancel}>Cancel</button>
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
    gap: 10px;
  }

  .identifier-section,
  .display-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label,
  .label-text {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  .identifier-value {
    font-size: 13px;
    color: #374151;
    padding: 6px 8px;
    background: #f9fafb;
    border-radius: 4px;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
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

  .button-section {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  button {
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s;
  }

  .save-btn {
    background: #3b82f6;
    color: white;
  }

  .save-btn:hover {
    background: #2563eb;
  }

  .cancel-btn {
    background: #f3f4f6;
    color: #374151;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .wikilink-popover {
      background: #1f2937;
      border-color: #374151;
    }

    label,
    .label-text {
      color: #9ca3af;
    }

    .identifier-value {
      background: #111827;
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

    .cancel-btn {
      background: #374151;
      color: #e5e7eb;
    }

    .cancel-btn:hover {
      background: #4b5563;
    }
  }
</style>
