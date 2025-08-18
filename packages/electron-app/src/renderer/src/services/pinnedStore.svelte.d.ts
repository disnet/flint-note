import type { PinnedNoteInfo } from './types';
declare class PinnedNotesStore {
    private state;
    private currentVaultId;
    constructor();
    get notes(): PinnedNoteInfo[];
    private getStorageKey;
    private loadFromStorage;
    private saveToStorage;
    private migrateNotesWithoutOrder;
    private initializeVault;
    isPinned(noteId: string): boolean;
    pinNote(id: string, title: string, filename: string): void;
    unpinNote(noteId: string): void;
    togglePin(id: string, title: string, filename: string): boolean;
    reorderNotes(sourceIndex: number, targetIndex: number): void;
    addNoteAtPosition(note: PinnedNoteInfo, targetIndex?: number): void;
    clear(): void;
    refreshForVault(vaultId?: string): Promise<void>;
}
export declare const pinnedNotesStore: PinnedNotesStore;
export {};
