# Flint Note MCP Tools Reference

This document describes all Model Context Protocol (MCP) tools exposed by the Flint Note server, along with their input schemas and usage examples.

## Note Type Management Tools

### `create_note_type`

Creates a new note type with description, agent instructions, and metadata schema.

**Input Schema:**
```json
{
  "type_name": "string (required)",        // Name of the note type (filesystem-safe)
  "description": "string (required)",      // Description of the note type purpose and usage
  "agent_instructions": "array",           // Optional custom agent instructions for this note type
  "metadata_schema": {                     // Optional metadata schema definition
    "fields": [
      {
        "name": "string (required)",        // Name of the metadata field
        "type": "string (required)",        // Type: 'string', 'number', 'boolean', 'date', 'array', 'select'
        "description": "string",            // Optional description of the field
        "required": "boolean",              // Whether this field is required
        "constraints": "object",            // Optional field constraints (min, max, options, etc.)
        "default": "any"                    // Optional default value for the field
      }
    ],
    "version": "string"                     // Optional schema version
  },
  "vault_id": "string"                      // Optional vault ID to operate on
}
```

### `list_note_types`

Lists all available note types with their purposes and agent instructions.

**Input Schema:**
```json
{
  "vault_id": "string"  // Optional vault ID to operate on
}
```

### `update_note_type`

Updates one or more fields of an existing note type.

**Input Schema:**
```json
{
  "type_name": "string (required)",        // Name of the note type to update
  "instructions": "string",                // New agent instructions for the note type
  "description": "string",                 // New description for the note type
  "metadata_schema": "array",              // Array of metadata field definitions
  "content_hash": "string (required)",     // Content hash for optimistic locking
  "vault_id": "string"                     // Optional vault ID to operate on
}
```

### `get_note_type_info`

Gets comprehensive information about a note type including instructions and description.

**Input Schema:**
```json
{
  "type_name": "string (required)",  // Name of the note type to get information for
  "vault_id": "string"               // Optional vault ID to operate on
}
```

### `delete_note_type`

Deletes a note type and optionally handles existing notes.

**Input Schema:**
```json
{
  "type_name": "string (required)",    // Name of the note type to delete
  "action": "string (required)",       // Action: 'error', 'migrate', or 'delete'
  "target_type": "string",             // Target note type for migration (required when action is migrate)
  "confirm": "boolean"                 // Explicit confirmation required for deletion
}
```

## Note Management Tools

### `create_note`

Creates one or more notes of the specified type(s). Supports both single note creation and batch creation.

**Input Schema (Single Note):**
```json
{
  "type": "string (required)",       // Note type (must exist)
  "title": "string (required)",      // Title of the note  
  "content": "string (required)",    // Content of the note in markdown format
  "metadata": "object",             // Additional metadata fields for the note
  "vault_id": "string"              // Optional vault ID to operate on
}
```

**Input Schema (Batch Creation):**
```json
{
  "notes": [                        // Array of notes to create
    {
      "type": "string (required)",
      "title": "string (required)",
      "content": "string (required)",
      "metadata": "object"
    }
  ],
  "vault_id": "string"
}
```

### `get_note`

Retrieves a specific note by identifier.

**Input Schema:**
```json
{
  "identifier": "string (required)",  // Note identifier in format "type/filename" or full path
  "vault_id": "string",               // Optional vault ID to operate on
  "fields": "array"                   // Optional array of field names to include (supports dot notation)
}
```

### `get_notes`

Retrieves multiple notes by their identifiers.

**Input Schema:**
```json
{
  "identifiers": "array (required)",  // Array of note identifiers
  "vault_id": "string",               // Optional vault ID to operate on
  "fields": "array"                   // Optional array of field names to include
}
```

### `update_note`

Updates one or more existing notes. Supports both single note updates and batch updates.

**Input Schema (Single Note):**
```json
{
  "identifier": "string (required)",     // Note identifier
  "content": "string",                   // New content for the note
  "content_hash": "string (required)",  // Content hash for optimistic locking
  "metadata": "object",                 // Metadata fields to update
  "vault_id": "string"                  // Optional vault ID to operate on
}
```

**Input Schema (Batch Updates):**
```json
{
  "updates": [                          // Array of note updates
    {
      "identifier": "string (required)",
      "content": "string",
      "content_hash": "string (required)",
      "metadata": "object"
    }
  ],
  "vault_id": "string"
}
```

### `get_note_info`

Gets detailed information about a note including filename for link creation.

**Input Schema:**
```json
{
  "title_or_filename": "string (required)",  // Note title or filename to look up
  "type": "string",                          // Optional: note type to narrow search
  "vault_id": "string"                       // Optional vault ID to operate on
}
```

### `list_notes_by_type`

Lists all notes of a specific type with filename information.

**Input Schema:**
```json
{
  "type": "string (required)",  // Note type to list
  "limit": "number",            // Optional: maximum number of results (default: 50)
  "vault_id": "string"          // Optional vault ID to operate on
}
```

### `delete_note`

Deletes an existing note permanently.

**Input Schema:**
```json
{
  "identifier": "string (required)",  // Note identifier (type/filename format)
  "confirm": "boolean",               // Explicit confirmation required for deletion
  "vault_id": "string"                // Optional vault ID to operate on
}
```

### `bulk_delete_notes`

Deletes multiple notes matching criteria.

**Input Schema:**
```json
{
  "type": "string",           // Filter by note type
  "tags": "array",            // Filter by tags (all tags must match)
  "pattern": "string",        // Regex pattern to match note content or title
  "confirm": "boolean"        // Explicit confirmation required for bulk deletion
}
```

### `rename_note`

Renames a note by updating its title field (display name). The filename and ID remain unchanged to preserve links. Automatically updates wikilinks in other notes that reference the old title.

**Input Schema:**
```json
{
  "identifier": "string (required)",     // Note identifier
  "new_title": "string (required)",      // New display title for the note
  "content_hash": "string (required)",   // Content hash for optimistic locking  
  "vault_id": "string"                   // Optional vault ID to operate on
}
```

### `move_note`

Moves a note from one note type to another while preserving filename, links, and metadata.

**Input Schema:**
```json
{
  "identifier": "string (required)",     // Current note identifier in type/filename format
  "new_type": "string (required)",       // Target note type to move the note to
  "content_hash": "string (required)",   // Content hash for optimistic locking to prevent conflicts
  "vault_id": "string"                   // Optional vault ID to operate on
}
```

## Search Tools

### `search_notes`

Searches notes by content and/or type. Empty queries return all notes sorted by last updated.

**Input Schema:**
```json
{
  "query": "string",           // Search query or regex pattern (empty returns all notes)
  "type_filter": "string",     // Optional filter by note type
  "limit": "number",           // Maximum number of results (default: 10)
  "use_regex": "boolean",      // Enable regex pattern matching (default: false)
  "vault_id": "string",        // Optional vault ID to operate on
  "fields": "array"            // Optional array of field names to include
}
```

### `search_notes_advanced`

Advanced search with structured filters for metadata, dates, and content.

**Input Schema:**
```json
{
  "type": "string",                    // Filter by note type
  "metadata_filters": [               // Array of metadata filters
    {
      "key": "string (required)",      // Metadata key to filter on
      "value": "string (required)",    // Value to match
      "operator": "string"             // Comparison operator: '=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'
    }
  ],
  "updated_within": "string",         // Find notes updated within time period (e.g., "7d", "1w", "2m")
  "updated_before": "string",         // Find notes updated before time period
  "created_within": "string",         // Find notes created within time period
  "created_before": "string",         // Find notes created before time period
  "content_contains": "string",       // Search within note content
  "sort": [                           // Sort order for results
    {
      "field": "string (required)",   // Field: 'title', 'type', 'created', 'updated', 'size'
      "order": "string (required)"    // Order: 'asc', 'desc'
    }
  ],
  "limit": "number",                  // Maximum number of results (default: 50)
  "offset": "number",                 // Number of results to skip (default: 0)
  "vault_id": "string",               // Optional vault ID to operate on
  "fields": "array"                   // Optional array of field names to include
}
```

### `search_notes_sql`

Direct SQL search against notes database for maximum flexibility. Only SELECT queries allowed.

**Input Schema:**
```json
{
  "query": "string (required)",       // SQL SELECT query
  "params": "array",                  // Optional parameters for parameterized queries
  "limit": "number",                  // Maximum number of results (default: 1000)
  "timeout": "number",                // Query timeout in milliseconds (default: 30000)
  "vault_id": "string",               // Optional vault ID to operate on
  "fields": "array"                   // Optional array of field names to include
}
```

**Available Tables:**
- `notes` (id, title, content, type, filename, path, created, updated, size)
- `note_metadata` (note_id, key, value, value_type)

## Vault Management Tools

### `list_vaults`

Lists all configured vaults with their status and information.

**Input Schema:**
```json
{}
```

### `create_vault`

Creates a new vault and adds it to the vault registry.

**Input Schema:**
```json
{
  "id": "string (required)",           // Unique identifier for the vault (filesystem-safe)
  "name": "string (required)",         // Human-readable name for the vault
  "path": "string (required)",         // Directory path where the vault should be created
  "description": "string",             // Optional description of the vault purpose
  "initialize": "boolean",             // Whether to initialize with default note types (default: true)
  "switch_to": "boolean"               // Whether to switch to the new vault after creation (default: true)
}
```

### `switch_vault`

Switches to a different vault.

**Input Schema:**
```json
{
  "id": "string (required)"  // ID of the vault to switch to
}
```

### `remove_vault`

Removes a vault from the registry (does not delete files).

**Input Schema:**
```json
{
  "id": "string (required)"  // ID of the vault to remove
}
```

### `get_current_vault`

Gets information about the currently active vault.

**Input Schema:**
```json
{}
```

### `update_vault`

Updates vault information (name or description).

**Input Schema:**
```json
{
  "id": "string (required)",    // ID of the vault to update
  "name": "string",             // New name for the vault
  "description": "string"       // New description for the vault
}
```

## Link Management Tools

### `get_note_links`

Gets all links for a specific note (incoming, outgoing internal, and external).

**Input Schema:**
```json
{
  "identifier": "string (required)"  // Note identifier (type/filename format)
}
```

### `get_backlinks`

Gets all notes that link to the specified note.

**Input Schema:**
```json
{
  "identifier": "string (required)"  // Note identifier (type/filename format)
}
```

### `find_broken_links`

Finds all broken wikilinks (links to non-existent notes).

**Input Schema:**
```json
{}
```

### `search_by_links`

Searches for notes based on their link relationships.

**Input Schema:**
```json
{
  "has_links_to": "array",        // Find notes that link to any of these notes
  "linked_from": "array",         // Find notes that are linked from any of these notes
  "external_domains": "array",    // Find notes with external links to these domains
  "broken_links": "boolean"       // Find notes with broken internal links
}
```

### `migrate_links`

Scans all existing notes and populates the link tables (one-time migration).

**Input Schema:**
```json
{
  "force": "boolean"  // Force migration even if link tables already contain data (default: false)
}
```

## Field Filtering

Many tools support field filtering through the `fields` parameter, which accepts an array of field names to include in the response. This supports:

- **Dot notation** for nested fields: `"metadata.tags"`
- **Wildcard patterns**: `"metadata.*"`
- **Top-level fields**: `"title"`, `"content"`, `"type"`, etc.

If not specified, all fields are returned.

## Error Handling

All tools return structured error responses when operations fail. Common error scenarios include:

- Missing workspace or vault
- Invalid note identifiers
- Content hash mismatches (optimistic locking)
- SQL security violations (for `search_notes_sql`)
- Missing required fields
- Invalid metadata schema definitions

## Security Notes

- The `search_notes_sql` tool only allows SELECT queries for security
- Forbidden SQL keywords are blocked
- Content hashes are used for optimistic locking to prevent concurrent modification conflicts
- All file operations are scoped to the configured vault directories