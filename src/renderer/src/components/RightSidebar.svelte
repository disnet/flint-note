<script lang="ts">
  import AIAssistant from './AIAssistant.svelte';
  import MetadataEditor from './MetadataEditor.svelte';
  import ThreadList from './ThreadList.svelte';
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

  let {
    messages,
    isLoading,
    activeNote,
    onNoteClick,
    onSendMessage,
    onMetadataUpdate
  }: Props = $props();
</script>

<div class="right-sidebar" class:visible={sidebarState.rightSidebar.visible}>
  <div class="sidebar-content">
    {#if sidebarState.rightSidebar.mode === 'ai'}
      <div class="ai-mode">
        <AIAssistant {messages} {isLoading} {onNoteClick} {onSendMessage} />
      </div>
    {:else if sidebarState.rightSidebar.mode === 'threads'}
      <div class="threads-mode">
        <ThreadList
          onThreadSelect={(_threadId) => {
            // Switch to AI mode when thread is selected to show conversation
            sidebarState.setRightSidebarMode('ai');
          }}
        />
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
    width: 450px;
    height: 100%;
    max-height: 100vh;
    background: var(--bg-primary);
    border-left: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    overflow: hidden;
  }

  .right-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    border-left: none;
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

  .metadata-mode,
  .threads-mode {
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
