import { getChatService } from './chatService.js';
import { notesStore, type NoteMetadata } from './noteStore.svelte';
import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte';
import { sidebarState } from '../stores/sidebarState.svelte';

/**
 * Centralized service for handling wikilink click interactions.
 * Consolidates note creation, navigation, and event dispatch logic
 * that was previously duplicated across multiple components.
 */
class WikilinkService {
  /**
   * Handles wikilink click events - either navigates to existing notes
   * or creates new notes if they don't exist.
   * If shiftKey is pressed, adds the note to the sidebar instead of navigating.
   */
  async handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> {
    if (shouldCreate) {
      // Create a new note with the default 'note' type
      try {
        const chatService = getChatService();

        // Get the current vault ID
        const currentVault = await chatService.getCurrentVault();
        if (!currentVault) {
          console.error('No current vault available for creating note');
          return;
        }

        console.log('Creating new note for broken wikilink:', title);
        const createdNote = await chatService.createNote({
          vaultId: currentVault.id,
          type: 'note',
          identifier: title,
          content: ``
        });

        // Convert CreateNoteResult to NoteMetadata format
        // Use returned data directly (hybrid IPC pattern - no race condition)
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

        if (shiftKey) {
          // Add to sidebar instead of navigating
          await this.addNoteToSidebar(noteMetadata);
        } else {
          // Dispatch the navigation event for App.svelte to handle
          // Background: note.created event will propagate and update caches
          const event = new CustomEvent('wikilink-navigate', {
            detail: { note: noteMetadata },
            bubbles: true
          });
          document.dispatchEvent(event);
        }
      } catch (error) {
        console.error('Failed to create note:', error);
      }
    } else {
      // Navigate to existing note or add to sidebar
      const existingNote = notesStore.notes.find((n) => n.id === noteId);
      if (existingNote) {
        if (shiftKey) {
          // Add to sidebar instead of navigating
          await this.addNoteToSidebar(existingNote);
        } else {
          // Dispatch the navigation event for App.svelte to handle
          const event = new CustomEvent('wikilink-navigate', {
            detail: { note: existingNote },
            bubbles: true
          });
          document.dispatchEvent(event);
        }
      }
    }
  }

  /**
   * Adds a note to the sidebar and ensures the right sidebar is visible in notes mode
   */
  private async addNoteToSidebar(note: NoteMetadata): Promise<void> {
    try {
      // Fetch the note content
      const chatService = getChatService();
      const noteContent = await chatService.getNote({ identifier: note.id });

      // Add to sidebar (only proceed if we successfully fetched the note)
      if (noteContent) {
        await sidebarNotesStore.addNote(note.id, note.title, noteContent.content);

        // Open the right sidebar in notes mode if not already visible
        if (
          !sidebarState.rightSidebar.visible ||
          sidebarState.rightSidebar.mode !== 'notes'
        ) {
          await sidebarState.setRightSidebarMode('notes');
          if (!sidebarState.rightSidebar.visible) {
            await sidebarState.toggleRightSidebar();
          }
        }
      }
    } catch (error) {
      console.error('Failed to add note to sidebar:', error);
    }
  }

  /**
   * Stub implementation for contexts where wikilink navigation
   * isn't supported (e.g., message input fields).
   */
  handleWikilinkClickStub(
    _noteId: string,
    _title: string,
    _shouldCreate?: boolean
  ): void {
    // No-op for contexts where navigation isn't appropriate
    // Components can override this behavior if needed
  }
}

export const wikilinkService = new WikilinkService();
