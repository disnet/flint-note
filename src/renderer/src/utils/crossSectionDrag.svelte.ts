import { workspacesStore, type PinnedNoteInfo } from '../stores/workspacesStore.svelte';

export async function handleCrossSectionDrop(
  draggedId: string,
  draggedType: 'pinned' | 'temporary',
  targetSection: 'pinned' | 'temporary',
  targetIndex: number
): Promise<boolean> {
  // Handle temporary → pinned conversion
  if (draggedType === 'temporary' && targetSection === 'pinned') {
    const tab = workspacesStore.temporaryTabs.find((t) => t.id === draggedId);
    if (!tab) return false;

    // Create pinned note from temporary tab
    const pinnedNote: PinnedNoteInfo = {
      id: tab.noteId,
      pinnedAt: new Date().toISOString(),
      order: targetIndex
    };

    try {
      // Add to pinned notes at specific position (this triggers fade-in animation)
      await workspacesStore.addPinnedNoteAtPosition(pinnedNote, targetIndex);

      // Clear active tab if this tab was active (to prevent auto-selecting another tab)
      if (workspacesStore.currentActiveTabId === tab.id) {
        await workspacesStore.clearActiveTab();
      }

      // Animate removal from temporary tabs
      if (typeof window !== 'undefined') {
        import('./dragDrop.svelte.js')
          .then(({ animateItemRemove }) => {
            animateItemRemove(tab.id, '.tabs-list', async () => {
              await workspacesStore.removeTab(tab.id);
            });
          })
          .catch(async () => {
            // Fallback to immediate removal
            await workspacesStore.removeTab(tab.id);
          });
      } else {
        await workspacesStore.removeTab(tab.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to add note to pinned:', error);
      return false;
    }
  }

  // Handle pinned → temporary conversion
  if (draggedType === 'pinned' && targetSection === 'temporary') {
    const pinnedNote = workspacesStore.pinnedNotes.find((n) => n.id === draggedId);
    if (!pinnedNote) return false;

    // Create temporary tab from pinned note
    const tempTab = {
      noteId: pinnedNote.id,
      source: 'navigation' as const,
      order: targetIndex
    };

    // Add to temporary tabs at specific position (this triggers fade-in animation)
    await workspacesStore.addTabAtPosition(tempTab, targetIndex);

    // Animate removal from pinned notes
    if (typeof window !== 'undefined') {
      import('./dragDrop.svelte.js')
        .then(({ animateItemRemove }) => {
          animateItemRemove(pinnedNote.id, '.pinned-list', async () => {
            try {
              // Use unpinNote with addToTabs=false since we already added the tab
              await workspacesStore.unpinNote(pinnedNote.id, false);
            } catch (error) {
              console.error('Failed to unpin note:', error);
            }
          });
        })
        .catch(async () => {
          // Fallback to immediate removal
          try {
            await workspacesStore.unpinNote(pinnedNote.id, false);
          } catch (error) {
            console.error('Failed to unpin note:', error);
          }
        });
    } else {
      try {
        await workspacesStore.unpinNote(pinnedNote.id, false);
      } catch (error) {
        console.error('Failed to unpin note:', error);
        return false;
      }
    }

    return true;
  }

  return false;
}
