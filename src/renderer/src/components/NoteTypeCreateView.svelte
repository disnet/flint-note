<script lang="ts">
  import { getChatService } from '../services/chatService';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    onClose: () => void;
    onCreated?: () => void;
  }

  let { onClose, onCreated }: Props = $props();

  let typeName = $state('');
  let description = $state('');
  let icon = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);

  // Focus input on mount
  $effect(() => {
    if (inputRef) {
      inputRef.focus();
    }
  });

  async function handleSubmit(): Promise<void> {
    // Validate
    if (!typeName.trim()) {
      error = 'Type name is required';
      return;
    }

    // Sanitize type name (lowercase, replace spaces with hyphens)
    const sanitizedName = typeName.trim().toLowerCase().replace(/\s+/g, '-');

    try {
      loading = true;
      error = null;

      const noteService = getChatService();
      if (await noteService.isReady()) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          error = 'No vault selected';
          return;
        }

        await noteService.createNoteType({
          typeName: sanitizedName,
          description: description.trim() || '',
          icon: icon || undefined,
          vaultId: currentVault.id
        });

        // Success! Wait for refresh to complete before closing
        await onCreated?.();
        onClose();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create note type';
      console.error('Error creating note type:', err);
    } finally {
      loading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !loading) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  onclick={onClose}
  onkeydown={handleKeyDown}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={handleKeyDown}>
    <div class="modal-header">
      <h2 id="modal-title" class="modal-title">New Note Type</h2>
      <button
        class="close-btn"
        type="button"
        onclick={onClose}
        disabled={loading}
        aria-label="Close"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    {#if error}
      <div class="error-banner">
        <p>{error}</p>
      </div>
    {/if}

    <form
      class="form"
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div class="form-group">
        <label for="type-name" class="label">Name</label>
        <input
          bind:this={inputRef}
          id="type-name"
          type="text"
          class="input"
          bind:value={typeName}
          placeholder="e.g., meeting-notes"
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label for="description" class="label">Purpose</label>
        <textarea
          id="description"
          class="textarea"
          bind:value={description}
          placeholder="What is this note type for?"
          disabled={loading}
          rows="2"
        ></textarea>
      </div>

      <div class="form-group">
        <div class="label">Icon</div>
        <EmojiPicker bind:value={icon} onselect={(emoji) => (icon = emoji)} />
      </div>

      <div class="actions">
        <button type="button" class="cancel-btn" onclick={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" class="create-btn" disabled={loading || !typeName.trim()}>
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal {
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    width: 90%;
    max-width: 360px;
    animation: slideUp 0.15s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .close-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
  }

  .error-banner p {
    margin: 0;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .input,
  .textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.15s ease;
  }

  .input:focus,
  .textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .input:disabled,
  .textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .textarea {
    resize: vertical;
    min-height: 60px;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-light);
  }

  .create-btn,
  .cancel-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .create-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background: transparent;
    color: var(--text-secondary);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
