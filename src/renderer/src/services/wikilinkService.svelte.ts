import { getChatService } from './chatService.js';
import { notesStore } from './noteStore.svelte';

/**
 * Centralized service for handling wikilink click interactions.
 * Consolidates note creation, navigation, and event dispatch logic
 * that was previously duplicated across multiple components.
 */
class WikilinkService {
  /**
   * Handles wikilink click events - either navigates to existing notes
   * or creates new notes if they don't exist.
   */
  async handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
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
        const newNote = await chatService.createNote({
          vaultId: currentVault.id,
          type: 'note',
          identifier: title,
          content: ``
        });

        // Note: The message bus will automatically update the note cache when IPC events are published
        // Find the full note data from the store
        const fullNote = notesStore.notes.find((n) => n.id === newNote.id);

        if (fullNote) {
          // Dispatch the navigation event for App.svelte to handle
          const event = new CustomEvent('wikilink-navigate', {
            detail: { note: fullNote },
            bubbles: true
          });
          document.dispatchEvent(event);
        }
      } catch (error) {
        console.error('Failed to create note:', error);
      }
    } else {
      // Navigate to existing note
      const existingNote = notesStore.notes.find((n) => n.id === noteId);
      if (existingNote) {
        // Dispatch the navigation event for App.svelte to handle
        const event = new CustomEvent('wikilink-navigate', {
          detail: { note: existingNote },
          bubbles: true
        });
        document.dispatchEvent(event);
      }
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
