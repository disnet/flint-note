<script lang="ts">
  import type { NoteReference } from '../types/chat';
  import { noteEditorStore } from '../stores/noteEditor.svelte';

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
  let layoutMode = $state<'overlay' | 'sidebar' | 'fullscreen'>('overlay');

  // Auto-save delay in milliseconds
  const AUTOSAVE_DELAY = 1000;

  // Determine layout mode based on screen size
  const updateLayoutMode = () => {
    if (window.innerWidth < 768) {
      layoutMode = 'fullscreen';
    } else if (window.innerWidth < 1200) {
      layoutMode = 'overlay';
    } else {
      layoutMode = 'sidebar';
    }
  };

  // Update layout mode on window resize
  $effect(() => {
    updateLayoutMode();
    const handleResize = () => updateLayoutMode();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

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
      console.log('Loading note:', note);
      const response = await window.api.mcp.callTool({
        name: 'get_note',
        arguments: {
          title: note.title
        }
      });

      console.log('Note load response:', response);

      if (response.success && response.result) {
        // Handle different possible response formats
        if (typeof response.result === 'string') {
          noteContent = response.result;
        } else if (response.result.content) {
          noteContent = response.result.content;
        } else if (response.result.text) {
          noteContent = response.result.text;
        } else {
          console.log('Unexpected response format:', response.result);
          noteContent = JSON.stringify(response.result, null, 2);
        }
      } else {
        console.error('Failed to load note:', response);
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
      console.log('Saving note:', note.title, 'Content length:', noteContent.length);
      const response = await window.api.mcp.callTool({
        name: 'update_note',
        arguments: {
          title: note.title,
          content: noteContent
        }
      });

      console.log('Note save response:', response);

      if (!response.success) {
        console.error('Failed to save note:', response);
        error = response.error || 'Failed to save note';
      } else {
        console.log('Note saved successfully');
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

  const getNoteIcon = (type?: string): string => {
    switch (type) {
      case 'daily':
        return '📅';
      case 'project':
        return '📋';
      case 'meeting':
        return '🤝';
      case 'idea':
        return '💡';
      case 'reference':
        return '🔗';
      default:
        return '📄';
    }
  };

  const getNoteTypeColor = (type?: string): string => {
    switch (type) {
      case 'daily':
        return '#28a745';
      case 'project':
        return '#007bff';
      case 'meeting':
        return '#fd7e14';
      case 'idea':
        return '#6f42c1';
      case 'reference':
        return '#6c757d';
      default:
        return '#007bff';
    }
  };
</script>

{#if note}
  <div
    class="note-editor-container"
    class:overlay={layoutMode === 'overlay'}
    class:sidebar={layoutMode === 'sidebar'}
    class:fullscreen={layoutMode === 'fullscreen'}
  >
    {#if layoutMode === 'overlay'}
      <div class="note-editor-backdrop" onclick={handleClose}></div>
    {/if}

    <div class="note-editor" onclick={(e) => e.stopPropagation()}>
      <div class="note-editor-header">
        <div class="note-info">
          <div class="note-icon" style="color: {getNoteTypeColor(note.type)}">
            {getNoteIcon(note.type)}
          </div>
          <div class="note-title-section">
            <h3 class="note-title">{note.title}</h3>
            {#if note.type}
              <span
                class="note-type-badge"
                style="background-color: {getNoteTypeColor(note.type)}">{note.type}</span
              >
            {/if}
          </div>
        </div>

        <div class="note-actions">
          <div class="save-status">
            {#if isLoading}
              <span class="status loading">
                <div class="loading-spinner"></div>
                Loading...
              </span>
            {:else if isSaving}
              <span class="status saving">
                <div class="saving-indicator"></div>
                Saving...
              </span>
            {:else if error}
              <span class="status error" title={error}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Error
              </span>
            {:else}
              <span class="status saved">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                Saved
              </span>
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
            <div class="loading-spinner large"></div>
            <p>Loading note content...</p>
          </div>
        {:else}
          <div class="editor-wrapper">
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
          </div>
        {/if}
      </div>

      <div class="note-editor-footer">
        <div class="editor-hints">
          <span class="hint">
            <kbd>Ctrl</kbd> + <kbd>S</kbd> to save • <kbd>Esc</kbd> to close
          </span>
        </div>
        <div class="note-metadata">
          {#if note.path}
            <span class="note-path">{note.path}</span>
          {/if}
          <span class="word-count">
            {noteContent.trim()
              ? noteContent.split(/\s+/).filter((word) => word.length > 0).length
              : 0} words
          </span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .note-editor-container {
    position: fixed;
    z-index: 1000;
  }

  .note-editor-container.overlay {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .note-editor-container.sidebar {
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    border-left: 1px solid #e9ecef;
    background: white;
    box-shadow: -4px 0 8px rgba(0, 0, 0, 0.1);
  }

  .note-editor-container.fullscreen {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: white;
  }

  .note-editor-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .note-editor {
    position: relative;
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .overlay .note-editor {
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
  }

  .sidebar .note-editor,
  .fullscreen .note-editor {
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  .note-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e9ecef;
    background-color: #f8f9fa;
    flex-shrink: 0;
  }

  .note-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .note-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .note-title-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .note-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-type-badge {
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    align-self: flex-start;
  }

  .note-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
  }

  .save-status .status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
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

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid #e9ecef;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-spinner.large {
    width: 2rem;
    height: 2rem;
  }

  .saving-indicator {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-left: 2px solid currentColor;
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

  .editor-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .note-textarea {
    flex: 1;
    border: none;
    outline: none;
    padding: 1.5rem;
    font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', 'Ubuntu Mono', monospace;
    font-size: 0.95rem;
    line-height: 1.6;
    resize: none;
    background-color: #fff;
    color: #333;
    overflow-y: auto;
  }

  .note-textarea::placeholder {
    color: #adb5bd;
  }

  .note-textarea:focus {
    outline: none;
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
    flex-shrink: 0;
  }

  .editor-hints .hint {
    font-style: italic;
  }

  .hint kbd {
    background-color: #e9ecef;
    border: 1px solid #adb5bd;
    border-radius: 0.25rem;
    padding: 0.125rem 0.25rem;
    font-size: 0.7rem;
    font-family: inherit;
    color: #495057;
  }

  .note-metadata {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .note-path {
    font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', 'Ubuntu Mono', monospace;
    font-size: 0.7rem;
    color: #adb5bd;
  }

  .word-count {
    font-size: 0.7rem;
    color: #6c757d;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .note-editor-container.sidebar {
      border-left-color: #555;
      background: #2b2b2b;
    }

    .note-editor-container.fullscreen {
      background: #2b2b2b;
    }

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

    .hint kbd {
      background-color: #495057;
      border-color: #6c757d;
      color: #f0f0f0;
    }
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .note-editor-header {
      padding: 0.75rem 1rem;
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
      padding: 0.5rem 1rem;
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .note-metadata {
      gap: 0.5rem;
    }
  }

  @media (max-width: 480px) {
    .note-editor-header {
      padding: 0.5rem;
    }

    .note-actions {
      gap: 0.5rem;
    }

    .save-status .status {
      font-size: 0.8rem;
    }

    .note-textarea {
      padding: 0.75rem;
    }
  }
</style>
