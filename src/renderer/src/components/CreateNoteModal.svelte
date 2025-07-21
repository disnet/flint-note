<script lang="ts">
  import { getChatService } from '../services/chatService';
  import { notesStore } from '../services/noteStore';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onNoteCreated?: (noteId: string) => void;
  }

  let { isOpen, onClose, onNoteCreated }: Props = $props();

  let noteType = $state('general');
  let noteTitle = $state('');
  let noteContent = $state('');
  let noteTypes = $state<string[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let titleError = $state<string | null>(null);

  // Load note types when modal opens
  $effect(() => {
    if (isOpen && noteTypes.length === 0) {
      loadNoteTypes();
    }
  });

  // Focus title input when modal opens
  $effect(() => {
    if (isOpen) {
      setTimeout(() => {
        const titleInput = document.querySelector(
          '.note-title-input'
        ) as HTMLInputElement;
        titleInput?.focus();
      }, 100);
    }
  });

  // Reset form when modal closes
  $effect(() => {
    if (!isOpen) {
      resetForm();
    }
  });

  async function loadNoteTypes(): Promise<void> {
    try {
      const chatService = getChatService();
      const noteTypeInfos = await chatService.listNoteTypes();

      // Extract just the type names from NoteTypeListItem objects
      noteTypes = noteTypeInfos.map((typeInfo) =>
        typeof typeInfo === 'string' ? typeInfo : typeInfo.name
      );

      if (noteTypes.length > 0) {
        noteType = noteTypes[0];
      }
    } catch (err) {
      console.error('Failed to load note types:', err);
      noteTypes = ['general']; // fallback
      noteType = 'general';
    }
  }

  function resetForm(): void {
    noteTitle = '';
    noteContent = '';
    noteType = 'general';
    error = null;
    titleError = null;
    isLoading = false;
  }

  function validateTitle(title: string): string | null {
    if (!title.trim()) {
      return 'Note title is required';
    }
    if (title.length < 2) {
      return 'Title must be at least 2 characters';
    }
    if (title.length > 100) {
      return 'Title must be less than 100 characters';
    }
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(title)) {
      return 'Title can only contain letters, numbers, spaces, hyphens, underscores, and periods';
    }
    return null;
  }

  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    noteTitle = target.value;
    titleError = validateTitle(noteTitle);
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const validation = validateTitle(noteTitle);
    if (validation) {
      titleError = validation;
      return;
    }

    isLoading = true;
    error = null;

    try {
      const identifier = noteTitle.trim().toLowerCase().replace(/\s+/g, '-');
      const content = noteContent.trim() || `# ${noteTitle}\n\n`;

      const chatService = getChatService();
      const noteInfo = await chatService.createNote(noteType, identifier, content);

      // Refresh notes store to show new note
      await notesStore.refresh();

      // Notify parent component
      onNoteCreated?.(noteInfo.id);

      // Close modal
      onClose();
    } catch (err) {
      console.error('Failed to create note:', err);

      // Provide more specific error messages
      let errorMessage = 'Failed to create note';
      if (err instanceof Error) {
        if (err.message.includes('cloned')) {
          errorMessage =
            'Note creation failed due to data serialization issue. Please try with simpler content.';
        } else if (err.message.includes('vault')) {
          errorMessage = 'No active vault found. Please select a vault first.';
        } else if (err.message.includes('identifier')) {
          errorMessage =
            'Invalid note title. Please use only letters, numbers, and basic punctuation.';
        } else {
          errorMessage = err.message;
        }
      }

      error = errorMessage;
    } finally {
      isLoading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleModalClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={handleModalClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modal-title">✨ Create New Note</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close modal"> ✕ </button>
      </div>

      <form class="note-form" onsubmit={handleSubmit}>
        <div class="form-row">
          <div class="form-group">
            <label for="note-type">Type:</label>
            <select id="note-type" bind:value={noteType} class="note-type-select">
              {#each noteTypes as type (type)}
                <option value={type}>📝 {type}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="note-title">Title:</label>
          <input
            id="note-title"
            type="text"
            class="note-title-input"
            class:error={titleError}
            value={noteTitle}
            oninput={handleTitleInput}
            placeholder="Enter note title..."
            maxlength="100"
            required
          />
          {#if titleError}
            <div class="error-text">{titleError}</div>
          {:else}
            <div
              class="validation-indicator"
              class:valid={noteTitle.trim() && !titleError}
            >
              {noteTitle.trim() && !titleError ? '✓' : ''}
            </div>
          {/if}
        </div>

        <div class="form-group">
          <label for="note-content">Initial Content (optional):</label>
          <textarea
            id="note-content"
            class="note-content-input"
            bind:value={noteContent}
            placeholder="# {noteTitle || 'Note Title'}

Content starts here..."
            rows="6"
          ></textarea>
        </div>

        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        <div class="form-actions">
          <div class="pro-tip">💡 Pro tip: Use Ctrl+Enter to create quickly</div>
          <div class="action-buttons">
            <button type="button" class="cancel-btn" onclick={onClose}> Cancel </button>
            <button
              type="submit"
              class="create-btn"
              disabled={isLoading || !!titleError || !noteTitle.trim()}
            >
              {isLoading ? 'Creating...' : 'Create & Edit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .note-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    position: relative;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .note-type-select,
  .note-title-input,
  .note-content-input {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .note-type-select:focus,
  .note-title-input:focus,
  .note-content-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .note-title-input.error {
    border-color: var(--error-border, #ef4444);
  }

  .note-content-input {
    resize: vertical;
    min-height: 120px;
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
  }

  .validation-indicator {
    position: absolute;
    right: 0.75rem;
    top: 2.25rem;
    color: var(--success-text, #10b981);
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .validation-indicator.valid {
    opacity: 1;
  }

  .error-text {
    font-size: 0.75rem;
    color: var(--error-text, #ef4444);
    margin-top: 0.25rem;
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--error-border, #ef4444);
  }

  .form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.5rem;
    gap: 1rem;
  }

  .pro-tip {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex: 1;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }

  .cancel-btn,
  .create-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-color: var(--border-light);
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .create-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0.5rem;
    }

    .modal-content {
      max-height: 95vh;
    }

    .modal-header,
    .note-form {
      padding: 1rem;
    }

    .form-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .action-buttons {
      width: 100%;
    }

    .cancel-btn,
    .create-btn {
      flex: 1;
    }

    .pro-tip {
      order: 1;
      text-align: center;
    }
  }
</style>
