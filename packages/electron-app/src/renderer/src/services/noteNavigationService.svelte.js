import { pinnedNotesStore } from './pinnedStore.svelte';
import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
/**
 * Centralized service for handling note navigation and coordination between
 * pinned notes and temporary tabs (recent notes list).
 *
 * Business Rules:
 * - Pinned notes don't appear in recent list when opened
 * - Opening a pinned note clears recent list highlighting
 * - Unpinned notes are added to the end of recent list
 * - Opening regular notes adds them to recent list (unless already pinned)
 */
class NoteNavigationService {
    previousPinnedIds = [];
    constructor() {
        // Initialize with current pinned notes
        this.previousPinnedIds = pinnedNotesStore.notes.map((note) => note.id);
    }
    /**
     * Opens a note and handles all coordination between pinned and recent lists
     */
    openNote(note, source, onNoteOpen, onSystemViewClear) {
        // Check for pinned notes changes before proceeding
        this.checkPinnedNotesChanges();
        // Always open the note in the editor
        onNoteOpen(note);
        // Clear system views if requested
        onSystemViewClear?.();
        const isPinned = pinnedNotesStore.isPinned(note.id);
        if (isPinned) {
            // Pinned note: clear recent list highlighting, don't add to recent list
            temporaryTabsStore.clearActiveTab();
        }
        else {
            // Regular note: add to recent list
            temporaryTabsStore.addTab(note.id, note.title, source);
        }
    }
    /**
     * Manually check for pinned notes changes (to be called periodically)
     */
    checkPinnedNotesChanges() {
        this.handlePinnedNotesChange(pinnedNotesStore.notes);
    }
    /**
     * Handle changes to pinned notes (pin/unpin operations)
     */
    handlePinnedNotesChange(pinnedNotes) {
        const currentPinnedIds = pinnedNotes.map((note) => note.id);
        // Remove newly pinned notes from recent list
        temporaryTabsStore.removeTabsByNoteIds(currentPinnedIds);
        // Find notes that were unpinned
        const unpinnedIds = this.previousPinnedIds.filter((id) => !currentPinnedIds.includes(id));
        // Add unpinned notes to the end of recent list
        // Note: We need access to notesStore to get full note metadata
        // This will be injected when we refactor App.svelte
        this.handleUnpinnedNotes(unpinnedIds);
        // Update tracking state
        this.previousPinnedIds = currentPinnedIds;
    }
    /**
     * Handle unpinned notes - to be called with notes store access
     */
    handleUnpinnedNotes(unpinnedIds) {
        // This will be implemented when we integrate with App.svelte
        // For now, we'll emit an event that App.svelte can listen to
        if (unpinnedIds.length > 0) {
            const event = new CustomEvent('notes-unpinned', {
                detail: { noteIds: unpinnedIds }
            });
            document.dispatchEvent(event);
        }
    }
}
export const noteNavigationService = new NoteNavigationService();
