/**
 * flint-note MCP Server
 *
 * Core MCP server class that provides agent-first note-taking functionality.
 * Use src/index.ts as the entry point to run the server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { Workspace } from './core/workspace.js';
import { NoteManager } from './core/notes.js';
import { NoteTypeManager } from './core/note-types.js';
import { HybridSearchManager } from './database/search-manager.js';
import type { NoteRow } from './database/schema.js';

import { LinkExtractor } from './core/link-extractor.js';
import { GlobalConfigManager } from './utils/global-config.js';
import { resolvePath, isPathSafe } from './utils/path.js';
import type { NoteMetadata } from './types/index.js';
import type { MetadataSchema, MetadataFieldDefinition } from './core/metadata-schema.js';
import { MetadataSchemaParser } from './core/metadata-schema.js';
import {
  generateContentHash,
  createNoteTypeHashableContent
} from './utils/content-hash.js';
import fs from 'fs/promises';
import path from 'path';

export interface ServerConfig {
  workspacePath?: string;
  throwOnError?: boolean;
}

interface CreateNoteTypeArgs {
  type_name: string;
  description: string;
  agent_instructions?: string[];
  metadata_schema?: MetadataSchema;
}

interface CreateNoteArgs {
  type?: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  notes?: Array<{
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface GetNoteArgs {
  identifier: string;
}

interface UpdateNoteArgs {
  identifier?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  content_hash?: string;
  updates?: Array<{
    identifier: string;
    content?: string;
    metadata?: Record<string, unknown>;
    content_hash: string;
  }>;
}

interface SearchNotesArgs {
  query?: string;
  type_filter?: string;
  limit?: number;
  use_regex?: boolean;
}

interface SearchNotesAdvancedArgs {
  type?: string;
  metadata_filters?: Array<{
    key: string;
    value: string;
    operator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  }>;
  updated_within?: string;
  updated_before?: string;
  created_within?: string;
  created_before?: string;
  content_contains?: string;
  sort?: Array<{
    field: 'title' | 'type' | 'created' | 'updated' | 'size';
    order: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

interface SearchNotesSqlArgs {
  query: string;
  params?: (string | number | boolean | null)[];
  limit?: number;
  timeout?: number;
}

interface ListNoteTypesArgs {
  // Empty interface for consistency
  [key: string]: never;
}

interface UpdateNoteTypeArgs {
  type_name: string;
  instructions?: string;
  description?: string;
  metadata_schema?: MetadataFieldDefinition[];
  content_hash: string;
}

interface GetNoteTypeInfoArgs {
  type_name: string;
}

interface CreateVaultArgs {
  id: string;
  name: string;
  path: string;
  description?: string;
  initialize?: boolean;
  switch_to?: boolean;
}

interface SwitchVaultArgs {
  id: string;
}

interface RemoveVaultArgs {
  id: string;
}

interface UpdateVaultArgs {
  id: string;
  name?: string;
  description?: string;
}

interface GetNoteInfoArgs {
  title_or_filename: string;
  type?: string;
}

interface ListNotesByTypeArgs {
  type: string;
  limit?: number;
}

interface DeleteNoteArgs {
  identifier: string;
  confirm?: boolean;
}

interface DeleteNoteTypeArgs {
  type_name: string;
  action: 'error' | 'migrate' | 'delete';
  target_type?: string;
  confirm?: boolean;
}

interface BulkDeleteNotesArgs {
  type?: string;
  tags?: string[];
  pattern?: string;
  confirm?: boolean;
}

interface RenameNoteArgs {
  identifier: string;
  new_title: string;
  content_hash: string;
}

export class FlintNoteServer {
  #server: Server;
  #workspace!: Workspace;
  #noteManager!: NoteManager;
  #noteTypeManager!: NoteTypeManager;
  #hybridSearchManager!: HybridSearchManager;

  #globalConfig: GlobalConfigManager;
  #config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.#config = config;
    this.#server = new Server(
      {
        name: 'flint-note',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.#globalConfig = new GlobalConfigManager();
    this.#setupHandlers();
  }

  async initialize(): Promise<void> {
    try {
      // Load global config first
      await this.#globalConfig.load();

      // If workspace path is provided explicitly, use it
      if (this.#config.workspacePath) {
        const workspacePath = this.#config.workspacePath;
        this.#hybridSearchManager = new HybridSearchManager(workspacePath);
        this.#workspace = new Workspace(
          workspacePath,
          this.#hybridSearchManager.getDatabaseManager()
        );

        // Check if workspace has any note type descriptions
        const flintNoteDir = path.join(workspacePath, '.flint-note');
        let hasDescriptions = false;

        try {
          const files = await fs.readdir(flintNoteDir);
          hasDescriptions = files.some(entry => entry.endsWith('_description.md'));
        } catch {
          // .flint-note directory doesn't exist or is empty
          hasDescriptions = false;
        }

        if (!hasDescriptions) {
          // No note type descriptions found - initialize as a vault with default note types
          await this.#workspace.initializeVault();
        } else {
          // Existing workspace with note types - just initialize
          await this.#workspace.initialize();
        }

        this.#noteManager = new NoteManager(this.#workspace, this.#hybridSearchManager);
        this.#noteTypeManager = new NoteTypeManager(this.#workspace);

        // Initialize hybrid search index - only rebuild if necessary
        try {
          const stats = await this.#hybridSearchManager.getStats();
          const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
          const isEmptyIndex = stats.noteCount === 0;

          // Check if index exists but might be stale
          const shouldRebuild = forceRebuild || isEmptyIndex;

          if (shouldRebuild) {
            console.error('Rebuilding hybrid search index on startup...');
            await this.#hybridSearchManager.rebuildIndex((processed, total) => {
              if (processed % 5 === 0 || processed === total) {
                console.error(
                  `Hybrid search index: ${processed}/${total} notes processed`
                );
              }
            });
            console.error('Hybrid search index rebuilt successfully');
          } else {
            console.error(`Hybrid search index ready (${stats.noteCount} notes indexed)`);
          }
        } catch (error) {
          console.error(
            'Warning: Failed to initialize hybrid search index on startup:',
            error
          );
        }

        console.error(
          `flint-note server initialized successfully with workspace: ${workspacePath}`
        );
      } else {
        // No explicit workspace - check for current vault
        const currentVault = this.#globalConfig.getCurrentVault();

        if (currentVault) {
          // Initialize with current vault
          this.#hybridSearchManager = new HybridSearchManager(currentVault.path);
          this.#workspace = new Workspace(
            currentVault.path,
            this.#hybridSearchManager.getDatabaseManager()
          );
          await this.#workspace.initialize();
          this.#noteManager = new NoteManager(this.#workspace, this.#hybridSearchManager);
          this.#noteTypeManager = new NoteTypeManager(this.#workspace);

          // Initialize hybrid search index - only rebuild if necessary
          try {
            const stats = await this.#hybridSearchManager.getStats();
            const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
            const isEmptyIndex = stats.noteCount === 0;

            // Check if index exists but might be stale
            const shouldRebuild = forceRebuild || isEmptyIndex;

            if (shouldRebuild) {
              console.error('Rebuilding hybrid search index on startup...');
              await this.#hybridSearchManager.rebuildIndex((processed, total) => {
                if (processed % 5 === 0 || processed === total) {
                  console.error(
                    `Hybrid search index: ${processed}/${total} notes processed`
                  );
                }
              });
              console.error('Hybrid search index rebuilt successfully');
            } else {
              console.error(
                `Hybrid search index ready (${stats.noteCount} notes indexed)`
              );
            }
          } catch (error) {
            console.error(
              'Warning: Failed to initialize hybrid search index on startup:',
              error
            );
          }

          console.error(
            `flint-note server initialized successfully with vault: ${currentVault.name}`
          );
        } else {
          // No vault configured - start without workspace
          console.error(
            'flint-note server initialized successfully (no vault configured)'
          );
          console.error('Use vault management tools to create and switch to a vault.');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to initialize flint-note server:', errorMessage);

      if (this.#config.throwOnError) {
        throw error;
      }

      process.exit(1);
    }
  }

  #setupHandlers(): void {
    // List available tools
    this.#server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_note_type',
            description:
              'Create a new note type with description, agent instructions, and metadata schema',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the note type (filesystem-safe)'
                },
                description: {
                  type: 'string',
                  description: 'Description of the note type purpose and usage'
                },
                agent_instructions: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Optional custom agent instructions for this note type'
                },
                metadata_schema: {
                  type: 'object',
                  properties: {
                    fields: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: {
                            type: 'string',
                            description: 'Name of the metadata field'
                          },
                          type: {
                            type: 'string',
                            enum: [
                              'string',
                              'number',
                              'boolean',
                              'date',
                              'array',
                              'select'
                            ],
                            description: 'Type of the metadata field'
                          },
                          description: {
                            type: 'string',
                            description: 'Optional description of the field'
                          },
                          required: {
                            type: 'boolean',
                            description: 'Whether this field is required'
                          },
                          constraints: {
                            type: 'object',
                            description:
                              'Optional field constraints (min, max, options, etc.)'
                          },
                          default: {
                            description: 'Optional default value for the field'
                          }
                        },
                        required: ['name', 'type']
                      }
                    },
                    version: {
                      type: 'string',
                      description: 'Optional schema version'
                    }
                  },
                  required: ['fields'],
                  description: 'Optional metadata schema definition for this note type'
                }
              },
              required: ['type_name', 'description']
            }
          },
          {
            name: 'create_note',
            description: 'Create one or more notes of the specified type(s)',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description:
                    'Note type (must exist) - only used for single note creation'
                },
                title: {
                  type: 'string',
                  description: 'Title of the note - only used for single note creation'
                },
                content: {
                  type: 'string',
                  description:
                    'Content of the note in markdown format - only used for single note creation'
                },
                metadata: {
                  type: 'object',
                  description:
                    'Additional metadata fields for the note (validated against note type schema) - only used for single note creation',
                  additionalProperties: true
                },
                notes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        description: 'Note type (must exist)'
                      },
                      title: {
                        type: 'string',
                        description: 'Title of the note'
                      },
                      content: {
                        type: 'string',
                        description: 'Content of the note in markdown format'
                      },
                      metadata: {
                        type: 'object',
                        description: 'Additional metadata fields for the note',
                        additionalProperties: true
                      }
                    },
                    required: ['type', 'title', 'content']
                  },
                  description: 'Array of notes to create - used for batch creation'
                }
              },
              required: []
            }
          },
          {
            name: 'get_note',
            description: 'Retrieve a specific note by identifier',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier in format "type/filename" or full path'
                }
              },
              required: ['identifier']
            }
          },
          {
            name: 'update_note',
            description: 'Update one or more existing notes',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description:
                    'Note identifier in format "type/filename" or full path - only used for single note update'
                },
                content: {
                  type: 'string',
                  description:
                    'New content for the note - only used for single note update'
                },
                content_hash: {
                  type: 'string',
                  description:
                    'Content hash of the current note for optimistic locking - required for single note update'
                },
                metadata: {
                  type: 'object',
                  description:
                    'Metadata fields to update - only used for single note update',
                  additionalProperties: true
                },
                updates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      identifier: {
                        type: 'string',
                        description:
                          'Note identifier in format "type/filename" or full path'
                      },
                      content: {
                        type: 'string',
                        description: 'New content for the note'
                      },
                      content_hash: {
                        type: 'string',
                        description: 'Content hash for optimistic locking'
                      },
                      metadata: {
                        type: 'object',
                        description: 'Metadata fields to update',
                        additionalProperties: true
                      }
                    },
                    required: ['identifier', 'content_hash']
                  },
                  description:
                    'Array of note updates (must specify content, metadata, or both) - used for batch updates'
                }
              },
              required: []
            }
          },
          {
            name: 'search_notes',
            description:
              'Search notes by content and/or type. Empty queries return all notes sorted by last updated.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query or regex pattern. Empty string or omitted returns all notes.'
                },
                type_filter: {
                  type: 'string',
                  description: 'Optional filter by note type'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 10
                },
                use_regex: {
                  type: 'boolean',
                  description: 'Enable regex pattern matching',
                  default: false
                }
              },
              required: []
            }
          },
          {
            name: 'search_notes_advanced',
            description:
              'Advanced search with structured filters for metadata, dates, and content',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Filter by note type'
                },
                metadata_filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string', description: 'Metadata key to filter on' },
                      value: { type: 'string', description: 'Value to match' },
                      operator: {
                        type: 'string',
                        enum: ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'],
                        default: '=',
                        description: 'Comparison operator'
                      }
                    },
                    required: ['key', 'value']
                  },
                  description: 'Array of metadata filters'
                },
                updated_within: {
                  type: 'string',
                  description:
                    'Find notes updated within time period (e.g., "7d", "1w", "2m")'
                },
                updated_before: {
                  type: 'string',
                  description:
                    'Find notes updated before time period (e.g., "7d", "1w", "2m")'
                },
                created_within: {
                  type: 'string',
                  description: 'Find notes created within time period'
                },
                created_before: {
                  type: 'string',
                  description: 'Find notes created before time period'
                },
                content_contains: {
                  type: 'string',
                  description: 'Search within note content'
                },
                sort: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: {
                        type: 'string',
                        enum: ['title', 'type', 'created', 'updated', 'size']
                      },
                      order: {
                        type: 'string',
                        enum: ['asc', 'desc']
                      }
                    },
                    required: ['field', 'order']
                  },
                  description: 'Sort order for results'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 50
                },
                offset: {
                  type: 'number',
                  description: 'Number of results to skip',
                  default: 0
                }
              },
              required: []
            }
          },
          {
            name: 'search_notes_sql',
            description:
              'Direct SQL search against notes database for maximum flexibility. Only SELECT queries allowed.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'SQL SELECT query. Tables: notes (id, title, content, type, filename, path, created, updated, size), note_metadata (note_id, key, value, value_type)'
                },
                params: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional parameters for parameterized queries'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 1000
                },
                timeout: {
                  type: 'number',
                  description: 'Query timeout in milliseconds',
                  default: 30000
                }
              },
              required: ['query']
            }
          },
          {
            name: 'list_note_types',
            description:
              'List all available note types with their purposes and agent instructions',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },

          {
            name: 'update_note_type',
            description: 'Update one or more fields of an existing note type',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the note type to update'
                },
                instructions: {
                  type: 'string',
                  description: 'New agent instructions for the note type'
                },
                description: {
                  type: 'string',
                  description: 'New description for the note type'
                },
                metadata_schema: {
                  type: 'array',
                  description: 'Array of metadata field definitions',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Field name'
                      },
                      type: {
                        type: 'string',
                        enum: ['string', 'number', 'boolean', 'date', 'array', 'select'],
                        description: 'Field type'
                      },
                      description: {
                        type: 'string',
                        description: 'Human-readable description of the field'
                      },
                      required: {
                        type: 'boolean',
                        description: 'Whether the field is required'
                      },
                      constraints: {
                        type: 'object',
                        description: 'Field constraints',
                        properties: {
                          min: { type: 'number' },
                          max: { type: 'number' },
                          pattern: { type: 'string' },
                          options: {
                            type: 'array',
                            items: { type: 'string' }
                          }
                        }
                      },
                      default: {
                        description: 'Default value for the field'
                      }
                    },
                    required: ['name', 'type']
                  }
                },
                content_hash: {
                  type: 'string',
                  description:
                    'Content hash of the current note type definition to prevent conflicts'
                }
              },
              required: ['type_name', 'content_hash']
            }
          },
          {
            name: 'get_note_type_info',
            description:
              'Get comprehensive information about a note type including instructions and description',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the note type to get information for'
                }
              },
              required: ['type_name']
            }
          },
          {
            name: 'list_vaults',
            description: 'List all configured vaults with their status and information',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'create_vault',
            description: 'Create a new vault and add it to the vault registry',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique identifier for the vault (filesystem-safe)'
                },
                name: {
                  type: 'string',
                  description: 'Human-readable name for the vault'
                },
                path: {
                  type: 'string',
                  description: 'Directory path where the vault should be created'
                },
                description: {
                  type: 'string',
                  description: 'Optional description of the vault purpose'
                },
                initialize: {
                  type: 'boolean',
                  description: 'Whether to initialize with default note types',
                  default: true
                },
                switch_to: {
                  type: 'boolean',
                  description: 'Whether to switch to the new vault after creation',
                  default: true
                }
              },
              required: ['id', 'name', 'path']
            }
          },
          {
            name: 'switch_vault',
            description: 'Switch to a different vault',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'ID of the vault to switch to'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'remove_vault',
            description: 'Remove a vault from the registry (does not delete files)',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'ID of the vault to remove'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'get_current_vault',
            description: 'Get information about the currently active vault',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'update_vault',
            description: 'Update vault information (name or description)',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'ID of the vault to update'
                },
                name: {
                  type: 'string',
                  description: 'New name for the vault'
                },
                description: {
                  type: 'string',
                  description: 'New description for the vault'
                }
              },
              required: ['id']
            }
          },

          {
            name: 'get_note_info',
            description:
              'Get detailed information about a note including filename for link creation',
            inputSchema: {
              type: 'object',
              properties: {
                title_or_filename: {
                  type: 'string',
                  description: 'Note title or filename to look up'
                },
                type: {
                  type: 'string',
                  description: 'Optional: note type to narrow search'
                }
              },
              required: ['title_or_filename']
            }
          },
          {
            name: 'list_notes_by_type',
            description: 'List all notes of a specific type with filename information',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Note type to list'
                },
                limit: {
                  type: 'number',
                  description: 'Optional: maximum number of results (default: 50)',
                  default: 50
                }
              },
              required: ['type']
            }
          },

          {
            name: 'delete_note',
            description: 'Delete an existing note permanently',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier (type/filename format)'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Explicit confirmation required for deletion',
                  default: false
                }
              },
              required: ['identifier']
            }
          },
          {
            name: 'delete_note_type',
            description: 'Delete a note type and optionally handle existing notes',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the note type to delete'
                },
                action: {
                  type: 'string',
                  enum: ['error', 'migrate', 'delete'],
                  description:
                    'Action to take with existing notes: error (prevent deletion), migrate (move to target type), delete (remove all notes)'
                },
                target_type: {
                  type: 'string',
                  description:
                    'Target note type for migration (required when action is migrate)'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Explicit confirmation required for deletion',
                  default: false
                }
              },
              required: ['type_name', 'action']
            }
          },
          {
            name: 'bulk_delete_notes',
            description: 'Delete multiple notes matching criteria',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Filter by note type'
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Filter by tags (all tags must match)'
                },
                pattern: {
                  type: 'string',
                  description: 'Regex pattern to match note content or title'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Explicit confirmation required for bulk deletion',
                  default: false
                }
              }
            }
          },
          {
            name: 'rename_note',
            description:
              'Rename a note by updating its title field (display name). The filename and ID remain unchanged to preserve links. Automatically updates wikilinks in other notes that reference the old title.',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier in format "type/filename" or full path'
                },
                new_title: {
                  type: 'string',
                  description: 'New display title for the note'
                },
                content_hash: {
                  type: 'string',
                  description: 'Content hash of the current note for optimistic locking'
                }
              },
              required: ['identifier', 'new_title', 'content_hash']
            }
          },
          {
            name: 'get_note_links',
            description:
              'Get all links for a specific note (incoming, outgoing internal, and external)',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier (type/filename format)'
                }
              },
              required: ['identifier']
            }
          },
          {
            name: 'get_backlinks',
            description: 'Get all notes that link to the specified note',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier (type/filename format)'
                }
              },
              required: ['identifier']
            }
          },
          {
            name: 'find_broken_links',
            description: 'Find all broken wikilinks (links to non-existent notes)',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'search_by_links',
            description: 'Search for notes based on their link relationships',
            inputSchema: {
              type: 'object',
              properties: {
                has_links_to: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Find notes that link to any of these notes'
                },
                linked_from: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Find notes that are linked from any of these notes'
                },
                external_domains: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Find notes with external links to these domains'
                },
                broken_links: {
                  type: 'boolean',
                  description: 'Find notes with broken internal links'
                }
              }
            }
          },
          {
            name: 'migrate_links',
            description:
              'Scan all existing notes and populate the link tables (one-time migration)',
            inputSchema: {
              type: 'object',
              properties: {
                force: {
                  type: 'boolean',
                  description: 'Force migration even if link tables already contain data',
                  default: false
                }
              }
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.#server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_note_type':
            return await this.#handleCreateNoteType(
              args as unknown as CreateNoteTypeArgs
            );
          case 'create_note':
            return await this.#handleCreateNote(args as unknown as CreateNoteArgs);
          case 'get_note':
            return await this.#handleGetNote(args as unknown as GetNoteArgs);
          case 'update_note':
            return await this.#handleUpdateNote(args as unknown as UpdateNoteArgs);
          case 'search_notes':
            return await this.#handleSearchNotes(args as unknown as SearchNotesArgs);
          case 'search_notes_advanced':
            return await this.#handleSearchNotesAdvanced(
              args as unknown as SearchNotesAdvancedArgs
            );
          case 'search_notes_sql':
            return await this.#handleSearchNotesSQL(
              args as unknown as SearchNotesSqlArgs
            );
          case 'list_note_types':
            return await this.#handleListNoteTypes(args as unknown as ListNoteTypesArgs);

          case 'update_note_type':
            return await this.#handleUpdateNoteType(
              args as unknown as UpdateNoteTypeArgs
            );
          case 'get_note_type_info':
            return await this.#handleGetNoteTypeInfo(
              args as unknown as GetNoteTypeInfoArgs
            );
          case 'list_vaults':
            return await this.#handleListVaults();
          case 'create_vault':
            return await this.#handleCreateVault(args as unknown as CreateVaultArgs);
          case 'switch_vault':
            return await this.#handleSwitchVault(args as unknown as SwitchVaultArgs);
          case 'remove_vault':
            return await this.#handleRemoveVault(args as unknown as RemoveVaultArgs);
          case 'get_current_vault':
            return await this.#handleGetCurrentVault();
          case 'update_vault':
            return await this.#handleUpdateVault(args as unknown as UpdateVaultArgs);

          case 'get_note_info':
            return await this.#handleGetNoteInfo(args as unknown as GetNoteInfoArgs);
          case 'list_notes_by_type':
            return await this.#handleListNotesByType(
              args as unknown as ListNotesByTypeArgs
            );

          case 'delete_note':
            return await this.#handleDeleteNote(args as unknown as DeleteNoteArgs);
          case 'delete_note_type':
            return await this.#handleDeleteNoteType(
              args as unknown as DeleteNoteTypeArgs
            );
          case 'bulk_delete_notes':
            return await this.#handleBulkDeleteNotes(
              args as unknown as BulkDeleteNotesArgs
            );
          case 'rename_note':
            return await this.#handleRenameNote(args as unknown as RenameNoteArgs);

          case 'get_note_links':
            return await this.#handleGetNoteLinks(
              args as unknown as { identifier: string }
            );

          case 'get_backlinks':
            return await this.#handleGetBacklinks(
              args as unknown as { identifier: string }
            );

          case 'find_broken_links':
            return await this.#handleFindBrokenLinks();

          case 'search_by_links':
            return await this.#handleSearchByLinks(
              args as unknown as {
                has_links_to?: string[];
                linked_from?: string[];
                external_domains?: string[];
                broken_links?: boolean;
              }
            );

          case 'migrate_links':
            return await this.#handleMigrateLinks(args as unknown as { force?: boolean });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // For SQL security validation errors, throw as MCP protocol errors
        // so the client will properly throw exceptions
        if (
          name === 'search_notes_sql' &&
          errorMessage.includes('SELECT queries are allowed')
        ) {
          throw new Error(`SQL Security Error: ${errorMessage}`);
        }
        if (
          name === 'search_notes_sql' &&
          errorMessage.includes('Forbidden SQL keyword')
        ) {
          throw new Error(`SQL Security Error: ${errorMessage}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    });

    // List available resources
    this.#server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'flint-note://types',
            mimeType: 'application/json',
            name: 'Available note types',
            description: 'List of all available note types with their descriptions'
          },
          {
            uri: 'flint-note://recent',
            mimeType: 'application/json',
            name: 'Recently modified notes',
            description: 'List of recently modified notes'
          },
          {
            uri: 'flint-note://stats',
            mimeType: 'application/json',
            name: 'Workspace statistics',
            description: 'Statistics about the current workspace'
          }
        ]
      };
    });

    // Handle resource requests
    this.#server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;

      try {
        switch (uri) {
          case 'flint-note://types':
            return await this.#handleTypesResource();
          case 'flint-note://recent':
            return await this.#handleRecentResource();
          case 'flint-note://stats':
            return await this.#handleStatsResource();
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
      }
    });
  }

  /**
   * Helper method to ensure a workspace is available
   * Throws an error if no workspace is configured
   */
  #requireWorkspace(): void {
    if (!this.#workspace) {
      throw new Error(
        'No vault configured. Use the create_vault tool to create a new vault, or list_vaults and switch_vault to use an existing one.'
      );
    }
  }

  // Tool handlers
  #handleCreateNoteType = async (args: CreateNoteTypeArgs) => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    await this.#noteTypeManager.createNoteType(
      args.type_name,
      args.description,
      args.agent_instructions,
      args.metadata_schema
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Created note type '${args.type_name}' successfully`,
              type_name: args.type_name
            },
            null,
            2
          )
        }
      ]
    };
  };

  #handleCreateNote = async (args: CreateNoteArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager || !this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    // Handle batch creation if notes array is provided
    if (args.notes) {
      const result = await this.#noteManager.batchCreateNotes(args.notes);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    // Handle single note creation
    if (!args.type || !args.title || !args.content) {
      throw new Error('Single note creation requires type, title, and content');
    }

    const noteInfo = await this.#noteManager.createNote(
      args.type,
      args.title,
      args.content,
      args.metadata || {}
    );

    // Get agent instructions for this note type
    let agentInstructions: string[] = [];
    let nextSuggestions = '';
    try {
      const typeInfo = await this.#noteTypeManager.getNoteTypeDescription(args.type);
      agentInstructions = typeInfo.parsed.agentInstructions;
      if (agentInstructions.length > 0) {
        nextSuggestions = `Consider following these guidelines for ${args.type} notes: ${agentInstructions.join(', ')}`;
      }
    } catch {
      // Ignore errors getting type info, continue without instructions
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...noteInfo,
              agent_instructions: agentInstructions,
              next_suggestions: nextSuggestions
            },
            null,
            2
          )
        }
      ]
    };
  };

  #handleGetNote = async (args: GetNoteArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    const note = await this.#noteManager.getNote(args.identifier);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(note, null, 2)
        }
      ]
    };
  };

  #handleUpdateNote = async (args: UpdateNoteArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    // Handle batch updates if updates array is provided
    if (args.updates) {
      const result = await this.#noteManager.batchUpdateNotes(args.updates);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    // Handle single note update
    if (!args.identifier) {
      throw new Error('Single note update requires identifier');
    }

    if (!args.content_hash) {
      throw new Error('content_hash is required for all update operations');
    }

    let result;
    if (args.content !== undefined && args.metadata !== undefined) {
      // Both content and metadata update
      result = await this.#noteManager.updateNoteWithMetadata(
        args.identifier,
        args.content,
        args.metadata as NoteMetadata,
        args.content_hash
      );
    } else if (args.content !== undefined) {
      // Content-only update
      result = await this.#noteManager.updateNote(
        args.identifier,
        args.content,
        args.content_hash
      );
    } else if (args.metadata !== undefined) {
      // Metadata-only update
      const currentNote = await this.#noteManager.getNote(args.identifier);
      if (!currentNote) {
        throw new Error(`Note '${args.identifier}' not found`);
      }
      result = await this.#noteManager.updateNoteWithMetadata(
        args.identifier,
        currentNote.content,
        args.metadata as NoteMetadata,
        args.content_hash
      );
    } else {
      throw new Error('Either content or metadata must be provided for update');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  };

  #handleSearchNotes = async (args: SearchNotesArgs) => {
    this.#requireWorkspace();
    if (!this.#hybridSearchManager) {
      throw new Error('Hybrid search manager not initialized');
    }

    const results = await this.#hybridSearchManager.searchNotes(
      args.query,
      args.type_filter,
      args.limit,
      args.use_regex
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  };

  #handleSearchNotesAdvanced = async (args: SearchNotesAdvancedArgs) => {
    this.#requireWorkspace();
    if (!this.#hybridSearchManager) {
      throw new Error('Hybrid search manager not initialized');
    }

    const results = await this.#hybridSearchManager.searchNotesAdvanced(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  };

  #handleSearchNotesSQL = async (args: SearchNotesSqlArgs) => {
    this.#requireWorkspace();
    if (!this.#hybridSearchManager) {
      throw new Error('Hybrid search manager not initialized');
    }

    const results = await this.#hybridSearchManager.searchNotesSQL(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  };

  #handleListNoteTypes = async (_args: ListNoteTypesArgs) => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    const types = await this.#noteTypeManager.listNoteTypes();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(types, null, 2)
        }
      ]
    };
  };

  #handleUpdateNoteType = async (args: UpdateNoteTypeArgs) => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    try {
      if (!args.content_hash) {
        throw new Error('content_hash is required for all note type update operations');
      }

      // Validate that at least one field is provided
      if (
        args.instructions === undefined &&
        args.description === undefined &&
        args.metadata_schema === undefined
      ) {
        throw new Error(
          'At least one field must be provided: instructions, description, or metadata_schema'
        );
      }

      // Get current note type info
      const currentInfo = await this.#noteTypeManager.getNoteTypeDescription(
        args.type_name
      );

      // Validate content hash to prevent conflicts
      const currentHashableContent = createNoteTypeHashableContent({
        description: currentInfo.description,
        agent_instructions: currentInfo.parsed.agentInstructions.join('\n'),
        metadata_schema: currentInfo.metadataSchema
      });
      const currentHash = generateContentHash(currentHashableContent);

      if (currentHash !== args.content_hash) {
        const error = new Error(
          'Note type definition has been modified since last read. Please fetch the latest version.'
        ) as Error & {
          code: string;
          current_hash: string;
          provided_hash: string;
        };
        error.code = 'content_hash_mismatch';
        error.current_hash = currentHash;
        error.provided_hash = args.content_hash;
        throw error;
      }

      // Start with current description
      let updatedDescription = currentInfo.description;
      const fieldsUpdated: string[] = [];

      // Update instructions if provided
      if (args.instructions) {
        // Parse instructions from value (can be newline-separated or bullet points)
        const instructions = args.instructions
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => (line.startsWith('-') ? line.substring(1).trim() : line))
          .map(line => `- ${line}`)
          .join('\n');

        // Use the current description and replace the agent instructions section
        updatedDescription = updatedDescription.replace(
          /## Agent Instructions\n[\s\S]*?(?=\n## |$)/,
          `## Agent Instructions\n${instructions}\n`
        );
        fieldsUpdated.push('instructions');
      }

      // Update description if provided
      if (args.description) {
        updatedDescription = this.#noteTypeManager.formatNoteTypeDescription(
          args.type_name,
          args.description
        );
        fieldsUpdated.push('description');
      }

      // Update metadata schema if provided
      if (args.metadata_schema) {
        const fields = args.metadata_schema;

        // Validate each field definition
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          if (!field || typeof field !== 'object') {
            throw new Error(`Field at index ${i} must be an object`);
          }

          if (!field.name || typeof field.name !== 'string') {
            throw new Error(`Field at index ${i} must have a valid "name" string`);
          }

          if (!field.type || typeof field.type !== 'string') {
            throw new Error(`Field at index ${i} must have a valid "type" string`);
          }

          // Check for protected fields
          const protectedFields = new Set(['title', 'filename', 'created', 'updated']);
          if (protectedFields.has(field.name)) {
            throw new Error(
              `Cannot define protected field "${field.name}" in metadata schema. ` +
                `These fields are automatically managed by the system and cannot be redefined.`
            );
          }

          const validTypes = ['string', 'number', 'boolean', 'date', 'array', 'select'];
          if (!validTypes.includes(field.type)) {
            throw new Error(
              `Field "${field.name}" has invalid type "${field.type}". Valid types: ${validTypes.join(', ')}`
            );
          }

          // Validate constraints if present
          if (field.constraints) {
            if (typeof field.constraints !== 'object') {
              throw new Error(`Field "${field.name}" constraints must be an object`);
            }

            // Validate select field options
            if (field.type === 'select') {
              if (
                !field.constraints.options ||
                !Array.isArray(field.constraints.options)
              ) {
                throw new Error(
                  `Select field "${field.name}" must have constraints.options array`
                );
              }
              if (field.constraints.options.length === 0) {
                throw new Error(
                  `Select field "${field.name}" must have at least one option`
                );
              }
            }

            // Validate numeric constraints
            if (
              field.constraints.min !== undefined &&
              typeof field.constraints.min !== 'number'
            ) {
              throw new Error(`Field "${field.name}" min constraint must be a number`);
            }
            if (
              field.constraints.max !== undefined &&
              typeof field.constraints.max !== 'number'
            ) {
              throw new Error(`Field "${field.name}" max constraint must be a number`);
            }
            if (
              field.constraints.min !== undefined &&
              field.constraints.max !== undefined &&
              field.constraints.min > field.constraints.max
            ) {
              throw new Error(
                `Field "${field.name}" min constraint cannot be greater than max`
              );
            }

            // Validate pattern constraint
            if (field.constraints.pattern !== undefined) {
              if (typeof field.constraints.pattern !== 'string') {
                throw new Error(
                  `Field "${field.name}" pattern constraint must be a string`
                );
              }
              try {
                new RegExp(field.constraints.pattern);
              } catch (regexError) {
                throw new Error(
                  `Field "${field.name}" pattern constraint is not a valid regex: ${regexError instanceof Error ? regexError.message : 'Unknown regex error'}`
                );
              }
            }
          }

          // Validate default values if present
          if (field.default !== undefined) {
            const validationError = this.#validateDefaultValue(
              field.name,
              field.default,
              field
            );
            if (validationError) {
              throw new Error(validationError);
            }
          }
        }

        // Check for duplicate field names
        const fieldNames = fields.map(f => f.name);
        const duplicates = fieldNames.filter(
          (name, index) => fieldNames.indexOf(name) !== index
        );
        if (duplicates.length > 0) {
          throw new Error(`Duplicate field names found: ${duplicates.join(', ')}`);
        }

        // Create MetadataSchema object and generate the schema section
        const parsedSchema = { fields };
        const schemaSection = MetadataSchemaParser.generateSchemaSection(parsedSchema);

        updatedDescription = updatedDescription.replace(
          /## Metadata Schema\n[\s\S]*$/,
          schemaSection
        );
        fieldsUpdated.push('metadata_schema');
      }

      // Write the updated description to the file in note type directory
      const descriptionPath = path.join(
        this.#workspace.getNoteTypePath(args.type_name),
        '_description.md'
      );
      await fs.writeFile(descriptionPath, updatedDescription, 'utf-8');

      // Get the updated note type info
      const result = await this.#noteTypeManager.getNoteTypeDescription(args.type_name);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                type_name: args.type_name,
                fields_updated: fieldsUpdated,
                updated_info: {
                  name: result.name,
                  purpose: result.parsed.purpose,
                  agent_instructions: result.parsed.agentInstructions
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  };

  /**
   * Helper method to validate default values against field definitions
   */
  #validateDefaultValue(
    fieldName: string,
    defaultValue: unknown,
    fieldDef: MetadataFieldDefinition
  ): string | null {
    switch (fieldDef.type) {
      case 'string':
        if (typeof defaultValue !== 'string') {
          return `Field "${fieldName}" default value must be a string`;
        }
        break;

      case 'number':
        if (typeof defaultValue !== 'number' || isNaN(defaultValue)) {
          return `Field "${fieldName}" default value must be a number`;
        }
        if (
          fieldDef.constraints?.min !== undefined &&
          defaultValue < fieldDef.constraints.min
        ) {
          return `Field "${fieldName}" default value must be at least ${fieldDef.constraints.min}`;
        }
        if (
          fieldDef.constraints?.max !== undefined &&
          defaultValue > fieldDef.constraints.max
        ) {
          return `Field "${fieldName}" default value must be at most ${fieldDef.constraints.max}`;
        }
        break;

      case 'boolean':
        if (typeof defaultValue !== 'boolean') {
          return `Field "${fieldName}" default value must be a boolean`;
        }
        break;

      case 'date':
        if (typeof defaultValue !== 'string' || isNaN(Date.parse(defaultValue))) {
          return `Field "${fieldName}" default value must be a valid date string`;
        }
        break;

      case 'array':
        if (!Array.isArray(defaultValue)) {
          return `Field "${fieldName}" default value must be an array`;
        }
        if (
          fieldDef.constraints?.min !== undefined &&
          defaultValue.length < fieldDef.constraints.min
        ) {
          return `Field "${fieldName}" default value array must have at least ${fieldDef.constraints.min} items`;
        }
        if (
          fieldDef.constraints?.max !== undefined &&
          defaultValue.length > fieldDef.constraints.max
        ) {
          return `Field "${fieldName}" default value array must have at most ${fieldDef.constraints.max} items`;
        }
        break;

      case 'select':
        if (!fieldDef.constraints?.options?.includes(String(defaultValue))) {
          return `Field "${fieldName}" default value must be one of: ${fieldDef.constraints?.options?.join(', ')}`;
        }
        break;
    }

    return null;
  }

  #handleGetNoteTypeInfo = async (args: GetNoteTypeInfoArgs) => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    const info = await this.#noteTypeManager.getNoteTypeDescription(args.type_name);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              type_name: info.name,
              description: info.parsed.purpose,
              agent_instructions: info.parsed.agentInstructions,
              metadata_schema: info.parsed.parsedMetadataSchema,
              content_hash: info.content_hash,
              path: info.path
            },
            null,
            2
          )
        }
      ]
    };
  };

  // Resource handlers
  #handleTypesResource = async () => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    const types = await this.#noteTypeManager.listNoteTypes();
    return {
      contents: [
        {
          uri: 'flint-note://types',
          mimeType: 'application/json',
          text: JSON.stringify(types, null, 2)
        }
      ]
    };
  };

  #handleRecentResource = async () => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    const recentNotes = await this.#noteManager.listNotes(undefined, 20);
    return {
      contents: [
        {
          uri: 'flint-note://recent',
          mimeType: 'application/json',
          text: JSON.stringify(recentNotes, null, 2)
        }
      ]
    };
  };

  #handleStatsResource = async () => {
    this.#requireWorkspace();
    if (!this.#workspace) {
      throw new Error('Server not initialized');
    }

    const stats = await this.#workspace.getStats();
    return {
      contents: [
        {
          uri: 'flint-note://stats',
          mimeType: 'application/json',
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  };

  #handleGetNoteInfo = async (args: GetNoteInfoArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    // Try to find the note by title or filename
    const searchResults = await this.#noteManager.searchNotes({
      query: args.title_or_filename,
      type_filter: args.type,
      limit: 5
    });

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                found: false,
                message: `No note found with title or filename: ${args.title_or_filename}`
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Return the best match with filename info
    const bestMatch = searchResults[0];
    const filename = bestMatch.filename.replace('.md', '');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              found: true,
              filename: filename,
              title: bestMatch.title,
              type: bestMatch.type,
              path: bestMatch.path,
              wikilink_format: `${bestMatch.type}/${filename}`,
              suggested_wikilink: `[[${bestMatch.type}/${filename}|${bestMatch.title}]]`
            },
            null,
            2
          )
        }
      ]
    };
  };

  #handleListNotesByType = async (args: ListNotesByTypeArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    const notes = await this.#noteManager.searchNotes({
      type_filter: args.type,
      limit: args.limit || 50
    });

    const notesWithFilenames = notes.map(note => ({
      filename: note.filename.replace('.md', ''),
      title: note.title,
      type: note.type,
      path: note.path,
      created: note.created,
      modified: note.modified,
      wikilink_format: `${note.type}/${note.filename.replace('.md', '')}`,
      suggested_wikilink: `[[${note.type}/${note.filename.replace('.md', '')}|${note.title}]]`
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(notesWithFilenames, null, 2)
        }
      ]
    };
  };

  #handleDeleteNote = async (args: DeleteNoteArgs) => {
    this.#requireWorkspace();

    try {
      const result = await this.#noteManager.deleteNote(args.identifier, args.confirm);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note '${args.identifier}' deleted successfully`,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ]
      };
    }
  };

  #handleDeleteNoteType = async (args: DeleteNoteTypeArgs) => {
    this.#requireWorkspace();

    try {
      const result = await this.#noteTypeManager.deleteNoteType(
        args.type_name,
        args.action,
        args.target_type,
        args.confirm
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note type '${args.type_name}' deleted successfully`,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ]
      };
    }
  };

  #handleBulkDeleteNotes = async (args: BulkDeleteNotesArgs) => {
    this.#requireWorkspace();

    try {
      const criteria = {
        type: args.type,
        tags: args.tags,
        pattern: args.pattern
      };

      const results = await this.#noteManager.bulkDeleteNotes(criteria, args.confirm);

      const successCount = results.filter(r => r.deleted).length;
      const failureCount = results.length - successCount;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Bulk delete completed: ${successCount} deleted, ${failureCount} failed`,
                results,
                summary: {
                  total: results.length,
                  successful: successCount,
                  failed: failureCount
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ]
      };
    }
  };

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.#server.connect(transport);
    console.error('Flint Note MCP server running on stdio');
  }

  // Vault management handlers
  #handleListVaults = async (): Promise<{
    content: Array<{ type: string; text: string }>;
  }> => {
    try {
      const vaults = this.#globalConfig.listVaults();

      if (vaults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vaults configured. Use create_vault to add your first vault.'
            }
          ]
        };
      }

      const vaultList = vaults
        .map(({ id, info, is_current }) => {
          const indicator = is_current ? '🟢 (current)' : '⚪';
          return `${indicator} **${id}**: ${info.name}\n   Path: ${info.path}\n   Created: ${new Date(info.created).toLocaleDateString()}\n   Last accessed: ${new Date(info.last_accessed).toLocaleDateString()}${info.description ? `\n   Description: ${info.description}` : ''}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `📁 **Configured Vaults**\n\n${vaultList}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list vaults: ${errorMessage}`
          }
        ]
      };
    }
  };

  #handleCreateVault = async (
    args: CreateVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      // Validate vault ID
      if (!this.#globalConfig.isValidVaultId(args.id)) {
        throw new Error(
          `Invalid vault ID '${args.id}'. Must contain only letters, numbers, hyphens, and underscores.`
        );
      }

      // Check if vault already exists
      if (this.#globalConfig.hasVault(args.id)) {
        throw new Error(`Vault with ID '${args.id}' already exists`);
      }

      // Resolve path with tilde expansion
      const resolvedPath = resolvePath(args.path);

      // Validate path safety
      if (!isPathSafe(args.path)) {
        throw new Error(`Invalid or unsafe path: ${args.path}`);
      }

      // Ensure directory exists
      await fs.mkdir(resolvedPath, { recursive: true });

      // Add vault to registry
      await this.#globalConfig.addVault(
        args.id,
        args.name,
        resolvedPath,
        args.description
      );

      let initMessage = '';
      if (args.initialize !== false) {
        // Initialize the vault with default note types
        const tempHybridSearchManager = new HybridSearchManager(resolvedPath);
        const workspace = new Workspace(
          resolvedPath,
          tempHybridSearchManager.getDatabaseManager()
        );
        await workspace.initializeVault();
        initMessage =
          '\n\n✅ Vault initialized with default note types (daily, reading, todos, projects, goals, games, movies)';
      }

      let switchMessage = '';
      if (args.switch_to !== false) {
        // Switch to the new vault
        await this.#globalConfig.switchVault(args.id);

        // Reinitialize server with new vault
        await this.initialize();

        switchMessage = '\n\n🔄 Switched to new vault';
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Created vault '${args.name}' (${args.id}) at: ${resolvedPath}${initMessage}${switchMessage}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  #handleSwitchVault = async (
    args: SwitchVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      const vault = this.#globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      // Switch to the vault
      await this.#globalConfig.switchVault(args.id);

      // Reinitialize server with new vault
      await this.initialize();

      return {
        content: [
          {
            type: 'text',
            text: `🔄 Switched to vault: ${vault.name} (${args.id})\nPath: ${vault.path}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to switch vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  #handleRemoveVault = async (
    args: RemoveVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      const vault = this.#globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      const wasCurrentVault = this.#globalConfig.getCurrentVault()?.path === vault.path;

      // Remove vault from registry
      await this.#globalConfig.removeVault(args.id);

      let switchMessage = '';
      if (wasCurrentVault) {
        // Reinitialize server if we removed the current vault
        await this.initialize();
        const newCurrent = this.#globalConfig.getCurrentVault();
        if (newCurrent) {
          switchMessage = `\n\n🔄 Switched to vault: ${newCurrent.name}`;
        } else {
          switchMessage =
            '\n\n⚠️  No vaults remaining. You may want to create a new vault.';
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Removed vault '${vault.name}' (${args.id}) from registry.\n\n⚠️  Note: Vault files at '${vault.path}' were not deleted.${switchMessage}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to remove vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  #handleGetCurrentVault = async (): Promise<{
    content: Array<{ type: string; text: string }>;
  }> => {
    try {
      const currentVault = this.#globalConfig.getCurrentVault();

      if (!currentVault) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️  No vault is currently selected. Use list_vaults to see available vaults or create_vault to add a new one.'
            }
          ]
        };
      }

      // Find the vault ID
      const vaults = this.#globalConfig.listVaults();
      const currentVaultEntry = vaults.find(v => v.is_current);
      const vaultId = currentVaultEntry?.id || 'unknown';

      return {
        content: [
          {
            type: 'text',
            text: `🟢 **Current Vault**: ${currentVault.name} (${vaultId})

**Path**: ${currentVault.path}
**Created**: ${new Date(currentVault.created).toLocaleDateString()}
**Last accessed**: ${new Date(currentVault.last_accessed).toLocaleDateString()}${currentVault.description ? `\n**Description**: ${currentVault.description}` : ''}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get current vault: ${errorMessage}`
          }
        ]
      };
    }
  };

  #handleUpdateVault = async (
    args: UpdateVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      const vault = this.#globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      const updates: Partial<Pick<typeof vault, 'name' | 'description'>> = {};
      if (args.name) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;

      if (Object.keys(updates).length === 0) {
        throw new Error(
          'No updates provided. Specify name and/or description to update.'
        );
      }

      await this.#globalConfig.updateVault(args.id, updates);

      const updatedVault = this.#globalConfig.getVault(args.id)!;
      return {
        content: [
          {
            type: 'text',
            text: `✅ Updated vault '${args.id}':
**Name**: ${updatedVault.name}
**Description**: ${updatedVault.description || 'None'}
**Path**: ${updatedVault.path}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  #handleRenameNote = async (args: RenameNoteArgs) => {
    this.#requireWorkspace();
    if (!this.#noteManager) {
      throw new Error('Server not initialized');
    }

    try {
      // Get the current note to read current metadata
      const currentNote = await this.#noteManager.getNote(args.identifier);
      if (!currentNote) {
        throw new Error(`Note '${args.identifier}' not found`);
      }

      // Update the title in metadata while preserving all other metadata
      const updatedMetadata = {
        ...currentNote.metadata,
        title: args.new_title
      };

      // Use the existing updateNoteWithMetadata method with protection bypass for rename
      const result = await this.#noteManager.updateNoteWithMetadata(
        args.identifier,
        currentNote.content, // Keep content unchanged
        updatedMetadata,
        args.content_hash,
        true // Bypass protection for legitimate rename operations
      );

      let brokenLinksUpdated = 0;
      let wikilinksResult = { notesUpdated: 0, linksUpdated: 0 };

      // Only proceed with link updates if search manager is available
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        const noteId = this.#generateNoteIdFromIdentifier(args.identifier);

        // Update broken links that might now be resolved due to the new title
        brokenLinksUpdated = await LinkExtractor.updateBrokenLinks(
          noteId,
          args.new_title,
          db
        );

        // Always update wikilinks in other notes
        wikilinksResult = await LinkExtractor.updateWikilinksForRenamedNote(
          noteId,
          currentNote.title,
          args.new_title,
          db
        );
      }

      let wikilinkMessage = '';
      if (brokenLinksUpdated > 0) {
        wikilinkMessage = `\n\n🔗 Updated ${brokenLinksUpdated} broken links that now resolve to this note.`;
      }
      if (wikilinksResult.notesUpdated > 0) {
        wikilinkMessage += `\n🔗 Updated ${wikilinksResult.linksUpdated} wikilinks in ${wikilinksResult.notesUpdated} notes that referenced the old title.`;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note renamed successfully${wikilinkMessage}`,
                old_title: currentNote.title,
                new_title: args.new_title,
                identifier: args.identifier,
                filename_unchanged: true,
                links_preserved: true,
                broken_links_resolved: brokenLinksUpdated,
                wikilinks_updated: true,
                notes_with_updated_wikilinks: wikilinksResult.notesUpdated,
                total_wikilinks_updated: wikilinksResult.linksUpdated,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  #handleGetNoteLinks = async (args: { identifier: string }) => {
    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();
      const noteId = this.#generateNoteIdFromIdentifier(args.identifier);

      // Check if note exists
      const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
      if (!note) {
        throw new Error(`Note not found: ${args.identifier}`);
      }

      const links = await LinkExtractor.getLinksForNote(noteId, db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                note_id: noteId,
                links: {
                  outgoing_internal: links.outgoing_internal,
                  outgoing_external: links.outgoing_external,
                  incoming: links.incoming
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  #handleGetBacklinks = async (args: { identifier: string }) => {
    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();
      const noteId = this.#generateNoteIdFromIdentifier(args.identifier);

      // Check if note exists
      const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
      if (!note) {
        throw new Error(`Note not found: ${args.identifier}`);
      }

      const backlinks = await LinkExtractor.getBacklinks(noteId, db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                note_id: noteId,
                backlinks: backlinks
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  #handleFindBrokenLinks = async () => {
    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();
      const brokenLinks = await LinkExtractor.findBrokenLinks(db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                broken_links: brokenLinks,
                count: brokenLinks.length
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  #handleSearchByLinks = async (args: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
  }) => {
    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();
      let notes: NoteRow[] = [];

      // Handle different search criteria
      if (args.has_links_to && args.has_links_to.length > 0) {
        // Find notes that link to any of the specified notes
        const targetIds = args.has_links_to.map(id =>
          this.#generateNoteIdFromIdentifier(id)
        );
        const placeholders = targetIds.map(() => '?').join(',');
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.source_note_id
           WHERE nl.target_note_id IN (${placeholders})`,
          targetIds
        );
      } else if (args.linked_from && args.linked_from.length > 0) {
        // Find notes that are linked from any of the specified notes
        const sourceIds = args.linked_from.map(id =>
          this.#generateNoteIdFromIdentifier(id)
        );
        const placeholders = sourceIds.map(() => '?').join(',');
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.target_note_id
           WHERE nl.source_note_id IN (${placeholders})`,
          sourceIds
        );
      } else if (args.external_domains && args.external_domains.length > 0) {
        // Find notes with external links to specified domains
        const domainConditions = args.external_domains
          .map(() => 'el.url LIKE ?')
          .join(' OR ');
        const domainParams = args.external_domains.map(domain => `%${domain}%`);
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN external_links el ON n.id = el.note_id
           WHERE ${domainConditions}`,
          domainParams
        );
      } else if (args.broken_links) {
        // Find notes with broken internal links
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.source_note_id
           WHERE nl.target_note_id IS NULL`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                notes: notes,
                count: notes.length
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  #handleMigrateLinks = async (args: { force?: boolean }) => {
    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();

      // Check if migration is needed
      if (!args.force) {
        const existingLinks = await db.get<{ count: number }>(
          'SELECT COUNT(*) as count FROM note_links'
        );
        if (existingLinks && existingLinks.count > 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      'Link tables already contain data. Use force=true to migrate anyway.',
                    existing_links: existingLinks.count
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
      }

      // Get all notes from the database
      const notes = await db.all<{ id: string; content: string }>(
        'SELECT id, content FROM notes'
      );
      let processedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const note of notes) {
        try {
          // Extract links from note content
          const extractionResult = LinkExtractor.extractLinks(note.content);

          // Store the extracted links
          await LinkExtractor.storeLinks(note.id, extractionResult, db);
          processedCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${note.id}: ${errorMessage}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Link migration completed',
                total_notes: notes.length,
                processed: processedCount,
                errors: errorCount,
                error_details: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error details to first 10
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  /**
   * Helper method to generate note ID from identifier
   */
  #generateNoteIdFromIdentifier(identifier: string): string {
    // Check if identifier is already in type/filename format
    if (identifier.includes('/')) {
      return identifier;
    }

    // If it's just a filename, we need to find the note and get its type
    // For now, we'll assume it's in the format we expect
    return identifier;
  }
}
