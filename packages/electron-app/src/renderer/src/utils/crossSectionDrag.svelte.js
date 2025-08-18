import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { pinnedNotesStore } from '../services/pinnedStore.svelte';
export function handleCrossSectionDrop(draggedId, draggedType, targetSection, targetIndex) {
    // Handle temporary → pinned conversion
    if (draggedType === 'temporary' && targetSection === 'pinned') {
        const tab = temporaryTabsStore.tabs.find((t) => t.id === draggedId);
        if (!tab)
            return false;
        // Create pinned note from temporary tab
        const pinnedNote = {
            id: tab.noteId,
            title: tab.title,
            filename: '', // Will be resolved by PinnedNotes component
            pinnedAt: new Date().toISOString(),
            order: targetIndex
        };
        // Add to pinned notes at specific position (this triggers fade-in animation)
        pinnedNotesStore.addNoteAtPosition(pinnedNote, targetIndex);
        // Clear active tab if this tab was active (to prevent auto-selecting another tab)
        if (temporaryTabsStore.activeTabId === tab.id) {
            temporaryTabsStore.clearActiveTab();
        }
        // Animate removal from temporary tabs
        if (typeof window !== 'undefined') {
            import('./dragDrop.svelte.js')
                .then(({ animateItemRemove }) => {
                animateItemRemove(tab.id, '.tabs-list', () => {
                    temporaryTabsStore.removeTab(tab.id);
                });
            })
                .catch(() => {
                // Fallback to immediate removal
                temporaryTabsStore.removeTab(tab.id);
            });
        }
        else {
            temporaryTabsStore.removeTab(tab.id);
        }
        return true;
    }
    // Handle pinned → temporary conversion
    if (draggedType === 'pinned' && targetSection === 'temporary') {
        const pinnedNote = pinnedNotesStore.notes.find((n) => n.id === draggedId);
        if (!pinnedNote)
            return false;
        // Create temporary tab from pinned note
        const tempTab = {
            noteId: pinnedNote.id,
            title: pinnedNote.title,
            source: 'navigation',
            order: targetIndex
        };
        // Add to temporary tabs at specific position (this triggers fade-in animation)
        temporaryTabsStore.addTabAtPosition(tempTab, targetIndex);
        // Animate removal from pinned notes
        if (typeof window !== 'undefined') {
            import('./dragDrop.svelte.js')
                .then(({ animateItemRemove }) => {
                animateItemRemove(pinnedNote.id, '.pinned-list', () => {
                    pinnedNotesStore.unpinNote(pinnedNote.id);
                });
            })
                .catch(() => {
                // Fallback to immediate removal
                pinnedNotesStore.unpinNote(pinnedNote.id);
            });
        }
        else {
            pinnedNotesStore.unpinNote(pinnedNote.id);
        }
        return true;
    }
    return false;
}
