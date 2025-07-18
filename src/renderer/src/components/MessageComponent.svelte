<script lang="ts">
  import type { Message } from '../services/types';
  import ToolCallComponent from './ToolCallComponent.svelte';

  interface Props {
    message: Message;
    onNoteClick?: (noteId: string) => void;
  }

  let { message, onNoteClick }: Props = $props();

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Parse message text to find note references
  function parseMessageText(
    text: string
  ): Array<{ type: 'text' | 'note'; content: string; noteId?: string }> {
    const parts: Array<{ type: 'text' | 'note'; content: string; noteId?: string }> = [];

    // Regex to match note references in various formats:
    // [[note-id]] or [[note-id|display text]] or [note-id] or note.md
    const noteRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]|(\b[\w-]+\.md\b)/g;

    let lastIndex = 0;
    let match;

    while ((match = noteRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      // Determine note ID and display text
      let noteId: string;
      let displayText: string;

      if (match[1]) {
        // [[note-id]] or [[note-id|display text]] format
        noteId = match[1];
        displayText = match[2] || match[1];
      } else if (match[3]) {
        // [note-id] format
        noteId = match[3];
        displayText = match[3];
      } else if (match[4]) {
        // note.md format
        noteId = match[4];
        displayText = match[4];
      } else {
        continue;
      }

      parts.push({
        type: 'note',
        content: displayText,
        noteId
      });

      lastIndex = noteRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    return parts;
  }

  function handleNoteClick(noteId: string): void {
    onNoteClick?.(noteId);
  }
</script>

<div
  class="message"
  class:user={message.sender === 'user'}
  class:agent={message.sender === 'agent'}
>
  <div class="message-header">
    <span class="sender">[{message.sender === 'user' ? 'User' : 'Agent'}]</span>
    <span class="timestamp">{formatTime(message.timestamp)}</span>
  </div>
  {#if message.text.trim()}
    <div class="message-content">
      {#each parseMessageText(message.text) as part, index (index)}
        {#if part.type === 'text'}
          {part.content}
        {:else if part.type === 'note'}
          <button
            class="note-link"
            onclick={() => handleNoteClick(part.noteId!)}
            title="Click to open note"
          >
            {part.content}
          </button>
        {/if}
      {/each}
    </div>
  {/if}

  {#if message.toolCalls && message.toolCalls.length > 0}
    <div class="tool-calls">
      {#each message.toolCalls as toolCall (toolCall.id)}
        <ToolCallComponent {toolCall} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .message {
    max-width: 85%;
    padding: 0;
    margin-bottom: 0;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message.user {
    align-self: flex-end;
  }

  .message.agent {
    align-self: flex-start;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    transition: color 0.2s ease;
  }

  .message.user .message-header {
    flex-direction: row-reverse;
    gap: 0.5rem;
  }

  .sender {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .timestamp {
    font-size: 0.75rem;
    font-weight: 400;
  }

  .message-content {
    background: var(--message-agent-bg);
    padding: 1rem 1.25rem;
    border-radius: 1rem;
    line-height: 1.6;
    white-space: pre-wrap;
    font-size: 0.875rem;
    color: var(--message-agent-text);
    box-shadow: 0 1px 2px 0 var(--shadow-light);
    border: 1px solid var(--message-agent-border);
    transition: all 0.2s ease;
  }

  .message.user .message-content {
    background: var(--message-user-bg);
    color: var(--message-user-text);
    border: 1px solid var(--accent-hover);
    border-radius: 1rem 1rem 0.25rem 1rem;
  }

  .message.agent .message-content {
    border-radius: 1rem 1rem 1rem 0.25rem;
  }

  .tool-calls {
    margin-top: 0.75rem;
  }

  .message.user .tool-calls {
    margin-right: 0;
  }

  .message.agent .tool-calls {
    margin-left: 0;
  }

  .note-link {
    background: var(--accent-secondary);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    padding: 0.125rem 0.375rem;
    margin: 0 0.125rem;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .note-link:hover {
    background: var(--accent-primary);
    color: var(--accent-text);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .note-link:active {
    transform: translateY(0);
  }
</style>
