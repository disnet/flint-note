/**
 * Unified reactive state management for Flint notes using Automerge
 *
 * This module provides:
 * - Reactive state via Svelte 5 runes
 * - All note/workspace/type mutations via Automerge
 * - Vault management (localStorage for metadata)
 */

import type { DocHandle } from '@automerge/automerge-repo';
import type {
  Note,
  NoteType,
  NotesDocument,
  Vault,
  Workspace,
  PropertyDefinition,
  Conversation,
  PersistedChatMessage,
  SidebarItemRef,
  SidebarItem,
  ActiveItem,
  SystemView
} from './types';
import {
  generateNoteId,
  generateWorkspaceId,
  generateNoteTypeId,
  generateConversationId,
  generateMessageId,
  nowISO
} from './utils';
import {
  createRepo,
  getRepo,
  findDocument,
  initializeVaults,
  saveVaults,
  setActiveVaultId as setActiveVaultIdStorage,
  createVault as createVaultInRepo,
  updateVault as updateVaultInRepo,
  connectVaultSync,
  disconnectVaultSync,
  getCurrentSyncedVaultId,
  isFileSyncAvailable,
  selectSyncDirectory
} from './repo';

// --- Private reactive state ---

let currentDoc = $state<NotesDocument>({
  notes: {},
  workspaces: {},
  activeWorkspaceId: '',
  noteTypes: {}
});

let docHandle: DocHandle<NotesDocument> | null = null;

// Vault state
let vaults = $state<Vault[]>([]);
let activeVaultId = $state<string | null>(null);

// UI state (persisted in Automerge document's lastViewState)
let activeItem = $state<ActiveItem>(null);
let activeSystemView = $state<SystemView>(null);

// Loading states
let isInitialized = $state(false);
let isLoading = $state(true);

// Default note type ID
const DEFAULT_NOTE_TYPE_ID = 'type-default';

// --- Initialization ---

/**
 * Initialize the state system
 * Creates repo, loads vaults, and subscribes to document changes
 * If no vaults exist, initializes in "no vault" state for first-time experience
 */
export async function initializeState(vaultId?: string): Promise<void> {
  isLoading = true;

  try {
    const repo = createRepo();

    // Initialize vaults
    const { vaults: loadedVaults, activeVault } = await initializeVaults(repo);
    vaults = loadedVaults;

    // If no active vault, we're in first-time experience mode
    if (!activeVault) {
      activeVaultId = null;
      isInitialized = true;
      return;
    }

    // Use provided vaultId or the active vault
    const targetVault = vaultId
      ? loadedVaults.find((v) => v.id === vaultId) || activeVault
      : activeVault;

    activeVaultId = targetVault.id;

    // Load the document
    const handle = await findDocument(repo, targetVault.docUrl);
    docHandle = handle;

    // Get initial state
    const doc = handle.doc();
    if (doc) {
      currentDoc = doc;
    }

    // Ensure default note type exists (migration for existing vaults)
    ensureDefaultNoteType();

    // Restore last view state if available
    restoreLastViewState();

    // Subscribe to future changes
    handle.on('change', ({ doc }) => {
      currentDoc = doc;
    });

    // Connect file sync if vault has baseDirectory
    if (targetVault.baseDirectory) {
      await connectVaultSync(repo, targetVault);
    }

    isInitialized = true;
  } finally {
    isLoading = false;
  }
}

/**
 * Ensure the default note type exists in the document
 */
function ensureDefaultNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[DEFAULT_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[DEFAULT_NOTE_TYPE_ID]) {
        d.noteTypes[DEFAULT_NOTE_TYPE_ID] = {
          id: DEFAULT_NOTE_TYPE_ID,
          name: 'Note',
          purpose: 'General purpose notes',
          icon: '📝',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Restore the last view state from the Automerge document
 * Validates that referenced items still exist and aren't archived
 */
function restoreLastViewState(): void {
  const doc = docHandle?.doc();
  if (!doc?.lastViewState) return;

  const { activeItem: lastActiveItem, systemView: lastSystemView } = doc.lastViewState;

  // Restore system view (always valid since it's just a string enum)
  activeSystemView = lastSystemView;

  // Restore active item only if it still exists and isn't archived
  if (lastActiveItem) {
    if (lastActiveItem.type === 'note') {
      const note = doc.notes[lastActiveItem.id];
      if (note && !note.archived) {
        activeItem = lastActiveItem;
      }
    } else if (lastActiveItem.type === 'conversation') {
      const conv = doc.conversations?.[lastActiveItem.id];
      if (conv && !conv.archived) {
        activeItem = lastActiveItem;
      }
    }
  }
}

// --- Vault getters (reactive) ---

export function getVaultsState(): Vault[] {
  return vaults;
}

export function getNonArchivedVaults(): Vault[] {
  return vaults.filter((v) => !v.archived);
}

export function getActiveVault(): Vault | undefined {
  return vaults.find((v) => v.id === activeVaultId);
}

export function getActiveVaultId(): string | null {
  return activeVaultId;
}

// --- Vault mutations ---

/**
 * Initialize vault state (called during app startup)
 */
export function initVaultState(vaultList: Vault[], activeId: string): void {
  vaults = vaultList;
  activeVaultId = activeId;
}

/**
 * Add a new vault to state
 */
export function addVaultToState(vault: Vault): void {
  vaults = [...vaults, vault];
}

/**
 * Update vault in state
 */
export function updateVaultInState(
  id: string,
  updates: Partial<Pick<Vault, 'name' | 'archived'>>
): void {
  vaults = vaults.map((v) => (v.id === id ? { ...v, ...updates } : v));
  saveVaults(vaults);
}

/**
 * Create a new vault
 */
export function createVault(name: string): Vault {
  const repo = getRepo();
  const vault = createVaultInRepo(repo, name);
  addVaultToState(vault);
  return vault;
}

/**
 * Switch to a different vault
 */
export async function switchVault(
  vaultId: string
): Promise<DocHandle<NotesDocument> | null> {
  const vault = vaults.find((v) => v.id === vaultId);
  if (!vault) return null;

  const repo = getRepo();

  // Update active vault
  activeVaultId = vaultId;
  setActiveVaultIdStorage(vaultId);

  // Load the new document
  const handle = await findDocument(repo, vault.docUrl);
  docHandle = handle;

  // Get initial state
  const doc = handle.doc();
  if (doc) {
    currentDoc = doc;
  }

  // Ensure default note type exists
  ensureDefaultNoteType();

  // Subscribe to changes
  handle.on('change', ({ doc }) => {
    currentDoc = doc;
  });

  // Reset view state before restoring from new vault
  activeItem = null;
  activeSystemView = null;

  // Restore last view state from the new vault
  restoreLastViewState();

  return handle;
}

// --- Note getters (reactive) ---

/**
 * Get all non-archived notes, sorted by updated time (newest first)
 */
export function getNotes(): Note[] {
  return (
    Object.values(currentDoc.notes)
      .filter((note) => !note.archived)
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
  );
}

/**
 * Get all notes including archived
 */
export function getAllNotes(): Note[] {
  return Object.values(currentDoc.notes);
}

/**
 * Search notes by title or content
 */
export function searchNotes(query: string): Note[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();
  return (
    Object.values(currentDoc.notes)
      .filter((note) => !note.archived)
      .filter(
        (note) =>
          note.title.toLowerCase().includes(lowerQuery) ||
          note.content.toLowerCase().includes(lowerQuery)
      )
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
  );
}

/**
 * Get notes by type
 */
export function getNotesByType(typeId: string): Note[] {
  return (
    Object.values(currentDoc.notes)
      .filter((note) => !note.archived && note.type === typeId)
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
  );
}

// --- Note mutations ---

/**
 * Create a new note
 * @returns The new note's ID
 */
export function createNote(params: {
  title?: string;
  content?: string;
  type?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteId();
  const now = nowISO();

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title || '',
      content: params.content || '',
      type: params.type || DEFAULT_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update an existing note
 */
export function updateNote(
  id: string,
  updates: Partial<Pick<Note, 'title' | 'content' | 'type'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[id];
    if (!note) return;

    if (updates.title !== undefined) note.title = updates.title;
    if (updates.content !== undefined) note.content = updates.content;
    if (updates.type !== undefined) note.type = updates.type;
    note.updated = nowISO();
  });
}

/**
 * Archive a note (soft delete)
 */
export function archiveNote(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[id];
    if (note) {
      note.archived = true;
      note.updated = nowISO();
    }

    // Remove from all workspaces when archived
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was archived (using setter for persistence)
  if (activeItem?.type === 'note' && activeItem.id === id) {
    setActiveItem(null);
  }
}

/**
 * Permanently delete a note
 */
export function deleteNote(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    delete doc.notes[id];

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was deleted (using setter for persistence)
  if (activeItem?.type === 'note' && activeItem.id === id) {
    setActiveItem(null);
  }
}

// --- Workspace getters (reactive) ---

/**
 * Get all workspaces in display order
 */
export function getWorkspaces(): Workspace[] {
  const workspaces = currentDoc.workspaces;
  const order = currentDoc.workspaceOrder;

  // If we have an order array, use it to sort workspaces
  if (order && order.length > 0) {
    const orderedWorkspaces: Workspace[] = [];
    for (const id of order) {
      if (workspaces[id]) {
        orderedWorkspaces.push(workspaces[id]);
      }
    }
    // Add any workspaces not in the order array (for backwards compatibility)
    for (const workspace of Object.values(workspaces)) {
      if (!order.includes(workspace.id)) {
        orderedWorkspaces.push(workspace);
      }
    }
    return orderedWorkspaces;
  }

  // Fallback: sort by created time for backwards compatibility
  return Object.values(workspaces).sort(
    (a, b) => Date.parse(a.created) - Date.parse(b.created)
  );
}

/**
 * Get the active workspace
 */
export function getActiveWorkspace(): Workspace | undefined {
  const workspaceId = currentDoc.activeWorkspaceId;
  return workspaceId ? currentDoc.workspaces[workspaceId] : undefined;
}

/**
 * Get pinned item refs from a workspace, handling migration from old field names
 */
function getWorkspacePinnedRefs(workspace: Workspace): SidebarItemRef[] {
  // New field name
  if (workspace.pinnedItemIds && Array.isArray(workspace.pinnedItemIds)) {
    return workspace.pinnedItemIds;
  }
  // Old field name (pinnedNoteIds was string[])
  const oldPinned = (workspace as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
  if (oldPinned && Array.isArray(oldPinned)) {
    return oldPinned.map((id) => ({ type: 'note' as const, id }));
  }
  return [];
}

/**
 * Get recent item refs from a workspace, handling migration from old field names
 */
function getWorkspaceRecentRefs(workspace: Workspace): SidebarItemRef[] {
  // New field name
  if (workspace.recentItemIds && Array.isArray(workspace.recentItemIds)) {
    return workspace.recentItemIds;
  }
  // Old field name (recentNoteIds was string[])
  const oldRecent = (workspace as unknown as { recentNoteIds?: string[] }).recentNoteIds;
  if (oldRecent && Array.isArray(oldRecent)) {
    return oldRecent.map((id) => ({ type: 'note' as const, id }));
  }
  return [];
}

/**
 * Ensure a workspace has the new array fields (pinnedItemIds, recentItemIds)
 * Migrates from old field names if necessary.
 * Call this inside Automerge change callbacks before accessing these arrays.
 */
function ensureWorkspaceArrays(ws: Workspace): void {
  // Migrate pinnedNoteIds -> pinnedItemIds if needed
  if (!ws.pinnedItemIds) {
    const oldPinned = (ws as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
    if (oldPinned && Array.isArray(oldPinned)) {
      ws.pinnedItemIds = oldPinned.map((id) => ({ type: 'note' as const, id }));
      // Clean up old field
      delete (ws as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
    } else {
      ws.pinnedItemIds = [];
    }
  }

  // Migrate recentNoteIds -> recentItemIds if needed
  if (!ws.recentItemIds) {
    const oldRecent = (ws as unknown as { recentNoteIds?: string[] }).recentNoteIds;
    if (oldRecent && Array.isArray(oldRecent)) {
      ws.recentItemIds = oldRecent.map((id) => ({ type: 'note' as const, id }));
      // Clean up old field
      delete (ws as unknown as { recentNoteIds?: string[] }).recentNoteIds;
    } else {
      ws.recentItemIds = [];
    }
  }
}

/**
 * Convert a SidebarItemRef to a SidebarItem, or return null if not found/archived
 */
function refToSidebarItem(
  ref: SidebarItemRef,
  noteTypes: Record<string, NoteType>
): SidebarItem | null {
  if (ref.type === 'note') {
    const note = currentDoc.notes[ref.id];
    if (!note || note.archived) return null;
    const noteType = noteTypes[note.type];
    const displayText = note.title || note.content.trim().slice(0, 50) || 'Untitled';
    const isPreview = !note.title;
    return {
      id: note.id,
      type: 'note',
      title: displayText + (isPreview && note.content.length > 50 ? '...' : ''),
      icon: noteType?.icon || '📝',
      updated: note.updated,
      metadata: {
        noteTypeId: note.type,
        isPreview
      }
    };
  } else if (ref.type === 'conversation') {
    const conv = currentDoc.conversations?.[ref.id];
    if (!conv || conv.archived) return null;
    return {
      id: conv.id,
      type: 'conversation',
      title: conv.title,
      icon: '💬',
      updated: conv.updated,
      metadata: {
        messageCount: conv.messages.length
      }
    };
  }
  return null;
}

/**
 * Get recent items in the active workspace as SidebarItems
 */
export function getRecentItems(): SidebarItem[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const noteTypes = currentDoc.noteTypes ?? {};
  const refs = getWorkspaceRecentRefs(workspace);

  return refs
    .map((ref) => refToSidebarItem(ref, noteTypes))
    .filter((item): item is SidebarItem => item !== null);
}

/**
 * Check if an item is in the recent items of the active workspace
 */
export function isItemRecent(ref: SidebarItemRef): boolean {
  const workspace = getActiveWorkspace();
  if (!workspace) return false;
  const refs = getWorkspaceRecentRefs(workspace);
  return refs.some((r) => r.type === ref.type && r.id === ref.id);
}

// --- Workspace mutations ---

/**
 * Create a new workspace
 * @returns The new workspace's ID
 */
export function createWorkspace(params: { name: string; icon: string }): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateWorkspaceId();

  docHandle.change((doc) => {
    doc.workspaces[id] = {
      id,
      name: params.name,
      icon: params.icon,
      pinnedItemIds: [],
      recentItemIds: [],
      created: nowISO()
    };

    // Add to workspace order
    if (!doc.workspaceOrder) {
      doc.workspaceOrder = [];
    }
    doc.workspaceOrder.push(id);
  });

  return id;
}

/**
 * Update a workspace
 */
export function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, 'name' | 'icon'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const workspace = doc.workspaces[id];
    if (!workspace) return;

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.icon !== undefined) workspace.icon = updates.icon;
  });
}

/**
 * Delete a workspace
 * Cannot delete the last workspace
 */
export function deleteWorkspace(id: string): boolean {
  if (!docHandle) throw new Error('Not initialized');

  const workspaces = Object.keys(currentDoc.workspaces);
  if (workspaces.length <= 1) {
    return false; // Cannot delete last workspace
  }

  docHandle.change((doc) => {
    delete doc.workspaces[id];

    // Remove from workspace order
    if (doc.workspaceOrder) {
      const index = doc.workspaceOrder.indexOf(id);
      if (index !== -1) {
        doc.workspaceOrder.splice(index, 1);
      }
    }

    // If we deleted the active workspace, switch to another
    if (doc.activeWorkspaceId === id) {
      const remaining = Object.keys(doc.workspaces);
      doc.activeWorkspaceId = remaining[0] || '';
    }
  });

  return true;
}

/**
 * Set the active workspace
 */
export function setActiveWorkspace(workspaceId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (doc.workspaces[workspaceId]) {
      doc.activeWorkspaceId = workspaceId;
    }
  });
}

/**
 * Add an item to the active workspace's recent items
 * Does not add if the item is already pinned or already in recent items
 */
export function addItemToWorkspace(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Don't add if already pinned
    if (ws.pinnedItemIds.some((r) => r.type === ref.type && r.id === ref.id)) return;

    // Don't add duplicates to recent
    if (ws.recentItemIds.some((r) => r.type === ref.type && r.id === ref.id)) return;

    ws.recentItemIds.unshift(ref);
  });
}

/**
 * Remove an item from the active workspace's recent items
 * @returns The next item to select, or null if none
 */
export function removeItemFromWorkspace(ref: SidebarItemRef): SidebarItemRef | null {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return null;

  const recentRefs = getWorkspaceRecentRefs(workspace);
  const index = recentRefs.findIndex((r) => r.type === ref.type && r.id === ref.id);
  if (index === -1) return null;

  // Determine next item to select
  let nextItem: SidebarItemRef | null = null;
  if (recentRefs.length > 1) {
    if (index < recentRefs.length - 1) {
      nextItem = recentRefs[index + 1];
    } else {
      nextItem = recentRefs[index - 1];
    }
  }

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws) {
      ensureWorkspaceArrays(ws);
      const idx = ws.recentItemIds.findIndex(
        (r) => r.type === ref.type && r.id === ref.id
      );
      if (idx !== -1) {
        ws.recentItemIds.splice(idx, 1);
      }
    }
  });

  // Clear active item if it was removed (using setter for persistence)
  if (activeItem?.type === ref.type && activeItem.id === ref.id) {
    if (nextItem) {
      setActiveItem(nextItem);
    } else {
      setActiveItem(null);
    }
  }

  return nextItem;
}

/**
 * Reorder recent items in the active workspace
 */
export function reorderRecentItems(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const [removed] = ws.recentItemIds.splice(fromIndex, 1);
    // Create a new plain object to avoid Automerge "existing document object" error
    ws.recentItemIds.splice(toIndex, 0, { type: removed.type, id: removed.id });
  });
}

/**
 * Reorder workspaces in the sidebar
 */
export function reorderWorkspaces(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    // Initialize workspaceOrder if it doesn't exist
    if (!doc.workspaceOrder) {
      // Build order from existing workspaces sorted by created time
      const workspaceValues = Object.values(doc.workspaces) as Workspace[];
      doc.workspaceOrder = workspaceValues
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
        .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
        .map((w) => w.id);
    }

    if (fromIndex < 0 || fromIndex >= doc.workspaceOrder.length) return;
    if (toIndex < 0 || toIndex >= doc.workspaceOrder.length) return;

    const [removed] = doc.workspaceOrder.splice(fromIndex, 1);
    doc.workspaceOrder.splice(toIndex, 0, removed);
  });
}

// --- Pinned items ---

/**
 * Get pinned items in the active workspace as SidebarItems
 */
export function getPinnedItems(): SidebarItem[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const noteTypes = currentDoc.noteTypes ?? {};
  const refs = getWorkspacePinnedRefs(workspace);

  return refs
    .map((ref) => refToSidebarItem(ref, noteTypes))
    .filter((item): item is SidebarItem => item !== null);
}

/**
 * Pin an item to the active workspace
 */
export function pinItem(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Don't pin if already pinned
  const pinnedRefs = getWorkspacePinnedRefs(workspace);
  if (pinnedRefs.some((r) => r.type === ref.type && r.id === ref.id)) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Add to pinned if not already there
    if (!ws.pinnedItemIds.some((r) => r.type === ref.type && r.id === ref.id)) {
      ws.pinnedItemIds.push(ref);
    }

    // Remove from recent items (pinned items replace recent items)
    const recentIndex = ws.recentItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (recentIndex !== -1) {
      ws.recentItemIds.splice(recentIndex, 1);
    }
  });
}

/**
 * Unpin an item from the active workspace
 */
export function unpinItem(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const index = ws.pinnedItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (index !== -1) {
      ws.pinnedItemIds.splice(index, 1);

      // Add to recent items when unpinned (at the start)
      if (!ws.recentItemIds.some((r) => r.type === ref.type && r.id === ref.id)) {
        ws.recentItemIds.unshift(ref);
      }
    }
  });
}

/**
 * Check if an item is pinned in the active workspace
 */
export function isItemPinned(ref: SidebarItemRef): boolean {
  const workspace = getActiveWorkspace();
  if (!workspace) return false;
  const pinnedRefs = getWorkspacePinnedRefs(workspace);
  return pinnedRefs.some((r) => r.type === ref.type && r.id === ref.id);
}

/**
 * Reorder pinned items in the active workspace
 */
export function reorderPinnedItems(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const [removed] = ws.pinnedItemIds.splice(fromIndex, 1);
    // Create a new plain object to avoid Automerge "existing document object" error
    ws.pinnedItemIds.splice(toIndex, 0, { type: removed.type, id: removed.id });
  });
}

// --- NoteType getters (reactive) ---

/**
 * Get all non-archived note types
 */
export function getNoteTypes(): NoteType[] {
  return Object.values(currentDoc.noteTypes ?? {})
    .filter((type) => !type.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all note types including archived
 */
export function getAllNoteTypes(): NoteType[] {
  return Object.values(currentDoc.noteTypes ?? {});
}

/**
 * Get a single note type by ID
 */
export function getNoteType(id: string): NoteType | undefined {
  return currentDoc.noteTypes?.[id];
}

// --- NoteType mutations ---

/**
 * Create a new note type
 * @returns The new type's ID
 */
export function createNoteType(params: {
  name: string;
  purpose?: string;
  icon?: string;
  properties?: PropertyDefinition[];
  editorChips?: string[];
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteTypeId();

  docHandle.change((doc) => {
    if (!doc.noteTypes) {
      doc.noteTypes = {};
    }
    const noteType: NoteType = {
      id,
      name: params.name,
      purpose: params.purpose || '',
      icon: params.icon || '📄',
      archived: false,
      created: nowISO()
    };
    // Only add optional fields if they're defined (Automerge doesn't allow undefined)
    if (params.properties !== undefined) {
      noteType.properties = params.properties;
    }
    if (params.editorChips !== undefined) {
      noteType.editorChips = params.editorChips;
    }
    doc.noteTypes[id] = noteType;
  });

  return id;
}

/**
 * Update a note type
 */
export function updateNoteType(
  id: string,
  updates: Partial<
    Pick<NoteType, 'name' | 'purpose' | 'icon' | 'properties' | 'editorChips'>
  >
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (!noteType) return;

    if (updates.name !== undefined) noteType.name = updates.name;
    if (updates.purpose !== undefined) noteType.purpose = updates.purpose;
    if (updates.icon !== undefined) noteType.icon = updates.icon;
    if (updates.properties !== undefined) noteType.properties = updates.properties;
    if (updates.editorChips !== undefined) noteType.editorChips = updates.editorChips;
  });
}

/**
 * Archive a note type (soft delete)
 * Notes keep their type assignment but type won't appear in lists
 */
export function archiveNoteType(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (noteType) {
      noteType.archived = true;
    }
  });
}

/**
 * Set a note's type
 */
export function setNoteType(noteId: string, typeId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (note) {
      note.type = typeId;
      note.updated = nowISO();
    }
  });
}

// --- Note Properties ---

/**
 * Get a note's property values
 */
export function getNoteProps(noteId: string): Record<string, unknown> {
  const note = currentDoc.notes[noteId];
  return note?.props ?? {};
}

/**
 * Get a single note by ID
 */
export function getNote(noteId: string): Note | undefined {
  return currentDoc.notes[noteId];
}

/**
 * Set a single property on a note
 */
export function setNoteProp(noteId: string, propName: string, value: unknown): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }
    note.props[propName] = value;
    note.updated = nowISO();
  });
}

/**
 * Set multiple properties on a note
 */
export function setNoteProps(noteId: string, props: Record<string, unknown>): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }
    for (const [key, value] of Object.entries(props)) {
      note.props[key] = value;
    }
    note.updated = nowISO();
  });
}

/**
 * Delete a property from a note
 */
export function deleteNoteProp(noteId: string, propName: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note || !note.props) return;

    delete note.props[propName];
    note.updated = nowISO();
  });
}

/**
 * Get property definitions for a note type
 */
export function getNoteTypeProperties(typeId: string): PropertyDefinition[] {
  const noteType = currentDoc.noteTypes?.[typeId];
  return noteType?.properties ?? [];
}

/**
 * Get editor chips configuration for a note type
 * Returns configured chips or defaults to system fields (handles empty array)
 */
export function getNoteTypeEditorChips(typeId: string): string[] {
  const noteType = currentDoc.noteTypes?.[typeId];
  return noteType?.editorChips?.length ? noteType.editorChips : ['created', 'updated'];
}

// --- Active item and system view (persisted in Automerge document) ---

/**
 * Persist the current view state to the Automerge document
 */
function persistViewState(): void {
  if (!docHandle) return;

  docHandle.change((doc) => {
    doc.lastViewState = {
      activeItem: activeItem ? { type: activeItem.type, id: activeItem.id } : null,
      systemView: activeSystemView
    };
  });
}

/**
 * Get the currently active item
 */
export function getActiveItem(): ActiveItem {
  return activeItem;
}

/**
 * Set the active item (also persists to document)
 */
export function setActiveItem(item: ActiveItem): void {
  activeItem = item;
  persistViewState();
}

/**
 * Get the currently active system view
 */
export function getActiveSystemView(): SystemView {
  return activeSystemView;
}

/**
 * Set the active system view (also persists to document)
 */
export function setActiveSystemView(view: SystemView): void {
  activeSystemView = view;
  persistViewState();
}

/**
 * Get the currently active note (convenience getter)
 */
export function getActiveNote(): Note | undefined {
  if (!activeItem || activeItem.type !== 'note') return undefined;
  return currentDoc.notes[activeItem.id];
}

/**
 * Get the currently active conversation (convenience getter)
 */
export function getActiveConversation(): Conversation | undefined {
  if (!activeItem || activeItem.type !== 'conversation') return undefined;
  return currentDoc.conversations?.[activeItem.id];
}

// --- Convenience wrappers for backward compatibility ---

/**
 * Get the active note ID (convenience wrapper)
 */
export function getActiveNoteId(): string | null {
  return activeItem?.type === 'note' ? activeItem.id : null;
}

/**
 * Set the active note by ID (convenience wrapper)
 */
export function setActiveNoteId(noteId: string | null): void {
  if (noteId === null) {
    setActiveItem(null);
  } else {
    setActiveItem({ type: 'note', id: noteId });
  }
}

/**
 * Get the active conversation ID (convenience wrapper)
 */
export function getActiveConversationId(): string | null {
  return activeItem?.type === 'conversation' ? activeItem.id : null;
}

/**
 * Set the active conversation by ID (convenience wrapper)
 */
export function setActiveConversationId(conversationId: string | null): void {
  if (conversationId === null) {
    setActiveItem(null);
  } else {
    setActiveItem({ type: 'conversation', id: conversationId });
  }
}

/**
 * Add a note to the current workspace (convenience wrapper)
 */
export function addNoteToWorkspace(noteId: string): void {
  addItemToWorkspace({ type: 'note', id: noteId });
}

/**
 * Navigate to a note or conversation by ID, or create a new note if shouldCreate is true.
 * This is the centralized handler for wikilink clicks.
 *
 * @param targetId - The ID to navigate to (or the title if creating)
 * @param title - The display title (used when creating a new note)
 * @param options - Options for navigation (shouldCreate, targetType)
 * @returns The ID that was navigated to (either existing or newly created)
 */
export function navigateToNote(
  targetId: string,
  title: string,
  options?: {
    shouldCreate?: boolean;
    targetType?: 'note' | 'conversation';
  }
): string {
  const targetType = options?.targetType || 'note';
  const shouldCreate = options?.shouldCreate || false;

  if (targetType === 'conversation') {
    // Navigate to conversation (never create via wikilink)
    setActiveItem({ type: 'conversation', id: targetId });
    addItemToWorkspace({ type: 'conversation', id: targetId });
    return targetId;
  } else {
    // Note handling
    if (shouldCreate) {
      // Create a new note with the given title
      const newId = createNote({ title });
      addItemToWorkspace({ type: 'note', id: newId });
      setActiveItem({ type: 'note', id: newId });
      return newId;
    } else {
      // Navigate to existing note
      setActiveItem({ type: 'note', id: targetId });
      return targetId;
    }
  }
}

// --- Backlinks ---

const LINK_PATTERN = /\[\[(n-[a-f0-9]{8})(?:\|[^\]]+)?\]\]/g;
const CONTEXT_LINES = 1;

export interface ContextLine {
  text: string;
  isLinkLine: boolean;
}

export interface ContextBlock {
  lines: ContextLine[];
}

/**
 * Get backlinks to a note (other notes that link to it)
 */
export function getBacklinks(
  noteId: string
): Array<{ note: Note; contexts: ContextBlock[] }> {
  const backlinks: Array<{ note: Note; contexts: ContextBlock[] }> = [];

  for (const note of Object.values(currentDoc.notes)) {
    if (note.archived || note.id === noteId) continue;

    const contexts: ContextBlock[] = [];
    const lines = note.content.split('\n');
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Set used only for local computation, not reactive state
    const matchedLineIndices = new Set<number>();

    // Find all lines containing links to this note
    for (let i = 0; i < lines.length; i++) {
      LINK_PATTERN.lastIndex = 0;
      let match;
      while ((match = LINK_PATTERN.exec(lines[i])) !== null) {
        if (match[1] === noteId) {
          matchedLineIndices.add(i);
          break;
        }
      }
    }

    // Build context blocks for each match
    for (const lineIndex of matchedLineIndices) {
      const contextLines: ContextLine[] = [];
      const start = Math.max(0, lineIndex - CONTEXT_LINES);
      const end = Math.min(lines.length - 1, lineIndex + CONTEXT_LINES);

      for (let i = start; i <= end; i++) {
        const text = lines[i].trim();
        if (text) {
          contextLines.push({ text, isLinkLine: i === lineIndex });
        }
      }

      if (contextLines.length > 0) {
        contexts.push({ lines: contextLines });
      }
    }

    if (contexts.length > 0) {
      backlinks.push({ note, contexts });
    }
  }

  return backlinks.sort((a, b) => b.contexts.length - a.contexts.length);
}

// --- Loading state getters ---

export function getIsInitialized(): boolean {
  return isInitialized;
}

export function getIsLoading(): boolean {
  return isLoading;
}

// --- Daily View Support ---

/** Daily note type ID constant */
export const DAILY_NOTE_TYPE_ID = 'type-daily';

/**
 * Interface for daily view day data
 */
export interface DayData {
  date: string; // ISO date string (YYYY-MM-DD)
  dailyNote: Note | null;
  createdNotes: Note[];
  modifiedNotes: Note[];
  totalActivity: number;
}

/**
 * Interface for daily view week data
 */
export interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

/**
 * Ensure the daily note type exists in the document
 */
export function ensureDailyNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[DAILY_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[DAILY_NOTE_TYPE_ID]) {
        d.noteTypes[DAILY_NOTE_TYPE_ID] = {
          id: DAILY_NOTE_TYPE_ID,
          name: 'Daily',
          purpose: 'Daily notes for tracking progress and capturing thoughts',
          icon: '📅',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Generate a daily note ID for a specific date
 * Format: "daily-YYYY-MM-DD"
 */
export function getDailyNoteId(date: string): string {
  return `daily-${date}`;
}

/**
 * Get daily note for a specific date
 */
export function getDailyNote(date: string): Note | undefined {
  const dailyNoteId = getDailyNoteId(date);
  return currentDoc.notes[dailyNoteId];
}

/**
 * Get or create a daily note for a specific date
 * @returns The daily note
 */
export function getOrCreateDailyNote(date: string): Note {
  if (!docHandle) throw new Error('Not initialized');

  // Ensure daily note type exists
  ensureDailyNoteType();

  const dailyNoteId = getDailyNoteId(date);
  const existing = currentDoc.notes[dailyNoteId];

  if (existing) {
    return existing;
  }

  // Create new daily note with predictable ID
  const now = nowISO();
  docHandle.change((doc) => {
    doc.notes[dailyNoteId] = {
      id: dailyNoteId,
      title: date, // Title is the date itself
      content: '',
      type: DAILY_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false
    };
  });

  return currentDoc.notes[dailyNoteId];
}

/**
 * Update daily note content
 */
export function updateDailyNote(date: string, content: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const dailyNoteId = getDailyNoteId(date);
  const existing = currentDoc.notes[dailyNoteId];

  // If content is empty and note doesn't exist, don't create it
  if (!content.trim() && !existing) {
    return;
  }

  // Create or update
  if (existing) {
    docHandle.change((doc) => {
      const note = doc.notes[dailyNoteId];
      if (note) {
        note.content = content;
        note.updated = nowISO();
      }
    });
  } else {
    // Create the note with content
    getOrCreateDailyNote(date);
    docHandle.change((doc) => {
      const note = doc.notes[dailyNoteId];
      if (note) {
        note.content = content;
        note.updated = nowISO();
      }
    });
  }
}

/**
 * Get week data for a specific start date
 */
export function getWeekData(startDate: string): WeekData {
  // Generate 7 days from start date
  const days: DayData[] = [];

  for (let i = 0; i < 7; i++) {
    const dateString = addDaysToDateString(startDate, i);

    // Get daily note for this date
    const dailyNote = getDailyNote(dateString) || null;

    // Get notes created on this date (excluding daily notes)
    const createdNotes = Object.values(currentDoc.notes).filter((note) => {
      if (note.archived) return false;
      if (note.type === DAILY_NOTE_TYPE_ID) return false;
      const createdDate = note.created.split('T')[0];
      return createdDate === dateString;
    });

    // Get notes modified on this date (excluding daily notes and notes created today)
    const modifiedNotes = Object.values(currentDoc.notes).filter((note) => {
      if (note.archived) return false;
      if (note.type === DAILY_NOTE_TYPE_ID) return false;
      const createdDate = note.created.split('T')[0];
      const updatedDate = note.updated.split('T')[0];
      // Only include if modified today but not created today
      return updatedDate === dateString && createdDate !== dateString;
    });

    days.push({
      date: dateString,
      dailyNote,
      createdNotes,
      modifiedNotes,
      totalActivity: createdNotes.length + modifiedNotes.length + (dailyNote ? 1 : 0)
    });
  }

  // Calculate end date (6 days after start)
  const endDate = addDaysToDateString(startDate, 6);

  return {
    startDate,
    endDate,
    days
  };
}

/**
 * Add days to a date string and return a new date string
 * Uses UTC timestamp math to avoid Date object reactivity issues in .svelte.ts files
 */
function addDaysToDateString(dateString: string, daysToAdd: number): string {
  // Parse the date string (YYYY-MM-DD)
  const [year, month, day] = dateString.split('-').map(Number);

  // Create timestamp and add days (using UTC to avoid timezone issues)
  const timestamp = Date.UTC(year, month - 1, day) + daysToAdd * 24 * 60 * 60 * 1000;

  // Extract date components from timestamp using UTC methods
  // We need to convert timestamp to date parts without using mutable Date
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEpoch = Math.floor(timestamp / msPerDay);

  // Algorithm to convert days since epoch to year/month/day
  // Based on Howard Hinnant's algorithm
  const z = daysSinceEpoch + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) /
      365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const resultYear = y + (m <= 2 ? 1 : 0);

  return `${resultYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Note: State variables cannot be exported directly because they are reassigned.
// Use the getter functions instead: getIsInitialized(), getIsLoading(), etc.

// --- Conversation getters (reactive) ---

/**
 * Get all non-archived conversations for the active workspace, sorted by updated (newest first)
 */
export function getConversations(): Conversation[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const conversations = currentDoc.conversations ?? {};
  return (
    Object.values(conversations)
      .filter((conv) => !conv.archived && conv.workspaceId === workspace.id)
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
  );
}

/**
 * Get a conversation by ID
 */
export function getConversation(id: string): Conversation | undefined {
  return currentDoc.conversations?.[id];
}

// --- Conversation mutations ---

/**
 * Create a new conversation
 * @returns The new conversation's ID
 */
export function createConversation(params?: { title?: string }): string {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) throw new Error('No active workspace');

  const id = generateConversationId();
  const now = nowISO();

  docHandle.change((doc) => {
    // Ensure conversations record exists
    if (!doc.conversations) {
      doc.conversations = {};
    }

    doc.conversations[id] = {
      id,
      title: params?.title || 'New Conversation',
      workspaceId: workspace.id,
      messages: [],
      created: now,
      updated: now,
      archived: false
    };

    // Add to workspace's recent items
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws) {
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'conversation', id });
    }
  });

  return id;
}

/**
 * Add a message to a conversation
 * @returns The new message's ID
 */
export function addMessageToConversation(
  conversationId: string,
  message: Omit<PersistedChatMessage, 'id' | 'createdAt'>
): string {
  if (!docHandle) throw new Error('Not initialized');

  const messageId = generateMessageId();
  const now = nowISO();

  docHandle.change((doc) => {
    const conv = doc.conversations?.[conversationId];
    if (!conv) return;

    conv.messages.push({
      ...message,
      id: messageId,
      createdAt: now
    });
    conv.updated = now;

    // Auto-generate title from first user message
    if (conv.title === 'New Conversation' && message.role === 'user') {
      const preview = message.content.slice(0, 50).trim();
      conv.title = preview + (message.content.length > 50 ? '...' : '');
    }
  });

  return messageId;
}

/**
 * Update a message in a conversation (for streaming updates)
 */
export function updateConversationMessage(
  conversationId: string,
  messageId: string,
  updates: Partial<Pick<PersistedChatMessage, 'content' | 'toolCalls'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const conv = doc.conversations?.[conversationId];
    if (!conv) return;

    const message = conv.messages.find((m) => m.id === messageId);
    if (!message) return;

    if (updates.content !== undefined) message.content = updates.content;
    if (updates.toolCalls !== undefined) message.toolCalls = updates.toolCalls;
    conv.updated = nowISO();
  });
}

/**
 * Update conversation metadata
 */
export function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'title'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const conv = doc.conversations?.[id];
    if (!conv) return;

    if (updates.title !== undefined) conv.title = updates.title;
    conv.updated = nowISO();
  });
}

/**
 * Archive a conversation (soft delete)
 */
export function archiveConversation(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const conv = doc.conversations?.[id];
    if (conv) {
      conv.archived = true;
      conv.updated = nowISO();
    }

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was archived (using setter for persistence)
  if (activeItem?.type === 'conversation' && activeItem.id === id) {
    setActiveItem(null);
  }
}

/**
 * Delete a conversation permanently
 */
export function deleteConversation(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (doc.conversations) {
      delete doc.conversations[id];
    }

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was deleted (using setter for persistence)
  if (activeItem?.type === 'conversation' && activeItem.id === id) {
    setActiveItem(null);
  }
}

/**
 * Bump an item to front of workspace's recent list
 */
export function bumpItemToRecent(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Remove if already present
    const existingIndex = ws.recentItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (existingIndex !== -1) {
      ws.recentItemIds.splice(existingIndex, 1);
    }

    // Add to front
    ws.recentItemIds.unshift(ref);
  });
}

// --- File Sync Functions ---

/**
 * Check if file sync is available (running in Electron with API)
 */
export function getIsFileSyncAvailable(): boolean {
  return isFileSyncAvailable();
}

/**
 * Check if the active vault has file sync enabled
 */
export function getIsFileSyncEnabled(): boolean {
  const vault = getActiveVault();
  return vault?.baseDirectory !== undefined;
}

/**
 * Get the sync directory path for the active vault
 */
export function getSyncDirectory(): string | undefined {
  const vault = getActiveVault();
  return vault?.baseDirectory;
}

/**
 * Check if the active vault is currently syncing
 */
export function getIsSyncing(): boolean {
  const vault = getActiveVault();
  if (!vault) return false;
  return getCurrentSyncedVaultId() === vault.id;
}

/**
 * Enable file sync for the active vault by selecting a directory
 * @returns The selected directory path, or null if cancelled
 */
export async function enableFileSync(): Promise<string | null> {
  const vault = getActiveVault();
  if (!vault) return null;

  const directory = await selectSyncDirectory();
  if (!directory) return null;

  // Update vault with new baseDirectory
  updateVaultInRepo(vault.id, { baseDirectory: directory });

  // Refresh vaults state
  const updatedVault = { ...vault, baseDirectory: directory };

  // Update local state
  const index = vaults.findIndex((v) => v.id === vault.id);
  if (index !== -1) {
    vaults[index] = updatedVault;
    // Trigger reactivity
    vaults = [...vaults];
  }

  // Connect sync
  const repo = getRepo();
  await connectVaultSync(repo, updatedVault);

  return directory;
}

/**
 * Disable file sync for the active vault
 */
export async function disableFileSync(): Promise<void> {
  const vault = getActiveVault();
  if (!vault) return;

  // Disconnect sync first
  await disconnectVaultSync();

  // Update vault to remove baseDirectory
  updateVaultInRepo(vault.id, { baseDirectory: undefined });

  // Refresh vaults state
  const updatedVault = { ...vault, baseDirectory: undefined };

  // Update local state
  const index = vaults.findIndex((v) => v.id === vault.id);
  if (index !== -1) {
    vaults[index] = updatedVault;
    // Trigger reactivity
    vaults = [...vaults];
  }
}

// --- Shelf Items (persisted in Automerge) ---

import type { ShelfItemData } from './types';

/**
 * Get all shelf items
 */
export function getShelfItems(): ShelfItemData[] {
  return currentDoc.shelfItems ?? [];
}

/**
 * Check if an item is on the shelf
 */
export function isItemOnShelf(type: 'note' | 'conversation', id: string): boolean {
  const items = currentDoc.shelfItems ?? [];
  return items.some((item) => item.type === type && item.id === id);
}

/**
 * Add an item to the shelf
 */
export function addShelfItem(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  // Don't add if already on shelf
  if (isItemOnShelf(type, id)) return;

  docHandle.change((doc) => {
    if (!doc.shelfItems) {
      doc.shelfItems = [];
    }
    doc.shelfItems.push({ type, id, isExpanded: false });
  });
}

/**
 * Remove an item from the shelf
 */
export function removeShelfItem(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const index = doc.shelfItems.findIndex(
      (item) => item.type === type && item.id === id
    );
    if (index !== -1) {
      doc.shelfItems.splice(index, 1);
    }
  });
}

/**
 * Toggle the expanded state of a shelf item
 */
export function toggleShelfItemExpanded(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const item = doc.shelfItems.find((i) => i.type === type && i.id === id);
    if (item) {
      item.isExpanded = !item.isExpanded;
    }
  });
}

/**
 * Set the expanded state of a shelf item
 */
export function setShelfItemExpanded(
  type: 'note' | 'conversation',
  id: string,
  expanded: boolean
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const item = doc.shelfItems.find((i) => i.type === type && i.id === id);
    if (item && item.isExpanded !== expanded) {
      item.isExpanded = expanded;
    }
  });
}

/**
 * Clear all items from the shelf
 */
export function clearShelfItems(): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    doc.shelfItems = [];
  });
}

// --- EPUB Support ---

import type { EpubNoteProps } from './types';

/** EPUB note type ID constant */
export const EPUB_NOTE_TYPE_ID = 'type-epub';

/**
 * Ensure the EPUB note type exists in the document
 */
export function ensureEpubNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[EPUB_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[EPUB_NOTE_TYPE_ID]) {
        d.noteTypes[EPUB_NOTE_TYPE_ID] = {
          id: EPUB_NOTE_TYPE_ID,
          name: 'Book',
          purpose: 'EPUB books with reading progress and highlights',
          icon: '📖',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Get all non-archived EPUB notes, sorted by last read (most recent first)
 */
export function getEpubNotes(): Note[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && note.type === EPUB_NOTE_TYPE_ID)
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as EpubNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as EpubNoteProps | undefined)?.lastRead || b.updated;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create an EPUB note
 * @returns The new note's ID
 */
export function createEpubNote(params: {
  title: string;
  epubHash: string;
  epubTitle?: string;
  epubAuthor?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  // Ensure EPUB note type exists
  ensureEpubNoteType();

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    epubHash: params.epubHash,
    progress: 0,
    textSize: 100
  };
  if (params.epubTitle !== undefined) {
    props.epubTitle = params.epubTitle;
  }
  if (params.epubAuthor !== undefined) {
    props.epubAuthor = params.epubAuthor;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: EPUB_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update EPUB reading state (CFI position, progress, last read time)
 * Use this for debounced reading position updates
 */
export function updateEpubReadingState(
  noteId: string,
  updates: {
    currentCfi?: string;
    progress?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as EpubNoteProps;
    if (updates.currentCfi !== undefined) props.currentCfi = updates.currentCfi;
    if (updates.progress !== undefined) props.progress = updates.progress;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Update EPUB text size preference
 */
export function updateEpubTextSize(noteId: string, textSize: number): void {
  if (!docHandle) throw new Error('Not initialized');

  // Clamp text size to valid range
  const clampedSize = Math.max(75, Math.min(200, textSize));

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    (note.props as EpubNoteProps).textSize = clampedSize;
    note.updated = nowISO();
  });
}

/**
 * Get EPUB props from a note
 */
export function getEpubProps(noteId: string): EpubNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || note.type !== EPUB_NOTE_TYPE_ID) return undefined;
  return note.props as EpubNoteProps | undefined;
}

// --- PDF Support ---

import type { PdfNoteProps } from './types';

/** PDF note type ID constant */
export const PDF_NOTE_TYPE_ID = 'type-pdf';

/**
 * Ensure the PDF note type exists in the document
 */
export function ensurePdfNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[PDF_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[PDF_NOTE_TYPE_ID]) {
        d.noteTypes[PDF_NOTE_TYPE_ID] = {
          id: PDF_NOTE_TYPE_ID,
          name: 'PDF Document',
          purpose: 'PDF documents with reading progress and highlights',
          icon: '📄',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Get all non-archived PDF notes, sorted by last read (most recent first)
 */
export function getPdfNotes(): Note[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && note.type === PDF_NOTE_TYPE_ID)
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as PdfNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as PdfNoteProps | undefined)?.lastRead || b.updated;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create a PDF note
 * @returns The new note's ID
 */
export function createPdfNote(params: {
  title: string;
  pdfHash: string;
  totalPages: number;
  pdfTitle?: string;
  pdfAuthor?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  // Ensure PDF note type exists
  ensurePdfNoteType();

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    pdfHash: params.pdfHash,
    totalPages: params.totalPages,
    currentPage: 1,
    zoomLevel: 100
  };
  if (params.pdfTitle !== undefined) {
    props.pdfTitle = params.pdfTitle;
  }
  if (params.pdfAuthor !== undefined) {
    props.pdfAuthor = params.pdfAuthor;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: PDF_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update PDF reading state (current page, zoom level, last read time)
 * Use this for debounced reading position updates
 */
export function updatePdfReadingState(
  noteId: string,
  updates: {
    currentPage?: number;
    zoomLevel?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as PdfNoteProps;
    if (updates.currentPage !== undefined) props.currentPage = updates.currentPage;
    if (updates.zoomLevel !== undefined) props.zoomLevel = updates.zoomLevel;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Update PDF zoom level preference
 */
export function updatePdfZoomLevel(noteId: string, zoomLevel: number): void {
  if (!docHandle) throw new Error('Not initialized');

  // Clamp zoom level to valid range
  const clampedZoom = Math.max(50, Math.min(200, zoomLevel));

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    (note.props as PdfNoteProps).zoomLevel = clampedZoom;
    note.updated = nowISO();
  });
}

/**
 * Get PDF props from a note
 */
export function getPdfProps(noteId: string): PdfNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || note.type !== PDF_NOTE_TYPE_ID) return undefined;
  return note.props as PdfNoteProps | undefined;
}

// --- Webpage Archive Support ---

import type { WebpageNoteProps } from './types';

/** Webpage note type ID constant */
export const WEBPAGE_NOTE_TYPE_ID = 'type-webpage';

/**
 * Ensure the Webpage note type exists in the document
 */
export function ensureWebpageNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[WEBPAGE_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[WEBPAGE_NOTE_TYPE_ID]) {
        d.noteTypes[WEBPAGE_NOTE_TYPE_ID] = {
          id: WEBPAGE_NOTE_TYPE_ID,
          name: 'Web Article',
          purpose: 'Archived web articles with reading progress and highlights',
          icon: '🌐',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Get all non-archived webpage notes, sorted by last read (most recent first)
 */
export function getWebpageNotes(): Note[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && note.type === WEBPAGE_NOTE_TYPE_ID)
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as WebpageNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as WebpageNoteProps | undefined)?.lastRead || b.updated;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create a Webpage note
 * @returns The new note's ID
 */
export function createWebpageNote(params: {
  title: string;
  webpageHash: string;
  webpageUrl: string;
  webpageTitle?: string;
  webpageAuthor?: string;
  webpageSiteName?: string;
  webpageExcerpt?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  // Ensure Webpage note type exists
  ensureWebpageNoteType();

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    webpageHash: params.webpageHash,
    webpageUrl: params.webpageUrl,
    progress: 0,
    archivedAt: now
  };
  if (params.webpageTitle !== undefined) {
    props.webpageTitle = params.webpageTitle;
  }
  if (params.webpageAuthor !== undefined) {
    props.webpageAuthor = params.webpageAuthor;
  }
  if (params.webpageSiteName !== undefined) {
    props.webpageSiteName = params.webpageSiteName;
  }
  if (params.webpageExcerpt !== undefined) {
    props.webpageExcerpt = params.webpageExcerpt;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: WEBPAGE_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update Webpage reading state (progress, last read time)
 * Use this for debounced reading position updates
 */
export function updateWebpageReadingState(
  noteId: string,
  updates: {
    progress?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as WebpageNoteProps;
    if (updates.progress !== undefined) props.progress = updates.progress;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Get Webpage props from a note
 */
export function getWebpageProps(noteId: string): WebpageNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || note.type !== WEBPAGE_NOTE_TYPE_ID) return undefined;
  return note.props as WebpageNoteProps | undefined;
}
