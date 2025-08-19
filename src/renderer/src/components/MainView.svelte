<script lang="ts">
  import NoteEditor from './NoteEditor.svelte';
  import NotesView from './NotesView.svelte';
  import Settings from './Settings.svelte';
  import SlashCommands from './SlashCommands.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { ViewRegistry } from '../lib/views';
  import { getChatService } from '../services/chatService.js';
  import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';
  import type { Note } from '../services/types';
  import type { Component } from 'svelte';
  import type { NoteViewProps } from '../lib/views/ViewRegistry';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView: 'notes' | 'settings' | 'slash-commands' | null;
    noteTypes: NoteType[];
    onClose: () => void;
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote: (noteType?: string) => void;
    onNoteTypeChange: (noteId: string, newType: string) => Promise<void>;
  }

  let {
    activeNote,
    activeSystemView,
    noteTypes,
    onClose,
    onNoteSelect,
    onCreateNote,
    onNoteTypeChange
  }: Props = $props();

  let noteEditor = $state<{ focus?: () => void } | null>(null);
  let isChangingType = $state(false);
  let isPinned = $state(false);
  let customView = $state<{ component: Component<NoteViewProps> } | null>(null);
  let useCustomView = $state(false);
  let noteContent = $state('');
  let noteData = $state<Note | null>(null);
  let isLoadingNote = $state(false);

  // Subscribe to pinned notes store to update isPinned reactively
  $effect(() => {
    if (!activeNote) {
      isPinned = false;
      return;
    }

    // Reactive check using pinnedNotesStore.notes
    isPinned = pinnedNotesStore.isPinned(activeNote.id);
  });

  function togglePin(): void {
    if (!activeNote) return;

    pinnedNotesStore.togglePin(activeNote.id, activeNote.title, activeNote.filename);
  }

  async function handleNoteTypeChange(event: Event): Promise<void> {
    if (!activeNote || isChangingType) return;

    const target = event.target as HTMLSelectElement;
    const newType = target.value;

    if (newType === activeNote.type) return;

    try {
      isChangingType = true;
      await onNoteTypeChange(activeNote.id, newType);
    } catch (error) {
      console.error('Failed to change note type:', error);
      // Reset the dropdown to the original type on error
      target.value = activeNote.type;
    } finally {
      isChangingType = false;
    }
  }

  function focusEditor(): void {
    if (noteEditor && noteEditor.focus) {
      noteEditor.focus();
    }
  }

  // Focus editor when note becomes active
  $effect(() => {
    if (activeNote) {
      setTimeout(focusEditor, 100);
    }
  });

  // Load custom view and note content when active note changes
  $effect(() => {
    if (activeNote) {
      loadNoteAndView(activeNote);
    } else {
      customView = null;
      useCustomView = false;
      noteContent = '';
      noteData = null;
    }
  });

  async function loadNoteAndView(note: NoteMetadata): Promise<void> {
    try {
      isLoadingNote = true;

      // Check for custom view
      const view = ViewRegistry.getView(note.type, 'hybrid');
      customView = view;
      useCustomView = !!view;

      // Load note content
      const noteService = getChatService();
      if (await noteService.isReady()) {
        const result = await noteService.getNote({ identifier: note.id });
        noteData = result;
        noteContent = result?.content ?? '';
      }
    } catch (error) {
      console.error('Error loading note and view:', error);
      customView = null;
      useCustomView = false;
      noteContent = '';
      noteData = null;
    } finally {
      isLoadingNote = false;
    }
  }

  async function handleContentChange(newContent: string): Promise<void> {
    noteContent = newContent;
    await saveNote();
  }

  async function handleMetadataChange(
    newMetadata: Record<string, unknown>
  ): Promise<void> {
    if (!activeNote || !noteData) return;

    try {
      const noteService = getChatService();

      await noteService.updateNote({
        identifier: activeNote.id,
        content: noteContent,
        metadata: newMetadata as NoteMetadata
      });

      // Update local noteData - merge the new metadata into noteData.metadata
      noteData = { ...noteData, metadata: newMetadata as NoteMetadata };
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }

  async function saveNote(): Promise<void> {
    if (!activeNote || !noteData) return;

    try {
      const noteService = getChatService();
      await noteService.updateNote({
        identifier: activeNote.id,
        content: noteContent
      });
    } catch (error) {
      console.error('Error saving note:', error);
    }
  }
</script>

<div class="main-view">
  {#if activeSystemView === 'notes'}
    <div class="system-view-container">
      <div class="system-view-content">
        <NotesView {onNoteSelect} {onCreateNote} />
      </div>
    </div>
  {:else if activeSystemView === 'slash-commands'}
    <div class="system-view-container">
      <div class="system-view-header">
        <h1>Slash Commands</h1>
      </div>
      <div class="system-view-content">
        <SlashCommands />
      </div>
    </div>
  {:else if activeSystemView === 'settings'}
    <div class="system-view-container">
      <div class="system-view-header">
        <h1>Settings</h1>
      </div>
      <div class="system-view-content">
        <Settings />
      </div>
    </div>
  {:else if activeNote}
    <div class="note-header">
      <div class="note-type-selector">
        <select
          class="note-type-dropdown"
          class:changing={isChangingType}
          value={activeNote.type}
          onchange={handleNoteTypeChange}
          disabled={isChangingType}
          aria-label="Note type"
        >
          {#each noteTypes as noteType (noteType.name)}
            <option value={noteType.name}>
              {noteType.name} ({noteType.count})
            </option>
          {/each}
        </select>
      </div>

      <div class="note-actions">
        <button
          class="action-btn pin-btn"
          class:pinned={isPinned}
          onclick={togglePin}
          aria-label={isPinned ? 'Unpin note' : 'Pin note'}
          title={isPinned ? 'Unpin note' : 'Pin note'}
        >
          📌
        </button>
        <button
          class="action-btn"
          onclick={onClose}
          aria-label="Close note"
          title="Close note"
        >
          <svg
            width="18"
            height="18"
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

    <div class="note-content">
      {#if isLoadingNote}
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading note...</p>
        </div>
      {:else if useCustomView && customView && noteData}
        {@const CustomComponent = customView.component}
        <CustomComponent
          {activeNote}
          {noteContent}
          metadata={noteData?.metadata || {}}
          onContentChange={handleContentChange}
          onMetadataChange={handleMetadataChange}
          onSave={saveNote}
        />
      {:else}
        <NoteEditor
          bind:this={noteEditor}
          note={activeNote}
          position="nested"
          {onClose}
        />
      {/if}
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-content">
        <div class="empty-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
          </svg>
        </div>
        <h2>No note selected</h2>
        <p>Choose a note from the sidebar or create a new one to start editing</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .main-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
    overflow: hidden;
    align-items: center;
  }

  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    /*border-bottom: 1px solid var(--border-light);*/
    /*background: var(--bg-secondary);*/
    width: 100%;
  }

  .note-type-selector {
    display: flex;
    align-items: center;
  }

  .note-type-dropdown {
    padding: 0.25rem 0.25rem;
    border: transparent;
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .note-type-dropdown:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .note-type-dropdown:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-primary-alpha);
  }

  .note-type-dropdown.changing {
    opacity: 0.6;
    cursor: wait;
  }

  .note-type-dropdown:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border: transparent;
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .pin-btn {
    opacity: 0.6;
  }

  .pin-btn:hover {
    opacity: 1;
  }

  .pin-btn.pinned {
    opacity: 1;
    background: var(--accent-light);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .note-content {
    flex: 1;
    overflow: hidden;
    width: 100%;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--text-secondary);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-light);
    border-top: 3px solid var(--accent-primary);
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

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .empty-content {
    text-align: center;
    max-width: 400px;
  }

  .empty-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
    color: var(--text-tertiary);
  }

  .empty-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .empty-content p {
    margin: 0;
    color: var(--text-tertiary);
    line-height: 1.5;
  }

  .system-view-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    width: 75ch;
  }

  .system-view-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .system-view-header h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .system-view-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 768px) {
    .note-header {
      padding: 0.75rem 1rem;
    }

    .note-actions {
      gap: 0.25rem;
    }

    .action-btn {
      padding: 0.375rem;
    }

    .system-view-header {
      padding: 1.5rem 1rem 1rem 1rem;
    }

    .system-view-header h1 {
      font-size: 1.75rem;
    }
  }
</style>
