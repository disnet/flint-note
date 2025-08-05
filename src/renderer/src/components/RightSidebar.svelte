<script lang="ts">
  import AIAssistant from './AIAssistant.svelte';
  import MetadataEditor from './MetadataEditor.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { Message } from '../services/types';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    messages: Message[];
    isLoading: boolean;
    activeNote: NoteMetadata | null;
    onNoteClick: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
    onMetadataUpdate?: (metadata: Partial<NoteMetadata>) => void;
  }

  let { messages, isLoading, activeNote, onNoteClick, onSendMessage, onMetadataUpdate }: Props = $props();

  // Debug logging
  $effect(() => {
    console.log('RightSidebar: messages updated, count:', messages.length);
    console.log('RightSidebar: sidebar visible:', sidebarState.rightSidebar.visible);
    console.log('RightSidebar: sidebar mode:', sidebarState.rightSidebar.mode);
  });

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
        <MetadataEditor {activeNote} {onMetadataUpdate} />
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
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
