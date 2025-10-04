import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { pinnedNotesStore } from '../services/pinnedStore.svelte';
import type { PinnedNoteInfo } from '../services/types';

export async function handleCrossSectionDrop(
  draggedId: string,
  draggedType: 'pinned' | 'temporary',
  targetSection: 'pinned' | 'temporary',
  targetIndex: number
): Promise<boolean> {
  // Handle temporary → pinned conversion
  if (draggedType === 'temporary' && targetSection === 'pinned') {
    const tab = temporaryTabsStore.tabs.find((t) => t.id === draggedId);
    if (!tab) return false;

    // Create pinned note from temporary tab
    const pinnedNote: PinnedNoteInfo = {
      id: tab.noteId,
      pinnedAt: new Date().toISOString(),
      order: targetIndex
    };

    try {
      // Add to pinned notes at specific position (this triggers fade-in animation)
      await pinnedNotesStore.addNoteAtPosition(pinnedNote, targetIndex);

      // Clear active tab if this tab was active (to prevent auto-selecting another tab)
      if (temporaryTabsStore.activeTabId === tab.id) {
        await temporaryTabsStore.clearActiveTab();
      }

      // Animate removal from temporary tabs
      if (typeof window !== 'undefined') {
        import('./dragDrop.svelte.js')
          .then(({ animateItemRemove }) => {
            animateItemRemove(tab.id, '.tabs-list', async () => {
              await temporaryTabsStore.removeTab(tab.id);
            });
          })
          .catch(async () => {
            // Fallback to immediate removal
            await temporaryTabsStore.removeTab(tab.id);
          });
      } else {
        await temporaryTabsStore.removeTab(tab.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to add note to pinned:', error);
      return false;
    }
  }

  // Handle pinned → temporary conversion
  if (draggedType === 'pinned' && targetSection === 'temporary') {
    const pinnedNote = pinnedNotesStore.notes.find((n) => n.id === draggedId);
    if (!pinnedNote) return false;

    // Create temporary tab from pinned note
    const tempTab = {
      noteId: pinnedNote.id,
      source: 'navigation' as const,
      order: targetIndex
    };

    // Add to temporary tabs at specific position (this triggers fade-in animation)
    await temporaryTabsStore.addTabAtPosition(tempTab, targetIndex);

    // Animate removal from pinned notes
    if (typeof window !== 'undefined') {
      import('./dragDrop.svelte.js')
        .then(({ animateItemRemove }) => {
          animateItemRemove(pinnedNote.id, '.pinned-list', async () => {
            try {
              await pinnedNotesStore.unpinNote(pinnedNote.id);
            } catch (error) {
              console.error('Failed to unpin note:', error);
            }
          });
        })
        .catch(async () => {
          // Fallback to immediate removal
          try {
            await pinnedNotesStore.unpinNote(pinnedNote.id);
          } catch (error) {
            console.error('Failed to unpin note:', error);
          }
        });
    } else {
      try {
        await pinnedNotesStore.unpinNote(pinnedNote.id);
      } catch (error) {
        console.error('Failed to unpin note:', error);
        return false;
      }
    }

    return true;
  }

  return false;
}
