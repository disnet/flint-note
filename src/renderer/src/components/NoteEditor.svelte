<script lang="ts">
  import { onMount } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import type { Note } from '@/server/core/notes';
  import { getChatService } from '../services/chatService.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte.js';
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte.js';
  import { AutoSave } from '../stores/autoSave.svelte.js';
  import {
    CursorPositionManager,
    type CursorPosition
  } from '../stores/cursorPositionManager.svelte.js';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import MetadataView from './MetadataView.svelte';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
  }

  let { note, onClose }: Props = $props();

  let noteContent = $state('');
  let error = $state<string | null>(null);
  let noteData = $state<Note | null>(null);
  let metadataExpanded = $state(false);
  let editorRef: CodeMirrorEditor;
  let pendingCursorPosition = $state<CursorPosition | null>(null);

  const cursorManager = new CursorPositionManager();

  const autoSave = new AutoSave(saveNote);

  onMount(() => {
    return () => {
      autoSave.destroy();
      cursorManager.destroy();
    };
  });

  // Track previous note to save cursor position before switching
  let previousNote: NoteMetadata | null = null;

  $effect(() => {
    (async () => {
      // Save cursor position for previous note before switching
      if (previousNote && previousNote.id !== note.id) {
        try {
          await saveCurrentCursorPositionForNote(previousNote);
        } catch (error) {
          console.warn('Failed to save cursor position before note switch:', error);
        }
      }

      // Load new note
      await loadNote(note);

      // Update previous note reference
      previousNote = note;
    })();
  });

  // Watch for changes in notes store and refresh wikilinks
  $effect(() => {
    // Access the notes store to create a dependency
    const notes = notesStore.notes;
    const loading = notesStore.loading;

    // Only refresh if we have an editor, notes are loaded, and we're not currently loading
    if (editorRef && !loading && notes.length >= 0) {
      // Small delay to ensure the store update is complete
      setTimeout(() => {
        if (editorRef) {
          editorRef.refreshWikilinks();
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

  // Watch for specific note updates and reload content if the current note was updated
  $effect(() => {
    const updateCounter = notesStore.noteUpdateCounter;
    const lastUpdatedNoteId = notesStore.lastUpdatedNoteId;

    // Skip initial load (when counter is 0) and only reload if current note was updated
    if (updateCounter > 0 && lastUpdatedNoteId === note?.id) {
      setTimeout(async () => {
        try {
          await loadNote(note);
        } catch (loadError) {
          console.warn('Failed to reload note content after agent update:', loadError);
        }
      }, 100);
    }
  });

  async function loadNote(note: NoteMetadata): Promise<void> {
    try {
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        // Load BOTH content and cursor position
        const [noteResult, cursorPosition] = await Promise.all([
          noteService.getNote({ identifier: note.id }),
          cursorManager.getCursorPosition(note.id)
        ]);

        noteData = noteResult;
        noteContent = noteResult?.content ?? '';
        pendingCursorPosition = cursorPosition;
        autoSave.clearChanges();
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Error loading note:', err);
    }
  }

  async function saveNote(): Promise<void> {
    if (!noteData) return;

    try {
      error = null;
      const noteService = getChatService();
      await noteService.updateNote({ identifier: note.id, content: noteContent });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note';
      console.error('Error saving note:', err);
      throw err;
    }
  }

  async function saveCurrentCursorPositionForNote(
    targetNote: NoteMetadata
  ): Promise<void> {
    if (!editorRef) return;

    const currentPosition = editorRef.getCurrentCursorPosition();
    if (currentPosition) {
      const cursorPositionWithId = cursorManager.createCursorPosition(
        targetNote.id,
        currentPosition.position,
        currentPosition.selectionStart,
        currentPosition.selectionEnd
      );
      await cursorManager.saveCursorPositionImmediately(
        targetNote.id,
        cursorPositionWithId
      );
    }
  }

  function handleContentChange(content: string): void {
    noteContent = content;
    autoSave.markChanged();
  }

  function handleCursorChange(): void {
    if (!editorRef || !note?.id) return;

    const currentPosition = editorRef.getCurrentCursorPosition();
    if (currentPosition) {
      // Create a complete cursor position object with noteId
      const cursorPositionWithId = cursorManager.createCursorPosition(
        note.id,
        currentPosition.position,
        currentPosition.selectionStart,
        currentPosition.selectionEnd
      );

      // Use debounced save for frequent cursor movements
      cursorManager.debouncedSaveCursorPosition(note.id, cursorPositionWithId);
    }
  }

  async function handleTitleChange(newTitle: string): Promise<void> {
    if (!newTitle || newTitle === note.title) {
      return;
    }

    try {
      error = null;
      const noteService = getChatService();

      const result = await noteService.renameNote({
        identifier: note.id,
        newIdentifier: newTitle
      });

      if (result.success) {
        const oldId = note.id;
        const newId = result.new_id || note.id;

        // Update pinned notes if this note is pinned
        if (pinnedNotesStore.isPinned(oldId)) {
          if (newId !== oldId) {
            await pinnedNotesStore.updateNoteIdAndTitle(oldId, newId, newTitle);
          } else {
            await pinnedNotesStore.updateNoteTitle(oldId, newTitle);
          }
        }

        // Update temporary tabs that reference this note
        const hasTemporaryTab = temporaryTabsStore.tabs.some(
          (tab) => tab.noteId === oldId
        );
        if (hasTemporaryTab) {
          if (newId !== oldId) {
            await temporaryTabsStore.updateNoteIdAndTitle(oldId, newId, newTitle);
          } else {
            await temporaryTabsStore.updateNoteTitle(oldId, newTitle);
          }
        }

        // Update the local note reference
        note = {
          ...note,
          id: newId,
          title: newTitle
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
      throw err;
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

  export function focus(): void {
    if (editorRef) {
      editorRef.focus();
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
        metadata: $state.snapshot(metadata) as import('@/server/types').NoteMetadata
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

  async function handlePinToggle(): Promise<void> {
    await pinnedNotesStore.togglePin(note.id, note.title, note.filename || note.title);
  }
</script>

<div
  class="note-editor"
  role="dialog"
  aria-labelledby="note-editor-title"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  <EditorHeader
    title={note.title}
    isPinned={pinnedNotesStore.isPinned(note.id)}
    onTitleChange={handleTitleChange}
    onPinToggle={handlePinToggle}
    disabled={autoSave.isSaving}
  />

  <ErrorBanner {error} />

  <div class="metadata-section-container">
    <MetadataView
      note={noteData}
      expanded={metadataExpanded}
      onToggle={toggleMetadata}
      onMetadataUpdate={handleMetadataUpdate}
      onTypeChange={handleTypeChange}
    />
  </div>

  <CodeMirrorEditor
    bind:this={editorRef}
    content={noteContent}
    onContentChange={handleContentChange}
    onCursorChange={handleCursorChange}
    onWikilinkClick={handleWikilinkClick}
    cursorPosition={pendingCursorPosition}
    placeholder="Write, type [[ to make links..."
  />
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

  .metadata-section-container {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    padding: 0;
  }
</style>
