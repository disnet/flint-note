<script lang="ts">
  import MessageComponent from './MessageComponent.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import AgentControlBar from './AgentControlBar.svelte';
  import ContextUsageBar from './ContextUsageBar.svelte';
  import type { Message, ContextUsage } from '../services/types';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';

  interface Props {
    messages: Message[];
    isLoading?: boolean;
    onNoteClick?: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
  }

  let { messages, isLoading = false, onNoteClick, onSendMessage }: Props = $props();

  let contextUsage = $state<ContextUsage | null>(null);

  let chatContainer = $state<HTMLDivElement>();
  let expandedDiscussed = $state<boolean>(true);

  // Fetch context usage when conversation changes or messages change
  $effect(() => {
    if (unifiedChatStore.activeThreadId && messages.length > 0) {
      updateContextUsage();
    }
  });

  async function updateContextUsage(): Promise<void> {
    try {
      const usage = await window.api?.getContextUsage({
        conversationId: unifiedChatStore.activeThreadId ?? undefined
      });
      contextUsage = usage || null;
    } catch (error) {
      console.error('Failed to get context usage:', error);
      contextUsage = null;
    }
  }

  function handleContextWarningClick(): void {
    unifiedChatStore.createThread();
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
  <!-- Agent Control Bar -->
  <AgentControlBar />

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
    {#if contextUsage && messages.length > 0}
      <ContextUsageBar {contextUsage} onWarningClick={handleContextWarningClick} />
    {/if}
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

  <!-- Message Input Area -->
  <div class="input-section">
    <MessageInput onSend={onSendMessage || (() => {})} />
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

  /* Removed header styles as requested */

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

  .discussed-notes::-webkit-scrollbar {
    width: 6px;
  }

  .discussed-notes::-webkit-scrollbar-track {
    background: transparent;
  }

  .discussed-notes::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .discussed-notes::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
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

  /* Input Section Styles */
  .input-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
  }
</style>
