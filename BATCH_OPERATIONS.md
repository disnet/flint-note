# Batch Operations in Flint-Note

Flint-note supports efficient batch operations through a unified API that extends the standard `create_note` and `update_note` tools to handle both single and multiple notes in a single request.

## Overview

Rather than creating separate batch tools, flint-note uses a **unified API design** where the existing `create_note` and `update_note` tools accept either:
- **Single note objects** (for individual operations)
- **Arrays of note objects** (for batch operations)

This approach provides:
- ✅ **Cleaner API** - fewer tools to learn
- ✅ **Unified interface** - consistent parameter patterns
- ✅ **Backward compatibility** - existing single operations unchanged
- ✅ **Flexible usage** - mix single and batch as needed

## Quick Start

### Single Note Creation
```json
{
  "name": "create_note",
  "arguments": {
    "type": "general",
    "title": "My Note",
    "content": "Note content"
  }
}
```

### Batch Note Creation
```json
{
  "name": "create_note",
  "arguments": {
    "notes": [
      {
        "type": "general", 
        "title": "First Note",
        "content": "First note content"
      },
      {
        "type": "projects",
        "title": "Second Note", 
        "content": "Second note content"
      }
    ]
  }
}
```

### Single Note Update
```json
{
  "name": "update_note",
  "arguments": {
    "identifier": "general/my-note.md",
    "content": "Updated content"
  }
}
```

### Batch Note Update
```json
{
  "name": "update_note",
  "arguments": {
    "updates": [
      {
        "identifier": "general/first-note.md",
        "content": "Updated first note"
      },
      {
        "identifier": "projects/second-note.md",
        "metadata": {
          "status": "completed"
        }
      }
    ]
  }
}
```

## Batch Operation Features

### ✨ Core Capabilities
- **Independent Processing**: Each note operation is atomic
- **Partial Failure Handling**: Some notes can fail while others succeed
- **Detailed Results**: Success/failure status for each note with specific error messages
- **Metadata Support**: Full validation against note type schemas
- **Search Integration**: Automatic index updates for all modified notes

### 📊 Response Format for Batch Operations

Batch operations return detailed results:

```json
{
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "input": { /* original note input */ },
      "success": true,
      "result": {
        "id": "general/note-1.md",
        "type": "general",
        "title": "Note 1",
        "filename": "note-1.md",
        "path": "/vault/general/note-1.md",
        "created": "2024-01-15T10:30:00Z"
      }
    },
    {
      "input": { /* original note input */ },
      "success": false,
      "error": "Validation failed: Required field 'author' is missing"
    }
  ]
}
```

## Update Operation Types

The `update_note` tool supports three update patterns:

### Content Only
Updates note content, preserves existing metadata:
```json
{
  "identifier": "general/note.md",
  "content": "New content"
}
```

### Metadata Only  
Updates metadata, preserves existing content:
```json
{
  "identifier": "general/note.md", 
  "metadata": {
    "status": "completed",
    "priority": "high"
  }
}
```

### Combined Update
Updates both content and metadata:
```json
{
  "identifier": "general/note.md",
  "content": "New content",
  "metadata": {
    "status": "completed"
  }
}
```

## Error Handling

### Fail-Fast Per Item
- Each note/update operation is independent
- If one item fails, others continue processing
- Detailed error messages provided for failed items
- Successful operations complete even if others fail

### Common Error Scenarios
- ❌ Invalid note type names
- ❌ Missing required metadata fields  
- ❌ Note identifier not found (for updates)
- ❌ Filename conflicts (for creation)
- ❌ Metadata validation failures

### Example Error Response
```json
{
  "total": 2,
  "successful": 1, 
  "failed": 1,
  "results": [
    {
      "input": { "type": "general", "title": "Valid Note", "content": "..." },
      "success": true,
      "result": { /* note info */ }
    },
    {
      "input": { "type": "invalid/type", "title": "Bad Note", "content": "..." },
      "success": false,
      "error": "Failed to create note 'Bad Note': Invalid note type name: invalid/type"
    }
  ]
}
```

## Performance Guidelines

### Batch Size Recommendations
- **Small (1-10 notes)**: Interactive use, immediate feedback
- **Medium (10-50 notes)**: Bulk imports, data migration  
- **Large (50+ notes)**: Automated systems, consider chunking

### Performance Characteristics
- ⚡ More efficient than individual API calls
- 📈 Memory usage scales linearly with batch size
- 🔍 Search index updated efficiently for all notes
- 🚀 Processing time roughly proportional to batch size

## Use Cases

### Single Operations
- 📝 Interactive note taking during meetings
- ✏️ Quick edits and updates
- 🎯 Real-time note modification

### Batch Operations  
- 📦 Project migration from other systems
- 🔄 Bulk metadata updates across notes
- 📋 Template-based note generation
- 🔗 Status synchronization from external systems
- 🧹 Content standardization and cleanup

## Best Practices

### 1. Choose the Right Operation Type
- Use **single operations** for interactive, immediate tasks
- Use **batch operations** for bulk processing, automation, migrations

### 2. Error Handling Strategy
- Always check `successful` and `failed` counts in batch responses
- Review failed operations and fix issues before retrying
- Use detailed error messages to identify problems

### 3. Data Validation
- Validate metadata against note type schemas before operations
- Ensure all required fields are provided
- Use consistent naming conventions and formats

### 4. Performance Optimization
- Group related operations together in batches
- Consider processing time for very large batches
- Use appropriate batch sizes for your use case

## Implementation Details

### API Design
The unified API uses JSON Schema `oneOf` to accept either single objects or arrays:

```json
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "type": { "type": "string" },
        "title": { "type": "string" },
        "content": { "type": "string" }
      }
    },
    {
      "type": "object", 
      "properties": {
        "notes": {
          "type": "array",
          "items": { /* note object schema */ }
        }
      }
    }
  ]
}
```

### Core Functions
- `NoteManager.createNote()` - Single note creation
- `NoteManager.batchCreateNotes()` - Batch note creation  
- `NoteManager.updateNote()` - Single note update
- `NoteManager.batchUpdateNotes()` - Batch note update

### MCP Integration
The MCP server handlers detect the input format and route to appropriate methods:

```typescript
// Handler detects single vs batch format
if (args.notes) {
  return await this.noteManager.batchCreateNotes(args.notes);
} else {
  return await this.noteManager.createNote(args.type, args.title, args.content);
}
```

## Testing

Comprehensive test coverage includes:
- ✅ Single note operations (creation, updates)
- ✅ Batch operations (multiple notes, partial failures)
- ✅ Error handling and edge cases
- ✅ Metadata validation and schema compliance
- ✅ Performance testing with large batches
- ✅ End-to-end MCP server integration

Run tests:
```bash
npm run test:unit -- test/unit/batch-operations.test.ts
npm run test:integration -- test/integration/batch-operations.test.ts
```

## Examples

See `examples/batch-operations.md` for detailed examples including:
- Project migration workflows
- Book review imports
- Status update patterns
- Error handling scenarios
- Performance optimization techniques

---

**🎉 Ready to Use!** The batch operations feature is fully implemented and tested. Start using the unified `create_note` and `update_note` tools for both single and batch operations in your flint-note workflows.