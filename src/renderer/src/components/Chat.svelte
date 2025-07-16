<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { conversationStore } from '../lib/conversation/stores';
  import { conversationManager } from '../lib/conversation/ConversationManager';
  import type { NoteReference } from '../types/chat';
  import MessageContent from './MessageContent.svelte';
  import ToolCallWidget from './ToolCallWidget.svelte';
  import SlashCommands from './SlashCommands.svelte';

  let inputValue = $state('');
  let chatContainer: HTMLElement;
  let inputElement: HTMLTextAreaElement;

  const { messages, status, error, streamingResponse, toolCalls } = $derived(conversationStore);

  const handleSendMessage = async (): Promise<void> => {
    if (!inputValue.trim()) return;
    const userInput = inputValue;
    inputValue = '';
    await conversationManager.sendMessage(userInput);
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement;
    inputValue = target.value;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 8 * 24) + 'px';
  };

  const handleNoteOpen = (note: NoteReference): void => {
    console.log('Note clicked:', note);
    // Implement note opening logic here
  };

  // Auto-scroll to bottom
  $effect(() => {
    if (chatContainer) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);
    }
  });

  onMount(() => {
    if (inputElement) inputElement.focus();
    conversationManager.initialize();
  });
</script>

<div class="chat-container">
  <div class="messages-container" bind:this={chatContainer}>
    {#each messages as message (message.id)}
      <div class="message message-{message.type}">
        {#if message.content}
          <div class="message-content">
            <MessageContent
              content={message.content}
              messageType={message.type}
              openNote={handleNoteOpen}
            />
          </div>
        {/if}
        {#if message.toolCalls && message.toolCalls.length > 0}
          <ToolCallWidget toolCalls={message.toolCalls} />
        {/if}
        <div class="message-timestamp">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    {/each}

    {#if status === 'streaming' && streamingResponse}
      <div class="message message-agent">
        <div class="message-content">
          <MessageContent
            content={streamingResponse}
            messageType="agent"
            openNote={handleNoteOpen}
          />
        </div>
      </div>
    {/if}

    {#if status === 'awaitingToolResult'}
      <div class="message message-agent">
        <div class="message-content">
          <div class="generating-response-indicator">
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="generating-text">Executing tools...</span>
          </div>
        </div>
      </div>
    {/if}

    {#if status === 'generatingFinalResponse'}
      <div class="message message-agent">
        <div class="message-content">
          <div class="generating-response-indicator">
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="generating-text">Generating response...</span>
          </div>
        </div>
      </div>
    {/if}

    {#if status === 'error'}
      <div class="message message-system">
        <div class="message-content">
          <p>Sorry, an error occurred:</p>
          <p>{error}</p>
        </div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        id="chat-input"
        bind:this={inputElement}
        bind:value={inputValue}
        onkeydown={handleKeyDown}
        oninput={handleInput}
        placeholder="Type your message..."
        rows="1"
        class="chat-input"
        style="height: auto; min-height: 2.5rem;"
        disabled={status !== 'idle' && status !== 'error'}
      ></textarea>
      <button
        onclick={handleSendMessage}
        disabled={!inputValue.trim() || (status !== 'idle' && status !== 'error')}
        class="send-button"
        aria-label="Send message"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 100%;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    scroll-behavior: smooth;
  }

  .message {
    margin-bottom: 1rem;
    max-width: 80%;
    word-wrap: break-word;
  }

  .message-user {
    margin-left: auto;
  }

  .message-agent,
  .message-system {
    margin-right: auto;
  }

  .message-content {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .message-user .message-content {
    background-color: #007bff;
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .message-agent .message-content {
    background-color: #f8f9fa;
    color: #333;
    border: 1px solid #dee2e6;
    border-bottom-left-radius: 0.25rem;
  }

  .message-system .message-content {
    background-color: #e9ecef;
    color: #6c757d;
    font-style: italic;
    text-align: center;
  }

  .message-timestamp {
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 0.25rem;
    text-align: right;
  }

  .message-agent .message-timestamp,
  .message-system .message-timestamp {
    text-align: left;
  }

  .typing-indicator {
    background-color: #f8f9fa !important;
    border: 1px solid #dee2e6 !important;
    padding: 0.75rem 1rem !important;
  }

  .typing-dots {
    display: flex;
    gap: 0.25rem;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #6c757d;
    animation: typing 1.4s infinite ease-in-out;
  }

  .typing-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 0s;
  }

  .generating-response-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #6c757d;
    font-style: italic;
  }

  .generating-text {
    font-size: 0.875rem;
  }

  @keyframes typing {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  .input-area {
    padding: 1rem;
    border-top: 1px solid #dee2e6;
    background-color: white;
  }

  .input-wrapper {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    max-width: 100%;
  }

  .chat-input {
    flex: 1;
    resize: none;
    border: 1px solid #dee2e6;
    border-radius: 1rem;
    padding: 0.75rem 1rem;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.4;
    min-height: 2.5rem;
    max-height: 8rem;
    overflow-y: auto;
    outline: none;
    transition: border-color 0.2s;
  }

  .chat-input:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .send-button {
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 50%;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .send-button:hover:not(:disabled) {
    background-color: #0056b3;
    transform: scale(1.05);
  }

  .send-button:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    transform: none;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .message-agent .message-content {
      background-color: #343a40;
      color: #f8f9fa;
      border-color: #495057;
    }

    .message-system .message-content {
      background-color: #495057;
      color: #adb5bd;
    }

    .input-area {
      background-color: #212529;
      border-color: #495057;
    }

    .chat-input {
      background-color: #343a40;
      color: #f8f9fa;
      border-color: #495057;
    }

    .chat-input:focus {
      border-color: #007bff;
      box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
    }

    .typing-indicator {
      background-color: #343a40 !important;
      border-color: #495057 !important;
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .message {
      max-width: 90%;
    }

    .messages-container {
      padding: 0.5rem;
    }

    .input-area {
      padding: 0.5rem;
    }

    .message-content {
      font-size: 0.85rem;
    }
  }
</style>
