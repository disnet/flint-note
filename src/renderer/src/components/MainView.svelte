<script lang="ts">
  import NoteEditor from './NoteEditor.svelte';
  import MessageInput from './MessageInput.svelte';
  import InboxView from './InboxView.svelte';
  import NotesView from './NotesView.svelte';
  import SearchBar from './SearchBar.svelte';
  import Settings from './Settings.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore';
  import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView: 'inbox' | 'notes' | 'search' | 'settings' | null;
    noteTypes: NoteType[];
    onClose: () => void;
    onSendMessage: (text: string) => Promise<void>;
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote: () => void;
    onNoteTypeChange: (noteId: string, newType: string) => Promise<void>;
  }

  let {
    activeNote,
    activeSystemView,
    noteTypes,
    onClose,
    onSendMessage,
    onNoteSelect,
    onCreateNote,
    onNoteTypeChange
  }: Props = $props();

  let noteEditor = $state<{ focus?: () => void } | null>(null);
  let isChangingType = $state(false);
  let isPinned = $state(false);

  // Subscribe to pinned notes store to update isPinned reactively
  $effect(() => {
    if (!activeNote) {
      isPinned = false;
      return;
    }

    const unsubscribe = pinnedNotesStore.subscribe(() => {
      isPinned = pinnedNotesStore.isPinned(activeNote.id);
    });

    // Initial check
    isPinned = pinnedNotesStore.isPinned(activeNote.id);

    return unsubscribe;
  });

  function toggleRightSidebar(): void {
    sidebarState.toggleRightSidebar();
  }

  function togglePin(): void {
    if (!activeNote) return;
    
    console.log('MainView: togglePin called for:', {
      id: activeNote.id,
      title: activeNote.title,
      filename: activeNote.filename
    });
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
</script>

<div class="main-view">
  {#if activeSystemView === 'inbox'}
    <InboxView />
  {:else if activeSystemView === 'notes'}
    <div class="system-view-container">
      <div class="system-view-header">
        <h1>All Notes</h1>
      </div>
      <div class="system-view-content">
        <NotesView {onNoteSelect} {onCreateNote} />
      </div>
    </div>
  {:else if activeSystemView === 'search'}
    <div class="system-view-container">
      <div class="system-view-header">
        <h1>Search</h1>
      </div>
      <div class="system-view-content">
        <div class="search-container">
          <SearchBar {onNoteSelect} />
        </div>
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
          onclick={toggleRightSidebar}
          aria-label="Toggle AI assistant"
          title="Toggle AI assistant"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            ></path>
          </svg>
        </button>
        <button class="action-btn" aria-label="Note information" title="Note information">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </button>
        <button
          class="action-btn delete-btn"
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
      <NoteEditor bind:this={noteEditor} note={activeNote} position="nested" {onClose} />
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

  {#if sidebarState.layout === 'single-column'}
    <div class="chat-input">
      <MessageInput onSend={onSendMessage} />
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
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    width: 100%;
  }

  .note-type-selector {
    display: flex;
    align-items: center;
  }

  .note-type-dropdown {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
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
    border: 1px solid var(--border-light);
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

  .action-btn.delete-btn:hover {
    background: var(--danger-bg);
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  .pin-btn {
    opacity: 0.6;
  }

  .pin-btn:hover {
    opacity: 1;
  }

  .pin-btn.pinned {
    opacity: 1;
    background: var(--accent-primary-alpha);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .note-content {
    flex: 1;
    overflow: hidden;
    width: 70ch;
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

  .search-container {
    padding: 2rem;
  }

  .chat-input {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
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

    .search-container {
      padding: 1.5rem 1rem;
    }
  }
</style>
