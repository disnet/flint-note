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
  getNoteContent
} from './state.svelte';
import type { NoteMetadata } from './types';

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
 * Create all note tools for the AI chat agent
 */
export function createNoteTools(): Record<string, Tool> {
  return {
    /**
     * Search notes by query string
     */
    search_notes: tool({
      description:
        'Search notes by query string. Searches note titles and content. Returns matching notes sorted by relevance.',
      inputSchema: z.object({
        query: z.string().describe('Search query to find in note titles and content'),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of results to return (default: 10)')
      }),
      execute: async ({ query, limit }) => {
        try {
          const results = searchNotes(query);
          const limitedResults = results.slice(0, limit);
          // Load content for each note
          const noteResults = await Promise.all(
            limitedResults.map(async (n) => {
              const content = await getNoteContent(n.id);
              return toNoteResultFromMetadata(n, content);
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
        'Get a specific note by its ID. Returns the full note content. Use this when you need to read the complete content of a note.',
      inputSchema: z.object({
        noteId: z
          .string()
          .describe('The note ID (format: n-xxxxxxxx or daily-YYYY-MM-DD)')
      }),
      execute: async ({ noteId }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }
          // Load content from separate document
          const content = await getNoteContent(noteId);
          // Return full content for get_note
          const noteType = getNoteType(note.type);
          // Build result object, excluding undefined values (Automerge doesn't allow undefined)
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
            note: noteResult
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
     * List notes (recent or all)
     */
    list_notes: tool({
      description:
        'List notes in the vault. Returns notes sorted by last updated time (newest first). Use this to see what notes exist.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(20)
          .describe('Maximum number of notes to return (default: 20)')
      }),
      execute: async ({ limit }) => {
        try {
          const notes = getNotes();
          const limitedNotes = notes.slice(0, limit);
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
        noteId: z.string().describe('The note ID to find backlinks for')
      }),
      execute: async ({ noteId }) => {
        try {
          const note = getNote(noteId);
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }

          const backlinks = await getBacklinks(noteId);
          // Load content for each backlink note
          const backlinkResults = await Promise.all(
            backlinks.map(async (bl) => {
              const content = await getNoteContent(bl.note.id);
              return {
                note: toNoteResultFromMetadata(bl.note, content, 200),
                contexts: bl.contexts.map((ctx) => ({
                  // Join context lines into readable text
                  text: ctx.lines.map((l) => l.text).join('\n')
                }))
              };
            })
          );
          return {
            success: true,
            noteTitle: note.title,
            backlinks: backlinkResults,
            count: backlinks.length
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
