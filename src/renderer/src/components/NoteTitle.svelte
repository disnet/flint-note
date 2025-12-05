<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    value: string;
    onSave: (newTitle: string) => Promise<void>;
    onCancel?: () => void;
    onTabToContent?: () => void;
    placeholder?: string;
    disabled?: boolean;
    /** Read-only mode: prevents editing without greying out */
    readOnly?: boolean;
  }

  let {
    value,
    onSave,
    onCancel,
    onTabToContent,
    placeholder = 'Untitled',
    disabled = false,
    readOnly = false
  }: Props = $props();

  let titleValue = $state(value);
  let isProcessing = $state(false);
  let inputElement: HTMLTextAreaElement | null = null;

  // Track if user is actively editing to prevent external updates during editing
  let isEditing = $state(false);

  $effect(() => {
    // Only sync external changes when NOT actively editing or processing
    if (!isEditing && !isProcessing && value !== titleValue) {
      titleValue = value;
      // Adjust height after DOM updates with new value
      tick().then(() => {
        if (inputElement) {
          adjustHeight();
        }
      });
    }
  });

  // Adjust height on mount and watch for resize/reflow
  $effect(() => {
    if (!inputElement) return;

    adjustHeight();

    // Watch for container resize (e.g., window resize causing reflow)
    const resizeObserver = new ResizeObserver(() => {
      adjustHeight();
    });
    resizeObserver.observe(inputElement);

    return () => {
      resizeObserver.disconnect();
    };
  });

  function adjustHeight(): void {
    if (!inputElement) return;
    // Reset height to auto to get the correct scrollHeight
    inputElement.style.height = 'auto';
    // Set height to scrollHeight to fit content
    inputElement.style.height = inputElement.scrollHeight + 'px';
  }

  async function handleSave(): Promise<void> {
    const trimmedTitle = titleValue.trim();

    // Allow saving empty titles, but skip if unchanged or processing
    if (trimmedTitle === value || disabled || isProcessing) {
      isEditing = false;
      return;
    }

    try {
      isProcessing = true;
      await onSave(trimmedTitle);
      // Sync titleValue with the saved value to prevent flash when reactive update comes back
      titleValue = trimmedTitle;
    } catch (error) {
      titleValue = value;
      throw error;
    } finally {
      isProcessing = false;
      isEditing = false;
    }
  }

  function handleCancel(): void {
    titleValue = value;
    isEditing = false;
    onCancel?.();
  }

  function handleFocus(): void {
    isEditing = true;
  }

  function handleBlur(): void {
    handleSave();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (disabled || isProcessing) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      onTabToContent?.();
    }
  }

  export function focus(): void {
    if (inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  }
</script>

<textarea
  bind:this={inputElement}
  bind:value={titleValue}
  oninput={() => {
    adjustHeight();
  }}
  class="note-title-input"
  class:processing={isProcessing}
  class:empty={!titleValue || titleValue.trim().length === 0}
  class:readonly={readOnly}
  onkeydown={handleKeydown}
  onfocus={handleFocus}
  onblur={handleBlur}
  {placeholder}
  {disabled}
  readonly={readOnly}
  rows="1"
></textarea>

<style>
  .note-title-input {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    font-family:
      'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    color: var(--text-primary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding: 0.1em 0;
    outline: none;
    width: 100%;
    min-width: 200px;
    resize: none;
    overflow: hidden;
    overflow-wrap: break-word;
    word-wrap: break-word;
    line-height: 1.4;
    min-height: 1.4em;
  }

  .note-title-input::placeholder {
    color: var(--text-placeholder);
    opacity: 0.5;
  }

  .note-title-input:focus {
    border-color: transparent;
    background: transparent;
  }

  .note-title-input:disabled,
  .note-title-input.processing {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note-title-input.readonly {
    cursor: default;
  }
</style>
