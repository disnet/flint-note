<script lang="ts">
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';

  import { onMount } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore';
  import type { ApiNoteResult } from '@flint-note/server';
  import { getChatService } from '../services/chatService.js';
  import { pinnedNotesStore } from '../services/pinnedStore';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
    position: 'sidebar' | 'overlay' | 'fullscreen';
  }

  let { note, onClose, position }: Props = $props();

  let editorContainer: Element;
  let editorView: EditorView | null = null;
  let noteContent = $state('');
  let hasChanges = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  let noteData = $state<ApiNoteResult | null>(null);

  let isPinned = $state(false);

  // Subscribe to pinned notes store to update isPinned reactively
  $effect(() => {
    const unsubscribe = pinnedNotesStore.subscribe(() => {
      isPinned = pinnedNotesStore.isPinned(note.id);
    });

    // Initial check
    isPinned = pinnedNotesStore.isPinned(note.id);

    return unsubscribe;
  });

  onMount(() => {
    return () => {
      if (editorView) {
        editorView.destroy();
      }
    };
  });

  $effect(() => {
    if (editorContainer && !editorView) {
      console.log('Creating editor...');
      createEditor();
    }
  });

  $effect(() => {
    loadNote(note);
  });

  async function loadNote(note: NoteMetadata): Promise<void> {
    try {
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        const result = await noteService.getNote(note.id);
        noteData = result;
        noteContent = result.content;
        updateEditorContent();
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Error loading note:', err);
    }
  }

  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const startState = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        ...(isDarkMode ? [githubDark] : [githubLight]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            hasChanges = true;
            noteContent = update.state.doc.toString();
          }
        })
      ]
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });
  }

  function updateEditorContent(): void {
    if (editorView && noteContent !== undefined) {
      const currentDoc = editorView.state.doc.toString();
      if (currentDoc !== noteContent) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: noteContent
          }
        });
        hasChanges = false;
      }
    }
  }

  async function saveNote(): Promise<void> {
    if (!hasChanges || isSaving || !noteData) return;

    try {
      isSaving = true;
      error = null;
      const noteService = getChatService();

      await noteService.updateNote(note.filename, noteContent);
      hasChanges = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note';
      console.error('Error saving note:', err);
    } finally {
      isSaving = false;
    }
  }

  function togglePin(): void {
    pinnedNotesStore.togglePin(note.id, note.title, note.filename);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveNote();
    }
  }
</script>

<div
  class="note-editor"
  class:sidebar={position === 'sidebar'}
  class:overlay={position === 'overlay'}
  class:fullscreen={position === 'fullscreen'}
  role="dialog"
  aria-labelledby="note-editor-title"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  <div class="editor-header">
    <h3 id="note-editor-title" class="editor-title">
      {note.title}
    </h3>
    <div class="editor-actions">
      <button
        class="pin-btn"
        class:pinned={isPinned}
        onclick={togglePin}
        aria-label={isPinned ? 'Unpin note' : 'Pin note'}
        title={isPinned ? 'Unpin note' : 'Pin note'}
      >
        📌
      </button>
      {#if hasChanges}
        <button
          class="save-btn"
          class:saving={isSaving}
          onclick={saveNote}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      {/if}
      <button class="close-btn" onclick={onClose} aria-label="Close editor"> × </button>
    </div>
  </div>

  {#if error}
    <div class="error-message" role="alert">
      {error}
    </div>
  {/if}

  <div class="editor-content">
    <div class="editor-container" bind:this={editorContainer}></div>
  </div>

  {#if hasChanges}
    <div class="status-bar">
      <span class="unsaved-indicator">• Unsaved changes</span>
      <span class="shortcut-hint">Ctrl+S to save, Esc to close</span>
    </div>
  {/if}
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .note-editor.sidebar {
    position: fixed;
    right: 0;
    top: 0;
    width: 400px;
    height: 100%;
    border-left: 1px solid var(--border-light);
    border-radius: 0;
    z-index: 50;
  }

  .note-editor.overlay {
    position: absolute;
    top: 2rem;
    left: 2rem;
    right: 2rem;
    bottom: 2rem;
    z-index: 100;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
  }

  .note-editor.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 200;
    border: none;
    border-radius: 0;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .editor-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-btn {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .save-btn.saving {
    background: var(--accent-secondary);
  }

  .pin-btn {
    padding: 0.5rem;
    background: none;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .pin-btn:hover {
    opacity: 1;
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .pin-btn.pinned {
    opacity: 1;
    background: var(--accent-primary-alpha);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .close-btn {
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  .error-message {
    padding: 1rem;
    background: var(--error-bg);
    color: var(--error-text);
    border-bottom: 1px solid var(--border-light);
    font-size: 0.875rem;
  }

  .editor-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .editor-container {
    flex: 1;
    overflow: auto;
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    font-size: 0.75rem;
  }

  .unsaved-indicator {
    color: var(--warning-text);
    font-weight: 500;
  }

  .shortcut-hint {
    color: var(--text-secondary);
  }

  /* CodeMirror styling */
  :global(.cm-editor) {
    height: 100%;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  :global(.cm-focused) {
    outline: none;
  }

  :global(.cm-content) {
    padding: 1rem;
  }

  :global(.cm-line) {
    padding: 0.125rem 0;
  }

  /* Custom scrollbar styling */
  :global(.cm-scroller::-webkit-scrollbar) {
    width: 8px;
  }

  :global(.cm-scroller::-webkit-scrollbar-track) {
    background: var(--bg-secondary);
    border-radius: 4px;
  }

  :global(.cm-scroller::-webkit-scrollbar-thumb) {
    background: var(--border-light);
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  :global(.cm-scroller::-webkit-scrollbar-thumb:hover) {
    background: var(--text-secondary);
  }

  /* Firefox scrollbar styling */
  :global(.cm-scroller) {
    scrollbar-width: thin;
    scrollbar-color: var(--border-light) var(--bg-secondary);
  }

  /* Responsive adjustments */
  @media (max-width: 1200px) {
    .note-editor.sidebar {
      width: 100%;
      height: 100%;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 100;
      border-radius: 0;
    }
  }
</style>
