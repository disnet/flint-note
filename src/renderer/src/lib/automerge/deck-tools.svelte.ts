/**
 * AI SDK Tool Definitions for Deck Operations
 *
 * These tools allow the AI chat agent to create, manage, and query
 * decks (filtered note views) stored in Automerge. They execute directly
 * in the renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import {
  getDeckNotes,
  createDeckNote,
  getNote,
  archiveNote,
  updateNote,
  getAllNotes,
  getNoteTypesDict,
  getDeckConfig,
  updateDeckConfig
} from './state.svelte';
import type { NoteType } from './types';
import { runDeckQuery } from './deck/deck-query.svelte';
import {
  getActiveView,
  createEmptyDeckConfig,
  type DeckConfig,
  type FilterOperator
} from '../../../../shared/deck-yaml-utils';

// Hard limits for safe context management
const DECK_LIMITS = {
  LIST_HARD_MAX: 50, // Hard max for list operations
  LIST_DEFAULT: 20, // Default limit for list
  QUERY_RESULT_MAX: 100, // Hard max for query results
  QUERY_RESULT_DEFAULT: 25 // Default limit for query results
};

/**
 * System fields that are always valid in deck filters
 * Custom properties must use props.* namespace (e.g., props.status)
 */
const SYSTEM_FIELD_NAMES = new Set([
  'type',
  'type_id',
  'title',
  'created',
  'updated',
  'archived'
]);

interface FilterValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that filter fields exist on the target note type(s).
 * Returns validation errors for unknown fields.
 *
 * Field naming convention:
 * - System fields: type, title, created, updated, archived (no prefix)
 * - Custom properties: props.fieldname (e.g., props.status)
 */
function validateFilterFields(
  filters: Array<{ field: string; operator?: string; value: string | string[] }>,
  noteTypes: Record<string, NoteType>
): FilterValidationResult {
  const errors: string[] = [];

  // Find type filter if present
  const typeFilter = filters.find((f) => f.field === 'type');

  const targetTypeNames: string[] = [];
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation in non-reactive function
  const validProperties = new Set<string>();
  const allTypes = Object.values(noteTypes).filter((t) => !t.archived);

  if (typeFilter) {
    // Extract type name(s) from filter value
    const typeValues = Array.isArray(typeFilter.value)
      ? typeFilter.value
      : [typeFilter.value];
    const matchedTypes: NoteType[] = [];
    const unmatchedNames: string[] = [];

    for (const typeName of typeValues) {
      const found = allTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
      if (found) {
        matchedTypes.push(found);
        targetTypeNames.push(found.name);
      } else {
        unmatchedNames.push(typeName);
      }
    }

    // Error if any type names don't exist
    if (unmatchedNames.length > 0) {
      const availableTypes = allTypes.map((t) => t.name).join(', ');
      errors.push(
        `Type${unmatchedNames.length > 1 ? 's' : ''} not found: ${unmatchedNames.join(', ')}. Available types: ${availableTypes}`
      );
      return { valid: false, errors };
    }

    // Collect properties from matched types
    for (const noteType of matchedTypes) {
      for (const prop of noteType.properties ?? []) {
        validProperties.add(prop.name);
      }
    }
  } else {
    // No type filter - collect from ALL non-archived types
    for (const noteType of allTypes) {
      for (const prop of noteType.properties ?? []) {
        validProperties.add(prop.name);
      }
    }
  }

  // Validate each filter field
  for (const filter of filters) {
    // System fields are always valid
    if (SYSTEM_FIELD_NAMES.has(filter.field)) continue;

    // Custom props must use props.* prefix
    if (!filter.field.startsWith('props.')) {
      const propList =
        Array.from(validProperties)
          .sort()
          .map((p) => `props.${p}`)
          .join(', ') || '(none)';
      errors.push(
        `Unknown field "${filter.field}". Custom properties must use props.* format ` +
          `(e.g., props.${filter.field}). Available: ${propList}`
      );
      continue;
    }

    // Extract property name from props.fieldname
    const propName = filter.field.slice(6);
    if (!validProperties.has(propName)) {
      const propList =
        Array.from(validProperties)
          .sort()
          .map((p) => `props.${p}`)
          .join(', ') || '(none)';
      if (targetTypeNames.length > 0) {
        errors.push(
          `Unknown property "${propName}" for type${targetTypeNames.length > 1 ? 's' : ''} ${targetTypeNames.join(', ')}. Available: ${propList}`
        );
      } else {
        errors.push(
          `Unknown property "${propName}". No note type defines this property. ` +
            `Use get_note_type to check available properties.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Simplified deck result for AI context
 */
interface DeckResult {
  id: string;
  title: string;
  viewCount: number;
  activeViewName: string;
  pageSize: number;
  created: string;
  updated: string;
}

/**
 * Detailed deck result with full configuration
 */
interface DeckDetailResult extends DeckResult {
  views: Array<{
    name: string;
    filterCount: number;
    filters: Array<{
      field: string;
      operator: string;
      value: string | string[];
    }>;
    columns?: string[];
    sort?: { field: string; order: string };
  }>;
}

/**
 * Convert deck note metadata and config to a simplified result
 */
function toDeckResult(
  note: { id: string; title: string; created: string; updated: string },
  config: DeckConfig
): DeckResult {
  const activeView = getActiveView(config);
  return {
    id: note.id,
    title: note.title,
    viewCount: config.views?.length ?? 1,
    activeViewName: activeView.name,
    pageSize: config.pageSize ?? 25,
    created: note.created,
    updated: note.updated
  };
}

/**
 * Convert deck note to detailed result with full config
 */
function toDeckDetailResult(
  note: { id: string; title: string; created: string; updated: string },
  config: DeckConfig
): DeckDetailResult {
  const basic = toDeckResult(note, config);
  const views =
    config.views?.map((v) => ({
      name: v.name,
      filterCount: v.filters.length,
      filters: v.filters.map((f) => ({
        field: f.field,
        operator: f.operator ?? '=',
        value: f.value
      })),
      columns: v.columns?.map((c) => (typeof c === 'string' ? c : c.field)),
      sort: v.sort ? { field: v.sort.field, order: v.sort.order } : undefined
    })) ?? [];

  return {
    ...basic,
    views
  };
}

// Zod schemas for deck configuration
const filterSchema = z.object({
  field: z
    .string()
    .describe(
      'Field to filter on. System fields: type (matches by type NAME like "Movies"), ' +
        'title, created, updated, archived. Custom properties: use props.* format ' +
        '(e.g., props.status, props.priority).'
    ),
  operator: z
    .enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'BETWEEN'])
    .optional()
    .default('=')
    .describe('Comparison operator (default: =)'),
  value: z
    .union([z.string(), z.array(z.string())])
    .describe(
      'Value to compare. For type field, use type NAME (e.g., "Movies"), not type ID. ' +
        'Use array for IN/NOT IN/BETWEEN operators.'
    )
});

const sortSchema = z.object({
  field: z.string().describe('Field to sort by'),
  order: z.enum(['asc', 'desc']).default('desc').describe('Sort order')
});

const viewSchema = z.object({
  name: z.string().min(1).describe('View name'),
  filters: z.array(filterSchema).describe('Filters for this view'),
  columns: z.array(z.string()).optional().describe('Columns to display (field names)'),
  sort: sortSchema.optional().describe('Sort configuration')
});

/**
 * Create all deck tools for the AI chat agent
 */
export function createDeckTools(): Record<string, Tool> {
  return {
    /**
     * List all decks
     */
    list_decks: tool({
      description:
        'List all deck notes in the vault. Decks are saved filtered views of notes. ' +
        'Returns deck metadata including title, view count, and active view name.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(DECK_LIMITS.LIST_DEFAULT)
          .describe(
            `Max decks to return (default: ${DECK_LIMITS.LIST_DEFAULT}, max: ${DECK_LIMITS.LIST_HARD_MAX})`
          )
      }),
      execute: async ({ limit }) => {
        try {
          const effectiveLimit = Math.min(
            limit ?? DECK_LIMITS.LIST_DEFAULT,
            DECK_LIMITS.LIST_HARD_MAX
          );

          const deckNotes = getDeckNotes();
          const limitedDecks = deckNotes.slice(0, effectiveLimit);

          const decks = limitedDecks.map((note) => {
            const config = getDeckConfig(note.id);
            if (!config) {
              return {
                id: note.id,
                title: note.title,
                viewCount: 0,
                activeViewName: 'Invalid',
                pageSize: 25,
                created: note.created,
                updated: note.updated,
                error: 'No deck configuration found'
              };
            }
            return toDeckResult(note, config);
          });

          return {
            success: true,
            decks,
            count: decks.length,
            totalDecks: deckNotes.length
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list decks'
          };
        }
      }
    }),

    /**
     * Get a specific deck by ID
     */
    get_deck: tool({
      description:
        'Get full details of a specific deck by ID. Returns the deck configuration ' +
        'including all views, filters, columns, and sort settings.',
      inputSchema: z.object({
        deckId: z.string().describe('The deck note ID')
      }),
      execute: async ({ deckId }) => {
        try {
          const note = getNote(deckId);
          if (!note) {
            return { success: false, error: `Deck not found: ${deckId}` };
          }

          const config = getDeckConfig(deckId);
          if (!config) {
            return {
              success: false,
              error: 'No deck configuration found'
            };
          }

          return {
            success: true,
            deck: toDeckDetailResult(note, config)
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get deck'
          };
        }
      }
    }),

    /**
     * Create a new deck
     */
    create_deck: tool({
      description:
        'Create a new deck (filtered note view). Decks allow users to create saved ' +
        'queries with filters, columns, and sort settings. Supports multiple views per deck.',
      inputSchema: z.object({
        title: z.string().min(1).describe('Deck title'),
        views: z
          .array(viewSchema)
          .optional()
          .describe(
            'Optional views configuration. If not provided, creates a default empty view.'
          ),
        pageSize: z
          .number()
          .optional()
          .describe('Number of results per page (default: 25, options: 10, 25, 50, 100)')
      }),
      execute: async ({ title, views, pageSize }) => {
        try {
          // Build the deck config
          const config = createEmptyDeckConfig();

          if (views && views.length > 0) {
            config.views = views.map((v) => ({
              name: v.name,
              filters: v.filters.map((f) => ({
                field: f.field,
                operator: f.operator as FilterOperator | undefined,
                value: f.value
              })),
              columns: v.columns,
              sort: v.sort
                ? { field: v.sort.field, order: v.sort.order as 'asc' | 'desc' }
                : undefined
            }));
            config.activeView = 0;
          }

          if (pageSize) {
            config.pageSize = pageSize;
          }

          // Validate filter fields before creating
          if (views && views.length > 0) {
            const noteTypes = getNoteTypesDict();
            for (const view of views) {
              const validation = validateFilterFields(view.filters, noteTypes);
              if (!validation.valid) {
                return {
                  success: false,
                  error: `Invalid filters in view "${view.name}": ${validation.errors.join('; ')}`
                };
              }
            }
          }

          // Create the deck note with the config directly
          // (avoids timing issue with reactive state update)
          const deckId = createDeckNote(title, config);

          return {
            success: true,
            deckId,
            message: `Created deck "${title}" with ID ${deckId}`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create deck'
          };
        }
      }
    }),

    /**
     * Update an existing deck
     */
    update_deck: tool({
      description:
        'Update an existing deck. You can update the title, views, or page size. ' +
        'When updating views, the entire views array is replaced.',
      inputSchema: z.object({
        deckId: z.string().describe('The deck note ID to update'),
        title: z.string().optional().describe('New title (if updating)'),
        views: z
          .array(viewSchema)
          .optional()
          .describe('New views configuration (replaces all existing views)'),
        activeView: z.number().optional().describe('Index of the active view'),
        pageSize: z
          .number()
          .optional()
          .describe('New page size (options: 10, 25, 50, 100)')
      }),
      execute: async ({ deckId, title, views, activeView, pageSize }) => {
        try {
          const note = getNote(deckId);
          if (!note) {
            return { success: false, error: `Deck not found: ${deckId}` };
          }

          const updatedFields: string[] = [];

          // Update title if provided
          if (title !== undefined) {
            updateNote(deckId, { title });
            updatedFields.push('title');
          }

          // Update config if views, activeView, or pageSize provided
          if (views !== undefined || activeView !== undefined || pageSize !== undefined) {
            const config = getDeckConfig(deckId);
            if (!config) {
              return {
                success: false,
                error: 'No deck configuration found'
              };
            }

            if (views !== undefined) {
              // Validate filter fields before updating
              const noteTypes = getNoteTypesDict();
              for (const view of views) {
                const validation = validateFilterFields(view.filters, noteTypes);
                if (!validation.valid) {
                  return {
                    success: false,
                    error: `Invalid filters in view "${view.name}": ${validation.errors.join('; ')}`
                  };
                }
              }

              config.views = views.map((v) => ({
                name: v.name,
                filters: v.filters.map((f) => ({
                  field: f.field,
                  operator: f.operator as FilterOperator | undefined,
                  value: f.value
                })),
                columns: v.columns,
                sort: v.sort
                  ? { field: v.sort.field, order: v.sort.order as 'asc' | 'desc' }
                  : undefined
              }));
              updatedFields.push('views');
            }

            if (activeView !== undefined) {
              config.activeView = Math.max(
                0,
                Math.min(activeView, (config.views?.length ?? 1) - 1)
              );
              updatedFields.push('activeView');
            }

            if (pageSize !== undefined) {
              config.pageSize = pageSize;
              updatedFields.push('pageSize');
            }

            // Update the config directly in note.props
            updateDeckConfig(deckId, config);
          }

          if (updatedFields.length === 0) {
            return { success: false, error: 'No updates provided' };
          }

          return {
            success: true,
            message: `Updated deck ${deckId}`,
            updatedFields
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update deck'
          };
        }
      }
    }),

    /**
     * Archive (delete) a deck
     */
    archive_deck: tool({
      description:
        'Archive a deck (soft delete). The deck can be recovered later. ' +
        'Use this when the user wants to delete or remove a deck.',
      inputSchema: z.object({
        deckId: z.string().describe('The deck note ID to archive')
      }),
      execute: async ({ deckId }) => {
        try {
          const note = getNote(deckId);
          if (!note) {
            return { success: false, error: `Deck not found: ${deckId}` };
          }

          archiveNote(deckId);
          return {
            success: true,
            message: `Archived deck "${note.title || deckId}"`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to archive deck'
          };
        }
      }
    }),

    /**
     * Run a deck query and return results
     */
    run_deck_query: tool({
      description:
        "Execute a deck's query and return matching notes. This runs the deck's " +
        'active view filters against all notes and returns the results. ' +
        'Useful for previewing what notes match a deck configuration.',
      inputSchema: z.object({
        deckId: z.string().describe('The deck note ID to run'),
        viewIndex: z
          .number()
          .optional()
          .describe('View index to run (default: active view)'),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe('Offset for pagination (default: 0)'),
        limit: z
          .number()
          .optional()
          .default(DECK_LIMITS.QUERY_RESULT_DEFAULT)
          .describe(
            `Max results to return (default: ${DECK_LIMITS.QUERY_RESULT_DEFAULT}, max: ${DECK_LIMITS.QUERY_RESULT_MAX})`
          ),
        includeArchived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include archived notes in results')
      }),
      execute: async ({ deckId, viewIndex, offset, limit, includeArchived }) => {
        try {
          const note = getNote(deckId);
          if (!note) {
            return { success: false, error: `Deck not found: ${deckId}` };
          }

          const config = getDeckConfig(deckId);
          if (!config) {
            return {
              success: false,
              error: 'No deck configuration found'
            };
          }

          // Create a copy of the config for query execution to avoid modifying the original
          const queryConfig = { ...config };

          // Temporarily set active view if viewIndex provided
          if (viewIndex !== undefined && queryConfig.views) {
            queryConfig.activeView = Math.max(
              0,
              Math.min(viewIndex, queryConfig.views.length - 1)
            );
          }

          // Override page size with limit
          const effectiveLimit = Math.min(
            limit ?? DECK_LIMITS.QUERY_RESULT_DEFAULT,
            DECK_LIMITS.QUERY_RESULT_MAX
          );
          queryConfig.pageSize = effectiveLimit;

          // Get all notes and note types for the query
          const allNotes = getAllNotes();
          const noteTypes = getNoteTypesDict();

          // Run the query
          const result = runDeckQuery(queryConfig, allNotes, noteTypes, {
            offset: offset ?? 0,
            includeArchived: includeArchived ?? false
          });

          const activeView = getActiveView(queryConfig);

          return {
            success: true,
            deckTitle: note.title,
            viewName: activeView.name,
            notes: result.notes.map((n) => ({
              id: n.id,
              title: n.title,
              type: n.typeName,
              created: n.created,
              updated: n.updated,
              props: n.props
            })),
            count: result.notes.length,
            total: result.total,
            hasMore: result.hasMore,
            pagination: {
              offset: offset ?? 0,
              limit: effectiveLimit,
              nextOffset: result.hasMore ? (offset ?? 0) + effectiveLimit : undefined
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to run deck query'
          };
        }
      }
    })
  };
}
