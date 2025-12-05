<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { searchActions, type Action } from '../services/actionRegistry.svelte';
  import { navigationHistoryStore } from '../stores/navigationHistoryStore.svelte';
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import { getChatService } from '../services/chatService';
  import type { Message } from '../services/types';
  import { StreamingConversationManager } from '../services/streamingConversationManager.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import AgentActivityWidget from './AgentActivityWidget.svelte';

  interface SearchResult {
    id: string;
    title: string;
    snippet: string;
    type?: string;
    filename?: string;
    flint_kind?: string;
  }

  // Mode switcher items for keyboard navigation
  interface ModeSwitcher {
    id: string;
    itemType: 'mode-switcher';
    targetMode: '/' | '@';
    label: string;
  }

  // Conversation items for agent mode
  interface ConversationItem {
    id: string;
    itemType: 'conversation';
    threadId: string;
    title: string;
    lastMessage: string;
    lastActivity: Date;
    messageCount: number;
  }

  type SelectableItem = SearchResult | Action | ModeSwitcher | ConversationItem;

  const modeSwitchers: ModeSwitcher[] = [
    {
      id: 'mode-actions',
      itemType: 'mode-switcher',
      targetMode: '/',
      label: 'Search Actions & Commands'
    },
    {
      id: 'mode-agent',
      itemType: 'mode-switcher',
      targetMode: '@',
      label: 'Chat with Agent'
    }
  ];

  interface ActionBarProps {
    onNoteSelect?: (note: NoteMetadata) => void;
    onExecuteAction?: (actionId: string) => void;
    onOpenAgentPanel?: () => void;
    onNoteClick?: (noteId: string) => void;
  }

  let { onNoteSelect, onExecuteAction, onOpenAgentPanel, onNoteClick }: ActionBarProps =
    $props();

  // Mode: 'search' (default), 'actions' (/ prefix), 'agent' (@ prefix)
  type Mode = 'search' | 'actions' | 'agent';

  let inputValue = $state('');
  let isInputFocused = $state(false);
  let selectedIndex = $state(-1);

  // Agent mode state - local conversation (not synced to agent panel until user opens it)
  let agentMessages = $state<Message[]>([]);
  let agentConversationId = $state<string | null>(null); // For backend conversation context

  // Streaming conversation manager - handles tool call organization and message separation
  const streamingManager = new StreamingConversationManager({
    addMessage: (msg) => {
      agentMessages = [...agentMessages, msg];
    },
    updateMessage: (id, updates) => {
      agentMessages = agentMessages.map((m) => (m.id === id ? { ...m, ...updates } : m));
    },
    getMessages: () => agentMessages,
    setMessages: (msgs) => {
      agentMessages = msgs;
    }
  });

  // Derived state from streaming manager for UI
  const agentIsLoading = $derived(streamingManager.isLoading);
  const agentStreamingText = $derived(streamingManager.streamingText);
  const agentError = $derived(streamingManager.error);
  const currentToolCalls = $derived(streamingManager.currentToolCalls);
  const currentStepIndex = $derived(streamingManager.currentStepIndex);

  // Wikilink autocomplete state (for agent mode)
  let wikilinkSelectedIndex = $state(0);

  // Derive mode from input prefix
  const mode = $derived.by((): Mode => {
    if (inputValue.startsWith('/')) return 'actions';
    if (inputValue.startsWith('@')) return 'agent';
    return 'search';
  });

  // Get the actual query without the mode prefix
  const query = $derived.by(() => {
    if (mode === 'actions') return inputValue.slice(1);
    if (mode === 'agent') return inputValue.slice(1);
    return inputValue;
  });

  // Wikilink autocomplete detection (for agent mode)
  // Detects [[query pattern without closing ]]
  const wikilinkContext = $derived.by(() => {
    if (mode !== 'agent') return null;

    // Find the last occurrence of [[ that isn't closed
    const lastOpenBracket = inputValue.lastIndexOf('[[');
    if (lastOpenBracket === -1) return null;

    // Check if there's a ]] after the [[
    const afterBracket = inputValue.slice(lastOpenBracket + 2);
    if (afterBracket.includes(']]')) return null;

    // Extract the query (text after [[)
    const wikilinkQuery = afterBracket;

    return {
      startIndex: lastOpenBracket,
      query: wikilinkQuery
    };
  });

  // Filter notes for wikilink autocomplete
  const wikilinkResults = $derived.by(() => {
    if (!wikilinkContext) return [];

    const q = wikilinkContext.query.toLowerCase();
    const allNotes = notesStore.allNotes; // Use allNotes to include archived

    if (!q) {
      // Show recent notes when no query
      return allNotes.slice(0, 10);
    }

    // Filter and sort by relevance
    return allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(q) ||
          note.filename.toLowerCase().includes(q) ||
          note.id.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();

        // Exact title match first
        if (aTitle === q && bTitle !== q) return -1;
        if (bTitle === q && aTitle !== q) return 1;

        // Exact ID match
        if (aId === q && bId !== q) return -1;
        if (bId === q && aId !== q) return 1;

        // Title starts with query
        if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
        if (bTitle.startsWith(q) && !aTitle.startsWith(q)) return 1;

        // ID starts with query
        if (aId.startsWith(q) && !bId.startsWith(q)) return -1;
        if (bId.startsWith(q) && !aId.startsWith(q)) return 1;

        // Alphabetical
        return aTitle.localeCompare(bTitle);
      })
      .slice(0, 10);
  });

  // Reset wikilink selection when results change
  $effect(() => {
    if (wikilinkResults.length > 0) {
      wikilinkSelectedIndex = 0;
    }
  });

  // Search results from FTS API (for search mode)
  let ftsResults: SearchResult[] = $state([]);
  // Track which query the current FTS results are for
  let ftsResultsQuery = $state('');

  // Derive loading state synchronously - we're loading if query >= 3 and results don't match current query
  const isLoading = $derived(
    mode === 'search' && query.trim().length >= 3 && ftsResultsQuery !== query.trim()
  );

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Platform-specific keyboard shortcut display
  const isMacOS = $derived(navigator.platform.includes('Mac'));
  const shortcutKey = $derived(isMacOS ? '⌘K' : 'Ctrl+K');

  // Placeholder changes based on mode
  const placeholder = $derived.by(() => {
    if (mode === 'actions') return 'Search actions...';
    if (mode === 'agent') return 'Ask the agent...';
    return `Search notes... (${shortcutKey})`;
  });

  // Actions filtered by query (for actions mode)
  const filteredActions = $derived.by(() => {
    if (mode !== 'actions') return [];
    return searchActions(query.trim());
  });

  // Recent notes for empty search state (based on recently opened, not modified)
  const recentNotes = $derived.by(() => {
    const allNotes = notesStore.notes;
    if (allNotes.length === 0) return [];

    // Get recently opened notes from navigation history
    const recentEntries = navigationHistoryStore.getRecentNotes(5);

    // Map to SearchResult format, looking up full metadata from notesStore
    const results: SearchResult[] = [];
    for (const entry of recentEntries) {
      const note = allNotes.find((n) => n.id === entry.noteId);
      if (note) {
        results.push({
          id: note.id,
          title: note.title || 'Untitled',
          snippet: '',
          type: note.type,
          filename: note.filename
        });
      }
    }

    return results;
  });

  // Quick client-side title filter (for search mode, used as fallback while FTS loads)
  const quickResults = $derived.by(() => {
    if (mode !== 'search') return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const allNotes = notesStore.notes;
    if (allNotes.length === 0) {
      return [];
    }

    return allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(q) || note.filename.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
        if (bTitle.startsWith(q) && !aTitle.startsWith(q)) return 1;
        return aTitle.localeCompare(bTitle);
      })
      .slice(0, 10)
      .map((note) => ({
        id: note.id,
        title: note.title || 'Untitled',
        snippet: '',
        type: note.type,
        filename: note.filename
      }));
  });

  // Combined results: merge quick title matches with FTS content matches (search mode only)
  const searchResults = $derived.by(() => {
    if (mode !== 'search') return [];
    const q = query.trim();
    if (!q) return [];

    // For short queries, just use quick results
    if (q.length < 3) return quickResults;

    // For longer queries, merge quick results (title matches) with FTS results (content matches)
    // FTS results take priority since they have snippets
    if (isLoading) return quickResults; // Show quick results while FTS is loading

    // Merge: title matches first, then FTS content matches
    const quickIds = new Set(quickResults.map((r) => r.id));
    const contentOnlyMatches = ftsResults.filter((r) => !quickIds.has(r.id));

    // Title matches first, then content-only matches (with snippets)
    return [...quickResults, ...contentOnlyMatches].slice(0, 15);
  });

  // Trigger FTS search when query is 3+ chars (search mode only)
  $effect(() => {
    const currentMode = mode;
    const q = query.trim();

    // Cancel any pending search
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Only run FTS in search mode
    if (currentMode !== 'search' || q.length < 3) {
      // Clear FTS results
      ftsResults = [];
      ftsResultsQuery = '';
      return;
    }

    // Debounce the API call
    debounceTimer = setTimeout(async () => {
      try {
        const response = await window.api?.searchNotes({
          query: q,
          limit: 15
        });

        // API returns array directly, not { results: [...] }
        if (Array.isArray(response) && response.length > 0) {
          ftsResults = response.map(
            (r: {
              id: string;
              title: string;
              snippet: string;
              type?: string;
              filename?: string;
              flint_kind?: string;
            }) => ({
              id: r.id,
              title: r.title || 'Untitled',
              snippet: r.snippet || '',
              type: r.type,
              filename: r.filename,
              flint_kind: r.flint_kind
            })
          );
        } else {
          ftsResults = [];
        }
        // Mark that results are now for this query
        ftsResultsQuery = q;
      } catch (error) {
        console.error('Search error:', error);
        ftsResults = [];
        ftsResultsQuery = q; // Still mark as completed even on error
      }
    }, 200);
  });

  // Whether we're showing empty state (no query entered)
  const isEmptyState = $derived(query.trim().length === 0);

  // Recent conversations for agent mode (when no active conversation and no query typed)
  const recentConversations = $derived.by((): ConversationItem[] => {
    if (mode !== 'agent') return [];
    if (agentMessages.length > 0) return []; // Don't show when conversation is active
    if (query.trim().length > 0) return []; // Don't show when user is typing a message

    const threads = unifiedChatStore.sortedThreads;
    return threads.slice(0, 8).map((thread) => {
      const lastMsg = thread.messages[thread.messages.length - 1];
      return {
        id: `conv-${thread.id}`,
        itemType: 'conversation' as const,
        threadId: thread.id,
        title: thread.title,
        lastMessage: lastMsg?.text?.slice(0, 100) || '',
        lastActivity: thread.lastActivity,
        messageCount: thread.messages.length
      };
    });
  });

  // Get all selectable items based on mode (includes mode switchers in empty search state)
  const allSelectableItems = $derived.by((): SelectableItem[] => {
    if (mode === 'actions') {
      // Show all actions when empty, filtered when searching
      return isEmptyState ? searchActions('') : filteredActions;
    }
    if (mode === 'search') {
      if (isEmptyState) {
        // In empty state: mode switchers + recent notes
        return [...modeSwitchers, ...recentNotes];
      }
      return searchResults;
    }
    if (mode === 'agent') {
      // Show recent conversations when no active conversation
      return recentConversations;
    }
    return [];
  });

  // Helper to check if an item is a mode switcher
  function isModeSwitcher(item: SelectableItem): item is ModeSwitcher {
    return 'itemType' in item && item.itemType === 'mode-switcher';
  }

  // Helper to check if an item is a conversation
  function isConversationItem(item: SelectableItem): item is ConversationItem {
    return 'itemType' in item && item.itemType === 'conversation';
  }

  // Index where recent notes start (after mode switchers)
  const recentNotesStartIndex = $derived(
    mode === 'search' && isEmptyState ? modeSwitchers.length : 0
  );

  // Auto-select first recent note when in empty state, otherwise first item
  $effect(() => {
    if (allSelectableItems.length > 0) {
      // In empty search state, start selection at first recent note (if any)
      if (mode === 'search' && isEmptyState && recentNotes.length > 0) {
        selectedIndex = recentNotesStartIndex;
      } else {
        selectedIndex = 0;
      }
    } else {
      selectedIndex = -1;
    }
  });

  function handleInputFocus(): void {
    isInputFocused = true;
    // Reset selection to appropriate starting position
    if (mode === 'search' && isEmptyState && recentNotes.length > 0) {
      selectedIndex = recentNotesStartIndex;
    } else if (allSelectableItems.length > 0) {
      selectedIndex = 0;
    } else {
      selectedIndex = -1;
    }
  }

  function handleInputBlur(): void {
    setTimeout(() => {
      isInputFocused = false;
      // Reset agent state when losing focus (unless continuing to agent panel)
      if (!agentIsLoading) {
        resetAgentState();
      }
    }, 200);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const items = allSelectableItems;

    // Handle wikilink autocomplete navigation in agent mode
    if (wikilinkContext && wikilinkResults.length > 0) {
      if (
        event.key === 'ArrowDown' ||
        (event.key === 'n' && (event.ctrlKey || event.metaKey))
      ) {
        event.preventDefault();
        wikilinkSelectedIndex = Math.min(
          wikilinkSelectedIndex + 1,
          wikilinkResults.length - 1
        );
        return;
      } else if (
        event.key === 'ArrowUp' ||
        (event.key === 'p' && (event.ctrlKey || event.metaKey))
      ) {
        event.preventDefault();
        wikilinkSelectedIndex = Math.max(wikilinkSelectedIndex - 1, 0);
        return;
      } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        const selectedNote = wikilinkResults[wikilinkSelectedIndex];
        if (selectedNote) {
          insertWikilink(selectedNote);
        }
        return;
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const selectedNote = wikilinkResults[wikilinkSelectedIndex];
        if (selectedNote) {
          insertWikilink(selectedNote);
        }
        return;
      } else if (event.key === 'Escape') {
        // Close wikilink autocomplete by removing the [[
        event.preventDefault();
        const before = inputValue.slice(0, wikilinkContext.startIndex);
        inputValue = before;
        return;
      }
    }

    if (
      event.key === 'ArrowDown' ||
      (event.key === 'n' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (
      event.key === 'ArrowUp' ||
      (event.key === 'p' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Handle agent mode - submit the query or open agent panel
      if (mode === 'agent') {
        // Cmd/Ctrl+Enter: open agent panel if we have messages
        if ((event.metaKey || event.ctrlKey) && agentMessages.length > 0) {
          handleOpenInAgentPanel();
        } else if (
          selectedIndex >= 0 &&
          items[selectedIndex] &&
          isConversationItem(items[selectedIndex])
        ) {
          // Select a recent conversation
          const convItem = items[selectedIndex] as ConversationItem;
          loadConversation(convItem.threadId);
        } else {
          // Regular Enter: send the query
          const agentQuery = query.trim();
          if (agentQuery && !agentIsLoading) {
            // Clear the input but keep dropdown open for follow-up
            inputValue = '@';
            sendAgentMessage(agentQuery);
          }
        }
      } else if (selectedIndex >= 0 && items[selectedIndex]) {
        const item = items[selectedIndex];
        if (isModeSwitcher(item)) {
          // Switch to the target mode
          inputValue = item.targetMode;
        } else if (mode === 'actions') {
          executeAction(item as Action);
        } else if (mode === 'search') {
          selectResult(item as SearchResult);
        }
      }
    } else if (event.key === 'Tab' && mode === 'agent' && agentMessages.length > 0) {
      // Tab in agent mode: open agent panel
      event.preventDefault();
      handleOpenInAgentPanel();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearInput();
      resetAgentState();
      (event.target as HTMLInputElement).blur();
    }
  }

  function blurInput(): void {
    const input = document.getElementById('action-bar-input');
    input?.blur();
  }

  function selectResult(result: SearchResult): void {
    // Find the full note metadata to pass to onNoteSelect
    const note = notesStore.notes.find((n) => n.id === result.id);
    if (note) {
      clearInput();
      blurInput();
      onNoteSelect?.(note);
    } else {
      // Note not in store (e.g., type notes) - construct minimal metadata from search result
      const minimalNote: NoteMetadata = {
        id: result.id,
        title: result.title,
        type: result.type || 'unknown',
        filename: result.filename || `${result.id}.md`,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        size: 0,
        path: '',
        flint_kind: result.flint_kind
      };
      clearInput();
      blurInput();
      onNoteSelect?.(minimalNote);
    }
  }

  function executeAction(action: Action): void {
    clearInput();
    blurInput();
    // Execute the action
    action.execute();
    // Also notify parent if needed
    onExecuteAction?.(action.id);
  }

  function clearInput(): void {
    inputValue = '';
    selectedIndex = -1;
    ftsResults = [];
    ftsResultsQuery = '';
  }

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function resetAgentState(): void {
    agentMessages = [];
    agentConversationId = null;
    streamingManager.reset();
  }

  function loadConversation(threadId: string): void {
    const thread = unifiedChatStore.sortedThreads.find((t) => t.id === threadId);
    if (!thread) return;

    // Load the thread's messages into local state
    agentMessages = [...thread.messages];
    agentConversationId = threadId;

    // Clear the query portion of the input but keep agent mode
    inputValue = '@';
  }

  function insertWikilink(note: NoteMetadata): void {
    if (!wikilinkContext) return;

    // Build the wikilink in ID format: [[n-id|title]]
    const wikilink = `[[${note.id}|${note.title}]]`;

    // Replace the [[query with the complete wikilink
    const before = inputValue.slice(0, wikilinkContext.startIndex);
    const after = ''; // Cursor will be after the wikilink

    inputValue = before + wikilink + after;

    // Reset wikilink selection
    wikilinkSelectedIndex = 0;
  }

  async function sendAgentMessage(message: string): Promise<void> {
    if (agentIsLoading) return;

    // Add user message to local conversation
    const userMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: message,
      sender: 'user',
      timestamp: new Date()
    };
    agentMessages = [...agentMessages, userMsg];

    try {
      // Create a conversation ID for backend context if we don't have one
      if (!agentConversationId) {
        agentConversationId = `actionbar-${Date.now()}`;
      }

      // Get the chat service and send the message with streaming
      const chatService = getChatService();
      if (!chatService.sendMessageStream) {
        throw new Error('Streaming not supported');
      }

      // Start streaming and get handlers from the manager
      const handlers = streamingManager.startStreaming();

      chatService.sendMessageStream(
        message,
        agentConversationId,
        handlers.onChunk,
        handlers.onComplete,
        handlers.onError,
        undefined, // model - use default
        handlers.onToolCall,
        handlers.onToolResult
      );
    } catch {
      streamingManager.reset();
      // Set error state manually since manager.reset() clears it
      // We need to handle this case differently
    }
  }

  async function handleOpenInAgentPanel(): Promise<void> {
    if (agentMessages.length === 0) return;

    try {
      // Ensure the chat store is initialized
      await unifiedChatStore.ensureInitialized();

      // Create a new thread and add all messages
      await unifiedChatStore.createThread();

      // Add all local messages to the thread
      for (const msg of agentMessages) {
        const message: Message = {
          id: msg.id,
          text: msg.text,
          sender: msg.sender,
          timestamp: new Date(),
          toolCalls: msg.toolCalls,
          currentStepIndex: msg.currentStepIndex
        };
        await unifiedChatStore.addMessage(message);
      }

      // Clear local state and close action bar
      clearInput();
      resetAgentState();
      blurInput();

      // Notify parent to open the agent panel
      onOpenAgentPanel?.();
    } catch (error) {
      console.error('Failed to open in agent panel:', error);
    }
  }

  function handleClearClick(): void {
    clearInput();
    resetAgentState();
    // Re-focus the input after clearing
    const input = document.getElementById('action-bar-input');
    input?.focus();
  }
</script>

<div class="action-bar-container" class:dropdown-open={isInputFocused}>
  <div class="action-bar-input-wrapper">
    <!-- Icon changes based on mode -->
    {#if mode === 'actions'}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    {:else if mode === 'agent'}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"
        />
      </svg>
    {:else}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clip-rule="evenodd"
        />
      </svg>
    {/if}
    <input
      id="action-bar-input"
      type="text"
      {placeholder}
      bind:value={inputValue}
      onfocus={handleInputFocus}
      onblur={handleInputBlur}
      onkeydown={handleKeyDown}
      class="action-bar-input"
    />
    {#if inputValue}
      <button class="clear-button" onclick={handleClearClick} aria-label="Clear input">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    {/if}
    {#if isLoading}
      <div class="loading-indicator">
        <div class="spinner"></div>
      </div>
    {/if}
  </div>

  {#if isInputFocused}
    <div class="action-bar-dropdown">
      <!-- Search mode -->
      {#if mode === 'search'}
        {#if isEmptyState}
          <!-- Empty state: mode switchers and recent notes -->
          <div class="mode-switchers">
            <button
              class="mode-switch-item"
              class:selected={selectedIndex === 0}
              onclick={() => {
                inputValue = '/';
              }}
            >
              <span class="mode-switch-label">Search Actions & Commands</span>
              <span class="mode-switch-key">/</span>
            </button>
            <button
              class="mode-switch-item"
              class:selected={selectedIndex === 1}
              onclick={() => {
                inputValue = '@';
              }}
            >
              <span class="mode-switch-label">Chat with Agent</span>
              <span class="mode-switch-key">@</span>
            </button>
          </div>
          {#if recentNotes.length > 0}
            <div class="section-header">Recent Notes</div>
            <div class="search-results">
              {#each recentNotes as result, index (result.id)}
                <button
                  class="search-result-item"
                  class:selected={index + recentNotesStartIndex === selectedIndex}
                  onclick={() => selectResult(result)}
                >
                  <div class="result-title">
                    {result.title || 'Untitled'}
                  </div>
                  <div class="result-meta">
                    {#if result.filename}
                      <span class="result-path">{result.filename}</span>
                    {/if}
                    {#if result.type}
                      <span class="result-type">{result.type}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        {:else if searchResults.length > 0}
          <div class="search-results">
            {#each searchResults as result, index (result.id)}
              <button
                class="search-result-item"
                class:selected={index === selectedIndex}
                onclick={() => selectResult(result)}
              >
                <div class="result-title">
                  {result.title || 'Untitled'}
                </div>
                {#if result.snippet}
                  <div class="result-snippet">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html result.snippet}
                  </div>
                {/if}
                <div class="result-meta">
                  {#if result.filename}
                    <span class="result-path">{result.filename}</span>
                  {/if}
                  {#if result.type}
                    <span class="result-type">{result.type}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="loading-placeholder">
            {#if query.trim().length >= 3 && isLoading}
              Searching...
            {:else}
              No results
            {/if}
          </div>
        {/if}

        <!-- Actions mode -->
      {:else if mode === 'actions'}
        {#if isEmptyState}
          <div class="section-header">All Actions</div>
        {/if}
        {#if allSelectableItems.length > 0}
          <div class="action-results">
            {#each allSelectableItems as item, index (item.id)}
              {@const action = item as Action}
              <button
                class="action-item"
                class:selected={index === selectedIndex}
                onclick={() => executeAction(action)}
              >
                <div class="action-main">
                  <span class="action-label">{action.label}</span>
                  {#if action.shortcut}
                    <span class="action-shortcut">{action.shortcut}</span>
                  {/if}
                </div>
                {#if action.description}
                  <div class="action-description">{action.description}</div>
                {/if}
                <div class="action-meta">
                  <span class="action-category">{action.category}</span>
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="loading-placeholder">No matching actions</div>
        {/if}

        <!-- Agent mode -->
      {:else if mode === 'agent'}
        <div class="agent-container">
          <!-- Wikilink autocomplete overlay -->
          {#if wikilinkContext && wikilinkResults.length > 0}
            <div class="wikilink-autocomplete">
              <div class="wikilink-header">Link to note</div>
              <div class="wikilink-results">
                {#each wikilinkResults as note, index (note.id)}
                  <button
                    class="wikilink-item"
                    class:selected={index === wikilinkSelectedIndex}
                    onclick={() => insertWikilink(note)}
                  >
                    <div class="wikilink-title">{note.title || 'Untitled'}</div>
                    <div class="wikilink-meta">
                      {#if note.type}
                        <span class="wikilink-type">{note.type}</span>
                      {/if}
                      <span class="wikilink-id">{note.id}</span>
                    </div>
                  </button>
                {/each}
              </div>
              <div class="wikilink-hint">
                <span>↑↓ navigate</span>
                <span>Enter/Tab select</span>
                <span>Esc cancel</span>
              </div>
            </div>
          {:else if agentMessages.length > 0 || agentIsLoading || agentError}
            <!-- Show conversation history -->
            <div class="agent-conversation">
              {#each agentMessages as msg (msg.id)}
                {#if msg.sender === 'user'}
                  <div class="agent-user-message">
                    <span class="agent-user-label">You</span>
                    <div class="agent-user-text">
                      <MarkdownRenderer text={msg.text} {onNoteClick} />
                    </div>
                  </div>
                {:else}
                  <!-- Agent message - can have text, tool calls, or both -->
                  <div class="agent-response">
                    {#if msg.text.trim()}
                      <div class="agent-response-text agent-markdown">
                        <MarkdownRenderer text={msg.text} {onNoteClick} />
                      </div>
                    {/if}
                    {#if msg.toolCalls && msg.toolCalls.length > 0}
                      <div class="agent-tool-calls">
                        <AgentActivityWidget
                          toolCalls={msg.toolCalls}
                          currentStepIndex={agentIsLoading ? currentStepIndex : undefined}
                        />
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}

              {#if agentError}
                <div class="agent-error">
                  <svg class="agent-error-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>{agentError}</span>
                </div>
              {:else if agentIsLoading && !agentStreamingText && currentToolCalls.length === 0}
                <!-- Show thinking indicator only when no content is streaming yet -->
                <div class="agent-streaming">
                  <div class="agent-loading">
                    <div class="agent-loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span>Thinking...</span>
                  </div>
                </div>
              {/if}
            </div>

            {#if agentMessages.length > 0 && !agentIsLoading}
              <div class="agent-actions">
                <div class="agent-hint">Type a follow-up or</div>
                <button class="agent-open-btn" onclick={handleOpenInAgentPanel}>
                  <span>Open in Agent panel</span>
                  <span class="agent-open-shortcut">{isMacOS ? '⌘' : 'Ctrl'}+Enter</span>
                </button>
              </div>
            {/if}
          {:else if query.trim()}
            <div class="agent-ready">
              <svg class="agent-ready-icon" viewBox="0 0 20 20" fill="currentColor">
                <path
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"
                />
              </svg>
              <span>Press Enter to send to Agent</span>
            </div>
          {:else if recentConversations.length > 0}
            <!-- Show recent conversations -->
            <div class="agent-conversations">
              <div class="conversations-header">Recent Conversations</div>
              <div class="conversations-list">
                {#each recentConversations as conv, index (conv.id)}
                  <button
                    class="conversation-item"
                    class:selected={index === selectedIndex}
                    onclick={() => loadConversation(conv.threadId)}
                  >
                    <div class="conversation-title">{conv.title}</div>
                    <div class="conversation-meta">
                      <span class="conversation-count">{conv.messageCount} messages</span>
                      <span class="conversation-time"
                        >{formatRelativeTime(conv.lastActivity)}</span
                      >
                    </div>
                    {#if conv.lastMessage}
                      <div class="conversation-preview">{conv.lastMessage}</div>
                    {/if}
                  </button>
                {/each}
              </div>
              <div class="conversations-hint">
                <span>↑↓ navigate</span>
                <span>Enter to open</span>
                <span>or type to start new</span>
              </div>
            </div>
          {:else}
            <div class="agent-welcome">
              <div class="agent-message">Chat with the AI Agent</div>
              <div class="agent-hint">Type your question and press Enter</div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .action-bar-container {
    position: relative;
    width: 100%;
    max-width: 500px;
    min-width: 200px;
  }

  /* Unified container styling when dropdown is open */
  .action-bar-container.dropdown-open {
    border-radius: 0.5rem;
    box-shadow:
      0 10px 25px rgba(0, 0, 0, 0.2),
      0 4px 10px rgba(0, 0, 0, 0.1);
  }

  .action-bar-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .mode-icon {
    position: absolute;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
    pointer-events: none;
    z-index: 3;
  }

  .action-bar-input {
    width: 100%;
    padding: 0.5rem 2.5rem 0.5rem 2.25rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    height: 32px;
  }

  .action-bar-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  /* When dropdown is open, connect input to dropdown */
  .dropdown-open .action-bar-input {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: none;
    box-shadow: none;
  }

  .dropdown-open .action-bar-input:focus {
    box-shadow: none;
  }

  .action-bar-input::placeholder {
    color: var(--text-placeholder);
  }

  .clear-button {
    position: absolute;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .loading-indicator {
    position: absolute;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .action-bar-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--accent-primary);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    box-shadow: none;
    z-index: 1001;
    margin-top: 0;
    overflow: hidden;
  }

  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .search-results::-webkit-scrollbar {
    width: 8px;
  }

  .search-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .search-results::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .search-results::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .search-result-item {
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover,
  .search-result-item.selected {
    background: var(--bg-secondary);
  }

  .result-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
  }

  .result-snippet {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 0.375rem;
    line-height: 1.4;
    /* Truncate long snippets */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Highlight matched text in snippets */
  .result-snippet :global(mark) {
    background: var(--accent-secondary-alpha);
    color: var(--accent-primary);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
    font-weight: 500;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .result-path {
    font-size: 0.7rem;
    color: var(--text-muted);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-type {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    flex-shrink: 0;
  }

  .loading-placeholder {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Mode switchers for empty state */
  .mode-switchers {
    border-bottom: 1px solid var(--border-light);
  }

  .mode-switch-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .mode-switch-item:last-child {
    border-bottom: none;
  }

  .mode-switch-item:hover,
  .mode-switch-item.selected {
    background: var(--bg-secondary);
  }

  .mode-switch-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .mode-switch-key {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
  }

  .section-header {
    padding: 0.5rem 1rem;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
  }

  /* Actions mode styles */
  .action-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .action-results::-webkit-scrollbar {
    width: 8px;
  }

  .action-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .action-results::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .action-results::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .action-item {
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .action-item:last-child {
    border-bottom: none;
  }

  .action-item:hover,
  .action-item.selected {
    background: var(--bg-secondary);
  }

  .action-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .action-label {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .action-shortcut {
    font-size: 0.7rem;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
    flex-shrink: 0;
  }

  .action-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
    line-height: 1.3;
  }

  .action-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .action-category {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* Agent mode styles */
  .agent-container {
    max-height: 300px;
    overflow-y: auto;
  }

  /* Recent conversations list */
  .agent-conversations {
    padding: 0.5rem;
  }

  .conversations-header {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.5rem 0.5rem;
  }

  .conversations-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .conversation-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
    width: 100%;
  }

  .conversation-item:hover {
    background: var(--bg-tertiary);
  }

  .conversation-item.selected {
    background: var(--bg-tertiary);
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .conversation-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  .conversation-count {
    color: var(--text-secondary);
  }

  .conversation-preview {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.8;
  }

  .conversations-hint {
    display: flex;
    gap: 1rem;
    justify-content: center;
    padding: 0.5rem;
    font-size: 0.6875rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border-light);
    margin-top: 0.5rem;
  }

  .agent-welcome {
    padding: 1.5rem 1rem;
    text-align: center;
  }

  .agent-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .agent-hint {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .agent-ready {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .agent-ready-icon {
    width: 1rem;
    height: 1rem;
  }

  .agent-conversation {
    padding: 0.75rem 1rem;
  }

  .agent-user-message {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .agent-user-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .agent-user-text {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .agent-streaming {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .agent-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .agent-loading-dots {
    display: flex;
    gap: 0.25rem;
  }

  .agent-loading-dots span {
    width: 6px;
    height: 6px;
    background: var(--accent-primary);
    border-radius: 50%;
    animation: agent-dot-pulse 1.4s ease-in-out infinite;
  }

  .agent-loading-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .agent-loading-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes agent-dot-pulse {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .agent-response {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .agent-response-text {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Tool calls styling */
  .agent-tool-calls {
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
  }

  .agent-tool-calls :global(.activity-widget) {
    background: var(--bg-secondary);
    border-radius: 0.375rem;
    padding: 0.5rem;
  }

  .agent-tool-calls :global(.activity-header) {
    font-size: 0.75rem;
  }

  .agent-tool-calls :global(.tool-item) {
    font-size: 0.75rem;
    padding: 0.25rem 0;
  }

  /* Markdown styling for agent responses */
  .agent-markdown {
    white-space: normal;
  }

  .agent-markdown :global(p) {
    margin: 0 0 0.5rem 0;
  }

  .agent-markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .agent-markdown :global(ul),
  .agent-markdown :global(ol) {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }

  .agent-markdown :global(li) {
    margin: 0.125rem 0;
  }

  .agent-markdown :global(code) {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    background: var(--bg-tertiary);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
  }

  .agent-markdown :global(pre) {
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
    overflow-x: auto;
  }

  .agent-markdown :global(pre code) {
    background: none;
    padding: 0;
  }

  .agent-markdown :global(blockquote) {
    margin: 0.5rem 0;
    padding-left: 0.75rem;
    border-left: 2px solid var(--border-light);
    color: var(--text-secondary);
    font-style: italic;
  }

  .agent-markdown :global(h1),
  .agent-markdown :global(h2),
  .agent-markdown :global(h3),
  .agent-markdown :global(h4),
  .agent-markdown :global(h5),
  .agent-markdown :global(h6) {
    margin: 0.5rem 0 0.25rem 0;
    font-weight: 600;
  }

  .agent-markdown :global(h1) {
    font-size: 1rem;
  }

  .agent-markdown :global(h2) {
    font-size: 0.95rem;
  }

  .agent-markdown :global(h3),
  .agent-markdown :global(h4),
  .agent-markdown :global(h5),
  .agent-markdown :global(h6) {
    font-size: 0.9rem;
  }

  /* Note link styling in agent responses */
  .agent-markdown :global(.note-link) {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.4rem;
    background: var(--accent-secondary-alpha);
    border: none;
    border-radius: 0.25rem;
    color: var(--accent-primary);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.15s ease;
  }

  .agent-markdown :global(.note-link:hover) {
    background: var(--accent-primary);
    color: white;
  }

  .agent-markdown :global(.note-link-icon) {
    font-size: 0.75rem;
  }

  .agent-error {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    border-radius: 0.5rem;
    color: var(--error-text, #ef4444);
    font-size: 0.875rem;
  }

  .agent-error-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .agent-actions {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .agent-actions .agent-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0;
  }

  .agent-open-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .agent-open-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--accent-primary);
  }

  .agent-open-shortcut {
    font-size: 0.65rem;
    opacity: 0.7;
    font-family: var(--font-mono, monospace);
  }

  /* Wikilink autocomplete styles */
  .wikilink-autocomplete {
    display: flex;
    flex-direction: column;
  }

  .wikilink-header {
    padding: 0.5rem 1rem;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
  }

  .wikilink-results {
    max-height: 250px;
    overflow-y: auto;
  }

  .wikilink-results::-webkit-scrollbar {
    width: 8px;
  }

  .wikilink-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .wikilink-results::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .wikilink-results::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .wikilink-item {
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .wikilink-item:last-child {
    border-bottom: none;
  }

  .wikilink-item:hover,
  .wikilink-item.selected {
    background: var(--bg-secondary);
  }

  .wikilink-title {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .wikilink-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .wikilink-type {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .wikilink-id {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-family: var(--font-mono, monospace);
  }

  .wikilink-hint {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    display: flex;
    gap: 1rem;
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .action-bar-container {
      max-width: 200px;
      min-width: 150px;
    }

    .action-bar-input {
      font-size: 0.8rem;
      padding: 0.4rem 2rem 0.4rem 2rem;
    }

    .mode-icon {
      left: 0.6rem;
      width: 0.9rem;
      height: 0.9rem;
    }
  }
</style>
