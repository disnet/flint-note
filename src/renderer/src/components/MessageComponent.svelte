<script lang="ts">
  import type { Message } from '../services/types';
  import ToolCallComponent from './ToolCallComponent.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  interface Props {
    message: Message;
    onNoteClick?: (noteId: string) => void;
  }

  let { message, onNoteClick }: Props = $props();
</script>

<div
  class="message"
  class:user={message.sender === 'user'}
  class:agent={message.sender === 'agent'}
>
  {#if message.toolCalls && message.toolCalls.length > 0}
    <div class="tool-calls">
      {#each message.toolCalls as toolCall (toolCall.id)}
        <ToolCallComponent {toolCall} />
      {/each}
    </div>
  {/if}

  {#if message.text.trim()}
    <div class="message-content">
      <MarkdownRenderer text={message.text} {onNoteClick} />
    </div>
  {/if}
</div>

<style>
  .message {
    /*max-width: 85%;*/
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

  /*.message.user {
    align-self: flex-end;
  }

  .message.agent {
    align-self: flex-start;
  }*/

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
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    line-height: 1.6;
    font-size: 0.875rem;
    color: var(--message-agent-text);
    /*box-shadow: 0 1px 2px 0 var(--shadow-light);*/
    border: 1px solid var(--message-agent-border);
    transition: all 0.2s ease;
  }

  .message.user .message-content {
    background: var(--bg-secondary);
    /*color: var(--message-user-text);*/
    /*border: 1px solid var(--accent-hover);*/
    /*border-radius: 1rem 1rem 0.25rem 1rem;*/
  }

  .message.agent .message-content {
    border: 0;
    box-shadow: 0;
    /*border-radius: 1rem 1rem 1rem 0.25rem;*/
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
</style>
