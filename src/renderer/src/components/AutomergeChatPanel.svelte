<script lang="ts">
  /**
   * AI Chat Panel Component
   *
   * A floating chat panel that uses the AI SDK Chat class to communicate
   * with the local chat server. Displays conversation messages and allows
   * users to send messages to the AI assistant.
   */
  import { Chat, type UIMessage } from '@ai-sdk/svelte';
  import { TextStreamChatTransport } from 'ai';
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';

  interface Props {
    /** Whether the panel is currently open */
    isOpen: boolean;
    /** Close callback */
    onClose: () => void;
    /** Navigate to settings callback */
    onGoToSettings: () => void;
  }

  let { isOpen, onClose, onGoToSettings }: Props = $props();

  // Get chat server port from main process
  let serverPort = $state<number | null>(null);
  let apiKeyConfigured = $state<boolean | null>(null);
  let initError = $state<string | null>(null);

  // Chat instance
  let chat = $state<Chat | null>(null);

  // Local input state for the textarea
  let localInput = $state('');

  // Initialize server port and check API key on mount
  $effect(() => {
    const init = async (): Promise<void> => {
      try {
        // Get chat server port
        const port = await window.api?.getChatServerPort();
        serverPort = port ?? null;

        // Check if API key is configured
        const isValid = await window.api?.testApiKey({ provider: 'openrouter' });
        apiKeyConfigured = isValid ?? false;

        // Initialize Chat instance when port is available
        if (port && isValid) {
          const transport = new TextStreamChatTransport({
            api: `http://localhost:${port}/api/chat`
          });
          chat = new Chat({ transport });
        }
      } catch (error) {
        console.error('Failed to initialize chat panel:', error);
        initError =
          error instanceof Error ? error.message : 'Failed to initialize chat';
      }
    };
    init();
  });

  // Derived state from chat
  const messages = $derived(chat?.messages ?? []);
  const status = $derived(chat?.status ?? 'ready');
  const error = $derived(chat?.error);
  const isLoading = $derived(status === 'submitted' || status === 'streaming');

  // Handle form submit
  async function handleSubmit(
    event: SubmitEvent & { currentTarget: HTMLFormElement }
  ): Promise<void> {
    event.preventDefault();
    if (!chat || !localInput.trim() || isLoading) return;

    const messageText = localInput.trim();
    localInput = ''; // Clear input immediately

    try {
      await chat.sendMessage({ text: messageText });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  // Handle keyboard shortcuts in textarea
  function handleKeyDown(
    event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }
  ): void {
    // Submit on Enter without Shift
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form && localInput.trim() && !isLoading) {
        form.requestSubmit();
      }
    }
  }

  // Helper to get text content from UIMessage
  function getMessageText(message: UIMessage): string {
    // UIMessage v5 uses parts array, not content
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('');
    }
    return '';
  }
</script>

{#if isOpen}
  <div class="chat-panel" class:visible={isOpen}>
    <div class="chat-panel-inner">
      <!-- Header -->
      <div class="chat-header">
        <h3>AI Assistant</h3>
        <button
          class="close-button"
          onclick={onClose}
          title="Close"
          aria-label="Close chat"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Content -->
      {#if initError}
        <!-- Initialization error -->
        <div class="error-state">
          <p>Failed to initialize chat:</p>
          <p class="error-message">{initError}</p>
        </div>
      {:else if apiKeyConfigured === false}
        <!-- API key not configured -->
        <div class="setup-prompt">
          <div class="setup-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h4>API Key Required</h4>
          <p>Configure your OpenRouter API key in Settings to start chatting.</p>
          <button class="setup-button" onclick={onGoToSettings}>
            Open Settings
          </button>
        </div>
      {:else if !serverPort || apiKeyConfigured === null}
        <!-- Loading state -->
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Initializing...</p>
        </div>
      {:else}
        <!-- Chat interface -->
        <ConversationContainer
          autoScroll={true}
          scrollDependency={messages}
          class="chat-conversation"
        >
          {#snippet content()}
            <div class="messages-list">
              {#if messages.length === 0}
                <div class="empty-chat">
                  <p>Start a conversation with your AI assistant.</p>
                  <p class="hint">
                    Ask questions, brainstorm ideas, or get help with your notes.
                  </p>
                </div>
              {:else}
                {#each messages as message (message.id)}
                  <div
                    class="message-wrapper"
                    class:user={message.role === 'user'}
                    class:assistant={message.role === 'assistant'}
                  >
                    <ConversationMessage
                      content={getMessageText(message)}
                      role={message.role === 'user' ? 'user' : 'agent'}
                      variant="bubble"
                      noAnimation={true}
                    />
                  </div>
                {/each}
                {#if isLoading}
                  <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                {/if}
              {/if}
            </div>
          {/snippet}

          {#snippet controls()}
            <form class="chat-input-form" onsubmit={handleSubmit}>
              {#if error}
                <div class="error-banner">
                  {error.message}
                </div>
              {/if}
              <div class="input-container">
                <textarea
                  class="chat-input"
                  placeholder="Type a message..."
                  bind:value={localInput}
                  onkeydown={handleKeyDown}
                  rows="1"
                  disabled={isLoading}
                ></textarea>
                <button
                  type="submit"
                  class="send-button"
                  disabled={isLoading || !localInput.trim()}
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
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </form>
          {/snippet}
        </ConversationContainer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .chat-panel {
    position: fixed;
    bottom: 96px; /* Above the FAB (56px + 24px gap + 16px) */
    right: 24px;
    width: 400px;
    max-height: 60vh;
    min-height: 300px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 4px 16px rgba(0, 0, 0, 0.08);
    z-index: 999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .chat-panel.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .chat-panel-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .chat-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-button {
    padding: 4px;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* States */
  .loading-state,
  .error-state,
  .setup-prompt {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
    color: var(--text-secondary);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-message {
    color: var(--error-text, #dc3545);
    font-size: 0.875rem;
    margin-top: 8px;
  }

  .setup-icon {
    color: var(--text-muted);
    margin-bottom: 16px;
  }

  .setup-prompt h4 {
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .setup-prompt p {
    margin: 0 0 16px;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .setup-button {
    padding: 8px 16px;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .setup-button:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  /* Chat conversation */
  :global(.chat-conversation) {
    flex: 1;
    min-height: 0;
  }

  .messages-list {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message-wrapper {
    max-width: 85%;
  }

  .message-wrapper.user {
    align-self: flex-end;
  }

  .message-wrapper.assistant {
    align-self: flex-start;
  }

  .empty-chat {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-secondary);
  }

  .empty-chat p {
    margin: 0;
  }

  .empty-chat .hint {
    font-size: 0.8125rem;
    margin-top: 8px;
    color: var(--text-muted);
  }

  /* Typing indicator */
  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border-radius: 12px;
    width: fit-content;
  }

  .typing-indicator span {
    width: 8px;
    height: 8px;
    background: var(--text-muted);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(-8px);
    }
  }

  /* Input form */
  .chat-input-form {
    padding: 12px 16px;
    border-top: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .error-banner {
    padding: 8px 12px;
    background: var(--error-bg, #fef2f2);
    color: var(--error-text, #dc3545);
    border-radius: 6px;
    font-size: 0.8125rem;
    margin-bottom: 8px;
  }

  .input-container {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .chat-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    resize: none;
    min-height: 40px;
    max-height: 120px;
    line-height: 1.4;
    font-family: inherit;
  }

  .chat-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .chat-input::placeholder {
    color: var(--text-muted);
  }

  .chat-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .send-button {
    padding: 10px;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color 0.2s ease,
      opacity 0.2s ease;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
