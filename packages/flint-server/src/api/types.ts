/**
 * Type definitions for FlintNote API responses
 * These types reuse existing core types to avoid duplication and maintain sync
 */

// ============================================================================
// Re-export core types for convenience
// ============================================================================

// Re-export the original types in case consumers need them
export type {
  Note as CoreNote,
  NoteInfo as CoreNoteInfo,
  NoteListItem as CoreNoteListItem,
  UpdateResult as CoreUpdateResult,
  DeleteNoteResult as CoreDeleteNoteResult
} from '../core/notes.js';

export type {
  NoteTypeDescription as CoreNoteTypeDescription,
  NoteTypeListItem as CoreNoteTypeListItem,
  NoteTypeInfo as CoreNoteTypeInfo
} from '../core/note-types.js';

export type { SearchResult as CoreSearchResult } from '../database/search-manager.js';

export type {
  NoteLinkRow as CoreNoteLinkRow,
  NoteRow as CoreNoteRow,
  SearchRow as CoreSearchRow,
  MetadataRow as CoreMetadataRow
} from '../database/schema.js';

export type { VaultInfo as CoreVaultInfo } from '../utils/global-config.js';

export type { NoteMetadata } from '../types/index.js';
