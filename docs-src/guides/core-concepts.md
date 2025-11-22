# Core Concepts

This guide explains Flint's fundamental concepts and mental model. Understanding these ideas will help you get the most out of Flint.

## Philosophy: AI That Assists, Not Replaces

Flint is designed around a core belief:

> **AI should help you think better, not think for you.**

The AI agent in Flint handles structural tasks—organizing, linking, scheduling, searching. But **you** remain responsible for:

- Creating content and insights
- Making connections between ideas
- Deciding what's important
- Doing the actual thinking

This partnership allows you to focus on high-value cognitive work while the AI handles the mechanical aspects of note management.

## Notes: The Basic Unit

### What is a Note?

A **note** in Flint is:

- A **plain-text markdown file** stored on your computer
- Contains **content** (your writing) and optional **metadata** (structured data)
- Can link to other notes via **wikilinks**
- Has a unique **ID** that never changes

**Example note file:**

```markdown
---
title: Project Ideas
type: general
created: 2024-01-15T10:30:00Z
tags: [brainstorming, projects]
---

# Project Ideas

## Website Redesign

Thinking about modernizing the company website. Key goals:

- Improve mobile experience
- Faster load times
- Better SEO

Related: [[Marketing Strategy]]

## Mobile App

Could we build a companion mobile app? See [[Technical Feasibility Study]]
```

### Notes Are Just Files

One of Flint's core principles is **data ownership**. Your notes are:

- **Portable**: Standard markdown that works in any text editor
- **Yours**: Stored locally on your machine, not in a proprietary format
- **Hackable**: You can process them with scripts, sync with cloud storage, back them up
- **Future-proof**: Readable without Flint

You can open your vault folder in VS Code, Vim, Obsidian, or any text editor and work with your notes directly.

## Note Types: Schemas for Different Content

### Why Note Types?

Different kinds of notes need different structures:

- **Meeting notes** need attendees and action items
- **Tasks** need due dates and status
- **Book notes** need author and publication info
- **General notes** are freeform

**Note types** define these structures and help the AI assist you better.

### Built-in Note Types

Flint comes with several note types:

| Type | Purpose | Key Fields |
|------|---------|------------|
| **General** | Any content | None (freeform) |
| **Daily** | Daily journal entries | date |
| **Meeting** | Meeting notes | date, attendees |
| **Task** | Action items | status, due_date, priority |
| **Project** | Project documentation | status, start_date |
| **Inbox** | Quick capture | None |

### Custom Note Types

You can create your own note types for specific needs:

**Examples:**
- `book-notes` with fields for author, rating, publication year
- `recipe` with fields for servings, prep time, dietary restrictions
- `research-paper` with fields for authors, journal, DOI
- `client` with fields for contact info, industry, projects

See [Note Management](/features/notes#note-types) for how to create custom types.

### How Note Types Help

1. **Structure**: Templates ensure consistent formatting
2. **AI Guidance**: The AI knows what fields to populate
3. **Organization**: Notes are stored in type-specific folders
4. **Filtering**: Search and filter by type

## Vaults: Isolated Workspaces

### What is a Vault?

A **vault** is a completely isolated collection of notes. Think of it as a separate workspace or notebook.

**Key properties:**
- Separate **folder** on your computer
- Separate **database** for metadata and search
- Separate **conversation history** with the AI
- Separate **settings** and configuration
- Independent **note types**

### Why Use Multiple Vaults?

**Common use cases:**

**Work / Personal Separation**
```
Work Vault:
- Meeting notes with colleagues
- Project documentation
- Client information

Personal Vault:
- Journal entries
- Personal goals
- Book notes
- Recipes
```

**Project-Based**
```
Research Vault:
- Academic papers
- Literature notes
- Experiment logs

Startup Vault:
- Business planning
- Product ideas
- Customer research
```

**Privacy Levels**
```
Public Vault:
- Blog drafts
- Public notes
- Shareable content

Private Vault:
- Personal reflections
- Sensitive information
```

### Switching Vaults

Click the **vault selector** in the top-left corner to switch between vaults. Each vault maintains its own state—you can have different notes open, different AI conversations, different settings.

## Wikilinks: Connecting Ideas

### What are Wikilinks?

**Wikilinks** are Flint's way of connecting notes together. They create a web of knowledge.

**Syntax:**
```markdown
[[Note Title]]
[[type/filename|Display Text]]
```

**Example:**
```markdown
I'm working on the [[Website Redesign]] project.

The design direction relates to our [[brand/visual-identity|Brand Guidelines]].
```

### Bidirectional Links

When you create a wikilink, Flint automatically tracks it in **both directions**:

1. **Forward link**: You can click to navigate to the target note
2. **Backlink**: The target note shows that your note references it

This creates a network of connections that helps you discover relationships between ideas.

**Example:**

If `Note A` links to `Note B`:
- In Note A: `[[Note B]]` is clickable
- In Note B: Backlinks panel shows "Referenced by Note A"

### Why Link Notes?

**Build a knowledge graph:**
- See how ideas connect
- Discover unexpected relationships
- Find related context

**Better than folders:**
- A note can relate to multiple topics
- Connections reflect how you actually think
- Navigate by association, not hierarchy

See [Wikilinks and Backlinks](/features/wikilinks) for advanced patterns.

## Metadata: Structured Data

### What is Metadata?

**Metadata** is structured information about your note, stored in YAML frontmatter at the top of the file.

**Example:**
```markdown
---
title: Team Standup
type: meeting
date: 2024-01-15
attendees: [Sarah, John, Maria]
priority: high
tags: [weekly, standup]
---

# Meeting content goes here...
```

### Why Use Metadata?

**AI Understanding:**
- The AI knows what fields mean
- Can search and filter by metadata
- Can suggest appropriate values

**Powerful Search:**
- Find all meetings with specific attendees
- Filter tasks by due date or priority
- Search notes created in a date range

**Automation:**
- Workflows can act on metadata
- Generate reports based on fields
- Trigger actions when conditions match

### Types of Metadata

**System fields** (automatically managed):
- `title` - Note title
- `type` - Note type
- `created` - Creation timestamp
- `updated` - Last modified timestamp

**Type-specific fields** (defined by note type):
- Meeting: `date`, `attendees`
- Task: `status`, `due_date`, `priority`
- Project: `start_date`, `status`

**Custom fields** (you define):
- Any field name you want
- Values can be: strings, numbers, dates, arrays, booleans

## Tags: Flexible Organization

### How Tags Work

**Tags** are labels you add to notes for organization. They can appear in:

1. **Frontmatter** (recommended):
```markdown
---
tags: [important, project, api]
---
```

2. **Content** (inline):
```markdown
This is about #api design and #architecture
```

### Tags vs Note Types

| Feature | Note Types | Tags |
|---------|-----------|------|
| **Purpose** | Define structure | Add labels |
| **Count** | One per note | Many per note |
| **Schema** | Yes (defines fields) | No |
| **Storage** | Type-specific folders | Mixed |

**When to use what:**
- **Note Type**: "This is a meeting note"
- **Tags**: "This meeting is about #api and #design and is #important"

## The AI Agent: Your Organizational Partner

### What the AI Can Do

The AI agent has access to tools that let it:

**Note Operations:**
- Create, read, update, and delete notes
- Search across all notes
- Move and rename notes
- Manage metadata

**Organization:**
- Create and manage note types
- Find and fix broken links
- Suggest tags and connections
- Organize your inbox

**Analysis:**
- Answer questions about your notes
- Summarize content
- Find patterns and themes
- Generate reports

### What the AI Cannot Do

The AI **cannot**:
- Think for you
- Generate original insights (only you can connect dots)
- Replace your judgment about what's important
- Make decisions about your work

It's a tool to amplify your thinking, not replace it.

### Model Context Protocol (MCP)

Flint uses the **Model Context Protocol** to give the AI access to your notes:

- **Standardized tools**: Create note, search notes, get backlinks, etc.
- **Transparent**: You can see what tools the AI uses
- **Controlled**: The AI can only do what the tools allow
- **Local**: All operations happen on your machine

## Local-First: Your Data, Your Control

### What Does Local-First Mean?

**Local-first** means:

1. **Notes stored locally** on your computer, not on someone else's server
2. **Works offline** - no internet required for note-taking
3. **You own the data** - plain markdown files you can access anytime
4. **Privacy by default** - nothing leaves your machine except AI requests

### What Gets Sent to AI Providers?

When you use the AI agent:

**Sent to AI provider:**
- Your message to the AI
- Relevant note content (when needed for context)
- Conversation history

**NOT sent:**
- Your entire vault
- Notes you didn't mention
- Any data when you're not using AI

**You control:**
- Which AI provider to use
- Your API keys (stored securely in OS keychain)
- When to use AI vs work locally

## How These Concepts Work Together

Here's how it all fits:

```
┌─────────────────────────────────────────────────┐
│                    VAULT                        │
│  (Isolated workspace)                           │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  Note Type   │  │  Note Type   │            │
│  │  "Meeting"   │  │  "General"   │            │
│  │              │  │              │            │
│  │  ┌────────┐  │  │  ┌────────┐ │            │
│  │  │  Note  │  │  │  │  Note  │ │            │
│  │  │        │──┼──┼─→│        │ │  Wikilink  │
│  │  │metadata│  │  │  │metadata│ │            │
│  │  │content │  │  │  │content │ │            │
│  │  │tags    │  │  │  │tags    │ │            │
│  │  └────────┘  │  │  └────────┘ │            │
│  └──────────────┘  └──────────────┘            │
│                                                 │
│  AI agent can:                                  │
│  - Search notes                                 │
│  - Create/modify notes                          │
│  - Manage types                                 │
│  - Find links                                   │
└─────────────────────────────────────────────────┘
```

**Workflow example:**

1. You create notes throughout the day (possibly in Inbox)
2. Notes link to each other via wikilinks
3. Metadata helps organize and filter
4. Tags provide flexible categorization
5. AI helps process and organize periodically
6. You review, refine, and think about the connections

## Best Practices

### Start Simple

Don't try to use every feature immediately:

1. **Week 1**: Just create notes and link them
2. **Week 2**: Add some tags, try metadata
3. **Week 3**: Use AI to help organize
4. **Week 4**: Try workflows and custom types

### Let Structure Emerge

Don't over-plan your organizational system:

- Start with general notes
- Notice patterns in what you write
- Create note types as needs become clear
- Use tags for themes that emerge
- Let the AI help identify structure

### Trust the Process

Flint's philosophy is about **gradual refinement**:

1. **Capture** ideas quickly without friction
2. **Connect** related ideas with wikilinks
3. **Organize** periodically with AI help
4. **Refine** structure as patterns emerge
5. **Think** about the connections and insights

The goal is a **thinking system** that grows with you, not a perfect filing cabinet.

## Next Steps

Now that you understand the concepts:

- **[User Interface Guide](/guides/interface)** - Learn the interface in detail
- **[Note Management](/features/notes)** - Deep dive into notes and types
- **[Wikilinks](/features/wikilinks)** - Master bidirectional linking
- **[AI Agent](/features/agent)** - Learn what the AI can do for you

---

**Remember:** Flint is a tool to amplify your thinking. The concepts work together to help you capture, connect, and develop ideas—but the insights come from you.
