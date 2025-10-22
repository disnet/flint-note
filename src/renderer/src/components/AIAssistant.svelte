<script lang="ts">
  import MessageComponent from './MessageComponent.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import AgentControlBar from './AgentControlBar.svelte';
  import TodoPlanWidget from './TodoPlanWidget.svelte';
  import ToolCallLimitWidget from './ToolCallLimitWidget.svelte';
  import ConversationStartWorkflowPanel from './ConversationStartWorkflowPanel.svelte';
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

  let chatContainer = $state<HTMLDivElement>();

  // Todo plan store
  const todoPlanStore = new TodoPlanStore();

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

  function handleExecuteWorkflow(_workflowId: string, workflowName: string): void {
    // Send a message to execute the workflow
    const message = `Execute workflow: ${workflowName}`;
    onSendMessage?.(message);
  }

  $effect(() => {
    if (chatContainer && (messages.length > 0 || isLoading)) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      });
    }
  });

  // Additional effect to handle scrolling during message streaming
  $effect(() => {
    if (chatContainer && messages.length > 0) {
      // Scroll to bottom when message text changes (streaming)
      requestAnimationFrame(() => {
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      });
    }
  });
</script>

<div class="ai-assistant">
  <!-- Agent Control Bar -->
  <AgentControlBar />

  <!-- Todo Plan Widget -->
  {#if todoPlanStore.activePlan}
    <div class="todo-plan-section">
      <TodoPlanWidget plan={todoPlanStore.activePlan} />
    </div>
  {/if}

  <!-- Removed header section as requested -->
  <!-- Task Management Section -->
  <!-- {#if tasks.length > 0}
    <div class="tasks-section">
      <h4 class="section-title">Tasks</h4>
      <div class="task-list">
        {#each tasks as task (task.id)}
          <div class="task-item" class:completed={task.status === 'completed'}>
            <button
              class="task-header"
              onclick={() => toggleTask(task.id)}
              aria-expanded={expandedTasks.has(task.id)}
            >
              <span class="task-icon" class:completed={task.status === 'completed'}>
                {getTaskIcon(task.status)}
              </span>
              <span class="task-title">{task.title}</span>
              <span class="expand-icon" class:expanded={expandedTasks.has(task.id)}>
                ▼
              </span>
            </button>
            {#if expandedTasks.has(task.id) && task.description}
              <div class="task-details">
                <pre class="task-description">{task.description}</pre>
                {#if task.relatedNotes && task.relatedNotes.length > 0}
                  <div class="task-notes">
                    {#each task.relatedNotes as note (note)}
                      {@const parsed = parseNoteDisplay(note)}
                      <button
                        class="note-link"
                        onclick={() => onNoteClick?.(parsed.identifier)}
                      >
                        {parsed.displayName}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if} -->

  <!-- Chat Messages Section -->
  <div class="chat-section" bind:this={chatContainer}>
    {#if messages.length === 0 && !isLoading}
      <!-- Show workflow panel when starting a fresh conversation -->
      <ConversationStartWorkflowPanel
        onExecuteWorkflow={handleExecuteWorkflow}
        onViewAll={onViewWorkflows}
      />
    {/if}
    {#each messages as message (message.id)}
      <MessageComponent {message} {onNoteClick} />
    {/each}
    {#if isLoading}
      <LoadingMessage />
    {/if}
  </div>

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
    />
  </div>
</div>

<style>
  .ai-assistant {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 100%;
    min-height: 0; /* Important for flexbox children to respect parent height */
    overflow: hidden;
  }

  /* Todo Plan Section */
  .todo-plan-section {
    padding: 0 1.25rem;
    flex-shrink: 0;
  }

  /* Chat Section Styles */
  .chat-section {
    flex: 1;
    min-height: 0; /* Important for flex item to scroll properly */
    max-height: 100%; /* Force height constraint */
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Tool Call Limit Section */
  .tool-call-limit-section {
    padding: 0 1.25rem 1rem;
    flex-shrink: 0;
  }

  .chat-section::-webkit-scrollbar {
    width: 8px;
  }

  .chat-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-section::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .chat-section::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Input Section Styles */
  .input-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
  }
</style>
