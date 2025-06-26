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
import { SearchManager } from './core/search.js';
import { LinkManager } from './core/links.js';
import { GlobalConfigManager } from './utils/global-config.js';
import { resolvePath, isPathSafe } from './utils/path.js';
import type { LinkRelationship, NoteMetadata } from './types/index.js';
import type { MetadataSchema } from './core/metadata-schema.js';
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
  updates?: Array<{
    identifier: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface SearchNotesArgs {
  query?: string;
  type_filter?: string;
  limit?: number;
  use_regex?: boolean;
}

interface ListNoteTypesArgs {
  // Empty interface for consistency
  [key: string]: never;
}

interface LinkNotesArgs {
  source: string;
  target: string;
  relationship?: LinkRelationship;
  bidirectional?: boolean;
  context?: string;
}

interface UpdateNoteTypeArgs {
  type_name: string;
  field: 'instructions' | 'description' | 'metadata_schema';
  value: string;
}

interface GetNoteTypeInfoArgs {
  type_name: string;
}

interface InitializeVaultArgs {
  force?: boolean;
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

interface SearchNotesForLinksArgs {
  query: string;
  type?: string;
  limit?: number;
}

interface GetLinkSuggestionsArgs {
  query: string;
  context_type?: string;
  limit?: number;
}

interface UpdateNoteLinksSyncArgs {
  identifier: string;
}

interface GetNoteInfoArgs {
  title_or_filename: string;
  type?: string;
}

interface ListNotesByTypeArgs {
  type: string;
  limit?: number;
}

interface SuggestLinkTargetsArgs {
  partial_query: string;
  context_type?: string;
  limit?: number;
}

interface ValidateWikilinksArgs {
  content: string;
  context_type?: string;
}

interface AutoLinkContentArgs {
  content: string;
  context_type?: string;
  aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
}

interface GenerateLinkReportArgs {
  identifier: string;
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

export class FlintNoteServer {
  #server: Server;
  #workspace!: Workspace;
  #noteManager!: NoteManager;
  #noteTypeManager!: NoteTypeManager;
  #searchManager!: SearchManager;
  #linkManager!: LinkManager;
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
        this.#workspace = new Workspace(workspacePath);

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

        this.#noteManager = new NoteManager(this.#workspace);
        this.#noteTypeManager = new NoteTypeManager(this.#workspace);
        this.#searchManager = new SearchManager(this.#workspace);
        this.#linkManager = new LinkManager(this.#workspace, this.#noteManager);

        console.error(
          `flint-note server initialized successfully with workspace: ${workspacePath}`
        );
      } else {
        // No explicit workspace - check for current vault
        const currentVault = this.#globalConfig.getCurrentVault();

        if (currentVault) {
          // Initialize with current vault
          this.#workspace = new Workspace(currentVault.path);
          await this.#workspace.initialize();

          this.#noteManager = new NoteManager(this.#workspace);
          this.#noteTypeManager = new NoteTypeManager(this.#workspace);
          this.#searchManager = new SearchManager(this.#workspace);
          this.#linkManager = new LinkManager(this.#workspace, this.#noteManager);

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
              oneOf: [
                {
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
                      description:
                        'Additional metadata fields for the note (validated against note type schema)',
                      additionalProperties: true
                    }
                  },
                  required: ['type', 'title', 'content']
                },
                {
                  type: 'object',
                  properties: {
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
                      description: 'Array of notes to create'
                    }
                  },
                  required: ['notes']
                }
              ]
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
              oneOf: [
                {
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
                    metadata: {
                      type: 'object',
                      description: 'Metadata fields to update',
                      additionalProperties: true
                    }
                  },
                  required: ['identifier']
                },
                {
                  type: 'object',
                  properties: {
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
                          metadata: {
                            type: 'object',
                            description: 'Metadata fields to update',
                            additionalProperties: true
                          }
                        },
                        required: ['identifier']
                      },
                      description:
                        'Array of note updates (must specify content, metadata, or both)'
                    }
                  },
                  required: ['updates']
                }
              ]
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
            name: 'list_note_types',
            description:
              'List all available note types with their purposes and agent instructions',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'link_notes',
            description:
              'Create explicit links between notes with optional relationship types',
            inputSchema: {
              type: 'object',
              properties: {
                source: {
                  type: 'string',
                  description: 'Source note identifier (type/filename or title)'
                },
                target: {
                  type: 'string',
                  description: 'Target note identifier (type/filename or title)'
                },
                relationship: {
                  type: 'string',
                  description: 'Type of relationship between notes',
                  enum: [
                    'references',
                    'follows-up',
                    'contradicts',
                    'supports',
                    'mentions',
                    'depends-on',
                    'blocks',
                    'related-to'
                  ],
                  default: 'references'
                },
                bidirectional: {
                  type: 'boolean',
                  description: 'Create reverse link from target to source',
                  default: true
                },
                context: {
                  type: 'string',
                  description: 'Optional context about the relationship'
                }
              },
              required: ['source', 'target']
            }
          },

          {
            name: 'update_note_type',
            description: 'Update a specific field of an existing note type',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the note type to update'
                },
                field: {
                  type: 'string',
                  description: 'Field to update',
                  enum: ['instructions', 'description', 'metadata_schema']
                },
                value: {
                  type: 'string',
                  description: 'New value for the field'
                }
              },
              required: ['type_name', 'field', 'value']
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
            name: 'initialize_vault',
            description:
              'Initialize a new flint-note vault with default note types (daily, reading, todos, projects, goals, games, movies)',
            inputSchema: {
              type: 'object',
              properties: {
                force: {
                  type: 'boolean',
                  description: 'Force initialization even if vault already exists',
                  default: false
                }
              },
              required: []
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
            name: 'search_notes_for_links',
            description:
              'Search for notes that could be linked, returning filename and type information',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query to find linkable notes'
                },
                type: {
                  type: 'string',
                  description: 'Optional: filter by note type'
                },
                limit: {
                  type: 'number',
                  description: 'Optional: maximum number of results (default: 20)',
                  default: 20
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_link_suggestions',
            description:
              'Get link suggestions for a partial query, formatted for wikilink creation',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Partial text to get link suggestions for'
                },
                context_type: {
                  type: 'string',
                  description: 'Optional: current note type for context filtering'
                },
                limit: {
                  type: 'number',
                  description: 'Optional: maximum number of suggestions (default: 10)',
                  default: 10
                }
              },
              required: ['query']
            }
          },
          {
            name: 'update_note_links_sync',
            description:
              'Parse wikilinks from note content and sync with frontmatter metadata',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier to update links for'
                }
              },
              required: ['identifier']
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
            name: 'suggest_link_targets',
            description: 'Get formatted wikilink suggestions for a partial query',
            inputSchema: {
              type: 'object',
              properties: {
                partial_query: {
                  type: 'string',
                  description: 'Partial text to get link target suggestions for'
                },
                context_type: {
                  type: 'string',
                  description: 'Optional: current note type for filtering'
                },
                limit: {
                  type: 'number',
                  description: 'Optional: maximum number of suggestions (default: 10)',
                  default: 10
                }
              },
              required: ['partial_query']
            }
          },
          {
            name: 'validate_wikilinks',
            description:
              'Validate all wikilinks in content and get suggestions for broken links',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Content to validate wikilinks in'
                },
                context_type: {
                  type: 'string',
                  description: 'Optional: note type for context-aware suggestions'
                }
              },
              required: ['content']
            }
          },
          {
            name: 'auto_link_content',
            description: 'Automatically suggest and insert wikilinks in content',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Content to auto-link'
                },
                context_type: {
                  type: 'string',
                  description: 'Optional: note type for context filtering'
                },
                aggressiveness: {
                  type: 'string',
                  enum: ['conservative', 'moderate', 'aggressive'],
                  description: 'How aggressively to suggest links (default: moderate)',
                  default: 'moderate'
                }
              },
              required: ['content']
            }
          },
          {
            name: 'generate_link_report',
            description: 'Generate a comprehensive report about links in a note',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Note identifier to generate link report for'
                }
              },
              required: ['identifier']
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
          case 'list_note_types':
            return await this.#handleListNoteTypes(args as unknown as ListNoteTypesArgs);
          case 'link_notes':
            return await this.#handleLinkNotes(args as unknown as LinkNotesArgs);

          case 'update_note_type':
            return await this.#handleUpdateNoteType(
              args as unknown as UpdateNoteTypeArgs
            );
          case 'get_note_type_info':
            return await this.#handleGetNoteTypeInfo(
              args as unknown as GetNoteTypeInfoArgs
            );
          case 'initialize_vault':
            return await this.#handleInitializeVault(
              args as unknown as InitializeVaultArgs
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
          case 'search_notes_for_links':
            return await this.#handleSearchNotesForLinks(
              args as unknown as SearchNotesForLinksArgs
            );
          case 'get_link_suggestions':
            return await this.#handleGetLinkSuggestions(
              args as unknown as GetLinkSuggestionsArgs
            );
          case 'update_note_links_sync':
            return await this.#handleUpdateNoteLinkSync(
              args as unknown as UpdateNoteLinksSyncArgs
            );
          case 'get_note_info':
            return await this.#handleGetNoteInfo(args as unknown as GetNoteInfoArgs);
          case 'list_notes_by_type':
            return await this.#handleListNotesByType(
              args as unknown as ListNotesByTypeArgs
            );
          case 'suggest_link_targets':
            return await this.#handleSuggestLinkTargets(
              args as unknown as SuggestLinkTargetsArgs
            );
          case 'validate_wikilinks':
            return await this.#handleValidateWikilinks(
              args as unknown as ValidateWikilinksArgs
            );
          case 'auto_link_content':
            return await this.#handleAutoLinkContent(
              args as unknown as AutoLinkContentArgs
            );
          case 'generate_link_report':
            return await this.#handleGenerateLinkReport(
              args as unknown as GenerateLinkReportArgs
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

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

    let result;
    if (args.content !== undefined && args.metadata !== undefined) {
      // Both content and metadata update
      result = await this.#noteManager.updateNoteWithMetadata(
        args.identifier,
        args.content,
        args.metadata as NoteMetadata
      );
    } else if (args.content !== undefined) {
      // Content-only update
      result = await this.#noteManager.updateNote(args.identifier, args.content);
    } else if (args.metadata !== undefined) {
      // Metadata-only update
      const currentNote = await this.#noteManager.getNote(args.identifier);
      if (!currentNote) {
        throw new Error(`Note '${args.identifier}' not found`);
      }
      result = await this.#noteManager.updateNoteWithMetadata(
        args.identifier,
        currentNote.content,
        args.metadata as NoteMetadata
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
    if (!this.#searchManager) {
      throw new Error('Server not initialized');
    }

    const results = await this.#searchManager.searchNotes(
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

  #handleLinkNotes = async (args: LinkNotesArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const result = await this.#linkManager.linkNotes(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  };

  #handleUpdateNoteType = async (args: UpdateNoteTypeArgs) => {
    this.#requireWorkspace();
    if (!this.#noteTypeManager) {
      throw new Error('Server not initialized');
    }

    // Get current note type info
    const currentInfo = await this.#noteTypeManager.getNoteTypeDescription(
      args.type_name
    );

    // Update based on field type
    let updatedDescription: string;

    switch (args.field) {
      case 'instructions': {
        // Parse instructions from value (can be newline-separated or bullet points)
        const instructions = args.value
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => (line.startsWith('-') ? line.substring(1).trim() : line))
          .map(line => `- ${line}`)
          .join('\n');

        // Use the current description and replace the agent instructions section
        updatedDescription = currentInfo.description.replace(
          /## Agent Instructions\n[\s\S]*?(?=\n## |$)/,
          `## Agent Instructions\n${instructions}\n`
        );
        break;
      }

      case 'description':
        updatedDescription = this.#noteTypeManager.formatNoteTypeDescription(
          args.type_name,
          args.value
        );
        break;

      case 'metadata_schema': {
        // Parse metadata schema from value
        const schema = args.value
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => (line.startsWith('-') ? line.substring(1).trim() : line))
          .map(line => `- ${line}`)
          .join('\n');

        updatedDescription = currentInfo.description.replace(
          /## Metadata Schema\n[\s\S]*$/,
          `## Metadata Schema\nExpected frontmatter or metadata fields for this note type:\n${schema}\n`
        );
        break;
      }

      default:
        throw new Error(`Invalid field: ${args.field}`);
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
              field_updated: args.field,
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
  };

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

  // New wikilink and note discovery handlers
  #handleSearchNotesForLinks = async (args: SearchNotesForLinksArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const notes = await this.#linkManager.searchLinkableNotes(args.query, args.type);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(notes.slice(0, args.limit || 20), null, 2)
        }
      ]
    };
  };

  #handleGetLinkSuggestions = async (args: GetLinkSuggestionsArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const suggestions = await this.#linkManager.getLinkSuggestions(
      args.query,
      args.context_type
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(suggestions.slice(0, args.limit || 10), null, 2)
        }
      ]
    };
  };

  #handleUpdateNoteLinkSync = async (args: UpdateNoteLinksSyncArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    await this.#linkManager.updateLinksFromContent(args.identifier);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Links synchronized for note: ${args.identifier}`
            },
            null,
            2
          )
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

  #handleSuggestLinkTargets = async (args: SuggestLinkTargetsArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const suggestions = await this.#linkManager.getLinkSuggestions(
      args.partial_query,
      args.context_type
    );

    const formattedSuggestions = suggestions
      .slice(0, args.limit || 10)
      .map(suggestion => ({
        target: suggestion.target,
        display: suggestion.display,
        type: suggestion.type,
        filename: suggestion.filename,
        title: suggestion.title,
        relevance: suggestion.relevance,
        wikilink: `[[${suggestion.target}|${suggestion.display}]]`,
        wikilink_simple: `[[${suggestion.target}]]`
      }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedSuggestions, null, 2)
        }
      ]
    };
  };

  #handleValidateWikilinks = async (args: ValidateWikilinksArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const validationResult = await this.#linkManager.validateWikilinks(
      args.content,
      args.context_type
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: validationResult.valid,
              broken_links: validationResult.broken,
              suggestions: Object.fromEntries(validationResult.suggestions),
              summary: {
                total_links:
                  validationResult.broken.length +
                  (validationResult.valid ? 0 : validationResult.broken.length),
                broken_count: validationResult.broken.length
              }
            },
            null,
            2
          )
        }
      ]
    };
  };

  #handleAutoLinkContent = async (args: AutoLinkContentArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager) {
      throw new Error('Server not initialized');
    }

    const autoLinkResult = await this.#linkManager.autoLinkContent(
      args.content,
      args.context_type,
      args.aggressiveness
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              original_content: autoLinkResult.originalContent,
              updated_content: autoLinkResult.updatedContent,
              added_links: autoLinkResult.addedLinks,
              changes_count: autoLinkResult.changesCount,
              summary: {
                links_added: autoLinkResult.changesCount,
                content_changed:
                  autoLinkResult.originalContent !== autoLinkResult.updatedContent
              }
            },
            null,
            2
          )
        }
      ]
    };
  };

  #handleGenerateLinkReport = async (args: GenerateLinkReportArgs) => {
    this.#requireWorkspace();
    if (!this.#linkManager || !this.#noteManager) {
      throw new Error('Server not initialized');
    }

    const note = await this.#noteManager.getNote(args.identifier);
    if (!note) {
      throw new Error(`Note not found: ${args.identifier}`);
    }

    const linkReport = await this.#linkManager.generateLinkReport(
      note.content,
      note.type
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              note_id: args.identifier,
              note_title: note.title,
              note_type: note.type,
              link_report: linkReport,
              recommendations: {
                needs_linking: linkReport.linkingOpportunities > 0,
                has_broken_links: linkReport.brokenLinks > 0,
                link_density_rating:
                  linkReport.linkDensity < 0.05
                    ? 'low'
                    : linkReport.linkDensity < 0.15
                      ? 'moderate'
                      : 'high'
              }
            },
            null,
            2
          )
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

  async #handleInitializeVault(
    args: InitializeVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      if (!this.#workspace) {
        throw new Error('Workspace not initialized');
      }

      // Check if vault already exists (has .flint-note directory)
      const flintNoteDir = this.#workspace.flintNoteDir;
      let vaultExists = false;

      try {
        await fs.access(flintNoteDir);
        vaultExists = true;
      } catch (_error) {
        // Vault doesn't exist, which is fine
      }

      if (vaultExists && !args.force) {
        return {
          content: [
            {
              type: 'text',
              text: 'Vault already exists. Use force=true to reinitialize with default note types.'
            }
          ]
        };
      }

      // Initialize the vault with default note types
      await this.#workspace.initializeVault();

      const defaultNoteTypes = this.#workspace.getDefaultNoteTypes();
      const noteTypeNames = defaultNoteTypes.map(nt => nt.name);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Vault initialized successfully!

Created default note types:
${noteTypeNames.map(name => `• **${name}**: ${defaultNoteTypes.find(nt => nt.name === name)?.purpose}`).join('\n')}

Your vault is ready to use! You can:
1. Create notes using any of the default note types
2. Customize existing note types to fit your needs
3. Add new note types for specialized topics
4. Start building your knowledge base

A welcome note has been created in your vault root directory to help you get started.`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to initialize vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
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
        const workspace = new Workspace(resolvedPath);
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
}
