<script lang="ts">
  import { EditorView, minimalSetup } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import { wikilinksExtension, forceWikilinkRefresh } from '../lib/wikilinks.svelte.js';
  import { dropCursor, keymap } from '@codemirror/view';
  import { indentOnInput } from '@codemirror/language';
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab
  } from '@codemirror/commands';
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
  import { markdownListStyling, listStylingTheme } from '../lib/markdownListStyling';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';

  // Create theme extension for editor styling
  const editorTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important",
      fontSize: 'var(--font-editor-size) !important',
      lineHeight: '1.6',
      width: '100%'
    },
    '&.cm-editor': {
      backgroundColor: 'var(--bg-primary)',
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '.cm-scroller': {
      width: '100%',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
      marginBottom: '25vh',
      overflow: 'visible',
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '&.cm-focused': {
      outline: 'none',
      boxShadow: 'none !important'
    },
    '.cm-content': {
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '.cm-tooltip': {
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '.cm-tooltip-autocomplete': {
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '.cm-completionLabel': {
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
    },
    '.cm-line': {
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
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
  import type { Note } from '@/server/core/notes';
  import { getChatService } from '../services/chatService.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte.js';
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte.js';
  import MetadataView from './MetadataView.svelte';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
  }

  let { note, onClose }: Props = $props();

  let editorContainer: Element;
  let editorView: EditorView | null = null;
  let noteContent = $state('');
  let hasChanges = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let saveTimeout: number | null = null;
  let titleValue = $state('');

  let noteData = $state<Note | null>(null);
  let metadataExpanded = $state(false);
  let showPinControl = $state(false);

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

  // Watch for changes in notes store and refresh wikilinks
  $effect(() => {
    // Access the notes store to create a dependency
    const notes = notesStore.notes;
    const loading = notesStore.loading;

    // Only refresh if we have an editor, notes are loaded, and we're not currently loading
    if (editorView && !loading && notes.length >= 0) {
      // Small delay to ensure the store update is complete
      setTimeout(() => {
        if (editorView) {
          forceWikilinkRefresh(editorView);
        }
      }, 50);
    }
  });

  // Watch for wikilink updates and reload note content if needed
  $effect(() => {
    const updateCounter = notesStore.wikilinksUpdateCounter;

    // Skip initial load (when counter is 0)
    if (updateCounter > 0 && note) {
      setTimeout(async () => {
        try {
          await loadNote(note);
        } catch (loadError) {
          console.warn('Failed to reload note content after wikilink update:', loadError);
        }
      }, 100);
    }
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
      ...(isDarkMode ? [darkEditorTheme] : []),
      // Apply editor styling theme AFTER GitHub themes to override font settings
      editorTheme,
      // List styling extensions
      markdownListStyling,
      listStylingTheme,
      wikilinksExtension(handleWikilinkClick),
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

    // Re-measure marker widths when theme changes
    measureAndUpdateMarkerWidths();
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
        ...(isDarkMode ? [darkEditorTheme] : []),
        // Apply editor styling theme AFTER GitHub themes to override font settings
        editorTheme,
        // List styling extensions
        markdownListStyling,
        listStylingTheme,
        wikilinksExtension(handleWikilinkClick),
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

    // Measure marker widths and update CSS custom properties
    measureAndUpdateMarkerWidths();
  }

  // Measure marker widths and update CSS custom properties
  function measureAndUpdateMarkerWidths(): void {
    if (!editorView) return;

    // Small delay to ensure the editor DOM is fully rendered
    setTimeout(() => {
      if (editorView) {
        const widths = measureMarkerWidths(editorView.dom);
        updateCSSCustomProperties(widths);
      }
    }, 10);
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
        const oldId = note.id;
        const newId = result.new_id || note.id; // Use new_id if provided, otherwise keep the same ID

        // Update pinned notes if this note is pinned
        if (pinnedNotesStore.isPinned(oldId)) {
          if (newId !== oldId) {
            // ID changed - update both ID and title
            await pinnedNotesStore.updateNoteIdAndTitle(oldId, newId, trimmedTitle);
          } else {
            // ID same but title changed - update just title
            await pinnedNotesStore.updateNoteTitle(oldId, trimmedTitle);
          }
        }

        // Update temporary tabs that reference this note
        const hasTemporaryTab = temporaryTabsStore.tabs.some(
          (tab) => tab.noteId === oldId
        );
        if (hasTemporaryTab) {
          if (newId !== oldId) {
            // ID changed - update both ID and title
            await temporaryTabsStore.updateNoteIdAndTitle(oldId, newId, trimmedTitle);
          } else {
            // ID same but title changed - update just title
            await temporaryTabsStore.updateNoteTitle(oldId, trimmedTitle);
          }
        }

        // Update the local note reference
        note = {
          ...note,
          id: newId,
          title: trimmedTitle
        };

        // Refresh the notes store to update UI components
        try {
          await notesStore.refresh();
        } catch (refreshError) {
          console.warn('Failed to refresh notes store after rename:', refreshError);
        }

        // If wikilinks were updated in other notes, notify the store so all open notes can reload
        if (result.linksUpdated && result.linksUpdated > 0) {
          notesStore.notifyWikilinksUpdated();
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

  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): Promise<void> {
    // Close current editor before navigating (for existing notes)
    if (!shouldCreate) {
      onClose();
    }

    // Use centralized wikilink service
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate);
  }

  // Export focus function to be called from parent components
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  // Focus editor and place cursor at end
  function focusAtEnd(): void {
    if (editorView) {
      const doc = editorView.state.doc;
      const endPos = doc.length;
      editorView.focus();
      editorView.dispatch({
        selection: { anchor: endPos, head: endPos },
        scrollIntoView: true
      });
    }
  }

  // Handle clicks on the editor content area
  function handleEditorAreaClick(event: MouseEvent): void {
    if (!editorView) return;

    const target = event.target as Element;
    const editorDom = editorView.dom;

    // Simple check: if we clicked outside the CodeMirror editor DOM,
    // focus at the end
    if (!editorDom.contains(target)) {
      focusAtEnd();
      event.preventDefault();
      return;
    }

    // If we clicked inside the editor but CodeMirror didn't handle it
    // (meaning we clicked in empty space), focus at the end after a small delay
    setTimeout(() => {
      if (editorView && !editorView.hasFocus) {
        focusAtEnd();
      }
    }, 10);
  }

  // Handle keyboard events on the editor content area
  function handleEditorAreaKeydown(event: KeyboardEvent): void {
    if (!editorView) return;

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target as Element;
      const editorDom = editorView.dom;
      const scrollerDom = editorDom.querySelector('.cm-scroller');

      // If the keydown is on the editor area but not on actual text content, focus at end
      if (scrollerDom && (target === scrollerDom || target === editorContainer)) {
        focusAtEnd();
        event.preventDefault();
      }
    }
  }

  function toggleMetadata(): void {
    metadataExpanded = !metadataExpanded;
  }

  async function handleMetadataUpdate(metadata: Record<string, unknown>): Promise<void> {
    if (!noteData) return;

    try {
      const noteService = getChatService();
      await noteService.updateNote({
        identifier: note.id,
        content: noteContent,
        metadata: metadata as import('@/server/types').NoteMetadata
      });

      // Refresh the note data to reflect changes
      const result = await noteService.getNote({ identifier: note.id });
      noteData = result;
    } catch (err) {
      console.error('Error updating metadata:', err);
      throw err;
    }
  }

  async function handleTypeChange(newType: string): Promise<void> {
    if (!noteData) return;

    try {
      const noteService = getChatService();
      const oldId = note.id;

      const moveResult = await noteService.moveNote({
        identifier: note.id,
        newType: newType
      });

      if (moveResult.success) {
        const newId = moveResult.new_id;

        // Update pinned notes if this note is pinned
        if (pinnedNotesStore.isPinned(oldId)) {
          await pinnedNotesStore.updateNoteId(oldId, newId);
        }

        // Update temporary tabs that reference this note
        await temporaryTabsStore.updateNoteId(oldId, newId);

        // Update the local note reference with new ID
        note = {
          ...note,
          id: newId,
          type: newType
        };

        // Refresh the note data to reflect the type change
        const result = await noteService.getNote({ identifier: newId });
        noteData = result;

        // Also refresh the notes store to update the sidebar
        await notesStore.refresh();
      } else {
        throw new Error('Move operation failed');
      }
    } catch (err) {
      console.error('Error changing note type:', err);
      throw err;
    }
  }

  async function togglePin(): Promise<void> {
    try {
      await pinnedNotesStore.togglePin(note.id, note.title, note.filename || note.title);
    } catch (error) {
      console.error('Failed to toggle pin status:', error);
    }
  }
</script>

<div
  class="note-editor"
  role="dialog"
  aria-labelledby="note-editor-title"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  <div class="editor-header">
    <div
      class="editor-title-section"
      role="group"
      aria-label="Note title with pin control"
      onmouseenter={() => (showPinControl = true)}
      onmouseleave={() => (showPinControl = false)}
    >
      {#if showPinControl || pinnedNotesStore.isPinned(note.id)}
        <button
          class="pin-control"
          class:pinned={pinnedNotesStore.isPinned(note.id)}
          onclick={togglePin}
          aria-label={pinnedNotesStore.isPinned(note.id) ? 'Unpin note' : 'Pin note'}
          title={pinnedNotesStore.isPinned(note.id) ? 'Unpin note' : 'Pin note'}
        >
          📌
        </button>
      {/if}
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

  <div class="metadata-section-container">
    <MetadataView
      note={noteData}
      expanded={metadataExpanded}
      onToggle={toggleMetadata}
      onMetadataUpdate={handleMetadataUpdate}
      onTypeChange={handleTypeChange}
    />
  </div>

  <div
    class="editor-content"
    role="textbox"
    tabindex="-1"
    onclick={handleEditorAreaClick}
    onkeydown={handleEditorAreaKeydown}
  >
    <div class="editor-container editor-font" bind:this={editorContainer}></div>
  </div>
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 30ch;
    max-width: 75ch;
    width: 100%;
    padding: 0;
  }

  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    /*padding-left: 1rem;*/
    background: var(--bg-primary);
    width: 100%;
  }

  .editor-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    position: relative;
    min-height: 2rem;
  }

  .editor-title-section::before {
    content: '';
    position: absolute;
    left: -3rem;
    top: 0;
    bottom: 0;
    width: 3rem;
    z-index: 1;
  }

  .pin-control {
    position: absolute;
    left: -2rem;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(0, 0, 0, 0.6);
    z-index: 10;
  }

  .pin-control:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.8);
    border-color: rgba(0, 0, 0, 0.25);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .pin-control.pinned {
    background: var(--accent-light);
    /*background: #3b82f6;*/
    color: var(--text-primary);
    border-color: #3b82f6;
  }

  .pin-control.pinned:hover {
    background: var(--accent-hover);
    color: white;
    border-color: #2563eb;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
  }

  @media (prefers-color-scheme: dark) {
    .pin-control {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.7);
    }

    .pin-control:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 2px 4px rgba(255, 255, 255, 0.1);
    }
  }

  .editor-title-input {
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

  .editor-title-input:focus {
    border-color: transparent;
    background: transparent;
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
    display: flex;
    flex-direction: column;
  }

  .editor-container {
    flex: 1;
  }

  .metadata-section-container {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    padding: 0;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .editor-title-section {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>
