<script lang="ts">
  import MessageComponent from './MessageComponent.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import type { Message, ToolCall } from '../services/types';

  interface AITask {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'completed';
    description?: string;
    toolCalls?: ToolCall[];
    relatedNotes?: string[];
  }

  interface Props {
    messages: Message[];
    isLoading?: boolean;
    onNoteClick?: (noteId: string) => void;
    onSendMessage?: (text: string) => void;
  }

  let { messages, isLoading = false, onNoteClick, onSendMessage }: Props = $props();

  let chatContainer: HTMLDivElement;
  let expandedTasks = $state<Set<string>>(new Set());
  let expandedDiscussed = $state<boolean>(true);

  // All note-related tool call names that should create tasks
  const noteRelatedTools = [
    'create_note',
    'get_note',
    'get_notes',
    'update_note',
    'delete_note',
    'rename_note',
    'move_note',
    'search_notes',
    'search_notes_advanced',
    'create_note_type',
    'list_note_types',
    'get_note_type_info',
    'update_note_type',
    'delete_note_type',
    'get_current_vault',
    'list_vaults',
    'get_note_links',
    'get_backlinks',
    'find_broken_links'
  ];

  // Extract tasks from messages with tool calls
  const tasks = $derived.by<AITask[]>(() => {
    const taskMap = new Map<string, AITask>();

    messages.forEach((message) => {
      if (message.sender === 'agent' && message.toolCalls) {
        message.toolCalls.forEach((toolCall) => {
          if (noteRelatedTools.includes(toolCall.name)) {
            const taskId = toolCall.id;
            const existingTask = taskMap.get(taskId);

            taskMap.set(taskId, {
              id: taskId,
              title: toolCall.name.replace(/_/g, ' '),
              status: toolCall.result
                ? 'completed'
                : toolCall.error
                  ? 'pending'
                  : 'in_progress',
              description: formatTaskDescription(
                toolCall.result || toolCall.error || 'Processing...'
              ),
              toolCalls: [toolCall],
              relatedNotes: extractNotesFromText(toolCall.result || ''),
              ...existingTask
            });
          }
        });
      }
    });

    const finalTasks = Array.from(taskMap.values()).sort((a, b) => {
      // Sort by status: in_progress, pending, completed
      const statusOrder = { in_progress: 0, pending: 1, completed: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    return finalTasks;
  });

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
    const matches = [];
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

  function formatTaskDescription(description: unknown): string {
    if (typeof description === 'string') {
      // Check if the string is already JSON, and if so, format it nicely
      try {
        const parsed = JSON.parse(description);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, return as-is
        return description;
      }
    }
    if (typeof description === 'object' && description !== null) {
      try {
        return JSON.stringify(description, null, 2);
      } catch {
        return String(description);
      }
    }
    return String(description);
  }

  function toggleTask(taskId: string): void {
    const newSet = new Set(expandedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    expandedTasks = newSet;
  }

  function getTaskIcon(status: AITask['status']): string {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '⟳';
      case 'pending':
        return '○';
      default:
        return '○';
    }
  }

  $effect(() => {
    if (chatContainer && (messages.length > 0 || isLoading)) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  });
</script>

<div class="ai-assistant">
  <!-- Task Management Section -->
  {#if tasks.length > 0}
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
  {/if}

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

  .section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Task Management Styles */
  .tasks-section {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .task-list {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-item {
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .task-item.completed {
    background: var(--bg-tertiary);
    opacity: 0.8;
  }

  .task-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .task-header:hover {
    background: var(--bg-tertiary);
  }

  .task-icon {
    margin-right: 0.75rem;
    font-size: 1rem;
    font-weight: bold;
    color: var(--text-secondary);
  }

  .task-icon.completed {
    color: var(--accent-primary);
  }

  .task-title {
    flex: 1;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .expand-icon {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transform: rotate(-90deg);
    transition: transform 0.2s ease;
  }

  .expand-icon.expanded {
    transform: rotate(0deg);
  }

  .task-details {
    padding: 0 0.75rem 0.75rem;
    border-top: 1px solid var(--border-light);
  }

  .task-description {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    padding: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
  }

  .task-description::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .task-description::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }

  .task-description::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .task-description::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.5);
  }

  .task-notes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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
    gap: 1.5rem;
  }

  .chat-section > :last-child {
    margin-bottom: 0.5rem; /* Ensure last message isn't cut off */
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
    flex-direction: column;
    gap: 0.5rem;
  }

  .note-link {
    display: inline-flex;
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
