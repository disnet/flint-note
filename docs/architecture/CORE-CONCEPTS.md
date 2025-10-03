# Flint Core Concepts

## Overview

This document describes the fundamental conceptual units that users interact with in Flint - the building blocks that form the foundation of the note-taking and knowledge management system. Understanding these core concepts is essential for both users and developers working with Flint.

## Core Conceptual Units

### 1. Notes

**Definition**: Notes are the primary content units in Flint - structured documents that contain user content in markdown format with optional metadata.

**Key Characteristics**:

- **Content Format**: Notes are stored as standard markdown files with optional YAML frontmatter
- **Unique Identity**: Each note has a unique identifier within its vault
- **Metadata Support**: Notes can contain structured metadata through YAML frontmatter
- **Searchable Content**: Full-text search across note content and metadata
- **Version History**: Notes maintain their edit history and creation timestamps

**Note Structure**:

```markdown
---
title: 'Example Note'
created: 2024-01-15T10:30:00Z
tags: ['important', 'project']
type: 'task'
---

# Note Content

This is the markdown content of the note.
```

**Note Operations**:

- Create, read, update, delete (CRUD)
- Search and filter
- Rename and move between locations
- Metadata editing and management
- Content versioning and history

### 2. Note Types

**Definition**: Note Types are schemas that define the structure, behavior, and metadata fields for different categories of notes.

**Key Characteristics**:

- **Schema Definition**: Define required and optional metadata fields
- **Visual Identity**: Each note type has associated icons and visual indicators
- **Behavior Rules**: Define how notes of this type should behave
- **Template Support**: Provide default content and structure for new notes
- **Validation**: Ensure note metadata conforms to the type schema

**Common Note Types**:

- **Document**: General-purpose notes for writing and documentation
- **Task**: Action items with status tracking and due dates
- **Event**: Calendar entries with time and location information
- **Contact**: People and organization information
- **Project**: Complex initiatives with multiple related notes

**Note Type Schema Example**:

```typescript
interface NoteType {
  id: string;
  name: string;
  icon: string;
  schema: {
    required: string[];
    optional: string[];
    fields: {
      [fieldName: string]: {
        type: 'string' | 'number' | 'boolean' | 'date' | 'array';
        validation?: any;
      };
    };
  };
  template?: string;
}
```

### 3. Vaults

**Definition**: Vaults are self-contained workspaces that organize related notes, note types, and configurations into isolated environments.

**Key Characteristics**:

- **Workspace Isolation**: Each vault maintains separate note collections and settings
- **Independent Configuration**: Vaults can have different note types, settings, and preferences
- **File System Mapping**: Each vault corresponds to a directory structure on disk
- **Multi-Vault Support**: Users can work with multiple vaults simultaneously
- **Context Switching**: Easy switching between different vault contexts

**Vault Components**:

- **Note Collection**: All notes belonging to the vault
- **Note Type Definitions**: Custom note types specific to the vault
- **Configuration**: Vault-specific settings and preferences
- **Search Index**: Full-text search index for vault content
- **Link Graph**: Network of connections between notes in the vault

**Vault Operations**:

- Create and initialize new vaults
- Switch between active vaults
- Import and export vault data
- Backup and restore vault contents
- Manage vault-specific settings

**Default Vault**: Flint always provides a default vault for users who don't need multiple workspaces.

### 4. Links Between Notes

**Definition**: Links are connections between notes that create a knowledge graph, enabling navigation and relationship tracking across the note collection.

**Key Characteristics**:

- **Wikilink Syntax**: Uses `[[Note Title]]` syntax for creating links
- **Bidirectional Relationships**: Links create connections in both directions
- **Automatic Resolution**: Links automatically resolve to existing notes
- **Broken Link Detection**: System identifies and reports broken or missing links
- **Graph Visualization**: Links form a navigable graph of knowledge relationships

**Link Types**:

**Title-Based Wikilinks**:

- Syntax: `[[Note Title]]`
- Links to notes by their display title
- System resolves title to the actual note location
- Creates navigable connections between notes
- Automatically tracked in the system link graph

**Path-Based Wikilinks**:

- Syntax: `[[type/name|Display Title]]`
- Links to notes by their filesystem path within the vault
- Path uses vault-relative directory structure
- `.md` extension is omitted from the path
- Display title shown in the link can differ from the actual note title
- Enables precise linking when multiple notes have similar titles

**Examples**:

```markdown
[[Meeting Notes]] // Links by title
[[projects/alpha|Alpha Project]] // Links to projects/alpha.md, displays as "Alpha Project"
[[tasks/urgent|Urgent Tasks]] // Links to tasks/urgent.md, displays as "Urgent Tasks"
```

**Backlinks**:

- Automatically generated reverse connections
- Show which notes reference the current note
- Enable discovery of related content
- Maintained automatically by the system for both link types

**Link Operations**:

- **Creation**: Automatic link creation when using either wikilink syntax
- **Navigation**: Click-to-navigate between linked notes regardless of link type
- **Resolution**: System resolves both title-based and path-based links to actual notes
- **Tracking**: System maintains a complete graph of all connections
- **Validation**: Detection of broken links when notes are renamed, moved, or deleted
- **Discovery**: Find related notes through link relationships

**Link Graph Structure**:

```typescript
interface LinkGraph {
  nodes: {
    [noteId: string]: {
      title: string;
      type: string;
      path: string;
      outgoingLinks: string[];
      incomingLinks: string[];
    };
  };
  edges: {
    source: string;
    target: string;
    type: 'title-link' | 'path-link';
    displayText?: string; // For path-based links with custom display
  }[];
}
```

## Conceptual Relationships

### Hierarchy and Organization

```
Vault
├── Note Types (schemas and templates)
├── Notes (content with metadata)
│   ├── Note A ←→ Links ←→ Note B
│   ├── Note C ←→ Links ←→ Note D
│   └── ...
└── Link Graph (relationship network)
```

### Data Flow

1. **Note Creation**: Users create notes within a vault, optionally using note type templates
2. **Type Assignment**: Notes are assigned to note types, which define their structure and behavior
3. **Link Formation**: As users write content, wikilinks create connections between notes
4. **Graph Evolution**: The link graph evolves as notes are created, edited, and linked
5. **Discovery**: Users navigate and discover content through the interconnected graph

### Contextual Boundaries

- **Vault Boundary**: Each vault maintains its own isolated collection of notes, types, and links
- **Type Boundary**: Note types define the structural boundaries for different categories of content
- **Link Boundary**: Links can only connect notes within the same vault
- **Search Boundary**: Search operations are scoped to the current vault context

## Integration with AI Assistant

The AI Assistant understands and can manipulate all core conceptual units:

**Note Operations**: Create, edit, search, and organize notes through natural language commands

**Type Management**: Understand note types and help users choose appropriate types for their content

**Vault Navigation**: Switch between vaults and understand vault-specific context

**Link Intelligence**: Understand relationships between notes and suggest relevant connections

**Task Integration**: Extract and manage tasks from tool calls, linking them to relevant notes

## Summary

These four core concepts - Notes, Note Types, Vaults, and Links - form the foundational architecture of Flint's knowledge management system. Together, they enable users to:

- **Organize** content in structured, typed notes within isolated workspaces
- **Connect** ideas through a rich network of bidirectional links
- **Discover** related information through graph navigation and search
- **Scale** their knowledge base through multiple vault support
- **Collaborate** with AI assistance that understands the full conceptual model

Understanding these concepts is crucial for effectively using Flint as both a simple note-taking tool and a sophisticated knowledge management system.
