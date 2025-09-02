# Core API Primitives Proposal

## Overview

This document proposes simplifying the current FlintNote server API down to a set of core primitives that provide the foundational building blocks for note management. The existing API has grown to include many high-level convenience methods and complex features. This proposal aims to create a cleaner, more composable foundation.

## Current State Analysis

The existing API (`FlintNoteApi` + MCP handlers) currently offers:
- 40+ methods across vault, note, note-type, link, and search operations
- Complex batch operations and convenience methods
- MCP protocol formatting and validation layers
- Advanced features like SQL search, link migration, bulk operations
- Context resolution and vault switching logic

While comprehensive, this creates a large API surface that can be difficult to maintain and test.

## Proposed Core Primitives

### 1. Vault Primitives

Vaults are named collections of note types that have a directory they live in.

```typescript
interface VaultPrimitives {
  createVault(id: string, name: string, path: string, description?: string): VaultInfo
  getVault(id: string): VaultInfo | null
  updateVault(id: string, updates: Partial<Pick<VaultInfo, 'name' | 'description'>>): void
  deleteVault(id: string): void
  listVaults(): VaultInfo[]
  setActiveVault(id: string): void
  getActiveVault(): VaultInfo | null
}
```

**Key Changes:**
- Explicit vault ID parameter eliminates context resolution complexity
- Simple CRUD operations only
- No automatic initialization or switching logic

### 2. Note Type Primitives

Note types group notes and have a description, agent instructions, and metadata schema.

```typescript
interface NoteTypePrimitives {
  createNoteType(vaultId: string, name: string, description: string, 
                 instructions?: string[], schema?: MetadataSchema): NoteTypeInfo
  getNoteType(vaultId: string, name: string): NoteTypeInfo | null
  updateNoteType(vaultId: string, name: string, updates: {
    description?: string
    instructions?: string[]
    schema?: MetadataSchema
  }): void
  deleteNoteType(vaultId: string, name: string): void
  listNoteTypes(vaultId: string): NoteTypeInfo[]
}
```

**Key Changes:**
- No complex deletion strategies (migrate/delete) - just delete
- No content hash validation at primitive level
- Schema updates are atomic replacements

### 3. Note Primitives

Notes have a name, type, content, and metadata.

```typescript
interface NotePrimitives {
  createNote(vaultId: string, type: string, title: string, content: string, 
             metadata?: NoteMetadata): NoteInfo
  getNote(vaultId: string, identifier: string): Note | null
  updateNote(vaultId: string, identifier: string, updates: {
    content?: string
    metadata?: NoteMetadata
  }): void  // Throws if attempting to change note identity (title/type)
  deleteNote(vaultId: string, identifier: string): void
  
  // Identity-changing operations that maintain link consistency
  renameNote(vaultId: string, identifier: string, newTitle: string): {
    newIdentifier: string
    linksUpdated: number
    affectedNotes: string[]
  }
  
  moveNote(vaultId: string, identifier: string, newType: string): {
    newIdentifier: string
    linksUpdated: number
    affectedNotes: string[]
  }
}
```

**Key Changes:**
- No batch operations - clients loop if needed
- No content hash validation - clients handle optimistic locking
- **Atomic rename/move operations** that automatically update all links
- Simple identifier-based access

### 4. Note Query Primitives

Access to individual notes and all notes with filtering.

```typescript
interface NoteQueryPrimitives {
  listNotes(vaultId: string, options?: {
    typeFilter?: string
    limit?: number
  }): AsyncIterable<NoteListItem>
  
  findNotesByMetadata(vaultId: string, criteria: {
    [key: string]: string | string[] | number | boolean
  }): AsyncIterable<NoteListItem>
  
  searchNotesByText(vaultId: string, query: string, options?: {
    typeFilter?: string
    limit?: number
  }): AsyncIterable<SearchResult>
}
```

**Key Changes:**
- **Async iterables** for memory-efficient streaming of large result sets
- **No offset parameter** - iteration handles position automatically
- Basic metadata filtering by exact match
- Single text search method instead of advanced/SQL variants
- No hybrid search complexity exposed

### 5. Link Primitives (Optional)

Basic link access if needed for higher-level features.

```typescript
interface LinkPrimitives {
  getOutboundLinks(vaultId: string, noteId: string): AsyncIterable<NoteLink>
  getInboundLinks(vaultId: string, noteId: string): AsyncIterable<NoteLink>
  findBrokenLinks(vaultId: string): AsyncIterable<NoteLink>
}
```

**Key Changes:**
- Read-only link access via **async iterables**
- No link creation/deletion (handled automatically by note content)  
- No complex link migration tools

## Key Simplifications

### Removed Features
1. **Batch Operations**: No `batchCreateNotes`, `batchUpdateNotes` - clients loop
2. **High-Level Convenience**: No `bulkDeleteNotes`, complex search operations
3. **Advanced Search**: No SQL queries, advanced filtering, or hybrid search exposure
4. **MCP Protocol**: Core API returns pure data objects
5. **Context Resolution**: Explicit `vaultId` parameter for all operations
6. **Content Hash Validation**: Moved to higher-level layer
7. **Complex Deletion**: No migration strategies for note types
8. **Manual Link Management**: No manual link creation/editing (handled automatically)

### Simplified Data Flow
```
Client Request → Core Primitives → Direct Manager Calls → Database
```

Instead of:
```
Client Request → MCP Handlers → Validation → Context Resolution → 
Batch Processing → Manager Calls → Database
```

## Benefits

### 1. Composability
Complex operations become combinations of primitives:
```typescript
// Complex workflow combining multiple primitives
async function duplicateAndModifyNote(vaultId: string, sourceId: string, newTitle: string, modifications: string) {
  const sourceNote = await api.getNote(vaultId, sourceId)
  if (!sourceNote) throw new Error('Source note not found')
  
  // Create duplicate with modifications
  const duplicateNote = await api.createNote(
    vaultId, 
    sourceNote.type, 
    newTitle, 
    sourceNote.content + '\n\n' + modifications, 
    { ...sourceNote.metadata, duplicatedFrom: sourceId }
  )
  
  return duplicateNote
}
```

**Note**: Rename and move operations are **not** composed from delete+create because they need to maintain link consistency atomically.

## Link Consistency Requirements

The system supports wikilinks in the format `[[type/name|display name]]` where:
- `type/name` maps directly to the filesystem path
- This allows external applications (Obsidian, iA Writer) to understand the links
- When notes are renamed or moved, all links must be updated consistently

### Why Rename/Move are Primitives

```typescript
// ❌ BAD: Composing rename from delete+create breaks links
async function badRename(vaultId: string, oldId: string, newTitle: string) {
  const note = await api.getNote(vaultId, oldId)
  const newNote = await api.createNote(vaultId, note.type, newTitle, note.content, note.metadata)
  await api.deleteNote(vaultId, oldId)
  // 💥 All links to the old note are now broken!
  return newNote
}

// ✅ GOOD: Atomic rename maintains link consistency
async function goodRename(vaultId: string, oldId: string, newTitle: string) {
  return await api.renameNote(vaultId, oldId, newTitle)
  // ✨ All links automatically updated from [[type/oldname]] to [[type/newname]]
}
```

### Link Update Examples

When `daily/2024-01-15` is renamed to `daily/weekly-review`:
- `[[daily/2024-01-15]]` → `[[daily/weekly-review]]`
- `[[daily/2024-01-15|My Daily Note]]` → `[[daily/weekly-review|My Daily Note]]`

When `todos/shopping` is moved to `projects/shopping`:
- `[[todos/shopping]]` → `[[projects/shopping]]`
- `[[todos/shopping|Shopping List]]` → `[[projects/shopping|Shopping List]]`

## Benefits

### 1. Testability
Each primitive has a single responsibility and clear inputs/outputs.

### 2. Memory Efficiency
Async iterables prevent loading large datasets into memory:
```typescript
// Stream through all notes without loading them all at once
for await (const note of api.listNotes(vaultId)) {
  if (note.title.includes('urgent')) {
    console.log(note)
    break // Can stop early without processing remaining notes
  }
}

// Collect only what you need
const recentNotes = []
for await (const note of api.listNotes(vaultId)) {
  if (new Date(note.created) > cutoffDate) {
    recentNotes.push(note)
  }
  if (recentNotes.length >= 10) break
}
```

### 3. Flexibility
Clients can implement their own:
- Batch processing strategies
- Caching layers  
- Validation logic
- Error handling

### 4. Maintainability
- Smaller API surface area
- No complex interdependencies
- Clear separation of concerns

### 5. Performance
- No overhead from unused convenience methods
- Direct manager access
- Optional features only loaded when needed
- **Memory-efficient streaming** via async iterables for large datasets

## Implementation Strategy

### Phase 1: Extract Primitives
1. Create `src/server/api/primitives/` directory
2. Implement primitive classes using existing manager methods
3. Add comprehensive tests for each primitive

### Phase 2: Compatibility Layer
1. Keep existing `FlintNoteApi` as wrapper around primitives
2. Maintain MCP handlers using primitives internally
3. Ensure no breaking changes to current consumers

### Phase 3: Migration
1. Update UI components to use primitives directly
2. Implement higher-level operations as needed
3. Eventually deprecate high-level convenience methods

### Phase 4: Cleanup
1. Remove unused convenience methods
2. Simplify manager interfaces
3. Remove complex validation from core layer

## File Structure

```
src/server/api/
├── primitives/
│   ├── vault-primitives.ts
│   ├── note-type-primitives.ts  
│   ├── note-primitives.ts
│   ├── note-query-primitives.ts
│   └── link-primitives.ts
├── convenience/
│   ├── batch-operations.ts
│   ├── high-level-operations.ts
│   └── validation-helpers.ts
├── flint-note-api.ts          # Compatibility layer
└── index.ts                    # Public exports
```

## Conclusion

This primitive-based approach provides a solid foundation that can be extended as needed while keeping the core simple and maintainable. Complex operations become explicit combinations of simple operations, making the system more transparent and flexible.