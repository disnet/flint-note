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

  $effect(() => {
    if (titleValue !== value) {
      titleValue = value;
    }
  });

  async function handleSave(): Promise<void> {
    const trimmedTitle = titleValue.trim();

    // Allow saving empty titles, but skip if unchanged or processing
    if (trimmedTitle === value || disabled || isProcessing) {
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
    }
  }

  function handleCancel(): void {
    titleValue = value;
    onCancel?.();
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
    const input = document.querySelector('.note-title-input') as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  }
</script>

<input
  bind:value={titleValue}
  class="note-title-input"
  class:processing={isProcessing}
  class:empty={!titleValue || titleValue.trim().length === 0}
  type="text"
  onkeydown={handleKeydown}
  onblur={handleSave}
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
