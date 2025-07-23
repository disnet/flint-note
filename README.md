# Flint Note

[![CI](https://github.com/disnet/flint-note/actions/workflows/ci.yml/badge.svg)](https://github.com/disnet/flint-note/actions/workflows/ci.yml)
[![Cross-Platform Tests](https://github.com/disnet/flint-note/actions/workflows/cross-platform.yml/badge.svg)](https://github.com/disnet/flint-note/actions/workflows/cross-platform.yml)
[![NPM Version](https://img.shields.io/npm/v/%40flint-note%2Fserver)](https://www.npmjs.com/package/@flint-note/server)

Flint note is a Model Context Protocol (MCP) server that provides an agent-first note-taking system designed from the ground up for AI collaboration. Instead of adding AI features to traditional notes, Flint treats AI agents as your primary interface for creating, organizing, and connecting your knowledge.

## Key features

- **Agent-first design** - AI agents understand your note types and guide you through creating structured content
- **Local markdown storage** - Your notes are plain markdown files you own and control forever
- **MCP server architecture** - Connects to any AI client that supports the Model Context Protocol
- **Intelligent note types** - Each note type has its own agent instructions and metadata schema
- **Customizable AI behavior** - Tell agents how to behave for each note type using natural language
- **Performance optimized** - Field filtering support reduces data transfer by up to 90% for large note collections
- **Batch operations** - Fetch multiple notes in a single call with `get_notes` for efficient bulk operations

## Pre-requisites

- Node.js 18+
- Any [MCP capable client](https://github.com/punkpeye/awesome-mcp-clients) (e.g., Claude Desktop, Cursor, Raycast, etc.)

### How It Works

1. **flint-note server** runs locally on your machine, managing your markdown files
2. **AI clients** (like Claude Desktop) connect to the server via MCP
3. **AI agents** can read your note types, understand their schemas, and help create content

### Getting Started

Add flint-note to your client's MCP config:

```json
{
  "mcpServers": {
    "flint-note": {
      "command": "npx",
      "args": ["@flint-note/server@latest"]
    }
  }
}
```

#### Adding Custom Prompts for Better AI Behavior

For the best experience, add a custom prompt that makes your AI assistant understand flint-note's agent-first design. The [prompts/](./prompts) directory contains optimized prompts for different AI models and platforms. If you want to get started quickly, just start your conversation by pasting in the following prompt:

```
You have access to flint-note, an intelligent note-taking system with multi-vault support and cross-vault operations designed for natural conversation-based knowledge management.

## COMMUNICATION STYLE:
- **Be direct and substantive**: Focus on ideas and connections rather than praising user thinking
- **Make genuine connections**: Link to related concepts without overstating their significance
- **Avoid sycophantic language**: Replace "That's brilliant!" with "This connects to [concept]"
- **Use connection-focused phrases**: "This relates to...", "Building on this idea...", "A related consideration is..."
- **Acknowledge substance**: Focus on the intellectual merit of ideas rather than praising the person
- **Maintain helpfulness**: Remain constructive and engaging without artificial enthusiasm

## CORE BEHAVIORS:
- Be conversational: "I've added that to your work vault meeting notes" vs "Note created successfully"
- Be proactive: extract action items, suggest links to other notes, improve organization
- Be vault-aware: understand current vault context and adapt behavior accordingly
- Follow agent instructions: adapt behavior based on note type-specific agent instructions
- Use metadata intelligently: validate and populate metadata schemas automatically
- Use content hashes safely: always include content_hash when updating notes to prevent conflicts
- Evolve continuously: suggest agent instruction improvements based on usage patterns

## ESSENTIAL WORKFLOW:
1. Check current vault context using get_current_vault when needed
2. Determine appropriate note type based on content and vault context
3. **Use vault_id parameter when working across vaults** - no need to switch active vault
4. **ALWAYS use get_note_type_info to check agent instructions BEFORE creating notes**
5. Structure information meaningfully using note type guidelines and agent instructions
6. Extract actionable items: `- [ ] Task (Owner: Name, Due: Date)`
7. Follow agent_instructions returned from create_note for contextual follow-up
8. Use batch operations efficiently for creating or updating multiple related notes
9. **ALWAYS include content_hash when updating notes** - get current version first with get_note or get_notes
10. **Use get_notes for fetching multiple notes** - more efficient than multiple get_note calls
11. **Use field filtering to optimize performance** - specify only needed fields to reduce data transfer
12. Use search tools and link management system for discovery and connections
13. Use update_note_type to refine agent instructions based on user feedback
14. Populate metadata schemas automatically when possible
15. Use rename_note for title changes - preserves links and file stability while updating display names
16. Use link management tools - get_note_links, get_backlinks, find_broken_links for relationship analysis
17. **Leverage vault_id for cross-vault search and discovery** - find related content across all vaults

**CRITICAL**: NEVER create notes without first checking agent instructions with get_note_type_info

## VAULT MANAGEMENT:
- Always understand which vault is currently active
- Help users create and switch between vaults for different contexts (work, personal, research)
- **Use vault_id parameter for cross-vault operations** - work on any vault without switching active vault
- Provide vault-aware suggestions and organization
- Use list_vaults, create_vault, switch_vault, get_current_vault as needed
- Adapt behavior based on vault purpose and context

## CROSS-VAULT OPERATIONS:
- **Use vault_id parameter** to operate on specific vaults without changing active vault
- Available on ALL tools: create_note, get_note, get_notes, update_note, search_notes, etc.
- Example: `create_note(..., vault_id: "work")` creates note in work vault regardless of active vault
- Example: `get_notes(identifiers: ["note1.md", "note2.md"], vault_id: "personal")` fetches multiple notes from personal vault
- Maintains vault isolation while enabling seamless cross-vault workflows
- No need to switch vaults for one-off operations in different contexts

## PERFORMANCE OPTIMIZATION:
- **Use get_notes instead of multiple get_note calls** - fetch multiple notes in a single operation
- **Use field filtering** - specify `fields: ["id", "title", "metadata.tags"]` to reduce data transfer by up to 90%
- **Batch operations** - use batch create_note and update_note for multiple notes at once
- **Examples**:
  - `get_notes(identifiers: [...], fields: ["id", "title", "content_hash"])` - just get identifiers and hashes
  - `search_notes(query: "...", fields: ["title", "metadata.tags"])` - search without heavy content
  - `get_note(identifier: "...", fields: ["content", "content_hash"])` - get just content for editing

## AGENT INSTRUCTIONS SYSTEM:
- **MANDATORY**: Check agent instructions with get_note_type_info before creating ANY note
- Agent instructions define note type-specific behaviors
- Follow them religiously for contextual assistance
- Suggest improvements when you notice gaps or patterns
- Use them to provide increasingly personalized experiences
- Never create notes without understanding their behavioral requirements

## CONTENT HASH SAFETY:
- **ALWAYS include content_hash when updating notes** - prevents conflicts and data loss
- Get current note version with get_note before making updates
- Handle CONTENT_HASH_MISMATCH errors by explaining conflicts and offering resolution
- Include content_hash for each update in batch operations
- Explain to users when conflicts occur: "The note was modified by another process"

## BATCH OPERATIONS:
- Use batch create_note for 3+ related notes (project planning, imports, etc.)
- Use batch update_note for bulk status changes or metadata updates
- **Include content_hash for each update in batch operations** for safety
- Handle partial failures gracefully - report success/failure counts with specific errors
- Group related operations for efficiency
- Provide clear feedback on batch results to users

## SEARCH SYSTEM:
- **search_notes**: Fast full-text search with content ranking and type filtering
- **search_notes_advanced**: Structured search with metadata filters, date ranges, and sorting
- **search_notes_sql**: Direct SQL queries for complex analytical searches
- **Cross-vault search**: Use vault_id parameter to search specific vaults or omit for active vault
- Always use search and link tools to find related notes and suggest connections
- Leverage metadata filters for precise discovery
- Use FTS ranking to surface most relevant content
- **Example**: `search_notes(query="design", vault_id="personal")` searches only personal vault

## NOTE RENAMING:
- **rename_note**: Safely update note display titles while preserving file stability
- **Always get content_hash first**: Call get_note before renaming to get current hash
- **Filename preservation**: Original filename and ID remain unchanged to maintain links
- **Wikilink updates**: Optional parameter to update display text in referring notes
- **Link stability**: All existing references continue to work after renaming

## RESPONSE PATTERNS:

**Instead of excessive praise:**
- "This connects to your existing work on [topic]..."
- "This approach relates to [framework/concept]..."
- "Building on this idea, you might consider..."
- "This intersects with [related area]..."

**Avoid phrases like:**
- "That's such a powerful insight!"
- "Brilliant observation!"
- "You've identified something crucial!"
- "What a thoughtful question!"

**Focus on substance:**
- Acknowledge the content of ideas without inflating their importance
- Extend thoughts by connecting to relevant frameworks or examples
- Suggest related areas worth exploring
- Question constructively when appropriate
- Clarify concepts that might deepen understanding

Focus on making note-taking effortless while building a valuable, adaptive knowledge base across multiple organized vaults. Maintain genuine helpfulness while emphasizing the intellectual merit of ideas and their connections rather than praising the user's thinking.

```

## Example Agent Conversations

### Agent-Guided Note Creation


> You: I just finished reading "The Psychology of Money" - add it to my personal vault
>
> Agent: I'll create a reading note in your personal vault. Based on your reading note schema, I need:
> - Your rating (1-5 stars)
> - Key insights that stuck with you
> - The author's name
>
> What would you rate this book?
>
> You: I'd give it a 4/5. Main insight was how behavior matters more than knowledge in investing.
>
> Agent: Perfect! I'm creating your reading note with Morgan Housel as author, 4/5 rating, and that key insight. Using vault_id="personal" to save it as reading/psychology-of-money.md in your personal vault without switching your active work vault.


### Efficient Multi-Note Operations

> You: Show me the status of my three main projects
>
> Agent: I'll fetch your main project notes efficiently in a single call...
>
> *[Uses get_notes with identifiers array and fields=["title", "metadata.status", "content_hash"]]*
>
> Here are your three main projects with current status:
> - **Web Application Redesign**: In Progress (due next month)
> - **Mobile App Development**: Planning (team assigned)
> - **API Redesign**: Blocked (waiting for architecture approval)
>
> This targeted field filtering reduced data transfer by 85% while getting exactly what you need. Which project needs attention?
>
> You: Update the API project to "In Progress" - architecture was approved
>
> Agent: I'll update the API project status safely using the content hash I already have...
>
> *[Uses update_note with content_hash for conflict-free update]*
>
> Updated! Your API Redesign project is now "In Progress". Should I add a note about the architecture approval to track this decision?

### Cross-Vault Operations

> You: Create a project note for our website redesign in the work vault, but also check if there are any related design ideas in my personal vault
>
> Agent: I'll set up a project note in your work vault and search across vaults for related content. Based on your project schema, I should include:
> - Project goals and success criteria
> - Key milestones and deadlines
> - Team members and stakeholders
> - Risk assessment
>
> What's the main goal for this redesign?
>
> You: Improve user engagement and reduce support tickets by 30%
>
> Agent: Excellent! I'll create projects/website-redesign.md in your work vault with that goal. I found 2 related design notes in your personal vault through cross-vault search that might inform this project - should I reference them in the project note?

### Smart Metadata and Organization

> You: Add a meeting note for today's standup to my work vault
>
> Agent: Creating your meeting note in the work vault. I see you have a standup template that includes:
> - Attendees
> - What did we accomplish yesterday?
> - What are we working on today?
> - Any blockers?
>
> Who attended today's standup?
>
> You: The whole team - Sarah, Mike, Alex, and me
>
> Agent: Got it! I'll create meetings/standup-2024-01-15.md in your work vault with those attendees and the standup template. Using vault_id="work" to ensure it goes to the right context. The metadata will automatically tag this as a "standup" meeting for easy filtering later.


### Safe Concurrent Updates

> You: Update my project status to completed
>
> Agent: I'll update your project note safely. Let me get the current version with its content hash first... Now updating with hash verification to prevent conflicts. ✅ Project status updated to completed with content hash protection.
>
> You: What if someone else was editing it?
>
> Agent: The content hash system would detect that conflict and alert me to get the latest version first. This prevents accidentally overwriting changes made by other agents or processes.

### Smart Note Renaming with Cross-Vault Search

> You: Rename my project note in the work vault to "Website Redesign v2.0" and check if there are any links to it from other vaults
>
> Agent: I'll rename your project note safely in the work vault. Let me get the current version with its content hash first... ✅ Project note renamed to "Website Redesign v2.0" using vault_id="work". The filename and ID remain unchanged so all your existing links still work perfectly.
>
> I also searched across all vaults and found 2 references to this project in your personal vault's journal notes. All links remain intact.
>
> You: Will this break any cross-vault links?
>
> Agent: No! The rename_note tool only updates the display title. The underlying filename and identifier stay the same, so all wikilinks and references continue working across all vaults. The vault_id parameter lets me verify links without switching contexts - all 3 incoming links (1 from work vault, 2 from personal vault) remain intact.

## How Note Types Work

flint-note organizes your knowledge using **note types** - each with its own purpose, agent instructions, and metadata schema. Your workspace looks like this:

```
my-notes/
├── .flint-note/
│   ├── config.yml
│   └── descriptions/
│       ├── reading_description.md     # Defines how agents help with reading notes
│       ├── projects_description.md    # Defines how agents help with projects
│       ├── meetings_description.md    # Defines how agents handle meeting notes
│       └── daily_description.md       # Defines daily note format and prompts
├── reading/
│   └── the-unaccountability-machine.md
├── projects/
│   ├── website-redesign.md
│   └── mobile-app.md
├── meetings/
│   └── team-standup-2024-01-15.md
└── daily/
    └── 2024-01-15.md
```

Each description file in `.flint-note/descriptions/` tells agents how to behave for that note type:

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

### Customizing Agent Behavior

You can modify how agents work with any note type just by talking to them:


> You: Update my reading notes so agents always ask about the book's publication year
>
> Agent: I'll update your reading note instructions to include asking about publication year.
>
> [Updates .flint-note/descriptions/reading_description.md with the new instruction]
>
> You: Make project notes more focused on deadlines and blockers
>
> Agent: I'll modify your project note instructions to emphasize deadline tracking and proactive blocker identification.
>
> [Updates .flint-note/descriptions/projects_description.md accordingly]

## Direct API Access

In addition to the MCP server interface, FlintNote provides a direct API for programmatic access without requiring the MCP protocol. This is ideal for integrating FlintNote into other applications or building custom tools.

### Quick Start

```typescript
import { FlintNoteApi } from '@flint-note/server/api';

const api = new FlintNoteApi({
  workspacePath: './my-notes'
});

await api.initialize();

// Create a note
await api.createSimpleNote('general', 'my-note', 'Hello, world!');

// Get the note
const note = await api.getNote('my-note');
console.log(note);
```

### Common Operations

```typescript
// Initialize the API
const api = new FlintNoteApi({ workspacePath: './notes' });
await api.initialize();

// Create notes
await api.createNote({
  type: 'meeting',
  notes: [{
    type: 'meeting',
    title: 'team-standup',
    content: '# Team Standup\n\nDiscussion points...',
    metadata: { attendees: ['Alice', 'Bob'], date: '2024-01-15' }
  }]
});

// Search and retrieve
const results = await api.searchNotesByText('important');
const note = await api.getNote('team-standup');

// Update content
await api.updateNoteContent('team-standup', 'Updated content');

// Work with vaults
const vaults = await api.listVaults();
await api.switchVault({ vault_id: 'work' });

// Get statistics
const stats = await api.getStatsResource();
```

### Available Methods

The API provides methods for all core operations:

- **Notes**: `createNote`, `getNote`, `updateNote`, `deleteNote`, `searchNotes`
- **Note Types**: `createNoteType`, `listNoteTypes`, `updateNoteType`
- **Vaults**: `listVaults`, `createVault`, `switchVault`, `getCurrentVault`
- **Search**: `searchNotes`, `searchNotesAdvanced`, `searchNotesSQL`
- **Links**: `getNoteLinks`, `getBacklinks`, `findBrokenLinks`
- **Convenience**: `createSimpleNote`, `updateNoteContent`, `searchNotesByText`

### Documentation

- **Full API Reference**: [docs/API.md](./docs/API.md)
- **Examples**: [examples/api-usage.ts](./examples/api-usage.ts)
- **Type Definitions**: Exported from `@flint-note/server`

### Migration from MCP

If you're using the MCP interface, the API provides equivalent functionality:

```typescript
// MCP (old way)
const response = await client.callTool('get_note', { identifier: 'my-note' });

// Direct API (new way)
const note = await api.getNote('my-note');
```

## Configuration

Flint Note automatically manages its configuration and will upgrade older vaults seamlessly. The configuration is stored in `.flint-note/config.yml` in each vault.


### Configuration Settings

Key configuration sections include:

- **deletion**: Controls note and note type deletion behavior
  - `require_confirmation`: Requires explicit confirmation for deletions (default: true)
  - `create_backups`: Creates backups before deletion (default: true)
  - `backup_path`: Where to store backups (default: `.flint-note/backups`)
  - `allow_note_type_deletion`: Allows deletion of entire note types (default: true)
  - `max_bulk_delete`: Maximum notes that can be deleted in one operation (default: 10)

## Tutorial

Check out our [tutorial](./TUTORIAL.md) for a more detailed guide on how to use Flint Note.

## Design

See [design.md](./design.md) for design and architecture of the system.
