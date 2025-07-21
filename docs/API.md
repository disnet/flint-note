# FlintNote API Documentation

The FlintNote API provides direct programmatic access to FlintNote functionality with a clean, type-safe interface. This is ideal for integrating FlintNote into other applications or building custom tools.

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
const noteInfo = await api.createNote({
  type: 'general',
  title: 'my-note',
  content: 'Hello, world!'
});
console.log(noteInfo.id, noteInfo.title, noteInfo.path);

// Get the note
const note = await api.getNote('general/my-note.md');
console.log(note.content, note.metadata);
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

## Core Note Operations

### `createNote(options: CreateSingleNoteOptions): Promise<NoteInfo>`

Create a single note. Returns a `NoteInfo` object.

```typescript
const noteInfo = await api.createNote({
  type: 'general',
  title: 'my-note',
  content: '# My Note\n\nContent here...',
  metadata: { priority: 'high' }, // optional
  vaultId: 'my-vault' // optional
});

// noteInfo: { id, type, title, filename, path, created }
console.log(noteInfo.id);      // "general/my-note.md"
console.log(noteInfo.title);   // "my-note"
console.log(noteInfo.created); // "2024-01-15T10:30:00.000Z"
```

**Options:**
- `type` (string): Note type name
- `title` (string): Note title
- `content` (string): Note content
- `metadata?` (object): Optional metadata
- `vaultId?` (string): Optional vault ID

### `createNotes(options: CreateMultipleNotesOptions): Promise<NoteInfo[]>`

Create multiple notes in batch. Returns an array of `NoteInfo` objects.

```typescript
const noteInfos = await api.createNotes({
  notes: [
    {
      type: 'meeting',
      title: 'team-standup',
      content: '# Team Standup\n\nDiscussion points...',
      metadata: {
        attendees: ['Alice', 'Bob'],
        date: '2024-01-15'
      }
    },
    {
      type: 'meeting',
      title: 'project-review',
      content: '# Project Review\n\nStatus update...'
    }
  ],
  vaultId: 'my-vault' // optional
});

// noteInfos is NoteInfo[] - array of NoteInfo objects
console.log(noteInfos.length);     // 2
console.log(noteInfos[0].title);   // "team-standup"
```

**Options:**
- `notes` (array): Array of note objects to create
- `vaultId?` (string): Optional vault ID

### `getNote(identifier: string, vaultId?: string): Promise<Note | null>`

Get a note by its identifier. Returns the `Note` object or `null` if not found.

```typescript
const note = await api.getNote('general/my-note.md');

if (note) {
  // note object with all fields directly accessible
  console.log(note.content);      // Full note content
  console.log(note.metadata);     // Note metadata object
  console.log(note.content_hash); // Content hash for updates
  console.log(note.links);        // Array of links in the note
} else {
  console.log('Note not found');
}
```

### `updateNote(options: UpdateNoteOptions): Promise<UpdateResult>`

Update a note's content and optionally its metadata. Returns `UpdateResult` with update status.

```typescript
// First, get the note to obtain content hash
const note = await api.getNote('general/my-note.md');
if (!note) throw new Error('Note not found');

// Update the note content and metadata
const updateResult = await api.updateNote({
  identifier: 'general/my-note.md',
  content: '# Updated Content\n\nNew content here...',
  contentHash: note.content_hash,
  metadata: { priority: 'high', tags: ['updated'] },
  vaultId: 'my-vault' // optional
});

// updateResult is UpdateResult
console.log(updateResult.id);        // "general/my-note.md"
console.log(updateResult.updated);   // true
console.log(updateResult.timestamp); // "2024-01-15T10:35:00.000Z"
```

**Options:**
- `identifier` (string): Note identifier
- `content` (string): New note content
- `contentHash` (string): Current content hash for optimistic locking
- `metadata?` (object): Optional metadata to update
- `vaultId?` (string): Optional vault ID

### `updateNotes(options: UpdateMultipleNotesOptions): Promise<BatchUpdateResult>`

Update multiple notes in batch. Returns `BatchUpdateResult` with detailed results for each update.

```typescript
// First, get the notes to obtain content hashes
const note1 = await api.getNote('general/note1.md');
const note2 = await api.getNote('general/note2.md');
if (!note1 || !note2) throw new Error('Notes not found');

// Update multiple notes
const batchResult = await api.updateNotes({
  notes: [
    {
      identifier: 'general/note1.md',
      content: '# Updated Note 1\n\nNew content for note 1...',
      contentHash: note1.content_hash,
      metadata: { status: 'updated', priority: 'high' }
    },
    {
      identifier: 'general/note2.md',
      content: '# Updated Note 2\n\nNew content for note 2...',
      contentHash: note2.content_hash,
      metadata: { status: 'updated', priority: 'medium' }
    }
  ],
  vaultId: 'my-vault' // optional
});

// batchResult is BatchUpdateResult
console.log(`${batchResult.successful}/${batchResult.total} notes updated successfully`);
console.log(`${batchResult.failed} notes failed to update`);

// Check individual results
batchResult.results.forEach((result, index) => {
  if (result.success) {
    console.log(`Note ${index + 1}: Updated successfully`);
    console.log(`Updated at: ${result.result?.timestamp}`);
  } else {
    console.log(`Note ${index + 1}: Update failed - ${result.error}`);
  }
});
```

**Options:**
- `notes` (array): Array of note update objects
  - `identifier` (string): Note identifier
  - `content` (string): New note content
  - `contentHash` (string): Current content hash for optimistic locking
  - `metadata?` (object): Optional metadata to update
- `vaultId?` (string): Optional vault ID

### `deleteNote(options: DeleteNoteOptions): Promise<DeleteNoteResult>`

Delete a note. Returns `DeleteNoteResult` with deletion status.

```typescript
const deleteResult = await api.deleteNote({
  identifier: 'general/my-note.md',
  confirm: true,
  vaultId: 'my-vault' // optional
});

// deleteResult is DeleteNoteResult
console.log(deleteResult.id);           // "general/my-note.md"
console.log(deleteResult.deleted);      // true
console.log(deleteResult.timestamp);    // "2024-01-15T10:40:00.000Z"
console.log(deleteResult.backup_path);  // Path to backup file (if created)
```

**Options:**
- `identifier` (string): Note identifier
- `confirm?` (boolean): Confirm deletion (default: true)
- `vaultId?` (string): Optional vault ID

### `listNotes(options: ListNotesOptions = {}): Promise<NoteListItem[]>`

List notes by type. Returns array of `NoteListItem` objects.

```typescript
// List all notes of a specific type
const generalNotes = await api.listNotes({
  typeName: 'general'
});

// List with limit
const recentNotes = await api.listNotes({
  limit: 10
});

// List with type and limit
const limitedNotes = await api.listNotes({
  typeName: 'meeting',
  limit: 5,
  vaultId: 'my-vault' // optional
});

// Each item is NoteListItem
generalNotes.forEach(item => {
  console.log(item.id);          // Note identifier
  console.log(item.title);       // Note title
  console.log(item.type);        // Note type
  console.log(item.created);     // Creation timestamp
  console.log(item.size);        // File size
});
```

**Options:**
- `typeName?` (string): Filter by note type
- `limit?` (number): Maximum number of notes to return
- `vaultId?` (string): Optional vault ID

### `getNotes(args: GetNotesArgs): Promise<(Note | null)[]>`

Get multiple notes by their identifiers. Returns array of `Note` objects.

```typescript
const notes = await api.getNotes({
  identifiers: ['general/note1.md', 'meeting/standup.md'],
  vault_id: 'my-vault'
});

// notes is (Note | null)[] - null for notes that don't exist
notes.forEach((note, index) => {
  if (note) {
    console.log(`Note ${index}: ${note.title}`);
  } else {
    console.log(`Note ${index}: not found`);
  }
});
```

### `getNoteInfo(args: GetNoteInfoArgs): Promise<Note | null>`

Get note metadata without full content. Supports flexible identifier resolution.

```typescript
// Get by exact identifier
const note1 = await api.getNoteInfo({ title_or_filename: 'meeting-notes.md' });

// Get by title with type context
const note2 = await api.getNoteInfo({
  title_or_filename: 'standup',
  type: 'meeting'
});
```

### `renameNote(args: RenameNoteArgs): Promise<{success: boolean; notesUpdated?: number; linksUpdated?: number}>`

Rename a note and update all references to it.

```typescript
// First get the note to obtain content hash
const note = await api.getNote('general/old-name.md');
if (!note) throw new Error('Note not found');

const result = await api.renameNote({
  identifier: 'general/old-name.md',
  new_title: 'new-name',
  content_hash: note.content_hash
});

console.log(result.success);       // true
console.log(result.notesUpdated);  // 1
console.log(result.linksUpdated);  // 3 (if 3 other notes linked to this one)
```

### `bulkDeleteNotes(args: BulkDeleteNotesArgs): Promise<DeleteNoteResult[]>`

Delete multiple notes based on criteria.

```typescript
// Delete all notes of a specific type
const results = await api.bulkDeleteNotes({
  type: 'draft',
  confirm: true
});

// Delete notes matching a pattern
const results2 = await api.bulkDeleteNotes({
  pattern: 'temp-*',
  confirm: true
});

// Delete notes with specific tags
const results3 = await api.bulkDeleteNotes({
  tags: ['deprecated', 'old'],
  confirm: true
});

results.forEach(result => {
  console.log(`${result.id}: ${result.deleted ? 'deleted' : 'failed'}`);
});
```

## Note Type Operations

### `createNoteType(args: CreateNoteTypeArgs): Promise<NoteTypeInfo>`

Create a new note type with description and optional metadata schema.

```typescript
const noteTypeInfo = await api.createNoteType({
  type_name: 'project',
  description: 'Project documentation and planning notes',
  agent_instructions: 'Focus on technical details and milestones',
  metadata_schema: [
    { name: 'priority', type: 'string', required: true },
    { name: 'deadline', type: 'date', required: false }
  ]
});

console.log(noteTypeInfo.name);        // 'project'
console.log(noteTypeInfo.filename);    // 'project_description.md'
```

### `listNoteTypes(args?: ListNoteTypesArgs): Promise<NoteTypeListItem[]>`

List all available note types.

```typescript
const noteTypes = await api.listNoteTypes();

noteTypes.forEach(type => {
  console.log(type.name);         // Type name
  console.log(type.description);  // Type description
  console.log(type.noteCount);    // Number of notes of this type
});
```

### `getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<NoteTypeDescription>`

Get detailed information about a note type.

```typescript
const typeInfo = await api.getNoteTypeInfo({ type_name: 'meeting' });

console.log(typeInfo.parsed.description);         // Type description
console.log(typeInfo.parsed.agentInstructions);   // Agent instructions array
console.log(typeInfo.parsed.metadataSchema);      // Metadata schema object
```

### `updateNoteType(args: UpdateNoteTypeArgs): Promise<NoteTypeDescription>`

Update an existing note type.

```typescript
const updatedType = await api.updateNoteType({
  type_name: 'meeting',
  description: 'Updated meeting notes template',
  instructions: 'Include action items and follow-up tasks',
  metadata_schema: [
    { name: 'attendees', type: 'array', required: true },
    { name: 'date', type: 'date', required: true }
  ]
});
```

### `deleteNoteType(args: DeleteNoteTypeArgs): Promise<NoteTypeDeleteResult>`

Delete a note type with options for handling existing notes.

```typescript
// Delete type and move notes to another type
const result = await api.deleteNoteType({
  type_name: 'draft',
  action: 'move',
  target_type: 'general',
  confirm: true
});

// Delete type and all its notes
const result2 = await api.deleteNoteType({
  type_name: 'temp',
  action: 'delete',
  confirm: true
});

console.log(result.success);      // true
console.log(result.notesAffected); // Number of notes moved/deleted
```

## Search Operations

### `searchNotes(args: SearchNotesArgs): Promise<SearchResult[]>`

Basic text search across all notes with optional type filtering.

```typescript
const results = await api.searchNotes({
  query: 'project update',
  type_filter: 'meeting',
  limit: 20,
  use_regex: false
});

results.forEach(result => {
  console.log(result.note_id);     // Note identifier
  console.log(result.title);       // Note title
  console.log(result.excerpt);     // Relevant excerpt
  console.log(result.score);       // Relevance score
});
```

### `searchNotesAdvanced(args: SearchNotesAdvancedArgs): Promise<SearchResult[]>`

Advanced search with structured filtering and options.

```typescript
const results = await api.searchNotesAdvanced({
  query: 'technical documentation',
  types: ['project', 'technical'],
  tags: ['important'],
  created_after: '2024-01-01',
  created_before: '2024-12-31',
  limit: 50
});
```

### `searchNotesSQL(args: SearchNotesSqlArgs): Promise<SearchResult[]>`

Execute custom SQL queries against the notes database.

```typescript
const results = await api.searchNotesSQL({
  query: `
    SELECT n.id, n.title, n.type
    FROM notes n
    WHERE n.content LIKE '%important%'
    AND n.created > datetime('2024-01-01')
    ORDER BY n.created DESC
    LIMIT 10
  `
});
```

### `searchNotesByText(options: SearchNotesByTextOptions): Promise<SearchResult[]>`

Convenience method for simple text search.

```typescript
const results = await api.searchNotesByText({
  query: 'meeting notes',
  typeFilter: 'meeting',
  limit: 10,
  vaultId: 'my-vault' // optional
});
```

**Options:**
- `query` (string): Search query
- `typeFilter?` (string): Filter by note type
- `limit?` (number): Maximum results (default: 10)
- `vaultId?` (string): Optional vault ID

## Vault Operations

### `getCurrentVault(): Promise<VaultInfo | null>`

Get information about the currently active vault.

```typescript
const currentVault = await api.getCurrentVault();

if (currentVault) {
  console.log(currentVault.id);          // Vault ID
  console.log(currentVault.name);        // Display name
  console.log(currentVault.path);        // File system path
  console.log(currentVault.description); // Optional description
}
```

### `listVaults(): Promise<VaultInfo[]>`

List all configured vaults.

```typescript
const vaults = await api.listVaults();

vaults.forEach(vault => {
  console.log(`${vault.name} (${vault.id}): ${vault.path}`);
});
```

### `createVault(args: CreateVaultArgs): Promise<VaultInfo>`

Create a new vault with optional initialization.

```typescript
const newVault = await api.createVault({
  id: 'project-notes',
  name: 'Project Documentation',
  path: '~/Documents/project-notes',
  description: 'All project-related documentation',
  initialize: true,    // Create default note types
  switch_to: true      // Switch to this vault after creation
});

console.log(`Created vault: ${newVault.name} at ${newVault.path}`);
```

### `switchVault(args: SwitchVaultArgs): Promise<void>`

Switch to a different vault.

```typescript
await api.switchVault({ id: 'project-notes' });
// API is now working with the project-notes vault
```

### `updateVault(args: UpdateVaultArgs): Promise<void>`

Update vault metadata (name and/or description).

```typescript
await api.updateVault({
  id: 'project-notes',
  name: 'Updated Project Name',
  description: 'Updated description'
});
```

### `removeVault(args: RemoveVaultArgs): Promise<void>`

Remove a vault from the registry (files are not deleted).

```typescript
await api.removeVault({ id: 'old-vault' });
// Vault is removed from registry but files remain on disk
```

## Link Operations

### `getNoteLinks(identifier: string, vaultId?: string): Promise<{outgoing_internal: NoteLinkRow[]; outgoing_external: ExternalLinkRow[]; incoming: NoteLinkRow[]}>`

Get all links for a specific note (outgoing and incoming).

```typescript
const links = await api.getNoteLinks('general/my-note.md');

console.log('Outgoing internal links:', links.outgoing_internal.length);
console.log('Outgoing external links:', links.outgoing_external.length);
console.log('Incoming links (backlinks):', links.incoming.length);

// Each internal link has: source_note_id, target_note_id, link_text, etc.
// Each external link has: note_id, url, link_text, etc.
```

### `getBacklinks(identifier: string, vaultId?: string): Promise<NoteLinkRow[]>`

Get all notes that link to the specified note.

```typescript
const backlinks = await api.getBacklinks('general/important-note.md');

backlinks.forEach(link => {
  console.log(`${link.source_note_id} links to this note`);
  console.log(`Link text: "${link.link_text}"`);
});
```

### `findBrokenLinks(vaultId?: string): Promise<NoteLinkRow[]>`

Find all broken wikilinks (links to non-existent notes).

```typescript
const brokenLinks = await api.findBrokenLinks();

brokenLinks.forEach(link => {
  console.log(`Broken link in ${link.source_note_id}`);
  console.log(`Missing target: ${link.target_note_id}`);
  console.log(`Link text: "${link.link_text}"`);
});
```

### `searchByLinks(args: SearchByLinksArgs): Promise<NoteRow[]>`

Search for notes based on their link relationships.

```typescript
// Find notes that link to specific notes
const notesLinkingTo = await api.searchByLinks({
  has_links_to: ['general/important.md', 'reference/guide.md']
});

// Find notes linked from specific notes
const notesLinkedFrom = await api.searchByLinks({
  linked_from: ['index.md']
});

// Find notes with external links to specific domains
const notesWithExternalLinks = await api.searchByLinks({
  external_domains: ['github.com', 'stackoverflow.com']
});

// Find notes with broken links
const notesWithBrokenLinks = await api.searchByLinks({
  broken_links: true
});
```

### `migrateLinks(force?: boolean, vaultId?: string): Promise<MigrationResult>`

Scan all existing notes and populate the link tables (one-time migration).

```typescript
const result = await api.migrateLinks(true); // force = true

console.log(`Processed ${result.processed}/${result.total_notes} notes`);
console.log(`Errors: ${result.errors}`);
if (result.error_details) {
  console.log('Error details:', result.error_details);
}
```

## Utility Methods

### `getManagers()`

Get direct access to the underlying managers for advanced use cases.

```typescript
const { workspace, noteManager, noteTypeManager, hybridSearchManager } = api.getManagers();

// Direct manager access for advanced operations
const customResult = await noteManager.searchNotes({
  query: 'advanced search',
  typeFilter: 'meeting',
  limit: 20
});
```

### `resolveVaultContext(vaultId?: string): Promise<VaultContext>`

Resolve vault context for multi-vault scenarios.

```typescript
const context = await api.resolveVaultContext('project-vault');
// Returns: { workspace, noteManager, noteTypeManager, hybridSearchManager }
```

## Interface Types

### Options Interfaces

#### `CreateSingleNoteOptions`
```typescript
interface CreateSingleNoteOptions {
  type: string;              // Note type name
  title: string;             // Note title
  content: string;           // Note content
  metadata?: NoteMetadata;   // Optional metadata
  vaultId?: string;          // Optional vault ID
}
```

#### `CreateMultipleNotesOptions`
```typescript
interface CreateMultipleNotesOptions {
  notes: Array<{             // Array of notes to create
    type: string;
    title: string;
    content: string;
    metadata?: NoteMetadata;
  }>;
  vaultId?: string;          // Optional vault ID
}
```

#### `UpdateNoteOptions`
```typescript
interface UpdateNoteOptions {
  identifier: string;        // Note identifier
  content: string;           // New content
  contentHash: string;       // Current content hash
  vaultId?: string;          // Optional vault ID
  metadata?: NoteMetadata;   // Optional metadata to update
}
```

#### `UpdateNoteContentOptions`
```typescript
interface UpdateNoteContentOptions {
  identifier: string;        // Note identifier
  content: string;           // New content
  vaultId?: string;          // Optional vault ID
  metadata?: NoteMetadata;   // Optional metadata to update
}
```

#### `UpdateMultipleNotesOptions`
```typescript
interface UpdateMultipleNotesOptions {
  notes: Array<{             // Array of notes to update
    identifier: string;      // Note identifier
    content: string;         // New content
    contentHash: string;     // Current content hash
    metadata?: NoteMetadata; // Optional metadata to update
  }>;
  vaultId?: string;          // Optional vault ID
}
```

#### `DeleteNoteOptions`
```typescript
interface DeleteNoteOptions {
  identifier: string;        // Note identifier
  confirm?: boolean;         // Confirm deletion (default: true)
  vaultId?: string;          // Optional vault ID
}
```

#### `ListNotesOptions`
```typescript
interface ListNotesOptions {
  typeName?: string;         // Filter by note type
  limit?: number;            // Maximum results
  vaultId?: string;          // Optional vault ID
}
```

#### `SearchNotesByTextOptions`
```typescript
interface SearchNotesByTextOptions {
  query: string;             // Search query
  typeFilter?: string;       // Filter by note type
  limit?: number;            // Maximum results (default: 10)
  vaultId?: string;          // Optional vault ID
}
```

## Return Types

The `FlintNoteApi` returns pure TypeScript objects from the core managers:

### `NoteInfo`
```typescript
interface NoteInfo {
  id: string;          // Unique note identifier
  type: string;        // Note type
  title: string;       // Note title
  filename: string;    // File name
  path: string;        // Full file path
  created: string;     // ISO timestamp
}
```

### `Note`
```typescript
interface Note {
  id: string;              // Unique note identifier
  title: string;           // Note title
  content: string;         // Full note content
  metadata: NoteMetadata;  // Note metadata object
  content_hash: string;    // Hash for content verification
  links: NoteLink[];       // Array of links in the note
  type: string;            // Note type
  created: string;         // ISO timestamp
  updated: string;         // ISO timestamp
  // ... additional fields
}
```

### `UpdateResult`
```typescript
interface UpdateResult {
  id: string;           // Note identifier
  updated: boolean;     // Success status
  timestamp: string;    // ISO timestamp
}
```

### `BatchUpdateResult`
```typescript
interface BatchUpdateResult {
  total: number;        // Total number of update attempts
  successful: number;   // Number of successful updates
  failed: number;       // Number of failed updates
  results: Array<{      // Individual results for each update
    success: boolean;   // Whether this update succeeded
    result?: UpdateResult;  // Update result if successful
    error?: string;     // Error message if failed
  }>;
}
```

### `DeleteNoteResult`
```typescript
interface DeleteNoteResult {
  id: string;            // Note identifier
  deleted: boolean;      // Success status
  timestamp: string;     // ISO timestamp
  backup_path?: string;  // Backup file path (if created)
  warnings?: string[];   // Any warnings during deletion
}
```

### `NoteListItem`
```typescript
interface NoteListItem {
  id: string;          // Note identifier
  title: string;       // Note title
  type: string;        // Note type
  created: string;     // ISO timestamp
  updated: string;     // ISO timestamp
  size: number;        // File size in bytes
  tags: string[];      // Note tags
  path: string;        // File path
}
```

### `SearchResult`
```typescript
interface SearchResult {
  note_id: string;     // Note identifier
  title: string;       // Note title
  excerpt: string;     // Relevant text excerpt
  score: number;       // Relevance score (0-1)
  type?: string;       // Note type
  created?: string;    // Creation timestamp
}
```

### `VaultInfo`
```typescript
interface VaultInfo {
  id: string;              // Unique vault identifier
  name: string;            // Display name
  path: string;            // File system path
  description?: string;    // Optional description
  last_accessed: string;   // Last accessed timestamp
  created: string;         // Creation timestamp
}
```

### `NoteTypeInfo`
```typescript
interface NoteTypeInfo {
  name: string;            // Type name
  filename: string;        // Description file name
  path: string;            // Full file path
  created: string;         // Creation timestamp
}
```

### `NoteTypeListItem`
```typescript
interface NoteTypeListItem {
  name: string;            // Type name
  description: string;     // Type description
  noteCount: number;       // Number of notes of this type
  filename: string;        // Description file name
}
```

### `NoteTypeDescription`
```typescript
interface NoteTypeDescription {
  raw: string;             // Raw markdown content
  parsed: {
    description: string;           // Parsed description
    agentInstructions: string[];   // Agent instructions array
    metadataSchema?: object;       // Metadata schema
  };
}
```

### `NoteLinkRow`
```typescript
interface NoteLinkRow {
  source_note_id: string;  // Source note identifier
  target_note_id: string;  // Target note identifier
  link_text: string;       // Display text of the link
  link_type: string;       // Type of link (wikilink, etc.)
}
```

### `ExternalLinkRow`
```typescript
interface ExternalLinkRow {
  note_id: string;         // Note containing the link
  url: string;             // External URL
  link_text: string;       // Display text of the link
  link_type: string;       // Type of link (markdown, etc.)
}
```

### `NoteRow`
```typescript
interface NoteRow {
  id: string;              // Note identifier
  title: string;           // Note title
  content: string;         // Note content
  type: string;            // Note type
  created: string;         // Creation timestamp
  updated: string;         // Last update timestamp
  // ... additional database fields
}
```

## Error Handling

All methods can throw errors. It's recommended to wrap API calls in try-catch blocks:

```typescript
try {
  const note = await api.getNote('my-note');
  if (note) {
    console.log('Found note:', note.title);
  } else {
    console.log('Note not found');
  }
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

## Method Reference

`FlintNoteApi` provides complete FlintNote functionality with 32 methods:

**✅ Core Note Operations (12 methods):**
- `createNote()`, `createNotes()`, `getNote()`, `getNotes()`, `getNoteInfo()`
- `updateNote()`, `updateNotes()`, `updateNoteContent()`, `deleteNote()`, `bulkDeleteNotes()`
- `listNotes()`, `renameNote()`

**✅ Note Type Operations (5 methods):**
- `createNoteType()`, `listNoteTypes()`, `getNoteTypeInfo()`
- `updateNoteType()`, `deleteNoteType()`

**✅ Search Operations (4 methods):**
- `searchNotes()`, `searchNotesAdvanced()`, `searchNotesSQL()`, `searchNotesByText()`

**✅ Vault Operations (6 methods):**
- `getCurrentVault()`, `listVaults()`, `createVault()`
- `switchVault()`, `updateVault()`, `removeVault()`

**✅ Link Operations (5 methods):**
- `getNoteLinks()`, `getBacklinks()`, `findBrokenLinks()`
- `searchByLinks()`, `migrateLinks()`

## Examples

### Basic Note Management
```typescript
import { FlintNoteApi } from '@flint-note/server/api';

const api = new FlintNoteApi({
  workspacePath: './my-notes'
});

await api.initialize();

// Create a note
const noteInfo = await api.createNote({
  type: 'general',
  title: 'meeting-notes',
  content: '# Team Meeting\n\n- Review progress\n- Plan next sprint'
});

console.log('Created note:', noteInfo.id);

// Read the note
const note = await api.getNote(noteInfo.id);
console.log('Note content:', note.content);
console.log('Note metadata:', note.metadata);

// Update the note
const updateResult = await api.updateNote({
  identifier: noteInfo.id,
  content: note.content + '\n\n## Action Items\n- Update documentation',
  contentHash: note.content_hash
});

console.log('Updated:', updateResult.updated);

// Example of batch updating multiple notes
const batchResult = await api.updateNotes({
  notes: [
    {
      identifier: noteInfo.id,
      content: note.content + '\n\n## Status\n- In Progress',
      contentHash: note.content_hash,
      metadata: { status: 'in-progress' }
    }
    // ... more notes can be added here
  ]
});

console.log(`Batch update: ${batchResult.successful}/${batchResult.total} notes updated`);

// List notes
const notes = await api.listNotes({ typeName: 'general', limit: 10 });
console.log(`Found ${notes.length} general notes`);
```

### Advanced Manager Access
```typescript
const api = new FlintNoteApi({ workspacePath: './notes' });
await api.initialize();

// Get direct manager access for advanced operations
const { noteManager, hybridSearchManager } = api.getManagers();

// Advanced search using manager directly
const searchResults = await noteManager.searchNotes({
  query: 'project update',
  typeFilter: 'meeting',
  limit: 20,
  useRegex: false
});

// Database stats
const stats = await hybridSearchManager.getStats();
console.log('Indexed notes:', stats.noteCount);
```

This API provides the most efficient way to integrate FlintNote into your applications with clean, type-safe interfaces and optimal performance.
