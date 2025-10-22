<script lang="ts">
  import AIAssistant from './AIAssistant.svelte';
  import ThreadList from './ThreadList.svelte';
  import SidebarNotes from './SidebarNotes.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { Message } from '../services/types';

  interface Props {
    messages: Message[];
    isLoading: boolean;
    onNoteClick: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
    onCancelMessage?: () => void;
    toolCallLimitReached?: { stepCount: number; maxSteps: number } | null;
    onToolCallLimitContinue?: () => void;
    onToolCallLimitStop?: () => void;
    onViewWorkflows?: () => void;
    refreshCredits?: () => Promise<void>;
  }

  let {
    messages,
    isLoading,
    onNoteClick,
    onSendMessage,
    onCancelMessage,
    toolCallLimitReached,
    onToolCallLimitContinue,
    onToolCallLimitStop,
    onViewWorkflows,
    refreshCredits = $bindable()
  }: Props = $props();

  // Width state - track local width during resize
  let localWidth = $state<number | null>(null);

  // Use store width when not actively resizing
  let currentWidth = $derived(localWidth ?? sidebarState.rightSidebar.width);

  function handleResize(width: number): void {
    localWidth = width;

    // Debounce persisting to storage during resize
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      sidebarState.setRightSidebarWidth(width);
      localWidth = null; // Reset to use store value
    }, 300);
  }

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
</script>

<div
  class="right-sidebar"
  class:visible={sidebarState.rightSidebar.visible}
  style="--sidebar-width: {currentWidth}px"
>
  <ResizeHandle side="right" onResize={handleResize} minWidth={300} maxWidth={800} />
  <div class="sidebar-inner">
    {#if sidebarState.rightSidebar.mode === 'ai'}
      <div class="ai-mode">
        <AIAssistant
          {messages}
          {isLoading}
          {onNoteClick}
          {onSendMessage}
          {onCancelMessage}
          {toolCallLimitReached}
          {onToolCallLimitContinue}
          {onToolCallLimitStop}
          {onViewWorkflows}
          bind:refreshCredits
        />
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
    {:else if sidebarState.rightSidebar.mode === 'notes'}
      <div class="notes-mode">
        <SidebarNotes />
      </div>
    {/if}
  </div>
</div>

<style>
  .right-sidebar {
    position: relative;
    height: 100%;
    max-height: 100vh;
    background: var(--bg-primary);
    border-left: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    flex-shrink: 0;
    overflow: hidden;
  }

  .right-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    border-left: none;
  }

  .sidebar-inner {
    flex: 1;
    min-height: 0;
    min-width: 0;
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

  .threads-mode {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .notes-mode {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
