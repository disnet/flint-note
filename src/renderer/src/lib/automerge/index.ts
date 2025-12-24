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
  InboxNote,
  // EPUB types
  EpubNoteProps,
  EpubHighlight,
  EpubTocItem,
  EpubMetadata,
  EpubLocation,
  // PDF types
  PdfNoteProps,
  PdfHighlight,
  PdfOutlineItem,
  PdfMetadata,
  // Webpage types
  WebpageNoteProps,
  WebpageMetadata,
  WebpageHighlight,
  WebpageSelectionInfo,
  // Review mode types
  ReviewRating,
  ReviewStatus,
  ReviewHistoryEntry,
  ReviewData,
  ReviewConfig,
  ReviewSessionResult,
  ReviewSession,
  ReviewState,
  // Routine types
  AgentRoutine,
  AgentRoutineStatus,
  AgentRoutineType,
  RecurringSpec,
  SupplementaryMaterial,
  RoutineCompletion,
  RoutineDueType,
  RoutineListItem,
  CreateRoutineInput,
  UpdateRoutineInput,
  CompleteRoutineInput,
  ListRoutinesInput,
  GetRoutineInput
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
  getEpubProps,

  // PDF support
  PDF_NOTE_TYPE_ID,
  ensurePdfNoteType,
  getPdfNotes,
  createPdfNote,
  updatePdfReadingState,
  updatePdfZoomLevel,
  getPdfProps,

  // Webpage support
  WEBPAGE_NOTE_TYPE_ID,
  ensureWebpageNoteType,
  getWebpageNotes,
  createWebpageNote,
  updateWebpageReadingState,
  getWebpageProps,

  // Deck support
  DECK_NOTE_TYPE_ID,
  ensureDeckNoteType,
  getDeckNotes,
  createDeckNote,

  // Review mode
  getReviewState,
  getReviewConfig,
  updateReviewConfig,
  getCurrentSessionNumber,
  incrementSessionNumber,
  isSessionAvailable,
  getNextSessionTime,
  enableReview,
  disableReview,
  reactivateReview,
  getReviewData,
  getReviewEnabledNotes,
  getNotesForReview,
  getReviewStats,
  getAllReviewHistory,
  getActiveSession,
  hasActiveSession,
  startReviewSession,
  updateSessionState,
  recordReview,
  completeSession,
  clearActiveSession,
  getCurrentReviewNote,
  getReviewQueueNotes,
  type ReviewStats,

  // Inbox
  getUnprocessedNotes,
  getProcessedNotes,
  getUnprocessedCount,
  markNoteAsProcessed,
  unmarkNoteAsProcessed,
  markAllNotesAsProcessed,
  unmarkAllNotesAsProcessed,
  isNoteProcessed,

  // Routine getters
  getRoutines,
  getAllRoutines,
  getRoutine,
  getRoutineByName,
  getRoutineListItems,
  getRoutinesDueNow,
  getUpcomingRoutines,
  getBacklogRoutines,

  // Routine mutations
  createRoutine,
  updateRoutine,
  deleteRoutine,
  completeRoutine,
  addRoutineMaterial,
  removeRoutineMaterial,

  // Routine scheduling helpers
  isRoutineDue,
  getDaysUntilNextDue,
  formatRecurringSchedule,
  getRoutineContextForPrompt
} from './state.svelte';

// OPFS storage for EPUB files
export { opfsStorage, computeHash } from './opfs-storage.svelte';

// OPFS storage for PDF files
export { pdfOpfsStorage } from './pdf-opfs-storage.svelte';

// OPFS storage for Webpage files
export { webpageOpfsStorage } from './webpage-opfs-storage.svelte';

// EPUB import
export {
  importEpubFile,
  importEpubFromData,
  pickAndImportEpub,
  handleEpubDrop,
  epubExists
} from './epub-import.svelte';
export type { EpubImportResult } from './epub-import.svelte';

// PDF import
export {
  importPdfFile,
  importPdfFromData,
  pickAndImportPdf,
  handlePdfDrop,
  pdfExists
} from './pdf-import.svelte';
export type { PdfImportResult } from './pdf-import.svelte';

// Webpage import
export {
  importWebpageFromUrl,
  webpageExists,
  getWebpageHtml,
  getWebpageMetadata
} from './webpage-import.svelte';
export type { WebpageImportResult } from './webpage-import.svelte';

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
  generateRoutineId,
  generateRoutineCompletionId,
  generateRoutineMaterialId,
  nowISO
} from './utils';

// Editor support
export { EditorConfig } from './editorConfig.svelte';
export type { EditorConfigOptions } from './editorConfig.svelte';
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

// AI tools for notes, EPUBs, PDFs, and routines
export { createNoteTools } from './note-tools.svelte';
export { createEpubTools } from './epub-tools.svelte';
export { createPdfTools } from './pdf-tools.svelte';
export { createRoutineTools } from './routine-tools.svelte';

// Routine scheduler
export { getRoutineScheduler, resetRoutineScheduler } from './routine-scheduler.svelte';
export type { SchedulerConfig as RoutineSchedulerConfig } from './routine-scheduler.svelte';

// Deck module (filtered note lists)
export * from './deck';

// Review service (AI-powered prompts and feedback)
export {
  ReviewService,
  getReviewService,
  resetReviewService
} from './review-service.svelte';
export type { ReviewServiceStatus } from './review-service.svelte';

// Review scheduler (pure functions)
export {
  DEFAULT_REVIEW_CONFIG,
  RATING_MULTIPLIERS,
  RATING_LABELS,
  RATING_DESCRIPTIONS,
  calculateNextSession,
  estimateSessionDate,
  formatSessionDate,
  isNewSessionAvailable,
  getNextSessionAvailableAt,
  getOrdinal,
  createReviewHistoryEntry,
  getHistoryStats,
  isPassingRating,
  getLastReview,
  generateSessionId
} from './review-scheduler';
export type { NextSessionResult } from './review-scheduler';
