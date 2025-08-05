<script lang="ts">
  import NotesView from './NotesView.svelte';
  import SearchBar from './SearchBar.svelte';
  import Settings from './Settings.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote: () => void;
  }

  let { onNoteSelect, onCreateNote }: Props = $props();

  let activeView = $state<'inbox' | 'notes' | 'search' | 'settings' | null>(null);

  function setActiveView(view: 'inbox' | 'notes' | 'search' | 'settings' | null) {
    activeView = activeView === view ? null : view;
  }

  function handleInboxCapture(text: string) {
    // TODO: Implement inbox capture functionality
    console.log('Inbox capture:', text);
  }
</script>

<div class="system-views">
  <div class="system-nav">
    <button 
      class="nav-item" 
      class:active={activeView === 'inbox'}
      onclick={() => setActiveView('inbox')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"></polyline>
      </svg>
      Inbox
    </button>

    <button 
      class="nav-item" 
      class:active={activeView === 'notes'}
      onclick={() => setActiveView('notes')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14,2 14,8 20,8"></polyline>
      </svg>
      All notes
    </button>

    <button 
      class="nav-item" 
      class:active={activeView === 'search'}
      onclick={() => setActiveView('search')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      Search
    </button>

    <button 
      class="nav-item" 
      class:active={activeView === 'settings'}
      onclick={() => setActiveView('settings')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m12-6l-3 3 3 3m-6-6l3 3-3 3"></path>
      </svg>
      Settings
    </button>
  </div>

  {#if activeView === 'inbox'}
    <div class="system-content">
      <div class="inbox-view">
        <div class="inbox-header">
          <h3>Quick Capture</h3>
        </div>
        <textarea 
          class="inbox-input" 
          placeholder="Capture thoughts quickly for later organization..."
          rows="4"
        ></textarea>
        <div class="inbox-actions">
          <button class="btn-primary">Save to Inbox</button>
        </div>
      </div>
    </div>
  {:else if activeView === 'notes'}
    <div class="system-content">
      <NotesView {onNoteSelect} {onCreateNote} />
    </div>
  {:else if activeView === 'search'}
    <div class="system-content">
      <div class="search-view">
        <SearchBar {onNoteSelect} />
      </div>
    </div>
  {:else if activeView === 'settings'}
    <div class="system-content">
      <Settings />
    </div>
  {/if}
</div>

<style>
  .system-views {
    border-bottom: 1px solid var(--border-light);
  }

  .system-nav {
    padding: 0.5rem 0;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .nav-item svg {
    flex-shrink: 0;
  }

  .system-content {
    max-height: 400px;
    overflow-y: auto;
    border-top: 1px solid var(--border-light);
  }

  .inbox-view {
    padding: 1rem 1.25rem;
  }

  .inbox-header {
    margin-bottom: 0.75rem;
  }

  .inbox-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .inbox-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
    min-height: 80px;
    margin-bottom: 0.75rem;
  }

  .inbox-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-primary-alpha);
  }

  .inbox-actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--accent-primary);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .search-view {
    padding: 1rem 1.25rem;
  }
</style>