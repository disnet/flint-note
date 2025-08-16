import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { pinnedNotesStore } from '../services/pinnedStore.svelte';
import type { PinnedNoteInfo } from '../services/types';

export function handleCrossSectionDrop(
  draggedId: string,
  draggedType: 'pinned' | 'temporary',
  targetSection: 'pinned' | 'temporary',
  targetIndex: number
): boolean {
  // Only handle temporary → pinned conversion
  if (draggedType !== 'temporary' || targetSection !== 'pinned') {
    return false;
  }

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
