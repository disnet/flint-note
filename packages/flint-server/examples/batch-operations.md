# Note Operations Examples

This document provides practical examples of using flint-note's unified note operations API for both single and batch note creation and updates.

## Single Note Creation

### Example 1: Creating a Single Note

```json
{
  "name": "create_note",
  "arguments": {
    "type": "general",
    "title": "My Daily Journal",
    "content": "# Daily Journal Entry\n\nToday was a productive day...",
    "metadata": {
      "tags": ["personal", "journal"],
      "mood": "positive"
    }
  }
}
```

## Batch Note Creation

### Example 2: Creating Multiple Project Notes

```json
{
  "name": "create_note",
  "arguments": {
    "notes": [
      {
        "type": "projects",
        "title": "Website Redesign",
        "content": "# Website Redesign Project\n\n## Objectives\n- Improve user experience\n- Modernize design\n- Optimize performance\n\n## Timeline\nQ1 2024",
        "metadata": {
          "status": "planning",
          "priority": "high",
          "tags": ["web", "design", "ux"]
        }
      },
      {
        "type": "projects", 
        "title": "API Documentation",
        "content": "# API Documentation Project\n\n## Goals\n- Create comprehensive API docs\n- Add interactive examples\n- Improve developer onboarding\n\n## Deliverables\n- OpenAPI spec\n- Developer portal\n- Code samples",
        "metadata": {
          "status": "in-progress",
          "priority": "medium",
          "tags": ["api", "documentation", "developer-experience"]
        }
      },
      {
        "type": "projects",
        "title": "Security Audit",
        "content": "# Security Audit Project\n\n## Scope\n- Penetration testing\n- Code review\n- Infrastructure assessment\n\n## Timeline\n- Start: March 1\n- Complete: March 31",
        "metadata": {
          "status": "not-started",
          "priority": "high",
          "tags": ["security", "audit", "compliance"]
        }
      }
    ]
  }
}
```

### Example 3: Importing Book Reviews

```json
{
  "name": "create_note",
  "arguments": {
    "notes": [
      {
        "type": "book-reviews",
        "title": "The Pragmatic Programmer",
        "content": "# The Pragmatic Programmer\n\n## Summary\nExcellent guide for software developers covering best practices, debugging techniques, and professional development.\n\n## Key Takeaways\n- DRY principle (Don't Repeat Yourself)\n- Importance of version control\n- Testing strategies\n- Communication skills for developers\n\n## Favorite Quote\n\"Your knowledge portfolio is your most important professional asset.\"",
        "metadata": {
          "author": "Andy Hunt, Dave Thomas",
          "rating": 5,
          "status": "completed",
          "genre": "programming",
          "isbn": "978-0201616224",
          "tags": ["programming", "best-practices", "career"]
        }
      },
      {
        "type": "book-reviews",
        "title": "Clean Code",
        "content": "# Clean Code\n\n## Summary\nComprehensive guide to writing maintainable, readable code with practical examples and refactoring techniques.\n\n## Key Principles\n- Meaningful names\n- Small functions\n- Clear comments\n- Proper error handling\n\n## Impact\nChanged how I approach code organization and naming conventions.",
        "metadata": {
          "author": "Robert C. Martin",
          "rating": 4,
          "status": "completed",
          "genre": "programming",
          "isbn": "978-0132350884",
          "tags": ["programming", "code-quality", "refactoring"]
        }
      }
    ]
  }
}
```

### Response Format

Successful batch creation returns:

```json
{
  "total": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {
      "input": {
        "type": "projects",
        "title": "Website Redesign",
        "content": "# Website Redesign Project...",
        "metadata": { "status": "planning", "priority": "high" }
      },
      "success": true,
      "result": {
        "id": "projects/website-redesign.md",
        "type": "projects",
        "title": "Website Redesign",
        "filename": "website-redesign.md",
        "path": "/vault/projects/website-redesign.md",
        "created": "2024-01-15T10:30:00Z"
      }
    }
    // ... additional results
  ]
}
```

## Single Note Updates

### Example 4: Updating a Single Note

```json
{
  "name": "update_note",
  "arguments": {
    "identifier": "general/my-daily-journal.md",
    "content": "# Daily Journal Entry\n\nToday was an amazing day! I completed the batch operations feature..."
  }
}
```

### Example 5: Updating Note with Metadata

```json
{
  "name": "update_note",
  "arguments": {
    "identifier": "projects/website-redesign.md",
    "metadata": {
      "status": "in-progress",
      "completion_percentage": 75,
      "last_updated": "2024-01-20"
    }
  }
}
```

## Batch Note Updates

### Example 6: Project Status Updates

```json
{
  "name": "update_note",
  "arguments": {
    "updates": [
      {
        "identifier": "projects/website-redesign.md",
        "metadata": {
          "status": "in-progress",
          "last_updated": "2024-01-20",
          "completion_percentage": 25
        }
      },
      {
        "identifier": "projects/api-documentation.md", 
        "metadata": {
          "status": "completed",
          "completion_date": "2024-01-18",
          "completion_percentage": 100
        }
      },
      {
        "identifier": "projects/security-audit.md",
        "metadata": {
          "status": "in-progress",
          "assigned_to": "security-team",
          "completion_percentage": 60
        }
      }
    ]
  }
}
```

### Example 7: Content and Metadata Updates

```json
{
  "name": "update_note",
  "arguments": {
    "updates": [
      {
        "identifier": "book-reviews/pragmatic-programmer.md",
        "content": "# The Pragmatic Programmer\n\n## Summary\nExcellent guide for software developers covering best practices, debugging techniques, and professional development.\n\n## Key Takeaways\n- DRY principle (Don't Repeat Yourself)\n- Importance of version control\n- Testing strategies\n- Communication skills for developers\n\n## Favorite Quote\n\"Your knowledge portfolio is your most important professional asset.\"\n\n## Follow-up Actions\n- [ ] Implement DRY principle in current project\n- [ ] Set up automated testing pipeline\n- [ ] Review team communication practices",
        "metadata": {
          "review_date": "2024-01-15",
          "reread": true,
          "recommended_to": ["junior-developers", "team-leads"]
        }
      },
      {
        "identifier": "daily/2024-01-15.md",
        "content": "# Daily Notes - January 15, 2024\n\n## Accomplishments\n- Completed batch operations implementation\n- Updated project documentation\n- Reviewed team PRs\n\n## Learnings\n- Batch operations significantly improve efficiency\n- Good error handling is crucial for user experience\n\n## Tomorrow's Priorities\n- Deploy batch operations feature\n- Update user documentation\n- Team standup at 9 AM"
      }
    ]
  }
}
```

## Error Handling Examples

### Partial Failure Scenario

```json
{
  "name": "create_note",
  "arguments": {
    "notes": [
      {
        "type": "general",
        "title": "Valid Note",
        "content": "This will succeed"
      },
      {
        "type": "invalid/type",
        "title": "Invalid Note",
        "content": "This will fail due to invalid type"
      },
      {
        "type": "book-reviews",
        "title": "Missing Required Fields",
        "content": "This will fail due to missing required metadata"
      }
    ]
  }
}
```

Response with partial failures:

```json
{
  "total": 3,
  "successful": 1,
  "failed": 2,
  "results": [
    {
      "input": { "type": "general", "title": "Valid Note", "content": "This will succeed" },
      "success": true,
      "result": {
        "id": "general/valid-note.md",
        "type": "general",
        "title": "Valid Note",
        "filename": "valid-note.md",
        "path": "/vault/general/valid-note.md",
        "created": "2024-01-15T10:30:00Z"
      }
    },
    {
      "input": { "type": "invalid/type", "title": "Invalid Note", "content": "This will fail due to invalid type" },
      "success": false,
      "error": "Failed to create note 'Invalid Note': Invalid note type name: invalid/type"
    },
    {
      "input": { "type": "book-reviews", "title": "Missing Required Fields", "content": "This will fail due to missing required metadata" },
      "success": false,
      "error": "Failed to create note 'Missing Required Fields': Metadata validation failed: Required field 'author' is missing, Required field 'rating' is missing, Required field 'status' is missing"
    }
  ]
}
```

## API Design Benefits

### Unified Interface
- Single tools (`create_note`, `update_note`) handle both individual and batch operations
- Cleaner API with fewer tools to learn
- Consistent parameter patterns across operations

### Flexible Usage
- Pass individual parameters for single operations
- Pass arrays (`notes`, `updates`) for batch operations
- Mix and match as needed for different workflows

### Backward Compatibility
- Existing single note operations continue to work unchanged
- New batch capabilities are additive enhancements

## Best Practices

### 1. Choosing Single vs Batch Operations
- **Single operations**: Interactive use, immediate feedback, simple workflows
- **Batch operations**: Bulk imports, migrations, automated systems, efficiency

### 2. Batch Size Recommendations
- **Small batches (1-10 notes)**: Interactive use, quick feedback
- **Medium batches (10-50 notes)**: Bulk imports, data migration
- **Large batches (50+ notes)**: Automated systems, consider chunking

### 3. Error Handling Strategy
- Always check the `successful` and `failed` counts in batch responses
- Review failed operations and fix issues before retrying
- Use detailed error messages to identify and resolve problems
- Single operations throw errors directly for immediate handling

### 4. Metadata Validation
- Ensure all required metadata fields are provided
- Validate metadata against note type schemas before operations
- Use consistent metadata formats across similar notes

### 5. Performance Optimization
- Use batch operations for multiple related changes
- Group similar operations together
- Consider processing time for very large batches
- Single operations are optimal for immediate, interactive use

### 6. Data Integrity
- Validate note content before operations
- Use meaningful titles and consistent naming conventions
- Ensure file paths and identifiers are correctly formatted

## Common Use Cases

### Single Note Operations
1. **Interactive Note Taking**: Creating notes during meetings or research
2. **Quick Updates**: Fixing typos, adding quick thoughts
3. **Real-time Editing**: Live note modification during conversations

### Batch Operations
1. **Project Migration**: Moving notes from other systems
2. **Bulk Updates**: Updating metadata across multiple notes
3. **Template Generation**: Creating multiple notes from templates
4. **Status Synchronization**: Updating project statuses from external systems
5. **Content Cleanup**: Standardizing formats across existing notes
6. **Archive Processing**: Importing historical data or documents