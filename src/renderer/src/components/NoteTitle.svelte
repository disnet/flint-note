<script lang="ts">
  interface Props {
    value: string;
    onSave: (newTitle: string) => Promise<void>;
    onCancel?: () => void;
    placeholder?: string;
    disabled?: boolean;
  }

  let {
    value,
    onSave,
    onCancel,
    placeholder = 'Title...',
    disabled = false
  }: Props = $props();

  let titleValue = $state(value);
  let isProcessing = $state(false);
  let inputElement: HTMLTextAreaElement | null = null;

  // Track if user is actively editing to prevent external updates during editing
  let isEditing = $state(false);

  // Initialize the input value when the element is bound
  $effect(() => {
    if (inputElement && inputElement.value === '') {
      inputElement.value = value;
      adjustHeight();
    }
  });

  $effect(() => {
    // Only sync external changes when NOT actively editing
    if (!isEditing && value !== titleValue) {
      titleValue = value;
      // Manually update the input DOM to avoid re-render flash
      if (inputElement && document.activeElement !== inputElement) {
        inputElement.value = value;
        adjustHeight();
      }
    }
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
  oninput={(e) => {
    titleValue = (e.target as HTMLTextAreaElement).value;
    adjustHeight();
  }}
  class="note-title-input"
  class:processing={isProcessing}
  class:empty={!titleValue || titleValue.trim().length === 0}
  onkeydown={handleKeydown}
  onfocus={handleFocus}
  onblur={handleBlur}
  {placeholder}
  {disabled}
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
    padding: 0;
    outline: none;
    width: 100%;
    min-width: 200px;
    resize: none;
    overflow: hidden;
    line-height: 1.3;
    min-height: 1.95rem;
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
</style>
