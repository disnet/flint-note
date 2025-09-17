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
        const newNote = await chatService.createNote({
          type: 'note',
          identifier: title,
          content: ``
        });

        // Refresh the notes store to include the new note
        await notesStore.refresh();

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
