<script lang="ts">
  import AIAssistant from './AIAssistant.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { Message } from '../services/types';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    messages: Message[];
    isLoading: boolean;
    activeNote: NoteMetadata | null;
    onNoteClick: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
  }

  let { messages, isLoading, activeNote, onNoteClick, onSendMessage }: Props = $props();

  function toggleSidebar(): void {
    sidebarState.toggleRightSidebar();
  }

  function setMode(mode: 'ai' | 'metadata'): void {
    sidebarState.setRightSidebarMode(mode);
  }
</script>

<div class="right-sidebar" class:visible={sidebarState.rightSidebar.visible}>
  <div class="sidebar-header">
    <div class="mode-tabs">
      <button
        class="mode-tab"
        class:active={sidebarState.rightSidebar.mode === 'ai'}
        onclick={() => setMode('ai')}
      >
        AI Assistant
      </button>
      <button
        class="mode-tab"
        class:active={sidebarState.rightSidebar.mode === 'metadata'}
        onclick={() => setMode('metadata')}
      >
        Metadata
      </button>
    </div>
    <button class="close-sidebar" onclick={toggleSidebar} aria-label="Close sidebar">
      <svg
        width="16"
        height="16"
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

  <div class="sidebar-content">
    {#if sidebarState.rightSidebar.mode === 'ai'}
      <div class="ai-mode">
        <AIAssistant {messages} {isLoading} {onNoteClick} {onSendMessage} />
      </div>
    {:else}
      <div class="metadata-mode">
        {#if activeNote}
          <div class="metadata-editor">
            <h3>Note Metadata</h3>
            <div class="metadata-field">
              <label for="note-title">Title</label>
              <input id="note-title" type="text" value={activeNote.title} readonly />
            </div>
            <div class="metadata-field">
              <label for="note-created">Created</label>
              <input
                id="note-created"
                type="text"
                value={activeNote.dateCreated.toLocaleDateString()}
                readonly
              />
            </div>
            <div class="metadata-field">
              <label for="note-modified">Modified</label>
              <input
                id="note-modified"
                type="text"
                value={activeNote.dateModified.toLocaleDateString()}
                readonly
              />
            </div>
            {#if activeNote.tags && activeNote.tags.length > 0}
              <div class="metadata-field">
                <label>Tags</label>
                <div class="tag-list" role="list" aria-label="Note tags">
                  {#each activeNote.tags as tag (tag)}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-note">
            <p>Select a note to view metadata</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .right-sidebar {
    width: 400px;
    height: 100%;
    max-height: 100vh;
    background: var(--bg-primary);
    border-left: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
    overflow: hidden;
  }

  .right-sidebar:not(.visible) {
    transform: translateX(100%);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .mode-tabs {
    display: flex;
    background: var(--bg-tertiary);
    border-radius: 0.5rem;
    padding: 0.25rem;
  }

  .mode-tab {
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
  }

  .mode-tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 1px 2px var(--shadow-light);
  }

  .close-sidebar {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-sidebar:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .sidebar-content {
    flex: 1;
    min-height: 0; /* Critical for proper flexbox height constraint */
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .ai-mode {
    flex: 1;
    min-height: 0; /* Critical for proper flexbox height constraint */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .metadata-mode {
    padding: 1rem 1.25rem;
    overflow-y: auto;
  }

  .metadata-editor h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .metadata-field {
    margin-bottom: 1rem;
  }

  .metadata-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .metadata-field input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .metadata-field input[readonly] {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    border-radius: 0.25rem;
  }

  .no-note {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-secondary);
    font-style: italic;
  }

  @media (max-width: 1400px) {
    .right-sidebar {
      position: absolute;
      top: 0;
      right: 0;
      z-index: 100;
      box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    }
  }
</style>
