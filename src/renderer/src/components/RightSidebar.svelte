<script lang="ts">
  import AIAssistant from './AIAssistant.svelte';
  import ThreadList from './ThreadList.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { Message } from '../services/types';

  interface Props {
    messages: Message[];
    isLoading: boolean;
    onNoteClick: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
  }

  let { messages, isLoading, onNoteClick, onSendMessage }: Props = $props();
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
    {/if}
  </div>
</div>

<style>
  .right-sidebar {
    height: 100%;
    max-height: 100vh;
    background: var(--bg-primary);
    border-left: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    width: 450px;
    min-width: 450px;
    flex-shrink: 0;
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
    width: 450px;
    min-width: 450px;
  }

  .ai-mode {
    flex: 1;
    min-height: 0; /* Critical for proper flexbox height constraint */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .threads-mode {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
