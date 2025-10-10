<script lang="ts">
  import { onMount } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import type { Note } from '@/server/core/notes';
  import { getChatService } from '../services/chatService.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte.js';
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte.js';
  import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte.js';
  import { sidebarState } from '../stores/sidebarState.svelte.js';
  import {
    CursorPositionManager,
    type CursorPosition
  } from '../stores/cursorPositionManager.svelte.js';
  import {
    noteDocumentRegistry,
    type NoteDocument
  } from '../stores/noteDocumentRegistry.svelte.js';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import MetadataView from './MetadataView.svelte';
  import Backlinks from './Backlinks.svelte';
  import NoteActionBar from './NoteActionBar.svelte';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
  }

  let { note, onClose }: Props = $props();

  // Shared document instance
  let doc = $state<NoteDocument | null>(null);

  let noteData = $state<Note | null>(null);
  let metadataExpanded = $state(false);
  let editorRef = $state<CodeMirrorEditor | undefined>(undefined);
  let headerRef = $state<{ focusTitle?: () => void } | null>(null);
  let pendingCursorPosition = $state<CursorPosition | null>(null);

  const cursorManager = new CursorPositionManager();

  const editorId = 'main';

  onMount(() => {
    return () => {
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

      // Close previous document if switching notes
      if (previousNote && previousNote.id !== note.id && doc) {
        noteDocumentRegistry.close(previousNote.id, editorId);
      }

      // Open the shared document for this note
      doc = await noteDocumentRegistry.open(note.id, editorId);

      // Load full note data for metadata
      await loadNoteMetadata(note);

      // Update previous note reference
      previousNote = note;
    })();
  });

  // Cleanup: close document when component is destroyed
  $effect(() => {
    return () => {
      if (note?.id) {
        noteDocumentRegistry.close(note.id, editorId);
      }
    };
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
    if (updateCounter > 0 && note && doc) {
      const currentDoc = doc; // Capture in closure to avoid null issues
      setTimeout(async () => {
        try {
          await currentDoc.reload();
        } catch (loadError) {
          console.warn('Failed to reload note content after wikilink update:', loadError);
        }
      }, 100);
    }
  });

  async function loadNoteMetadata(note: NoteMetadata): Promise<void> {
    try {
      const noteService = getChatService();

      if (await noteService.isReady()) {
        // Load full note data and cursor position
        const [noteResult, cursorPosition] = await Promise.all([
          noteService.getNote({ identifier: note.id }),
          cursorManager.getCursorPosition(note.id)
        ]);

        noteData = noteResult;
        pendingCursorPosition = cursorPosition;
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      console.error('Error loading note metadata:', err);
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
    if (!doc) return;
    // Update shared document - this automatically syncs to other editors
    doc.updateContent(content);
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
    if (!doc) return;

    // Allow empty titles, but skip if unchanged
    if (newTitle === doc.title) {
      return;
    }

    const oldId = note.id;

    // Update shared document - this automatically syncs to other editors
    const result = await doc.updateTitle(newTitle);

    if (result.success) {
      const newId = result.newId || note.id;

      // Update pinned notes if this note is pinned
      if (pinnedNotesStore.isPinned(oldId) && newId !== oldId) {
        await pinnedNotesStore.updateNoteId(oldId, newId);
      }

      // Update temporary tabs that reference this note
      const hasTemporaryTab = temporaryTabsStore.tabs.some((tab) => tab.noteId === oldId);
      if (hasTemporaryTab && newId !== oldId) {
        await temporaryTabsStore.updateNoteId(oldId, newId);
      }

      // Update sidebar notes if this note is in the sidebar
      if (sidebarNotesStore.isInSidebar(oldId) && newId !== oldId) {
        await sidebarNotesStore.updateNoteId(oldId, newId);
      }

      // Update the document registry if ID changed
      if (newId !== oldId) {
        noteDocumentRegistry.updateNoteId(oldId, newId);
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
    // Focus on title if it's empty, otherwise focus on content
    const title = doc?.title || '';
    if (!title || title.trim().length === 0) {
      if (headerRef && headerRef.focusTitle) {
        headerRef.focusTitle();
      }
    } else {
      if (editorRef) {
        editorRef.focus();
      }
    }
  }

  function toggleMetadata(): void {
    metadataExpanded = !metadataExpanded;
  }

  async function handleMetadataUpdate(metadata: Record<string, unknown>): Promise<void> {
    if (!noteData || !doc) return;

    try {
      const noteService = getChatService();
      await noteService.updateNote({
        identifier: note.id,
        content: doc.content,
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
    await pinnedNotesStore.togglePin(note.id);
  }

  async function handleAddToSidebar(): Promise<void> {
    if (!doc) return;

    await sidebarNotesStore.addNote(note.id, doc.title, doc.content);

    // Open the sidebar if it's not already visible
    if (
      !sidebarState.rightSidebar.visible ||
      sidebarState.rightSidebar.mode !== 'notes'
    ) {
      if (!sidebarState.rightSidebar.visible) {
        await sidebarState.toggleRightSidebar();
      }
      if (sidebarState.rightSidebar.mode !== 'notes') {
        await sidebarState.setRightSidebarMode('notes');
      }
    }
  }

  async function handleBacklinkSelect(
    selectedNote: NoteMetadata,
    lineNumber?: number
  ): Promise<void> {
    // Close current editor and navigate to the selected backlink note
    onClose();

    // If a line number was provided, calculate cursor position and save it
    if (lineNumber !== undefined && lineNumber > 0) {
      try {
        const noteService = getChatService();
        const targetNote = await noteService.getNote({ identifier: selectedNote.id });

        if (targetNote?.content) {
          const lines = targetNote.content.split('\n');
          // Calculate position as the start of the target line
          let position = 0;
          for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
            position += lines[i].length + 1; // +1 for newline character
          }

          // Save cursor position for the target note
          const cursorPositionWithId = cursorManager.createCursorPosition(
            selectedNote.id,
            position,
            position,
            position
          );
          await cursorManager.saveCursorPositionImmediately(
            selectedNote.id,
            cursorPositionWithId
          );
        }
      } catch (err) {
        console.warn('Failed to set cursor position for backlink navigation:', err);
      }
    }

    await wikilinkService.handleWikilinkClick(selectedNote.id, selectedNote.title, false);
  }
</script>

{#if doc}
  <div
    class="note-editor"
    role="dialog"
    aria-labelledby="note-editor-title"
    tabindex="-1"
    onkeydown={handleKeyDown}
  >
    <EditorHeader
      bind:this={headerRef}
      title={doc.title}
      onTitleChange={handleTitleChange}
      disabled={doc.isSaving}
    />

    <NoteActionBar
      isPinned={pinnedNotesStore.isPinned(note.id)}
      isInSidebar={sidebarNotesStore.isInSidebar(note.id)}
      {metadataExpanded}
      onPinToggle={handlePinToggle}
      onAddToSidebar={handleAddToSidebar}
      onMetadataToggle={toggleMetadata}
    />

    <ErrorBanner error={doc.error} />

    <div class="metadata-section-container">
      <MetadataView
        note={noteData}
        expanded={metadataExpanded}
        onMetadataUpdate={handleMetadataUpdate}
        onTypeChange={handleTypeChange}
      />
    </div>

    <CodeMirrorEditor
      bind:this={editorRef}
      content={doc.content}
      onContentChange={handleContentChange}
      onCursorChange={handleCursorChange}
      onWikilinkClick={handleWikilinkClick}
      cursorPosition={pendingCursorPosition}
      placeholder="Write, type [[ to make links..."
    />

    <Backlinks noteId={note.id} onNoteSelect={handleBacklinkSelect} />
  </div>
{/if}

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
