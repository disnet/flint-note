<script lang="ts">
  import { getChatService } from '../services/chatService';
  import { noteNavigationService } from '../services/noteNavigationService';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let content = $state('');
  let title = $state('');
  let noteType = $state('note');
  let isCreating = $state(false);
  let contentTextarea: HTMLTextAreaElement;

  const noteTypes = ['note', 'task', 'event', 'daily', 'meeting'];

  // Auto-focus content field when modal opens
  $effect(() => {
    if (isOpen && contentTextarea) {
      setTimeout(() => contentTextarea?.focus(), 50);
    }
  });

  // Reset form when modal closes
  $effect(() => {
    if (!isOpen) {
      content = '';
      title = '';
      noteType = 'note';
      isCreating = false;
    }
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  }

  async function handleCreate() {
    if (isCreating || !content.trim()) return;

    try {
      isCreating = true;
      const chatService = getChatService();
      const vault = await chatService.getCurrentVault();

      if (!vault) {
        console.error('No vault available');
        return;
      }

      // Create the note
      // Empty title lets the server autogenerate it from content
      const note = await chatService.createNote({
        type: noteType,
        identifier: title.trim() || '',
        content: content.trim(),
        vaultId: vault.id
      });

      // Open the note to stay in context
      noteNavigationService.openNote(note.id);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      isCreating = false;
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">Quick Entry</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <!-- Content field - primary focus -->
        <div class="form-group content-group">
          <label for="note-content">Content</label>
          <textarea
            id="note-content"
            bind:this={contentTextarea}
            bind:value={content}
            placeholder="Start typing your note..."
            rows="10"
          ></textarea>
        </div>

        <!-- Title field with autogenerate hint -->
        <div class="form-group">
          <label for="note-title">Title</label>
          <input
            id="note-title"
            type="text"
            bind:value={title}
            placeholder="Leave empty to auto-generate from content"
          />
        </div>

        <!-- Type switcher -->
        <div class="form-group">
          <label for="note-type">Type</label>
          <select id="note-type" bind:value={noteType}>
            {#each noteTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
        <button
          class="btn btn-primary"
          onclick={handleCreate}
          disabled={!content.trim() || isCreating}
        >
          {isCreating ? 'Creating...' : 'Create Note'}
        </button>
      </div>

      <div class="modal-hint">
        <kbd>Ctrl/Cmd</kbd> + <kbd>Enter</kbd> to create • <kbd>Esc</kbd> to cancel
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background: var(--bg-primary, #1e1e1e);
    border: 1px solid var(--border-color, #3e3e3e);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-color, #3e3e3e);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #e0e0e0);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    color: var(--text-secondary, #a0a0a0);
    cursor: pointer;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--bg-hover, #2a2a2a);
    color: var(--text-primary, #e0e0e0);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .content-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #e0e0e0);
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: var(--bg-secondary, #2a2a2a);
    border: 1px solid var(--border-color, #3e3e3e);
    border-radius: 6px;
    color: var(--text-primary, #e0e0e0);
    font-size: 0.9375rem;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  textarea {
    resize: vertical;
    min-height: 200px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
    line-height: 1.6;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-color, #007acc);
    box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--text-tertiary, #666);
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--border-color, #3e3e3e);
  }

  .modal-hint {
    padding: 0.75rem 1.5rem;
    background: var(--bg-secondary, #2a2a2a);
    border-top: 1px solid var(--border-color, #3e3e3e);
    font-size: 0.75rem;
    color: var(--text-tertiary, #888);
    text-align: center;
  }

  kbd {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--bg-primary, #1e1e1e);
    border: 1px solid var(--border-color, #3e3e3e);
    border-radius: 3px;
    font-family: inherit;
    font-size: 0.75rem;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-secondary, #2a2a2a);
    color: var(--text-primary, #e0e0e0);
    border: 1px solid var(--border-color, #3e3e3e);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover, #333);
  }

  .btn-primary {
    background: var(--accent-color, #007acc);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-color-hover, #005a9e);
  }
</style>
