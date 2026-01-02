/**
 * Automerge integration for Flint notes
 *
 * This module provides local-first data storage using Automerge,
 * backed by IndexedDB in the browser.
 */

// Types
export type {
  Note,
  NoteMetadata,
  NoteContentDocument,
  NoteType,
  Workspace,
  NotesDocument,
  Vault,
  PropertyType,
  PropertyConstraints,
  PropertyDefinition,
  Conversation,
  ConversationIndexEntry,
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
  GetRoutineInput,
  // Note filter types
  NoteFilterOperator,
  NoteFilter,
  NoteFilterInput,
  // Source format type
  SourceFormat
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

  // DocHandle access for automerge-codemirror
  getDocHandle,

  // Vault mutations
  initVaultState,
  addVaultToState,
  updateVaultInState,
  createVault,
  switchVault,

  // Legacy vault helpers
  isLegacyVault,
  hasLegacyVaults,
  createLegacyVaultEntries,
  clearLegacyVaultFields,
  finalizeLegacyVaultMigration,

  // Source format helper
  getSourceFormat,

  // System type helper
  isProtectedType,

  // Note getters
  getNotes,
  getAllNotes,
  searchNotes,
  getNotesByType,
  filterNotes,

  // Note mutations
  createNote,
  updateNote,
  updateNoteContent,
  archiveNote,
  unarchiveNote,
  deleteNote,

  // Content loading (async)
  getNoteContent,
  getFullNote,
  getNoteContentHandle,
  searchNotesWithContent,

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
  moveItemToWorkspace,
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
  getSelectedNoteTypeId,
  setSelectedNoteTypeId,
  getActiveNote,
  getActiveConversationEntry,
  navigateToNote,

  // Convenience wrappers (for backward compatibility)
  getActiveNoteId,
  setActiveNoteId,
  getActiveConversationId,
  setActiveConversationId,
  addNoteToWorkspace,

  // Backlinks
  getBacklinks,
  type BacklinkOccurrence,
  type BacklinkResult,

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
  getConversationEntry,
  clearConversationCache,

  // Conversation mutations
  createConversation,
  addMessageToConversation,
  updateConversationMessage,
  updateConversation,
  archiveConversation,
  unarchiveConversation,
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
  getEpubNotes,
  createEpubNote,
  updateEpubReadingState,
  updateEpubTextSize,
  getEpubProps,

  // PDF support
  getPdfNotes,
  createPdfNote,
  updatePdfReadingState,
  updatePdfZoomLevel,
  getPdfProps,

  // Webpage support
  getWebpageNotes,
  createWebpageNote,
  updateWebpageReadingState,
  getWebpageProps,

  // Deck support
  DECK_NOTE_TYPE_ID,
  getDeckNotes,
  createDeckNote,
  getDeckConfig,
  updateDeckConfig,

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
  getRoutineContextForPrompt,
  getNoteTypesContextForPrompt,

  // File sync helpers for vault creation
  selectSyncDirectory,
  connectVaultSync
} from './state.svelte';

// OPFS storage for EPUB files
export { opfsStorage, computeHash } from './opfs-storage.svelte';

// OPFS storage for PDF files
export { pdfOpfsStorage } from './pdf-opfs-storage.svelte';

// OPFS storage for Webpage files
export { webpageOpfsStorage } from './webpage-opfs-storage.svelte';

// OPFS storage for conversations
export { conversationOpfsStorage } from './conversation-opfs-storage.svelte';

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
  importWebpageFromFilesystem,
  webpageExists,
  getWebpageHtml,
  getWebpageMetadata
} from './webpage-import.svelte';
export type { WebpageImportResult } from './webpage-import.svelte';

// OPFS storage for image files
export { imageOpfsStorage } from './image-opfs-storage.svelte';
export type { ImageStoreResult, ImageFileInfo } from './image-opfs-storage.svelte';

// Image import
export {
  importImageFile,
  importImageFromData,
  pickAndImportImages,
  handleImageDrop,
  handleImagePaste,
  hasImageData,
  imageExists,
  buildMarkdownImageSyntax,
  parseOpfsImageUrl
} from './image-import.svelte';
export type { ImageImportResult } from './image-import.svelte';

// Image CodeMirror extension
export {
  imageExtension,
  forceImageRefresh,
  clearImageCache,
  insertImage
} from './image-extension.svelte';

// Repo utilities
export {
  createRepo,
  getRepo,
  archiveVault,
  compactVaultDocument,
  getStorageStats,
  saveVaults
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
  WikilinkTargetType,
  SelectedWikilink
} from './wikilinks.svelte';

// Enhanced search
export {
  searchNotesEnhanced,
  searchNotesAsync,
  highlightMatch,
  getMatchPreview
} from './search.svelte';
export type {
  SearchResult,
  EnhancedSearchResult,
  SearchMatch,
  SearchOptions,
  EnhancedSearchOptions,
  AsyncSearchOptions,
  TextSegment
} from './search.svelte';

// Search index
export { searchIndex } from './search-index.svelte';
export type { IndexedNote, ContentSearchResult } from './search-index.svelte';

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

// File sync (PDFs, EPUBs, web archives, images)
export {
  syncFileToFilesystem,
  fileExistsOnFilesystem,
  handleFileAddedFromFilesystem,
  performInitialFileSync,
  performReverseFileSync,
  setupFileSyncListener,
  isFileSyncAvailable
} from './file-sync.svelte';
export type { FileType as FileSyncFileType } from './file-sync.svelte';

// Markdown directory import
export {
  importMarkdownDirectory,
  getImportProgress,
  getIsImporting,
  resetImportState
} from './markdown-import.svelte';
export type {
  MarkdownImportProgress,
  MarkdownImportResult,
  MarkdownImportError
} from './markdown-import.svelte';

// Automerge vault import (from .automerge directories)
export {
  importAutomergeVault,
  getAutomergeImportProgress,
  getIsAutomergeImporting,
  resetAutomergeImportState
} from './automerge-import.svelte';
export type {
  AutomergeVaultInfo,
  AutomergeImportProgress,
  AutomergeImportResult
} from './automerge-import.svelte';

// Vault templates and onboarding
export {
  VAULT_TEMPLATES,
  ONBOARDING_OPTIONS,
  getTemplate,
  getOnboardingOption
} from './vault-templates';
export type {
  VaultTemplate,
  OnboardingOption,
  OnboardingNote,
  WorkspaceTemplate,
  NoteTypeTemplate
} from './vault-templates';

// Vault creation with templates
export {
  createVaultWithOptions,
  applyVaultTemplate,
  applyOnboardingContent
} from './vault-creation.svelte';
export type { VaultCreationOptions } from './vault-creation.svelte';
