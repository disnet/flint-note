/**
 * YAML parsing and serialization utilities for flint-deck blocks.
 * Re-exports from shared module for backward compatibility.
 */

// Re-export everything from the shared module
export {
  parseDeckYaml,
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  createEmptyDeckConfig,
  createDeckConfigFromInput,
  getActiveView,
  getView,
  columnHasCustomSettings
} from '../../../../shared/deck-yaml-utils';

// Also re-export types
export type {
  DeckConfig,
  DeckView,
  DeckFilter,
  DeckSort,
  FilterOperator,
  ColumnDefinition,
  ColumnConfig,
  ColumnFormat,
  DeckValidationWarning,
  ParsedDeckResult
} from '../../../../shared/deck-yaml-utils';

// Import local types for createTypeFilterDeck
import type { DeckConfig } from '../../../../shared/deck-yaml-utils';

const DEFAULT_LIMIT = 50;

/**
 * Create a simple type filter deck (kept here for backward compatibility)
 */
export function createTypeFilterDeck(typeName: string, viewName?: string): DeckConfig {
  return {
    views: [
      {
        name: viewName || 'Default',
        filters: [{ field: 'type', value: typeName }],
        sort: { field: 'updated', order: 'desc' }
      }
    ],
    activeView: 0,
    limit: DEFAULT_LIMIT
  };
}
