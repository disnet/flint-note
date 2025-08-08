<script lang="ts">
  import { EditorView, minimalSetup } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import { wikilinksExtension } from '../lib/wikilinks.svelte.js';
  import { listFormattingExtension } from '../lib/listFormatting.svelte.js';
  import { dropCursor, keymap } from '@codemirror/view';
  import { indentOnInput } from '@codemirror/language';
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab
  } from '@codemirror/commands';
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

  // Create theme extension for editor styling
  const editorTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontFamily: "'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace",
      fontSize: '0.875rem',
      lineHeight: '1.6',
      width: '100%'
    },
    '.cm-scroller': {
      width: '100%',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
      paddingBottom: '50vh'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-content': {
      margin: '0 auto !important',
      maxWidth: '75ch'
    },
    '.cm-line': {
      padding: '0 !important',
      width: '75ch'
    },
    '.cm-scroller::-webkit-scrollbar': {
      width: '12px'
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      background: 'transparent',
      borderRadius: '6px'
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'rgba(0, 0, 0, 0.2)',
      borderRadius: '6px',
      border: '2px solid transparent',
      backgroundClip: 'padding-box',
      transition: 'all 0.2s ease'
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: 'rgba(0, 0, 0, 0.3)',
      backgroundClip: 'padding-box'
    },
    '.cm-scroller::-webkit-scrollbar-corner': {
      background: 'transparent'
    }
  });

  // Dark mode theme extension
  const darkEditorTheme = EditorView.theme({
    '.cm-scroller': {
      scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent'
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'rgba(255, 255, 255, 0.2)'
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: 'rgba(255, 255, 255, 0.3)'
    }
  });

  import { onMount, onDestroy } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import type { Note } from '@flint-note/server';
  import { getChatService } from '../services/chatService.js';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
    position: 'sidebar' | 'overlay' | 'fullscreen' | 'nested';
  }

  let { note, onClose, position }: Props = $props();

  let editorContainer: Element;
  let editorView: EditorView | null = null;
  let noteContent = $state('');
  let hasChanges = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let saveTimeout: number | null = null;
  let titleValue = $state('');

  let noteData = $state<Note | null>(null);

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
    // Update title when note changes
    titleValue = note.title;
  });

  async function loadNote(note: NoteMetadata): Promise<void> {
    try {
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        const result = await noteService.getNote({ identifier: note.id });
        noteData = result;
        noteContent = result?.content ?? '';
        updateEditorContent();
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Error loading note:', err);
    }
  }

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  function updateEditorTheme(): void {
    if (!editorView) return;

    // Create a new complete extension configuration with the appropriate theme
    const newTheme = isDarkMode ? githubDark : githubLight;

    const extensions = [
      // Core editor extensions
      minimalSetup,
      dropCursor(),
      indentOnInput(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      highlightSelectionMatches(),
      markdown(),
      EditorView.lineWrapping,
      // Apply the appropriate theme
      newTheme,
      // Apply editor styling theme
      editorTheme,
      ...(isDarkMode ? [darkEditorTheme] : []),
      wikilinksExtension(handleWikilinkClick),
      listFormattingExtension(),
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          hasChanges = true;
          noteContent = update.state.doc.toString();
          debouncedSave();
        }
      })
    ];

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(extensions)
    });
  }

  function createEditor(): void {
    if (!editorContainer || editorView) return;

    // Initialize dark mode state
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    isDarkMode = mediaQuery.matches;

    // Listen for theme changes
    mediaQuery.addEventListener('change', handleThemeChange);

    const startState = EditorState.create({
      doc: '',
      extensions: [
        // Use minimalSetup and add desired features manually (excluding bracket matching)
        minimalSetup,
        // lineNumbers(),
        dropCursor(),
        indentOnInput(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        highlightSelectionMatches(),
        markdown(),
        EditorView.lineWrapping,
        ...(isDarkMode ? [githubDark] : [githubLight]),
        // Apply editor styling theme
        editorTheme,
        ...(isDarkMode ? [darkEditorTheme] : []),
        wikilinksExtension(handleWikilinkClick),
        listFormattingExtension(),
        EditorView.contentAttributes.of({ spellcheck: 'true' }),
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

  // Cleanup function
  onDestroy(() => {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
  });

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

      await noteService.updateNote({ identifier: note.id, content: noteContent });
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

  async function handleTitleChange(): Promise<void> {
    const trimmedTitle = titleValue.trim();

    if (!trimmedTitle || trimmedTitle === note.title) {
      return;
    }

    try {
      error = null;
      isSaving = true;
      const noteService = getChatService();

      const result = await noteService.renameNote({
        identifier: note.id,
        newIdentifier: trimmedTitle
      });

      if (result.success) {
        // Update the local note reference
        note = {
          ...note,
          title: trimmedTitle
        };

        // Refresh the notes store to update UI components
        try {
          await notesStore.refresh();
        } catch (refreshError) {
          console.warn('Failed to refresh notes store after rename:', refreshError);
        }
      } else {
        throw new Error('Rename operation failed');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to rename note';
      console.error('Error renaming note:', err);
      // Reset title value on error
      titleValue = note.title;
    } finally {
      isSaving = false;
    }
  }

  function handleTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleTitleChange();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      titleValue = note.title; // Reset to original title
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleWikilinkClick(noteId: string, _title: string): void {
    // Find the note in the notes store
    const clickedNote = notesStore.notes.find((n) => n.id === noteId);
    if (clickedNote) {
      // Close current editor and open the linked note
      onClose();
      // We need to communicate this back to the parent component
      // For now, we'll dispatch a custom event
      const event = new CustomEvent('wikilink-navigate', {
        detail: { note: clickedNote },
        bubbles: true
      });
      document.dispatchEvent(event);
    }
  }

  // Export focus function to be called from parent components
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }
</script>

<div
  class="note-editor"
  class:sidebar={position === 'sidebar'}
  class:overlay={position === 'overlay'}
  class:fullscreen={position === 'fullscreen'}
  class:nested={position === 'nested'}
  role="dialog"
  aria-labelledby="note-editor-title"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  <div class="editor-header">
    <div class="editor-title-section">
      <input
        bind:value={titleValue}
        class="editor-title-input"
        type="text"
        onkeydown={handleTitleKeydown}
        onblur={handleTitleChange}
        placeholder="Enter note title..."
      />
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
    gap: 0.75rem;
  }

  .note-editor.sidebar {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .note-editor.nested {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
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
    justify-content: center;
    padding-top: 1rem;
    /*padding-bottom: 0.4rem;*/
    padding-left: 0;
    /*border-bottom: 1px solid var(--border-light);*/
    background: var(--bg-primary);
    width: 100%;
  }

  .editor-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border-light);
    flex: 1;
    max-width: 75ch;
  }

  .editor-title-input {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    color: var(--text-primary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding: 0;
    outline: none;
    width: 100%;
    min-width: 200px;
  }

  .editor-title-input:focus {
    border-color: transparent;
    background: transparent;
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
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 100;
      border: 1px solid var(--border-light);
      border-radius: 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
  }
</style>
