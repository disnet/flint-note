/**
 * Automerge integration for Flint notes
 *
 * This module provides local-first data storage using Automerge,
 * backed by IndexedDB in the browser.
 */

// Types
export type { Note, NoteType, Workspace, NotesDocument, Vault } from './types';

// State management
export {
  // Initialization
  initializeState,

  // Vault getters
  getVaultsState,
  getNonArchivedVaults,
  getActiveVault,
  getActiveVaultId,

  // Vault mutations
  initVaultState,
  addVaultToState,
  updateVaultInState,
  createVault,
  switchVault,

  // Note getters
  getNotes,
  getAllNotes,
  getNote,
  searchNotes,
  getNotesByType,

  // Note mutations
  createNote,
  updateNote,
  archiveNote,
  deleteNote,

  // Workspace getters
  getWorkspaces,
  getActiveWorkspace,
  getOpenNotes,
  isNoteOpen,

  // Workspace mutations
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
  addNoteToWorkspace,
  removeNoteFromWorkspace,
  reorderWorkspaceNotes,

  // Note type getters
  getNoteTypes,
  getAllNoteTypes,
  getNoteType,

  // Note type mutations
  createNoteType,
  updateNoteType,
  archiveNoteType,
  setNoteType,

  // Active note (UI state)
  getActiveNoteId,
  getActiveNote,
  setActiveNoteId,

  // Backlinks
  getBacklinks,
  type ContextLine,
  type ContextBlock,

  // Loading states
  getIsInitialized,
  getIsLoading
} from './state.svelte';

// Repo utilities
export { createRepo, getRepo } from './repo';

// ID generation
export {
  generateId,
  generateNoteId,
  generateWorkspaceId,
  generateNoteTypeId,
  generateVaultId,
  nowISO
} from './utils';
