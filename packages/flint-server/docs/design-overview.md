# Flint Note Design Overview Document

## Overview

Flint Note is an agent-first note-taking system built on the Model Context Protocol (MCP) that treats AI agents as the primary interface for creating, organizing, and connecting knowledge. Instead of adding AI features to traditional notes, Flint is architected from the ground up for AI collaboration.

## Core Philosophy

### Agent-First Design
- **Primary Interface**: AI agents understand note types and guide content creation
- **Natural Language**: Users interact through conversation rather than forms or interfaces
- **Contextual Intelligence**: Each note type has specific agent instructions that define behavior
- **Adaptive Learning**: Agent instructions evolve based on usage patterns

### Data Ownership & Portability
- **Local Storage**: All notes are plain Markdown files with YAML frontmatter
- **File System Based**: No proprietary databases or vendor lock-in
- **Version Control Ready**: Works seamlessly with Git and other VCS
- **Human Readable**: Notes remain accessible without Flint Note

## Data Model

### Workspace Structure

```
vault-directory/
├── .flint-note/
│   ├── config.yml              # Vault configuration
│   ├── search-index.db         # SQLite search & link index
│   └── backups/               # Automatic backups
├── {note-type}/
│   ├── _description.md        # Type definition & agent instructions
│   ├── note-1.md
│   └── note-2.md
├── general/                   # Default note type
│   ├── _description.md
│   └── misc-notes.md
└── other-note-types/
    ├── _description.md
    └── more-notes.md
```

### Notes: The Core Entity

#### Physical Structure
Each note is stored as a Markdown file with YAML frontmatter:

```markdown
---
title: "Atomic Habits"
author: "James Clear"
rating: 5
status: "completed"
tags: ["productivity", "habits"]
type: "reading"
created: "2024-01-15T10:30:00Z"
updated: "2024-01-15T10:30:00Z"
---

# Atomic Habits

## Summary
Excellent book about building good habits...

## Key Insights
- Small changes compound over time
- Focus on systems, not goals
- Environment design is crucial
```

#### Metadata System
- **Structured Data**: YAML frontmatter contains typed metadata
- **Schema Validation**: Each note type defines required and optional fields
- **Type Safety**: Fields have types (string, number, date, select, array, boolean)
- **Constraints**: Min/max values, patterns, selection options
- **Automatic Fields**: `created`, `updated`, `type` managed by system

#### Unique Identification
Notes use a hierarchical naming system:
1. **Display Title**: The `title` in metadata (user-facing, changeable)
2. **Stable ID**: `note-type/filename.md` format (never changes)
3. **File Path**: Actual filesystem location (managed by system)

This ensures links remain stable while titles can evolve naturally.

### Note Types: Behavioral Templates

#### Purpose
Note types define:
- **Agent Instructions**: How AI should behave for this content type
- **Metadata Schema**: Required and optional structured fields
- **Purpose Statement**: What this note type is designed to capture

#### Definition Structure
Each note type is defined by a `_description.md` file:

```markdown
# Reading Notes

## Purpose
Track books, articles, and papers with structured insights and ratings.

## Agent Instructions
- Always ask for the author's background and credentials
- Extract key insights and actionable takeaways
- Request a personal rating (1-5 stars) and what made it memorable
- Suggest connections to other readings in the vault
- Encourage specific quotes with page references

## Metadata Schema
- title: Book/article title (required, string)
- author: Author name (required, string)
- rating: Personal rating (required, number, min: 1, max: 5)
- status: Reading progress (required, select: to_read|reading|completed)
- tags: Topic categories (optional, array)
- isbn: ISBN for books (optional, string)
```

#### Schema Validation
- **Field Types**: string, number, boolean, date, array, select
- **Constraints**: min/max values, regex patterns, selection options
- **Required Fields**: Ensures data completeness
- **Default Values**: Automatically populated sensible defaults

### Vaults: Isolated Workspaces

#### Multi-Vault Architecture
- **Separate Contexts**: Work, personal, research, projects kept isolated
- **Independent Configuration**: Each vault has its own note types and settings
- **Cross-Vault Operations**: Can work across vaults without switching context
- **Vault Registry**: Global configuration tracks all available vaults

#### Vault Configuration
```yaml
# Global: ~/.flint-note/config.yml
vaults:
  work:
    name: "Work Notes"
    path: "~/work-notes"
    description: "Professional projects and meetings"
  personal:
    name: "Personal Journal"
    path: "~/personal-notes"
    description: "Personal thoughts and goals"
current_vault: "work"

# Per-vault: .flint-note/config.yml
vault_id: "work"
default_note_type: "general"
search:
  index_enabled: true
deletion:
  require_confirmation: true
  create_backups: true
```

## System Architecture

### Hybrid Storage Model

#### File System (Primary)
- **Human Readable**: Notes stored as Markdown files
- **Portable**: Works with any text editor or tool
- **Version Control**: Git-friendly format
- **Direct Access**: Files can be edited outside Flint Note

#### SQLite Index (Performance)
- **Search Optimization**: Full-text search with ranking
- **Metadata Queries**: Complex filtering and aggregation
- **Link Relationships**: Automatic link extraction and tracking
- **Real-time Sync**: Index updates as files change

### Database Schema

```sql
-- Core notes table
CREATE TABLE notes (
    id TEXT PRIMARY KEY,           -- note-type/filename
    title TEXT NOT NULL,
    content TEXT,
    type TEXT NOT NULL,
    created DATETIME NOT NULL,
    updated DATETIME NOT NULL
);

-- Flexible metadata storage
CREATE TABLE note_metadata (
    note_id TEXT,
    key TEXT,
    value TEXT,
    value_type TEXT,              -- string, number, date, boolean, array
    FOREIGN KEY (note_id) REFERENCES notes(id)
);

-- Link relationships
CREATE TABLE note_links (
    source_note_id TEXT,
    target_note_id TEXT,          -- NULL for broken links
    target_title TEXT,            -- Text inside [[]]
    link_text TEXT,               -- Display text
    FOREIGN KEY (source_note_id) REFERENCES notes(id)
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    id, title, content, type, content=notes
);
```

### Link Management

#### Automatic Link Extraction
- **Wikilinks**: `[[note-title]]` and `[[note-title|display]]`
- **External Links**: Markdown links and plain URLs
- **Real-time Resolution**: Links resolved to note IDs immediately
- **Broken Link Tracking**: Unresolved links tracked for future resolution

#### Link Types
- **Internal Links**: Between notes using wikilink syntax
- **External Links**: URLs, images, embeds to external resources
- **Backlinks**: Automatically tracked reverse relationships

## Search & Discovery

### Multi-Modal Search
- **Simple Search**: Fast text search with content ranking
- **Advanced Search**: Metadata filters, date ranges, sorting
- **SQL Search**: Direct database queries for complex analysis
- **Link Search**: Find by relationship patterns

### Search Performance
- **FTS5 Engine**: SQLite full-text search for content
- **Metadata Indexing**: Structured queries on typed fields
- **Field Filtering**: Reduce payload by 90% with selective fields
- **Batch Operations**: Efficient multi-note retrieval

## Agent Intelligence System

### Contextual Behavior
- **Note Type Awareness**: Agents understand the purpose of each note type
- **Dynamic Instructions**: Behavior defined by user-customizable instructions
- **Vault Context**: Agents adapt to current vault purpose and content
- **Cross-Vault Intelligence**: Maintain context when working across vaults

### Content Enhancement
- **Guided Creation**: Agents ask relevant questions based on note type
- **Metadata Population**: Automatic extraction and validation of structured data
- **Link Suggestions**: Smart recommendations for note connections
- **Content Improvement**: Suggestions for organization and clarity

### Learning & Adaptation
- **Instruction Evolution**: Users can update agent behavior through conversation
- **Pattern Recognition**: Agents learn from usage patterns
- **Contextual Memory**: Remember preferences within conversation sessions

## Data Integrity & Safety

### Optimistic Locking
- **Content Hashes**: SHA-256 hashes prevent concurrent modification conflicts
- **Conflict Detection**: Automatic detection of external changes
- **Batch Safety**: Each operation in batch includes content hash validation
- **Graceful Recovery**: Clear error messages guide conflict resolution

### Backup & Recovery
- **Automatic Backups**: Created before destructive operations
- **Confirmation Requirements**: Explicit confirmation for deletions
- **Rollback Capability**: Restore from backups when needed
- **Migration Safety**: Data format upgrades with automatic backups

### Validation & Constraints
- **Schema Validation**: Metadata checked against note type definitions
- **Type Coercion**: Automatic conversion of compatible types
- **Constraint Enforcement**: Min/max values, patterns, selection validation
- **Error Recovery**: Graceful handling of invalid data

## Performance Characteristics

### File Operations
- **Lazy Loading**: Notes loaded on-demand
- **Batch Processing**: Efficient multi-note operations
- **Incremental Updates**: Only changed content written to disk
- **Concurrent Access**: Safe multi-process file handling

### Search Performance
- **Sub-millisecond**: Simple text queries
- **Indexed Metadata**: Fast filtering on structured fields
- **Scalable**: Handles thousands of notes efficiently
- **Memory Efficient**: Lightweight index with minimal footprint

### Network Efficiency
- **Field Filtering**: Reduce data transfer by up to 90%
- **Batch Operations**: Minimize round trips
- **Compression**: Efficient serialization of responses
- **Caching**: Smart caching of frequently accessed data

## Integration Points

### Model Context Protocol (MCP)
- **Standard Protocol**: Works with any MCP-compatible AI client
- **Rich Tool Set**: Comprehensive CRUD operations
- **Resource Exposure**: Real-time workspace information
- **Streaming Support**: Efficient data transfer

### Development APIs
- **Direct API**: Programmatic access without MCP protocol
- **TypeScript Support**: Full type definitions and intellisense
- **Event System**: Hooks for custom integrations
- **Plugin Architecture**: Extensible through custom note types

### External Tools
- **Version Control**: Git-friendly file formats
- **Text Editors**: Direct file editing supported
- **Import/Export**: Standard Markdown compatibility
- **Backup Systems**: File-based backup integration

## Security Model

### Data Control
- **Local Storage**: All data remains on user's machine
- **No Cloud Dependencies**: Works completely offline
- **Encryption Ready**: Files can be encrypted at rest
- **Access Control**: File system permissions provide security

### API Safety
- **Parameterized Queries**: SQL injection prevention
- **Input Validation**: All user input sanitized
- **Read-Only Connections**: Search queries use read-only database access
- **Resource Limits**: Query timeouts and result size limits

This design enables Flint Note to provide intelligent, AI-native note-taking while maintaining complete data ownership and portability. The hybrid file/database approach delivers both human accessibility and machine efficiency, creating a foundation for truly collaborative human-AI knowledge management.
