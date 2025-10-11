<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import FirstTimeExperience from './components/FirstTimeExperience.svelte';
  import UpdateIndicator from './components/UpdateIndicator.svelte';
  import MessageBusDebugPanel from './components/MessageBusDebugPanel.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore.svelte';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore.svelte';
  import { modelStore } from './stores/modelStore.svelte';
  import { sidebarState } from './stores/sidebarState.svelte';
  import { temporaryTabsStore } from './stores/temporaryTabsStore.svelte';
  import { unifiedChatStore } from './stores/unifiedChatStore.svelte';
  import { noteNavigationService } from './services/noteNavigationService.svelte';
  import { activeNoteStore } from './stores/activeNoteStore.svelte';
  import { cursorPositionStore } from './services/cursorPositionStore.svelte';
  import { vaultAvailabilityService } from './services/vaultAvailabilityService.svelte';
  import { dailyViewStore } from './stores/dailyViewStore.svelte';
  import { inboxStore } from './stores/inboxStore.svelte';
  import type { CreateVaultResult } from '@/server/api/types';
  import { messageBus } from './services/messageBus.svelte';
  import type { NoteEvent } from './services/messageBus.svelte';

  // Initialize unified chat store effects
  unifiedChatStore.initializeEffects();

  // Forward note events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onNoteEvent((event) => {
      messageBus.publish(event as NoteEvent);
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Add app lifecycle integration for cursor position persistence
  $effect(() => {
    const handleBeforeUnload = async (): Promise<void> => {
      try {
        await cursorPositionStore.flushPendingSaves();
      } catch (error) {
        console.warn('Failed to flush cursor position saves on app close:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Initialize inbox count
    async function initializeInbox(): Promise<void> {
      try {
        const chatService = getChatService();
        const vault = await chatService.getCurrentVault();
        if (vault) {
          await inboxStore.updateUnprocessedCount(vault.id);
        }
      } catch (error) {
        console.error('Failed to initialize inbox count:', error);
      }
    }
    initializeInbox();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  // Messages are now managed by unifiedChatStore
  const messages = $derived(unifiedChatStore.activeThread?.messages || []);

  let isLoadingResponse = $state(false);
  let activeSystemView = $state<'inbox' | 'daily' | 'notes' | 'settings' | null>(null);

  async function handleNoteSelect(note: NoteMetadata): Promise<void> {
    await noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
      activeSystemView = null;
    });
  }

  async function handleCreateNote(
    noteType?: string,
    fromKeyboard: boolean = false
  ): Promise<void> {
    // For keyboard shortcuts, create note directly
    if (fromKeyboard) {
      try {
        // Get the current vault ID
        const chatService = getChatService();
        const currentVault = await chatService.getCurrentVault();
        if (!currentVault) {
          console.error('No current vault available for note creation');
          return;
        }

        // Create note without title (empty string will generate unique identifier)
        const type = noteType || 'note'; // Default to 'note' type
        const identifier = ''; // Empty identifier for untitled notes
        const content = ``;

        // Create the note via the chat service
        const noteInfo = await chatService.createNote({
          type,
          identifier,
          content,
          vaultId: currentVault.id
        });

        // Note: The message bus will automatically update the note cache when IPC events are published

        // Find the newly created note and open it through navigation service
        const notes = notesStore.notes;
        const newNote = notes.find((n) => n.id === noteInfo.id);
        if (newNote) {
          await noteNavigationService.openNote(
            newNote,
            'navigation',
            openNoteEditor,
            () => {
              activeSystemView = null;
            }
          );
        }
      } catch (error) {
        console.error('Failed to create note:', error);
        // Log error for debugging
        console.error('Note creation failed, but no fallback modal available');
      }
    } else {
      // For UI clicks, create note directly (no modal)
      await handleCreateNote(noteType, true);
    }
  }

  async function handleSystemViewSelect(
    view: 'inbox' | 'daily' | 'notes' | 'settings' | null
  ): Promise<void> {
    // If clicking the same view that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.leftSidebar.visible && activeSystemView === view && view !== null) {
      sidebarState.toggleLeftSidebar();
    } else {
      activeSystemView = view;
      // Clear active note when switching to system views
      if (view !== null) {
        await activeNoteStore.clearActiveNote();
      }
      // If sidebar is closed, open it when selecting a view
      if (!sidebarState.leftSidebar.visible && view !== null) {
        sidebarState.toggleLeftSidebar();
      }
    }
  }

  async function handleNoteClick(noteId: string): Promise<void> {
    // Find the note in the notes store
    const notes = notesStore.notes;
    const note = notes.find(
      (n) => n.filename === noteId || n.id === noteId || n.title === noteId
    );

    if (note) {
      await noteNavigationService.openNote(note, 'wikilink', openNoteEditor);
    } else {
      console.warn('Note not found:', noteId);
    }
  }

  async function openNoteEditor(note: NoteMetadata): Promise<void> {
    await activeNoteStore.setActiveNote(note);
  }

  async function closeNoteEditor(): Promise<void> {
    await activeNoteStore.clearActiveNote();
  }

  function handleNavigationBack(): void {
    noteNavigationService.goBack();
  }

  function handleNavigationForward(): void {
    noteNavigationService.goForward();
  }

  // Platform detection setup
  $effect(() => {
    // Set data attribute for platform detection
    const isMacOS = navigator.platform.includes('Mac');
    document.documentElement.setAttribute('data-platform', isMacOS ? 'macos' : 'other');
  });

  // Restore active note on app startup
  $effect(() => {
    async function restoreNote(): Promise<void> {
      try {
        // Wait for the notes store to finish loading before restoring the active note
        // This ensures wikilinks have the complete note data for proper resolution
        const checkNotesLoaded = (): Promise<void> => {
          return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (!notesStore.loading && notesStore.notes.length >= 0) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 50);
          });
        };

        await checkNotesLoaded();

        const restoredNote = await activeNoteStore.restoreActiveNote();
        if (restoredNote) {
          console.log('Restored active note:', restoredNote.title);

          // If we have a restored note and no system view is active,
          // we don't need to call openNoteEditor since the store already has it
          if (activeSystemView === null) {
            // The note is already set in the store, we just need to ensure
            // the navigation service is informed
            await noteNavigationService.openNote(
              restoredNote,
              'navigation',
              () => {
                // Note is already set in store, no need to set again
              },
              () => {
                activeSystemView = null;
              }
            );
          }
        }
      } catch (error) {
        console.warn('Failed to restore active note:', error);
      }
    }

    restoreNote();
  });

  // Global keyboard shortcuts
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd + Shift + N to create new note
      if (event.key === 'n' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleCreateNote(undefined, true);
      }

      // Ctrl/Cmd + O to focus search
      if (event.key === 'o' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const searchInput = document.getElementById('global-search');
        searchInput?.focus();
      }

      // Ctrl/Cmd + Shift + [ to go back
      if (event.key === '[' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleNavigationBack();
      }

      // Ctrl/Cmd + Shift + ] to go forward
      if (event.key === ']' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleNavigationForward();
      }

      // Ctrl/Cmd + , to open settings (handled by system views now)
      if (event.key === ',' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        // Settings are now handled via system views in left sidebar
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  // Wikilink navigation event listener
  $effect(() => {
    async function handleWikilinkNavigate(event: CustomEvent): Promise<void> {
      const { note } = event.detail;
      if (note) {
        await noteNavigationService.openNote(note, 'wikilink', openNoteEditor, () => {
          activeSystemView = null;
        });
      }
    }

    document.addEventListener(
      'wikilink-navigate',
      handleWikilinkNavigate as unknown as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'wikilink-navigate',
        handleWikilinkNavigate as unknown as (event: Event) => void
      );
  });

  // Handle unpinned notes event from navigation service
  $effect(() => {
    const handleNotesUnpinned: (event: Event) => void = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { noteIds } = customEvent.detail;

      // Add unpinned notes to temporary tabs
      for (const noteId of noteIds) {
        await temporaryTabsStore.addTab(noteId, 'navigation');
      }
    };

    document.addEventListener('notes-unpinned', handleNotesUnpinned);
    return () => document.removeEventListener('notes-unpinned', handleNotesUnpinned);
  });

  // Handle browser navigation (back/forward buttons)
  $effect(() => {
    function handlePopState(event: PopStateEvent): void {
      noteNavigationService.handlePopState(event);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  // Handle history navigation events from navigation service
  $effect(() => {
    async function handleHistoryNavigate(event: CustomEvent): Promise<void> {
      const { noteId, title, scrollPosition } = event.detail;

      // Find the note and open it
      const note = notesStore.notes.find((n) => n.id === noteId);
      if (note) {
        await noteNavigationService.openNote(note, 'history', openNoteEditor, () => {
          activeSystemView = null;
        });

        // Restore scroll position if available
        if (scrollPosition && typeof scrollPosition === 'number') {
          setTimeout(() => {
            window.scrollTo(0, scrollPosition);
          }, 100);
        }
      } else {
        console.warn('Note not found for history navigation:', noteId, title);
      }
    }

    document.addEventListener(
      'history-navigate',
      handleHistoryNavigate as unknown as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'history-navigate',
        handleHistoryNavigate as unknown as (event: Event) => void
      );
  });

  function generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async function handleSendMessage(text: string): Promise<void> {
    const newMessage: Message = {
      id: generateUniqueId(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    await unifiedChatStore.addMessage(newMessage);

    isLoadingResponse = true;

    // Create a placeholder message for streaming response
    const agentResponseId = generateUniqueId();
    const agentResponse: Message = {
      id: agentResponseId,
      text: '',
      sender: 'agent',
      timestamp: new Date(),
      toolCalls: []
    };
    await unifiedChatStore.addMessage(agentResponse);

    // Track streaming state to handle tool call separation
    let currentMessageId = agentResponseId;
    let hasToolCalls = false;

    try {
      const chatService = getChatService();

      // Use streaming if available, otherwise fall back to regular sendMessage
      if (chatService.sendMessageStream) {
        chatService.sendMessageStream(
          text,
          unifiedChatStore.activeThreadId || undefined,
          // onChunk: append text chunks to the current message
          async (chunk: string) => {
            const currentMessage = unifiedChatStore.activeThread?.messages?.find(
              (m) => m.id === currentMessageId
            );
            if (currentMessage) {
              await unifiedChatStore.updateMessage(currentMessageId, {
                text: currentMessage.text + chunk
              });
            }
          },
          // onComplete: streaming finished
          async (_fullText: string) => {
            // Clean up any empty messages that were created for post-tool-call text
            if (hasToolCalls) {
              const thread = unifiedChatStore.activeThread;
              if (thread) {
                // Filter out any empty messages (no text and no tool calls)
                const filteredMessages = thread.messages.filter((message) => {
                  // Keep messages with text content
                  if (message.text.trim() !== '') return true;
                  // Keep messages with tool calls
                  if (message.toolCalls && message.toolCalls.length > 0) return true;
                  // Remove empty messages
                  return false;
                });

                // Only update if we actually removed some messages
                if (filteredMessages.length !== thread.messages.length) {
                  await unifiedChatStore.updateThread(thread.id, {
                    messages: filteredMessages
                  });
                }
              }
            }
            isLoadingResponse = false;
          },
          // onError: handle streaming errors
          async (error: string) => {
            console.error('Streaming error:', error);
            await unifiedChatStore.updateMessage(currentMessageId, {
              text: 'Sorry, I encountered an error while processing your message.'
            });
            isLoadingResponse = false;
          },
          modelStore.selectedModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (toolCall: any) => {
            // Add the tool call to the current message that's receiving streamed text
            const currentMessage = unifiedChatStore.activeThread?.messages?.find(
              (m) => m.id === currentMessageId
            );
            if (currentMessage) {
              const updatedToolCalls = [...(currentMessage.toolCalls || []), toolCall];
              await unifiedChatStore.updateMessage(currentMessageId, {
                toolCalls: updatedToolCalls
              });
              hasToolCalls = true;

              // Create a new message for any text that comes after this tool call
              const postToolCallMessageId = generateUniqueId();
              const postToolCallMessage: Message = {
                id: postToolCallMessageId,
                text: '',
                sender: 'agent',
                timestamp: new Date(),
                toolCalls: []
              };
              await unifiedChatStore.addMessage(postToolCallMessage);
              currentMessageId = postToolCallMessageId;
            }
          }
        );
      } else {
        // Fallback to non-streaming mode
        const response = await chatService.sendMessage(
          text,
          unifiedChatStore.activeThreadId || undefined,
          modelStore.selectedModel
        );

        // Update the placeholder message with the complete response
        await unifiedChatStore.updateMessage(agentResponseId, {
          text: response.text,
          toolCalls: response.toolCalls
        });

        isLoadingResponse = false;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      await unifiedChatStore.updateMessage(agentResponseId, {
        text: 'Sorry, I encountered an error while processing your message.'
      });
      isLoadingResponse = false;
    }
  }

  function toggleLeftSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }

  function setRightSidebarMode(mode: 'ai' | 'threads' | 'notes'): void {
    // If clicking the same mode that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.rightSidebar.visible && sidebarState.rightSidebar.mode === mode) {
      sidebarState.toggleRightSidebar();
    } else {
      // If sidebar is closed, open it first
      if (!sidebarState.rightSidebar.visible) {
        sidebarState.toggleRightSidebar();
      }
      sidebarState.setRightSidebarMode(mode);
    }
  }

  // Window control functions
  function minimizeWindow(): void {
    window.electron?.ipcRenderer.send('window-minimize');
  }

  function maximizeWindow(): void {
    window.electron?.ipcRenderer.send('window-maximize');
  }

  function closeWindow(): void {
    window.electron?.ipcRenderer.send('window-close');
  }

  // Handle vault creation from first-time experience
  async function handleVaultCreatedFromFirstTime(
    vault: CreateVaultResult
  ): Promise<void> {
    console.log('App.svelte: handleVaultCreatedFromFirstTime called with vault:', vault);
    console.log('App.svelte: vault.isNewVault =', vault.isNewVault);
    console.log('App.svelte: vault.initialNoteId =', vault.initialNoteId);

    // The vault availability service should already be updated by FirstTimeExperience
    // Now we need to trigger reinitialization of the note service and refresh stores
    try {
      // Reinitialize the note service in the main process
      const result = await window.api?.reinitializeNoteService();
      if (result?.success) {
        console.log('Note service reinitialized successfully');

        // Publish vault switched event - noteStore will automatically reinitialize
        messageBus.publish({
          type: 'vault.switched',
          vaultId: vault.id
        });
        console.log('Vault switched event published for vault:', vault.id);

        // Reinitialize the daily view store now that a vault is available
        await dailyViewStore.reinitialize();
        console.log('Daily view store reinitialized after vault creation');

        // NOW add initial note tab AFTER vault switching is complete
        // This ensures we have the correct vault ID in temporary tabs store
        console.log('App.svelte: Checking if should add initial note...');
        console.log('App.svelte: vault.isNewVault =', vault.isNewVault);
        console.log('App.svelte: vault.initialNoteId =', vault.initialNoteId);
        if (vault.isNewVault && vault.initialNoteId) {
          console.log('App.svelte: Adding initial note to tabs:', vault.initialNoteId);
          await temporaryTabsStore.addTutorialNoteTabs([vault.initialNoteId]);
          console.log('App.svelte: Initial note added to tabs');
        } else {
          console.log('App.svelte: NOT adding initial note - conditions not met');
        }

        console.log(vault.isNewVault ? 'New vault created' : 'Existing vault opened');
      } else {
        console.error('Failed to reinitialize note service:', result?.error);
      }
    } catch (error) {
      console.error('Failed to reinitialize services after vault creation:', error);
    }
  }
</script>

{#if vaultAvailabilityService.isLoading}
  <!-- Loading state while checking for vaults -->
  <div class="app loading-state">
    <div class="loading-content">
      <div class="loading-spinner">🔥</div>
      <p>Loading Flint...</p>
    </div>
  </div>
{:else if !vaultAvailabilityService.hasVaults}
  <!-- First-time experience when no vaults exist -->
  <FirstTimeExperience onVaultCreated={handleVaultCreatedFromFirstTime} />
{:else}
  <!-- Normal app interface when vaults are available -->
  <div class="app">
    <!-- Custom title bar with drag region -->
    <div class="title-bar">
      <div class="title-bar-content">
        <!-- Traffic light spacing for macOS -->
        <div class="traffic-light-spacer"></div>
        <div class="title-bar-left">
          <button
            class="hamburger-button"
            onclick={toggleLeftSidebar}
            aria-label="Toggle sidebar"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <VaultSwitcher onNoteClose={closeNoteEditor} />
          <div class="navigation-controls">
            <button
              class="nav-btn"
              class:disabled={!noteNavigationService.canGoBack}
              onclick={handleNavigationBack}
              disabled={!noteNavigationService.canGoBack}
              aria-label="Go back"
              title="Go back (Cmd/Ctrl + Shift + [)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              class="nav-btn"
              class:disabled={!noteNavigationService.canGoForward}
              onclick={handleNavigationForward}
              disabled={!noteNavigationService.canGoForward}
              aria-label="Go forward"
              title="Go forward (Cmd/Ctrl + Shift + ])"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <SearchBar onNoteSelect={handleNoteSelect} />
        </div>
        <div class="title-bar-drag-center"></div>
        <div class="title-bar-controls">
          <UpdateIndicator />
          <div class="pillbox-controls">
            <button
              class="pillbox-btn pillbox-btn-left"
              class:active={sidebarState.rightSidebar.visible &&
                sidebarState.rightSidebar.mode === 'ai'}
              onclick={() => setRightSidebarMode('ai')}
              aria-label="AI Assistant"
              title="AI Assistant"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                ></path>
              </svg>
            </button>
            <button
              class="pillbox-btn pillbox-btn-middle"
              class:active={sidebarState.rightSidebar.visible &&
                sidebarState.rightSidebar.mode === 'threads'}
              onclick={() => setRightSidebarMode('threads')}
              aria-label="Agent Threads"
              title="Agent Threads"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                ></path>
                <path d="M13 8l-2 2-2-2"></path>
              </svg>
            </button>
            <button
              class="pillbox-btn pillbox-btn-right"
              class:active={sidebarState.rightSidebar.visible &&
                sidebarState.rightSidebar.mode === 'notes'}
              onclick={() => setRightSidebarMode('notes')}
              aria-label="Sidebar Notes"
              title="Sidebar Notes"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                ></path>
              </svg>
            </button>
          </div>

          <!-- Window controls for non-macOS platforms -->
          <div class="window-controls">
            <button
              class="window-control-btn minimize-btn"
              onclick={minimizeWindow}
              aria-label="Minimize window"
              title="Minimize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M 2,6 10,6" stroke="currentColor" stroke-width="1" />
              </svg>
            </button>
            <button
              class="window-control-btn maximize-btn"
              onclick={maximizeWindow}
              aria-label="Maximize window"
              title="Maximize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M 2,2 2,10 10,10 10,2 Z"
                  stroke="currentColor"
                  stroke-width="1"
                  fill="none"
                />
              </svg>
            </button>
            <button
              class="window-control-btn close-btn"
              onclick={closeWindow}
              aria-label="Close window"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M 3,3 9,9 M 9,3 3,9" stroke="currentColor" stroke-width="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="app-layout">
      <LeftSidebar
        activeNote={activeNoteStore.activeNote}
        {activeSystemView}
        onNoteSelect={handleNoteSelect}
        onSystemViewSelect={handleSystemViewSelect}
        onCreateNote={(noteType) => handleCreateNote(noteType)}
      />

      <MainView
        activeNote={activeNoteStore.activeNote}
        {activeSystemView}
        noteTypes={notesStore.noteTypes}
        onClose={closeNoteEditor}
        onNoteSelect={handleNoteSelect}
        onCreateNote={handleCreateNote}
      />

      <RightSidebar
        {messages}
        isLoading={isLoadingResponse}
        onNoteClick={handleNoteClick}
        onSendMessage={handleSendMessage}
      />
    </div>

    <!-- Debug Panel (only in development) -->
    <MessageBusDebugPanel />
  </div>
{/if}

<style>
  .app {
    height: 100vh;
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
    display: flex;
    flex-direction: column;
  }

  .app.loading-state {
    align-items: center;
    justify-content: center;
  }

  .loading-content {
    text-align: center;
    color: var(--text-secondary);
  }

  .loading-spinner {
    font-size: 3rem;
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.6;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  .loading-content p {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .title-bar {
    height: 38px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
    -webkit-app-region: drag;
    user-select: none;
    flex-shrink: 0;
  }

  .title-bar-content {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0;
  }

  .traffic-light-spacer {
    width: 80px;
    height: 100%;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }

  /* Windows: hide traffic light spacer */
  :global(html[data-platform='other']) .traffic-light-spacer {
    display: none;
  }

  .title-bar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }

  .hamburger-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .hamburger-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Add padding around hamburger menu on Windows */
  :global(html[data-platform='other']) .hamburger-button {
    margin-left: 0.5rem;
  }

  .title-bar-drag-center {
    flex: 1;
    height: 100%;
    -webkit-app-region: drag;
  }

  .navigation-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.5rem;
    -webkit-app-region: no-drag;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .nav-btn:hover:not(.disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .nav-btn.disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .title-bar-controls {
    height: 100%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-right: 0.75rem;
    -webkit-app-region: no-drag;
  }

  .pillbox-controls {
    display: flex;
    align-items: center;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .pillbox-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    width: 32px;
    height: 28px;
  }

  .pillbox-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .pillbox-btn.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .pillbox-btn-left {
    border-top-left-radius: 0.375rem;
    border-bottom-left-radius: 0.375rem;
  }

  .pillbox-btn-right {
    border-top-right-radius: 0.375rem;
    border-bottom-right-radius: 0.375rem;
  }

  .pillbox-btn.active + .pillbox-btn,
  .pillbox-btn + .pillbox-btn.active {
    border-left-color: transparent;
  }

  /* Window controls */
  .window-controls {
    display: flex;
    align-items: center;
    gap: 0;
  }

  /* Hide window controls on macOS */
  :global(html[data-platform='macos']) .window-controls {
    display: none;
  }

  .window-control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 12px;
  }

  .window-control-btn:hover {
    background: var(--bg-tertiary);
  }

  .window-control-btn.close-btn:hover {
    background: #e81123;
    color: white;
  }

  .window-control-btn svg {
    pointer-events: none;
  }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Show title bar on all platforms when using custom frame */
  .title-bar {
    display: block;
  }
</style>
