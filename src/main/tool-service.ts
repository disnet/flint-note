import { tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';
import { logger } from './logger';
import type { Note, NoteMetadata } from '@flint-note/server';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

export class ToolService {
  constructor(private noteService: NoteService | null) {}

  getTools(): Record<string, unknown> {
    if (!this.noteService) {
      return {};
    }

    return {
      create_note: this.createNoteTool,
      get_note: this.getNoteTool,
      get_notes: this.getNotesTool,
      update_note: this.updateNoteTool,
      delete_note: this.deleteNoteTool,
      rename_note: this.renameNoteTool,
      move_note: this.moveNoteTool,
      search_notes: this.searchNotesTool,
      search_notes_advanced: this.searchNotesAdvancedTool,
      create_note_type: this.createNoteTypeTool,
      list_note_types: this.listNoteTypesTool,
      get_note_type_info: this.getNoteTypeInfoTool,
      update_note_type: this.updateNoteTypeTool,
      delete_note_type: this.deleteNoteTypeTool,
      get_current_vault: this.getCurrentVaultTool,
      list_vaults: this.listVaultsTool,
      get_note_links: this.getNoteLinksTool,
      get_backlinks: this.getBacklinksTool,
      find_broken_links: this.findBrokenLinksTool
    };
  }

  private createNoteTool = tool({
    description: 'Create a new note with specified content and metadata',
    inputSchema: z.object({
      type: z
        .string()
        .optional()
        .describe('Note type (must exist) - for single note creation'),
      title: z
        .string()
        .optional()
        .describe('Title of the note - for single note creation'),
      content: z
        .string()
        .optional()
        .describe('Content of the note in markdown format - for single note creation'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Additional metadata fields for the note'),
      notes: z
        .array(
          z.object({
            type: z.string().describe('Note type (must exist)'),
            title: z.string().describe('Title of the note'),
            content: z.string().describe('Content of the note in markdown format'),
            metadata: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Additional metadata fields for the note')
          })
        )
        .optional()
        .describe('Array of notes to create - for batch creation'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ type, title, content, notes, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        // Handle batch creation
        if (notes && notes.length > 0) {
          const results: Array<{
            success: boolean;
            noteId?: string;
            title: string;
            type: string;
            error?: string;
          }> = [];
          for (const note of notes) {
            try {
              const result = await this.noteService.createNote(
                note.type,
                note.title,
                note.content,
                vault_id || undefined
              );
              results.push({
                success: true,
                noteId: result.id,
                title: note.title,
                type: note.type
              });
            } catch (error) {
              results.push({
                success: false,
                title: note.title,
                type: note.type,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }

          const successCount = results.filter((r) => r.success).length;
          return {
            success: successCount > 0,
            data: { results, successCount, totalCount: notes.length },
            message: `Created ${successCount} of ${notes.length} notes`
          } as ToolResponse;
        }

        // Handle single note creation
        if (!type || !title || !content) {
          return {
            success: false,
            error: 'Missing required fields',
            message: 'For single note creation, type, title, and content are required'
          } as ToolResponse;
        }

        const result = await this.noteService.createNote(
          type,
          title,
          content,
          vault_id || undefined
        );

        return {
          success: true,
          data: { noteId: result.id },
          message: `Created note "${title}" of type "${type}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in create_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getNoteTool = tool({
    description: 'Retrieve a single note by identifier',
    inputSchema: z.object({
      identifier: z
        .string()
        .describe('Note identifier in format "type/filename" or full path'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on'),
      fields: z
        .array(z.string())
        .optional()
        .describe('Optional array of field names to include (supports dot notation)')
    }),
    execute: async ({ identifier, vault_id, fields }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const note = await this.noteService.getNote(identifier, vault_id || undefined);

        if (!note) {
          return {
            success: false,
            error: 'Note not found',
            message: `Note "${identifier}" not found`
          } as ToolResponse;
        }

        // Filter fields if specified
        let responseData: Note | Record<string, unknown> = note;
        if (fields && fields.length > 0) {
          responseData = {} as Record<string, unknown>;
          for (const field of fields) {
            if (field.includes('.')) {
              // Handle dot notation (simplified implementation)
              const parts = field.split('.');
              let value = note as Record<string, unknown>;
              for (const part of parts) {
                value = value?.[part] as Record<string, unknown>;
              }
              if (value !== undefined) {
                const key = parts[parts.length - 1];
                responseData[key] = value;
              }
            } else {
              if ((note as Record<string, unknown>)[field] !== undefined) {
                responseData[field] = (note as Record<string, unknown>)[field];
              }
            }
          }
        }

        return {
          success: true,
          data: responseData,
          message: `Retrieved note "${identifier}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getNotesTool = tool({
    description: 'Retrieve multiple notes by identifiers',
    inputSchema: z.object({
      identifiers: z.array(z.string()).describe('Array of note identifiers'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on'),
      fields: z
        .array(z.string())
        .optional()
        .describe('Optional array of field names to include')
    }),
    execute: async ({ identifiers, vault_id, fields }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const results: Array<{
          identifier: string;
          success: boolean;
          data?: Note | Record<string, unknown>;
          error?: string;
        }> = [];
        for (const identifier of identifiers) {
          try {
            const note = await this.noteService.getNote(
              identifier,
              vault_id || undefined
            );
            if (note) {
              // Filter fields if specified
              let noteData: Note | Record<string, unknown> = note;
              if (fields && fields.length > 0) {
                noteData = {} as Record<string, unknown>;
                for (const field of fields) {
                  if ((note as Record<string, unknown>)[field] !== undefined) {
                    noteData[field] = (note as Record<string, unknown>)[field];
                  }
                }
              }
              results.push({ identifier, success: true, data: noteData });
            } else {
              results.push({ identifier, success: false, error: 'Note not found' });
            }
          } catch (error) {
            results.push({
              identifier,
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        return {
          success: successCount > 0,
          data: { results, successCount, totalCount: identifiers.length },
          message: `Retrieved ${successCount} of ${identifiers.length} notes`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_notes tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get notes: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private updateNoteTool = tool({
    description: 'Update note content and metadata',
    inputSchema: z.object({
      identifier: z.string().describe('Note identifier'),
      content: z.string().optional().describe('New content for the note'),
      content_hash: z.string().describe('Content hash for optimistic locking'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Metadata fields to update'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ identifier, content, metadata, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        if (!content && !metadata) {
          return {
            success: false,
            error: 'No updates provided',
            message: 'Either content or metadata must be provided for update'
          } as ToolResponse;
        }

        const result = await this.noteService.updateNote(
          identifier,
          content || '',
          vault_id || undefined,
          metadata as NoteMetadata
        );

        return {
          success: true,
          data: result,
          message: `Updated note "${identifier}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in update_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to update note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private deleteNoteTool = tool({
    description: 'Delete a note with confirmation',
    inputSchema: z.object({
      identifier: z.string().describe('Note identifier (type/filename format)'),
      confirm: z
        .boolean()
        .optional()
        .describe('Explicit confirmation required for deletion'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ identifier, confirm, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        if (!confirm) {
          return {
            success: false,
            error: 'Confirmation required',
            message: 'Deletion requires explicit confirmation (confirm: true)'
          } as ToolResponse;
        }

        const result = await this.noteService.deleteNote(
          identifier,
          vault_id || undefined
        );

        return {
          success: true,
          data: result,
          message: `Deleted note "${identifier}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in delete_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to delete note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private renameNoteTool = tool({
    description: 'Rename a note and update links',
    inputSchema: z.object({
      identifier: z.string().describe('Note identifier'),
      new_title: z.string().describe('New display title for the note'),
      content_hash: z.string().describe('Content hash for optimistic locking'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ identifier, new_title, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const result = await this.noteService.renameNote(
          identifier,
          new_title,
          vault_id || undefined
        );

        return {
          success: result.success,
          data: result,
          message: result.success
            ? `Renamed note "${identifier}" to "${new_title}"`
            : 'Failed to rename note'
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in rename_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to rename note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private moveNoteTool = tool({
    description: 'Move a note to a different type',
    inputSchema: z.object({
      identifier: z.string().describe('Current note identifier in type/filename format'),
      new_type: z.string().describe('Target note type to move the note to'),
      content_hash: z
        .string()
        .describe('Content hash for optimistic locking to prevent conflicts'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ identifier, new_type, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const result = await this.noteService.moveNote(
          identifier,
          new_type,
          vault_id || undefined
        );

        return {
          success: true,
          data: result,
          message: `Moved note "${identifier}" to type "${new_type}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in move_note tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to move note: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private searchNotesTool = tool({
    description: 'Basic text search with filters',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Search query or regex pattern (empty returns all notes)'),
      type_filter: z.string().optional().describe('Optional filter by note type'),
      limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      use_regex: z
        .boolean()
        .optional()
        .describe('Enable regex pattern matching (default: false)'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on'),
      fields: z
        .array(z.string())
        .optional()
        .describe('Optional array of field names to include')
    }),
    execute: async ({ query, type_filter, limit, vault_id }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        // If no query provided, get all notes
        if (!query) {
          const allNotes = await this.noteService.getAllNotes(vault_id || undefined);
          let filteredNotes = allNotes;

          // Apply type filter if provided
          if (type_filter) {
            filteredNotes = allNotes.filter((note) => note.type === type_filter);
          }

          // Apply limit
          if (limit && limit > 0) {
            filteredNotes = filteredNotes.slice(0, limit);
          }

          return {
            success: true,
            data: { results: filteredNotes, count: filteredNotes.length },
            message: `Found ${filteredNotes.length} notes`
          } as ToolResponse;
        }

        const results = await this.noteService.searchNotes(
          query,
          vault_id || undefined,
          limit
        );

        // Apply type filter if provided
        let filteredResults = results;
        if (type_filter) {
          filteredResults = results.filter((result) => result.type === type_filter);
        }

        return {
          success: true,
          data: { results: filteredResults, count: filteredResults.length },
          message: `Found ${filteredResults.length} notes matching "${query}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in search_notes tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to search notes: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private searchNotesAdvancedTool = tool({
    description: 'Advanced search with metadata filters, date ranges, sorting',
    inputSchema: z.object({
      type: z.string().optional().describe('Filter by note type'),
      metadata_filters: z
        .array(
          z.object({
            key: z.string().describe('Metadata key to filter on'),
            value: z.string().describe('Value to match'),
            operator: z
              .string()
              .optional()
              .describe(
                "Comparison operator: '=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'"
              )
          })
        )
        .optional()
        .describe('Array of metadata filters'),
      updated_within: z
        .string()
        .optional()
        .describe('Find notes updated within time period (e.g., "7d", "1w", "2m")'),
      updated_before: z
        .string()
        .optional()
        .describe('Find notes updated before time period'),
      created_within: z
        .string()
        .optional()
        .describe('Find notes created within time period'),
      created_before: z
        .string()
        .optional()
        .describe('Find notes created before time period'),
      content_contains: z.string().optional().describe('Search within note content'),
      sort: z
        .array(
          z.object({
            field: z
              .string()
              .describe("Field: 'title', 'type', 'created', 'updated', 'size'"),
            order: z.string().describe("Order: 'asc', 'desc'")
          })
        )
        .optional()
        .describe('Sort order for results'),
      limit: z.number().optional().describe('Maximum number of results (default: 50)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on'),
      fields: z
        .array(z.string())
        .optional()
        .describe('Optional array of field names to include')
    }),
    execute: async ({
      content_contains,
      type,
      created_within,
      created_before,
      updated_within,
      updated_before,
      limit,
      vault_id
    }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        // Convert to the format expected by the note service
        const results = await this.noteService.searchNotesAdvanced({
          query: content_contains || '',
          type,
          dateFrom: created_within || updated_within,
          dateTo: created_before || updated_before,
          limit,
          vaultId: vault_id || undefined
        });

        return {
          success: true,
          data: { results, count: results.length },
          message: `Found ${results.length} notes with advanced search`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in search_notes_advanced tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to search notes: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private createNoteTypeTool = tool({
    description: 'Create new note types with metadata schemas',
    inputSchema: z.object({
      type_name: z.string().describe('Name of the note type (filesystem-safe)'),
      description: z.string().describe('Description of the note type purpose and usage'),
      agent_instructions: z
        .array(z.string())
        .optional()
        .describe('Optional custom agent instructions for this note type'),
      metadata_schema: z
        .object({
          fields: z
            .array(
              z.object({
                name: z.string().describe('Name of the metadata field'),
                type: z
                  .string()
                  .describe(
                    "Type: 'string', 'number', 'boolean', 'date', 'array', 'select'"
                  ),
                description: z
                  .string()
                  .optional()
                  .describe('Optional description of the field'),
                required: z
                  .boolean()
                  .optional()
                  .describe('Whether this field is required'),
                constraints: z
                  .record(z.string(), z.unknown())
                  .optional()
                  .describe('Optional field constraints (min, max, options, etc.)'),
                default: z
                  .unknown()
                  .optional()
                  .describe('Optional default value for the field')
              })
            )
            .optional()
            .describe('Array of metadata field definitions'),
          version: z.string().optional().describe('Optional schema version')
        })
        .optional()
        .describe('Optional metadata schema definition'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({
      type_name,
      description,
      agent_instructions,
      metadata_schema,
      vault_id
    }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const result = await this.noteService.createNoteType({
          typeName: type_name,
          description,
          agentInstructions: agent_instructions,
          metadataSchema: metadata_schema as MetadataSchema,
          vaultId: vault_id || undefined
        });

        return {
          success: true,
          data: result,
          message: `Created note type "${type_name}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in create_note_type tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to create note type: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private listNoteTypesTool = tool({
    description: 'List all available note types',
    inputSchema: z.object({
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async () => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const noteTypes = await this.noteService.listNoteTypes();

        return {
          success: true,
          data: { noteTypes, count: noteTypes.length },
          message: `Found ${noteTypes.length} note types`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in list_note_types tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to list note types: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getNoteTypeInfoTool = tool({
    description: 'Get detailed info about a note type',
    inputSchema: z.object({
      type_name: z.string().describe('Name of the note type to get information for'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async ({ type_name }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const noteTypes = await this.noteService.listNoteTypes();
        const noteType = noteTypes.find((nt) => nt.name === type_name);

        if (!noteType) {
          return {
            success: false,
            error: 'Note type not found',
            message: `Note type "${type_name}" not found`
          } as ToolResponse;
        }

        return {
          success: true,
          data: noteType,
          message: `Retrieved info for note type "${type_name}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_note_type_info tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get note type info: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private updateNoteTypeTool = tool({
    description: 'Update note type configuration',
    inputSchema: z.object({
      type_name: z.string().describe('Name of the note type to update'),
      instructions: z
        .string()
        .optional()
        .describe('New agent instructions for the note type'),
      description: z.string().optional().describe('New description for the note type'),
      metadata_schema: z
        .array(
          z.object({
            name: z.string().describe('Name of the metadata field'),
            type: z
              .string()
              .describe("Type: 'string', 'number', 'boolean', 'date', 'array', 'select'"),
            description: z
              .string()
              .optional()
              .describe('Optional description of the field'),
            required: z.boolean().optional().describe('Whether this field is required'),
            constraints: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Optional field constraints (min, max, options, etc.)'),
            default: z
              .unknown()
              .optional()
              .describe('Optional default value for the field')
          })
        )
        .optional()
        .describe('Array of metadata field definitions'),
      content_hash: z.string().describe('Content hash for optimistic locking'),
      vault_id: z
        .string()
        .nullable()
        .optional()
        .describe('Optional vault ID to operate on')
    }),
    execute: async () => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        // Note: The note service doesn't currently expose an updateNoteType method
        // This would need to be implemented in the note service first
        return {
          success: false,
          error: 'Not implemented',
          message: 'Update note type functionality not yet implemented'
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in update_note_type tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to update note type: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private deleteNoteTypeTool = tool({
    description: 'Delete note type with migration options',
    inputSchema: z.object({
      type_name: z.string().describe('Name of the note type to delete'),
      action: z.string().describe("Action: 'error', 'migrate', or 'delete'"),
      target_type: z
        .string()
        .optional()
        .describe('Target note type for migration (required when action is migrate)'),
      confirm: z
        .boolean()
        .optional()
        .describe('Explicit confirmation required for deletion')
    }),
    execute: async ({ confirm }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        if (!confirm) {
          return {
            success: false,
            error: 'Confirmation required',
            message: 'Note type deletion requires explicit confirmation (confirm: true)'
          } as ToolResponse;
        }

        // Note: The note service doesn't currently expose a deleteNoteType method
        // This would need to be implemented in the note service first
        return {
          success: false,
          error: 'Not implemented',
          message: 'Delete note type functionality not yet implemented'
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in delete_note_type tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to delete note type: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getCurrentVaultTool = tool({
    description: 'Get current active vault information',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const vault = await this.noteService.getCurrentVault();

        if (!vault) {
          return {
            success: false,
            error: 'No current vault',
            message: 'No vault is currently active'
          } as ToolResponse;
        }

        return {
          success: true,
          data: vault,
          message: `Current vault: "${vault.name}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_current_vault tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get current vault: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private listVaultsTool = tool({
    description: 'List all available vaults',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const vaults = await this.noteService.listVaults();

        return {
          success: true,
          data: { vaults, count: vaults.length },
          message: `Found ${vaults.length} vaults`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in list_vaults tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to list vaults: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getNoteLinksTool = tool({
    description: 'Get outgoing and incoming links for a note',
    inputSchema: z.object({
      identifier: z.string().describe('Note identifier (type/filename format)')
    }),
    execute: async ({ identifier }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const links = await this.noteService.getNoteLinks(identifier);

        return {
          success: true,
          data: links,
          message: `Retrieved links for note "${identifier}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_note_links tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get note links: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private getBacklinksTool = tool({
    description: 'Get backlinks pointing to a note',
    inputSchema: z.object({
      identifier: z.string().describe('Note identifier (type/filename format)')
    }),
    execute: async ({ identifier }) => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const backlinks = await this.noteService.getBacklinks(identifier);

        return {
          success: true,
          data: { backlinks, count: backlinks.length },
          message: `Found ${backlinks.length} backlinks for note "${identifier}"`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in get_backlinks tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get backlinks: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });

  private findBrokenLinksTool = tool({
    description: 'Find all broken wikilinks in the vault',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        if (!this.noteService) {
          return {
            success: false,
            error: 'Note service not available',
            message: 'Note service not initialized'
          } as ToolResponse;
        }

        const brokenLinks = await this.noteService.findBrokenLinks();

        return {
          success: true,
          data: { brokenLinks, count: brokenLinks.length },
          message: `Found ${brokenLinks.length} broken links`
        } as ToolResponse;
      } catch (error) {
        logger.error('Error in find_broken_links tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to find broken links: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });
}
