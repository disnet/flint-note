interface TemporaryTab {
    id: string;
    noteId: string;
    title: string;
    openedAt: Date;
    lastAccessed: Date;
    source: 'search' | 'wikilink' | 'navigation';
    order: number;
}
declare class TemporaryTabsStore {
    private state;
    private currentVaultId;
    private isVaultSwitching;
    constructor();
    get tabs(): TemporaryTab[];
    get activeTabId(): string | null;
    get maxTabs(): number;
    addTab(noteId: string, title: string, source: 'search' | 'wikilink' | 'navigation'): void;
    removeTab(tabId: string): void;
    clearAllTabs(): void;
    startVaultSwitch(): void;
    endVaultSwitch(): void;
    /**
     * Remove tabs by note IDs (used by navigation service for coordination)
     */
    removeTabsByNoteIds(noteIds: string[], autoSelectNext?: boolean): void;
    /**
     * Clear the active tab highlighting
     */
    clearActiveTab(): void;
    setActiveTab(tabId: string): void;
    reorderTabs(sourceIndex: number, targetIndex: number): void;
    addTabAtPosition(tab: {
        noteId: string;
        title: string;
        source: 'search' | 'wikilink' | 'navigation';
        order?: number;
    }, targetIndex?: number): void;
    private migrateTabsWithoutOrder;
    private cleanupOldTabs;
    private initializeVault;
    private migrateOldStorage;
    private getStorageKey;
    private loadFromStorage;
    private saveToStorage;
    refreshForVault(vaultId?: string): Promise<void>;
}
export declare const temporaryTabsStore: TemporaryTabsStore;
export {};
