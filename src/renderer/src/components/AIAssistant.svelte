<script lang="ts">
  import MessageComponent from './MessageComponent.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import ConversationHistory from './ConversationHistory.svelte';
  import ThreadSwitcher from './ThreadSwitcher.svelte';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import type { Message } from '../services/types';

  interface Props {
    messages: Message[];
    isLoading?: boolean;
    onNoteClick?: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
  }

  let { messages, isLoading = false, onNoteClick, onSendMessage }: Props = $props();

  let chatContainer = $state<HTMLDivElement>();
  let expandedDiscussed = $state<boolean>(true);
  let expandedCost = $state<boolean>(false);
  let showHistory = $state<boolean>(false);

  // Get active conversation for cost information (using backward compatibility)
  const activeConversation = $derived(unifiedChatStore.activeConversation);

  function toggleHistory(): void {
    showHistory = !showHistory;
  }

  async function handleConversationSelect(conversationId: string): Promise<void> {
    await unifiedChatStore.switchToConversation(conversationId);
    showHistory = false; // Close history after selection
  }

  async function handleNewConversation(): Promise<void> {
    await unifiedChatStore.startNewConversation();
    showHistory = false; // Close history after creating new conversation
  }

  // Extract notes discussed from messages
  const notesDiscussed = $derived.by<string[]>(() => {
    const noteSet = new Set<string>();
    messages.forEach((message) => {
      const wikilinks = extractNotesFromText(message.text);
      wikilinks.forEach((note) => noteSet.add(note));
    });
    return Array.from(noteSet);
  });

  function extractNotesFromText(text: string): string[] {
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const matches: string[] = [];
    let match;
    while ((match = wikiLinkRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  function parseNoteDisplay(noteRef: string): {
    identifier: string;
    displayName: string;
  } {
    // Check if it's in the format "identifier|title"
    const pipeIndex = noteRef.indexOf('|');
    if (pipeIndex !== -1) {
      return {
        identifier: noteRef.substring(0, pipeIndex).trim(),
        displayName: noteRef.substring(pipeIndex + 1).trim()
      };
    } else {
      // Format: just title/identifier - use same for both
      return {
        identifier: noteRef.trim(),
        displayName: noteRef.trim()
      };
    }
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
  <div class="assistant-header">
    <div class="thread-switcher-container">
      <ThreadSwitcher
        onNewThread={handleNewConversation}
        onThreadSwitch={(threadId) => handleConversationSelect(threadId)}
      />
    </div>
    <div class="header-actions">
      <button
        class="history-btn"
        class:active={showHistory}
        onclick={toggleHistory}
        title="Conversation history"
        aria-label="Toggle conversation history"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 3v18h18" />
          <path d="M3 9h18" />
          <path d="M9 3v18" />
        </svg>
      </button>
    </div>
  </div>

  {#if showHistory}
    <div class="history-panel">
      <ConversationHistory
        onConversationSelect={handleConversationSelect}
        onNewConversation={handleNewConversation}
      />
    </div>
  {:else}
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
      {#each messages as message (message.id)}
        <MessageComponent {message} {onNoteClick} />
      {/each}
      {#if isLoading}
        <LoadingMessage />
      {/if}
    </div>

    <!-- Notes Discussed Section -->
    {#if notesDiscussed.length > 0}
      <div class="discussed-section">
        <button
          class="section-header"
          onclick={() => (expandedDiscussed = !expandedDiscussed)}
          aria-expanded={expandedDiscussed}
        >
          <h4 class="section-title">Notes discussed</h4>
          <span class="expand-icon" class:expanded={expandedDiscussed}>▼</span>
        </button>
        {#if expandedDiscussed}
          <div class="discussed-notes">
            {#each notesDiscussed as note (note)}
              {@const parsed = parseNoteDisplay(note)}
              <button class="note-link" onclick={() => onNoteClick?.(parsed.identifier)}>
                {parsed.displayName}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cost Summary Section -->
    {#if activeConversation?.costInfo && activeConversation.costInfo.totalCost > 0}
      <div class="cost-section">
        <button
          class="section-header"
          onclick={() => (expandedCost = !expandedCost)}
          aria-expanded={expandedCost}
        >
          <h4 class="section-title">Conversation Cost</h4>
          <span class="expand-icon" class:expanded={expandedCost}>▼</span>
        </button>
        {#if expandedCost}
          <div class="cost-details">
            <div class="cost-total">
              Total: ${(activeConversation.costInfo.totalCost / 100).toFixed(4)}
            </div>
            <div class="cost-breakdown">
              <div class="token-stats">
                <div class="token-row">
                  <span>Input tokens:</span>
                  <span>{activeConversation.costInfo.inputTokens.toLocaleString()}</span>
                </div>
                <div class="token-row">
                  <span>Output tokens:</span>
                  <span>{activeConversation.costInfo.outputTokens.toLocaleString()}</span>
                </div>
                {#if activeConversation.costInfo.cachedTokens > 0}
                  <div class="token-row">
                    <span>Cached tokens:</span>
                    <span
                      >{activeConversation.costInfo.cachedTokens.toLocaleString()}</span
                    >
                  </div>
                {/if}
              </div>
              <div class="request-stats">
                <div class="stat-row">
                  <span>Requests:</span>
                  <span>{activeConversation.costInfo.requestCount}</span>
                </div>
                <div class="stat-row">
                  <span>Last updated:</span>
                  <span
                    >{activeConversation.costInfo.lastUpdated.toLocaleTimeString()}</span
                  >
                </div>
              </div>
            </div>

            {#if activeConversation.costInfo.modelUsage.length > 1}
              <div class="model-breakdown">
                <h5>Cost by Model:</h5>
                {#each activeConversation.costInfo.modelUsage as model (model.model)}
                  <div class="model-cost-row">
                    <span class="model-name">{model.model.split('/').pop()}</span>
                    <span class="model-cost-value">${(model.cost / 100).toFixed(4)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Message Input Area -->
    <div class="input-section">
      <MessageInput onSend={onSendMessage || (() => {})} />
    </div>
  {/if}
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

  .assistant-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .thread-switcher-container {
    flex: 1;
    min-width: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .history-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .history-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .history-btn.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .history-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
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

  .chat-section::-webkit-scrollbar {
    width: 8px;
  }

  .chat-section::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  .chat-section::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .chat-section::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.5);
  }

  /* Notes Discussed Styles */
  .discussed-section {
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    padding: 0;
  }

  .discussed-notes {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .note-link {
    display: inline-block;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 25ch;
  }

  .note-link:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  /* Cost Section Styles */
  .cost-section {
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .cost-details {
    margin-top: 0.75rem;
  }

  .cost-total {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--accent-primary);
    margin-bottom: 0.75rem;
  }

  .cost-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .token-stats,
  .request-stats {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .token-row,
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
  }

  .token-row span:first-child,
  .stat-row span:first-child {
    color: var(--text-secondary);
  }

  .token-row span:last-child,
  .stat-row span:last-child {
    font-weight: 500;
    color: var(--text-primary);
  }

  .model-breakdown {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light);
  }

  .model-breakdown h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .model-cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
  }

  .model-name {
    color: var(--text-secondary);
    font-size: 0.8rem;
    text-transform: capitalize;
  }

  .model-cost-value {
    font-weight: 500;
    color: var(--accent-primary);
    font-size: 0.875rem;
  }

  /* Input Section Styles */
  .input-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
  }
</style>
