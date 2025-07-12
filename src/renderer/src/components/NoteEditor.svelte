<script lang="ts">
  import type { NoteReference } from '../types/chat';

  interface Props {
    note: NoteReference | null;
    onClose: () => void;
  }

  let { note, onClose }: Props = $props();

  let noteContent = $state('');
  let isLoading = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let saveTimeout: NodeJS.Timeout | null = null;
  let editorElement: HTMLTextAreaElement;

  // Auto-save delay in milliseconds
  const AUTOSAVE_DELAY = 1000;

  // Load note content when note changes
  $effect(() => {
    if (note) {
      loadNoteContent();
    }
  });

  const loadNoteContent = async () => {
    if (!note) return;

    isLoading = true;
    error = null;

    try {
      const response = await window.api.flintApi.getNote(note.title);

      if (response.success && response.note) {
        // Handle different possible response formats
        if (typeof response.note === 'string') {
          noteContent = response.note;
        } else if (response.note.content) {
          noteContent = response.note.content;
        } else if (response.note.text) {
          noteContent = response.note.text;
        } else {
          noteContent = '';
        }
      } else {
        error = response.error || 'Failed to load note content';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Error loading note:', err);
    } finally {
      isLoading = false;
    }
  };

  const saveNote = async () => {
    if (!note || isSaving) return;

    isSaving = true;
    error = null;

    try {
      const response = await window.api.flintApi.updateNoteContent(
        note.title,
        noteContent
      );

      if (!response.success) {
        error = response.error || 'Failed to save note';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note';
      console.error('Error saving note:', err);
    } finally {
      isSaving = false;
    }
  };

  const handleContentChange = () => {
    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save
    saveTimeout = setTimeout(() => {
      saveNote();
    }, AUTOSAVE_DELAY);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Handle Ctrl+S / Cmd+S for manual save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      saveNote();
    }

    // Handle Escape to close
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleClose = () => {
    // Save before closing if there are unsaved changes
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveNote();
    }
    onClose();
  };

  // Focus editor when note loads
  $effect(() => {
    if (note && editorElement && !isLoading) {
      editorElement.focus();
    }
  });

  // Cleanup timeout on component destroy
  $effect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  });
</script>

{#if note}
  <div class="note-editor-overlay" onclick={handleClose} role="dialog" aria-modal="true">
    <div class="note-editor" onclick={(e) => e.stopPropagation()}>
      <div class="note-editor-header">
        <div class="note-info">
          <h3 class="note-title">{note.title}</h3>
          {#if note.type}
            <span class="note-type-badge">{note.type}</span>
          {/if}
        </div>
        <div class="note-actions">
          <div class="save-status">
            {#if isLoading}
              <span class="status loading">Loading...</span>
            {:else if isSaving}
              <span class="status saving">Saving...</span>
            {:else if error}
              <span class="status error" title={error}>{error}</span>
            {:else}
              <span class="status saved">Saved</span>
            {/if}
          </div>
          <button
            class="close-button"
            onclick={handleClose}
            title="Close (Esc)"
            aria-label="Close note editor"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="note-editor-content">
        {#if isLoading}
          <div class="loading-placeholder">
            <div class="loading-spinner"></div>
            <p>Loading note content...</p>
          </div>
        {:else}
          <textarea
            bind:this={editorElement}
            bind:value={noteContent}
            oninput={handleContentChange}
            onkeydown={handleKeyDown}
            class="note-textarea"
            placeholder="Start writing your note..."
            spellcheck="true"
            aria-label="Note content"
          ></textarea>
        {/if}
      </div>

      <div class="note-editor-footer">
        <div class="editor-hints">
          <span class="hint">Ctrl+S to save • Esc to close</span>
        </div>
        <div class="note-metadata">
          {#if note.path}
            <span class="note-path">{note.path}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .note-editor-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .note-editor {
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .note-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e9ecef;
    background-color: #f8f9fa;
  }

  .note-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .note-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
  }

  .note-type-badge {
    background-color: #007bff;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .note-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .save-status .status {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status.loading {
    color: #6c757d;
  }

  .status.saving {
    color: #fd7e14;
  }

  .status.saved {
    color: #28a745;
  }

  .status.error {
    color: #dc3545;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.25rem;
    color: #6c757d;
    transition: all 0.2s;
  }

  .close-button:hover {
    background-color: #e9ecef;
    color: #495057;
  }

  .note-editor-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .loading-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #6c757d;
    gap: 1rem;
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid #e9ecef;
    border-top: 2px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .note-textarea {
    flex: 1;
    border: none;
    outline: none;
    padding: 1.5rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    resize: none;
    background-color: #fff;
    color: #333;
  }

  .note-textarea::placeholder {
    color: #adb5bd;
  }

  .note-editor-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    border-top: 1px solid #e9ecef;
    background-color: #f8f9fa;
    font-size: 0.75rem;
    color: #6c757d;
  }

  .editor-hints .hint {
    font-style: italic;
  }

  .note-path {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.7rem;
    color: #adb5bd;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .note-editor {
      background: #2b2b2b;
      color: #f0f0f0;
    }

    .note-editor-header,
    .note-editor-footer {
      background-color: #3a3a3a;
      border-color: #555;
    }

    .note-title {
      color: #f0f0f0;
    }

    .note-textarea {
      background-color: #2b2b2b;
      color: #f0f0f0;
    }

    .note-textarea::placeholder {
      color: #6c757d;
    }

    .close-button {
      color: #adb5bd;
    }

    .close-button:hover {
      background-color: #495057;
      color: #f0f0f0;
    }

    .loading-spinner {
      border-color: #555;
      border-top-color: #66b2ff;
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .note-editor-overlay {
      padding: 0;
    }

    .note-editor {
      width: 100%;
      max-width: none;
      height: 100vh;
      max-height: none;
      border-radius: 0;
    }

    .note-editor-header {
      padding: 1rem;
    }

    .note-info {
      gap: 0.5rem;
    }

    .note-title {
      font-size: 1.1rem;
    }

    .note-textarea {
      padding: 1rem;
      font-size: 1rem;
    }

    .note-editor-footer {
      padding: 0.75rem 1rem;
    }
  }

  /* Tablet responsive */
  @media (max-width: 1024px) and (min-width: 769px) {
    .note-editor {
      max-width: 90%;
    }
  }
</style>
