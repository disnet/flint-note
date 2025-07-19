/**
 * FlintNote API - Public programmatic interface
 */

export { FlintNoteApi, type FlintNoteApiConfig } from './flint-note-api.js';

// Export API response types
export type {
  ApiNote,
  ApiNoteInfo,
  ApiNoteListItem,
  ApiCreateResult,
  ApiUpdateResult,
  ApiDeleteNoteResult,
  ApiRenameNoteResult,
  ApiBulkDeleteResult,
  ApiNoteTypeInfo,
  ApiNoteTypeListItem,
  ApiCreateNoteTypeResult,
  ApiUpdateNoteTypeResult,
  ApiDeleteNoteTypeResult,
  ApiSearchResult,
  ApiSearchResponse,
  ApiAdvancedSearchResponse,
  ApiSqlSearchResponse,
  ApiSearchResultType,
  ApiVaultInfo,
  ApiVaultListResponse,
  ApiCreateVaultResult,
  ApiVaultOperationResult,
  ApiNoteLink,
  ApiNoteLinkResponse,
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiLinkSearchResponse,
  ApiMigrateLinksResult,
  ApiTypesResource,
  ApiRecentResource,
  ApiStatsResource,
  ApiError,
  ApiResponse,
  ApiNoteResult,
  ApiMultipleNotesResult
} from './types.js';

// Re-export commonly used types from server
export type {
  CreateNoteArgs,
  GetNoteArgs,
  GetNotesArgs,
  UpdateNoteArgs,
  DeleteNoteArgs,
  RenameNoteArgs,
  GetNoteInfoArgs,
  ListNotesByTypeArgs,
  BulkDeleteNotesArgs,
  CreateNoteTypeArgs,
  ListNoteTypesArgs,
  UpdateNoteTypeArgs,
  GetNoteTypeInfoArgs,
  DeleteNoteTypeArgs,
  SearchNotesArgs,
  SearchNotesAdvancedArgs,
  SearchNotesSqlArgs,
  CreateVaultArgs,
  SwitchVaultArgs,
  RemoveVaultArgs,
  UpdateVaultArgs
} from '../server/types.js';

// Re-export core types
export type { ServerConfig } from '../server/types.js';
export type { NoteMetadata } from '../types/index.js';

// Re-export core manager types (for direct API users)
export type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '../core/notes.js';
export type { NoteTypeListItem } from '../core/note-types.js';
