import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { pinnedNotesStore } from '../services/pinnedStore.svelte';
import type { PinnedNoteInfo } from '../services/types';

export function handleCrossSectionDrop(
  draggedId: string,
  draggedType: 'pinned' | 'temporary',
  targetSection: 'pinned' | 'temporary',
  targetIndex: number
): boolean {
  // Handle temporary → pinned conversion
  if (draggedType === 'temporary' && targetSection === 'pinned') {
    const tab = temporaryTabsStore.tabs.find((t) => t.id === draggedId);
    if (!tab) return false;

    // Create pinned note from temporary tab
    const pinnedNote: PinnedNoteInfo = {
      id: tab.noteId,
      title: tab.title,
      filename: '', // Will be resolved by PinnedNotes component
      pinnedAt: new Date().toISOString(),
      order: targetIndex
    };

    // Add to pinned notes at specific position
    pinnedNotesStore.addNoteAtPosition(pinnedNote, targetIndex);

    // Remove from temporary tabs
    temporaryTabsStore.removeTab(tab.id);

    return true;
  }

  // Handle pinned → temporary conversion
  if (draggedType === 'pinned' && targetSection === 'temporary') {
    const pinnedNote = pinnedNotesStore.notes.find((n) => n.id === draggedId);
    if (!pinnedNote) return false;

    // Create temporary tab from pinned note
    const tempTab = {
      noteId: pinnedNote.id,
      title: pinnedNote.title,
      source: 'navigation' as const,
      order: targetIndex
    };

    // Add to temporary tabs at specific position
    temporaryTabsStore.addTabAtPosition(tempTab, targetIndex);

    // Remove from pinned notes
    pinnedNotesStore.unpinNote(pinnedNote.id);

    return true;
  }

  return false;
}
