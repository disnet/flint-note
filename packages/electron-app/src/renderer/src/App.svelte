<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import SearchOverlay from './components/SearchOverlay.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore.svelte';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore.svelte';
  import { modelStore } from './stores/modelStore.svelte';
  import { sidebarState } from './stores/sidebarState.svelte';
  import { searchOverlayState } from './stores/searchOverlay.svelte';
  import { temporaryTabsStore } from './stores/temporaryTabsStore.svelte';
  import { unifiedChatStore } from './stores/unifiedChatStore.svelte';
  import { noteNavigationService } from './services/noteNavigationService.svelte';

  // Initialize unified chat store effects
  unifiedChatStore.initializeEffects();

  // Messages are now managed by unifiedChatStore
  const messages = $derived(unifiedChatStore.activeThread?.messages || []);

  let isLoadingResponse = $state(false);
  let activeNote = $state<NoteMetadata | null>(null);
  let showCreateNoteModal = $state(false);
  let createNotePreselectedType = $state<string | undefined>(undefined);
  let activeSystemView = $state<'inbox' | 'notes' | 'settings' | 'slash-commands' | null>(
    null
  );

  function handleNoteSelect(note: NoteMetadata): void {
    noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
      activeSystemView = null;
    });
  }

  function handleCreateNote(noteType?: string): void {
    createNotePreselectedType = noteType;
    showCreateNoteModal = true;
  }

  function handleSystemViewSelect(
    view: 'inbox' | 'notes' | 'settings' | 'slash-commands' | null
  ): void {
    activeSystemView = view;
    // Clear active note when switching to system views
    if (view !== null) {
      activeNote = null;
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
    activeNote = note;
  }

  function closeNoteEditor(): void {
    activeNote = null;
  }

  async function handleNoteTypeChange(noteId: string, newType: string): Promise<void> {
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
        activeNote = {
          ...activeNote,
          id: moveResult.new_id,
          type: moveResult.new_type
        };

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

  // Platform detection setup
  $effect(() => {
    // Set data attribute for platform detection
    const isMacOS = navigator.platform.includes('Mac');
    document.documentElement.setAttribute('data-platform', isMacOS ? 'macos' : 'other');
  });

  // Global keyboard shortcuts
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd + N to create new note
      if (event.key === 'n' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleCreateNote();
      }

      // Ctrl/Cmd + O to open search
      if (event.key === 'o' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        searchOverlayState.open();
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

  async function handleSendMessage(text: string): Promise<void> {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    await unifiedChatStore.addMessage(newMessage);

    isLoadingResponse = true;

    // Create a placeholder message for streaming response
    const agentResponseId = (Date.now() + 1).toString();
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

  function handleMetadataUpdate(metadata: Partial<NoteMetadata>): void {
    console.log('Metadata updated:', metadata);
    // Note: The metadata is already saved by the MetadataEditor component
    // This callback can be used to refresh the notes store or handle additional logic
    if (activeNote && Object.keys(metadata).length > 0) {
      // Refresh the notes store to pick up changes
      notesStore.refresh();
    }
  }

  function toggleLeftSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }

  function toggleRightSidebar(): void {
    sidebarState.toggleRightSidebar();
  }
</script>

<div class="app" class:three-column={sidebarState.layout === 'three-column'}>
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
      </div>
      <div class="title-bar-center"></div>
      <div class="title-bar-controls">
        <button
          class="ai-assistant-btn"
          class:active={sidebarState.rightSidebar.visible}
          onclick={toggleRightSidebar}
          aria-label="Toggle AI assistant"
          title="Toggle AI assistant"
        >
          <svg
            width="18"
            height="18"
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
      </div>
    </div>
  </div>

  <div class="app-layout">
    <LeftSidebar
      {activeNote}
      {activeSystemView}
      onNoteSelect={handleNoteSelect}
      onSystemViewSelect={handleSystemViewSelect}
    />

    <MainView
      {activeNote}
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
      {activeNote}
      onNoteClick={handleNoteClick}
      onSendMessage={handleSendMessage}
      onMetadataUpdate={handleMetadataUpdate}
    />
  </div>

  <CreateNoteModal
    isOpen={showCreateNoteModal}
    onClose={handleCloseCreateModal}
    onNoteCreated={handleNoteCreated}
    preselectedType={createNotePreselectedType}
  />

  <SearchOverlay
    isOpen={searchOverlayState.isOpen}
    onClose={searchOverlayState.close}
    onNoteSelect={handleNoteSelect}
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

  .title-bar-center {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .title-bar-controls {
    width: 80px;
    height: 100%;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.75rem;
  }

  .ai-assistant-btn {
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

  .ai-assistant-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .ai-assistant-btn.active {
    background: var(--accent-light);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
  }

  .ai-assistant-btn.active:hover {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .app-layout {
    display: grid;
    flex: 1;
    min-height: 0;
  }

  /* Three column layout for desktop - pure CSS responsive to sidebar visibility */
  .app.three-column .app-layout {
    grid-template-columns: min-content 1fr min-content;
  }

  /* Single column layout for smaller screens */
  .app:not(.three-column) .app-layout {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
    }

    .app.three-column .app-layout {
      grid-template-columns: 1fr;
    }
  }

  /* By default hide the title bar, will be shown by JS on macOS */
  .title-bar {
    display: none;
  }

  /* Show title bar on macOS when the CSS variable is set */
  :global(html[data-platform='macos']) .title-bar {
    display: block;
  }
</style>
