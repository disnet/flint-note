# Hybrid Search Implementation

This document describes the new hybrid SQLite + file storage search system implemented in flint-note, which provides powerful querying capabilities while maintaining human-readable file storage.

## Overview

The hybrid search system combines the best of both worlds:
- **File Storage**: Notes remain as human-readable markdown files
- **SQLite Index**: Comprehensive database index for complex queries and metadata searches
- **Real-time Sync**: Automatic synchronization between files and database

## Architecture

### Components

1. **DatabaseManager** (`src/database/schema.ts`)
   - Manages SQLite database connections
   - Handles schema initialization and migrations
   - Provides type-safe database operations

2. **HybridSearchManager** (`src/database/search-manager.ts`)
   - Main search interface with multiple query types
   - Handles index synchronization with file system
   - Provides backward-compatible search methods

3. **Server Integration** (`src/server.ts`)
   - Exposes new search tools via MCP protocol
   - Maintains existing search functionality
   - Handles initialization and cleanup

### Database Schema

```sql
-- Core notes table
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    created DATETIME NOT NULL,
    updated DATETIME NOT NULL,
    size INTEGER,
    content_hash TEXT
);

-- Metadata stored as key-value pairs with type information
CREATE TABLE note_metadata (
    note_id TEXT,
    key TEXT,
    value TEXT,
    value_type TEXT CHECK (value_type IN ('string', 'number', 'date', 'boolean', 'array')),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Full-text search index using FTS5
CREATE VIRTUAL TABLE notes_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    type UNINDEXED,
    content=notes,
    content_rowid=rowid
);
```

## Search Tools

### 1. Simple Search (`search_notes`)

**Backward compatible** text search with FTS ranking.

```json
{
  "name": "search_notes",
  "arguments": {
    "query": "authentication",
    "type_filter": "todo",
    "limit": 10,
    "use_regex": false
  }
}
```

**Features:**
- Full-text search with ranking
- Optional type filtering
- Regex pattern matching
- Snippet generation with highlighting

### 2. Advanced Search (`search_notes_advanced`)

**Structured search** with metadata filters and sorting.

```json
{
  "name": "search_notes_advanced",
  "arguments": {
    "type": "todo",
    "metadata_filters": [
      {"key": "status", "value": "in_progress"},
      {"key": "priority", "operator": ">=", "value": "3"}
    ],
    "updated_within": "7d",
    "content_contains": "authentication",
    "sort": [{"field": "updated", "order": "desc"}],
    "limit": 50
  }
}
```

**Features:**
- Type filtering
- Complex metadata queries with operators (`=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`)
- Date-based filtering (`7d`, `1w`, `2m`, `1y`)
- Content search integration
- Multiple sort criteria
- Pagination support

### 3. SQL Search (`search_notes_sql`)

**Direct SQL queries** for maximum flexibility and complex analytics.

```json
{
  "name": "search_notes_sql",
  "arguments": {
    "query": "SELECT n.*, m.value as priority FROM notes n JOIN note_metadata m ON n.id = m.note_id WHERE n.type = 'todo' AND m.key = 'priority' AND CAST(m.value AS INTEGER) >= 4 ORDER BY CAST(m.value AS INTEGER) DESC",
    "limit": 100,
    "timeout": 30000
  }
}
```

**Features:**
- Full SQL SELECT capabilities
- JOIN operations across tables
- Aggregation and grouping
- Complex analytical queries
- Security restrictions (SELECT only)
- Query timeout protection

## Security Measures

The SQL search tool includes comprehensive security measures:

- **Query Validation**: Only SELECT statements allowed
- **Keyword Blocking**: Prevents dangerous operations (DROP, DELETE, INSERT, UPDATE, ALTER, CREATE)
- **Parameterized Queries**: Supports safe parameter binding
- **Query Timeout**: 30-second execution limit
- **Result Limits**: Maximum 1000 results per query
- **Complexity Analysis**: Rejects overly complex queries

## Common Query Patterns

### Find High-Priority Tasks
```sql
SELECT n.* FROM notes n 
JOIN note_metadata m1 ON n.id = m1.note_id AND m1.key = 'status' AND m1.value = 'in_progress'
JOIN note_metadata m2 ON n.id = m2.note_id AND m2.key = 'priority' AND CAST(m2.value AS INTEGER) >= 3
WHERE n.type = 'todo'
ORDER BY n.updated DESC
```

### Analyze Reading Progress
```sql
SELECT 
  AVG(CASE WHEN m.key = 'rating' THEN CAST(m.value AS REAL) END) as avg_rating,
  COUNT(CASE WHEN m2.key = 'status' AND m2.value = 'completed' THEN 1 END) as completed_count
FROM notes n 
LEFT JOIN note_metadata m ON n.id = m.note_id AND m.key = 'rating'
LEFT JOIN note_metadata m2 ON n.id = m2.note_id AND m2.key = 'status'
WHERE n.type = 'reading'
```

### Find Recent Team Activity
```sql
SELECT n.*, m.value as attendees
FROM notes n 
JOIN note_metadata m ON n.id = m.note_id AND m.key = 'attendees'
WHERE n.type = 'meeting' AND n.created >= datetime('now', '-30 days')
ORDER BY n.created DESC
```

## Synchronization

The hybrid system maintains real-time synchronization between file storage and the database:

### Automatic Updates
- **Note Creation**: Automatically indexed on file write
- **Note Updates**: Index updated when files change
- **Note Deletion**: Removed from index when files deleted
- **Metadata Changes**: Parsed and updated in real-time

### Index Rebuilding
- **Startup**: Full index rebuild on server initialization
- **Manual**: Available via `rebuildIndex()` method
- **Progressive**: Shows progress during rebuild
- **Error Recovery**: Handles corrupted indices gracefully

## Performance Characteristics

### Query Performance
- **Simple Searches**: Sub-millisecond for basic text queries
- **Advanced Searches**: Optimized with proper indexing
- **SQL Queries**: Efficient with join optimization
- **Full-text Search**: Leverages SQLite FTS5 engine

### Storage Efficiency
- **Index Size**: ~50-100KB for 1000 notes
- **Memory Usage**: Minimal footprint
- **Startup Time**: Fast initialization with incremental building

### Scalability
- **Note Volume**: Tested with thousands of notes
- **Metadata Complexity**: Handles rich metadata efficiently
- **Query Complexity**: Supports complex analytical queries

## Response Format

All search methods return consistent response format:

```json
{
  "results": [
    {
      "id": "todo/task-123.md",
      "title": "Complete authentication system",
      "type": "todo",
      "tags": ["backend", "security"],
      "score": 0.95,
      "snippet": "Implement JWT-based authentication with...",
      "lastUpdated": "2024-01-25T14:30:00Z",
      "filename": "task-123.md",
      "path": "/workspace/todo/task-123.md",
      "created": "2024-01-10T09:00:00Z",
      "modified": "2024-01-25T14:30:00Z",
      "size": 2048,
      "metadata": {
        "title": "Complete authentication system",
        "type": "todo",
        "status": "in_progress",
        "priority": 5,
        "assignee": "Alice",
        "tags": ["backend", "security"],
        "created": "2024-01-10T09:00:00Z",
        "updated": "2024-01-25T14:30:00Z"
      }
    }
  ],
  "total": 1,
  "has_more": false,
  "query_time_ms": 2
}
```

## Integration Guide

### Server Setup
The hybrid search manager is automatically initialized alongside the existing search manager:

```typescript
// In server initialization
this.#hybridSearchManager = new HybridSearchManager(this.#workspace.rootPath);
this.#noteManager = new NoteManager(this.#workspace, this.#hybridSearchManager);
```

### Note Operations
All note CRUD operations automatically update both file storage and the search index:

```typescript
// Note creation automatically indexes
await noteManager.createNote(type, title, content, metadata);

// Note updates sync to database
await noteManager.updateNote(identifier, newContent, contentHash);

// Note deletion removes from index
await noteManager.deleteNote(identifier);
```

### Manual Index Management
For administrative tasks:

```typescript
// Get database statistics
const stats = await hybridSearchManager.getStats();

// Rebuild entire index
await hybridSearchManager.rebuildIndex((processed, total) => {
  console.log(`Progress: ${processed}/${total}`);
});

// Close connections
await hybridSearchManager.close();
```

## Migration from Legacy Search

The hybrid system is fully backward compatible:

1. **Existing API**: All existing `search_notes` calls work unchanged
2. **Gradual Adoption**: New tools can be adopted incrementally
3. **Fallback**: Legacy search remains available as backup
4. **Data Integrity**: No data loss during migration

## Troubleshooting

### Common Issues

**Database Lock Errors**
- Ensure proper connection cleanup
- Check for concurrent access patterns
- Verify file permissions on database

**Index Synchronization**
- Monitor file system events
- Check for proper error handling
- Verify workspace configuration

**Performance Issues**
- Analyze query complexity
- Check database size and indexes
- Monitor memory usage patterns

### Debug Information

Enable debug logging for troubleshooting:

```typescript
// Add debug logging in search operations
console.log('DEBUG SQL:', query);
console.log('DEBUG PARAMS:', params);
```

## Future Enhancements

### Planned Features
- **Vector Search**: Semantic similarity using embeddings
- **Query Caching**: Cache frequent query results
- **Index Partitioning**: Optimize for very large datasets
- **Real-time Search**: Live search with streaming results
- **Search Analytics**: Query performance monitoring

### Extensibility
- **Custom Operators**: Add domain-specific search operators
- **Plugin System**: Allow custom search extensions
- **External Integrations**: Connect to external search services
- **Advanced FTS**: Custom tokenizers and ranking functions

## Contributing

When contributing to the hybrid search system:

1. **Testing**: Add comprehensive tests for new features
2. **Documentation**: Update this guide with new capabilities
3. **Performance**: Benchmark query performance
4. **Security**: Ensure SQL injection protection
5. **Backward Compatibility**: Maintain existing API contracts

## References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [flint-note Design Document](./design.md)
- [Database Schema Reference](./src/database/schema.ts)