/**
 * Deck feature - Display filtered note lists inline within notes
 *
 * Usage:
 * 1. Import the extension in editorConfig.svelte.ts
 * 2. Add to extensions array with handlers
 * 3. Use ```flint-deck code blocks in notes
 *
 * Example deck block:
 * ```flint-deck
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
  deckExtension,
  updateDeckBlock,
  forceDeckRefresh,
  insertDeckBlock
} from './deckExtension.svelte';

// Types
export type {
  DeckConfig,
  DeckFilter,
  DeckSort,
  FilterOperator,
  DeckResultNote,
  DeckBlock,
  DeckHandlers,
  FilterFieldInfo,
  // Column types
  ColumnConfig,
  ColumnDefinition,
  ColumnFormat
} from './types';

// Type utilities
export {
  SYSTEM_FIELDS,
  OPERATORS_BY_TYPE,
  fieldDefToFilterInfo,
  getOperatorsForType,
  getOperatorLabel,
  // Column utilities
  SYSTEM_COLUMNS,
  normalizeColumn,
  columnHasCustomSettings,
  getFormatsForType,
  getFormatLabel
} from './types';

// Utilities
export {
  parseDeckYaml,
  serializeDeckConfig,
  createEmptyDeckConfig,
  createTypeFilterDeck
} from './yaml-utils';

// Filter Builder components
export { default as FilterBuilder } from './FilterBuilder.svelte';
export { default as FilterRow } from './FilterRow.svelte';
export { default as FieldSelector } from './FieldSelector.svelte';
export { default as OperatorSelector } from './OperatorSelector.svelte';
export { default as ValueInput } from './ValueInput.svelte';

// Column Builder components
export { default as ColumnBuilder } from './ColumnBuilder.svelte';
export { default as ColumnRow } from './ColumnRow.svelte';
export { default as ColumnCell } from './ColumnCell.svelte';

// Query service
export { runDeckQuery, getMetadataFieldsForType } from './queryService.svelte';
