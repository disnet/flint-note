/**
 * Review Tools for AI Agent
 *
 * MCP tools that enable the AI agent to manage review sessions,
 * fetch note content, and update review schedules during spaced repetition.
 */

import { Tool, tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';

export class ReviewTools {
  constructor(private noteService: NoteService | null) {}

  /**
   * Get tools for review session
   */
  getTools(): Record<string, Tool> | undefined {
    if (!this.noteService) {
      return undefined;
    }

    return {
      get_note_full: this.getNoteFullTool,
      get_linked_notes: this.getLinkedNotesTool,
      search_notes_by_tags: this.searchNotesByTagsTool,
      search_daily_notes: this.searchDailyNotesTool,
      complete_review: this.completeReviewTool,
      create_note_link: this.createNoteLinkTool
    };
  }

  /**
   * Tool: Get complete note content by ID
   * Used during review to fetch full note content
   */
  private getNoteFullTool = tool({
    description:
      'Retrieve the complete content of a note by its ID. Use this during review sessions to access the full note text that the user is reviewing. Returns the entire note content, metadata, and links.',
    inputSchema: z.object({
      noteId: z
        .string()
        .describe('The unique ID of the note to retrieve (e.g., "n-abc12345")')
    }),
    execute: async ({ noteId }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        const results = await flintApi.getNotes(currentVault.id, [noteId]);
        const result = results[0];

        if (!result || !result.success) {
          return {
            success: false,
            error: 'Note not found',
            noteId
          };
        }

        return {
          success: true,
          note: result.note
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  /**
   * Tool: Get notes that link to/from a note
   */
  private getLinkedNotesTool = tool({
    description:
      'Get notes that are linked to or from a specific note. Use this to understand the knowledge graph context around a note being reviewed. Returns both outbound links (notes this note references) and inbound links (notes that reference this note).',
    inputSchema: z.object({
      noteId: z.string().describe('The note ID to get links for'),
      includeContent: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Whether to include full content of linked notes (default: false, only titles)'
        )
    }),
    execute: async ({ noteId, includeContent }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        // Get outbound and inbound links
        const outboundLinks = await flintApi.getNoteLinks(currentVault.id, noteId);

        const backlinks = await flintApi.getBacklinks(currentVault.id, noteId);

        // If includeContent, fetch full note details
        let outboundNotes = outboundLinks.outgoing_internal;
        let inboundNotes = backlinks.results;

        if (
          includeContent &&
          (outboundLinks.outgoing_internal.length > 0 || backlinks.results.length > 0)
        ) {
          const allLinkIds = [
            ...outboundLinks.outgoing_internal
              .map((l) => l.target_note_id)
              .filter((id): id is string => !!id),
            ...backlinks.results.map((l) => l.source_note_id)
          ];

          const uniqueIds = [...new Set(allLinkIds)];
          const noteResults = await flintApi.getNotes(currentVault.id, uniqueIds);

          const notesMap = new Map(
            noteResults
              .filter((r) => r.success && r.note)
              .map((r) => [r.note!.id, r.note!])
          );

          // Enrich link objects with note content
          outboundNotes = outboundLinks.outgoing_internal.map((link) => ({
            ...link,
            note: link.target_note_id ? notesMap.get(link.target_note_id) : undefined
          }));

          inboundNotes = backlinks.results.map((link) => ({
            ...link,
            note: notesMap.get(link.source_note_id)
          }));
        }

        return {
          success: true,
          outbound: outboundNotes,
          inbound: inboundNotes,
          outboundCount: outboundLinks.outgoing_internal.length,
          inboundCount: backlinks.results.length
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  /**
   * Tool: Search notes by tags
   */
  private searchNotesByTagsTool = tool({
    description:
      'Find notes that share specific tags. Use this during review to discover related notes with similar topics or themes. Helps identify connections in the knowledge graph.',
    inputSchema: z.object({
      tags: z
        .array(z.string())
        .describe('Array of tag names to search for (e.g., ["learning", "memory"])'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of notes to return')
    }),
    execute: async ({ tags, limit }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        // Search for notes with these tags using metadata query
        const searchResults = await flintApi.searchNotesAdvanced({
          vault_id: currentVault.id,
          metadata_filters: tags.map((tag) => ({
            key: 'tags',
            value: `%${tag}%`,
            operator: 'LIKE'
          })),
          limit
        });

        // Return only metadata to avoid bloating context
        const noteSummaries = searchResults.map((note) => ({
          id: note.id,
          title: note.title,
          type: note.type,
          created: note.created,
          modified: note.modified,
          contentPreview:
            typeof note.content === 'string' ? note.content.substring(0, 100) + '...' : ''
        }));

        return {
          success: true,
          notes: noteSummaries,
          count: noteSummaries.length
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  /**
   * Tool: Search recent daily notes
   */
  private searchDailyNotesTool = tool({
    description:
      "Search recent daily notes to understand what the user has been working on. Use this to generate application-based review prompts that connect concepts to the user's current projects and activities.",
    inputSchema: z.object({
      daysBack: z
        .number()
        .optional()
        .default(7)
        .describe('How many days back to search (default: 7)'),
      query: z.string().optional().describe('Optional search term to filter daily notes')
    }),
    execute: async ({ daysBack, query }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        // Get daily notes in date range
        const allNotes = await flintApi.listNotes({
          vaultId: currentVault.id,
          typeName: 'daily',
          limit: daysBack + 5 // Add buffer
        });

        // Filter by date range
        const filteredNotes = allNotes.filter((note) => {
          const noteDate = new Date(note.created);
          return noteDate >= startDate && noteDate <= endDate;
        });

        // If query provided, filter by content
        let results = filteredNotes;
        if (query) {
          const searchResults = await flintApi.searchNotesByText({
            query,
            typeFilter: 'daily',
            limit: daysBack * 2,
            vaultId: currentVault.id
          });

          const searchIds = new Set(searchResults.map((r) => r.id));
          results = filteredNotes.filter((note) => searchIds.has(note.id));
        }

        // Return only metadata to avoid bloating context
        // Note: NoteListItem doesn't include content, only metadata
        const dailySummaries = results.map((note) => ({
          id: note.id,
          title: note.title,
          date: note.created.split('T')[0],
          type: note.type
        }));

        return {
          success: true,
          dailyNotes: dailySummaries,
          count: dailySummaries.length,
          dateRange: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  /**
   * Tool: Mark a review as complete
   */
  private completeReviewTool = tool({
    description:
      'Mark a note review as complete with pass/fail outcome. This updates the review schedule: passing moves the next review to 7 days from now, failing schedules it for tomorrow. Use this after the user has responded to the review prompt and you have provided feedback.',
    inputSchema: z.object({
      noteId: z.string().describe('The note ID that was reviewed'),
      passed: z
        .boolean()
        .describe(
          'Whether the user passed the review (true) or failed/struggled (false)'
        ),
      userResponse: z
        .string()
        .optional()
        .describe("The user's written response to the review prompt (stored for history)")
    }),
    execute: async ({ noteId, passed, userResponse }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        const result = await flintApi.completeReview({
          noteId,
          vaultId: currentVault.id,
          passed,
          userResponse
        });

        return {
          success: true,
          nextReviewDate: result.nextReviewDate,
          reviewCount: result.reviewCount,
          outcome: passed ? 'passed' : 'failed',
          message: `Review completed. Next review: ${result.nextReviewDate} (${passed ? '7 days' : 'tomorrow'})`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  /**
   * Tool: Create a link between two notes
   */
  private createNoteLinkTool = tool({
    description:
      "Create a link between two notes. Use this when you identify a connection during review that the user should add to their knowledge graph. This adds a wikilink to the source note's content.",
    inputSchema: z.object({
      fromNoteId: z
        .string()
        .describe('The source note ID (where the link will be added)'),
      toNoteId: z.string().describe('The target note ID (what will be linked to)'),
      context: z
        .string()
        .optional()
        .describe('Optional context explaining why this link should be created')
    }),
    execute: async ({ fromNoteId, toNoteId, context }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'No active vault'
          };
        }

        // Get both notes to create proper link
        const notes = await flintApi.getNotes(currentVault.id, [fromNoteId, toNoteId]);
        const fromNote = notes.find((n) => n.note?.id === fromNoteId)?.note;
        const toNote = notes.find((n) => n.note?.id === toNoteId)?.note;

        if (!fromNote || !toNote) {
          return {
            success: false,
            error: 'One or both notes not found'
          };
        }

        // Add wikilink to source note content
        const linkText = `[[${toNoteId}|${toNote.title}]]`;
        const contextText = context ? ` (${context})` : '';
        const newContent = `${fromNote.content}\n\n${linkText}${contextText}`;

        await flintApi.updateNote({
          identifier: fromNoteId,
          content: newContent,
          contentHash: fromNote.content_hash,
          vaultId: currentVault.id
        });

        return {
          success: true,
          message: `Link created from "${fromNote.title}" to "${toNote.title}"`,
          linkText
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });
}
