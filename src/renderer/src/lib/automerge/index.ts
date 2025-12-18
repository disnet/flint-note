/**
 * Automerge integration for Flint notes
 *
 * This module provides local-first data storage using Automerge,
 * backed by IndexedDB in the browser.
 */

// Types
export type {
  Note,
  NoteType,
  Workspace,
  NotesDocument,
  Vault,
  PropertyType,
  PropertyConstraints,
  PropertyDefinition,
  Conversation,
  PersistedChatMessage,
  PersistedToolCall
} from './types';

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
  getRecentNotes,
  isNoteRecent,

  // Workspace mutations
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
  addNoteToWorkspace,
  removeNoteFromWorkspace,
  reorderWorkspaceNotes,
  reorderWorkspaces,

  // Pinned notes
  getPinnedNotes,
  pinNote,
  unpinNote,
  isNotePinned,
  reorderPinnedNotes,

  // Note type getters
  getNoteTypes,
  getAllNoteTypes,
  getNoteType,

  // Note type mutations
  createNoteType,
  updateNoteType,
  archiveNoteType,
  setNoteType,

  // Note properties
  getNote,
  getNoteProps,
  setNoteProp,
  setNoteProps,
  deleteNoteProp,
  getNoteTypeProperties,
  getNoteTypeEditorChips,

  // Active note (UI state)
  getActiveNoteId,
  getActiveNote,
  setActiveNoteId,
  navigateToNote,

  // Backlinks
  getBacklinks,
  type ContextLine,
  type ContextBlock,

  // Loading states
  getIsInitialized,
  getIsLoading,

  // Daily view
  DAILY_NOTE_TYPE_ID,
  getDailyNote,
  getDailyNoteId,
  getOrCreateDailyNote,
  updateDailyNote,
  getWeekData,
  ensureDailyNoteType,
  type DayData,
  type WeekData,

  // Conversation getters
  getConversations,
  getRecentConversations,
  getConversation,
  getActiveConversation,
  getActiveConversationId,

  // Conversation mutations
  createConversation,
  addMessageToConversation,
  updateConversationMessage,
  updateConversation,
  archiveConversation,
  deleteConversation,
  setActiveConversationId,
  bumpConversationToRecent
} from './state.svelte';

// Repo utilities
export { createRepo, getRepo, archiveVault } from './repo';

// ID generation
export {
  generateId,
  generateNoteId,
  generateWorkspaceId,
  generateNoteTypeId,
  generateVaultId,
  generateConversationId,
  generateMessageId,
  nowISO
} from './utils';

// Editor support
export { AutomergeEditorConfig } from './editorConfig.svelte';
export type { AutomergeEditorConfigOptions } from './editorConfig.svelte';
export {
  automergeWikilinksExtension,
  forceWikilinkRefresh,
  getSelectedWikilink,
  parseWikilinks
} from './wikilinks.svelte';
export type {
  WikilinkMatch,
  WikilinkClickHandler,
  WikilinkHoverHandler
} from './wikilinks.svelte';

// Enhanced search
export { searchNotesEnhanced, highlightMatch, getMatchPreview } from './search.svelte';
export type {
  SearchResult,
  SearchMatch,
  SearchOptions,
  TextSegment
} from './search.svelte';
