# Flint: Building Deep Knowledge

## Executive Summary

Flint is a note-taking application designed to build **deep knowledge** through the complete learning cycle. Most tools optimize for getting thoughts out of your head. That's the easy part. But then your notes pile up and you never look at them again. They fail to accomplish the most important goal: **changing how you think**.

Deep knowledge requires writing, reflection, connection-making, and active recall to turn information into understanding. Your notes should make you smarter over time. Flint is designed so they do.

## Core Philosophy

**Flint builds deep knowledge by supporting the complete cycle of externalizing (getting ideas out), internalizing (making them yours), and resurfacing (bringing them back repeatedly over time to ground memory).**

Most tools optimize for one part of this cycle. Flint optimizes for the entire process.

### The Deep Knowledge Cycle

#### 1. Externalize - Structured capture with minimal friction
Getting ideas out of your head and into notes without barriers. The system handles organization so you can focus on thinking.

**Key principle:** No friction when creating a note. Don't make users think about where it goes or how to structure it upfront.

#### 2. Internalize - Making ideas yours through connection and reflection
Integrating ideas into your mental models through writing, linking, and systematic reflection. This is where notes become knowledge.

**Key principle:** Connections made explicit through wikilinks, backlinks, and agent assistance. Regular reflection practices systematized through routines.

#### 3. Resurface - Active recall brings knowledge back
Spaced repetition and contextual resurfacing bring past ideas back at optimal intervals, grounding them in memory and making them automatically retrievable.

**Key principle:** The system schedules and prompts review. The agent generates contextual prompts for deep re-engagement.

## Philosophy & Core Beliefs

### Notes as First-Class Abstraction

**Core Insight:** Notes are the unit of thinking, not files, folders, or implementation details. By elevating notes to first-class abstractions, Flint removes cognitive burden—you think in terms of *ideas and their connections*, not storage mechanics.

- **Content-centric organization**: How notes organize emerges from content and relationships, not predetermined folder hierarchies
- **Type-guided thinking**: Note types encode patterns for different kinds of thinking and guide both you and the agent
- **Plain text foundation**: Standard markdown with YAML frontmatter—portable, yours forever

### Agent Assistance, Not Replacement

AI agents help with **structural tasks** while humans remain responsible for **thinking**, **content creation**, and **insight generation**.

The agent is deeply integrated with your note system and operates within the philosophy of supporting deep learning, not replacing your thinking:
- **Semantic understanding**: The agent understands note types, relationships, and your learning patterns
- **Type-aware assistance**: Different note types get different kinds of help
- **Conversational partner**: Helps you capture better, connect deeper, and resurface at the right moments

### Frictionless Capture

Reducing friction in capture is critical for externalizing effectively:
- **No barriers to writing things down** - don't make users think about where notes belong
- **Gradual structure addition** - start messy, add organization as patterns emerge
- **Spatial organization** - pinned notes and manual sorting mirror how humans organize physical spaces
- **The trust model** - make a mess while exploring; cleanup is easy

### Local-First & Open

- **Your data stays yours**: Plain text markdown files on your computer—portable, readable forever
- **No lock-in**: Switch AI providers, run inference locally, or stop using Flint entirely
- **Open source**: Community-driven development, no vendor lock-in
- **Privacy**: Your notes never leave your machine unless you choose to sync them

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

- **Left Sidebar**: System views, pinned & recent notes (spatial organization)
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
