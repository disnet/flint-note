/**
 * FlintNote API - Public programmatic interface
 */

export { FlintNoteApi, type FlintNoteApiConfig } from './flint-note-api.js';
export { CustomFunctionsApi } from './custom-functions-api.js';

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
  UpdateVaultArgs,
  RegisterCustomFunctionArgs,
  UpdateCustomFunctionArgs,
  ListCustomFunctionsArgs,
  DeleteCustomFunctionArgs,
  GetCustomFunctionArgs,
  ValidateCustomFunctionArgs,
  CustomFunctionExecutionStatsArgs
} from './types.js';

// Re-export core types
export type { ServerConfig } from './types.js';
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

// Custom Functions types
export type {
  CustomFunction,
  CustomFunctionParameter,
  CreateCustomFunctionOptions,
  UpdateCustomFunctionOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  CompiledFunction,
  CustomFunctionExecutionContext,
  CustomFunctionExecutionResult
} from '../types/custom-functions.js';
