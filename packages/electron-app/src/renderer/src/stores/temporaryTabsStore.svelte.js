import { getChatService } from '../services/chatService';
const defaultState = {
    tabs: [],
    activeTabId: null,
    maxTabs: 10,
    autoCleanupHours: 24
};
class TemporaryTabsStore {
    state = $state(defaultState);
    currentVaultId = null;
    isVaultSwitching = false;
    constructor() {
        this.initializeVault();
    }
    get tabs() {
        return [...this.state.tabs].sort((a, b) => a.order - b.order);
    }
    get activeTabId() {
        return this.state.activeTabId;
    }
    get maxTabs() {
        return this.state.maxTabs;
    }
    addTab(noteId, title, source) {
        // Don't add tabs while we're switching vaults
        if (this.isVaultSwitching) {
            return;
        }
        const existingIndex = this.state.tabs.findIndex((tab) => tab.noteId === noteId);
        if (existingIndex !== -1) {
            // Update existing tab without moving it
            this.state.tabs[existingIndex].lastAccessed = new Date();
            this.state.tabs[existingIndex].title = title; // Update title in case it changed
            this.state.activeTabId = this.state.tabs[existingIndex].id;
            // Don't move to top - keep existing position
        }
        else {
            // Create new tab
            const newTab = {
                id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId,
                title,
                openedAt: new Date(),
                lastAccessed: new Date(),
                source,
                order: this.state.tabs.length
            };
            // Add to bottom instead of top
            this.state.tabs.push(newTab);
            this.state.activeTabId = newTab.id;
            // Enforce max tabs limit by removing from the beginning (oldest tabs)
            if (this.state.tabs.length > this.state.maxTabs) {
                this.state.tabs = this.state.tabs.slice(-this.state.maxTabs);
            }
        }
        this.saveToStorage();
    }
    removeTab(tabId) {
        const index = this.state.tabs.findIndex((tab) => tab.id === tabId);
        if (index !== -1) {
            this.state.tabs.splice(index, 1);
            // Reassign order values to maintain sequence
            this.state.tabs.forEach((tab, index) => {
                tab.order = index;
            });
            // Update active tab if the removed tab was active
            if (this.state.activeTabId === tabId) {
                this.state.activeTabId =
                    this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
            }
        }
        this.saveToStorage();
    }
    clearAllTabs() {
        this.state.tabs = [];
        this.state.activeTabId = null;
        this.saveToStorage();
    }
    startVaultSwitch() {
        console.log('🔒 startVaultSwitch: current vault', this.currentVaultId, 'tabs:', this.state.tabs.length);
        this.isVaultSwitching = true;
        // Save current tabs to storage before clearing
        this.saveToStorage();
        console.log('💾 startVaultSwitch: saved tabs to storage for vault', this.currentVaultId);
        // Clear the UI but keep vault-specific storage intact
        this.state.tabs = [];
        this.state.activeTabId = null;
        console.log('🧹 startVaultSwitch: cleared UI tabs');
    }
    endVaultSwitch() {
        this.isVaultSwitching = false;
    }
    /**
     * Remove tabs by note IDs (used by navigation service for coordination)
     */
    removeTabsByNoteIds(noteIds, autoSelectNext = false) {
        const originalLength = this.state.tabs.length;
        this.state.tabs = this.state.tabs.filter((tab) => !noteIds.includes(tab.noteId));
        // Update active tab if the removed tab was active
        if (this.state.activeTabId &&
            !this.state.tabs.find((tab) => tab.id === this.state.activeTabId)) {
            // Only auto-select the next tab if explicitly requested
            this.state.activeTabId =
                autoSelectNext && this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
        }
        // Only save if something was actually removed
        if (this.state.tabs.length !== originalLength) {
            this.saveToStorage();
        }
    }
    /**
     * Clear the active tab highlighting
     */
    clearActiveTab() {
        this.state.activeTabId = null;
        this.saveToStorage();
    }
    setActiveTab(tabId) {
        const tab = this.state.tabs.find((t) => t.id === tabId);
        if (tab) {
            this.state.activeTabId = tabId;
            tab.lastAccessed = new Date();
            // Don't move to top - keep existing position
        }
        this.saveToStorage();
    }
    reorderTabs(sourceIndex, targetIndex) {
        const tabs = [...this.state.tabs].sort((a, b) => a.order - b.order);
        const movedTab = tabs[sourceIndex];
        const [removed] = tabs.splice(sourceIndex, 1);
        tabs.splice(targetIndex, 0, removed);
        // Reassign order values
        tabs.forEach((tab, index) => {
            tab.order = index;
        });
        this.state.tabs = tabs;
        this.saveToStorage();
        // Trigger animation after DOM update
        if (movedTab && typeof window !== 'undefined') {
            import('../utils/dragDrop.svelte.js')
                .then(({ animateReorder }) => {
                setTimeout(() => {
                    animateReorder('.tabs-list', sourceIndex, targetIndex, movedTab.id);
                }, 10);
            })
                .catch(() => {
                // Silently fail if animation utilities aren't available
            });
        }
    }
    addTabAtPosition(tab, targetIndex) {
        const tabs = [...this.state.tabs].sort((a, b) => a.order - b.order);
        const position = targetIndex ?? tabs.length;
        const newTab = {
            id: crypto.randomUUID(),
            noteId: tab.noteId,
            title: tab.title,
            openedAt: new Date(),
            lastAccessed: new Date(),
            source: tab.source,
            order: position
        };
        tabs.splice(position, 0, newTab);
        // Reassign order values
        tabs.forEach((t, index) => {
            t.order = index;
        });
        this.state.tabs = tabs;
        this.state.activeTabId = newTab.id;
        this.saveToStorage();
        // Trigger animation for newly added tab
        if (typeof window !== 'undefined') {
            import('../utils/dragDrop.svelte.js')
                .then(({ animateItemAdd }) => {
                animateItemAdd(newTab.id, '.tabs-list');
            })
                .catch(() => {
                // Silently fail if animation utilities aren't available
            });
        }
    }
    migrateTabsWithoutOrder(tabs) {
        return tabs.map((tab, index) => ({
            ...tab,
            order: tab.order ?? index
        }));
    }
    cleanupOldTabs() {
        const cutoffTime = new Date(Date.now() - this.state.autoCleanupHours * 60 * 60 * 1000);
        this.state.tabs = this.state.tabs.filter((tab) => {
            return tab.lastAccessed > cutoffTime;
        });
        // Update active tab if it was cleaned up
        if (this.state.activeTabId &&
            !this.state.tabs.find((tab) => tab.id === this.state.activeTabId)) {
            this.state.activeTabId = this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
        }
        this.saveToStorage();
    }
    async initializeVault() {
        // Clean up old non-vault-specific data
        this.migrateOldStorage();
        try {
            const service = getChatService();
            const vault = await service.getCurrentVault();
            this.currentVaultId = vault?.id || 'default';
            this.loadFromStorage();
            this.cleanupOldTabs();
        }
        catch (error) {
            console.warn('Failed to initialize vault for temporary tabs:', error);
            this.currentVaultId = 'default';
            this.loadFromStorage();
            this.cleanupOldTabs();
        }
    }
    migrateOldStorage() {
        if (typeof window === 'undefined')
            return;
        try {
            // Remove old non-vault-specific storage
            localStorage.removeItem('temporaryTabs');
        }
        catch (error) {
            console.warn('Failed to migrate old temporary tabs storage:', error);
        }
    }
    getStorageKey() {
        const vaultId = this.currentVaultId || 'default';
        return `temporaryTabs-${vaultId}`;
    }
    loadFromStorage() {
        if (typeof window === 'undefined')
            return;
        try {
            const stored = localStorage.getItem(this.getStorageKey());
            if (stored) {
                const parsed = JSON.parse(stored);
                // Convert date strings back to Date objects and migrate order field
                parsed.tabs = this.migrateTabsWithoutOrder(parsed.tabs.map((tab) => ({
                    ...tab,
                    openedAt: new Date(tab.openedAt),
                    lastAccessed: new Date(tab.lastAccessed)
                })));
                this.state = { ...defaultState, ...parsed };
            }
        }
        catch (error) {
            console.warn('Failed to load temporary tabs from storage:', error);
        }
    }
    saveToStorage() {
        if (typeof window === 'undefined')
            return;
        try {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(this.state));
        }
        catch (error) {
            console.warn('Failed to save temporary tabs to storage:', error);
        }
    }
    async refreshForVault(vaultId) {
        console.log('🔄 refreshForVault: switching to vault', vaultId);
        // Set vault switching flag to prevent new tabs from being added
        this.isVaultSwitching = true;
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
        console.log('🔑 refreshForVault: using storage key', this.getStorageKey());
        // Reset to completely new state object to force reactivity
        this.state = {
            tabs: [],
            activeTabId: null,
            maxTabs: 10,
            autoCleanupHours: 24
        };
        // Load from storage for the new vault
        this.loadFromStorage();
        console.log('💾 refreshForVault: loaded', this.state.tabs.length, 'tabs for vault', this.currentVaultId);
        this.cleanupOldTabs();
        // Clear vault switching flag
        this.isVaultSwitching = false;
    }
}
export const temporaryTabsStore = new TemporaryTabsStore();
