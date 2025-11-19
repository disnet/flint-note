<script lang="ts">
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import AgentControlBar from './AgentControlBar.svelte';
  import TodoPlanWidget from './TodoPlanWidget.svelte';
  import ToolCallLimitWidget from './ToolCallLimitWidget.svelte';
  import ConversationStartWorkflowPanel from './ConversationStartWorkflowPanel.svelte';
  import ThreadListView from './ThreadListView.svelte';
  import type { Message, ContextUsage } from '../services/types';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import { TodoPlanStore } from '../stores/todoPlanStore.svelte';

  interface Props {
    messages: Message[];
    isLoading?: boolean;
    onNoteClick?: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
    onCancelMessage?: () => void;
    toolCallLimitReached?: { stepCount: number; maxSteps: number } | null;
    onToolCallLimitContinue?: () => void;
    onToolCallLimitStop?: () => void;
    refreshCredits?: () => Promise<void>;
    onViewWorkflows?: () => void;
  }

  let {
    messages,
    isLoading = false,
    onNoteClick,
    onSendMessage,
    onCancelMessage,
    toolCallLimitReached,
    onToolCallLimitContinue,
    onToolCallLimitStop,
    refreshCredits = $bindable(),
    onViewWorkflows
  }: Props = $props();

  let contextUsage = $state<ContextUsage | null>(null);
  let showingThreadListView = $state(false);
  let previousThreadId = $state<string | null>(null);

  // Todo plan store
  const todoPlanStore = new TodoPlanStore();

  // Get current draft from active thread
  let currentDraft = $derived(unifiedChatStore.activeThread?.draftText ?? '');

  // Handle draft changes from MessageInput
  function handleDraftChange(text: string): void {
    const thread = unifiedChatStore.activeThread;
    if (thread) {
      // Only update if draft actually changed to avoid unnecessary saves
      const newDraft = text.length === 0 ? undefined : text;
      if (thread.draftText !== newDraft) {
        unifiedChatStore.updateThread(thread.id, {
          draftText: newDraft
        });
      }
    }
  }

  // Track the active thread ID to detect changes (not reactive to avoid circular dependencies)
  let lastThreadId: string | null = null;
  let updateTimeoutId: number | null = null;
  // Request counter for deduplication (not reactive to avoid triggering effects)
  let requestCounter = 0;

  // Monitor todo plan for active thread
  $effect(() => {
    const currentThreadId = unifiedChatStore.activeThreadId;

    if (currentThreadId) {
      todoPlanStore.startMonitoring(currentThreadId);
    } else {
      todoPlanStore.stopMonitoring();
    }

    return () => {
      todoPlanStore.stopMonitoring();
    };
  });

  // Fetch context usage when conversation changes or messages change
  // Use a simpler approach: track the active thread object directly
  $effect(() => {
    const currentThreadId = unifiedChatStore.activeThreadId;
    const currentThread = unifiedChatStore.activeThread;

    // Clear context usage when switching threads
    if (currentThreadId !== lastThreadId) {
      contextUsage = null;
      lastThreadId = currentThreadId;
      // Cancel any pending updates
      if (updateTimeoutId !== null) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
    }

    // Only update if we have a thread with messages
    if (currentThread && currentThread.messages.length > 0) {
      // Access the messages array and its length to make this reactive
      const messageCount = currentThread.messages.length;
      const lastActivity = currentThread.lastActivity;

      // Make dependencies explicit
      void messageCount;
      void lastActivity;

      // Debounce the update - cancel previous pending update
      if (updateTimeoutId !== null) {
        clearTimeout(updateTimeoutId);
      }

      // Capture threadId outside to avoid reactive reads in timeout
      const threadIdForUpdate = currentThreadId;

      // Schedule update after 500ms of no changes
      updateTimeoutId = window.setTimeout(() => {
        updateContextUsage(threadIdForUpdate);
        updateTimeoutId = null;
      }, 500);
    }
  });

  // Periodically update context usage during loading (for streaming)
  $effect(() => {
    let intervalId: number | null = null;

    if (isLoading) {
      // Capture the current thread ID to avoid reactive reads in interval
      const threadIdForUpdates = unifiedChatStore.activeThreadId;

      // Update every 3 seconds while loading
      intervalId = window.setInterval(() => {
        updateContextUsage(threadIdForUpdates);
      }, 3000);
    }

    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  });

  async function updateContextUsage(conversationId?: string | null): Promise<void> {
    // Increment request counter to track this specific request
    const thisRequestId = ++requestCounter;

    try {
      const usage = await window.api?.getContextUsage({
        conversationId: conversationId ?? undefined
      });

      // Only update if this is still the most recent request
      if (thisRequestId === requestCounter) {
        contextUsage = usage || null;
      }
    } catch (error) {
      // Only update error state if this is still the most recent request
      if (thisRequestId === requestCounter) {
        console.error('Failed to get context usage:', error);
        contextUsage = null;
      }
    }
  }

  function handleContextWarningClick(): void {
    unifiedChatStore.createThread();
  }

  function handleExecuteWorkflow(workflowId: string, _workflowName: string): void {
    // Send a message to execute the workflow
    const message = `Execute routine: ${workflowId}`;
    onSendMessage?.(message);
  }

  function handleShowAllThreads(): void {
    previousThreadId = unifiedChatStore.activeThreadId;
    showingThreadListView = true;
  }

  function handleBackFromThreadList(): void {
    showingThreadListView = false;
    // Return to the previous thread if it was set
    if (previousThreadId && unifiedChatStore.activeThreadId !== previousThreadId) {
      unifiedChatStore.switchToThread(previousThreadId);
    }
  }

  async function handleNewThreadFromList(): Promise<void> {
    await unifiedChatStore.createThread();
    showingThreadListView = false;
  }

  function handleSelectThreadFromList(threadId: string): void {
    unifiedChatStore.switchToThread(threadId);
    showingThreadListView = false;
  }
</script>

<ConversationContainer autoScroll={true}>
  {#snippet header()}
    {#if !showingThreadListView}
      <!-- Agent Control Bar -->
      <AgentControlBar onShowAll={handleShowAllThreads} />

      <!-- Todo Plan Widget -->
      {#if todoPlanStore.activePlan}
        <div class="todo-plan-section">
          <TodoPlanWidget plan={todoPlanStore.activePlan} />
        </div>
      {/if}
    {/if}
  {/snippet}

  {#snippet content()}
    {#if showingThreadListView}
      <ThreadListView
        onBack={handleBackFromThreadList}
        onNewThread={handleNewThreadFromList}
        onSelectThread={handleSelectThreadFromList}
      />
    {:else}
      <div class="chat-messages">
        {#if messages.length === 0 && !isLoading}
          <!-- Show workflow panel when starting a fresh conversation -->
          <ConversationStartWorkflowPanel
            onExecuteWorkflow={handleExecuteWorkflow}
            onViewAll={onViewWorkflows}
            {onSendMessage}
          />
        {/if}
        {#each messages as message (message.id)}
          <ConversationMessage
            content={message.text}
            role={message.sender}
            variant="bubble"
            toolCalls={message.toolCalls}
            currentStepIndex={message.currentStepIndex}
            {onNoteClick}
          />
        {/each}
        {#if isLoading}
          <LoadingMessage />
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet controls()}
    {#if !showingThreadListView}
      <!-- Tool Call Limit Widget -->
      {#if toolCallLimitReached}
        <div class="tool-call-limit-section">
          <ToolCallLimitWidget
            stepCount={toolCallLimitReached.stepCount}
            maxSteps={toolCallLimitReached.maxSteps}
            onContinue={onToolCallLimitContinue || (() => {})}
            onStop={onToolCallLimitStop || (() => {})}
          />
        </div>
      {/if}

      <!-- Message Input Area -->
      <div class="input-section">
        <MessageInput
          onSend={onSendMessage || (() => {})}
          {contextUsage}
          onStartNewThread={handleContextWarningClick}
          {isLoading}
          onCancel={onCancelMessage}
          bind:refreshCredits
          initialText={currentDraft}
          onDraftChange={handleDraftChange}
        />
      </div>
    {/if}
  {/snippet}
</ConversationContainer>

<style>
  /* Todo Plan Section */
  .todo-plan-section {
    padding: 0 1.25rem;
  }

  /* Chat Messages */
  .chat-messages {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.5rem;
    min-height: 100%;
  }

  /* Tool Call Limit Section */
  .tool-call-limit-section {
    padding: 0 1.25rem 1rem;
  }

  /* Input Section Styles */
  .input-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
  }
</style>
