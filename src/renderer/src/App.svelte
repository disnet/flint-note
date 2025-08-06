<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore.svelte';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore.svelte';
  import { modelStore } from './stores/modelStore.svelte';
  import { sidebarState } from './stores/sidebarState.svelte';
  import { temporaryTabsStore } from './stores/temporaryTabsStore.svelte';
  import { noteNavigationService } from './services/noteNavigationService.svelte';

  let messages = $state<Message[]>([
    {
      id: '1',
      text: "Hi there! I'm Flint, your AI assistant. How can I help you today?",
      sender: 'agent',
      timestamp: new Date(Date.now())
    }
  ]);

  let isLoadingResponse = $state(false);
  let activeNote = $state<NoteMetadata | null>(null);
  let showCreateNoteModal = $state(false);
  let activeSystemView = $state<'inbox' | 'notes' | 'search' | 'settings' | null>(null);

  function handleNoteSelect(note: NoteMetadata): void {
    noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
      activeSystemView = null;
    });
  }

  function handleCreateNote(): void {
    showCreateNoteModal = true;
  }

  function handleSystemViewSelect(
    view: 'inbox' | 'notes' | 'search' | 'settings' | null
  ): void {
    activeSystemView = view;
    // Clear active note when switching to system views
    if (view !== null) {
      activeNote = null;
    }
  }

  function handleCloseCreateModal(): void {
    showCreateNoteModal = false;
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

  // Global keyboard shortcuts
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd + N to create new note
      if (event.key === 'n' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleCreateNote();
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

    document.addEventListener('wikilink-navigate', handleWikilinkNavigate);
    return () =>
      document.removeEventListener('wikilink-navigate', handleWikilinkNavigate);
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

    document.addEventListener('notes-unpinned', handleNotesUnpinned);
    return () => document.removeEventListener('notes-unpinned', handleNotesUnpinned);
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
            console.log('App.svelte: Received tool call:', toolCall);
            const messageIndex = messages.findIndex((m) => m.id === agentResponseId);
            if (messageIndex !== -1) {
              if (!messages[messageIndex].toolCalls) {
                messages[messageIndex].toolCalls = [];
              }
              messages[messageIndex].toolCalls!.push(toolCall);
              console.log(
                'App.svelte: Added tool call to message, message now has',
                messages[messageIndex].toolCalls!.length,
                'tool calls'
              );
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

  function handleMetadataUpdate(metadata: Partial<NoteMetadata>): void {
    console.log('Metadata updated:', metadata);
    // Note: The metadata is already saved by the MetadataEditor component
    // This callback can be used to refresh the notes store or handle additional logic
    if (activeNote && Object.keys(metadata).length > 0) {
      // Refresh the notes store to pick up changes
      notesStore.refresh();
    }
  }
</script>

<div class="app" class:three-column={sidebarState.layout === 'three-column'}>
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
      onSendMessage={handleSendMessage}
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
  }

  .app-layout {
    display: grid;
    height: 100vh;
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
</style>
