/**
 * Automerge Deck Module
 * Provides deck functionality (filtered note lists) for the Automerge version
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
  AutomergeFieldType,
  AutomergeFilterFieldInfo,
  AutomergeDeckResultNote,
  AutomergeDeckQueryResult,
  AutomergeDeckQueryOptions,
  AutomergeDeckHandlers,
  AutomergeDeckBlock
} from './automerge-deck-types';

// Constants
export {
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTER_VALUE,
  OPERATORS_BY_TYPE,
  SYSTEM_FIELDS,
  SYSTEM_COLUMNS
} from './automerge-deck-types';

// YAML utilities (re-exported from shared)
export {
  parseDeckYaml,
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  createEmptyDeckConfig,
  getActiveView,
  getView,
  columnHasCustomSettings
} from './automerge-deck-types';

// Type utilities
export {
  getOperatorsForType,
  getOperatorLabel,
  getFormatsForType,
  getFormatLabel,
  noteToResultNote
} from './automerge-deck-types';

// Query service
export {
  runAutomergeDeckQuery,
  getFieldValues,
  getAvailableFields
} from './automerge-deck-query.svelte';

// View utilities
export { normalizeColumn, createDefaultView } from './automerge-deck-types';

// Theme
export { automergeDeckTheme } from './automerge-deck-theme';

// CodeMirror extension
export {
  automergeDeckExtension,
  updateDeckBlock,
  forceDeckRefresh,
  insertDeckEmbed,
  insertDeckBlock
} from './automerge-deck-extension.svelte';
