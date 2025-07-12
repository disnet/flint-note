# FlintNote API Documentation

The FlintNote API provides direct programmatic access to FlintNote functionality without requiring the MCP (Model Context Protocol) interface. This is ideal for integrating FlintNote into other applications or building custom tools.

## Installation

```bash
npm install @flint-note/server
```

## Quick Start

```typescript
import { FlintNoteApi } from '@flint-note/server/api';

const api = new FlintNoteApi({
  workspacePath: './my-notes'
});

await api.initialize();

// Create a note
await api.createSimpleNote('general', 'my-note', 'Hello, world!');

// Get the note
const note = await api.getNote('my-note');
console.log(note);
```

## API Reference

### Constructor

#### `new FlintNoteApi(config: FlintNoteApiConfig)`

Creates a new FlintNote API instance.

**Parameters:**
- `config`: Configuration object
  - `workspacePath?: string` - Path to the workspace directory
  - `throwOnError?: boolean` - Whether to throw errors or return them in results

### Initialization

#### `initialize(): Promise<void>`

Initializes the API. **Must be called before using any other methods.**

```typescript
await api.initialize();
```

## Note Operations

### `createNote(args: CreateNoteArgs): Promise<ApiCreateResult>`

Create one or more notes. Returns either a single note creation result or batch creation result depending on the input.

```typescript
await api.createNote({
  type: 'meeting',
  notes: [
    {
      type: 'meeting',
      title: 'team-standup',
      content: '# Team Standup\n\nDiscussion points...',
      metadata: {
        attendees: ['Alice', 'Bob'],
        date: '2024-01-15'
      }
    }
  ]
});
```

### `createSimpleNote(type: string, identifier: string, content: string, vaultId?: string): Promise<ApiCreateResult>`

Convenience method to create a simple note with just content.

```typescript
await api.createSimpleNote('general', 'my-note', 'Hello, world!');
```

### `getNote(identifier: string, vaultId?: string): Promise<ApiNote | null>`

Get a note by its identifier. Returns the complete note object or null if not found.

```typescript
const note = await api.getNote('my-note');
```

### `getNotes(args: GetNotesArgs): Promise<ApiMultipleNotesResult>`

Get multiple notes by their identifiers. Returns an array with results for each note, including any errors.

```typescript
const notes = await api.getNotes({
  identifiers: ['note1', 'note2', 'note3']
});
```

### `updateNote(args: UpdateNoteArgs): Promise<ApiUpdateResult>`

Update a note's content or metadata. Returns update result with timestamp and success status.

```typescript
await api.updateNote({
  identifier: 'my-note',
  content: 'Updated content',
  metadata: { updated: true }
});
```

### `updateNoteContent(identifier: string, content: string, vaultId?: string): Promise<ApiUpdateResult>`

Convenience method to update just the content of a note.

```typescript
await api.updateNoteContent('my-note', 'New content');
```

### `deleteNote(args: DeleteNoteArgs): Promise<ApiDeleteNoteResult>`

Delete a note. Returns deletion result with backup information and any warnings.

```typescript
await api.deleteNote({
  identifier: 'my-note',
  confirm: true
});
```

### `renameNote(args: RenameNoteArgs): Promise<ApiRenameNoteResult>`

Rename a note. Returns rename result including old/new names and link update count.

```typescript
await api.renameNote({
  identifier: 'old-name',
  new_identifier: 'new-name'
});
```

### `getNoteInfo(args: GetNoteInfoArgs): Promise<ApiNoteInfo>`

Get detailed information about a note. Returns basic note metadata without full content.

```typescript
const info = await api.getNoteInfo({
  identifier: 'my-note'
});
```

### `listNotesByType(args: ListNotesByTypeArgs): Promise<ApiNoteListItem[]>`

List all notes of a specific type. Returns an array of note list items with summary information.

```typescript
const meetingNotes = await api.listNotesByType({
  type: 'meeting',
  limit: 10
});
```

### `bulkDeleteNotes(args: BulkDeleteNotesArgs): Promise<ApiBulkDeleteResult>`

Delete multiple notes based on criteria. Returns bulk deletion result with counts and any errors.

```typescript
await api.bulkDeleteNotes({
  type: 'temporary',
  confirm: true
});
```

## Note Type Operations

### `createNoteType(args: CreateNoteTypeArgs): Promise<ApiCreateNoteTypeResult>`

Create a new note type with metadata schema. Returns creation result with type path and hash.

```typescript
await api.createNoteType({
  type_name: 'meeting',
  description: 'Meeting notes and action items',
  agent_instructions: [
    'Focus on key decisions and action items',
    'Include attendees and date'
  ],
  metadata_schema: {
    fields: [
      {
        name: 'attendees',
        type: 'array',
        description: 'Meeting attendees',
        required: true
      },
      {
        name: 'date',
        type: 'date',
        description: 'Meeting date',
        required: true
      }
    ]
  }
});
```

### `listNoteTypes(args?: ListNoteTypesArgs): Promise<ApiNoteTypeListItem[]>`

List all available note types. Returns an array of note type summaries with usage statistics.

```typescript
const noteTypes = await api.listNoteTypes();
```

### `updateNoteType(args: UpdateNoteTypeArgs): Promise<ApiUpdateNoteTypeResult>`

Update an existing note type. Returns update result with new content hash.

```typescript
await api.updateNoteType({
  type_name: 'meeting',
  description: 'Updated description'
});
```

### `getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<ApiNoteTypeInfo>`

Get detailed information about a note type. Returns complete type definition including schema and instructions.

```typescript
const typeInfo = await api.getNoteTypeInfo({
  type_name: 'meeting'
});
```

### `deleteNoteType(args: DeleteNoteTypeArgs): Promise<ApiDeleteNoteTypeResult>`

Delete a note type. Returns deletion result with migration information if applicable.

```typescript
await api.deleteNoteType({
  type_name: 'obsolete-type',
  action: 'migrate',
  target_type: 'general',
  confirm: true
});
```

## Search Operations

### `searchNotes(args: SearchNotesArgs): Promise<ApiSearchResultType>`

Basic text search across notes. Returns search response with results, timing, and metadata.

```typescript
const results = await api.searchNotes({
  query: 'meeting notes',
  limit: 10
});
```

### `searchNotesByText(query: string, vaultId?: string, limit?: number): Promise<ApiSearchResultType>`

Convenience method for simple text search.

```typescript
const results = await api.searchNotesByText('important', undefined, 5);
```

### `searchNotesAdvanced(args: SearchNotesAdvancedArgs): Promise<ApiSearchResultType>`

Advanced search with filters and options. Returns enhanced search response with applied filters and sorting information.

```typescript
const results = await api.searchNotesAdvanced({
  query: 'project',
  type: 'meeting',
  tags: ['important'],
  date_from: '2024-01-01',
  date_to: '2024-01-31',
  limit: 20,
  include_content: true
});
```

### `searchNotesSQL(args: SearchNotesSqlArgs): Promise<ApiSearchResultType>`

Direct SQL query against the notes database. Returns SQL search response with raw results and column information.

```typescript
const results = await api.searchNotesSQL({
  query: "SELECT title, type FROM notes WHERE created > '2024-01-01' ORDER BY created DESC"
});
```

## Vault Operations

### `listVaults(): Promise<ApiVaultListResponse>`

List all available vaults. Returns vault list with current vault indication and statistics.

```typescript
const vaults = await api.listVaults();
```

### `createVault(args: CreateVaultArgs): Promise<ApiCreateVaultResult>`

Create a new vault. Returns creation result with initialization and switch status.

```typescript
await api.createVault({
  name: 'Project Notes',
  path: './project-vault',
  description: 'Notes for the current project'
});
```

### `switchVault(args: SwitchVaultArgs): Promise<ApiVaultOperationResult>`

Switch to a different vault. Returns operation result with success status and timing.

```typescript
await api.switchVault({
  vault_id: 'project-vault'
});
```

### `removeVault(args: RemoveVaultArgs): Promise<ApiVaultOperationResult>`

Remove a vault. Returns operation result with removal confirmation.

```typescript
await api.removeVault({
  vault_id: 'old-vault',
  confirm: true
});
```

### `getCurrentVault(): Promise<ApiVaultInfo>`

Get information about the current active vault. Returns detailed vault information including statistics.

```typescript
const currentVault = await api.getCurrentVault();
```

### `updateVault(args: UpdateVaultArgs): Promise<ApiVaultOperationResult>`

Update vault information. Returns operation result with update confirmation.

```typescript
await api.updateVault({
  vault_id: 'my-vault',
  name: 'Updated Name',
  description: 'Updated description'
});
```

## Link Operations

### `getNoteLinks(identifier: string, vaultId?: string): Promise<ApiNoteLinkResponse>`

Get all outbound links from a note. Returns link response with detailed link information and counts.

```typescript
const links = await api.getNoteLinks('my-note');
```

### `getBacklinks(identifier: string, vaultId?: string): Promise<ApiBacklinksResponse>`

Get all inbound links to a note. Returns backlinks response with source note information.

```typescript
const backlinks = await api.getBacklinks('my-note');
```

### `findBrokenLinks(vaultId?: string): Promise<ApiBrokenLinksResponse>`

Find all broken links in the vault. Returns broken links response with detailed error information.

```typescript
const brokenLinks = await api.findBrokenLinks();
```

### `searchByLinks(args: SearchByLinksArgs): Promise<ApiLinkSearchResponse>`

Search notes based on their link relationships. Returns link search response with matching criteria.

```typescript
const results = await api.searchByLinks({
  has_links_to: ['important-note'],
  linked_from: ['meeting-notes']
});
```

### `migrateLinks(force?: boolean, vaultId?: string): Promise<ApiMigrateLinksResult>`

Migrate and update link formats. Returns migration result with processing statistics and any errors.

```typescript
await api.migrateLinks(false);
```

## Resource Operations

### `getTypesResource(): Promise<ApiTypesResource>`

Get available note types as a resource. Returns types resource with usage statistics.

```typescript
const types = await api.getTypesResource();
```

### `getRecentResource(): Promise<ApiRecentResource>`

Get recently modified notes. Returns recent resource with note summaries and timestamps.

```typescript
const recent = await api.getRecentResource();
```

### `getStatsResource(): Promise<ApiStatsResource>`

Get workspace statistics. Returns comprehensive stats resource with counts, sizes, and activity metrics.

```typescript
const stats = await api.getStatsResource();
```

## Error Handling

All methods can throw errors. It's recommended to wrap API calls in try-catch blocks:

```typescript
try {
  const note = await api.getNote('my-note');
  console.log(note);
} catch (error) {
  console.error('Failed to get note:', error);
}
```

The API will throw an error if you try to use it before calling `initialize()`:

```typescript
const api = new FlintNoteApi(config);

// This will throw an error
try {
  await api.getNote('my-note'); // Error: FlintNoteApi must be initialized before use
} catch (error) {
  console.error(error.message);
}

// Initialize first
await api.initialize();
await api.getNote('my-note'); // Now this works
```

## Examples

See the `examples/` directory for complete usage examples:
- `examples/api-usage.js` - JavaScript example
- `examples/api-usage.ts` - TypeScript example with full type annotations

## Migration from MCP Server

If you're currently using the MCP server interface, the API provides equivalent functionality:

**MCP Server (old way):**
```javascript
// Via MCP protocol
const response = await client.callTool('get_note', { identifier: 'my-note' });
```

**Direct API (new way):**
```javascript
// Direct method call
const note = await api.getNote('my-note');
```

The API methods correspond directly to the MCP tools, but with a more convenient interface and better TypeScript support.
