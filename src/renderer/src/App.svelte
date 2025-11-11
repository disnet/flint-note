<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import FirstTimeExperience from './components/FirstTimeExperience.svelte';
  import UpdateIndicator from './components/UpdateIndicator.svelte';
  import MessageBusDebugPanel from './components/MessageBusDebugPanel.svelte';
  import ExternalEditConflictNotification from './components/ExternalEditConflictNotification.svelte';
  import ToastNotification from './components/ToastNotification.svelte';
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
  import type { NoteEvent, WorkflowEvent } from './services/messageBus.svelte';

  // Forward note events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onNoteEvent((event) => {
      messageBus.publish(event as NoteEvent);
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Forward workflow events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onWorkflowEvent((event) => {
      messageBus.publish(event as WorkflowEvent);
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
  let currentRequestId = $state<string | null>(null);
  let activeSystemView = $state<
    'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
  >(null);
  let toolCallLimitReached = $state<{
    stepCount: number;
    maxSteps: number;
  } | null>(null);
  let refreshCredits: (() => Promise<void>) | undefined = $state();

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
        // The IPC handler returns full note data synchronously, no need to wait for events
        const createdNote = await chatService.createNote({
          type,
          identifier,
          content,
          vaultId: currentVault.id
        });

        // Convert CreateNoteResult to NoteMetadata format
        const noteMetadata: NoteMetadata = {
          id: createdNote.id,
          type: createdNote.type,
          title: createdNote.title,
          filename: createdNote.filename,
          path: createdNote.path,
          created: createdNote.created,
          modified: createdNote.created, // New notes have same created/modified time
          size: 0,
          tags: []
        };

        // Open the note immediately using the returned data
        // Background: note.created event will propagate and update caches
        await noteNavigationService.openNote(
          noteMetadata,
          'navigation',
          openNoteEditor,
          () => {
            activeSystemView = null;
          }
        );
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
    view: 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
  ): Promise<void> {
    // If clicking the same view that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.leftSidebar.visible && activeSystemView === view && view !== null) {
      sidebarState.toggleLeftSidebar();
    } else {
      activeSystemView = view;
      // Save the active view (clears note, sets system view)
      await activeNoteStore.setActiveSystemView(view);
      // If sidebar is closed, open it when selecting a view
      if (!sidebarState.leftSidebar.visible && view !== null) {
        sidebarState.toggleLeftSidebar();
      }
    }
  }

  function handleViewWorkflows(): void {
    handleSystemViewSelect('workflows');
  }

  async function handleNoteClick(noteId: string): Promise<void> {
    // Find the note in the notes store using the same logic as wikilink resolution
    const notes = notesStore.notes;
    const normalizedIdentifier = noteId.toLowerCase().trim();

    // First, try to match by note ID (exact match)
    let note = notes.find((n) => n.id.toLowerCase() === normalizedIdentifier);

    // Then try to match by type/filename format (e.g., "sketch/what-makes-a-good-thinking-system")
    if (!note && normalizedIdentifier.includes('/')) {
      const [type, ...filenameParts] = normalizedIdentifier.split('/');
      const filename = filenameParts.join('/'); // Handle nested paths if any

      note = notes.find(
        (n) =>
          n.type.toLowerCase() === type &&
          n.filename.toLowerCase().replace(/\.md$/, '').trim() === filename
      );

      // Fallback: try matching by type/title (for when agents use title instead of slugified filename)
      if (!note) {
        const titlePart = filenameParts.join('/'); // Reconstruct the title part
        note = notes.find(
          (n) =>
            n.type.toLowerCase() === type &&
            n.title.toLowerCase().trim() === titlePart.trim()
        );
      }
    }

    // Then try to match by title (case-insensitive)
    if (!note) {
      note = notes.find((n) => n.title.toLowerCase().trim() === normalizedIdentifier);
    }

    // Finally, try to match by filename without .md extension
    if (!note) {
      note = notes.find(
        (n) =>
          n.filename.toLowerCase().replace(/\.md$/, '').trim() === normalizedIdentifier
      );
    }

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

  // Restore active view (note or system view) on app startup
  $effect(() => {
    async function restoreView(): Promise<void> {
      try {
        // Wait for the notes store to finish loading before restoring the active view
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

        const restoredView = await activeNoteStore.restoreActiveView();

        if (restoredView) {
          if (restoredView.type === 'note') {
            // Restore note
            await noteNavigationService.openNote(
              restoredView.note,
              'navigation',
              () => {
                // Note is already set in store, no need to set again
              },
              () => {
                activeSystemView = null;
              }
            );
          } else if (restoredView.type === 'system-view') {
            // Restore system view
            activeSystemView = restoredView.viewType;
          }
        }
      } catch (error) {
        console.warn('Failed to restore active view:', error);
      }
    }

    restoreView();
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

      console.log('[App] notes-unpinned event received:', { noteIds });

      // Add unpinned notes to temporary tabs
      // BUT: only if the note actually exists in the notes store
      for (const noteId of noteIds) {
        const note = notesStore.notes.find((n) => n.id === noteId);
        if (note) {
          console.log('[App] Adding unpinned note to tabs:', {
            noteId,
            title: note.title
          });
          await temporaryTabsStore.addTab(noteId, 'navigation');
        } else {
          console.warn('[App] Skipping unpinned note - not found in notes store:', {
            noteId,
            totalNotes: notesStore.notes.length
          });
        }
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

  async function handleCancelMessage(): Promise<void> {
    if (currentRequestId) {
      try {
        await window.api?.cancelMessageStream({ requestId: currentRequestId });

        // Add a system message indicating cancellation
        const cancellationMessage: Message = {
          id: generateUniqueId(),
          text: '_Request cancelled by user._',
          sender: 'agent',
          timestamp: new Date()
        };
        await unifiedChatStore.addMessage(cancellationMessage);

        isLoadingResponse = false;
        currentRequestId = null;
      } catch (error) {
        console.error('Failed to cancel message:', error);
      }
    }
  }

  function handleToolCallLimitContinue(): void {
    // Clear the limit state and send a message to continue
    toolCallLimitReached = null;
    handleSendMessage('Please continue with your previous task.');
  }

  function handleToolCallLimitStop(): void {
    // Just clear the limit state
    toolCallLimitReached = null;
  }

  async function handleSendMessage(text: string): Promise<void> {
    // Clear any existing limit state when sending a new message
    toolCallLimitReached = null;

    // Check if message fits within context window
    const estimatedTokens = Math.ceil(text.length / 3.5);
    try {
      const canAccept = await window.api?.canAcceptMessage({
        estimatedTokens,
        conversationId: unifiedChatStore.activeThreadId ?? undefined
      });

      if (!canAccept?.canAccept) {
        // Show error message in a new agent message
        const errorMessage: Message = {
          id: generateUniqueId(),
          text: `⚠️ ${canAccept?.reason || 'Your message would exceed the context window limit. Please start a new thread or shorten your message.'}`,
          sender: 'agent',
          timestamp: new Date()
        };
        await unifiedChatStore.addMessage(errorMessage);
        return;
      }
    } catch (error) {
      console.error('Failed to check context usage:', error);
      // Continue anyway if check fails
    }

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
      timestamp: new Date()
    };
    await unifiedChatStore.addMessage(agentResponse);

    // Track streaming state to handle tool call separation by step
    let currentMessageId = agentResponseId;
    let toolCallMessageIdsByStep: Map<number, string> = new Map();
    let highestStepIndexSeen = 0;

    try {
      const chatService = getChatService();

      // Use streaming if available, otherwise fall back to regular sendMessage
      if (chatService.sendMessageStream) {
        currentRequestId = chatService.sendMessageStream(
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
            // Mark the final step as completed
            if (toolCallMessageIdsByStep.size > 0) {
              const finalStepMessageId =
                toolCallMessageIdsByStep.get(highestStepIndexSeen);
              if (finalStepMessageId) {
                // Mark with a high index to indicate streaming is done
                await unifiedChatStore.updateMessage(finalStepMessageId, {
                  currentStepIndex: highestStepIndexSeen + 1
                });
              }
            }

            // Clean up any empty messages that were created
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
            isLoadingResponse = false;
            currentRequestId = null;

            // Refresh OpenRouter credits after agent response completes
            if (refreshCredits) {
              await refreshCredits();
            }
          },
          // onError: handle streaming errors
          async (error: string) => {
            console.error('Streaming error:', error);
            await unifiedChatStore.updateMessage(currentMessageId, {
              text: 'Sorry, I encountered an error while processing your message.'
            });
            isLoadingResponse = false;
            currentRequestId = null;
          },
          modelStore.selectedModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (toolCall: any) => {
            // Group tool calls by step - each step gets its own message/widget
            const stepIndex = toolCall.stepIndex ?? 0;

            // If we've moved to a new step, mark the previous step's message as completed
            if (stepIndex > highestStepIndexSeen) {
              // Update the previous step's message with currentStepIndex to mark tools as completed
              const previousStepMessageId =
                toolCallMessageIdsByStep.get(highestStepIndexSeen);
              if (previousStepMessageId) {
                await unifiedChatStore.updateMessage(previousStepMessageId, {
                  currentStepIndex: stepIndex
                });
              }
              highestStepIndexSeen = stepIndex;
            }

            // Check if we already have a message for this step
            if (!toolCallMessageIdsByStep.has(stepIndex)) {
              // First tool call of this step - create a new message
              const toolCallMsg: Message = {
                id: generateUniqueId(),
                text: '',
                sender: 'agent',
                timestamp: new Date(),
                toolCalls: [toolCall],
                currentStepIndex: stepIndex // Track which step this message is for
              };
              toolCallMessageIdsByStep.set(stepIndex, toolCallMsg.id);
              await unifiedChatStore.addMessage(toolCallMsg);

              // Create a new message for any text that arrives after this step
              const postToolCallMessageId = generateUniqueId();
              const postToolCallMessage: Message = {
                id: postToolCallMessageId,
                text: '',
                sender: 'agent',
                timestamp: new Date()
              };
              await unifiedChatStore.addMessage(postToolCallMessage);
              currentMessageId = postToolCallMessageId;
            } else {
              // Add tool call to the existing message for this step
              const toolCallMessageId = toolCallMessageIdsByStep.get(stepIndex)!;
              const toolCallMessage = unifiedChatStore.activeThread?.messages?.find(
                (m) => m.id === toolCallMessageId
              );
              if (toolCallMessage) {
                const updatedToolCalls = [...(toolCallMessage.toolCalls || []), toolCall];
                await unifiedChatStore.updateMessage(toolCallMessageId, {
                  toolCalls: updatedToolCalls
                });
              }
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (toolResult: any) => {
            // Update the tool call with its result in the appropriate step's message
            const stepIndex = toolResult.stepIndex ?? 0;
            const toolCallMessageId = toolCallMessageIdsByStep.get(stepIndex);

            if (toolCallMessageId) {
              const toolCallMessage = unifiedChatStore.activeThread?.messages?.find(
                (m) => m.id === toolCallMessageId
              );
              if (toolCallMessage && toolCallMessage.toolCalls) {
                // Find the tool call by ID and update it with the result
                const updatedToolCalls = toolCallMessage.toolCalls.map((tc) =>
                  tc.id === toolResult.id ? { ...tc, result: toolResult.result } : tc
                );
                await unifiedChatStore.updateMessage(toolCallMessageId, {
                  toolCalls: updatedToolCalls
                });
              }
            }
          },
          (data) => {
            // Handle tool call limit reached
            toolCallLimitReached = {
              stepCount: data.stepCount,
              maxSteps: data.maxSteps
            };
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
        currentRequestId = null;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      await unifiedChatStore.updateMessage(agentResponseId, {
        text: 'Sorry, I encountered an error while processing your message.'
      });
      isLoadingResponse = false;
      currentRequestId = null;
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

  /**
   * Start a review session for a note
   * Opens the AI assistant and sends a message to start the review
   */
  function handleStartReview(noteId: string, _noteTitle: string): void {
    // Close the system view
    activeSystemView = null;

    // Open the AI assistant if not already open
    if (!sidebarState.rightSidebar.visible || sidebarState.rightSidebar.mode !== 'ai') {
      setRightSidebarMode('ai');
    }

    // Send a message to start the review
    const reviewMessage = `Review note: ${noteId}`;
    handleSendMessage(reviewMessage);
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
        onStartReview={handleStartReview}
      />

      <RightSidebar
        {messages}
        isLoading={isLoadingResponse}
        onNoteClick={handleNoteClick}
        onSendMessage={handleSendMessage}
        onCancelMessage={handleCancelMessage}
        {toolCallLimitReached}
        onToolCallLimitContinue={handleToolCallLimitContinue}
        onToolCallLimitStop={handleToolCallLimitStop}
        onViewWorkflows={handleViewWorkflows}
        bind:refreshCredits
      />
    </div>

    <!-- Debug Panel (only in development) -->
    <MessageBusDebugPanel />

    <!-- External Edit Conflict Notifications -->
    <ExternalEditConflictNotification />

    <!-- Toast Notifications -->
    <ToastNotification />
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
