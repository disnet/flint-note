import type { NoteMetadata } from './noteStore.svelte';
import { pinnedNotesStore } from './pinnedStore.svelte';
import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { navigationHistoryStore } from '../stores/navigationHistoryStore.svelte';
import { activeNoteStore } from '../stores/activeNoteStore.svelte';

/**
 * Centralized service for handling note navigation and coordination between
 * pinned notes, temporary tabs (recent notes list), and navigation history.
 *
 * Business Rules:
 * - Pinned notes don't appear in recent list when opened
 * - Opening a pinned note clears recent list highlighting
 * - Unpinned notes are added to the end of recent list
 * - Opening regular notes adds them to recent list (unless already pinned)
 * - All note navigation is tracked in navigation history for back/forward
 */
class NoteNavigationService {
  private previousPinnedIds: string[] = [];

  constructor() {
    // Initialize with current pinned notes
    this.previousPinnedIds = pinnedNotesStore.notes.map((note) => note.id);
  }

  /**
   * Opens a note and handles all coordination between pinned notes, recent tabs, and navigation history
   */
  async openNote(
    note: NoteMetadata,
    source: 'search' | 'wikilink' | 'navigation' | 'history',
    onNoteOpen: (note: NoteMetadata) => Promise<void> | void,
    onSystemViewClear?: () => void
  ): Promise<void> {
    // Check for pinned notes changes before proceeding
    this.checkPinnedNotesChanges();

    // Always open the note in the editor
    await onNoteOpen(note);

    // Clear system views if requested
    onSystemViewClear?.();

    const isPinned = pinnedNotesStore.isPinned(note.id);

    if (isPinned) {
      // Pinned note: clear recent list highlighting, don't add to recent list
      temporaryTabsStore.clearActiveTab();
    } else {
      // Regular note: add to recent list
      temporaryTabsStore.addTab(note.id, note.title, source);
    }

    // Add to navigation history (unless this is already a history navigation)
    if (source !== 'history') {
      await navigationHistoryStore.addEntry(note.id, note.title, source);
    }
  }

  /**
   * Navigate backwards in history
   */
  goBack(): boolean {
    const entry = navigationHistoryStore.goBack();
    if (entry) {
      // Find the note and open it
      this.openNoteFromHistory(entry);
      return true;
    }
    return false;
  }

  /**
   * Navigate forwards in history
   */
  goForward(): boolean {
    const entry = navigationHistoryStore.goForward();
    if (entry) {
      // Find the note and open it
      this.openNoteFromHistory(entry);
      return true;
    }
    return false;
  }

  /**
   * Handle browser popstate events
   */
  handlePopState(event: PopStateEvent): boolean {
    const entry = navigationHistoryStore.handlePopState(event);
    if (entry) {
      this.openNoteFromHistory(entry);
      return true;
    }
    return false;
  }

  /**
   * Get navigation state for UI
   */
  get canGoBack(): boolean {
    return navigationHistoryStore.canGoBack;
  }

  get canGoForward(): boolean {
    return navigationHistoryStore.canGoForward;
  }

  /**
   * Update scroll position for current navigation entry
   */
  async updateScrollPosition(scrollPosition: number): Promise<void> {
    await navigationHistoryStore.updateScrollPosition(scrollPosition);
  }

  /**
   * Start vault switch - notify all stores
   */
  async startVaultSwitch(): Promise<void> {
    await navigationHistoryStore.startVaultSwitch();
    await activeNoteStore.startVaultSwitch();
  }

  /**
   * End vault switch - refresh all stores for new vault
   */
  async endVaultSwitch(): Promise<void> {
    await navigationHistoryStore.endVaultSwitch();
    await activeNoteStore.endVaultSwitch();
  }

  /**
   * Open a note from navigation history
   */
  private openNoteFromHistory(entry: {
    noteId: string;
    title: string;
    scrollPosition?: number;
  }): void {
    // Emit event to find and open the note
    const event = new CustomEvent('history-navigate', {
      detail: {
        noteId: entry.noteId,
        title: entry.title,
        scrollPosition: entry.scrollPosition
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Manually check for pinned notes changes (to be called periodically)
   */
  checkPinnedNotesChanges(): void {
    this.handlePinnedNotesChange(pinnedNotesStore.notes);
  }

  /**
   * Handle changes to pinned notes (pin/unpin operations)
   */
  private handlePinnedNotesChange(
    pinnedNotes: Array<{ id: string; title: string; filename: string }>
  ): void {
    const currentPinnedIds = pinnedNotes.map((note) => note.id);

    // Remove newly pinned notes from recent list
    temporaryTabsStore.removeTabsByNoteIds(currentPinnedIds);

    // Find notes that were unpinned
    const unpinnedIds = this.previousPinnedIds.filter(
      (id) => !currentPinnedIds.includes(id)
    );

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
  private handleUnpinnedNotes(unpinnedIds: string[]): void {
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
