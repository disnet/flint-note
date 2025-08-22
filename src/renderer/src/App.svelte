<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
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
  import { generateSafeNoteIdentifier } from './utils/noteUtils.svelte';

  // Initialize unified chat store effects
  unifiedChatStore.initializeEffects();

  // Messages are now managed by unifiedChatStore
  const messages = $derived(unifiedChatStore.activeThread?.messages || []);

  let isLoadingResponse = $state(false);
  let showCreateNoteModal = $state(false);
  let createNotePreselectedType = $state<string | undefined>(undefined);
  let activeSystemView = $state<'notes' | 'settings' | 'slash-commands' | null>(null);

  function handleNoteSelect(note: NoteMetadata): void {
    noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
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
        // Generate a safe, unique title and identifier
        const type = noteType || 'note'; // Default to 'note' type
        const { title, identifier } = generateSafeNoteIdentifier('Untitled Note', type);
        const content = `# ${title}\n\n`;

        // Create the note via the chat service
        const chatService = getChatService();
        const noteInfo = await chatService.createNote({
          type,
          identifier,
          content
        });

        // Refresh notes store to show new note
        await notesStore.refresh();

        // Find the newly created note and open it through navigation service
        const notes = notesStore.notes;
        const newNote = notes.find((n) => n.id === noteInfo.id);
        if (newNote) {
          noteNavigationService.openNote(newNote, 'navigation', openNoteEditor, () => {
            activeSystemView = null;
          });
        }
      } catch (error) {
        console.error('Failed to create note:', error);
        // Fallback to modal on error
        createNotePreselectedType = noteType;
        showCreateNoteModal = true;
      }
    } else {
      // For UI clicks, show the modal
      createNotePreselectedType = noteType;
      showCreateNoteModal = true;
    }
  }

  function handleSystemViewSelect(
    view: 'notes' | 'settings' | 'slash-commands' | null
  ): void {
    // If clicking the same view that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.leftSidebar.visible && activeSystemView === view && view !== null) {
      sidebarState.toggleLeftSidebar();
    } else {
      activeSystemView = view;
      // Clear active note when switching to system views
      if (view !== null) {
        activeNoteStore.clearActiveNote();
      }
      // If sidebar is closed, open it when selecting a view
      if (!sidebarState.leftSidebar.visible && view !== null) {
        sidebarState.toggleLeftSidebar();
      }
    }
  }

  function handleCloseCreateModal(): void {
    showCreateNoteModal = false;
    createNotePreselectedType = undefined;
  }

  function handleNoteCreated(noteId: string): void {
    // Find the newly created note and open it in the editor
    setTimeout(async () => {
      // Wait for notes to refresh, then find and open the new note
      const notes = notesStore.notes;
      const newNote = notes.find((n) => n.id === noteId);
      if (newNote) {
        openNoteEditor(newNote);
      }
    }, 100);
  }

  function handleNoteClick(noteId: string): void {
    // Find the note in the notes store
    const notes = notesStore.notes;
    const note = notes.find(
      (n) => n.filename === noteId || n.id === noteId || n.title === noteId
    );

    if (note) {
      noteNavigationService.openNote(note, 'wikilink', openNoteEditor);
    } else {
      console.warn('Note not found:', noteId);
    }
  }

  function openNoteEditor(note: NoteMetadata): void {
    activeNoteStore.setActiveNote(note);
  }

  function closeNoteEditor(): void {
    activeNoteStore.clearActiveNote();
  }

  async function handleNoteTypeChange(noteId: string, newType: string): Promise<void> {
    const activeNote = activeNoteStore.activeNote;
    if (!activeNote || activeNote.id !== noteId) return;

    try {
      const chatService = getChatService();

      console.log(`Moving note from type '${activeNote.type}' to '${newType}'`);

      // Use moveNote API to properly move the note to a new type
      const moveResult = await chatService.moveNote({
        identifier: noteId,
        newType: newType
      });

      if (moveResult.success) {
        // Update the active note with new ID and type
        const updatedNote = {
          ...activeNote,
          id: moveResult.new_id,
          type: moveResult.new_type
        };
        activeNoteStore.setActiveNote(updatedNote);

        // Refresh notes store to update the lists
        await notesStore.refresh();

        console.log(
          `Successfully moved note to type '${moveResult.new_type}' with new ID '${moveResult.new_id}'`
        );
      } else {
        throw new Error('Failed to move note');
      }
    } catch (error) {
      console.error('Failed to change note type:', error);
      throw error; // Re-throw so the UI can handle it
    }
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
            noteNavigationService.openNote(
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

      // Alt + Left Arrow to go back
      if (event.key === 'ArrowLeft' && event.altKey) {
        event.preventDefault();
        handleNavigationBack();
      }

      // Alt + Right Arrow to go forward
      if (event.key === 'ArrowRight' && event.altKey) {
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
    function handleWikilinkNavigate(event: CustomEvent): void {
      const { note } = event.detail;
      if (note) {
        noteNavigationService.openNote(note, 'wikilink', openNoteEditor);
      }
    }

    document.addEventListener(
      'wikilink-navigate',
      handleWikilinkNavigate as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'wikilink-navigate',
        handleWikilinkNavigate as (event: Event) => void
      );
  });

  // Handle unpinned notes event from navigation service
  $effect(() => {
    function handleNotesUnpinned(event: CustomEvent): void {
      const { noteIds } = event.detail;

      // Add unpinned notes to temporary tabs
      for (const noteId of noteIds) {
        const note = notesStore.notes.find((n) => n.id === noteId);
        if (note) {
          temporaryTabsStore.addTab(note.id, note.title, 'navigation');
        }
      }
    }

    document.addEventListener(
      'notes-unpinned',
      handleNotesUnpinned as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'notes-unpinned',
        handleNotesUnpinned as (event: Event) => void
      );
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
    function handleHistoryNavigate(event: CustomEvent): void {
      const { noteId, title, scrollPosition } = event.detail;

      // Find the note and open it
      const note = notesStore.notes.find((n) => n.id === noteId);
      if (note) {
        noteNavigationService.openNote(note, 'history', openNoteEditor, () => {
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
      handleHistoryNavigate as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'history-navigate',
        handleHistoryNavigate as (event: Event) => void
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

    try {
      const chatService = getChatService();

      // Use streaming if available, otherwise fall back to regular sendMessage
      if (chatService.sendMessageStream) {
        chatService.sendMessageStream(
          text,
          unifiedChatStore.activeThreadId || undefined,
          // onChunk: append text chunks to the message
          (chunk: string) => {
            const currentMessage = unifiedChatStore.activeThread?.messages?.find(
              (m) => m.id === agentResponseId
            );
            if (currentMessage) {
              unifiedChatStore.updateMessage(agentResponseId, {
                text: currentMessage.text + chunk
              });
            }
          },
          // onComplete: streaming finished
          (fullText: string) => {
            unifiedChatStore.updateMessage(agentResponseId, { text: fullText });
            isLoadingResponse = false;
          },
          // onError: handle streaming errors
          (error: string) => {
            console.error('Streaming error:', error);
            unifiedChatStore.updateMessage(agentResponseId, {
              text: 'Sorry, I encountered an error while processing your message.'
            });
            isLoadingResponse = false;
          },
          modelStore.selectedModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (toolCall: any) => {
            console.log('App.svelte: Received tool call:', toolCall);
            const currentMessage = unifiedChatStore.activeThread?.messages?.find(
              (m) => m.id === agentResponseId
            );
            if (currentMessage) {
              const updatedToolCalls = [...(currentMessage.toolCalls || []), toolCall];
              unifiedChatStore.updateMessage(agentResponseId, {
                toolCalls: updatedToolCalls
              });
              console.log(
                'App.svelte: Added tool call to message, message now has',
                updatedToolCalls.length,
                'tool calls'
              );
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
        unifiedChatStore.updateMessage(agentResponseId, {
          text: response.text,
          toolCalls: response.toolCalls
        });

        isLoadingResponse = false;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      unifiedChatStore.updateMessage(agentResponseId, {
        text: 'Sorry, I encountered an error while processing your message.'
      });
      isLoadingResponse = false;
    }
  }

  function toggleLeftSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }

  function setRightSidebarMode(mode: 'ai' | 'threads'): void {
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
</script>

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
            title="Go back (Alt + Left Arrow)"
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
            title="Go forward (Alt + Right Arrow)"
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
            class="pillbox-btn pillbox-btn-right"
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
    />

    <MainView
      activeNote={activeNoteStore.activeNote}
      {activeSystemView}
      noteTypes={notesStore.noteTypes}
      onClose={closeNoteEditor}
      onNoteSelect={handleNoteSelect}
      onCreateNote={handleCreateNote}
      onNoteTypeChange={handleNoteTypeChange}
    />

    <RightSidebar
      {messages}
      isLoading={isLoadingResponse}
      onNoteClick={handleNoteClick}
      onSendMessage={handleSendMessage}
    />
  </div>

  <CreateNoteModal
    isOpen={showCreateNoteModal}
    onClose={handleCloseCreateModal}
    onNoteCreated={handleNoteCreated}
    preselectedType={createNotePreselectedType}
  />
</div>

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
