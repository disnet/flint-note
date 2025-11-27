<script lang="ts">
  import NoteEditor from './NoteEditor.svelte';
  import NotesView from './NotesView.svelte';
  import NoteTypeDetailView from './NoteTypeDetailView.svelte';
  import NoteTypeCreateView from './NoteTypeCreateView.svelte';
  import DailyView from './DailyView.svelte';
  import InboxView from './InboxView.svelte';
  import Settings from './Settings.svelte';
  import WorkflowManagementView from './WorkflowManagementView.svelte';
  import ReviewView from './ReviewView.svelte';
  import { ViewRegistry } from '../lib/views';
  import { getChatService } from '../services/chatService.js';
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';
  import type { Note } from '../services/types';
  import type { Component } from 'svelte';
  import type { NoteViewProps } from '../lib/views/ViewRegistry';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView:
      | 'inbox'
      | 'daily'
      | 'notes'
      | 'settings'
      | 'workflows'
      | 'review'
      | null;
    noteTypes: NoteType[];
    onClose: () => void;
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote: (noteType?: string) => void;
  }

  let { activeNote, activeSystemView, onClose, onNoteSelect, onCreateNote }: Props =
    $props();

  let noteEditor = $state<{ focus?: () => void } | null>(null);
  let customView = $state<{ component: Component<NoteViewProps> } | null>(null);
  let useCustomView = $state(false);
  let noteContent = $state('');
  let noteData = $state<Note | null>(null);
  let isLoadingNote = $state(false);
  let selectedNoteType = $state<string | null>(null);
  let isCreatingType = $state(false);

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

  // Note: With the shared document model, NoteEditor handles sync automatically.
  // Custom views would need their own reload logic if they support live collaboration.

  async function loadNoteAndView(note: NoteMetadata): Promise<void> {
    try {
      isLoadingNote = true;

      // Determine content kind from metadata (prefer flint_kind, fallback to type for legacy)
      const noteKind = (note.flint_kind as string) || 'markdown';

      // Check for custom view based on content kind (not type)
      const view = ViewRegistry.getViewByKind(noteKind, 'hybrid');
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

  function handleTypeSelect(typeName: string): void {
    selectedNoteType = typeName;
  }

  function handleBackToNoteTypes(): void {
    selectedNoteType = null;
    isCreatingType = false;
  }

  function handleCreateType(): void {
    isCreatingType = true;
  }

  async function handleTypeCreated(): Promise<void> {
    // Reload note types after creation
    await notesStore.initialize();
  }
</script>

<div class="main-view">
  {#if activeSystemView === 'inbox'}
    <div class="system-view-container">
      <div class="system-view-content">
        <InboxView />
      </div>
    </div>
  {:else if activeSystemView === 'daily'}
    <div class="system-view-container">
      <div class="system-view-content">
        <DailyView {onNoteSelect} />
      </div>
    </div>
  {:else if activeSystemView === 'notes'}
    <div class="system-view-container">
      <div class="system-view-content">
        {#if isCreatingType}
          <NoteTypeCreateView
            onBack={handleBackToNoteTypes}
            onCreated={handleTypeCreated}
          />
        {:else if selectedNoteType}
          <NoteTypeDetailView
            typeName={selectedNoteType}
            onBack={handleBackToNoteTypes}
            {onNoteSelect}
            {onCreateNote}
          />
        {:else}
          <NotesView onTypeSelect={handleTypeSelect} onCreateType={handleCreateType} />
        {/if}
      </div>
    </div>
  {:else if activeSystemView === 'settings'}
    <div class="system-view-container">
      <div class="system-view-content">
        <Settings />
      </div>
    </div>
  {:else if activeSystemView === 'workflows'}
    <div class="system-view-container">
      <div class="system-view-content">
        <WorkflowManagementView />
      </div>
    </div>
  {:else if activeSystemView === 'review'}
    <div class="system-view-container">
      <div class="system-view-content">
        <ReviewView />
      </div>
    </div>
  {:else if activeNote}
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
        <NoteEditor bind:this={noteEditor} note={activeNote} {onClose} />
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
    width: 100%;
    background: var(--bg-primary);
    overflow: hidden;
    padding: 0;
  }

  .note-content {
    flex: 1;
    overflow: auto;
    scrollbar-gutter: stable;
    width: 100%;
    display: flex;
    justify-content: center;
    padding: 0 2.5rem;
    padding-top: 1.5rem;
  }

  .note-content::-webkit-scrollbar {
    width: 8px;
  }

  .note-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .note-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .note-content::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
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
    width: 100%;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .system-view-container::-webkit-scrollbar {
    width: 8px;
  }

  .system-view-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .system-view-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .system-view-container::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .system-view-content {
    flex: 1;
    overflow: visible;
    display: flex;
    flex-direction: column;
    max-width: 75ch;
    margin: 0 auto;
    width: 100%;
  }
</style>
