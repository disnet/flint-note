<script lang="ts">
  import ChatView from './components/ChatView.svelte';
  import MessageInput from './components/MessageInput.svelte';
  import TabNavigation from './components/TabNavigation.svelte';
  import NotesView from './components/NotesView.svelte';
  import PinnedView from './components/PinnedView.svelte';
  import NoteEditor from './components/NoteEditor.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore';
  import { modelStore } from './stores/modelStore.svelte';

  let messages = $state<Message[]>([
    {
      id: '1',
      text: "Hi there! I'm Flint, your AI assistant. How can I help you today?",
      sender: 'agent',
      timestamp: new Date(Date.now())
    },
    {
      id: '2',
      text: 'You can click on note references like [[daily/june-27-2025]] or [meeting-notes.md] to open them in the editor!',
      sender: 'agent',
      timestamp: new Date(Date.now() + 1000)
    }
  ]);

  let isLoadingResponse = $state(false);
  let activeTab = $state('chat');
  let activeNote = $state<NoteMetadata | null>(null);
  let noteEditorPosition = $state<'sidebar' | 'overlay' | 'fullscreen'>('sidebar');
  let showCreateNoteModal = $state(false);

  const tabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'notes', label: 'Notes' },
    { id: 'pinned', label: 'Pinned' }
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

  function handleNoteCreated(noteId: string): void {
    // Find the newly created note and open it in the editor
    setTimeout(async () => {
      // Wait for notes to refresh, then find and open the new note
      const notes = $notesStore.notes;
      const newNote = notes.find((n) => n.id === noteId);
      if (newNote) {
        openNoteEditor(newNote);
      }
    }, 100);
  }

  function handleNoteClick(noteId: string): void {
    // Find the note in the notes store
    const notes = $notesStore.notes;
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
  }

  function closeNoteEditor(): void {
    activeNote = null;
  }

  function updateNoteEditorPosition(): void {
    const width = window.innerWidth;

    if (width > 1200) {
      noteEditorPosition = 'sidebar';
    } else if (width > 768) {
      noteEditorPosition = 'overlay';
    } else {
      noteEditorPosition = 'fullscreen';
    }
  }

  // Update editor position on window resize
  $effect(() => {
    function handleResize(): void {
      if (activeNote) {
        updateNoteEditorPosition();
      }
    }

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
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
      timestamp: new Date()
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
          modelStore.selectedModel
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

<div class="app">
  <header class="header">
    <div class="header-top">
      <h1>Flint</h1>
      <VaultSwitcher />
    </div>
    <TabNavigation {tabs} {activeTab} onTabChange={handleTabChange} />
  </header>

  <main class="main">
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
        {/if}
      </div>
      {#if activeNote}
        <NoteEditor
          note={activeNote}
          position={noteEditorPosition}
          onClose={closeNoteEditor}
        />
      {/if}
    </div>
  </main>

  <footer class="footer">
    <MessageInput onSend={handleSendMessage} />
  </footer>

  <CreateNoteModal
    isOpen={showCreateNoteModal}
    onClose={handleCloseCreateModal}
    onNoteCreated={handleNoteCreated}
  />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    max-width: 70ch;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .header {
    background: var(--bg-primary);
    box-shadow: 0 1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 0.5rem 1.5rem;
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

  .footer {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
    box-shadow: 0 -1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
  }

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
  @media (max-width: 1200px) {
    .tab-layout.has-sidebar {
      padding-right: 0;
    }
  }
</style>
