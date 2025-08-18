import type { NoteMetadata } from './noteStore.svelte';
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
declare class NoteNavigationService {
    private previousPinnedIds;
    constructor();
    /**
     * Opens a note and handles all coordination between pinned and recent lists
     */
    openNote(note: NoteMetadata, source: 'search' | 'wikilink' | 'navigation', onNoteOpen: (note: NoteMetadata) => void, onSystemViewClear?: () => void): void;
    /**
     * Manually check for pinned notes changes (to be called periodically)
     */
    checkPinnedNotesChanges(): void;
    /**
     * Handle changes to pinned notes (pin/unpin operations)
     */
    private handlePinnedNotesChange;
    /**
     * Handle unpinned notes - to be called with notes store access
     */
    private handleUnpinnedNotes;
}
export declare const noteNavigationService: NoteNavigationService;
export {};
