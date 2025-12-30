/**
 * AI SDK Tool Definitions for Note Operations
 *
 * These tools allow the AI chat agent to search, read, create, update,
 * and archive notes stored in Automerge. They execute directly in the
 * renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import {
  searchNotes,
  getNote,
  getNotes,
  createNote,
  updateNote,
  archiveNote,
  getBacklinks,
  getNoteType,
  getNoteContent,
  filterNotes
} from './state.svelte';
import type { NoteMetadata } from './types';

// Token limits for safe context management (matching EPUB/PDF pattern)
const TOKEN_LIMITS = {
  NOTE_CONTENT_MAX: 100000, // ~350KB - hard limit for get_note
  NOTE_CONTENT_DEFAULT: 50000, // ~175KB - default when no limit specified
  LIST_HARD_MAX: 100, // Hard max for list operations
  BACKLINKS_HARD_MAX: 50 // Hard max for backlinks
};

// Estimate tokens from text (roughly 1 token per 3.5 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Simplified note result for AI context (avoids sending too much data)
 */
interface NoteResult {
  id: string;
  title: string;
  content: string;
  type: string;
  typeName?: string;
  created: string;
  updated: string;
}

/**
 * Search result with context snippets around matches
 */
interface SearchNoteResult {
  id: string;
  title: string;
  type: string;
  typeName?: string;
  created: string;
  updated: string;
  snippets: string[]; // Context snippets around matches
  matchCount: number;
}

/**
 * Extract context snippets around query matches in content
 * Returns array of snippets with surrounding context
 */
function extractSearchSnippets(
  content: string,
  query: string,
  maxSnippets = 3,
  contextChars = 100
): { snippets: string[]; matchCount: number } {
  if (!query || !query.trim()) {
    // No query - return first N chars as preview
    const preview = content.slice(0, contextChars * 2);
    return {
      snippets: [preview + (content.length > contextChars * 2 ? '...' : '')],
      matchCount: 0
    };
  }

  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  const snippets: string[] = [];
  let matchCount = 0;
  let pos = 0;

  // Find all matches and extract snippets
  while ((pos = contentLower.indexOf(queryLower, pos)) !== -1) {
    matchCount++;

    if (snippets.length < maxSnippets) {
      const start = Math.max(0, pos - contextChars);
      const end = Math.min(content.length, pos + query.length + contextChars);

      let snippet = '';
      if (start > 0) snippet += '...';
      snippet += content.slice(start, end);
      if (end < content.length) snippet += '...';

      snippets.push(snippet);
    }

    pos += query.length;
  }

  // If no matches found, return first N chars as preview
  if (snippets.length === 0) {
    const preview = content.slice(0, contextChars * 2);
    return {
      snippets: [preview + (content.length > contextChars * 2 ? '...' : '')],
      matchCount: 0
    };
  }

  return { snippets, matchCount };
}

/**
 * Convert a NoteMetadata + content to a simplified result for the AI
 * Truncates content to avoid overwhelming the context
 */
function toNoteResultFromMetadata(
  note: NoteMetadata,
  content: string,
  maxContentLength = 500
): NoteResult {
  const noteType = getNoteType(note.type);
  const result: NoteResult = {
    id: note.id,
    title: note.title,
    content:
      content.length > maxContentLength
        ? content.slice(0, maxContentLength) + '...'
        : content,
    type: note.type,
    created: note.created,
    updated: note.updated
  };
  if (noteType?.name !== undefined) {
    result.typeName = noteType.name;
  }
  return result;
}

/**
 * Convert a NoteMetadata + content to a search result with snippets
 */
function toSearchNoteResult(
  note: NoteMetadata,
  content: string,
  query: string
): SearchNoteResult {
  const noteType = getNoteType(note.type);
  const { snippets, matchCount } = extractSearchSnippets(content, query);

  const result: SearchNoteResult = {
    id: note.id,
    title: note.title,
    type: note.type,
    created: note.created,
    updated: note.updated,
    snippets,
    matchCount
  };
  if (noteType?.name !== undefined) {
    result.typeName = noteType.name;
  }
  return result;
}

/**
 * Create all note tools for the AI chat agent
 */
export function createNoteTools(): Record<string, Tool> {
  return {
    /**
     * Search and filter notes
     */
    search_notes: tool({
      description:
        'Search and filter notes. Searches note titles by query string. ' +
        'Optionally filter by type, date ranges, and custom properties. ' +
        'Returns matching notes with context snippets around query matches.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Search query to find in note titles. Optional if using filters.'),
        filters: z
          .array(
            z.object({
              field: z
                .string()
                .describe(
                  'Field to filter on. System fields: type (note type name), title, created, updated, archived. ' +
                    'Custom props: use the property name directly (e.g., "status", "priority").'
                ),
              operator: z
                .enum([
                  '=',
                  '!=',
                  '>',
                  '<',
                  '>=',
                  '<=',
                  'LIKE',
                  'IN',
                  'NOT IN',
                  'BETWEEN'
                ])
                .optional()
                .default('=')
                .describe(
                  'Comparison operator (default: =). Use >, <, >=, <= for dates (ISO format) and numbers. ' +
                    'Use LIKE with % for pattern matching. Use IN/NOT IN for multiple values.'
                ),
              value: z
                .union([z.string(), z.array(z.string())])
                .describe(
                  'Value to compare. For dates use ISO format (YYYY-MM-DD). ' +
                    'For IN/NOT IN/BETWEEN, use an array of values.'
                )
            })
          )
          .optional()
          .describe('Filter conditions to apply'),
        logic: z
          .enum(['AND', 'OR'])
          .optional()
          .default('AND')
          .describe(
            'How to combine multiple filters: AND (all must match) or OR (any can match)'
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe(
            `Maximum number of results to return (default: 10, max: ${TOKEN_LIMITS.LIST_HARD_MAX})`
          )
      }),
      execute: async ({ query, filters, logic, limit }) => {
        try {
          // Enforce hard limit
          const effectiveLimit = Math.min(limit ?? 10, TOKEN_LIMITS.LIST_HARD_MAX);

          let results: NoteMetadata[];

          // Start with search results if query provided, otherwise all non-archived notes
          if (query && query.trim()) {
            results = searchNotes(query);
          } else {
            results = getNotes();
          }

          // Apply filters if provided
          if (filters && filters.length > 0) {
            results = filterNotes(results, { filters, logic });
          }

          const limitedResults = results.slice(0, effectiveLimit);

          // Load content for each note and extract search snippets
          const noteResults = await Promise.all(
            limitedResults.map(async (n) => {
              const content = await getNoteContent(n.id);
              return toSearchNoteResult(n, content, query ?? '');
            })
          );

          return {
            success: true,
            notes: noteResults,
            count: limitedResults.length,
            totalMatches: results.length
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Search failed'
          };
        }
      }
    }),

    /**
     * Get a specific note by ID
     */
    get_note: tool({
      description:
        'Get a specific note by its ID. Returns the note content. For large notes, use offset parameter to paginate through content.',
      inputSchema: z.object({
        noteId: z
          .string()
          .describe('The note ID (format: n-xxxxxxxx or daily-YYYY-MM-DD)'),
        maxTokens: z
          .number()
          .optional()
          .default(TOKEN_LIMITS.NOTE_CONTENT_DEFAULT)
          .describe(
            `Max tokens to return (default: ${TOKEN_LIMITS.NOTE_CONTENT_DEFAULT}, max: ${TOKEN_LIMITS.NOTE_CONTENT_MAX})`
          ),
        offset: z
          .number()
          .optional()
          .describe(
            'Character offset for large notes (0-indexed). Use when content exceeds limit.'
          )
      }),
      execute: async ({ noteId, maxTokens, offset }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }

          // Enforce hard limit on maxTokens
          const effectiveMaxTokens = Math.min(
            maxTokens ?? TOKEN_LIMITS.NOTE_CONTENT_DEFAULT,
            TOKEN_LIMITS.NOTE_CONTENT_MAX
          );

          // Load content from separate document
          const fullContent = await getNoteContent(noteId);
          const totalChars = fullContent.length;
          const totalTokensEstimate = estimateTokens(fullContent);

          // Check if content exceeds limit and no offset provided
          if (totalTokensEstimate > effectiveMaxTokens && offset === undefined) {
            return {
              success: false,
              error: `Note content (${totalTokensEstimate} tokens) exceeds limit (${effectiveMaxTokens}). Use offset parameter to paginate.`,
              noteId,
              contentInfo: {
                totalChars,
                totalTokensEstimate,
                maxTokensAllowed: TOKEN_LIMITS.NOTE_CONTENT_MAX
              }
            };
          }

          // Calculate content slice based on offset
          const startOffset = offset ?? 0;
          const maxChars = Math.floor(effectiveMaxTokens * 3.5);
          const content = fullContent.slice(startOffset, startOffset + maxChars);
          const returnedChars = content.length;
          const truncated = startOffset + returnedChars < totalChars;

          // Build result object
          const noteType = getNoteType(note.type);
          const noteResult: Record<string, unknown> = {
            id: note.id,
            title: note.title,
            content: content,
            type: note.type,
            created: note.created,
            updated: note.updated,
            archived: note.archived
          };
          if (noteType?.name !== undefined) {
            noteResult.typeName = noteType.name;
          }
          if (note.props !== undefined) {
            noteResult.props = note.props;
          }

          return {
            success: true,
            note: noteResult,
            contentInfo: {
              totalChars,
              totalTokensEstimate,
              returnedChars,
              offset: startOffset,
              truncated,
              nextOffset: truncated ? startOffset + returnedChars : undefined
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get note'
          };
        }
      }
    }),

    /**
     * List notes with optional filtering
     */
    list_notes: tool({
      description:
        'List notes in the vault with optional filtering. Returns notes sorted by last updated time (newest first). ' +
        'Use this to browse notes by type, date, or custom properties without requiring a search query.',
      inputSchema: z.object({
        filters: z
          .array(
            z.object({
              field: z
                .string()
                .describe(
                  'Field to filter on. System fields: type (note type name), title, created, updated, archived. ' +
                    'Custom props: use the property name directly (e.g., "status", "priority").'
                ),
              operator: z
                .enum([
                  '=',
                  '!=',
                  '>',
                  '<',
                  '>=',
                  '<=',
                  'LIKE',
                  'IN',
                  'NOT IN',
                  'BETWEEN'
                ])
                .optional()
                .default('=')
                .describe(
                  'Comparison operator (default: =). Use >, <, >=, <= for dates (ISO format) and numbers. ' +
                    'Use LIKE with % for pattern matching. Use IN/NOT IN for multiple values.'
                ),
              value: z
                .union([z.string(), z.array(z.string())])
                .describe(
                  'Value to compare. For dates use ISO format (YYYY-MM-DD). ' +
                    'For IN/NOT IN/BETWEEN, use an array of values.'
                )
            })
          )
          .optional()
          .describe('Filter conditions to apply'),
        logic: z
          .enum(['AND', 'OR'])
          .optional()
          .default('AND')
          .describe(
            'How to combine multiple filters: AND (all must match) or OR (any can match)'
          ),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe(
            `Maximum number of notes to return (default: 20, max: ${TOKEN_LIMITS.LIST_HARD_MAX})`
          )
      }),
      execute: async ({ filters, logic, limit }) => {
        try {
          // Enforce hard limit
          const effectiveLimit = Math.min(limit ?? 20, TOKEN_LIMITS.LIST_HARD_MAX);

          let notes = getNotes();

          // Apply filters if provided
          if (filters && filters.length > 0) {
            notes = filterNotes(notes, { filters, logic });
          }

          const limitedNotes = notes.slice(0, effectiveLimit);

          // Load content for each note
          const noteResults = await Promise.all(
            limitedNotes.map(async (n) => {
              const content = await getNoteContent(n.id);
              return toNoteResultFromMetadata(n, content, 200); // Shorter content for list
            })
          );

          return {
            success: true,
            notes: noteResults,
            count: limitedNotes.length,
            totalNotes: notes.length
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list notes'
          };
        }
      }
    }),

    /**
     * Create a new note
     */
    create_note: tool({
      description:
        'Create a new note in the vault. Returns the ID of the created note. The note will be added to the current workspace.',
      inputSchema: z.object({
        title: z.string().optional().describe('Note title (can be empty)'),
        content: z.string().optional().describe('Note content in markdown format'),
        type: z
          .string()
          .optional()
          .describe(
            'Note type ID (default: type-default). Use type-daily for daily notes.'
          )
      }),
      execute: async ({ title, content, type }) => {
        try {
          const noteId = await createNote({ title, content, type });
          return {
            success: true,
            noteId,
            message: `Created note "${title || 'Untitled'}" with ID ${noteId}`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create note'
          };
        }
      }
    }),

    /**
     * Update an existing note
     */
    update_note: tool({
      description:
        'Update an existing note. You can update the title, content, or both. Only provide the fields you want to change.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID to update'),
        title: z.string().optional().describe('New title (if updating)'),
        content: z.string().optional().describe('New content (if updating)')
      }),
      execute: async ({ noteId, title, content }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }

          const updates: { title?: string; content?: string } = {};
          if (title !== undefined) updates.title = title;
          if (content !== undefined) updates.content = content;

          if (Object.keys(updates).length === 0) {
            return { success: false, error: 'No updates provided' };
          }

          updateNote(noteId, updates);
          return {
            success: true,
            message: `Updated note ${noteId}`,
            updatedFields: Object.keys(updates)
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update note'
          };
        }
      }
    }),

    /**
     * Archive (soft delete) a note
     */
    archive_note: tool({
      description:
        'Archive a note (soft delete). The note can be recovered later. Use this when the user wants to delete or remove a note.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID to archive')
      }),
      execute: async ({ noteId }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }

          archiveNote(noteId);
          return {
            success: true,
            message: `Archived note "${note.title || noteId}"`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to archive note'
          };
        }
      }
    }),

    /**
     * Get notes that link to a specific note (backlinks)
     */
    get_backlinks: tool({
      description:
        'Get notes that link to a specific note (backlinks). This shows how notes are connected. Returns the linking notes with context around each link.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID to find backlinks for'),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe(
            `Max backlinks to return (default: 20, max: ${TOKEN_LIMITS.BACKLINKS_HARD_MAX})`
          ),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe('Number of backlinks to skip (for pagination)')
      }),
      execute: async ({ noteId, limit, offset }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }

          // Enforce hard limit
          const effectiveLimit = Math.min(limit ?? 20, TOKEN_LIMITS.BACKLINKS_HARD_MAX);
          const effectiveOffset = offset ?? 0;

          const allBacklinks = await getBacklinks(noteId);
          const totalBacklinks = allBacklinks.length;

          // Apply pagination
          const paginatedBacklinks = allBacklinks.slice(
            effectiveOffset,
            effectiveOffset + effectiveLimit
          );

          // Load content for each backlink note
          const backlinkResults = await Promise.all(
            paginatedBacklinks.map(async (bl) => {
              const content = await getNoteContent(bl.note.id);
              return {
                note: toNoteResultFromMetadata(bl.note, content, 200),
                occurrences: bl.occurrences.map((occ) => ({
                  lineNumber: occ.lineNumber,
                  text: occ.lineText
                }))
              };
            })
          );

          const hasMore = effectiveOffset + paginatedBacklinks.length < totalBacklinks;

          return {
            success: true,
            noteTitle: note.title,
            backlinks: backlinkResults,
            count: backlinkResults.length,
            totalBacklinks,
            pagination: {
              offset: effectiveOffset,
              limit: effectiveLimit,
              hasMore,
              nextOffset: hasMore ? effectiveOffset + effectiveLimit : undefined
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get backlinks'
          };
        }
      }
    })
  };
}
