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
  PersistedToolCall,
  SidebarItemType,
  SidebarItemRef,
  SidebarItem,
  ActiveItem,
  SystemView,
  LastViewState,
  ShelfItemData,
  // EPUB types
  EpubNoteProps,
  EpubHighlight,
  EpubTocItem,
  EpubMetadata,
  EpubLocation
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
  getRecentItems,
  isItemRecent,

  // Workspace mutations
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
  addItemToWorkspace,
  removeItemFromWorkspace,
  reorderRecentItems,
  reorderWorkspaces,

  // Pinned items
  getPinnedItems,
  pinItem,
  unpinItem,
  isItemPinned,
  reorderPinnedItems,

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

  // Active item and system view (persisted UI state)
  getActiveItem,
  setActiveItem,
  getActiveSystemView,
  setActiveSystemView,
  getActiveNote,
  getActiveConversation,
  navigateToNote,

  // Convenience wrappers (for backward compatibility)
  getActiveNoteId,
  setActiveNoteId,
  getActiveConversationId,
  setActiveConversationId,
  addNoteToWorkspace,

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
  getConversation,

  // Conversation mutations
  createConversation,
  addMessageToConversation,
  updateConversationMessage,
  updateConversation,
  archiveConversation,
  deleteConversation,
  bumpItemToRecent,

  // Shelf items (persisted in Automerge)
  getShelfItems,
  isItemOnShelf,
  addShelfItem,
  removeShelfItem,
  toggleShelfItemExpanded,
  setShelfItemExpanded,
  clearShelfItems,

  // EPUB support
  EPUB_NOTE_TYPE_ID,
  ensureEpubNoteType,
  getEpubNotes,
  createEpubNote,
  updateEpubReadingState,
  updateEpubTextSize,
  getEpubProps
} from './state.svelte';

// OPFS storage for EPUB files
export { opfsStorage, computeHash } from './opfs-storage.svelte';

// EPUB import
export {
  importEpubFile,
  importEpubFromData,
  pickAndImportEpub,
  handleEpubDrop,
  epubExists
} from './epub-import.svelte';
export type { EpubImportResult } from './epub-import.svelte';

// Repo utilities
export {
  createRepo,
  getRepo,
  archiveVault,
  compactVaultDocument,
  getStorageStats
} from './repo';

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
  WikilinkHoverHandler,
  WikilinkTargetType
} from './wikilinks.svelte';

// Enhanced search
export { searchNotesEnhanced, highlightMatch, getMatchPreview } from './search.svelte';
export type {
  SearchResult,
  SearchMatch,
  SearchOptions,
  TextSegment
} from './search.svelte';

// Shelf state
export { automergeShelfStore } from './shelf-state.svelte';
export type { ShelfItem } from './shelf-state.svelte';

// AI tools for notes and EPUBs
export { createNoteTools } from './note-tools.svelte';
export { createEpubTools } from './epub-tools.svelte';
