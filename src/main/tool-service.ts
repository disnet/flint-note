import { Tool, tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';
import {
  EnhancedEvaluateNoteCode,
  enhancedEvaluateCodeSchema
} from './enhanced-evaluate-note-code';
import { CustomFunctionsApi } from '../server/api/custom-functions-api.js';
import { ContentHashMismatchError } from '../server/utils/content-hash.js';
import { publishNoteEvent } from './note-events';
import { TodoPlanService } from './todo-plan-service';

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
  compilation?: {
    success: boolean;
    errors: Array<{
      code: number;
      message: string;
      line: number;
      column: number;
      source: string;
      suggestion?: string;
    }>;
    warnings: Array<{
      code: number;
      message: string;
      line: number;
      column: number;
      source: string;
    }>;
  };
}

export class ToolService {
  private evaluateNoteCode: EnhancedEvaluateNoteCode;
  private customFunctionsApi: CustomFunctionsApi | null = null;
  private todoPlanService: TodoPlanService | null = null;
  private currentConversationId: string | null = null;

  constructor(
    private noteService: NoteService | null,
    workspaceRoot?: string,
    todoPlanService?: TodoPlanService
  ) {
    this.evaluateNoteCode = new EnhancedEvaluateNoteCode(noteService, workspaceRoot);
    if (workspaceRoot) {
      this.customFunctionsApi = new CustomFunctionsApi(workspaceRoot);
    }
    this.todoPlanService = todoPlanService || null;
  }

  setCurrentConversationId(conversationId: string): void {
    this.currentConversationId = conversationId;
  }

  getTools(): Record<string, Tool> | undefined {
    if (!this.noteService) {
      return undefined;
    }

    const tools: Record<string, Tool> = {
      evaluate_note_code: this.evaluateNoteCodeTool,
      // Basic CRUD tools
      get_note: this.getNoteTool,
      create_note: this.createNoteTool,
      update_note: this.updateNoteTool,
      search_notes: this.searchNotesTool,
      get_vault_info: this.getVaultInfoTool,
      delete_note: this.deleteNoteTool,
      // Note type management tools
      get_note_type_details: this.getNoteTypeDetailsTool,
      create_note_type: this.createNoteTypeTool,
      update_note_type: this.updateNoteTypeTool,
      delete_note_type: this.deleteNoteTypeTool
    };

    // Add custom functions tools if available
    if (this.customFunctionsApi) {
      tools.register_custom_function = this.registerCustomFunctionTool;
      tools.test_custom_function = this.testCustomFunctionTool;
      tools.list_custom_functions = this.listCustomFunctionsTool;
      tools.validate_custom_function = this.validateCustomFunctionTool;
      tools.delete_custom_function = this.deleteCustomFunctionTool;
    }

    // Add todo plan management tool if available
    if (this.todoPlanService) {
      tools.manage_todos = this.manageTodosTool;
    }

    return tools;
  }

  private evaluateNoteCodeTool = tool({
    description:
      'Execute TypeScript code in secure WebAssembly sandbox with strict type checking and access to FlintNote API. ' +
      'Provides compile-time type safety and comprehensive error feedback. ' +
      'Your code must define an async function called main() that returns the result.',
    inputSchema: enhancedEvaluateCodeSchema,
    execute: async ({ code, typesOnly = false }) => {
      return (await this.evaluateNoteCode.execute({ code, typesOnly })) as ToolResponse;
    }
  });

  private registerCustomFunctionTool = tool({
    description:
      'Register a reusable custom function that can be called in future code evaluations via the customFunctions namespace. ' +
      'Functions are persisted per-vault and automatically available in the TypeScript environment.',
    inputSchema: z.object({
      name: z.string().describe('Function name (valid TypeScript identifier)'),
      description: z
        .string()
        .describe('Human-readable description of what the function does'),
      parameters: z
        .record(
          z.string(),
          z.object({
            type: z
              .string()
              .describe('TypeScript type (e.g., "string", "number", "Note[]")'),
            description: z.string().optional().describe('Parameter description'),
            optional: z.boolean().optional().describe('Whether parameter is optional'),
            default: z.unknown().optional().describe('Default value if optional')
          })
        )
        .describe('Parameter definitions'),
      returnType: z
        .string()
        .describe('Return type (e.g., "Note", "void", "Promise<Note[]>")'),
      code: z.string().describe('Complete TypeScript function implementation'),
      tags: z.array(z.string()).optional().describe('Optional organizational tags')
    }),
    execute: async ({ name, description, parameters, returnType, code, tags }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const customFunction = await this.customFunctionsApi.registerFunction({
          name,
          description,
          parameters: parameters as Record<
            string,
            {
              type: string;
              description?: string;
              optional?: boolean;
              default?: unknown;
            }
          >,
          returnType,
          code,
          tags
        });

        return {
          success: true,
          data: {
            id: customFunction.id,
            name: customFunction.name,
            description: customFunction.description,
            usageCount: customFunction.metadata.usageCount
          },
          message: `Custom function '${name}' registered successfully. It can now be called via customFunctions.${name}() in code evaluations.`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to register custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private testCustomFunctionTool = tool({
    description:
      'Test a registered custom function with provided parameters. Validates the function execution and returns results.',
    inputSchema: z.object({
      name: z.string().describe('Name of the custom function to test'),
      parameters: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Parameters to pass to the function')
    }),
    execute: async ({ name, parameters = {} }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        // Get the function definition to validate parameters
        const func = await this.customFunctionsApi.getFunction({ name });
        if (!func) {
          return {
            success: false,
            error: `Custom function '${name}' not found`,
            message: `No custom function named '${name}' is registered`
          };
        }

        // Create test code that calls the function

        const testCode = `
          async function main() {
            try {
              const result = await customFunctions.${name}(${Object.entries(parameters)
                .map(([, value]) => JSON.stringify(value))
                .join(', ')});
              return {
                success: true,
                result,
                type: typeof result
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
              };
            }
          }
        `;

        // Execute the test using the evaluate code tool
        const testResult = await this.evaluateNoteCode.execute({
          code: testCode,
          typesOnly: false
        });

        if (testResult.success && testResult.data?.result) {
          const functionResult = testResult.data.result as {
            success: boolean;
            result?: unknown;
            error?: string;
            stack?: string;
          };

          if (functionResult.success) {
            return {
              success: true,
              data: {
                functionResult: functionResult.result,
                executionTime: testResult.data.executionTime,
                parameters: parameters
              },
              message: `Custom function '${name}' executed successfully`
            };
          } else {
            return {
              success: false,
              error: functionResult.error,
              message: `Custom function '${name}' execution failed: ${functionResult.error}`
            };
          }
        } else {
          return {
            success: false,
            error: testResult.error,
            message: `Failed to test custom function '${name}': ${testResult.error}`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Error testing custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private listCustomFunctionsTool = tool({
    description: 'List all registered custom functions with their details.',
    inputSchema: z.object({
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      searchQuery: z.string().optional().describe('Search query to filter functions')
    }),
    execute: async ({ tags, searchQuery }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const functions = await this.customFunctionsApi.listFunctions({
          tags,
          searchQuery
        });

        return {
          success: true,
          data: {
            functions: functions.map((func) => ({
              id: func.id,
              name: func.name,
              description: func.description,
              parameters: func.parameters,
              returnType: func.returnType,
              tags: func.tags,
              usageCount: func.metadata.usageCount,
              lastUsed: func.metadata.lastUsed?.toISOString(),
              createdAt: func.metadata.createdAt.toISOString()
            })),
            count: functions.length
          },
          message: `Found ${functions.length} custom function(s)`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to list custom functions: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private validateCustomFunctionTool = tool({
    description:
      'Validate a custom function definition without registering it. Useful for checking syntax and types.',
    inputSchema: z.object({
      name: z.string().describe('Function name to validate'),
      description: z.string().describe('Function description'),
      parameters: z
        .record(
          z.string(),
          z.object({
            type: z.string(),
            description: z.string().optional(),
            optional: z.boolean().optional(),
            default: z.unknown().optional()
          })
        )
        .describe('Parameter definitions'),
      returnType: z.string().describe('Return type'),
      code: z.string().describe('Function implementation code'),
      tags: z.array(z.string()).optional().describe('Tags')
    }),
    execute: async ({ name, description, parameters, returnType, code, tags }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const validation = await this.customFunctionsApi.validateFunction({
          name,
          description,
          parameters: parameters as Record<
            string,
            {
              type: string;
              description?: string;
              optional?: boolean;
              default?: unknown;
            }
          >,
          returnType,
          code,
          tags
        });

        if (validation.valid) {
          return {
            success: true,
            data: {
              valid: true,
              functionName: name,
              parameterCount: Object.keys(parameters).length,
              warnings: validation.warnings?.map((w) => w.message) || []
            },
            message: `Custom function '${name}' validation passed${validation.warnings?.length ? ` with ${validation.warnings.length} warning(s)` : ''}`
          };
        } else {
          return {
            success: false,
            data: {
              valid: false,
              errors: validation.errors.map((e) => ({
                type: e.type,
                message: e.message,
                line: e.line,
                column: e.column
              })),
              warnings: validation.warnings?.map((w) => w.message) || []
            },
            error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
            message: `Custom function '${name}' validation failed with ${validation.errors.length} error(s)`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to validate custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  // Basic CRUD Tools
  private getNoteTool = tool({
    description:
      'Retrieve one or more notes by their IDs or identifiers. Efficient for bulk retrieval. Use this when you know the specific note IDs or identifiers (e.g., "type/title" format). For finding notes by content or criteria, use search_notes instead.',
    inputSchema: z.object({
      ids: z
        .array(z.string())
        .describe(
          'Array of note IDs or identifiers. Examples: ["note-id-123"], ["meeting/Weekly Standup"], ["project/Q4 Planning", "daily/2025-01-15"]'
        )
    }),
    execute: async ({ ids }) => {
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

        const results = await flintApi.getNotes(currentVault.id, ids);
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

        return {
          success: true,
          data: note,
          message: `Created note: ${note.title}`
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

            // Publish note.renamed event
            if (renameResult.new_id) {
              publishNoteEvent({
                type: 'note.renamed',
                oldId: id,
                newId: renameResult.new_id
              });
            }
          }
        }

        await flintApi.updateNote(updates as Parameters<typeof flintApi.updateNote>[0]); // Cast to satisfy type checking for user-provided metadata

        // Get updated note to return
        const updatedNote = await flintApi.getNote(currentVault.id, updates.identifier);

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
      'Search notes by title and content, or list all notes with filtering options. Returns notes with content snippets for search queries, or full note metadata for listing.',
    inputSchema: z.object({
      query: z.string().optional().describe('Search query (empty for listing all notes)'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of results (default: 20, max: 100)'),
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

        let results;
        if (query) {
          // Perform search
          results = await flintApi.searchNotes({
            query,
            type_filter: noteType,
            limit: clampedLimit,
            vault_id: currentVault.id
          });

          // Convert SearchResult[] to Note-like objects and apply filters
          let notes = await Promise.all(
            results.map(async (result) => {
              try {
                return await flintApi.getNote(currentVault.id, result.id);
              } catch {
                // If note can't be retrieved, create a minimal representation
                return {
                  id: result.id,
                  title: result.title,
                  type: result.type || 'unknown',
                  content: result.content || '',
                  snippet: result.snippet,
                  metadata: {},
                  created: '',
                  updated: ''
                };
              }
            })
          );

          // Apply client-side filters
          notes = this.applyFilters(notes, { tags, dateRange });

          // Sort if specified (relevance is default from search)
          if (sortBy !== 'relevance') {
            notes = this.sortNotes(notes, sortBy);
          }

          return {
            success: true,
            data: notes.slice(0, clampedLimit),
            message: `Found ${notes.length} note(s) matching query: ${query}`
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

        const result = await flintApi.deleteNote({
          identifier: id,
          confirm: true,
          vaultId: currentVault.id
        });

        // Publish note.deleted event if deletion was successful
        if (result.deleted) {
          publishNoteEvent({
            type: 'note.deleted',
            noteId: id
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

  private deleteCustomFunctionTool = tool({
    description:
      'Delete a registered custom function. This permanently removes the function and it will no longer be available for use.',
    inputSchema: z.object({
      id: z.string().optional().describe('ID of the custom function to delete'),
      name: z.string().optional().describe('Name of the custom function to delete')
    }),
    execute: async ({ id, name }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      // Either id or name must be provided
      if (!id && !name) {
        return {
          success: false,
          error: 'Missing required parameter',
          message: 'Either id or name must be provided to delete a custom function'
        };
      }

      try {
        // If name is provided but not id, look up the function by name
        let functionId = id;
        if (!functionId && name) {
          const func = await this.customFunctionsApi.getFunction({ name });
          if (!func) {
            return {
              success: false,
              error: `Custom function '${name}' not found`,
              message: `No custom function named '${name}' is registered`
            };
          }
          functionId = func.id;
        }

        const result = await this.customFunctionsApi.deleteFunction({ id: functionId! });

        if (result.success) {
          return {
            success: true,
            message: `Custom function ${name ? `'${name}'` : `with ID '${functionId}'`} deleted successfully`
          };
        } else {
          return {
            success: false,
            error: 'Function not found',
            message: `Custom function ${name ? `'${name}'` : `with ID '${functionId}'`} not found`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to delete custom function: ${error instanceof Error ? error.message : String(error)}`
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
            this.todoPlanService.addTodos(plan.id, todos);
            return {
              success: true,
              data: { planId: plan.id, todosAdded: todos.length },
              message: `Added ${todos.length} todo(s) to plan`
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
}
