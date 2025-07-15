# MCP Resources Guide

This document describes the MCP (Model Context Protocol) resources available in flint-note, which provide read-only access to notes and collections through URI-based requests.

## Overview

flint-note exposes notes and collections as MCP resources, allowing AI agents and other clients to read note content and metadata without using tools. Resources complement the existing tool-based API by providing efficient, read-only access patterns.

## Resource Types

### Static Resources

These resources provide system-level information:

| URI | MIME Type | Description |
|-----|-----------|-------------|
| `flint-note://types` | `application/json` | List of all available note types |
| `flint-note://recent` | `application/json` | Recently modified notes (last 20) |
| `flint-note://stats` | `application/json` | Workspace statistics |

### Dynamic Resources

These resources provide access to individual notes and collections:

#### Individual Notes

Access specific notes by their identifier:

```
flint-note://note/{type}/{filename}
flint-note://note/{vault_id}/{type}/{filename}
```

- **Returns**: Complete note object as JSON
- **MIME Type**: `application/json`
- **Examples**:
  - `flint-note://note/general/my-note`
  - `flint-note://note/work-vault/project/meeting-notes`

#### Note Collections by Type

List all notes of a specific type:

```
flint-note://notes/{type}
flint-note://notes/{vault_id}/{type}
```

- **Returns**: JSON array of note metadata
- **MIME Type**: `application/json`
- **Examples**:
  - `flint-note://notes/general`
  - `flint-note://notes/personal-vault/project`

#### Tagged Notes

List all notes with a specific tag:

```
flint-note://notes/tagged/{tag}
flint-note://notes/tagged/{vault_id}/{tag}
```

- **Returns**: JSON array of note metadata for notes with the specified tag
- **MIME Type**: `application/json`
- **Examples**:
  - `flint-note://notes/tagged/important`
  - `flint-note://notes/tagged/work-vault/urgent`

#### Incoming Links

List all notes that link to a specific note:

```
flint-note://links/incoming/{type}/{filename}
flint-note://links/incoming/{vault_id}/{type}/{filename}
```

- **Returns**: JSON array of note identifiers that link to the target note
- **MIME Type**: `application/json`
- **Examples**:
  - `flint-note://links/incoming/general/main-topic`
  - `flint-note://links/incoming/research-vault/paper/conclusions`

## Multi-Vault Support

All dynamic resources support multi-vault access by including a `vault_id` in the URI path. When no vault ID is provided, the current active vault is used.

### Vault ID Resolution

- **With vault ID**: `flint-note://note/my-vault/general/note-name`
- **Without vault ID**: `flint-note://note/general/note-name` (uses current vault)

## Response Formats

### Individual Note Response

Individual notes return complete note objects as JSON:

```json
{
  "id": "general/my-note",
  "type": "general",
  "filename": "my-note.md",
  "path": "/path/to/general/my-note.md",
  "title": "My Note",
  "content": "# My Note\n\nThis is the content of my note.",
  "content_hash": "abc123...",
  "metadata": {
    "title": "My Note",
    "type": "general",
    "created": "2024-01-01T12:00:00.000Z",
    "updated": "2024-01-01T12:00:00.000Z",
    "tags": ["important", "draft"]
  },
  "created": "2024-01-01T12:00:00.000Z",
  "modified": "2024-01-01T12:00:00.000Z",
  "updated": "2024-01-01T12:00:00.000Z",
  "size": 1024
}
```

### Collection Response

Collections return JSON arrays with note metadata:

```json
[
  {
    "id": "general/my-note",
    "type": "general",
    "filename": "my-note.md",
    "title": "My Note",
    "created": "2024-01-01T12:00:00.000Z",
    "modified": "2024-01-01T12:00:00.000Z",
    "size": 1024,
    "tags": ["important", "draft"],
    "path": "/path/to/general/my-note.md"
  }
]
```

## Usage Examples

### MCP Client

```javascript
// List available resources
const resources = await client.request({
  method: 'resources/list'
});

// Read an individual note
const noteResponse = await client.request({
  method: 'resources/read',
  params: { uri: 'flint-note://note/general/my-note' }
});
const note = JSON.parse(noteResponse.contents[0].text);
console.log(`Note: ${note.title}`);
console.log(`Content: ${note.content}`);
console.log(`Tags: ${note.metadata.tags.join(', ')}`);

// Get all project notes
const projectNotesResponse = await client.request({
  method: 'resources/read',
  params: { uri: 'flint-note://notes/project' }
});
const projectNotes = JSON.parse(projectNotesResponse.contents[0].text);
console.log(`Found ${projectNotes.length} project notes`);

// Find notes tagged as 'urgent'
const urgentNotesResponse = await client.request({
  method: 'resources/read',
  params: { uri: 'flint-note://notes/tagged/urgent' }
});
const urgentNotes = JSON.parse(urgentNotesResponse.contents[0].text);
console.log(`Found ${urgentNotes.length} urgent notes`);
```

## Error Handling

Resources return appropriate errors for common failure cases:

| Error | Cause | Example |
|-------|-------|---------|
| `Note not found` | Invalid note identifier | Non-existent note |
| `Note type 'xyz' does not exist` | Invalid note type | Non-existent type directory |
| `Unknown resource` | Invalid URI pattern | Malformed URI |

## Performance Considerations

- **Individual notes**: Fast direct file access
- **Collections**: Cached directory listings
- **Tagged notes**: Filtered from cached listings
- **Incoming links**: Uses link database for efficiency

## Best Practices

1. **Use collections for discovery**: Start with type or tag collections to find relevant notes
2. **Cache resource lists**: The available resources rarely change
3. **Handle errors gracefully**: Notes may be deleted or moved between requests
4. **Prefer specific vault IDs**: Explicit vault references are more reliable than relying on current vault
5. **Combine with tools**: Use resources for reading, tools for writing

## Integration with Existing Tools

Resources complement the existing tool-based API:

- **Resources**: Read-only access, efficient browsing, content discovery
- **Tools**: Write operations, complex queries, batch operations
- **Search tools**: Full-text search across note content
- **Link tools**: Manage wikilinks and relationships

## Security Notes

- Resources are read-only and cannot modify notes
- Vault isolation is maintained - cannot access notes from unauthorized vaults
- File system paths are not exposed in responses
- All access goes through the note management layer with validation

## Future Enhancements

Planned resource extensions:

- Query-based dynamic resources (e.g., `flint-note://query?tag=urgent&type=project`)
- Content-specific resources (e.g., `flint-note://metadata/{identifier}`)
- Relationship resources (e.g., `flint-note://links/outgoing/{identifier}`)
- Timeline resources (e.g., `flint-note://timeline/recent/7d`)
