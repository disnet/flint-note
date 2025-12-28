<script lang="ts">
  /**
   * AI Chat Panel Component
   *
   * A floating chat panel that uses a custom ChatService to communicate
   * with the AI via a proxy server. Supports tool calling for note operations.
   */
  import {
    createChatService,
    TOOL_CALL_STEP_LIMIT,
    type ChatService,
    type ChatMessage,
    type ToolCall,
    type AggregatedToolCall
  } from '../lib/automerge/chat-service.svelte';
  import ToolWidget from './ToolWidget.svelte';
  import ToolOverlay from './ToolOverlay.svelte';
  import {
    getActiveConversationEntry,
    navigateToNote,
    setActiveNoteId,
    type ConversationIndexEntry
  } from '../lib/automerge';
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import ConversationList from './ConversationList.svelte';
  import ChatInput from './ChatInput.svelte';
  import WikilinkText from './WikilinkText.svelte';
  import { modelStore, setSelectedModel } from '../stores/modelStore.svelte';
  import { getModelsByProvider } from '../config/models';

  interface Props {
    /** Whether the panel is currently open */
    isOpen: boolean;
    /** Close callback */
    onClose: () => void;
    /** Navigate to settings callback */
    onGoToSettings: () => void;
    /** Optional initial message to send when panel opens (for routine execution, etc.) */
    initialMessage?: string;
    /** Callback when initial message has been consumed */
    onInitialMessageConsumed?: () => void;
  }

  let {
    isOpen,
    onClose,
    onGoToSettings,
    initialMessage,
    onInitialMessageConsumed
  }: Props = $props();

  // Get chat server port from main process
  let serverPort = $state<number | null>(null);
  let apiKeyConfigured = $state<boolean | null>(null);
  let initError = $state<string | null>(null);

  // Chat service instance
  let chatService = $state<ChatService | null>(null);

  // Local input state for the input
  let localInput = $state('');

  // Reference to chat input component
  let chatInputRef: ReturnType<typeof ChatInput> | null = $state(null);

  // History panel state
  let showHistory = $state(false);

  // Credits state
  let credits = $state<{ remaining_credits: number } | null>(null);

  // Context usage state
  interface ContextUsage {
    percentage: number;
    warningLevel: 'none' | 'warning' | 'critical' | 'full';
    totalTokens: number;
    maxTokens: number;
    estimatedMessagesRemaining: number;
  }
  let contextUsage = $state<ContextUsage | null>(null);

  // Track previous status to detect when streaming completes
  let previousStatus = $state<string | null>(null);

  // Context popup hover state
  let showContextPopup = $state(false);

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
  const activeConversation = $derived(getActiveConversationEntry());
  const awaitingContinue = $derived(status === 'awaiting_continue');

  // Tool overlay state
  let showToolOverlay = $state(false);

  // Aggregate all tool calls from all messages with metadata
  // Commentary is now stored directly on each tool call during streaming
  const allToolCalls = $derived.by(() => {
    const aggregated: AggregatedToolCall[] = [];
    for (const msg of messages) {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          aggregated.push({
            ...tc,
            messageId: msg.id,
            timestamp: msg.createdAt
          });
        }
      }
    }
    return aggregated;
  });

  // Check if any tool is currently running
  const hasRunningTool = $derived(allToolCalls.some((tc) => tc.status === 'running'));

  // Get the name of the currently running tool (if any)
  const currentRunningToolName = $derived(
    allToolCalls.find((tc) => tc.status === 'running')?.name
  );

  // Handle initial message when panel opens (for routine execution, etc.)
  $effect(() => {
    if (isOpen && initialMessage && chatService && apiKeyConfigured && !isLoading) {
      // Start a new conversation and send the initial message
      chatService.startNewConversation();
      chatService.sendMessage(initialMessage, modelStore.selectedModel);

      // Notify parent that we've consumed the initial message
      onInitialMessageConsumed?.();
    }
  });

  // Fetch OpenRouter credits
  async function fetchCredits(): Promise<void> {
    try {
      credits = (await window.api?.getOpenRouterCredits()) ?? null;
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    }
  }

  // Estimate tokens for a string (rough approximation: ~4 characters per token)
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Calculate context usage from local messages
  function calculateContextUsage(): void {
    if (messages.length === 0) {
      contextUsage = null;
      return;
    }

    // Get max tokens from current model (default 200k)
    const maxTokens = modelStore.currentModelInfo?.contextLength ?? 200000;

    // Estimate system prompt tokens (~2000 for our system prompt)
    const systemPromptTokens = 2000;

    // Calculate tokens for all messages
    let conversationTokens = 0;
    for (const msg of messages) {
      conversationTokens += estimateTokens(msg.content || '');
      // Add tokens for tool calls
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          conversationTokens += estimateTokens(JSON.stringify(tc.args || {}));
          conversationTokens += estimateTokens(JSON.stringify(tc.result || ''));
        }
      }
    }

    const totalTokens = systemPromptTokens + conversationTokens;
    const percentage = (totalTokens / maxTokens) * 100;

    // Estimate average tokens per message exchange (user + assistant)
    const avgTokensPerExchange =
      messages.length > 0 ? conversationTokens / messages.length : 500;
    const remainingTokens = maxTokens - totalTokens;
    const estimatedMessagesRemaining = Math.max(
      0,
      Math.floor(remainingTokens / avgTokensPerExchange)
    );

    // Determine warning level
    let warningLevel: 'none' | 'warning' | 'critical' | 'full' = 'none';
    if (percentage >= 90) {
      warningLevel = 'full';
    } else if (percentage >= 75) {
      warningLevel = 'critical';
    } else if (percentage >= 50) {
      warningLevel = 'warning';
    }

    contextUsage = {
      percentage,
      warningLevel,
      totalTokens,
      maxTokens,
      estimatedMessagesRemaining
    };
  }

  // Format token count for display (e.g., 15000 -> "15k")
  function formatTokens(tokens: number): string {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return tokens.toString();
  }

  // Fetch credits when API key becomes configured
  $effect(() => {
    if (apiKeyConfigured) {
      fetchCredits();
    }
  });

  // Refresh credits after AI response completes
  $effect(() => {
    const wasLoading = previousStatus === 'streaming' || previousStatus === 'submitting';
    const isNowIdle = status === 'ready' || status === 'awaiting_continue';

    if (wasLoading && isNowIdle) {
      fetchCredits();
    }
    previousStatus = status;
  });

  // Calculate context usage whenever messages change
  // Use JSON.stringify to detect deep changes in message content
  $effect(() => {
    // Create dependency on messages array and its content
    const _deps = [
      messages.length,
      messages.map((m) => m.content?.length ?? 0).join(',')
    ];
    void _deps;
    calculateContextUsage();
  });

  // Handle model switching
  async function handleModelSwitch(mode: 'normal' | 'plus-ultra'): Promise<void> {
    const provider = modelStore.currentModelInfo.provider;
    const models = getModelsByProvider(provider).filter((m) => m.mode === mode);
    if (models.length > 0) {
      await setSelectedModel(models[0].id);
    }
  }

  // Open OpenRouter dashboard
  function openOpenRouterDashboard(): void {
    window.api?.openExternal({ url: 'https://openrouter.ai/credits' });
  }

  // Derived current mode from model store
  const currentMode = $derived(modelStore.currentModelInfo.mode ?? 'normal');

  // Get conversation title
  const conversationTitle = $derived(activeConversation?.title ?? 'AI Assistant');

  // Handle form submit
  async function handleSubmit(
    event?: SubmitEvent & { currentTarget: HTMLFormElement }
  ): Promise<void> {
    event?.preventDefault();
    if (!chatService || !localInput.trim() || isLoading) return;

    const messageText = localInput.trim();
    const currentModel = modelStore.selectedModel;
    localInput = ''; // Clear input immediately
    chatInputRef?.clear(); // Clear the CodeMirror editor

    try {
      await chatService.sendMessage(messageText, currentModel);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  // Handle input change from CodeMirror
  function handleInputChange(newValue: string): void {
    localInput = newValue;
  }

  // Handle submit from CodeMirror (Enter key)
  function handleInputSubmit(): void {
    if (localInput.trim() && !isLoading) {
      handleSubmit();
    }
  }

  // Helper to get display text content from ChatMessage
  // For messages with tool calls, strips out commentary to show only final response
  function getMessageText(message: ChatMessage): string {
    if (!message.content) return '';

    // For messages with tool calls, remove commentary text to show only final response
    if (hasToolCalls(message) && message.toolCalls) {
      let displayContent = message.content;
      for (const tc of message.toolCalls) {
        if (tc.commentary) {
          // Remove the commentary from the content
          displayContent = displayContent.replace(tc.commentary, '');
        }
      }
      return displayContent.trim();
    }

    return message.content;
  }

  // Check if message has tool calls
  function hasToolCalls(message: ChatMessage): boolean {
    return (message.toolCalls?.length ?? 0) > 0;
  }

  // Handle conversation selection from history
  async function handleConversationSelect(conv: ConversationIndexEntry): Promise<void> {
    if (!chatService) return;
    await chatService.loadConversation(conv.id);
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

  // Handle note link clicks in chat messages
  function handleNoteClick(noteId: string): void {
    setActiveNoteId(noteId);
  }

  // Copy tool call JSON to clipboard
  async function copyToolCallJson(toolCall: ToolCall): Promise<void> {
    const json = JSON.stringify(toolCall, null, 2);
    await navigator.clipboard.writeText(json);
  }

  // Handle continue when agent hits step limit
  async function handleContinue(): Promise<void> {
    if (!chatService) return;
    await chatService.continueConversation(modelStore.selectedModel);
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
        <h3 class="header-title" title={conversationTitle}>
          <WikilinkText text={conversationTitle} onNoteClick={handleNoteClick} />
        </h3>
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
          <ConversationList
            activeConversationId={conversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            onNoteClick={handleNoteClick}
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
                    {#if message.role === 'user'}
                      <!-- User messages: render as single block -->
                      {#if getMessageText(message)}
                        <ConversationMessage
                          content={getMessageText(message)}
                          role="user"
                          variant="bubble"
                          noAnimation={true}
                          onNoteClick={handleNoteClick}
                        />
                      {/if}
                    {:else}
                      <!-- Assistant messages: render full content (tool break markers are HTML comments, invisible) -->
                      {#if getMessageText(message)}
                        <ConversationMessage
                          content={getMessageText(message)}
                          role="agent"
                          variant="bubble"
                          noAnimation={true}
                          onNoteClick={handleNoteClick}
                        />
                      {/if}
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
                {#if awaitingContinue}
                  <div class="continue-prompt">
                    <span class="continue-prompt-text">
                      Agent reached step limit ({TOOL_CALL_STEP_LIMIT} steps)
                    </span>
                    <button class="continue-button" onclick={handleContinue}>
                      Continue
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          {/snippet}

          {#snippet controls()}
            <!-- Tool Widget (above input form) -->
            {#if allToolCalls.length > 0}
              <div class="tool-widget-container">
                <ToolWidget
                  {allToolCalls}
                  isRunning={hasRunningTool}
                  currentToolName={currentRunningToolName}
                  isExpanded={showToolOverlay}
                  onToggle={() => (showToolOverlay = !showToolOverlay)}
                />
              </div>
            {/if}

            <!-- Tool Overlay (when expanded) -->
            {#if showToolOverlay}
              <ToolOverlay
                toolCalls={allToolCalls}
                onClose={() => (showToolOverlay = false)}
                onCopy={copyToolCallJson}
              />
            {/if}

            <form class="chat-input-form" onsubmit={handleSubmit}>
              {#if error}
                <div class="error-banner">
                  {error.message}
                </div>
              {/if}
              <div class="input-container">
                <ChatInput
                  bind:this={chatInputRef}
                  value={localInput}
                  placeholder="Ask Flint anything...use [[ to link notes"
                  disabled={isLoading}
                  onValueChange={handleInputChange}
                  onSubmit={handleInputSubmit}
                  onWikilinkClick={navigateToNote}
                />
              </div>
              <div class="input-controls">
                <!-- Model Switcher -->
                <div class="model-switcher">
                  <button
                    type="button"
                    class="mode-btn"
                    class:active={currentMode === 'normal'}
                    onclick={() => handleModelSwitch('normal')}
                    title="Normal - Fast and capable"
                  >
                    <span class="mode-icon">⚡</span>
                    <span class="mode-label">Normal</span>
                  </button>
                  <button
                    type="button"
                    class="mode-btn"
                    class:active={currentMode === 'plus-ultra'}
                    onclick={() => handleModelSwitch('plus-ultra')}
                    title="Plus Ultra - Deep thinking"
                  >
                    <span class="mode-icon">🧠</span>
                    <span class="mode-label">Plus Ultra</span>
                  </button>
                </div>

                <!-- Spacer -->
                <div class="controls-spacer"></div>

                <!-- Credits Badge -->
                {#if credits}
                  <button
                    type="button"
                    class="credits-badge"
                    onclick={openOpenRouterDashboard}
                    title="Click to manage credits"
                  >
                    ${Math.round(credits.remaining_credits)} left
                  </button>
                {/if}

                <!-- Context Circle -->
                {#if contextUsage}
                  <div
                    class="context-circle-wrapper"
                    role="status"
                    aria-label="Context window usage"
                    onmouseenter={() => (showContextPopup = true)}
                    onmouseleave={() => (showContextPopup = false)}
                  >
                    <div
                      class="context-circle"
                      class:warning={contextUsage.warningLevel === 'warning'}
                      class:critical={contextUsage.warningLevel === 'critical' ||
                        contextUsage.warningLevel === 'full'}
                    >
                      <svg viewBox="0 0 36 36" class="circular-chart">
                        <path
                          class="circle-bg"
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          class="circle-progress"
                          stroke-dasharray="{contextUsage.percentage}, 100"
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                    </div>
                    {#if showContextPopup}
                      <div class="context-popup">
                        <div class="context-popup-title">Context Window</div>
                        <div class="context-popup-row">
                          <span class="context-popup-label">Used</span>
                          <span class="context-popup-value"
                            >{formatTokens(contextUsage.totalTokens)} / {formatTokens(
                              contextUsage.maxTokens
                            )} tokens</span
                          >
                        </div>
                        <div class="context-popup-row">
                          <span class="context-popup-label">Usage</span>
                          <span class="context-popup-value"
                            >{contextUsage.percentage.toFixed(1)}%</span
                          >
                        </div>
                        <div class="context-popup-row">
                          <span class="context-popup-label">Remaining</span>
                          <span class="context-popup-value"
                            >~{contextUsage.estimatedMessagesRemaining} messages</span
                          >
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Send Button -->
                <button
                  type="submit"
                  class="send-button"
                  disabled={isLoading || !localInput.trim()}
                  aria-label="Send message"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
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
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    flex-direction: column;
  }

  /* Input controls row */
  .input-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .controls-spacer {
    flex: 1;
  }

  /* Model switcher toggle */
  .model-switcher {
    display: flex;
    background: var(--bg-tertiary, var(--bg-secondary));
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    color: var(--text-secondary);
  }

  .mode-btn.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .mode-icon {
    font-size: 0.875rem;
  }

  .mode-label {
    font-weight: 500;
  }

  /* Credits badge */
  .credits-badge {
    padding: 4px 8px;
    background: rgba(34, 197, 94, 0.15);
    color: var(--success-text, #22c55e);
    border: none;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .credits-badge:hover {
    background: rgba(34, 197, 94, 0.25);
  }

  /* Context circle */
  .context-circle-wrapper {
    position: relative;
    padding: 4px;
    margin: -4px;
    cursor: default;
  }

  .context-circle {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  .circular-chart {
    width: 100%;
    height: 100%;
  }

  .circle-bg {
    fill: none;
    stroke: var(--border-light);
    stroke-width: 3;
  }

  .circle-progress {
    fill: none;
    stroke: var(--accent-primary);
    stroke-width: 3;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dasharray 0.3s ease;
  }

  .context-circle.warning .circle-progress {
    stroke: var(--warning, #f59e0b);
  }

  .context-circle.critical .circle-progress {
    stroke: var(--error-text, #dc3545);
  }

  /* Context popup */
  .context-popup {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    min-width: 180px;
    z-index: 100;
    animation: popupFadeIn 0.15s ease;
  }

  @keyframes popupFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .context-popup-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-light);
  }

  .context-popup-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    padding: 3px 0;
  }

  .context-popup-label {
    color: var(--text-muted);
  }

  .context-popup-value {
    color: var(--text-primary);
    font-weight: 500;
  }

  /* Send button - circular */
  .send-button {
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color 0.2s ease,
      opacity 0.2s ease;
    flex-shrink: 0;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Tool widget container */
  .tool-widget-container {
    padding: 0 16px;
  }

  /* Continue prompt */
  .continue-prompt {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-tertiary, var(--bg-secondary));
    border-radius: 8px;
    margin-top: 8px;
  }

  .continue-prompt-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .continue-button {
    padding: 6px 14px;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }

  .continue-button:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }
</style>
