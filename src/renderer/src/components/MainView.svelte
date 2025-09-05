<script lang="ts">
  import NoteEditor from './NoteEditor.svelte';
  import NotesView from './NotesView.svelte';
  import Settings from './Settings.svelte';
  import SlashCommands from './SlashCommands.svelte';
  import CustomFunctionsManager from './custom-functions/CustomFunctionsManager.svelte';
  import { ViewRegistry } from '../lib/views';
  import { getChatService } from '../services/chatService.js';
  import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';
  import type { Note } from '../services/types';
  import type { Component } from 'svelte';
  import type { NoteViewProps } from '../lib/views/ViewRegistry';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView: 'notes' | 'settings' | 'slash-commands' | 'custom-functions' | null;
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
      <div class="system-view-content">
        <SlashCommands />
      </div>
    </div>
  {:else if activeSystemView === 'settings'}
    <div class="system-view-container">
      <div class="system-view-content">
        <Settings />
      </div>
    </div>
  {:else if activeSystemView === 'custom-functions'}
    <div class="system-view-container">
      <div class="system-view-content">
        <CustomFunctionsManager />
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
    max-width: 75ch;
    margin: 0 auto;
  }

  .system-view-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
