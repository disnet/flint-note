/**
 * Dataview feature - Display filtered note lists inline within notes
 *
 * Usage:
 * 1. Import the extension in editorConfig.svelte.ts
 * 2. Add to extensions array with handlers
 * 3. Use ```flint-query code blocks in notes
 *
 * Example query block:
 * ```flint-query
 * name: My Tasks
 * filters:
 *   - field: type
 *     value: Task
 *   - field: status
 *     operator: "!="
 *     value: done
 * sort:
 *   field: updated
 *   order: desc
 * columns:
 *   - status
 *   - priority
 * ```
 */

// Extension
export {
  dataviewExtension,
  updateDataviewBlock,
  forceDataviewRefresh,
  insertDataviewBlock
} from './dataviewExtension.svelte';

// Types
export type {
  FlintQueryConfig,
  QueryFilter,
  QuerySort,
  FilterOperator,
  QueryResultNote,
  FlintQueryBlock,
  DataviewHandlers
} from './types';

// Utilities
export {
  parseQueryYaml,
  serializeQueryConfig,
  createEmptyQueryConfig,
  createTypeFilterQuery
} from './yaml-utils';

// Query service
export { runDataviewQuery, getMetadataFieldsForType } from './queryService.svelte';
