<script lang="ts">
  import type { Message } from '../services/types';

  let { message }: { message: Message } = $props();

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  <div class="message-content">
    {message.text}
  </div>
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
</style>
