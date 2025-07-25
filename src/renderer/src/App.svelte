<script lang="ts">
  import ChatView from './components/ChatView.svelte';
  import MessageInput from './components/MessageInput.svelte';
  import TabNavigation from './components/TabNavigation.svelte';
  import NotesView from './components/NotesView.svelte';
  import PinnedView from './components/PinnedView.svelte';
  import NoteEditor from './components/NoteEditor.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import Settings from './components/Settings.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore.svelte';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore.svelte';
  import { modelStore } from './stores/modelStore.svelte';

  let messages = $state<Message[]>([
    {
      id: '1',
      text: "Hi there! I'm Flint, your AI assistant. How can I help you today?",
      sender: 'agent',
      timestamp: new Date(Date.now())
    }
  ]);

  let isLoadingResponse = $state(false);
  let activeTab = $state('chat');
  let activeNote = $state<NoteMetadata | null>(null);
  let noteEditorPosition = $state<'sidebar' | 'overlay' | 'fullscreen' | 'nested'>(
    'sidebar'
  );
  let showCreateNoteModal = $state(false);
  let showSettingsModal = $state(false);
  let layoutMode = $state<'three-column' | 'single-column'>('single-column');

  // References to NoteEditor components for focusing
  let threeColumnEditor: { focus?: () => void } | null = null;
  let tabLayoutEditor: { focus?: () => void } | null = null;

  const tabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'notes', label: 'Notes' },
    { id: 'pinned', label: 'Pinned' },
    { id: 'settings', label: 'Settings' }
  ];

  function handleTabChange(tabId: string): void {
    activeTab = tabId;
  }

  function handleNoteSelect(note: NoteMetadata): void {
    openNoteEditor(note);
  }

  function handleCreateNote(): void {
    showCreateNoteModal = true;
  }

  function handleCloseCreateModal(): void {
    showCreateNoteModal = false;
  }

  function handleCloseSettingsModal(): void {
    showSettingsModal = false;
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
      openNoteEditor(note);
    } else {
      console.warn('Note not found:', noteId);
    }
  }

  function openNoteEditor(note: NoteMetadata): void {
    activeNote = note;
    updateNoteEditorPosition();

    // Focus the editor after a short delay to ensure it's rendered
    setTimeout(() => {
      const activeEditor =
        layoutMode === 'three-column' ? threeColumnEditor : tabLayoutEditor;
      if (activeEditor && activeEditor.focus) {
        activeEditor.focus();
      }
    }, 100);
  }

  function closeNoteEditor(): void {
    activeNote = null;
  }

  function updateLayoutMode(): void {
    const width = window.innerWidth;

    if (width > 1400) {
      layoutMode = 'three-column';
      noteEditorPosition = 'nested';
    } else {
      layoutMode = 'single-column';
      if (width > 768) {
        noteEditorPosition = 'overlay';
      } else {
        noteEditorPosition = 'fullscreen';
      }
    }
  }

  function updateNoteEditorPosition(): void {
    updateLayoutMode();
  }

  // Update layout on window resize and initial load
  $effect(() => {
    function handleResize(): void {
      updateLayoutMode();
    }

    // Set initial layout mode
    updateLayoutMode();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  // Global keyboard shortcuts
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd + N to create new note
      if (event.key === 'n' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleCreateNote();
      }

      // Ctrl/Cmd + , to open settings
      if (event.key === ',' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (layoutMode === 'three-column') {
          showSettingsModal = true;
        } else {
          activeTab = 'settings';
        }
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
        openNoteEditor(note);
      }
    }

    document.addEventListener('wikilink-navigate', handleWikilinkNavigate);
    return () =>
      document.removeEventListener('wikilink-navigate', handleWikilinkNavigate);
  });

  async function handleSendMessage(text: string): Promise<void> {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    messages.push(newMessage);

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
    messages.push(agentResponse);

    try {
      const chatService = getChatService();

      // Use streaming if available, otherwise fall back to regular sendMessage
      if (chatService.sendMessageStream) {
        chatService.sendMessageStream(
          text,
          // onChunk: append text chunks to the message
          (chunk: string) => {
            const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
            if (messageIndex !== -1) {
              messages[messageIndex].text += chunk;
            }
          },
          // onComplete: streaming finished
          (fullText: string) => {
            const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
            if (messageIndex !== -1) {
              messages[messageIndex].text = fullText;
            }
            isLoadingResponse = false;
          },
          // onError: handle streaming errors
          (error: string) => {
            console.error('Streaming error:', error);
            const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
            if (messageIndex !== -1) {
              messages[messageIndex].text =
                'Sorry, I encountered an error while processing your message.';
            }
            isLoadingResponse = false;
          },
          modelStore.selectedModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (toolCall: any) => {
            const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
            if (messageIndex !== -1) {
              if (!messages[messageIndex].toolCalls) {
                messages[messageIndex].toolCalls = [];
              }
              messages[messageIndex].toolCalls!.push(toolCall);
            }
          }
        );
      } else {
        // Fallback to non-streaming mode
        const response = await chatService.sendMessage(text, modelStore.selectedModel);

        // Update the placeholder message with the complete response
        const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
        if (messageIndex !== -1) {
          messages[messageIndex].text = response.text;
          messages[messageIndex].toolCalls = response.toolCalls;
        }

        isLoadingResponse = false;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
      if (messageIndex !== -1) {
        messages[messageIndex].text =
          'Sorry, I encountered an error while processing your message.';
      }
      isLoadingResponse = false;
    }
  }
</script>

<div class="app" class:three-column={layoutMode === 'three-column'}>
  <header class="header">
    {#if layoutMode === 'three-column'}
      <div class="header-max-width">
        <div class="header-section">
          <h1>Flint</h1>
        </div>
        <div class="header-section header-center">
          <SearchBar onNoteSelect={handleNoteSelect} />
        </div>
        <div class="header-section">
          <button
            class="settings-button"
            onclick={() => (showSettingsModal = true)}
            aria-label="Open settings"
            title="Settings (⌘,)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m12-6l-3 3 3 3m-6-6l3 3-3 3"></path>
            </svg>
          </button>
          <VaultSwitcher />
        </div>
      </div>
    {:else}
      <div class="header-top">
        <h1>Flint</h1>
        <div class="header-top-right">
          <SearchBar onNoteSelect={handleNoteSelect} />
          <VaultSwitcher />
        </div>
      </div>
      <TabNavigation {tabs} {activeTab} onTabChange={handleTabChange} />
    {/if}
  </header>

  <main class="main">
    {#if layoutMode === 'three-column'}
      <div class="three-column-layout">
        <div class="left-panel">
          <div class="pinned-section">
            <PinnedView onNoteSelect={handleNoteSelect} />
          </div>
          <div class="notes-section">
            <NotesView onNoteSelect={handleNoteSelect} onCreateNote={handleCreateNote} />
          </div>
        </div>
        <div class="chat-panel">
          <div class="chat-content">
            <ChatView
              {messages}
              isLoading={isLoadingResponse}
              onNoteClick={handleNoteClick}
            />
          </div>
          <div class="chat-input">
            <MessageInput onSend={handleSendMessage} />
          </div>
        </div>
        <div class="editor-panel">
          {#if activeNote}
            <NoteEditor
              bind:this={threeColumnEditor}
              note={activeNote}
              position={noteEditorPosition}
              onClose={closeNoteEditor}
            />
          {:else}
            <div class="editor-placeholder">
              <p>Select a note to start editing</p>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div
        class="tab-layout"
        class:has-sidebar={activeNote && noteEditorPosition === 'sidebar'}
      >
        <div class="tab-content">
          {#if activeTab === 'chat'}
            <ChatView
              {messages}
              isLoading={isLoadingResponse}
              onNoteClick={handleNoteClick}
            />
          {:else if activeTab === 'notes'}
            <NotesView onNoteSelect={handleNoteSelect} onCreateNote={handleCreateNote} />
          {:else if activeTab === 'pinned'}
            <PinnedView onNoteSelect={handleNoteSelect} />
          {:else if activeTab === 'settings'}
            <Settings />
          {/if}
        </div>
        {#if activeNote}
          <NoteEditor
            bind:this={tabLayoutEditor}
            note={activeNote}
            position={noteEditorPosition}
            onClose={closeNoteEditor}
          />
        {/if}
      </div>
    {/if}
  </main>

  {#if layoutMode !== 'three-column'}
    <footer class="footer">
      <MessageInput onSend={handleSendMessage} />
    </footer>
  {/if}

  <CreateNoteModal
    isOpen={showCreateNoteModal}
    onClose={handleCloseCreateModal}
    onNoteCreated={handleNoteCreated}
  />

  {#if showSettingsModal}
    <div
      class="settings-modal-overlay"
      role="dialog"
      aria-modal="true"
      onclick={handleCloseSettingsModal}
      onkeydown={(e) => e.key === 'Escape' && handleCloseSettingsModal()}
    >
      <div
        class="settings-modal"
        role="document"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="settings-modal-header">
          <h2>Settings</h2>
          <button
            class="settings-close-button"
            onclick={handleCloseSettingsModal}
            aria-label="Close settings"
          >
            <svg
              width="20"
              height="20"
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
        <div class="settings-modal-content">
          <Settings />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  /* Default layout (single/two column) */
  .app:not(.three-column) {
    max-width: 70ch;
    margin: 0 auto;
  }

  /* Three column layout */
  .app.three-column {
    max-width: 1600px;
    margin: 0 auto;
  }

  .header {
    background: var(--bg-primary);
    box-shadow: 0 1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
    border-bottom: 1px solid var(--border-light);
  }

  /* Three column header */
  .header-max-width {
    display: grid;
    grid-template-columns: 300px 1fr 300px;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    align-items: center;
  }

  .header-section {
    display: flex;
    align-items: center;
  }

  .header-center {
    justify-content: center;
  }

  .header-section:last-child {
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .settings-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px var(--shadow-light);
  }

  .settings-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    color: var(--text-primary);
    box-shadow: 0 2px 4px var(--shadow-medium);
    transform: translateY(-1px);
  }

  .settings-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px var(--shadow-light);
  }

  /* Default header */
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 0.5rem 1.5rem;
  }

  .header-top-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: -0.025em;
    transition: color 0.2s ease;
  }

  .main {
    flex: 1;
    overflow: hidden;
    background: var(--bg-secondary);
    transition: background-color 0.2s ease;
  }

  /* Three column layout */
  .three-column-layout {
    display: grid;
    grid-template-columns: 300px 1fr 60ch;
    height: 100%;
    background: var(--border-light);
  }

  .editor-panel {
    border-left: 1px solid var(--border-light);
  }

  .left-panel,
  .chat-panel,
  .editor-panel {
    background: var(--bg-primary);
    overflow: hidden;
  }

  .chat-panel {
    display: flex;
    flex-direction: column;
  }

  .chat-content {
    flex: 1;
    overflow: hidden;
  }

  .chat-input {
    flex: 0 0 auto;
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .left-panel {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-light);
  }

  .pinned-section {
    flex: 0 0 auto;
    max-height: 40%;
    border-bottom: 1px solid var(--border-light);
  }

  .notes-section {
    flex: 1;
    min-height: 0;
  }

  .editor-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-style: italic;
  }

  .footer {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
    box-shadow: 0 -1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
  }

  /* Default tab layout */
  .tab-layout {
    display: flex;
    height: 100%;
    position: relative;
  }

  .tab-content {
    flex: 1;
    min-width: 0;
    height: 100%;
  }

  /* Responsive adjustments */
  @media (max-width: 1400px) {
    .app.three-column {
      max-width: 70ch;
      margin: 0 auto;
    }

    .three-column-layout {
      display: block;
    }

    .left-panel,
    .chat-panel,
    .editor-panel {
      display: none;
    }
  }

  @media (max-width: 1200px) {
    .tab-layout.has-sidebar {
      padding-right: 0;
    }
  }

  /* Settings Modal */
  .settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 2rem;
  }

  .settings-modal {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    border: 1px solid var(--border-light);
  }

  .settings-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .settings-modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .settings-close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .settings-close-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .settings-modal-content {
    overflow-y: auto;
    max-height: calc(80vh - 120px);
  }

  @media (max-width: 768px) {
    .settings-modal-overlay {
      padding: 1rem;
    }

    .settings-modal {
      max-width: none;
      width: 100%;
      max-height: 90vh;
    }

    .settings-modal-header {
      padding: 1rem 1.5rem 0.75rem 1.5rem;
    }

    .settings-modal-header h2 {
      font-size: 1.25rem;
    }
  }
</style>
