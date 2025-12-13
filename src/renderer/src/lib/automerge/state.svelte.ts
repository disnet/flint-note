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
  PropertyDefinition
} from './types';
import { generateNoteId, generateWorkspaceId, generateNoteTypeId, nowISO } from './utils';
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

// UI state (not persisted in Automerge)
let activeNoteId = $state<string | null>(null);

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

  // Clear active note when switching vaults
  activeNoteId = null;

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

    // Auto-add to recent notes in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      doc.workspaces[workspaceId].recentNoteIds.unshift(id);
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
      const index = ws.recentNoteIds.indexOf(id);
      if (index !== -1) {
        ws.recentNoteIds.splice(index, 1);
      }
    }
  });

  // Clear active note if it was archived
  if (activeNoteId === id) {
    activeNoteId = null;
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
      const index = ws.recentNoteIds.indexOf(id);
      if (index !== -1) {
        ws.recentNoteIds.splice(index, 1);
      }
    }
  });

  // Clear active note if it was deleted
  if (activeNoteId === id) {
    activeNoteId = null;
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
 * Get recent notes in the active workspace
 */
export function getRecentNotes(): Note[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  return workspace.recentNoteIds
    .map((id) => currentDoc.notes[id])
    .filter((note): note is Note => note !== undefined && !note.archived);
}

/**
 * Check if a note is in the recent notes of the active workspace
 */
export function isNoteRecent(noteId: string): boolean {
  const workspace = getActiveWorkspace();
  return workspace?.recentNoteIds.includes(noteId) ?? false;
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
      pinnedNoteIds: [],
      recentNoteIds: [],
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
 * Add a note to the active workspace's recent notes
 * Does not add if the note is already pinned or already in recent notes
 */
export function addNoteToWorkspace(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;

    // Don't add if already pinned
    if (ws.pinnedNoteIds?.includes(noteId)) return;

    // Don't add duplicates to recent
    if (ws.recentNoteIds.includes(noteId)) return;

    ws.recentNoteIds.unshift(noteId);
  });
}

/**
 * Remove a note from the active workspace's recent notes
 * @returns The ID of the note to select next, or null if none
 */
export function removeNoteFromWorkspace(noteId: string): string | null {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return null;

  const index = workspace.recentNoteIds.indexOf(noteId);
  if (index === -1) return null;

  // Determine next note to select
  let nextNoteId: string | null = null;
  if (workspace.recentNoteIds.length > 1) {
    if (index < workspace.recentNoteIds.length - 1) {
      nextNoteId = workspace.recentNoteIds[index + 1];
    } else {
      nextNoteId = workspace.recentNoteIds[index - 1];
    }
  }

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws) {
      const idx = ws.recentNoteIds.indexOf(noteId);
      if (idx !== -1) {
        ws.recentNoteIds.splice(idx, 1);
      }
    }
  });

  // Clear active note if it was removed
  if (activeNoteId === noteId) {
    activeNoteId = nextNoteId;
  }

  return nextNoteId;
}

/**
 * Reorder recent notes in the active workspace
 */
export function reorderWorkspaceNotes(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;

    const [removed] = ws.recentNoteIds.splice(fromIndex, 1);
    ws.recentNoteIds.splice(toIndex, 0, removed);
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

// --- Pinned notes ---

/**
 * Get pinned notes in the active workspace
 */
export function getPinnedNotes(): Note[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  // Handle old workspaces that don't have pinnedNoteIds
  const pinnedIds = workspace.pinnedNoteIds ?? [];

  return pinnedIds
    .map((id) => currentDoc.notes[id])
    .filter((note): note is Note => note !== undefined && !note.archived);
}

/**
 * Pin a note to the active workspace
 */
export function pinNote(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Don't pin if already pinned
  if (workspace.pinnedNoteIds?.includes(noteId)) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;

    // Initialize pinnedNoteIds if it doesn't exist
    if (!ws.pinnedNoteIds) {
      ws.pinnedNoteIds = [];
    }

    // Add to pinned if not already there
    if (!ws.pinnedNoteIds.includes(noteId)) {
      ws.pinnedNoteIds.push(noteId);
    }

    // Remove from recent notes (pinned notes replace recent notes)
    const recentIndex = ws.recentNoteIds.indexOf(noteId);
    if (recentIndex !== -1) {
      ws.recentNoteIds.splice(recentIndex, 1);
    }
  });
}

/**
 * Unpin a note from the active workspace
 */
export function unpinNote(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws || !ws.pinnedNoteIds) return;

    const index = ws.pinnedNoteIds.indexOf(noteId);
    if (index !== -1) {
      ws.pinnedNoteIds.splice(index, 1);

      // Add to recent notes when unpinned (at the start)
      if (!ws.recentNoteIds.includes(noteId)) {
        ws.recentNoteIds.unshift(noteId);
      }
    }
  });
}

/**
 * Check if a note is pinned in the active workspace
 */
export function isNotePinned(noteId: string): boolean {
  const workspace = getActiveWorkspace();
  return workspace?.pinnedNoteIds?.includes(noteId) ?? false;
}

/**
 * Reorder pinned notes in the active workspace
 */
export function reorderPinnedNotes(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws || !ws.pinnedNoteIds) return;

    const [removed] = ws.pinnedNoteIds.splice(fromIndex, 1);
    ws.pinnedNoteIds.splice(toIndex, 0, removed);
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
    doc.noteTypes[id] = {
      id,
      name: params.name,
      purpose: params.purpose || '',
      icon: params.icon || '📄',
      archived: false,
      created: nowISO(),
      properties: params.properties,
      editorChips: params.editorChips
    };
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
 * Returns configured chips or defaults to system fields
 */
export function getNoteTypeEditorChips(typeId: string): string[] {
  const noteType = currentDoc.noteTypes?.[typeId];
  return noteType?.editorChips ?? ['created', 'updated'];
}

// --- Active note (UI state, not persisted in Automerge) ---

/**
 * Get the currently active note ID
 */
export function getActiveNoteId(): string | null {
  return activeNoteId;
}

/**
 * Get the currently active note
 */
export function getActiveNote(): Note | undefined {
  if (!activeNoteId) return undefined;
  return currentDoc.notes[activeNoteId];
}

/**
 * Set the active note ID
 */
export function setActiveNoteId(id: string | null): void {
  activeNoteId = id;
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
