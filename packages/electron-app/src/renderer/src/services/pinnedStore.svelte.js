import { getChatService } from './chatService';
import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
const defaultState = {
    notes: []
};
const PINNED_NOTES_KEY_PREFIX = 'flint-pinned-notes';
class PinnedNotesStore {
    state = $state(defaultState);
    currentVaultId = null;
    constructor() {
        this.initializeVault();
    }
    get notes() {
        return [...this.state.notes].sort((a, b) => a.order - b.order);
    }
    getStorageKey(vaultId) {
        const vault = vaultId || this.currentVaultId || 'default';
        return `${PINNED_NOTES_KEY_PREFIX}-${vault}`;
    }
    loadFromStorage(vaultId) {
        try {
            const stored = localStorage.getItem(this.getStorageKey(vaultId));
            if (stored) {
                const notes = JSON.parse(stored);
                return this.migrateNotesWithoutOrder(notes);
            }
        }
        catch (error) {
            console.warn('Failed to load pinned notes from storage:', error);
        }
        return [];
    }
    saveToStorage(vaultId) {
        try {
            localStorage.setItem(this.getStorageKey(vaultId), JSON.stringify(this.state.notes));
        }
        catch (error) {
            console.warn('Failed to save pinned notes to storage:', error);
        }
    }
    migrateNotesWithoutOrder(notes) {
        return notes.map((note, index) => ({
            ...note,
            order: note.order ?? index
        }));
    }
    async initializeVault() {
        try {
            const service = getChatService();
            const vault = await service.getCurrentVault();
            this.currentVaultId = vault?.id || 'default';
            const notes = this.loadFromStorage();
            this.state.notes = notes;
        }
        catch (error) {
            console.warn('Failed to initialize vault for pinned notes:', error);
            this.currentVaultId = 'default';
            const notes = this.loadFromStorage();
            this.state.notes = notes;
        }
    }
    isPinned(noteId) {
        return this.state.notes.some((note) => note.id === noteId);
    }
    pinNote(id, title, filename) {
        if (this.state.notes.some((note) => note.id === id)) {
            return; // Already pinned
        }
        const pinnedNote = {
            id,
            title,
            filename,
            pinnedAt: new Date().toISOString(),
            order: this.state.notes.length
        };
        this.state.notes = [...this.state.notes, pinnedNote];
        this.saveToStorage();
        // Remove from temporary tabs when pinned
        temporaryTabsStore.removeTabsByNoteIds([id]);
    }
    unpinNote(noteId) {
        // Get note info before removing it
        const noteToUnpin = this.state.notes.find((note) => note.id === noteId);
        this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
        // Reassign order values to maintain sequence
        this.state.notes.forEach((note, index) => {
            note.order = index;
        });
        this.saveToStorage();
        // Add to temporary tabs when unpinned
        if (noteToUnpin) {
            temporaryTabsStore.addTab(noteToUnpin.id, noteToUnpin.title, 'navigation');
        }
    }
    togglePin(id, title, filename) {
        if (this.isPinned(id)) {
            this.unpinNote(id);
            return false;
        }
        else {
            this.pinNote(id, title, filename);
            return true;
        }
    }
    reorderNotes(sourceIndex, targetIndex) {
        const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
        const movedNote = notes[sourceIndex];
        const [removed] = notes.splice(sourceIndex, 1);
        notes.splice(targetIndex, 0, removed);
        // Reassign order values
        notes.forEach((note, index) => {
            note.order = index;
        });
        this.state.notes = notes;
        this.saveToStorage();
        // Trigger animation after DOM update
        if (movedNote && typeof window !== 'undefined') {
            import('../utils/dragDrop.svelte.js')
                .then(({ animateReorder }) => {
                setTimeout(() => {
                    animateReorder('.pinned-list', sourceIndex, targetIndex, movedNote.id);
                }, 10);
            })
                .catch(() => {
                // Silently fail if animation utilities aren't available
            });
        }
    }
    addNoteAtPosition(note, targetIndex) {
        const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
        const position = targetIndex ?? notes.length;
        notes.splice(position, 0, note);
        // Reassign order values
        notes.forEach((n, index) => {
            n.order = index;
        });
        this.state.notes = notes;
        this.saveToStorage();
        // Trigger animation for newly added note
        if (typeof window !== 'undefined') {
            import('../utils/dragDrop.svelte.js')
                .then(({ animateItemAdd }) => {
                animateItemAdd(note.id, '.pinned-list');
            })
                .catch(() => {
                // Silently fail if animation utilities aren't available
            });
        }
    }
    clear() {
        this.state.notes = [];
        this.saveToStorage();
    }
    async refreshForVault(vaultId) {
        if (vaultId) {
            this.currentVaultId = vaultId;
        }
        else {
            try {
                const service = getChatService();
                const vault = await service.getCurrentVault();
                this.currentVaultId = vault?.id || 'default';
            }
            catch (error) {
                console.warn('Failed to get current vault:', error);
            }
        }
        const notes = this.loadFromStorage();
        this.state.notes = notes;
    }
}
export const pinnedNotesStore = new PinnedNotesStore();
