# Tool Data Limits and Pagination

## Problem Statement

Several agent tools can return unbounded amounts of data, potentially overwhelming the agent's context window. This document outlines the issues and proposed solutions for implementing strict data limits and pagination across all tools.

## Current Issues

### 1. Note Content Tools (No Limits)

**Tools Affected:**

- `get_note` - Returns full note content regardless of size
- `getNotes` - Returns multiple full notes
- Search results that include full note content

**Risk:** A single large note (e.g., 10,000+ lines) can consume most of the context window.

**Current Behavior:**

```typescript
// flint-note-api.ts:336-340
async getNote(vaultId: string, identifier: string): Promise<Note> {
  const { noteManager } = await this.getVaultContext(vaultId);
  return await noteManager.getNote(identifier);  // Returns entire note
}
```

### 2. Link Search Tools (No Limits)

**`search_by_links`** (flint-note-api.ts:910-967)

- Returns ALL notes matching link criteria via unbounded SQL queries
- No pagination support
- Searches: `has_links_to`, `linked_from`, `external_domains`, `broken_links`

Example problematic query:

```sql
SELECT DISTINCT n.* FROM notes n
INNER JOIN note_links nl ON n.id = nl.source_note_id
WHERE nl.target_note_id IN (...)
-- No LIMIT clause!
```

**`find_broken_links`** (flint-note-api.ts:898-905)

- Returns ALL broken links across entire vault
- Could be hundreds or thousands of results

**`get_note_links` / `get_backlinks`** (flint-note-api.ts:500-538)

- Returns all links/backlinks for a note
- Popular notes could have hundreds of backlinks

### 3. Hierarchy Tools (Partial Limits)

**`getDescendants`** (flint-note-api.ts:910-919)

- Has `max_depth` parameter but no result count limit
- A shallow hierarchy with many children per level could return thousands of nodes

**`getChildren` / `getParents`** (flint-note-api.ts:924-947)

- No limits at all
- A note could have hundreds of children or parents

### 4. Relationship Tools (Partial Limits)

**`getRelatedNotes`** (flint-note-api.ts:971-984)

- Has optional `max_results` parameter but no default
- Without explicit limit, could return many results

**`getNoteRelationships`** (flint-note-api.ts:954-966)

- Returns comprehensive relationship data
- No limits on related notes returned

### 5. List/Search Tools (Already Limited)

✅ **These tools already have proper limits:**

- `search_notes` - Default: 20, Max: 100
- `listNotes` - Optional limit parameter
- `list_custom_functions` - Optional limit parameter

## Proposed Solutions

### Strategy 1: Note Content Limiting

**For `get_note` and `getNotes`:**

Add optional parameters for content truncation:

```typescript
interface GetNoteOptions {
  identifier: string;
  vaultId: string;
  // New parameters:
  contentLimit?: {
    maxLines?: number; // Default: 500, Max: 2000
    offset?: number; // Line offset for pagination
    includeTruncated?: boolean; // Return truncation info
  };
}
```

**Return format for truncated notes:**

```typescript
interface NoteWithTruncation extends Note {
  content: string; // Truncated content
  contentMetadata?: {
    totalLines: number;
    returnedLines: number;
    offset: number;
    isTruncated: boolean;
  };
}
```

**Default behavior:**

- If no `contentLimit` specified: Return first 500 lines
- Add flag in response indicating truncation
- Provide total line count so agent can request more if needed

### Strategy 2: List/Search Result Limiting

**For all list/search operations, implement consistent pagination:**

```typescript
interface PaginationParams {
  limit?: number; // Max results per request
  offset?: number; // Skip N results
}

interface PaginatedResponse<T> {
  results: T[];
  pagination: {
    total: number; // Total matching results
    limit: number; // Applied limit
    offset: number; // Applied offset
    hasMore: boolean; // More results available
  };
}
```

**Specific limits per tool:**

| Tool                | Default Limit | Max Limit    | Reasoning                             |
| ------------------- | ------------- | ------------ | ------------------------------------- |
| `search_by_links`   | 50            | 200          | Link searches can be broad            |
| `find_broken_links` | 100           | 500          | Broken links are actionable items     |
| `get_backlinks`     | 100           | 500          | Popular notes may have many backlinks |
| `get_note_links`    | 100/category  | 500/category | Split by internal/external/incoming   |
| `getDescendants`    | 100           | 500          | Hierarchy traversal                   |
| `getChildren`       | 100           | 200          | Direct children only                  |
| `getParents`        | 100           | 200          | Direct parents only                   |
| `getRelatedNotes`   | 50            | 200          | Relationship analysis                 |

### Strategy 3: Progressive Loading Pattern

**Recommended agent workflow:**

1. **Initial Query** - Use default limits

   ```typescript
   // Returns first 50 results + pagination info
   const results = await searchByLinks({
     hasLinksTo: ['note-id'],
     limit: 50 // default
   });
   ```

2. **Check if More Data Needed**

   ```typescript
   if (results.pagination.hasMore && results.pagination.total < 200) {
     // Fetch remaining results
     const moreResults = await searchByLinks({
       hasLinksTo: ['note-id'],
       limit: 150,
       offset: 50
     });
   }
   ```

3. **Large Result Sets** - Inform user instead of loading all
   ```typescript
   if (results.pagination.total > 200) {
     // Don't fetch all - inform user
     console.log(`Found ${results.pagination.total} results. Showing first 50.`);
   }
   ```

## Implementation Plan

### Phase 1: Critical Fixes (Unbounded Queries)

1. **`search_by_links`** - Add limit/offset to SQL queries
2. **`find_broken_links`** - Add limit/offset
3. **`get_note`** - Add content line limiting
4. **`getNotes`** - Add content line limiting

### Phase 2: Hierarchy & Relationships

5. **`getDescendants`** - Add max_results parameter
6. **`getChildren` / `getParents`** - Add limit parameter
7. **`getRelatedNotes`** - Add default max_results (50)
8. **Link tools** - Add limits to getNoteLinks, getBacklinks

### Phase 3: Tool Schema Updates

9. Update tool definitions in `tool-service.ts`
10. Add pagination parameter descriptions
11. Update tool documentation with pagination examples

### Phase 4: Type Definitions

12. Add pagination types to `src/server/api/types.ts`
13. Update API interfaces for new parameters
14. Ensure backwards compatibility

## Implementation Details

### Database Query Pattern

**Before:**

```typescript
const notes = await db.all(
  `SELECT DISTINCT n.* FROM notes n
   INNER JOIN note_links nl ON n.id = nl.source_note_id
   WHERE nl.target_note_id IN (${placeholders})`,
  targetIds
);
```

**After:**

```typescript
const limit = args.limit ?? 50;
const offset = args.offset ?? 0;
const maxLimit = Math.min(limit, 200);

const notes = await db.all(
  `SELECT DISTINCT n.* FROM notes n
   INNER JOIN note_links nl ON n.id = nl.source_note_id
   WHERE nl.target_note_id IN (${placeholders})
   ORDER BY n.updated DESC
   LIMIT ? OFFSET ?`,
  [...targetIds, maxLimit, offset]
);

// Get total count for pagination info
const [{ total }] = await db.get(
  `SELECT COUNT(DISTINCT n.id) as total FROM notes n
   INNER JOIN note_links nl ON n.id = nl.source_note_id
   WHERE nl.target_note_id IN (${placeholders})`,
  targetIds
);

return {
  results: notes,
  pagination: {
    total,
    limit: maxLimit,
    offset,
    hasMore: offset + maxLimit < total
  }
};
```

### Content Limiting Pattern

**Before:**

```typescript
async getNote(vaultId: string, identifier: string): Promise<Note> {
  const { noteManager } = await this.getVaultContext(vaultId);
  return await noteManager.getNote(identifier);
}
```

**After:**

```typescript
async getNote(
  vaultId: string,
  identifier: string,
  options?: { maxLines?: number; offset?: number }
): Promise<Note & { contentMetadata?: ContentMetadata }> {
  const { noteManager } = await this.getVaultContext(vaultId);
  const note = await noteManager.getNote(identifier);

  const maxLines = Math.min(options?.maxLines ?? 500, 2000);
  const offset = options?.offset ?? 0;

  const lines = note.content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && offset === 0) {
    // No truncation needed
    return note;
  }

  const truncatedLines = lines.slice(offset, offset + maxLines);
  const isTruncated = offset + maxLines < totalLines;

  return {
    ...note,
    content: truncatedLines.join('\n'),
    contentMetadata: {
      totalLines,
      returnedLines: truncatedLines.length,
      offset,
      isTruncated
    }
  };
}
```

## Migration Strategy

### Backwards Compatibility

All new parameters are optional with sensible defaults:

- Existing tool calls continue to work
- Default limits are applied automatically
- Agents get pagination info to request more if needed

### Tool Description Updates

Update tool descriptions to guide agents:

```typescript
description: 'Search for notes based on their link relationships. ' +
  'Returns up to 50 results by default (max 200). ' +
  'Use limit and offset for pagination when needed. ' +
  'Check pagination.hasMore to see if more results are available.';
```

### Rollout

1. Implement changes in API layer
2. Update tool schemas with new parameters
3. Test with large vaults
4. Document pagination patterns
5. Monitor agent context usage

## Files to Modify

1. **src/server/api/flint-note-api.ts**
   - Add pagination to all list/search methods
   - Add content limiting to getNote/getNotes

2. **src/main/tool-service.ts**
   - Update tool schemas with pagination parameters
   - Update descriptions with limit information

3. **src/server/api/types.ts**
   - Add PaginationParams interface
   - Add PaginatedResponse interface
   - Add ContentLimitOptions interface

4. **src/core/notes.ts** (if needed)
   - May need to update NoteManager for content limiting

## Testing Requirements

1. **Large note handling**
   - Test with notes >1000 lines
   - Verify truncation works correctly
   - Test offset-based pagination for content

2. **Large result sets**
   - Test with >500 matching notes
   - Verify limit/offset pagination
   - Check total count accuracy

3. **Backwards compatibility**
   - Existing tool calls work without parameters
   - Default limits are applied
   - No breaking changes to tool responses

4. **Edge cases**
   - Empty result sets
   - Single result
   - Exact limit match
   - Offset beyond total

## Future Enhancements

1. **Streaming for large notes** - Stream note content in chunks
2. **Smart truncation** - Preserve frontmatter + beginning/end
3. **Content summaries** - Provide summary for truncated notes
4. **Adaptive limits** - Adjust based on available context
5. **Caching** - Cache pagination metadata for repeated queries
