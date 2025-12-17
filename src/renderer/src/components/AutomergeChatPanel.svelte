<script lang="ts">
  /**
   * AI Chat Panel Component
   *
   * A floating chat panel that uses a custom ChatService to communicate
   * with the AI via a proxy server. Supports tool calling for note operations.
   */
  import {
    createChatService,
    type ChatService,
    type ChatMessage
  } from '../lib/automerge/chat-service.svelte';
  import { getActiveConversation, type Conversation } from '../lib/automerge';
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import AutomergeConversationList from './AutomergeConversationList.svelte';

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

  // Chat service instance
  let chatService = $state<ChatService | null>(null);

  // Local input state for the textarea
  let localInput = $state('');

  // History panel state
  let showHistory = $state(false);

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

        // Initialize ChatService when port is available
        if (port && isValid) {
          chatService = createChatService(port);
        }
      } catch (error) {
        console.error('Failed to initialize chat panel:', error);
        initError = error instanceof Error ? error.message : 'Failed to initialize chat';
      }
    };
    init();
  });

  // Derived state from chat service
  const messages = $derived(chatService?.messages ?? []);
  const status = $derived(chatService?.status ?? 'ready');
  const error = $derived(chatService?.error);
  const isLoading = $derived(status === 'submitting' || status === 'streaming');
  const conversationId = $derived(chatService?.conversationId ?? null);
  const activeConversation = $derived(getActiveConversation());

  // Get conversation title
  const conversationTitle = $derived(activeConversation?.title ?? 'AI Assistant');

  // Handle form submit
  async function handleSubmit(
    event: SubmitEvent & { currentTarget: HTMLFormElement }
  ): Promise<void> {
    event.preventDefault();
    if (!chatService || !localInput.trim() || isLoading) return;

    const messageText = localInput.trim();
    localInput = ''; // Clear input immediately

    try {
      await chatService.sendMessage(messageText);
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

  // Helper to get text content from ChatMessage
  function getMessageText(message: ChatMessage): string {
    return message.content;
  }

  // Check if message has tool calls
  function hasToolCalls(message: ChatMessage): boolean {
    return (message.toolCalls?.length ?? 0) > 0;
  }

  // Handle conversation selection from history
  function handleConversationSelect(conv: Conversation): void {
    if (!chatService) return;
    chatService.loadConversation(conv.id);
    showHistory = false;
  }

  // Handle new conversation
  function handleNewConversation(): void {
    if (!chatService) return;
    chatService.startNewConversation();
    showHistory = false;
  }

  // Toggle history panel
  function toggleHistory(): void {
    showHistory = !showHistory;
  }
</script>

{#if isOpen}
  <div class="chat-panel" class:visible={isOpen}>
    <div class="chat-panel-inner">
      <!-- Header -->
      <div class="chat-header">
        <button
          class="header-btn"
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
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </button>
        <h3 class="header-title" title={conversationTitle}>{conversationTitle}</h3>
        <div class="header-actions">
          <button
            class="header-btn"
            onclick={handleNewConversation}
            title="New conversation"
            aria-label="Start new conversation"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button
            class="header-btn"
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
      </div>

      <!-- History panel (slide-out) -->
      {#if showHistory}
        <div class="history-panel">
          <AutomergeConversationList
            activeConversationId={conversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
          />
        </div>
      {/if}

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
          <button class="setup-button" onclick={onGoToSettings}> Open Settings </button>
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
                    {#if hasToolCalls(message)}
                      <!-- Show tool calls indicator -->
                      <div class="tool-calls-indicator">
                        {#each message.toolCalls ?? [] as toolCall (toolCall.id)}
                          <div
                            class="tool-call"
                            class:running={toolCall.status === 'running'}
                            class:completed={toolCall.status === 'completed'}
                          >
                            <span class="tool-icon">
                              {#if toolCall.status === 'running'}
                                <span class="tool-spinner"></span>
                              {:else}
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              {/if}
                            </span>
                            <span class="tool-name"
                              >{toolCall.name.replace(/_/g, ' ')}</span
                            >
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#if getMessageText(message)}
                      <ConversationMessage
                        content={getMessageText(message)}
                        role={message.role === 'user' ? 'user' : 'agent'}
                        variant="bubble"
                        noAnimation={true}
                      />
                    {/if}
                  </div>
                {/each}
                {#if isLoading && messages.length > 0 && !messages[messages.length - 1].content && !hasToolCalls(messages[messages.length - 1])}
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
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .header-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-btn {
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

  .header-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* History panel */
  .history-panel {
    position: absolute;
    top: 49px; /* Below header */
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    z-index: 10;
    overflow-y: auto;
    border-top: 1px solid var(--border-light);
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

  /* Tool calls indicator */
  .tool-calls-indicator {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }

  .tool-call {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--bg-tertiary, var(--bg-secondary));
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .tool-call.running {
    background: var(--accent-primary-light, rgba(59, 130, 246, 0.1));
    color: var(--accent-primary);
  }

  .tool-call.completed {
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    color: var(--success-text, #22c55e);
  }

  .tool-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
  }

  .tool-spinner {
    width: 10px;
    height: 10px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .tool-name {
    text-transform: capitalize;
  }
</style>
