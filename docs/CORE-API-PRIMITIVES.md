# Core API Primitives Implementation Plan

## Overview

This document outlines the plan to simplify the existing `FlintNoteApi` down to a set of core primitives that provide foundational building blocks for note management. Rather than creating a separate API, we will refactor the current implementation to align with these simplification goals.

## Current State Analysis

The existing `FlintNoteApi` currently offers:

- 40+ methods across vault, note, note-type, link, and search operations
- Complex batch operations and convenience methods
- Context resolution and vault switching logic
- Advanced features like SQL search, link migration, bulk operations
- MCP protocol formatting considerations
- Agent-specific method variants

This creates a large API surface that can be difficult to maintain and test, with complex interdependencies and data flows.

## Proposed Core Primitives

### 1. Vault Primitives

Vaults are named collections of note types that have a directory they live in.

```typescript
interface VaultPrimitives {
  createVault(id: string, name: string, path: string, description?: string): VaultInfo;
  getVault(id: string): VaultInfo | null;
  updateVault(
    id: string,
    updates: Partial<Pick<VaultInfo, 'name' | 'description'>>
  ): void;
  deleteVault(id: string): void;
  listVaults(): VaultInfo[];
  setActiveVault(id: string): void;
  getActiveVault(): VaultInfo | null;
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
  createNoteType(
    vaultId: string,
    name: string,
    description: string,
    instructions?: string[],
    schema?: MetadataSchema
  ): NoteTypeInfo;
  getNoteType(vaultId: string, name: string): NoteTypeInfo | null;
  updateNoteType(
    vaultId: string,
    name: string,
    updates: {
      description?: string;
      instructions?: string[];
      schema?: MetadataSchema;
    }
  ): void;
  deleteNoteType(vaultId: string, name: string): void;
  listNoteTypes(vaultId: string): NoteTypeInfo[];
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
  createNote(
    vaultId: string,
    type: string,
    title: string,
    content: string,
    metadata?: NoteMetadata
  ): NoteInfo;
  getNote(vaultId: string, identifier: string): Note | null;
  updateNote(
    vaultId: string,
    identifier: string,
    updates: {
      content?: string;
      metadata?: NoteMetadata;
    }
  ): void; // Throws if attempting to change note identity (title/type)
  deleteNote(vaultId: string, identifier: string): void;

  // Identity-changing operations that maintain link consistency
  renameNote(
    vaultId: string,
    identifier: string,
    newTitle: string
  ): {
    newIdentifier: string;
    linksUpdated: number;
    affectedNotes: string[];
  };

  moveNote(
    vaultId: string,
    identifier: string,
    newType: string
  ): {
    newIdentifier: string;
    linksUpdated: number;
    affectedNotes: string[];
  };
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
  listNotes(
    vaultId: string,
    options?: {
      typeFilter?: string;
      limit?: number;
    }
  ): AsyncIterable<NoteListItem>;

  findNotesByMetadata(
    vaultId: string,
    criteria: {
      [key: string]: string | string[] | number | boolean;
    }
  ): AsyncIterable<NoteListItem>;

  searchNotesByText(
    vaultId: string,
    query: string,
    options?: {
      typeFilter?: string;
      limit?: number;
    }
  ): AsyncIterable<SearchResult>;
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
  getOutboundLinks(vaultId: string, noteId: string): AsyncIterable<NoteLink>;
  getInboundLinks(vaultId: string, noteId: string): AsyncIterable<NoteLink>;
  findBrokenLinks(vaultId: string): AsyncIterable<NoteLink>;
}
```

**Key Changes:**

- Read-only link access via **async iterables**
- No link creation/deletion (handled automatically by note content)
- No complex link migration tools

## Key Simplifications Required

### Features to Remove from Current API

1. **Batch Operations**:
   - Remove `createNotes()`, `createNotesForAgent()`, `updateNotes()`, `getNotes()`, `bulkDeleteNotes()`
   - Clients loop with single operations instead

2. **Complex Search Operations**:
   - Remove `searchNotes()`, `searchNotesAdvanced()`, `searchNotesSQL()`
   - Keep only `searchNotesByText()` as single text search method

3. **Context Resolution Complexity**:
   - Remove `resolveVaultContext()` method entirely
   - Add explicit `vaultId` parameter to ALL operations
   - Eliminate fallback to "current active vault" behavior

4. **High-Level Link Management**:
   - Remove `getNoteLinks()`, `getBacklinks()`, `searchByLinks()`, `migrateLinks()`
   - Replace with simple read-only link primitives

5. **Agent-Specific Methods**:
   - Remove `createNoteForAgent()`, `createNotesForAgent()`
   - Single create method handles all cases

6. **Convenience Methods**:
   - Remove `getNoteInfo()` convenience wrapper
   - Remove complex deletion strategies from note types

7. **MCP Protocol Considerations**:
   - Return pure data objects instead of MCP-formatted responses

### Current vs Simplified Data Flow

**Current Complex Flow:**

```
Client Request → Context Resolution → MCP Handlers → Validation →
Batch Processing → Manager Calls → Database
```

**Simplified Flow:**

```
Client Request → Primitive Method → Direct Manager Call → Database
```

## Benefits

### 1. Composability

Complex operations become combinations of primitives:

```typescript
// Complex workflow combining multiple primitives
async function duplicateAndModifyNote(
  vaultId: string,
  sourceId: string,
  newTitle: string,
  modifications: string
) {
  const sourceNote = await api.getNote(vaultId, sourceId);
  if (!sourceNote) throw new Error('Source note not found');

  // Create duplicate with modifications
  const duplicateNote = await api.createNote(
    vaultId,
    sourceNote.type,
    newTitle,
    sourceNote.content + '\n\n' + modifications,
    { ...sourceNote.metadata, duplicatedFrom: sourceId }
  );

  return duplicateNote;
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
  const note = await api.getNote(vaultId, oldId);
  const newNote = await api.createNote(
    vaultId,
    note.type,
    newTitle,
    note.content,
    note.metadata
  );
  await api.deleteNote(vaultId, oldId);
  // 💥 All links to the old note are now broken!
  return newNote;
}

// ✅ GOOD: Atomic rename maintains link consistency
async function goodRename(vaultId: string, oldId: string, newTitle: string) {
  return await api.renameNote(vaultId, oldId, newTitle);
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
    console.log(note);
    break; // Can stop early without processing remaining notes
  }
}

// Collect only what you need
const recentNotes = [];
for await (const note of api.listNotes(vaultId)) {
  if (new Date(note.created) > cutoffDate) {
    recentNotes.push(note);
  }
  if (recentNotes.length >= 10) break;
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

### Phase 1: Simplify Existing API

1. **Remove Batch Operations**
   - Delete `createNotes()`, `createNotesForAgent()`, `updateNotes()`, `getNotes()`, `bulkDeleteNotes()`
   - Update existing `createNote()` to handle all creation cases

2. **Eliminate Context Resolution**
   - Remove `resolveVaultContext()` method
   - Add explicit `vaultId: string` parameter to all remaining methods
   - Remove current vault fallback logic

3. **Streamline Search Operations**
   - Remove `searchNotes()`, `searchNotesAdvanced()`, `searchNotesSQL()`
   - Keep only `searchNotesByText()` as the single search method

### Phase 2: Convert to Async Iterables

1. **Update Query Methods**
   - Convert `listNotes()` → `AsyncIterable<NoteListItem>`
   - Convert `searchNotesByText()` → `AsyncIterable<SearchResult>`
   - Add `findNotesByMetadata()` → `AsyncIterable<NoteListItem>`

2. **Simplify Link Operations**
   - Replace complex link methods with simple read-only primitives
   - Return async iterables for memory efficiency

### Phase 3: Final Cleanup

1. **Remove High-Level Features**
   - Delete complex link management methods
   - Remove convenience wrappers like `getNoteInfo()`
   - Simplify note type deletion (remove migration strategies)

2. **Maintain Critical Primitives**
   - Keep atomic `renameNote()` and `moveNote()` for link consistency
   - Preserve vault management operations
   - Ensure all primitives have explicit vault parameters

## Resulting API Surface

**Before:** ~40+ methods with complex interdependencies

**After:** ~23 focused primitives organized as:

- **Vault Primitives (6):** `createVault`, `getVault`, `updateVault`, `deleteVault`, `listVaults`, `setActiveVault`
- **Note Type Primitives (5):** `createNoteType`, `getNoteType`, `updateNoteType`, `deleteNoteType`, `listNoteTypes`
- **Note Primitives (6):** `createNote`, `getNote`, `updateNote`, `deleteNote`, `renameNote`, `moveNote`
- **Query Primitives (3):** `listNotes`, `findNotesByMetadata`, `searchNotesByText`
- **Link Primitives (3):** `getOutboundLinks`, `getInboundLinks`, `findBrokenLinks`

## Conclusion

This primitive-based approach provides a solid foundation that can be extended as needed while keeping the core simple and maintainable. Complex operations become explicit combinations of simple operations, making the system more transparent and flexible.
