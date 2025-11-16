<script lang="ts">
  import { onMount } from 'svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import { messageBus } from '../services/messageBus.svelte';
  import type { Note } from '@/server/core/notes';
  import { getChatService } from '../services/chatService.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte.js';
  import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte.js';
  import { sidebarState } from '../stores/sidebarState.svelte.js';
  import { reviewStore } from '../stores/reviewStore.svelte.js';
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
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import type { NoteSuggestion } from '@/server/types';

  interface Props {
    note: NoteMetadata;
    onClose: () => void;
  }

  let { note, onClose }: Props = $props();

  // Shared document instance
  let doc = $state<NoteDocument | null>(null);

  let noteData = $state<Note | null>(null);
  let metadataExpanded = $state(false);
  let previewMode = $state(false);
  let editorRef = $state<CodeMirrorEditor | undefined>(undefined);
  let headerRef = $state<{ focusTitle?: () => void } | null>(null);
  let pendingCursorPosition = $state<CursorPosition | null>(null);
  let reviewEnabled = $state(false);
  let isLoadingReview = $state(false);
  let isHeaderHovering = $state(false);

  // Suggestions state
  let suggestions = $state<NoteSuggestion[]>([]);
  let expandedSuggestions = $state<Set<string>>(new Set());
  let isGeneratingSuggestions = $state(false);
  let suggestionsEnabled = $state(false);

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
    const unsubscribe = messageBus.subscribe('note.linksChanged', () => {
      if (note && doc) {
        const currentDoc = doc; // Capture in closure to avoid null issues
        setTimeout(async () => {
          try {
            await currentDoc.reload();
          } catch (loadError) {
            console.warn(
              'Failed to reload note content after wikilink update:',
              loadError
            );
          }
        }, 100);
      }
    });

    return () => unsubscribe();
  });

  async function loadNoteMetadata(note: NoteMetadata): Promise<void> {
    try {
      const noteService = getChatService();

      if (await noteService.isReady()) {
        // Load full note data, cursor position, and note type info
        const [noteResult, cursorPosition, noteTypeInfo] = await Promise.all([
          noteService.getNote({ identifier: note.id }),
          cursorManager.getCursorPosition(note.id),
          window.api?.getNoteTypeInfo({ typeName: note.type })
        ]);

        noteData = noteResult;
        pendingCursorPosition = cursorPosition;

        // Check if suggestions are enabled for this note type
        if (noteTypeInfo?.suggestions_config?.enabled) {
          suggestionsEnabled = true;
          await loadSuggestions(note.id);
        } else {
          suggestionsEnabled = false;
        }
      } else {
        throw new Error('Note service not ready');
      }
    } catch (err) {
      console.error('Error loading note metadata:', err);
    }
  }

  async function loadSuggestions(noteId: string): Promise<void> {
    try {
      const result = await window.api?.getNoteSuggestions({ noteId });
      if (result) {
        suggestions = result.suggestions || [];
      } else {
        suggestions = [];
      }
    } catch (err) {
      console.error('Error loading suggestions:', err);
      suggestions = [];
    }
  }

  async function generateSuggestions(): Promise<void> {
    if (!note?.id) return;

    try {
      isGeneratingSuggestions = true;
      const result = await window.api?.generateNoteSuggestions({ noteId: note.id });
      if (result) {
        suggestions = result.suggestions || [];
        // Clear expanded state when regenerating
        expandedSuggestions = new Set();
      }
    } catch (err) {
      console.error('Error generating suggestions:', err);
    } finally {
      isGeneratingSuggestions = false;
    }
  }

  async function dismissSuggestion(suggestionId: string): Promise<void> {
    if (!note?.id) return;

    try {
      await window.api?.dismissNoteSuggestion({ noteId: note.id, suggestionId });
      // Remove from local state
      suggestions = suggestions.filter((s) => s.id !== suggestionId);
      // Remove from expanded if it was expanded
      const newExpanded = new Set(expandedSuggestions);
      newExpanded.delete(suggestionId);
      expandedSuggestions = newExpanded;
    } catch (err) {
      console.error('Error dismissing suggestion:', err);
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

    // Update shared document - this automatically syncs to other editors
    const result = await doc.updateTitle(newTitle);

    if (result.success) {
      const newId = result.newId || note.id;

      // Note: With immutable note IDs, the ID never changes during a rename
      // The newId returned by the API is always the same as the original ID

      // Update the local note reference
      note = {
        ...note,
        id: newId,
        title: newTitle
      };

      // Note: The message bus will automatically update the note cache when IPC events are published
      // If wikilinks were updated in other notes, publish an event
      if (result.linksUpdated && result.linksUpdated > 0) {
        messageBus.publish({
          type: 'note.linksChanged',
          noteId: newId
        });
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
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> {
    // Close current editor before navigating (for existing notes, unless shift+click for sidebar)
    if (!shouldCreate && !shiftKey) {
      onClose();
    }

    // Use centralized wikilink service
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate, shiftKey);
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

  function togglePreview(): void {
    previewMode = !previewMode;
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

      const moveResult = await noteService.moveNote({
        identifier: note.id,
        newType: newType
      });

      if (moveResult.success) {
        const newId = moveResult.new_id;

        // Note: With immutable note IDs, the ID never changes during a move
        // The new_id returned by the API is always the same as the original ID

        // Update the local note reference with new type
        note = {
          ...note,
          id: newId, // Same as original, but keeping for clarity
          type: newType
        };

        // Refresh the note data to reflect the type change
        const result = await noteService.getNote({ identifier: newId });
        noteData = result;

        // Note: The message bus will automatically update the note cache when IPC events are published
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

  async function handleReviewToggle(): Promise<void> {
    isLoadingReview = true;
    try {
      if (reviewEnabled) {
        await reviewStore.disableReview(note.id);
        reviewEnabled = false;
      } else {
        await reviewStore.enableReview(note.id);
        reviewEnabled = true;
      }
    } catch (err) {
      console.error('Error toggling review:', err);
    } finally {
      isLoadingReview = false;
    }
  }

  // Load review status when note changes
  $effect(() => {
    (async () => {
      if (note?.id) {
        try {
          reviewEnabled = await reviewStore.isReviewEnabled(note.id);
        } catch (err) {
          console.error('Failed to load review status:', err);
          reviewEnabled = false;
        }
      }
    })();
  });

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

  async function handlePreviewWikilinkClick(noteId: string): Promise<void> {
    // Close current editor before navigating
    onClose();

    // Navigate to the clicked note using the wikilink service
    // Find the note by ID to get its title
    const targetNote = notesStore.notes.find((n) => n.id === noteId);
    if (targetNote) {
      await wikilinkService.handleWikilinkClick(noteId, targetNote.title, false);
    } else {
      // If not found, try to create it
      await wikilinkService.handleWikilinkClick(noteId, noteId, true);
    }
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="header-container"
      onmouseenter={() => (isHeaderHovering = true)}
      onmouseleave={() => (isHeaderHovering = false)}
    >
      <EditorHeader
        bind:this={headerRef}
        title={doc.title}
        noteType={note.type}
        onTitleChange={handleTitleChange}
        onTypeChange={handleTypeChange}
        disabled={doc.isSaving}
      />

      <NoteActionBar
        isHovering={isHeaderHovering}
        isPinned={pinnedNotesStore.isPinned(note.id)}
        isInSidebar={sidebarNotesStore.isInSidebar(note.id)}
        {metadataExpanded}
        {previewMode}
        {reviewEnabled}
        {isLoadingReview}
        {suggestionsEnabled}
        hasSuggestions={suggestions.length > 0}
        {isGeneratingSuggestions}
        onPinToggle={handlePinToggle}
        onAddToSidebar={handleAddToSidebar}
        onMetadataToggle={toggleMetadata}
        onPreviewToggle={togglePreview}
        onReviewToggle={handleReviewToggle}
        onGenerateSuggestions={generateSuggestions}
      />
    </div>

    <ErrorBanner error={doc.error} />

    <div class="metadata-section-container">
      <MetadataView
        note={noteData}
        expanded={metadataExpanded}
        onMetadataUpdate={handleMetadataUpdate}
      />
    </div>

    {#if previewMode}
      <div class="preview-content">
        <MarkdownRenderer text={doc.content} onNoteClick={handlePreviewWikilinkClick} />
      </div>
    {:else}
      <CodeMirrorEditor
        bind:this={editorRef}
        content={doc.content}
        onContentChange={handleContentChange}
        onCursorChange={handleCursorChange}
        onWikilinkClick={handleWikilinkClick}
        cursorPosition={pendingCursorPosition}
        placeholder="Write, type [[ to make links..."
        {suggestions}
        {expandedSuggestions}
        onDismissSuggestion={dismissSuggestion}
      />
    {/if}

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

  .preview-content {
    padding: 0.75rem;
    line-height: 1.6;
  }
</style>
