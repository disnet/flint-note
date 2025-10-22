import { Tool, tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';
import { ContentHashMismatchError } from '../server/utils/content-hash.js';
import { publishNoteEvent } from './note-events';
import { TodoPlanService } from './todo-plan-service';
import { WorkflowService } from './workflow-service';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  deleteWorkflowSchema,
  listWorkflowsSchema,
  getWorkflowSchema,
  completeWorkflowSchema,
  addWorkflowMaterialSchema,
  removeWorkflowMaterialSchema
} from '../server/types/workflow-schemas.js';

export class ToolService {
  private todoPlanService: TodoPlanService | null = null;
  private workflowService: WorkflowService | null = null;
  private currentConversationId: string | null = null;

  constructor(
    private noteService: NoteService | null,
    _workspaceRoot?: string,
    todoPlanService?: TodoPlanService,
    workflowService?: WorkflowService
  ) {
    this.todoPlanService = todoPlanService || null;
    this.workflowService = workflowService || null;
  }

  setCurrentConversationId(conversationId: string): void {
    this.currentConversationId = conversationId;
  }

  getTools(): Record<string, Tool> | undefined {
    if (!this.noteService) {
      return undefined;
    }

    const tools: Record<string, Tool> = {
      // Basic CRUD tools
      get_note: this.getNoteTool,
      create_note: this.createNoteTool,
      update_note: this.updateNoteTool,
      search_notes: this.searchNotesTool,
      get_vault_info: this.getVaultInfoTool,
      delete_note: this.deleteNoteTool,
      // Links API tools
      get_note_links: this.getNoteLinksTool,
      get_backlinks: this.getBacklinksTool,
      find_broken_links: this.findBrokenLinksTool,
      search_by_links: this.searchByLinksTool,
      // Note type management tools
      get_note_type_details: this.getNoteTypeDetailsTool,
      create_note_type: this.createNoteTypeTool,
      update_note_type: this.updateNoteTypeTool,
      delete_note_type: this.deleteNoteTypeTool
    };

    // Add todo plan management tool if available
    if (this.todoPlanService) {
      tools.manage_todos = this.manageTodosTool;
    }

    // Add workflow management tools if available
    if (this.workflowService && this.workflowService.isReady()) {
      tools.create_workflow = this.createWorkflowTool;
      tools.update_workflow = this.updateWorkflowTool;
      tools.delete_workflow = this.deleteWorkflowTool;
      tools.list_workflows = this.listWorkflowsTool;
      tools.get_workflow = this.getWorkflowTool;
      tools.complete_workflow = this.completeWorkflowTool;
      tools.add_workflow_material = this.addWorkflowMaterialTool;
      tools.remove_workflow_material = this.removeWorkflowMaterialTool;
    }

    return tools;
  }

  // Basic CRUD Tools
  private getNoteTool = tool({
    description:
      'Retrieve one or more notes by their IDs or identifiers. Efficient for bulk retrieval. Use this when you know the specific note IDs or identifiers (e.g., "type/title" format). For finding notes by content or criteria, use search_notes instead. Returns up to 500 lines of content by default (max 2000), with pagination support for longer notes.',
    inputSchema: z.object({
      ids: z
        .array(z.string())
        .describe(
          'Array of note IDs or identifiers. Examples: ["note-id-123"], ["meeting/Weekly Standup"], ["project/Q4 Planning", "daily/2025-01-15"]'
        ),
      maxLines: z
        .number()
        .optional()
        .describe(
          'Maximum number of content lines to return per note (default: 500, max: 2000). Useful for limiting large note content.'
        ),
      offset: z
        .number()
        .optional()
        .describe(
          'Line offset for content pagination (default: 0). Use with maxLines to paginate through large notes.'
        )
    }),
    execute: async ({ ids, maxLines, offset }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      if (ids.length === 0) {
        return {
          success: true,
          data: [],
          message: 'No note IDs provided'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const contentLimit =
          maxLines !== undefined || offset !== undefined
            ? { maxLines, offset }
            : undefined;
        const results = await flintApi.getNotes(currentVault.id, ids, contentLimit);
        const successCount = results.filter((r) => r.success).length;

        return {
          success: true,
          data: results,
          message: `Retrieved ${successCount} of ${ids.length} note(s)`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to get notes: ${errorMessage}`
        };
      }
    }
  });

  private createNoteTool = tool({
    description:
      'Create a new note with a specified type. Before creating a note, consider using get_note_type_details to understand the note type requirements and agent instructions. Returns the created note including its ID for future reference.',
    inputSchema: z.object({
      title: z.string().describe('Note title (must be unique within the note type)'),
      content: z
        .string()
        .optional()
        .describe('Note content in markdown format (optional, defaults to empty)'),
      noteType: z
        .string()
        .describe(
          'Note type (required). Common types: meeting, project, daily, task. Use get_note_type_details to see available types and their requirements.'
        ),
      parentId: z
        .string()
        .optional()
        .describe(
          'Parent note ID to establish hierarchy (optional). The new note will become a subnote of this parent.'
        ),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Additional metadata fields (optional). Should match the note type metadata schema. Use get_note_type_details to see required/optional fields.'
        )
    }),
    execute: async ({ title, content = '', noteType, parentId, metadata = {} }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        // Note type is now required, so use it directly

        const noteInfo = await flintApi.createNote({
          type: noteType,
          title,
          content,
          metadata: metadata as Parameters<typeof flintApi.createNote>[0]['metadata'], // Cast to satisfy type checking for user-provided metadata
          vaultId: currentVault.id
        });

        // Get the full note object
        const note = await flintApi.getNote(currentVault.id, noteInfo.id);

        // If parentId is specified, add this note as a subnote
        if (parentId) {
          try {
            await flintApi.addSubnote({
              parent_id: parentId,
              child_id: `${noteType}/${title}`,
              vault_id: currentVault.id
            });
          } catch (hierarchyError) {
            console.warn('Failed to add hierarchy relationship:', hierarchyError);
            // Don't fail the creation, just warn
          }
        }

        // Publish note.created event to renderer
        publishNoteEvent({
          type: 'note.created',
          note: {
            id: noteInfo.id,
            type: noteType,
            filename: note.filename,
            title: note.title,
            created: note.created,
            modified: note.updated,
            size: note.size || 0,
            tags: note.metadata.tags || [],
            path: note.path
          }
        });

        // Construct the canonical link identifier (type/filename-without-extension)
        const filenameWithoutExt = note.filename.replace(/\.md$/, '');
        const linkId = `${noteType}/${filenameWithoutExt}`;

        return {
          success: true,
          data: {
            ...note,
            linkId // Add canonical reference format for creating wikilinks
          },
          message: `Created note: ${note.title}. Reference as [[${linkId}]]`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('Invalid title') || errorMessage.includes('title')) {
          return {
            success: false,
            error: 'INVALID_TITLE',
            message: `Invalid title: ${errorMessage}`
          };
        }

        if (errorMessage.includes('not found') && parentId) {
          return {
            success: false,
            error: 'PARENT_NOT_FOUND',
            message: `Parent note not found: ${parentId}`
          };
        }

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to create note: ${errorMessage}`
        };
      }
    }
  });

  private updateNoteTool = tool({
    description:
      'Update an existing note. Content hash is required when updating content, but optional for metadata-only or title-only updates.',
    inputSchema: z.object({
      id: z.string().describe('Note ID or identifier'),
      contentHash: z
        .string()
        .optional()
        .describe(
          'Content hash from current note (required only when updating content, optional for metadata/title-only updates)'
        ),
      title: z.string().optional().describe('New title (optional)'),
      content: z.string().optional().describe('New content (optional)'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('New metadata (optional)')
    }),
    execute: async ({ id, contentHash, title, content, metadata }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        // Validate contentHash requirement: required when updating content
        if (content !== undefined && !contentHash) {
          return {
            success: false,
            error: 'CONTENT_HASH_REQUIRED',
            message:
              'Content hash is required when updating note content. Retrieve the note first to get its current contentHash.'
          };
        }

        // Get current note for various operations
        let currentNote;
        try {
          currentNote = await flintApi.getNote(currentVault.id, id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('not found') ||
            errorMessage.includes('does not exist')
          ) {
            return {
              success: false,
              error: 'NOTE_NOT_FOUND',
              message: `Note not found: ${id}`
            };
          }
          throw error; // Re-throw if it's a different error
        }

        // Determine final content (use provided or keep current)
        const finalContent = content !== undefined ? content : currentNote.content;

        // Determine final contentHash (use provided or current)
        const finalContentHash = contentHash || currentNote.contentHash;

        // Prepare updates
        const updates: {
          identifier: string;
          content: string;
          contentHash: string;
          vaultId: string;
          metadata?: Record<string, unknown>;
        } = {
          identifier: id,
          content: finalContent,
          contentHash: finalContentHash,
          vaultId: currentVault.id
        };

        // Update metadata if provided
        if (metadata !== undefined) {
          // Merge with existing metadata, excluding protected fields
          const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            id: _id,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            type: _type,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            title: _metaTitle,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filename: _filename,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            created: _created,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updated: _updated,
            ...userMetadata
          } = currentNote.metadata;
          updates.metadata = { ...userMetadata, ...metadata };
        }

        // Handle title change if provided
        if (title !== undefined) {
          if (title !== currentNote.title) {
            const renameResult = await flintApi.renameNote({
              noteId: id,
              newTitle: title,
              contentHash: finalContentHash,
              vault_id: currentVault.id
            });

            if (!renameResult.success) {
              return {
                success: false,
                error: 'RENAME_FAILED',
                message: 'Failed to rename note'
              };
            }

            // Update identifier for subsequent operations
            updates.identifier = renameResult.new_id || id;
          }
        }

        await flintApi.updateNote(updates as Parameters<typeof flintApi.updateNote>[0]); // Cast to satisfy type checking for user-provided metadata

        // Get updated note to return
        const updatedNote = await flintApi.getNote(currentVault.id, updates.identifier);

        // Publish note.renamed event AFTER getting the updated note (if title was changed)
        if (title !== undefined && title !== currentNote.title) {
          publishNoteEvent({
            type: 'note.renamed',
            oldId: id,
            newId: updatedNote.id,
            title: updatedNote.title,
            filename: updatedNote.filename
          });
        }

        // Publish note.updated event with full metadata
        publishNoteEvent({
          type: 'note.updated',
          noteId: updates.identifier,
          updates: {
            title: updatedNote.title,
            filename: updatedNote.filename,
            modified: updatedNote.updated
          }
        });

        return {
          success: true,
          data: updatedNote,
          message: `Updated note: ${updatedNote.title}`
        };
      } catch (error) {
        if (error instanceof ContentHashMismatchError) {
          return {
            success: false,
            error: 'CONTENT_HASH_MISMATCH',
            message: error.message
          };
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist')
        ) {
          return {
            success: false,
            error: 'NOTE_NOT_FOUND',
            message: `Note not found: ${id}`
          };
        }

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to update note: ${errorMessage}`
        };
      }
    }
  });

  private searchNotesTool = tool({
    description:
      'Search notes by title and content, or list all notes with filtering options. Returns simplified results (id, title, snippet) for search queries to avoid overwhelming context. Use get_note with specific IDs to retrieve full note content when needed. Supports pagination with offset parameter.',
    inputSchema: z.object({
      query: z.string().optional().describe('Search query (empty for listing all notes)'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of results (default: 20, max: 100)'),
      offset: z
        .number()
        .optional()
        .describe(
          'Number of results to skip for pagination (default: 0). Use to get the next page of results (e.g., offset=20 with limit=20 gets results 21-40)'
        ),
      noteType: z.string().optional().describe('Filter by note type (optional)'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter notes containing any of these tags (optional)'),
      dateRange: z
        .object({
          start: z.string().describe('Start date (ISO format: YYYY-MM-DD)'),
          end: z.string().describe('End date (ISO format: YYYY-MM-DD)')
        })
        .optional()
        .describe('Filter by creation date range (optional)'),
      sortBy: z
        .enum(['created', 'updated', 'title', 'relevance'])
        .optional()
        .default('relevance')
        .describe(
          'Sort order (default: relevance for searches, created for listings). Use "relevance" for search queries, "created"/"updated"/"title" for sorting lists.'
        )
    }),
    execute: async ({
      query,
      limit = 20,
      offset,
      noteType,
      tags,
      dateRange,
      sortBy = 'relevance'
    }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        // Clamp limit to maximum of 100
        const clampedLimit = Math.min(limit, 100);
        const clampedOffset = offset || 0;

        if (query) {
          // Perform search - returns SearchResponse with results and pagination info
          const searchResponse = await flintApi.searchNotes({
            query,
            type_filter: noteType,
            limit: clampedLimit,
            offset: clampedOffset,
            vault_id: currentVault.id
          });

          // Return simplified search results directly - no need to fetch full notes
          // This prevents overwhelming context with full note content
          const count = searchResponse.results.length;
          const total = searchResponse.total;
          const noteWord = count === 1 ? 'note' : 'notes';

          let message = `Found ${count} ${noteWord} matching query: ${query}`;
          if (total > count || clampedOffset > 0) {
            const start = clampedOffset + 1;
            const end = clampedOffset + count;
            message = `Found ${total} ${total === 1 ? 'note' : 'notes'} matching query: ${query}. Showing results ${start}-${end}`;
            if (clampedOffset + count < total) {
              message += `. Use offset=${clampedOffset + count} to see more`;
            }
          }

          return {
            success: true,
            data: searchResponse.results,
            message
          };
        } else {
          // List all notes
          let noteList = await flintApi.listNotes({
            typeName: noteType,
            limit: clampedLimit * 2, // Get more to account for filtering
            vaultId: currentVault.id
          });

          // Apply client-side filters
          noteList = this.applyFilters(noteList, { tags, dateRange });

          // Sort (default to 'created' for listings)
          const effectiveSortBy = sortBy === 'relevance' ? 'created' : sortBy;
          noteList = this.sortNotes(noteList, effectiveSortBy);

          // Limit after filtering
          noteList = noteList.slice(0, clampedLimit);

          return {
            success: true,
            data: noteList,
            message: `Listed ${noteList.length} note(s)${noteType ? ` of type: ${noteType}` : ''}`
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to search notes: ${errorMessage}`
        };
      }
    }
  });

  // Helper method to apply client-side filters
  private applyFilters<
    T extends { metadata?: { tags?: string[] }; created?: string; updated?: string }
  >(
    notes: T[],
    filters: {
      tags?: string[];
      dateRange?: { start: string; end: string };
    }
  ): T[] {
    let filtered = notes;

    // Filter by tags if specified
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter((note) => {
        const noteTags = note.metadata?.tags || [];
        return filters.tags!.some((tag) => noteTags.includes(tag));
      });
    }

    // Filter by date range if specified
    if (filters.dateRange) {
      const start = new Date(filters.dateRange.start);
      const end = new Date(filters.dateRange.end);
      end.setHours(23, 59, 59, 999); // Include the entire end date

      filtered = filtered.filter((note) => {
        if (!note.created) return false;
        const noteDate = new Date(note.created);
        return noteDate >= start && noteDate <= end;
      });
    }

    return filtered;
  }

  // Helper method to sort notes
  private sortNotes<T extends { title?: string; created?: string; updated?: string }>(
    notes: T[],
    sortBy: 'created' | 'updated' | 'title' | 'relevance'
  ): T[] {
    const sorted = [...notes];

    switch (sortBy) {
      case 'title':
        sorted.sort((a, b) => {
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();
          return titleA.localeCompare(titleB);
        });
        break;
      case 'created':
        sorted.sort((a, b) => {
          const dateA = new Date(a.created || 0).getTime();
          const dateB = new Date(b.created || 0).getTime();
          return dateB - dateA; // Most recent first
        });
        break;
      case 'updated':
        sorted.sort((a, b) => {
          const dateA = new Date(a.updated || 0).getTime();
          const dateB = new Date(b.updated || 0).getTime();
          return dateB - dateA; // Most recent first
        });
        break;
      case 'relevance':
      default:
        // Already sorted by relevance from search, don't reorder
        break;
    }

    return sorted;
  }

  private getVaultInfoTool = tool({
    description:
      'Get information about the currently active vault including name, path, ID, and available note types. Useful for understanding the workspace context.',
    inputSchema: z.object({}),
    execute: async () => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await flintApi.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        return {
          success: true,
          data: currentVault,
          message: `Current vault: ${currentVault.name}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to get vault info: ${errorMessage}`
        };
      }
    }
  });

  private deleteNoteTool = tool({
    description:
      'Delete a note permanently. This action cannot be undone. Consider confirming with the user before deleting notes, especially if they contain significant content.',
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          'Note ID or identifier to delete. Examples: "note-id-123" or "meeting/Weekly Standup"'
        )
    }),
    execute: async ({ id }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        // Get the note first to obtain its actual ID for the event
        // The input `id` might be in "type/title" format, but we need the canonical UUID
        let actualNoteId = id;
        try {
          const note = await flintApi.getNote(currentVault.id, id);
          actualNoteId = note.id;
        } catch (error) {
          // If we can't get the note, it might not exist or the identifier is invalid
          // Continue with the original id and let deleteNote handle the error
          console.warn('[deleteNoteTool] Could not fetch note before deletion:', error);
        }

        const result = await flintApi.deleteNote({
          identifier: id,
          confirm: true,
          vaultId: currentVault.id
        });

        // Publish note.deleted event if deletion was successful
        if (result.deleted) {
          publishNoteEvent({
            type: 'note.deleted',
            noteId: actualNoteId
          });
        }

        return {
          success: result.deleted,
          data: { success: result.deleted },
          message: result.deleted ? `Deleted note: ${id}` : `Failed to delete note: ${id}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist')
        ) {
          return {
            success: false,
            error: 'NOTE_NOT_FOUND',
            message: `Note not found: ${id}`
          };
        }

        return {
          success: false,
          error: 'DELETE_FAILED',
          message: `Failed to delete note: ${errorMessage}`
        };
      }
    }
  });

  private getNoteTypeDetailsTool = tool({
    description:
      'Get detailed information about a note type including its purpose, full agent instructions, and metadata schema. Use this before creating or working with notes of a specific type to understand how to handle them properly.',
    inputSchema: z.object({
      typeName: z.string().describe('Name of the note type to get details for')
    }),
    execute: async ({ typeName }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const currentVault = await this.noteService.getCurrentVault();
        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        // Get the note type details from the note service
        const noteTypeInfo = await this.noteService.getNoteTypeInfo({
          type_name: typeName,
          vault_id: currentVault.id
        });

        return {
          success: true,
          data: {
            name: noteTypeInfo.name,
            purpose: noteTypeInfo.purpose,
            agentInstructions: noteTypeInfo.instructions,
            metadataSchema: noteTypeInfo.metadata_schema
          },
          message: `Retrieved details for note type '${typeName}'`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('does not exist') ||
          errorMessage.includes('not found')
        ) {
          return {
            success: false,
            error: 'NOTE_TYPE_NOT_FOUND',
            message: `Note type '${typeName}' not found`
          };
        }

        return {
          success: false,
          error: 'GET_NOTE_TYPE_FAILED',
          message: `Failed to get note type details: ${errorMessage}`
        };
      }
    }
  });

  private createNoteTypeTool = tool({
    description:
      'Create a new note type with description, agent instructions, and metadata schema',
    inputSchema: z.object({
      typeName: z.string().describe('Name of the new note type (valid identifier)'),
      description: z.string().describe('Description of what this note type is for'),
      agentInstructions: z
        .array(z.string())
        .optional()
        .describe(
          'Optional array of instructions for agents working with this note type'
        ),
      metadataSchema: z
        .array(
          z.object({
            name: z.string().describe('Field name'),
            type: z
              .enum(['string', 'number', 'boolean', 'date', 'array', 'select'])
              .describe('Field type'),
            required: z
              .boolean()
              .optional()
              .default(false)
              .describe('Whether this field is required'),
            description: z.string().optional().describe('Description of this field'),
            default: z
              .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
              .optional()
              .describe('Default value for this field'),
            constraints: z
              .object({
                options: z
                  .array(z.string())
                  .optional()
                  .describe(
                    'Valid options for select fields (required for select type, e.g., ["active", "inactive", "archived"])'
                  ),
                min: z
                  .number()
                  .optional()
                  .describe('Minimum value for number fields or array length'),
                max: z
                  .number()
                  .optional()
                  .describe('Maximum value for number fields or array length'),
                pattern: z
                  .string()
                  .optional()
                  .describe('Regex pattern for string validation')
              })
              .optional()
              .describe(
                'Field constraints. For select fields, options array is required to specify valid values.'
              )
          })
        )
        .optional()
        .describe('Optional metadata schema definition')
    }),
    execute: async ({ typeName, description, agentInstructions, metadataSchema }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const currentVault = await this.noteService.getCurrentVault();
        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const metadataSchemaObj = metadataSchema ? { fields: metadataSchema } : undefined;

        const result = await this.noteService.createNoteType({
          typeName,
          description,
          agentInstructions,
          metadataSchema: metadataSchemaObj,
          vaultId: currentVault.id
        });

        // Publish noteType.created event
        publishNoteEvent({
          type: 'noteType.created',
          typeName
        });

        return {
          success: true,
          data: result,
          message: `Created note type '${typeName}' successfully`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: 'CREATE_NOTE_TYPE_FAILED',
          message: `Failed to create note type: ${errorMessage}`
        };
      }
    }
  });

  private updateNoteTypeTool = tool({
    description:
      'Update an existing note type with new description, instructions, or metadata schema',
    inputSchema: z.object({
      typeName: z.string().describe('Name of the note type to update'),
      description: z.string().optional().describe('New description (optional)'),
      instructions: z
        .array(z.string())
        .optional()
        .describe('New agent instructions (optional)'),
      metadataSchema: z
        .array(
          z.object({
            name: z.string().describe('Field name'),
            type: z
              .enum(['string', 'number', 'boolean', 'date', 'array', 'select'])
              .describe('Field type'),
            required: z
              .boolean()
              .optional()
              .default(false)
              .describe('Whether this field is required'),
            description: z.string().optional().describe('Description of this field'),
            default: z
              .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
              .optional()
              .describe('Default value for this field'),
            constraints: z
              .object({
                options: z
                  .array(z.string())
                  .optional()
                  .describe(
                    'Valid options for select fields (required for select type, e.g., ["active", "inactive", "archived"])'
                  ),
                min: z
                  .number()
                  .optional()
                  .describe('Minimum value for number fields or array length'),
                max: z
                  .number()
                  .optional()
                  .describe('Maximum value for number fields or array length'),
                pattern: z
                  .string()
                  .optional()
                  .describe('Regex pattern for string validation')
              })
              .optional()
              .describe(
                'Field constraints. For select fields, options array is required to specify valid values.'
              )
          })
        )
        .optional()
        .describe('New metadata schema definition (optional)')
    }),
    execute: async ({ typeName, description, instructions, metadataSchema }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const currentVault = await this.noteService.getCurrentVault();
        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const result = await this.noteService.updateNoteType({
          typeName,
          description,
          instructions,
          metadataSchema,
          vaultId: currentVault.id
        });

        // Publish noteType.updated event
        publishNoteEvent({
          type: 'noteType.updated',
          typeName
        });

        return {
          success: true,
          data: result,
          message: `Updated note type '${typeName}' successfully`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('does not exist') ||
          errorMessage.includes('not found')
        ) {
          return {
            success: false,
            error: 'NOTE_TYPE_NOT_FOUND',
            message: `Note type '${typeName}' not found`
          };
        }

        return {
          success: false,
          error: 'UPDATE_NOTE_TYPE_FAILED',
          message: `Failed to update note type: ${errorMessage}`
        };
      }
    }
  });

  private deleteNoteTypeTool = tool({
    description: 'Delete a note type with options for handling existing notes',
    inputSchema: z.object({
      typeName: z.string().describe('Name of the note type to delete'),
      action: z
        .enum(['error', 'migrate', 'delete'])
        .optional()
        .default('error')
        .describe(
          'Action to take if notes exist: error (fail if notes exist), migrate (move notes to target type), delete (delete all notes)'
        ),
      targetType: z
        .string()
        .optional()
        .describe('Target note type for migration (required when action is "migrate")'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Confirmation flag for destructive operations')
    }),
    execute: async ({ typeName, action = 'error', targetType, confirm = false }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const currentVault = await this.noteService.getCurrentVault();
        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const flintApi = this.noteService.getFlintNoteApi();

        const result = await flintApi.deleteNoteType({
          type_name: typeName,
          action,
          target_type: targetType,
          confirm,
          vault_id: currentVault.id
        });

        // Publish noteType.deleted event if deletion was successful
        if (result.deleted) {
          publishNoteEvent({
            type: 'noteType.deleted',
            typeName
          });
        }

        return {
          success: result.deleted,
          data: result,
          message: result.deleted
            ? `Deleted note type '${typeName}' successfully. ${result.notes_affected} notes affected.`
            : `Failed to delete note type '${typeName}'`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('does not exist') ||
          errorMessage.includes('not found')
        ) {
          return {
            success: false,
            error: 'NOTE_TYPE_NOT_FOUND',
            message: `Note type '${typeName}' not found`
          };
        }

        if (errorMessage.includes('contains') && errorMessage.includes('notes')) {
          return {
            success: false,
            error: 'NOTE_TYPE_HAS_NOTES',
            message: `Cannot delete note type '${typeName}': it contains notes. Use action 'migrate' or 'delete' to handle existing notes.`
          };
        }

        if (errorMessage.includes('requires confirmation')) {
          return {
            success: false,
            error: 'CONFIRMATION_REQUIRED',
            message: `Deletion requires confirmation. Set confirm=true to proceed.`
          };
        }

        return {
          success: false,
          error: 'DELETE_NOTE_TYPE_FAILED',
          message: `Failed to delete note type: ${errorMessage}`
        };
      }
    }
  });

  // Links API Tools
  private getNoteLinksTool = tool({
    description:
      "Get all links for a specific note, including outgoing internal wikilinks, outgoing external links, and incoming backlinks. Use this to understand a note's connections and relationships. Returns up to 500 links per category by default.",
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          'Note ID or identifier to get links for. Examples: "note-id-123" or "meeting/Weekly Standup"'
        ),
      limit: z
        .number()
        .optional()
        .describe(
          'Maximum number of links to return per category (outgoing internal, outgoing external, incoming). Max: 500 per category.'
        )
    }),
    execute: async ({ id, limit }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const links = await flintApi.getNoteLinks(currentVault.id, id, limit);

        const limitNote = links.limited
          ? ` (limited to ${limit || 500} per category, totals: ${links.total_outgoing_internal} internal, ${links.total_outgoing_external} external, ${links.total_incoming} incoming)`
          : '';

        return {
          success: true,
          data: links,
          message: `Retrieved links for note: ${id}. Found ${links.outgoing_internal.length} internal, ${links.outgoing_external.length} external, ${links.incoming.length} incoming links${limitNote}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist')
        ) {
          return {
            success: false,
            error: 'NOTE_NOT_FOUND',
            message: `Note not found: ${id}`
          };
        }

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to get note links: ${errorMessage}`
        };
      }
    }
  });

  private getBacklinksTool = tool({
    description:
      'Get all notes that link to the specified note (backlinks). Returns a list of notes that reference this note through wikilinks. Returns up to 100 results by default (max 500), with pagination support.',
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          'Note ID or identifier to get backlinks for. Examples: "note-id-123" or "meeting/Weekly Standup"'
        ),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default: 100, max: 500)'),
      offset: z
        .number()
        .optional()
        .describe('Number of results to skip for pagination (default: 0)')
    }),
    execute: async ({ id, limit, offset }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const result = await flintApi.getBacklinks(currentVault.id, id, limit, offset);

        return {
          success: true,
          data: result,
          message: `Found ${result.results.length} note(s) linking to: ${id} (total: ${result.pagination.total}, showing ${result.pagination.offset + 1}-${result.pagination.offset + result.results.length})`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist')
        ) {
          return {
            success: false,
            error: 'NOTE_NOT_FOUND',
            message: `Note not found: ${id}`
          };
        }

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to get backlinks: ${errorMessage}`
        };
      }
    }
  });

  private findBrokenLinksTool = tool({
    description:
      'Find all broken wikilinks across the vault. Returns links that point to non-existent notes, helping identify notes that need to be created or links that need to be fixed. Returns up to 100 results by default (max 500), with pagination support.',
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default: 100, max: 500)'),
      offset: z
        .number()
        .optional()
        .describe('Number of results to skip for pagination (default: 0)')
    }),
    execute: async ({ limit, offset }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const result = await flintApi.findBrokenLinks(currentVault.id, limit, offset);

        return {
          success: true,
          data: result,
          message: `Found ${result.results.length} broken link(s) in vault (total: ${result.pagination.total}, showing ${result.pagination.offset + 1}-${result.pagination.offset + result.results.length})`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to find broken links: ${errorMessage}`
        };
      }
    }
  });

  private searchByLinksTool = tool({
    description:
      'Search for notes based on their link relationships. Supports multiple search criteria: notes linking to specific notes, notes linked from specific notes, notes with external links to specific domains, or notes with broken links. Returns up to 50 results by default (max 200), with pagination support.',
    inputSchema: z.object({
      hasLinksTo: z
        .array(z.string())
        .optional()
        .describe(
          'Find notes that link to any of these note IDs. Example: ["meeting/weekly-standup", "project/Q4-planning"]'
        ),
      linkedFrom: z
        .array(z.string())
        .optional()
        .describe(
          'Find notes that are linked from any of these note IDs. Example: ["daily/2025-01-15"]'
        ),
      externalDomains: z
        .array(z.string())
        .optional()
        .describe(
          'Find notes with external links to these domains. Example: ["github.com", "docs.google.com"]'
        ),
      brokenLinks: z
        .boolean()
        .optional()
        .describe('Find notes that contain broken internal links'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of results to return (default: 50, max: 200)'),
      offset: z
        .number()
        .optional()
        .describe('Number of results to skip for pagination (default: 0)')
    }),
    execute: async ({
      hasLinksTo,
      linkedFrom,
      externalDomains,
      brokenLinks,
      limit,
      offset
    }) => {
      if (!this.noteService) {
        return {
          success: false,
          error: 'Note service not available',
          message: 'Note service not initialized'
        };
      }

      try {
        const flintApi = this.noteService.getFlintNoteApi();
        const currentVault = await this.noteService.getCurrentVault();

        if (!currentVault) {
          return {
            success: false,
            error: 'NO_ACTIVE_VAULT',
            message: 'No active vault available'
          };
        }

        const result = await flintApi.searchByLinks({
          has_links_to: hasLinksTo,
          linked_from: linkedFrom,
          external_domains: externalDomains,
          broken_links: brokenLinks,
          vault_id: currentVault.id,
          limit,
          offset
        });

        let criteriaDescription = '';
        if (hasLinksTo) criteriaDescription = `linking to ${hasLinksTo.join(', ')}`;
        else if (linkedFrom) criteriaDescription = `linked from ${linkedFrom.join(', ')}`;
        else if (externalDomains)
          criteriaDescription = `with external links to ${externalDomains.join(', ')}`;
        else if (brokenLinks) criteriaDescription = 'with broken links';

        return {
          success: true,
          data: result,
          message: `Found ${result.results.length} note(s) ${criteriaDescription} (total: ${result.pagination.total}, showing ${result.pagination.offset + 1}-${result.pagination.offset + result.results.length})`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'VAULT_ACCESS_ERROR',
          message: `Failed to search by links: ${errorMessage}`
        };
      }
    }
  });

  private manageTodosTool = tool({
    description:
      'Manage a todo plan for complex multi-step operations. Use this when you need to:\n' +
      '1. Break down a complex task into multiple steps\n' +
      '2. Track progress across multiple turns\n' +
      '3. Show users your plan before executing\n\n' +
      'NOT needed for simple single-tool operations.',
    inputSchema: z.object({
      action: z
        .enum(['create', 'add', 'update', 'complete', 'get'])
        .describe('Action to perform'),
      goal: z
        .string()
        .optional()
        .describe('High-level goal (required for create action)'),
      todos: z
        .array(
          z.object({
            content: z.string().describe('Imperative form: "Create summary note"'),
            activeForm: z.string().describe('Present continuous: "Creating summary note"')
          })
        )
        .optional()
        .describe('Todos to add (required for add action)'),
      todoId: z
        .string()
        .optional()
        .describe('Todo ID to update (required for update action)'),
      status: z
        .enum(['pending', 'in_progress', 'completed', 'failed'])
        .optional()
        .describe('New status (required for update action)'),
      result: z.unknown().optional().describe('Result data (optional for update action)'),
      error: z
        .string()
        .optional()
        .describe('Error message if failed (optional for update action)')
    }),
    execute: async ({ action, goal, todos, todoId, status, result, error }) => {
      if (!this.todoPlanService) {
        return {
          success: false,
          error: 'Todo plan service not available',
          message: 'Todo plan service not initialized'
        };
      }

      try {
        // Get current conversation ID
        const conversationId = this.currentConversationId || 'default';

        switch (action) {
          case 'create': {
            if (!goal) {
              return {
                success: false,
                error: 'Missing required parameter',
                message: 'goal is required for create action'
              };
            }
            const plan = this.todoPlanService.createPlan(conversationId, goal);
            return {
              success: true,
              data: { planId: plan.id, goal: plan.goal },
              message: `Created todo plan: ${goal}`
            };
          }

          case 'add': {
            if (!todos || todos.length === 0) {
              return {
                success: false,
                error: 'Missing required parameter',
                message: 'todos array is required for add action'
              };
            }
            const plan = this.todoPlanService.getActivePlan(conversationId);
            if (!plan) {
              return {
                success: false,
                error: 'No active plan',
                message: 'No active plan found. Create a plan first with action: create'
              };
            }
            const addedTodos = this.todoPlanService.addTodos(plan.id, todos);
            return {
              success: true,
              data: {
                planId: plan.id,
                todosAdded: todos.length,
                todoIds: addedTodos.map((t) => t.id)
              },
              message: `Added ${todos.length} todo(s) to plan. IDs: ${addedTodos.map((t) => t.id).join(', ')}`
            };
          }

          case 'update': {
            if (!todoId || !status) {
              return {
                success: false,
                error: 'Missing required parameters',
                message: 'todoId and status are required for update action'
              };
            }
            const plan = this.todoPlanService.getActivePlan(conversationId);
            if (!plan) {
              return {
                success: false,
                error: 'No active plan',
                message: 'No active plan found'
              };
            }
            this.todoPlanService.updateTodoStatus(plan.id, todoId, status, result, error);
            return {
              success: true,
              data: { planId: plan.id, todoId, status },
              message: `Updated todo status to: ${status}`
            };
          }

          case 'complete': {
            const plan = this.todoPlanService.getActivePlan(conversationId);
            if (!plan) {
              return {
                success: false,
                error: 'No active plan',
                message: 'No active plan found'
              };
            }
            this.todoPlanService.completePlan(plan.id);
            return {
              success: true,
              data: { planId: plan.id },
              message: 'Completed todo plan'
            };
          }

          case 'get': {
            const plan = this.todoPlanService.getActivePlan(conversationId);
            if (!plan) {
              return {
                success: true,
                data: null,
                message: 'No active plan'
              };
            }
            return {
              success: true,
              data: plan,
              message: `Active plan: ${plan.goal}`
            };
          }

          default:
            return {
              success: false,
              error: 'Invalid action',
              message: `Unknown action: ${action}`
            };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to manage todos: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  // Workflow Management Tools
  private createWorkflowTool = tool({
    description:
      'Create a new workflow that persists across conversations. Workflows can be recurring (daily/weekly/monthly) or one-time. Use type="backlog" for items discovered during work (broken links, cleanup opportunities) that should be silently recorded without interrupting the user.',
    inputSchema: createWorkflowSchema,
    execute: async (input) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const workflow = await this.workflowService.createWorkflow(input);

        return {
          success: true,
          data: { workflowId: workflow.id, name: workflow.name, type: workflow.type },
          message:
            workflow.type === 'backlog'
              ? `Recorded backlog item: ${workflow.name}`
              : `Created workflow: ${workflow.name}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('already exists')) {
          return {
            success: false,
            error: 'DUPLICATE_NAME',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'CREATE_WORKFLOW_FAILED',
          message: `Failed to create workflow: ${errorMessage}`
        };
      }
    }
  });

  private updateWorkflowTool = tool({
    description:
      'Update an existing workflow. Can modify name, description, status, schedule, or type.',
    inputSchema: updateWorkflowSchema,
    execute: async (input) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const workflow = await this.workflowService.updateWorkflow(input);

        return {
          success: true,
          data: workflow,
          message: `Updated workflow: ${workflow.name}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: errorMessage
          };
        }

        if (errorMessage.includes('already exists')) {
          return {
            success: false,
            error: 'DUPLICATE_NAME',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'UPDATE_WORKFLOW_FAILED',
          message: `Failed to update workflow: ${errorMessage}`
        };
      }
    }
  });

  private deleteWorkflowTool = tool({
    description: 'Delete a workflow by marking it as archived. This is a soft delete.',
    inputSchema: deleteWorkflowSchema,
    execute: async ({ workflowId }) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        await this.workflowService.deleteWorkflow(workflowId);

        return {
          success: true,
          data: { workflowId },
          message: `Deleted workflow: ${workflowId}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'DELETE_WORKFLOW_FAILED',
          message: `Failed to delete workflow: ${errorMessage}`
        };
      }
    }
  });

  private listWorkflowsTool = tool({
    description:
      'List workflows with optional filtering and sorting. Returns a lightweight summary of workflows. Use get_workflow to retrieve full details.',
    inputSchema: listWorkflowsSchema,
    execute: async (input) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const workflows = await this.workflowService.listWorkflows(input);

        let message = `Found ${workflows.length} workflow(s)`;
        if (input?.type && input.type !== 'all') {
          message += ` of type: ${input.type}`;
        }
        if (input?.status && input.status !== 'all') {
          message += ` with status: ${input.status}`;
        }

        return {
          success: true,
          data: workflows,
          message
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          error: 'LIST_WORKFLOWS_FAILED',
          message: `Failed to list workflows: ${errorMessage}`
        };
      }
    }
  });

  private getWorkflowTool = tool({
    description:
      'Get full details of a specific workflow including description, schedule, and optionally supplementary materials and completion history.',
    inputSchema: getWorkflowSchema,
    execute: async (input) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const workflow = await this.workflowService.getWorkflow(input);

        return {
          success: true,
          data: workflow,
          message: `Retrieved workflow: ${workflow.name}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'GET_WORKFLOW_FAILED',
          message: `Failed to get workflow: ${errorMessage}`
        };
      }
    }
  });

  private completeWorkflowTool = tool({
    description:
      'Mark a workflow as completed. For recurring workflows, updates last_completed and keeps status active. For one-time workflows, changes status to completed.',
    inputSchema: completeWorkflowSchema,
    execute: async (input) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const completion = await this.workflowService.completeWorkflow(input);

        return {
          success: true,
          data: completion,
          message: `Completed workflow at ${completion.completedAt}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'COMPLETE_WORKFLOW_FAILED',
          message: `Failed to complete workflow: ${errorMessage}`
        };
      }
    }
  });

  private addWorkflowMaterialTool = tool({
    description:
      'Add supplementary material to a workflow. Can be text, code snippet, or note reference.',
    inputSchema: addWorkflowMaterialSchema,
    execute: async ({ workflowId, ...material }) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        const materialId = await this.workflowService.addSupplementaryMaterial(
          workflowId,
          {
            materialType: material.type,
            content: material.content,
            noteId: material.noteId,
            metadata: material.metadata,
            position: 0 // Position will be auto-assigned by the service
          }
        );

        return {
          success: true,
          data: { materialId, workflowId },
          message: `Added ${material.type} material to workflow`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'ADD_MATERIAL_FAILED',
          message: `Failed to add material: ${errorMessage}`
        };
      }
    }
  });

  private removeWorkflowMaterialTool = tool({
    description: 'Remove supplementary material from a workflow.',
    inputSchema: removeWorkflowMaterialSchema,
    execute: async ({ materialId }) => {
      if (!this.workflowService) {
        return {
          success: false,
          error: 'Workflow service not available',
          message: 'Workflow service not initialized'
        };
      }

      try {
        await this.workflowService.removeSupplementaryMaterial(materialId);

        return {
          success: true,
          data: { materialId },
          message: `Removed material: ${materialId}`
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return {
            success: false,
            error: 'MATERIAL_NOT_FOUND',
            message: errorMessage
          };
        }

        return {
          success: false,
          error: 'REMOVE_MATERIAL_FAILED',
          message: `Failed to remove material: ${errorMessage}`
        };
      }
    }
  });
}
