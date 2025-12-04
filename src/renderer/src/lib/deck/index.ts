/**
 * Deck feature - Display filtered note lists inline within notes
 *
 * Usage:
 * 1. Create a deck note (flint_kind: 'deck') with YAML configuration as content
 * 2. Embed decks in other notes using: ```flint-deck\nn-<note-id>\n```
 *
 * Example embed block:
 * ```flint-deck
 * n-my-deck-id
 * ```
 *
 * Deck notes store their configuration as YAML content:
 * name: My Tasks
 * filters:
 *   - field: type
 *     value: Task
 * sort:
 *   field: updated
 *   order: desc
 * columns:
 *   - status
 *   - priority
 */

// Extension
export {
  deckExtension,
  updateDeckBlock,
  forceDeckRefresh,
  insertDeckBlock,
  insertDeckEmbed
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

// New minimal deck components
export { default as DeckToolbar } from './DeckToolbar.svelte';
export { default as PropChip } from './PropChip.svelte';
export { default as NoteListItem } from './NoteListItem.svelte';
export { default as PropPickerDialog } from './PropPickerDialog.svelte';
export { default as PropFilterPopup } from './PropFilterPopup.svelte';

// Query service
export { runDeckQuery, getMetadataFieldsForType } from './queryService.svelte';
