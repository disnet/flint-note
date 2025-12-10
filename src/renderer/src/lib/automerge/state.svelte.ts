/**
 * Unified reactive state management for Flint notes using Automerge
 *
 * This module provides:
 * - Reactive state via Svelte 5 runes
 * - All note/workspace/type mutations via Automerge
 * - Vault management (localStorage for metadata)
 */

import type { DocHandle } from '@automerge/automerge-repo';
import type { Note, NoteType, NotesDocument, Vault, Workspace } from './types';
import { generateNoteId, generateWorkspaceId, generateNoteTypeId, nowISO } from './utils';
import {
  createRepo,
  getRepo,
  findDocument,
  initializeVaults,
  saveVaults,
  setActiveVaultId as setActiveVaultIdStorage,
  createVault as createVaultInRepo
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
 * Get a single note by ID
 */
export function getNote(id: string): Note | undefined {
  return currentDoc.notes[id];
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

    // Auto-open in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      doc.workspaces[workspaceId].openNoteIds.unshift(id);
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
      const index = ws.openNoteIds.indexOf(id);
      if (index !== -1) {
        ws.openNoteIds.splice(index, 1);
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
      const index = ws.openNoteIds.indexOf(id);
      if (index !== -1) {
        ws.openNoteIds.splice(index, 1);
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
 * Get all workspaces
 */
export function getWorkspaces(): Workspace[] {
  return Object.values(currentDoc.workspaces);
}

/**
 * Get the active workspace
 */
export function getActiveWorkspace(): Workspace | undefined {
  const workspaceId = currentDoc.activeWorkspaceId;
  return workspaceId ? currentDoc.workspaces[workspaceId] : undefined;
}

/**
 * Get open notes in the active workspace
 */
export function getOpenNotes(): Note[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  return workspace.openNoteIds
    .map((id) => currentDoc.notes[id])
    .filter((note): note is Note => note !== undefined && !note.archived);
}

/**
 * Check if a note is open in the active workspace
 */
export function isNoteOpen(noteId: string): boolean {
  const workspace = getActiveWorkspace();
  return workspace?.openNoteIds.includes(noteId) ?? false;
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
      openNoteIds: [],
      created: nowISO()
    };
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
 * Add a note to the active workspace's open notes
 */
export function addNoteToWorkspace(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Don't add duplicates
  if (workspace.openNoteIds.includes(noteId)) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws && !ws.openNoteIds.includes(noteId)) {
      ws.openNoteIds.unshift(noteId);
    }
  });
}

/**
 * Remove a note from the active workspace's open notes
 * @returns The ID of the note to select next, or null if none
 */
export function removeNoteFromWorkspace(noteId: string): string | null {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return null;

  const index = workspace.openNoteIds.indexOf(noteId);
  if (index === -1) return null;

  // Determine next note to select
  let nextNoteId: string | null = null;
  if (workspace.openNoteIds.length > 1) {
    if (index < workspace.openNoteIds.length - 1) {
      nextNoteId = workspace.openNoteIds[index + 1];
    } else {
      nextNoteId = workspace.openNoteIds[index - 1];
    }
  }

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws) {
      const idx = ws.openNoteIds.indexOf(noteId);
      if (idx !== -1) {
        ws.openNoteIds.splice(idx, 1);
      }
    }
  });

  // Clear active note if it was closed
  if (activeNoteId === noteId) {
    activeNoteId = nextNoteId;
  }

  return nextNoteId;
}

/**
 * Reorder notes in the active workspace
 */
export function reorderWorkspaceNotes(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;

    const [removed] = ws.openNoteIds.splice(fromIndex, 1);
    ws.openNoteIds.splice(toIndex, 0, removed);
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
      created: nowISO()
    };
  });

  return id;
}

/**
 * Update a note type
 */
export function updateNoteType(
  id: string,
  updates: Partial<Pick<NoteType, 'name' | 'purpose' | 'icon'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (!noteType) return;

    if (updates.name !== undefined) noteType.name = updates.name;
    if (updates.purpose !== undefined) noteType.purpose = updates.purpose;
    if (updates.icon !== undefined) noteType.icon = updates.icon;
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

// Note: State variables cannot be exported directly because they are reassigned.
// Use the getter functions instead: getIsInitialized(), getIsLoading(), etc.
