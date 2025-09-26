# Flint: Agent-Human Collaborative Note-Taking System

## Executive Summary

Flint is a note-taking application designed as a **thinking system** - a tool that extends and amplifies human cognition rather than replacing it. Built around the core insight that effective thinking requires both structured capture and fluid connection-making, Flint combines plain-text markdown notes with AI agents that assist (but never replace) the human thinking process.

## Philosophy & Core Beliefs

### The Note as Fundamental Unit
- Notes consist of: title, content (plain text/markdown), type, and metadata
- Content is just text - no complex block structures that add cognitive overhead
- [[Wikilink]] syntax for frictionless linking between notes
- File system serves as externalized memory that both humans and AI can read/write

### Agent Assistance, Not Replacement
- AI agents help with **metadata management**, **connection discovery**, and **structural tasks**
- Humans remain responsible for **thinking**, **content creation**, and **insight generation**
- Purpose of a thinking system is to enhance human cognition, not outsource it
- Agents should never get in the way of simply writing things down

### Frictionless Capture
- **No friction when creating a note** - don't make users think about where it goes
- **Easy context switching** - capture ideas without losing current focus
- **Gradual structure addition** - start messy, add organization as patterns emerge
- **Spatial note organization** - humans are good at remembering loose spatial relationships

### Enshittification Resistance
- Plain text, markdown files - data is always portable and readable
- Open source to prevent vendor lock-in and maintain user control
- Local-first architecture where possible
- Clear business model that aligns with user interests

## Architecture & Implementation

### Core Data Model
```
Note {
  id: string
  title: string
  content: string (markdown)
  type: string
  metadata: Record<string, any>
  created: timestamp
  modified: timestamp
  content_hash: string
}

NoteType {
  name: string
  description: string
  agent_instructions: string
  metadata_schema: JSONSchema
}
```

### Three-Column UI Layout
- **Left Sidebar**: System views, pinned notes, temporary notes (spatial organization)
- **Main View**: Note editor or system views
- **Right Sidebar**: AI chat interface for agent interaction

### Note Types System
Note types provide structure without constraint:
- **Purpose**: Each type has a clear purpose and optimal workflows
- **Agent Instructions**: Type-specific guidance for AI assistance
- **Metadata Schemas**: Structured data appropriate to the note type
- **Evolution**: Types can be modified, notes can change types as needed

### Agent Integration Patterns
1. **Metadata Automation**: Auto-populate dates, tags, links, schemas
2. **Connection Discovery**: Suggest related notes, identify patterns
3. **Content Structuring**: Help organize information, create templates
4. **Workflow Assistance**: Handle recurring tasks like daily notes, habit tracking
5. **Search & Retrieval**: Advanced queries, content synthesis

## Key Differentiators

### vs. Obsidian
- **Abstraction Level**: Works with notes (not files), types (not folders)
- **Agent Integration**: Built-in AI assistance vs. plugin ecosystem
- **Opinion**: Opinionated about thinking workflows vs. general-purpose
- **Business Model**: Open source with sustainable funding vs. proprietary

### vs. Notion
- **Complexity**: Simple text notes vs. complex block-based documents
- **Control**: Local-first vs. cloud-dependent
- **Focus**: Individual thinking vs. team collaboration
- **AI Integration**: Thinking assistance vs. content generation

### vs. Roam Research
- **Stability**: Reliable, performant interface vs. experimental features
- **Structure**: Balanced structure vs. complete fluidity
- **Agent Role**: Explicit AI assistance vs. purely manual workflows

### vs. Other AI Note Tools
- **Human Agency**: AI assists thinking vs. AI does thinking
- **Data Ownership**: Local files vs. cloud-dependent
- **Thinking Focus**: Designed for cognition vs. document production

## Technical Implementation Details

### File System as Operational Memory
- Each note type corresponds to a directory
- Individual notes are markdown files within type directories
- File system serves as persistent context for AI agents
- Git-compatible for version control and collaboration

### Agent Context Management
- Note types provide agent instructions and behavioral context
- Agents maintain awareness of vault structure and note relationships
- Custom functions can be registered for reusable agent capabilities
- Prompt caching optimizes repeated operations

### Performance & Reliability
- Electron-based desktop application for local-first operation
- Fast note creation and editing - no perceptible lag
- Robust error handling and data consistency checks
- Content hashing for change detection and conflict resolution

## Use Cases & Workflows

### Primary User Profile
- **Knowledge Workers**: Researchers, developers, writers, consultants
- **Learning-Oriented**: People who actively acquire and synthesize information
- **Tool-Savvy**: Comfortable with markdown, appreciate plain-text benefits
- **Thinking-Focused**: Want tools that enhance rather than replace cognition

### Core Workflows
1. **Daily Capture**: Thoughts, meetings, readings captured with minimal friction
2. **Project Development**: Ideas evolve from sketches to structured projects
3. **Knowledge Building**: Concepts and insights accumulate and interconnect
4. **Habit Tracking**: Personal systems maintained with agent assistance
5. **Review & Reflection**: Regular synthesis of accumulated knowledge

### Agent Collaboration Patterns
- **Metadata Management**: Agents handle tags, dates, schemas automatically
- **Content Organization**: Suggest structure, create links, maintain consistency
- **Pattern Recognition**: Identify themes, connections, recurring elements
- **Workflow Automation**: Handle routine tasks like note templates, reviews
- **Context Provision**: Surface relevant information during writing/thinking

## Future Vision

### Computational Text
Text that can respond and interact - marginalia, embedded agents, context-aware assistance integrated directly into the reading/writing experience.

### Thinking Amplification
Tools that make human thinking more powerful rather than replacing it - better pattern recognition, enhanced memory, improved connection-making.

### Sustainable Development
Open source core with business model aligned with user interests - no enshittification pressure, long-term viability, community-driven evolution.

## Getting Started (For Developers)

### Agent Development Guidelines
1. **Respect Human Agency**: Assist, don't replace human thinking
2. **Understand Note Types**: Each type has specific purpose and optimal workflows
3. **Maintain Context**: Be aware of vault structure and note relationships
4. **Minimize Friction**: Any agent action should reduce, not increase, cognitive load
5. **Preserve Data**: Always use content hashes, validate operations, handle errors gracefully

### Contributing Principles
- **Thinking-First Design**: Every feature should enhance human cognition
- **Simplicity Bias**: Prefer simple solutions that don't add cognitive overhead
- **Performance Matters**: Tool should feel like extension of mind, not external system
- **Data Ownership**: Users must maintain full control over their notes and data
