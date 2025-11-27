import { getChatService } from '../services/chatService';
import { messageBus } from '../services/messageBus.svelte';
import { logger } from '../utils/logger';

export interface PinnedNoteInfo {
  id: string;
  pinnedAt: string;
  order: number;
}

export interface TemporaryTab {
  id: string;
  noteId: string;
  openedAt: Date;
  lastAccessed: Date;
  source: 'search' | 'wikilink' | 'navigation' | 'history';
  order: number;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  pinnedNotes: PinnedNoteInfo[];
  temporaryTabs: TemporaryTab[];
  createdAt: string;
  updatedAt: string;
  order: number;
  // Appearance options (UI only for now)
  color?: string;
}

interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

const defaultState: WorkspacesState = {
  workspaces: [],
  activeWorkspaceId: ''
};

class WorkspacesStore {
  private state = $state<WorkspacesState>(defaultState);
  private currentVaultId: string | null = null;
  private isVaultSwitching = false;
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private isHydrated = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initializeVault();

    // Subscribe to note events
    messageBus.subscribe('note.renamed', async (event) => {
      await this.updateNoteId(event.oldId, event.newId);
    });

    messageBus.subscribe('note.deleted', async (event) => {
      await this.removeNoteFromWorkspaces(event.noteId);
    });

    messageBus.subscribe('notes.bulkRefresh', async () => {
      await this.validateAllWorkspaces();
    });
  }

  // Getters
  get workspaces(): Workspace[] {
    return [...this.state.workspaces].sort((a, b) => a.order - b.order);
  }

  get activeWorkspaceId(): string {
    return this.state.activeWorkspaceId;
  }

  get activeWorkspace(): Workspace | undefined {
    return this.state.workspaces.find((w) => w.id === this.state.activeWorkspaceId);
  }

  get pinnedNotes(): PinnedNoteInfo[] {
    const workspace = this.activeWorkspace;
    if (!workspace) return [];
    return [...workspace.pinnedNotes].sort((a, b) => a.order - b.order);
  }

  get temporaryTabs(): TemporaryTab[] {
    const workspace = this.activeWorkspace;
    if (!workspace) return [];
    return [...workspace.temporaryTabs].sort((a, b) => a.order - b.order);
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  get isReady(): boolean {
    return this.isHydrated && !this.isLoading;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  // Workspace management
  async createWorkspace(params: {
    name: string;
    icon: string;
    color?: string;
  }): Promise<Workspace> {
    await this.ensureInitialized();

    const newWorkspace: Workspace = {
      id: `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: params.name,
      icon: params.icon,
      pinnedNotes: [],
      temporaryTabs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: this.state.workspaces.length,
      color: params.color
    };

    this.state.workspaces = [...this.state.workspaces, newWorkspace];
    await this.saveToStorage();

    return newWorkspace;
  }

  async updateWorkspace(
    workspaceId: string,
    updates: Partial<Pick<Workspace, 'name' | 'icon' | 'color'>>
  ): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.state.workspaces.find((w) => w.id === workspaceId);
    if (workspace) {
      if (updates.name !== undefined) workspace.name = updates.name;
      if (updates.icon !== undefined) workspace.icon = updates.icon;
      if (updates.color !== undefined) workspace.color = updates.color;
      workspace.updatedAt = new Date().toISOString();
      await this.saveToStorage();
    }
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.ensureInitialized();

    // Don't allow deleting the last workspace
    if (this.state.workspaces.length <= 1) {
      console.warn('[workspacesStore] Cannot delete the last workspace');
      return;
    }

    const index = this.state.workspaces.findIndex((w) => w.id === workspaceId);
    if (index === -1) return;

    this.state.workspaces.splice(index, 1);

    // Reassign order values
    this.state.workspaces.forEach((w, i) => {
      w.order = i;
    });

    // Switch to another workspace if we deleted the active one
    if (this.state.activeWorkspaceId === workspaceId) {
      this.state.activeWorkspaceId = this.state.workspaces[0].id;
    }

    await this.saveToStorage();
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    await this.ensureInitialized();

    if (this.state.activeWorkspaceId === workspaceId) return;

    const workspace = this.state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      console.warn('[workspacesStore] Workspace not found:', workspaceId);
      return;
    }

    // Clear the active note when switching workspaces
    const { activeNoteStore } = await import('./activeNoteStore.svelte');
    await activeNoteStore.clearActiveNote();

    this.state.activeWorkspaceId = workspaceId;
    this.activeTabId = null;
    await this.saveToStorage();

    // Refresh navigation service's pinned tracking for the new workspace
    const { noteNavigationService } =
      await import('../services/noteNavigationService.svelte');
    noteNavigationService.refreshPinnedTracking();
  }

  async reorderWorkspaces(sourceIndex: number, targetIndex: number): Promise<void> {
    await this.ensureInitialized();

    const workspaces = [...this.state.workspaces].sort((a, b) => a.order - b.order);
    const [removed] = workspaces.splice(sourceIndex, 1);
    workspaces.splice(targetIndex, 0, removed);

    // Reassign order values
    workspaces.forEach((w, i) => {
      w.order = i;
    });

    this.state.workspaces = workspaces;
    await this.saveToStorage();
  }

  // Pinned notes management (for active workspace)
  isPinned(noteId: string): boolean {
    const workspace = this.activeWorkspace;
    if (!workspace) return false;
    return workspace.pinnedNotes.some((note) => note.id === noteId);
  }

  async pinNote(noteId: string): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    if (workspace.pinnedNotes.some((note) => note.id === noteId)) {
      return; // Already pinned
    }

    const pinnedNote: PinnedNoteInfo = {
      id: noteId,
      pinnedAt: new Date().toISOString(),
      order: workspace.pinnedNotes.length
    };

    workspace.pinnedNotes.push(pinnedNote);
    workspace.updatedAt = new Date().toISOString();

    // Remove from temporary tabs when pinned
    await this.removeTabsByNoteIds([noteId], false);

    await this.saveToStorage();
  }

  async unpinNote(noteId: string, addToTabs: boolean = true): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    workspace.pinnedNotes = workspace.pinnedNotes.filter((note) => note.id !== noteId);

    // Reassign order values
    workspace.pinnedNotes.forEach((note, index) => {
      note.order = index;
    });

    workspace.updatedAt = new Date().toISOString();

    // Add to temporary tabs when unpinned
    if (addToTabs) {
      await this.addTab(noteId, 'navigation');
    }

    await this.saveToStorage();
  }

  async togglePin(noteId: string): Promise<boolean> {
    if (this.isPinned(noteId)) {
      await this.unpinNote(noteId);
      return false;
    } else {
      await this.pinNote(noteId);
      return true;
    }
  }

  async reorderPinnedNotes(sourceIndex: number, targetIndex: number): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const notes = [...workspace.pinnedNotes].sort((a, b) => a.order - b.order);
    const [removed] = notes.splice(sourceIndex, 1);
    notes.splice(targetIndex, 0, removed);

    // Reassign order values
    notes.forEach((note, index) => {
      note.order = index;
    });

    workspace.pinnedNotes = notes;
    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  async addPinnedNoteAtPosition(
    note: PinnedNoteInfo,
    targetIndex?: number
  ): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const notes = [...workspace.pinnedNotes].sort((a, b) => a.order - b.order);
    const position = targetIndex ?? notes.length;

    notes.splice(position, 0, note);

    // Reassign order values
    notes.forEach((n, index) => {
      n.order = index;
    });

    workspace.pinnedNotes = notes;
    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  // Temporary tabs management (for active workspace)
  private activeTabId = $state<string | null>(null);

  get currentActiveTabId(): string | null {
    return this.activeTabId;
  }

  async addTab(
    noteId: string,
    source: 'search' | 'wikilink' | 'navigation' | 'history'
  ): Promise<void> {
    await this.ensureInitialized();

    if (this.isVaultSwitching) return;

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const existingIndex = workspace.temporaryTabs.findIndex(
      (tab) => tab.noteId === noteId
    );

    if (existingIndex !== -1) {
      // Update existing tab
      workspace.temporaryTabs[existingIndex].lastAccessed = new Date();
      this.activeTabId = workspace.temporaryTabs[existingIndex].id;
    } else {
      // Create new tab
      const newTab: TemporaryTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId,
        openedAt: new Date(),
        lastAccessed: new Date(),
        source,
        order: workspace.temporaryTabs.length
      };

      workspace.temporaryTabs.push(newTab);
      this.activeTabId = newTab.id;

      // Enforce max tabs limit (default 10)
      const maxTabs = 10;
      if (workspace.temporaryTabs.length > maxTabs) {
        workspace.temporaryTabs = workspace.temporaryTabs.slice(-maxTabs);
      }
    }

    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  async removeTab(tabId: string): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const index = workspace.temporaryTabs.findIndex((tab) => tab.id === tabId);
    if (index !== -1) {
      const removedTab = workspace.temporaryTabs[index];
      workspace.temporaryTabs.splice(index, 1);

      // Reassign order values
      workspace.temporaryTabs.forEach((tab, i) => {
        tab.order = i;
      });

      // Update active tab if needed
      if (this.activeTabId === tabId) {
        this.activeTabId =
          workspace.temporaryTabs.length > 0 ? workspace.temporaryTabs[0].id : null;
      }

      // Clear the active note if it's the one being closed
      const { activeNoteStore } = await import('./activeNoteStore.svelte');
      if (activeNoteStore.activeNote?.id === removedTab.noteId) {
        await activeNoteStore.clearActiveNote();
      }
    }

    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  async clearAllTabs(): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    // Check if active note is in the tabs being cleared
    const { activeNoteStore } = await import('./activeNoteStore.svelte');
    const activeNoteId = activeNoteStore.activeNote?.id;
    const wasInTabs = activeNoteId
      ? workspace.temporaryTabs.some((tab) => tab.noteId === activeNoteId)
      : false;

    workspace.temporaryTabs = [];
    this.activeTabId = null;
    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();

    // Clear active note if it was in the cleared tabs
    if (wasInTabs) {
      await activeNoteStore.clearActiveNote();
    }
  }

  async setActiveTab(tabId: string): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const tab = workspace.temporaryTabs.find((t) => t.id === tabId);
    if (tab) {
      this.activeTabId = tabId;
      tab.lastAccessed = new Date();
      workspace.updatedAt = new Date().toISOString();
      await this.saveToStorage();
    }
  }

  async reorderTabs(sourceIndex: number, targetIndex: number): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const tabs = [...workspace.temporaryTabs].sort((a, b) => a.order - b.order);
    const [removed] = tabs.splice(sourceIndex, 1);
    tabs.splice(targetIndex, 0, removed);

    // Reassign order values
    tabs.forEach((tab, index) => {
      tab.order = index;
    });

    workspace.temporaryTabs = tabs;
    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  async addTabAtPosition(
    tab: {
      noteId: string;
      source: 'search' | 'wikilink' | 'navigation' | 'history';
    },
    targetIndex?: number
  ): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const tabs = [...workspace.temporaryTabs].sort((a, b) => a.order - b.order);
    const position = targetIndex ?? tabs.length;

    const newTab: TemporaryTab = {
      id: crypto.randomUUID(),
      noteId: tab.noteId,
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

    workspace.temporaryTabs = tabs;
    this.activeTabId = newTab.id;
    workspace.updatedAt = new Date().toISOString();
    await this.saveToStorage();
  }

  async removeTabsByNoteIds(
    noteIds: string[],
    autoSelectNext: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    const workspace = this.activeWorkspace;
    if (!workspace) return;

    const originalLength = workspace.temporaryTabs.length;
    workspace.temporaryTabs = workspace.temporaryTabs.filter(
      (tab) => !noteIds.includes(tab.noteId)
    );

    // Update active tab if needed
    if (
      this.activeTabId &&
      !workspace.temporaryTabs.find((tab) => tab.id === this.activeTabId)
    ) {
      this.activeTabId =
        autoSelectNext && workspace.temporaryTabs.length > 0
          ? workspace.temporaryTabs[0].id
          : null;
    }

    if (workspace.temporaryTabs.length !== originalLength) {
      workspace.updatedAt = new Date().toISOString();
      await this.saveToStorage();
    }
  }

  async clearActiveTab(): Promise<void> {
    await this.ensureInitialized();
    this.activeTabId = null;
    await this.saveToStorage();
  }

  // Vault switching
  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();
    this.isVaultSwitching = true;
    await this.saveToStorage();
    this.state = { ...defaultState };
  }

  endVaultSwitch(): void {
    this.isVaultSwitching = false;
  }

  async refreshForVault(vaultId?: string): Promise<void> {
    this.isHydrated = false;

    if (vaultId) {
      this.currentVaultId = vaultId;
    } else {
      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      } catch (error) {
        console.warn('[workspacesStore] Failed to get current vault:', error);
      }
    }

    // Reset state
    this.state = { ...defaultState };

    // Load from storage
    await this.loadFromStorage();

    // Validate workspaces
    await this.ensureNotesAvailable();

    this.isHydrated = true;
  }

  // Internal methods
  private async updateNoteId(oldId: string, newId: string): Promise<void> {
    await this.ensureInitialized();

    let updated = false;

    for (const workspace of this.state.workspaces) {
      // Update pinned notes
      for (const note of workspace.pinnedNotes) {
        if (note.id === oldId) {
          note.id = newId;
          updated = true;
        }
      }

      // Update temporary tabs
      for (const tab of workspace.temporaryTabs) {
        if (tab.noteId === oldId) {
          tab.noteId = newId;
          updated = true;
        }
      }

      if (updated) {
        workspace.updatedAt = new Date().toISOString();
      }
    }

    if (updated) {
      await this.saveToStorage();
    }
  }

  private async removeNoteFromWorkspaces(noteId: string): Promise<void> {
    await this.ensureInitialized();

    let updated = false;

    for (const workspace of this.state.workspaces) {
      const pinnedIndex = workspace.pinnedNotes.findIndex((note) => note.id === noteId);
      if (pinnedIndex !== -1) {
        workspace.pinnedNotes.splice(pinnedIndex, 1);
        workspace.pinnedNotes.forEach((note, i) => (note.order = i));
        updated = true;
      }

      const tabIndex = workspace.temporaryTabs.findIndex((tab) => tab.noteId === noteId);
      if (tabIndex !== -1) {
        workspace.temporaryTabs.splice(tabIndex, 1);
        workspace.temporaryTabs.forEach((tab, i) => (tab.order = i));
        updated = true;
      }

      if (updated) {
        workspace.updatedAt = new Date().toISOString();
      }
    }

    if (updated) {
      await this.saveToStorage();
    }
  }

  private async validateAllWorkspaces(): Promise<void> {
    await this.ensureInitialized();

    const { notesStore } = await import('../services/noteStore.svelte');

    for (const workspace of this.state.workspaces) {
      // Validate pinned notes
      const orphanedPinned = workspace.pinnedNotes.filter(
        (note) => !notesStore.notes.some((n) => n.id === note.id)
      );

      if (orphanedPinned.length > 0) {
        console.warn(
          `[workspacesStore] Workspace "${workspace.name}" has orphaned pinned notes:`,
          orphanedPinned
        );
      }

      // Validate tabs
      const orphanedTabs = workspace.temporaryTabs.filter(
        (tab) => !notesStore.notes.some((n) => n.id === tab.noteId)
      );

      if (orphanedTabs.length > 0) {
        console.warn(
          `[workspacesStore] Workspace "${workspace.name}" has orphaned tabs:`,
          orphanedTabs
        );
      }
    }
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    this.isHydrated = false;

    try {
      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      } catch (error) {
        console.warn('[workspacesStore] Failed to get current vault:', error);
        this.currentVaultId = 'default';
      }

      await this.loadFromStorage();
      await this.ensureNotesAvailable();
      this.isHydrated = true;
    } catch (error) {
      console.warn('[workspacesStore] Failed to initialize:', error);
      this.isHydrated = true;
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.currentVaultId) return;

    try {
      const stored = await window.api?.loadUIState({
        vaultId: this.currentVaultId,
        stateKey: 'workspaces'
      });

      if (
        stored &&
        typeof stored === 'object' &&
        'workspaces' in stored &&
        Array.isArray(stored.workspaces) &&
        stored.workspaces.length > 0
      ) {
        // Parse dates in temporary tabs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workspaces = (stored.workspaces as any[]).map((workspace) => ({
          ...workspace,
          temporaryTabs: workspace.temporaryTabs.map(
            (tab: {
              openedAt: string;
              lastAccessed: string;
              id: string;
              noteId: string;
              source: string;
              order: number;
            }) => ({
              ...tab,
              openedAt: new Date(tab.openedAt),
              lastAccessed: new Date(tab.lastAccessed)
            })
          )
        }));

        this.state = {
          workspaces,
          activeWorkspaceId:
            (stored as WorkspacesState).activeWorkspaceId || workspaces[0].id
        };

        logger.debug('[workspacesStore] Loaded workspaces:', {
          count: this.state.workspaces.length,
          activeId: this.state.activeWorkspaceId
        });
      } else {
        // No workspaces found, migrate from old stores
        await this.migrateFromOldStores();
      }
    } catch (error) {
      console.warn('[workspacesStore] Failed to load from storage:', error);
      await this.migrateFromOldStores();
    }
  }

  private async migrateFromOldStores(): Promise<void> {
    if (!this.currentVaultId) return;

    logger.debug('[workspacesStore] Migrating from old stores...');

    // Load old pinned notes
    let pinnedNotes: PinnedNoteInfo[] = [];
    try {
      const oldPinned = await window.api?.loadUIState({
        vaultId: this.currentVaultId,
        stateKey: 'pinned_notes'
      });
      if (
        oldPinned &&
        typeof oldPinned === 'object' &&
        'notes' in oldPinned &&
        Array.isArray(oldPinned.notes)
      ) {
        pinnedNotes = oldPinned.notes as PinnedNoteInfo[];
      }
    } catch (error) {
      console.warn('[workspacesStore] Failed to load old pinned notes:', error);
    }

    // Load old temporary tabs
    let temporaryTabs: TemporaryTab[] = [];
    try {
      const oldTabs = await window.api?.loadUIState({
        vaultId: this.currentVaultId,
        stateKey: 'temporary_tabs'
      });
      if (
        oldTabs &&
        typeof oldTabs === 'object' &&
        'tabs' in oldTabs &&
        Array.isArray(oldTabs.tabs)
      ) {
        temporaryTabs = oldTabs.tabs.map(
          (tab: TemporaryTab & { openedAt: string; lastAccessed: string }) => ({
            ...tab,
            openedAt: new Date(tab.openedAt),
            lastAccessed: new Date(tab.lastAccessed)
          })
        );
      }
    } catch (error) {
      console.warn('[workspacesStore] Failed to load old temporary tabs:', error);
    }

    // Create default workspace with migrated data
    const defaultWorkspace: Workspace = {
      id: `workspace-${Date.now()}-default`,
      name: 'Default',
      icon: '📋',
      pinnedNotes,
      temporaryTabs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: 0
    };

    this.state = {
      workspaces: [defaultWorkspace],
      activeWorkspaceId: defaultWorkspace.id
    };

    await this.saveToStorage();

    logger.debug('[workspacesStore] Migration complete:', {
      pinnedCount: pinnedNotes.length,
      tabsCount: temporaryTabs.length
    });
  }

  private async saveToStorage(): Promise<void> {
    if (!this.currentVaultId) return;

    try {
      const serializable = $state.snapshot(this.state);
      await window.api?.saveUIState({
        vaultId: this.currentVaultId,
        stateKey: 'workspaces',
        stateValue: serializable
      });
    } catch (error) {
      console.warn('[workspacesStore] Failed to save to storage:', error);
      throw error;
    }
  }

  private async ensureNotesAvailable(): Promise<void> {
    // Check if any workspace has notes/tabs to validate
    const hasData = this.state.workspaces.some(
      (w) => w.pinnedNotes.length > 0 || w.temporaryTabs.length > 0
    );
    if (!hasData) return;

    const { notesStore } = await import('../services/noteStore.svelte');

    // Wait for notes to load
    let attempts = 0;
    const maxAttempts = 100;

    while (
      (notesStore.loading || notesStore.notes.length === 0) &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      attempts++;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Validate and clean up
    const availableNoteIds = new Set(notesStore.notes.map((n) => n.id));
    let needsSave = false;

    for (const workspace of this.state.workspaces) {
      // Clean pinned notes
      const validPinned = workspace.pinnedNotes.filter((note) =>
        availableNoteIds.has(note.id)
      );
      if (validPinned.length !== workspace.pinnedNotes.length) {
        workspace.pinnedNotes = validPinned;
        workspace.pinnedNotes.forEach((note, i) => (note.order = i));
        needsSave = true;
      }

      // Clean temporary tabs
      const validTabs = workspace.temporaryTabs.filter((tab) =>
        availableNoteIds.has(tab.noteId)
      );
      if (validTabs.length !== workspace.temporaryTabs.length) {
        workspace.temporaryTabs = validTabs;
        workspace.temporaryTabs.forEach((tab, i) => (tab.order = i));
        needsSave = true;
      }
    }

    if (needsSave) {
      await this.saveToStorage();
    }
  }

  // Tutorial/welcome note helpers
  async pinWelcomeNote(welcomeNoteId?: string | null): Promise<void> {
    if (welcomeNoteId) {
      await this.pinNote(welcomeNoteId);
    } else {
      const { notesStore } = await import('../services/noteStore.svelte');
      const welcomeNote = notesStore.notes.find(
        (note) => note.title === 'Welcome to Flint'
      );
      if (welcomeNote) {
        await this.pinNote(welcomeNote.id);
      }
    }
  }

  async addTutorialNoteTabs(tutorialNoteIds?: string[]): Promise<void> {
    await this.ensureInitialized();

    if (tutorialNoteIds && tutorialNoteIds.length > 0) {
      const wasVaultSwitching = this.isVaultSwitching;
      this.isVaultSwitching = false;

      for (const noteId of tutorialNoteIds) {
        await this.addTab(noteId, 'navigation');
      }

      this.isVaultSwitching = wasVaultSwitching;
    } else {
      const tutorialTitles = [
        'Tutorial 1: Your First Daily Note',
        'Tutorial 2: Connecting Ideas with Wikilinks',
        'Tutorial 3: Your AI Assistant in Action',
        'Tutorial 4: Understanding Note Types'
      ];

      const { notesStore } = await import('../services/noteStore.svelte');

      for (const title of tutorialTitles) {
        const tutorialNote = notesStore.notes.find((note) => note.title === title);
        if (tutorialNote) {
          await this.addTab(tutorialNote.id, 'navigation');
        }
      }
    }
  }

  // Move note to another workspace
  async moveNoteToWorkspace(noteId: string, targetWorkspaceId: string): Promise<void> {
    await this.ensureInitialized();

    // Don't move to the same workspace
    if (targetWorkspaceId === this.state.activeWorkspaceId) {
      return;
    }

    const currentWorkspace = this.activeWorkspace;
    const targetWorkspace = this.state.workspaces.find((w) => w.id === targetWorkspaceId);

    if (!currentWorkspace || !targetWorkspace) {
      console.warn('[workspacesStore] Cannot move note - workspace not found');
      return;
    }

    // Remove from current workspace's pinned notes
    const pinnedIndex = currentWorkspace.pinnedNotes.findIndex(
      (note) => note.id === noteId
    );
    if (pinnedIndex !== -1) {
      currentWorkspace.pinnedNotes.splice(pinnedIndex, 1);
      // Reassign order values
      currentWorkspace.pinnedNotes.forEach((note, i) => {
        note.order = i;
      });
    }

    // Remove from current workspace's temporary tabs
    const tabIndex = currentWorkspace.temporaryTabs.findIndex(
      (tab) => tab.noteId === noteId
    );
    if (tabIndex !== -1) {
      const removedTab = currentWorkspace.temporaryTabs[tabIndex];
      // Clear active tab if we're removing it
      if (this.activeTabId === removedTab.id) {
        this.activeTabId = null;
      }
      currentWorkspace.temporaryTabs.splice(tabIndex, 1);
      // Reassign order values
      currentWorkspace.temporaryTabs.forEach((tab, i) => {
        tab.order = i;
      });
    }

    currentWorkspace.updatedAt = new Date().toISOString();

    // Add to target workspace as a temporary tab (always unpinned in destination)
    // Check if it already exists in target workspace
    const existsInTarget =
      targetWorkspace.pinnedNotes.some((note) => note.id === noteId) ||
      targetWorkspace.temporaryTabs.some((tab) => tab.noteId === noteId);

    if (!existsInTarget) {
      const newTab: TemporaryTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId,
        openedAt: new Date(),
        lastAccessed: new Date(),
        source: 'navigation',
        order: targetWorkspace.temporaryTabs.length
      };
      targetWorkspace.temporaryTabs.push(newTab);
      targetWorkspace.updatedAt = new Date().toISOString();
    }

    await this.saveToStorage();

    // Refresh navigation service's pinned tracking to prevent the moved note
    // from being re-added to tabs when navigating to another note
    const { noteNavigationService } =
      await import('../services/noteNavigationService.svelte');
    noteNavigationService.refreshPinnedTracking();
  }
}

export const workspacesStore = new WorkspacesStore();
