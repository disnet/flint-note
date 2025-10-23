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
  let inputElement: HTMLInputElement | null = null;

  // Track if user is actively editing to prevent external updates during editing
  let isEditing = $state(false);

  // Initialize the input value when the element is bound
  $effect(() => {
    if (inputElement && inputElement.value === '') {
      inputElement.value = value;
    }
  });

  $effect(() => {
    // Only sync external changes when NOT actively editing
    if (!isEditing && value !== titleValue) {
      titleValue = value;
      // Manually update the input DOM to avoid re-render flash
      if (inputElement && document.activeElement !== inputElement) {
        inputElement.value = value;
      }
    }
  });

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

<input
  bind:this={inputElement}
  oninput={(e) => {
    titleValue = (e.target as HTMLInputElement).value;
  }}
  class="note-title-input"
  class:processing={isProcessing}
  class:empty={!titleValue || titleValue.trim().length === 0}
  type="text"
  onkeydown={handleKeydown}
  onfocus={handleFocus}
  onblur={handleBlur}
  {placeholder}
  {disabled}
/>

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
