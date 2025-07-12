/**
 * Tool Schemas Configuration
 *
 * Defines all MCP tool schemas for the flint-note server.
 * This separates the tool definitions from the main server logic.
 */

export const TOOL_SCHEMAS = [
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
                    enum: ['string', 'number', 'boolean', 'date', 'array', 'select'],
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
                    description: 'Optional field constraints (min, max, options, etc.)'
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
          description: 'Type of note to create'
        },
        title: {
          type: 'string',
          description: 'Title of the note'
        },
        content: {
          type: 'string',
          description: 'Content of the note in markdown format',
          default: ''
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the note'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to create the note in. If not provided, uses the current active vault.'
        },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Type of note to create'
              },
              title: {
                type: 'string',
                description: 'Title of the note'
              },
              content: {
                type: 'string',
                description: 'Content of the note in markdown format',
                default: ''
              },
              metadata: {
                type: 'object',
                description: 'Additional metadata for the note'
              }
            },
            required: ['type', 'title']
          },
          description:
            'Array of notes to create in batch (alternative to single note creation)'
        }
      },
      oneOf: [
        {
          required: ['type', 'title']
        },
        {
          required: ['notes']
        }
      ]
    }
  },
  {
    name: 'get_note',
    description: 'Retrieve a specific note by identifier with optional field filtering',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Note identifier in type/filename format'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Optional list of fields to include in response (id, title, content, type, filename, path, created, updated, size, metadata)'
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
          description: 'Array of note identifiers in type/filename format'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Optional list of fields to include in response (id, title, content, type, filename, path, created, updated, size, metadata)'
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
          description: 'Note identifier in type/filename format'
        },
        title: {
          type: 'string',
          description: 'New title for the note'
        },
        content: {
          type: 'string',
          description: 'New content for the note'
        },
        metadata: {
          type: 'object',
          description: 'New metadata for the note (will be merged with existing)'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              identifier: {
                type: 'string',
                description: 'Note identifier in type/filename format'
              },
              title: {
                type: 'string',
                description: 'New title for the note'
              },
              content: {
                type: 'string',
                description: 'New content for the note'
              },
              metadata: {
                type: 'object',
                description: 'New metadata for the note (will be merged with existing)'
              }
            },
            required: ['identifier']
          },
          description:
            'Array of notes to update in batch (alternative to single note update)'
        }
      },
      oneOf: [
        {
          required: ['identifier']
        },
        {
          required: ['notes']
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
          description: 'Filter results to specific note type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return'
        },
        use_regex: {
          type: 'boolean',
          description: 'Treat query as regex pattern',
          default: false
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Optional list of fields to include in response (id, title, content, type, filename, path, created, updated, size, metadata)'
        }
      }
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
              key: {
                type: 'string',
                description: 'Metadata key to filter on'
              },
              value: {
                type: 'string',
                description: 'Value to match'
              },
              operator: {
                type: 'string',
                enum: ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'],
                description: 'Comparison operator',
                default: '='
              }
            },
            required: ['key', 'value']
          },
          description: 'Filters for metadata fields'
        },
        updated_within: {
          type: 'string',
          description: 'Filter notes updated within this period (e.g., "7d", "1h")'
        },
        updated_before: {
          type: 'string',
          description: 'Filter notes updated before this date (ISO format)'
        },
        created_within: {
          type: 'string',
          description: 'Filter notes created within this period (e.g., "7d", "1h")'
        },
        created_before: {
          type: 'string',
          description: 'Filter notes created before this date (ISO format)'
        },
        content_query: {
          type: 'string',
          description: 'Search within note content'
        },
        title_query: {
          type: 'string',
          description: 'Search within note titles'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Optional list of fields to include in response (id, title, content, type, filename, path, created, updated, size, metadata)'
        }
      }
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
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' }
            ]
          },
          description: 'Optional parameters for the SQL query'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return'
        },
        timeout: {
          type: 'number',
          description: 'Query timeout in milliseconds',
          default: 5000
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Optional list of fields to include in response (id, title, content, type, filename, path, created, updated, size, metadata)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'list_note_types',
    description: 'List all available note types in the current vault',
    inputSchema: {
      type: 'object',
      properties: {
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to list types from. If not provided, uses the current active vault.'
        }
      }
    }
  },
  {
    name: 'update_note_type',
    description: 'Update an existing note type',
    inputSchema: {
      type: 'object',
      properties: {
        type_name: {
          type: 'string',
          description: 'Name of the note type to update'
        },
        description: {
          type: 'string',
          description: 'New description for the note type'
        },
        agent_instructions: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'New agent instructions for this note type'
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
                    enum: ['string', 'number', 'boolean', 'date', 'array', 'select'],
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
                    description: 'Optional field constraints (min, max, options, etc.)'
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
          description: 'New metadata schema definition for this note type'
        },
        content_hash: {
          type: 'string',
          description:
            'Content hash of the note type being updated (for concurrent update protection)'
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
    name: 'get_note_type_info',
    description: 'Get detailed information about a specific note type',
    inputSchema: {
      type: 'object',
      properties: {
        type_name: {
          type: 'string',
          description: 'Name of the note type to get info for'
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
    description: 'List all configured vaults',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'create_vault',
    description: 'Create a new vault with specified configuration',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'Unique identifier for the vault (letters, numbers, hyphens, underscores only)'
        },
        name: {
          type: 'string',
          description: 'Human-readable name for the vault'
        },
        path: {
          type: 'string',
          description: 'File system path where the vault will be stored'
        },
        description: {
          type: 'string',
          description: 'Optional description of the vault purpose'
        },
        initialize: {
          type: 'boolean',
          description: 'Whether to initialize the vault with default note types',
          default: true
        },
        switch_to: {
          type: 'boolean',
          description: 'Whether to switch to this vault after creation',
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
    description: 'Update vault metadata (name and/or description)',
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
    description: 'Get basic information about a note by title or filename',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the note to look up'
        },
        filename: {
          type: 'string',
          description: 'Filename of the note to look up'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        }
      },
      oneOf: [
        {
          required: ['title']
        },
        {
          required: ['filename']
        }
      ]
    }
  },
  {
    name: 'list_notes_by_type',
    description: 'List all notes of a specific type',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Note type to filter by'
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'delete_note',
    description: 'Delete a specific note',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Note identifier in type/filename format'
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag to prevent accidental deletion',
          default: false
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        }
      },
      required: ['identifier', 'confirm']
    }
  },
  {
    name: 'delete_note_type',
    description: 'Delete a note type and optionally migrate notes',
    inputSchema: {
      type: 'object',
      properties: {
        type_name: {
          type: 'string',
          description: 'Name of the note type to delete'
        },
        migration_strategy: {
          type: 'string',
          enum: ['delete_notes', 'migrate_to_type'],
          description: 'What to do with existing notes of this type'
        },
        target_type: {
          type: 'string',
          description:
            'Target type for migration (required if migration_strategy is migrate_to_type)'
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag to prevent accidental deletion',
          default: false
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        }
      },
      required: ['type_name', 'migration_strategy', 'confirm']
    }
  },
  {
    name: 'bulk_delete_notes',
    description: 'Delete multiple notes based on criteria',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Delete all notes of this type'
        },
        older_than_days: {
          type: 'number',
          description: 'Delete notes older than this many days'
        },
        metadata_filter: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Metadata key to filter on'
            },
            value: {
              type: 'string',
              description: 'Value to match'
            },
            operator: {
              type: 'string',
              enum: ['=', '!=', '>', '<', '>=', '<=', 'LIKE'],
              description: 'Comparison operator',
              default: '='
            }
          },
          required: ['key', 'value']
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag to prevent accidental deletion',
          default: false
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        }
      },
      required: ['confirm']
    }
  },
  {
    name: 'rename_note',
    description: 'Rename a note and update any wikilinks that reference it',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Current note identifier in type/filename format'
        },
        new_title: {
          type: 'string',
          description: 'New title for the note'
        },
        update_links: {
          type: 'boolean',
          description: 'Whether to update wikilinks that reference this note',
          default: true
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        }
      },
      required: ['identifier', 'new_title']
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
    name: 'get_backlinks',
    description: 'Get all notes that link to the specified note',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Note identifier (type/filename format)'
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
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to search in. If not provided, uses the current active vault.'
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
        },
        vault_id: {
          type: 'string',
          description:
            'Optional vault ID to operate on. If not provided, uses the current active vault.'
        }
      }
    }
  }
];

export const RESOURCE_SCHEMAS = [
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
];
