<script lang="ts">
  /**
   * ConversationView - Displays a conversation with full chat functionality
   *
   * Used when selecting a conversation from the conversations system view.
   * Shows all messages and allows continuing the conversation with a chat input.
   */
  import { onMount, onDestroy } from 'svelte';
  import { untrack } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { placeholder, keymap } from '@codemirror/view';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    createChatService,
    TOOL_BREAK_MARKER,
    type ChatService,
    type ChatMessage,
    type ToolCall
  } from '../lib/automerge/chat-service.svelte';
  import {
    navigateToNote,
    setActiveNoteId,
    getConversationEntry,
    updateConversation,
    addNoteToWorkspace,
    setActiveSystemView,
    setSelectedNoteTypeId
  } from '../lib/automerge';
  import { automergeWikilinksExtension } from '../lib/automerge/wikilinks.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import ChatInput from './ChatInput.svelte';

  interface Props {
    /** ID of the conversation to display */
    conversationId: string;
    /** Callback to navigate to settings for API key configuration */
    onGoToSettings?: () => void;
  }

  let { conversationId, onGoToSettings }: Props = $props();

  // Chat service and initialization state
  let serverPort = $state<number | null>(null);
  let apiKeyConfigured = $state<boolean | null>(null);
  let initError = $state<string | null>(null);
  let chatService = $state<ChatService | null>(null);

  // Track which conversation is loaded to prevent re-loading
  let loadedConversationId: string | null = null;

  // Local input state
  let localInput = $state('');

  // Reference to chat input component
  let chatInputRef: ReturnType<typeof ChatInput> | null = $state(null);

  // Reference to messages container for scrolling
  let messagesContainer: HTMLDivElement | null = $state(null);

  // Title editor state (CodeMirror)
  let titleEditorContainer: HTMLDivElement | null = $state(null);
  let titleEditorView: EditorView | null = null;
  let titleDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;
  let lastSetTitle: string | null = null;

  // Initialize chat service on mount (only runs once)
  onMount(() => {
    const init = async (): Promise<void> => {
      try {
        const port = await window.api?.getChatServerPort();
        serverPort = port ?? null;

        const isValid = await window.api?.testApiKey({ provider: 'openrouter' });
        apiKeyConfigured = isValid ?? false;

        if (port && isValid) {
          const service = createChatService(port);
          chatService = service;
          // Load the conversation immediately after creating the service
          if (conversationId) {
            loadedConversationId = conversationId;
            service.loadConversation(conversationId);
          }
        }
      } catch (error) {
        console.error('Failed to initialize chat service:', error);
        initError = error instanceof Error ? error.message : 'Failed to initialize chat';
      }
    };
    init();
  });

  // Load conversation when conversationId changes (but not on initial mount)
  $effect(() => {
    const convId = conversationId;
    // Only load if we have a service and this is a different conversation
    if (convId && convId !== loadedConversationId) {
      untrack(() => {
        if (chatService) {
          loadedConversationId = convId;
          chatService.loadConversation(convId);
        }
      });
    }
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
    // Read messages.length to create dependency
    const msgCount = messages.length;
    if (messagesContainer && msgCount > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 10);
    }
  });

  // Derived state from chat service
  const messages = $derived(chatService?.messages ?? []);
  const status = $derived(chatService?.status ?? 'ready');
  const error = $derived(chatService?.error);
  const isLoading = $derived(status === 'submitting' || status === 'streaming');

  // Get conversation index entry from Automerge state (full conversation loaded by chat service)
  const conversationEntry = $derived(getConversationEntry(conversationId));

  // Get conversation title - use stored title or fall back to first message
  const conversationTitle = $derived.by(() => {
    // First try the stored title
    if (conversationEntry?.title && conversationEntry.title !== 'New Conversation') {
      return conversationEntry.title;
    }
    // Fall back to first user message
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (firstUserMessage?.content) {
      const title = firstUserMessage.content.slice(0, 50);
      return title.length < firstUserMessage.content.length ? `${title}...` : title;
    }
    return 'New Conversation';
  });

  // Title editor theme
  const titleEditorTheme = EditorView.theme({
    '&': {
      fontSize: '1.5rem',
      fontWeight: '800',
      fontFamily: 'var(--font-editor)',
      backgroundColor: 'transparent'
    },
    '.cm-content': {
      padding: '0.1em 0',
      paddingLeft: '2.3rem', // Space for conversation icon
      minHeight: '1.4em',
      lineHeight: '1.4',
      caretColor: 'var(--text-primary)'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-editor': {
      backgroundColor: 'transparent'
    },
    '.cm-line': {
      padding: '0'
    },
    '.cm-placeholder': {
      color: 'var(--text-muted)',
      opacity: '0.5'
    },
    '.cm-scroller': {
      overflow: 'visible'
    },
    // Override wikilink styles for title context
    '.wikilink': {
      fontSize: 'inherit',
      fontWeight: 'inherit'
    }
  });

  // Handle theme changes
  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateTitleEditorTheme();
  }

  function updateTitleEditorTheme(): void {
    if (!titleEditorView) return;
    titleEditorView.dispatch({
      effects: StateEffect.reconfigure.of(createTitleEditorExtensions())
    });
  }

  // Handle wikilink clicks in title
  function handleTitleWikilinkClick(
    targetId: string,
    _title: string,
    options?: { shouldCreate?: boolean; targetType?: 'note' | 'conversation' | 'type' }
  ): void {
    if (options?.targetType === 'conversation') {
      // Don't navigate to conversations from title
      return;
    }
    if (options?.targetType === 'type') {
      // Navigate to note type definition screen
      setSelectedNoteTypeId(targetId);
      setActiveSystemView('types');
      return;
    }
    if (options?.shouldCreate) {
      // Don't create notes from title wikilinks
      return;
    }
    // Navigate to the note
    setActiveNoteId(targetId);
    addNoteToWorkspace(targetId);
  }

  // Create extensions for title editor
  function createTitleEditorExtensions(): import('@codemirror/state').Extension[] {
    const theme = isDarkMode ? githubDark : githubLight;

    return [
      minimalSetup,
      placeholder('Untitled'),
      theme,
      titleEditorTheme,
      EditorView.lineWrapping,
      // Wikilink support
      automergeWikilinksExtension(handleTitleWikilinkClick),
      // Prevent Enter from creating newlines
      keymap.of([
        {
          key: 'Enter',
          run: () => true // Consume Enter key
        }
      ]),
      // Update listener for debounced save
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newTitle = update.state.doc.toString();

          // Debounce the save
          if (titleDebounceTimeout) {
            clearTimeout(titleDebounceTimeout);
          }
          titleDebounceTimeout = setTimeout(() => {
            updateConversation(conversationId, { title: newTitle });
          }, 300);
        }
      })
    ];
  }

  // Initialize title editor
  function initTitleEditor(): void {
    if (!titleEditorContainer || titleEditorView) return;

    const startState = EditorState.create({
      doc: conversationTitle,
      extensions: createTitleEditorExtensions()
    });

    titleEditorView = new EditorView({
      state: startState,
      parent: titleEditorContainer
    });
    lastSetTitle = conversationTitle;
  }

  // Update title editor when conversation changes
  $effect(() => {
    const title = conversationTitle;
    if (titleEditorView && title !== lastSetTitle) {
      const currentContent = titleEditorView.state.doc.toString();
      if (title !== currentContent) {
        titleEditorView.dispatch({
          changes: { from: 0, to: titleEditorView.state.doc.length, insert: title }
        });
      }
      lastSetTitle = title;
    }
  });

  // Initialize title editor when container is available
  $effect(() => {
    if (titleEditorContainer && !titleEditorView) {
      // Initialize dark mode
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      isDarkMode = mediaQuery.matches;
      mediaQuery.addEventListener('change', handleThemeChange);

      initTitleEditor();
    }
  });

  // Cleanup title editor
  onDestroy(() => {
    if (titleEditorView) {
      titleEditorView.destroy();
      titleEditorView = null;
    }
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
    if (titleDebounceTimeout) {
      clearTimeout(titleDebounceTimeout);
    }
  });

  // Handle form submit
  async function handleSubmit(
    event?: SubmitEvent & { currentTarget: HTMLFormElement }
  ): Promise<void> {
    event?.preventDefault();
    if (!chatService || !localInput.trim() || isLoading) return;

    const messageText = localInput.trim();
    localInput = '';
    chatInputRef?.clear();

    try {
      await chatService.sendMessage(messageText);
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

  // Get text content from ChatMessage
  function getMessageText(message: ChatMessage): string {
    return message.content;
  }

  // Helper to split message content into segments (pre-tool and post-tool)
  function getMessageSegments(message: ChatMessage): string[] {
    if (!message.content) return [];
    const segments = message.content.split(TOOL_BREAK_MARKER);
    return segments.filter((s) => s.trim());
  }

  // Check if message has tool calls
  function hasToolCalls(message: ChatMessage): boolean {
    return (message.toolCalls?.length ?? 0) > 0;
  }

  // Handle note link clicks
  function handleNoteClick(noteId: string): void {
    setActiveNoteId(noteId);
  }

  // Format timestamp for display
  function formatTimestamp(date: Date): string {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Copy tool call JSON to clipboard
  async function copyToolCallJson(toolCall: ToolCall): Promise<void> {
    const json = JSON.stringify(toolCall, null, 2);
    await navigator.clipboard.writeText(json);
  }
</script>

<div class="conversation-view">
  <div class="conversation-header">
    <div class="title-area">
      <span class="conversation-icon">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <div bind:this={titleEditorContainer} class="title-editor"></div>
    </div>
  </div>

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
      <p>Configure your OpenRouter API key in Settings to continue chatting.</p>
      {#if onGoToSettings}
        <button class="setup-button" onclick={onGoToSettings}>Open Settings</button>
      {/if}
    </div>
  {:else if !serverPort || apiKeyConfigured === null}
    <!-- Loading state -->
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Initializing...</p>
    </div>
  {:else}
    <!-- Chat interface -->
    <div class="messages-container" bind:this={messagesContainer}>
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
            <div class="message-meta">
              <span class="role-label">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <span class="message-time">{formatTimestamp(message.createdAt)}</span>
            </div>

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
              <!-- Assistant messages: render segments with tool calls in between -->
              {@const segments = getMessageSegments(message)}
              {#if segments.length > 0}
                <!-- First segment (before tool calls) -->
                <ConversationMessage
                  content={segments[0]}
                  role="agent"
                  variant="bubble"
                  noAnimation={true}
                  onNoteClick={handleNoteClick}
                />
              {/if}
              {#if hasToolCalls(message)}
                <div class="tool-calls-indicator">
                  {#each message.toolCalls ?? [] as toolCall (toolCall.id)}
                    <div
                      class="tool-call"
                      class:running={toolCall.status === 'running'}
                      class:completed={toolCall.status === 'completed'}
                      class:error={toolCall.status === 'error'}
                    >
                      <span class="tool-icon">
                        {#if toolCall.status === 'running'}
                          <span class="tool-spinner"></span>
                        {:else if toolCall.status === 'error'}
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
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
                      <span class="tool-name">{toolCall.name.replace(/_/g, ' ')}</span>
                      <button
                        class="tool-copy-btn"
                        onclick={() => copyToolCallJson(toolCall)}
                        title="Copy tool call JSON"
                        aria-label="Copy tool call JSON"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if segments.length > 1}
                <!-- Remaining segments (after tool calls) -->
                {#each segments.slice(1) as segment, i (i)}
                  <ConversationMessage
                    content={segment}
                    role="agent"
                    variant="bubble"
                    noAnimation={true}
                    onNoteClick={handleNoteClick}
                  />
                {/each}
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
      {/if}
    </div>

    <!-- Input area -->
    <div class="chat-input-area">
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
            placeholder="Type a message... (use [[note]] to link)"
            disabled={isLoading}
            onValueChange={handleInputChange}
            onSubmit={handleInputSubmit}
            onWikilinkClick={navigateToNote}
          />
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
    </div>
  {/if}
</div>

<style>
  .conversation-view {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-width: 800px;
    width: 100%;
    height: 100%;
  }

  .conversation-header {
    display: flex;
    align-items: flex-start;
    padding: 0;
    flex-shrink: 0;
    gap: 8px;
  }

  /* Title area with icon positioned absolutely */
  .title-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .conversation-icon {
    position: absolute;
    top: 0.4em;
    left: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .conversation-icon svg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .title-editor {
    width: 100%;
    min-width: 0;
  }

  /* CodeMirror overrides for title editor */
  .title-editor :global(.cm-editor) {
    background: transparent;
  }

  .title-editor :global(.cm-focused) {
    outline: none;
  }

  .title-editor :global(.cm-content) {
    color: var(--text-primary);
  }

  .title-editor :global(.cm-line) {
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
    padding: 2rem;
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

  /* Messages container */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    max-width: 90%;
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

  .message-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    padding: 0 0.25rem;
  }

  .role-label {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .message-wrapper.user .role-label {
    color: var(--accent-secondary, var(--accent-primary));
  }

  .message-wrapper.assistant .role-label {
    color: var(--accent-primary);
  }

  .message-time {
    color: var(--text-muted);
  }

  .empty-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
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

  /* Tool calls indicator */
  .tool-calls-indicator {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
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

  .tool-call.error {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    color: var(--error-text, #ef4444);
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

  .tool-copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0;
    cursor: pointer;
    border-radius: 3px;
    transition:
      opacity 0.15s ease,
      background-color 0.15s ease;
  }

  .tool-call:hover .tool-copy-btn {
    opacity: 0.6;
  }

  .tool-copy-btn:hover {
    opacity: 1 !important;
    background: rgba(0, 0, 0, 0.1);
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

  /* Input area */
  .chat-input-area {
    flex-shrink: 0;
    border-top: 1px solid var(--border-light);
    padding: 1rem 0;
  }

  .chat-input-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .error-banner {
    padding: 8px 12px;
    background: var(--error-bg, #fef2f2);
    color: var(--error-text, #dc3545);
    border-radius: 6px;
    font-size: 0.8125rem;
  }

  .input-container {
    display: flex;
    gap: 8px;
    align-items: flex-end;
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
    flex-shrink: 0;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
