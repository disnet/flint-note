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

import { GlobalConfigManager } from './utils/global-config.js';
import { NoteHandlers } from './server/note-handlers.js';
import { NoteTypeHandlers } from './server/note-type-handlers.js';
import { VaultHandlers } from './server/vault-handlers.js';
import { SearchHandlers } from './server/search-handlers.js';
import { LinkHandlers } from './server/link-handlers.js';
import { ResourceHandlers } from './server/resource-handlers.js';
import { generateNoteIdFromIdentifier, requireWorkspace } from './server/server-utils.js';
import type {
  ServerConfig,
  CreateNoteTypeArgs,
  CreateNoteArgs,
  GetNoteArgs,
  GetNotesArgs,
  UpdateNoteArgs,
  SearchNotesArgs,
  SearchNotesAdvancedArgs,
  SearchNotesSqlArgs,
  ListNoteTypesArgs,
  UpdateNoteTypeArgs,
  GetNoteTypeInfoArgs,
  CreateVaultArgs,
  SwitchVaultArgs,
  RemoveVaultArgs,
  UpdateVaultArgs,
  GetNoteInfoArgs,
  ListNotesByTypeArgs,
  DeleteNoteArgs,
  DeleteNoteTypeArgs,
  BulkDeleteNotesArgs,
  RenameNoteArgs,
  VaultContext
} from './server/types.js';
import fs from 'fs/promises';
import path from 'path';

// Re-export ServerConfig for external use
export type { ServerConfig } from './server/types.js';

export class FlintNoteServer {
  #server: Server;
  #workspace!: Workspace;
  #noteManager!: NoteManager;
  #noteTypeManager!: NoteTypeManager;
  #hybridSearchManager!: HybridSearchManager;
  noteHandlers!: NoteHandlers;
  noteTypeHandlers!: NoteTypeHandlers;
  vaultHandlers!: VaultHandlers;
  searchHandlers!: SearchHandlers;
  linkHandlers!: LinkHandlers;
  resourceHandlers!: ResourceHandlers;

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

        // Initialize note handlers
        this.noteHandlers = new NoteHandlers(
          this.#resolveVaultContext.bind(this),
          this.#generateNoteIdFromIdentifier.bind(this),
          this.#requireWorkspace.bind(this),
          this.#noteManager
        );

        // Initialize note type handlers
        this.noteTypeHandlers = new NoteTypeHandlers(
          this.#resolveVaultContext.bind(this),
          this.#requireWorkspace.bind(this),
          this.#noteTypeManager
        );

        // Initialize vault handlers
        this.vaultHandlers = new VaultHandlers(
          this.#globalConfig,
          this.initialize.bind(this)
        );

        // Initialize search handlers
        this.searchHandlers = new SearchHandlers(this.#resolveVaultContext.bind(this));

        // Initialize link handlers
        this.linkHandlers = new LinkHandlers(
          this.#resolveVaultContext.bind(this),
          this.#generateNoteIdFromIdentifier.bind(this)
        );

        // Initialize resource handlers
        this.resourceHandlers = new ResourceHandlers(
          this.#requireWorkspace.bind(this),
          this.#resolveVaultContext.bind(this),
          this.#generateNoteIdFromIdentifier.bind(this)
        );

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

          // Initialize note handlers
          this.noteHandlers = new NoteHandlers(
            this.#resolveVaultContext.bind(this),
            this.#generateNoteIdFromIdentifier.bind(this),
            this.#requireWorkspace.bind(this),
            this.#noteManager
          );

          // Initialize note type handlers
          this.noteTypeHandlers = new NoteTypeHandlers(
            this.#resolveVaultContext.bind(this),
            this.#requireWorkspace.bind(this),
            this.#noteTypeManager
          );

          // Initialize vault handlers
          this.vaultHandlers = new VaultHandlers(
            this.#globalConfig,
            this.initialize.bind(this)
          );

          // Initialize search handlers
          this.searchHandlers = new SearchHandlers(this.#resolveVaultContext.bind(this));

          // Initialize link handlers
          this.linkHandlers = new LinkHandlers(
            this.#resolveVaultContext.bind(this),
            this.#generateNoteIdFromIdentifier.bind(this)
          );

          // Initialize resource handlers
          this.resourceHandlers = new ResourceHandlers(
            this.#requireWorkspace.bind(this),
            this.#resolveVaultContext.bind(this),
            this.#generateNoteIdFromIdentifier.bind(this)
          );

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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                },
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Optional array of field names to include in response. Supports dot notation for nested fields (e.g. "metadata.tags") and wildcard patterns (e.g. "metadata.*"). If not specified, all fields are returned.'
                }
              },
              required: ['identifier']
            }
          },
          {
            name: 'get_notes',
            description: 'Retrieve multiple notes by their identifiers',
            inputSchema: {
              type: 'object',
              properties: {
                identifiers: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Array of note identifiers in format "type/filename" or full path'
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                },
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Optional array of field names to include in response. Supports dot notation for nested fields (e.g. "metadata.tags") and wildcard patterns (e.g. "metadata.*"). If not specified, all fields are returned.'
                }
              },
              required: ['identifiers']
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                },
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Optional array of field names to include in response. Supports dot notation for nested fields (e.g. "metadata.tags") and wildcard patterns (e.g. "metadata.*"). If not specified, all fields are returned.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                },
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Optional array of field names to include in response. Supports dot notation for nested fields (e.g. "metadata.tags") and wildcard patterns (e.g. "metadata.*"). If not specified, all fields are returned.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                },
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description:
                    'Optional array of field names to include in response. Supports dot notation for nested fields (e.g. "metadata.tags") and wildcard patterns (e.g. "metadata.*"). If not specified, all fields are returned.'
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
              properties: {
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
                }
              }
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
                },
                vault_id: {
                  type: 'string',
                  description:
                    'Optional vault ID to operate on. If not provided, uses the current active vault.'
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
            return await this.noteTypeHandlers.handleCreateNoteType(
              args as unknown as CreateNoteTypeArgs
            );
          case 'create_note':
            return await this.noteHandlers.handleCreateNote(
              args as unknown as CreateNoteArgs
            );
          case 'get_note':
            return await this.noteHandlers.handleGetNote(args as unknown as GetNoteArgs);
          case 'get_notes':
            return await this.noteHandlers.handleGetNotes(
              args as unknown as GetNotesArgs
            );
          case 'update_note':
            return await this.noteHandlers.handleUpdateNote(
              args as unknown as UpdateNoteArgs
            );
          case 'search_notes':
            return await this.searchHandlers.handleSearchNotes(
              args as unknown as SearchNotesArgs
            );
          case 'search_notes_advanced':
            return await this.searchHandlers.handleSearchNotesAdvanced(
              args as unknown as SearchNotesAdvancedArgs
            );
          case 'search_notes_sql':
            return await this.searchHandlers.handleSearchNotesSQL(
              args as unknown as SearchNotesSqlArgs
            );
          case 'list_note_types':
            return await this.noteTypeHandlers.handleListNoteTypes(
              args as unknown as ListNoteTypesArgs
            );

          case 'update_note_type':
            return await this.noteTypeHandlers.handleUpdateNoteType(
              args as unknown as UpdateNoteTypeArgs
            );
          case 'get_note_type_info':
            return await this.noteTypeHandlers.handleGetNoteTypeInfo(
              args as unknown as GetNoteTypeInfoArgs
            );
          case 'list_vaults':
            return await this.vaultHandlers.handleListVaults();
          case 'create_vault':
            return await this.vaultHandlers.handleCreateVault(
              args as unknown as CreateVaultArgs
            );
          case 'switch_vault':
            return await this.vaultHandlers.handleSwitchVault(
              args as unknown as SwitchVaultArgs
            );
          case 'remove_vault':
            return await this.vaultHandlers.handleRemoveVault(
              args as unknown as RemoveVaultArgs
            );
          case 'get_current_vault':
            return await this.vaultHandlers.handleGetCurrentVault();
          case 'update_vault':
            return await this.vaultHandlers.handleUpdateVault(
              args as unknown as UpdateVaultArgs
            );

          case 'get_note_info':
            return await this.noteHandlers.handleGetNoteInfo(
              args as unknown as GetNoteInfoArgs
            );
          case 'list_notes_by_type':
            return await this.noteHandlers.handleListNotesByType(
              args as unknown as ListNotesByTypeArgs
            );

          case 'delete_note':
            return await this.noteHandlers.handleDeleteNote(
              args as unknown as DeleteNoteArgs
            );
          case 'delete_note_type':
            return await this.noteTypeHandlers.handleDeleteNoteType(
              args as unknown as DeleteNoteTypeArgs
            );
          case 'bulk_delete_notes':
            return await this.noteHandlers.handleBulkDeleteNotes(
              args as unknown as BulkDeleteNotesArgs
            );
          case 'rename_note':
            return await this.noteHandlers.handleRenameNote(
              args as unknown as RenameNoteArgs
            );

          case 'get_note_links':
            return await this.linkHandlers.handleGetNoteLinks(
              args as unknown as { identifier: string; vault_id?: string }
            );

          case 'get_backlinks':
            return await this.linkHandlers.handleGetBacklinks(
              args as unknown as { identifier: string; vault_id?: string }
            );

          case 'find_broken_links':
            return await this.linkHandlers.handleFindBrokenLinks(
              args as unknown as { vault_id?: string }
            );

          case 'search_by_links':
            return await this.linkHandlers.handleSearchByLinks(
              args as unknown as {
                has_links_to?: string[];
                linked_from?: string[];
                external_domains?: string[];
                broken_links?: boolean;
                vault_id?: string;
              }
            );

          case 'migrate_links':
            return await this.linkHandlers.handleMigrateLinks(
              args as unknown as { force?: boolean; vault_id?: string }
            );

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
          },
          {
            uri: 'flint-note://note/{type}/{filename}',
            mimeType: 'application/json',
            name: 'Individual note',
            description:
              'Access individual notes by type and filename (e.g., flint-note://note/general/my-note)'
          },
          {
            uri: 'flint-note://note/{vault_id}/{type}/{filename}',
            mimeType: 'application/json',
            name: 'Individual note in specific vault',
            description: 'Access individual notes by vault, type and filename'
          },
          {
            uri: 'flint-note://notes/{type}',
            mimeType: 'application/json',
            name: 'Notes by type',
            description:
              'List all notes of a specific type (e.g., flint-note://notes/general)'
          },
          {
            uri: 'flint-note://notes/{vault_id}/{type}',
            mimeType: 'application/json',
            name: 'Notes by type in specific vault',
            description: 'List all notes of a specific type in a specific vault'
          },
          {
            uri: 'flint-note://notes/tagged/{tag}',
            mimeType: 'application/json',
            name: 'Notes by tag',
            description:
              'List all notes with a specific tag (e.g., flint-note://notes/tagged/important)'
          },
          {
            uri: 'flint-note://links/incoming/{type}/{filename}',
            mimeType: 'application/json',
            name: 'Incoming links to note',
            description: 'List all notes that link to a specific note'
          }
        ]
      };
    });

    // Handle resource requests
    this.#server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;

      try {
        // Handle static resources
        switch (uri) {
          case 'flint-note://types':
            return await this.noteTypeHandlers.handleTypesResource();
          case 'flint-note://recent':
            return await this.resourceHandlers.handleRecentResource();
          case 'flint-note://stats':
            return await this.resourceHandlers.handleStatsResource();
        }

        // Handle dynamic resources with pattern matching
        if (uri.startsWith('flint-note://note/')) {
          return await this.resourceHandlers.handleNoteResource(uri);
        } else if (uri.startsWith('flint-note://notes/tagged/')) {
          return await this.resourceHandlers.handleTaggedNotesResource(uri);
        } else if (uri.startsWith('flint-note://notes/')) {
          return await this.resourceHandlers.handleNotesCollectionResource(uri);
        } else if (uri.startsWith('flint-note://links/incoming/')) {
          return await this.resourceHandlers.handleIncomingLinksResource(uri);
        } else {
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
    requireWorkspace(this.#workspace);
  }

  /**
   * Resolve vault context for operations
   * If vault_id is provided, creates temporary context for that vault
   * If vault_id is not provided, uses the current active vault
   */
  async #resolveVaultContext(vault_id?: string): Promise<VaultContext> {
    if (!vault_id) {
      // Use current active vault
      this.#requireWorkspace();
      if (!this.#noteManager || !this.#noteTypeManager || !this.#hybridSearchManager) {
        throw new Error('Server not fully initialized');
      }
      return {
        workspace: this.#workspace,
        noteManager: this.#noteManager,
        noteTypeManager: this.#noteTypeManager,
        hybridSearchManager: this.#hybridSearchManager
      };
    }

    // Create temporary context for specified vault
    const vault = this.#globalConfig.getVault(vault_id);
    if (!vault) {
      throw new Error(`Vault with ID '${vault_id}' does not exist`);
    }

    // Create temporary workspace and managers for this vault
    const tempHybridSearchManager = new HybridSearchManager(vault.path);
    const tempWorkspace = new Workspace(
      vault.path,
      tempHybridSearchManager.getDatabaseManager()
    );
    await tempWorkspace.initialize();

    const tempNoteManager = new NoteManager(tempWorkspace, tempHybridSearchManager);
    const tempNoteTypeManager = new NoteTypeManager(tempWorkspace);

    return {
      workspace: tempWorkspace,
      noteManager: tempNoteManager,
      noteTypeManager: tempNoteTypeManager,
      hybridSearchManager: tempHybridSearchManager
    };
  }

  // Tool handlers

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.#server.connect(transport);
    console.error('Flint Note MCP server running on stdio');
  }

  /**
   * Helper method to generate note ID from identifier
   */
  #generateNoteIdFromIdentifier(identifier: string): string {
    return generateNoteIdFromIdentifier(identifier);
  }
}
