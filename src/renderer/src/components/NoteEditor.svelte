<script lang="ts">
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';

  import { onMount } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore';
  import type { Note, NoteTypeListItem } from '@flint-note/server';
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
  let saveTimeout: number | null = null;

  let noteData = $state<Note | null>(null);
  let noteTypes = $state<NoteTypeListItem[]>([]);
  let currentNoteType = $state<string>('');

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
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  });

  $effect(() => {
    if (editorContainer && !editorView) {
      createEditor();
    }
  });

  $effect(() => {
    loadNote(note);
  });

  $effect(() => {
    loadNoteTypes();
  });

  async function loadNote(note: NoteMetadata): Promise<void> {
    try {
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        const result = await noteService.getNote(note.id);
        noteData = result;
        noteContent = result.content;
        currentNoteType = result.type || '';
        updateEditorContent();
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Error loading note:', err);
    }
  }

  async function loadNoteTypes(): Promise<void> {
    try {
      const noteService = getChatService();
      if (await noteService.isReady()) {
        noteTypes = await noteService.listNoteTypes();
      }
    } catch (err) {
      console.error('Error loading note types:', err);
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
            debouncedSave();
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
    if (isSaving || !noteData) return;

    try {
      isSaving = true;
      error = null;
      const noteService = getChatService();

      await noteService.updateNote(note.id, noteContent);
      hasChanges = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note';
      console.error('Error saving note:', err);
    } finally {
      isSaving = false;
    }
  }

  function debouncedSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = window.setTimeout(() => {
      if (hasChanges) {
        saveNote();
      }
    }, 500); // 500ms delay
  }

  function togglePin(): void {
    pinnedNotesStore.togglePin(note.id, note.title, note.filename);
  }

  function updateNoteTypeInContent(content: string, newType: string): string {
    // Check if content has frontmatter
    if (content.startsWith('---')) {
      const frontmatterEndIndex = content.indexOf('---', 3);
      if (frontmatterEndIndex !== -1) {
        const frontmatter = content.substring(3, frontmatterEndIndex);
        const body = content.substring(frontmatterEndIndex + 3);

        // Update or add the type field in frontmatter
        const lines = frontmatter.split('\n');
        let typeUpdated = false;

        const updatedLines = lines.map((line) => {
          if (line.startsWith('type:')) {
            typeUpdated = true;
            return `type: ${newType}`;
          }
          return line;
        });

        // If type field wasn't found, add it
        if (!typeUpdated) {
          updatedLines.push(`type: ${newType}`);
        }

        return `---${updatedLines.join('\n')}---${body}`;
      }
    }

    // If no frontmatter exists, create it
    return `---
type: ${newType}
---
${content}`;
  }

  async function changeNoteType(): Promise<void> {
    if (!noteData || !currentNoteType) return;

    try {
      error = null;
      isSaving = true;
      const noteService = getChatService();

      console.log(`Changing note type to: ${currentNoteType}`);

      // Update the note's content with the new type in frontmatter
      const updatedContent = updateNoteTypeInContent(noteContent, currentNoteType);

      // Update the note via the API
      await noteService.updateNote(note.id, updatedContent);

      // Update local state
      noteContent = updatedContent;
      noteData = { ...noteData, type: currentNoteType };
      updateEditorContent();

      console.log(`Successfully changed note type to: ${currentNoteType}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to change note type';
      console.error('Error changing note type:', err);
      // Revert the UI state on error
      currentNoteType = noteData?.type || '';
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
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
    <div class="editor-title-section">
      <h3 id="note-editor-title" class="editor-title">
        {note.title}
      </h3>
      {#if noteTypes.length > 0}
        <select
          class="note-type-selector"
          class:saving={isSaving}
          bind:value={currentNoteType}
          onchange={() => changeNoteType()}
          disabled={isSaving}
          aria-label="Note type"
        >
          {#each noteTypes as noteType, index (noteType.name || `unknown-${index}`)}
            <option value={noteType.name || ''}>
              {noteType.name || 'Unknown Type'}
            </option>
          {/each}
        </select>
      {/if}
    </div>
    <div class="editor-actions">
      {#if isSaving}
        <span class="saving-indicator" title="Saving...">💾</span>
      {/if}
      <button
        class="pin-btn"
        class:pinned={isPinned}
        onclick={togglePin}
        aria-label={isPinned ? 'Unpin note' : 'Pin note'}
        title={isPinned ? 'Unpin note' : 'Pin note'}
      >
        📌
      </button>
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

  .editor-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
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

  .note-type-selector {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 100px;
  }

  .note-type-selector:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .note-type-selector:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-primary-alpha);
  }

  .note-type-selector:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--bg-secondary);
  }

  .note-type-selector.saving {
    background: var(--accent-secondary-alpha);
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .saving-indicator {
    font-size: 1rem;
    opacity: 0.7;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
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
  @media (max-width: 768px) {
    .editor-title-section {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .note-type-selector {
      align-self: stretch;
      min-width: auto;
    }
  }

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
