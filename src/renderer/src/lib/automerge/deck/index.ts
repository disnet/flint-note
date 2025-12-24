/**
 * Deck Module
 * Provides deck functionality (filtered note lists)
 */

// Types
export type {
  DeckConfig,
  DeckView,
  DeckFilter,
  DeckSort,
  FilterOperator,
  ColumnConfig,
  ColumnDefinition,
  ColumnFormat,
  DeckValidationWarning,
  PageSize
} from '../../../../../shared/deck-yaml-utils';

export type {
  FieldType,
  FilterFieldInfo,
  DeckResultNote,
  DeckQueryResult,
  DeckQueryOptions,
  DeckHandlers,
  DeckBlock
} from './deck-types';

// Constants
export {
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTER_VALUE,
  OPERATORS_BY_TYPE,
  SYSTEM_FIELDS,
  SYSTEM_COLUMNS
} from './deck-types';

// YAML utilities (re-exported from shared)
export {
  parseDeckYaml,
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  createEmptyDeckConfig,
  getActiveView,
  getView,
  columnHasCustomSettings
} from './deck-types';

// Type utilities
export {
  getOperatorsForType,
  getOperatorLabel,
  getFormatsForType,
  getFormatLabel,
  noteToResultNote
} from './deck-types';

// Query service
export { runDeckQuery, getFieldValues, getAvailableFields } from './deck-query.svelte';

// View utilities
export { normalizeColumn, createDefaultView } from './deck-types';

// Theme
export { deckTheme } from './deck-theme';

// CodeMirror extension
export {
  deckExtension,
  updateDeckBlock,
  forceDeckRefresh,
  insertDeckEmbed,
  insertDeckBlock
} from './deck-extension.svelte';
