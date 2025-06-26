# flint-note Design Document

## Overview

**flint-note** is an agent-first note-taking application designed to help users maintain and interact with their personal knowledge base through natural language interfaces. Unlike traditional note-taking apps that add AI features as an afterthought, flint-note is architected from the ground up to be agent-native.

## Vision

Create a note-taking system where:
- Users interact primarily through natural language with AI agents
- Notes are organized by user-defined "types" with semantic meaning
- The system understands the purpose and context of different note categories
- Data remains portable and user-owned through simple file storage
- Integration is seamless with any MCP-compatible chat client

## Core Principles

1. **Agent-First**: Design every feature with AI agent interaction as the primary interface
2. **User Ownership**: All data stored as simple files in user-controlled directories
3. **Semantic Organization**: Note types carry meaning that agents can understand and act upon
4. **Extensible**: Easy to add new note types and agent behaviors
5. **Portable**: No vendor lock-in, works with standard file systems and version control

## Multi-Vault System

flint-note supports multiple vaults, allowing you to organize different collections of notes separately. Each vault is an independent workspace with its own note types, configuration, and notes. This is perfect for separating personal notes, work projects, research topics, or any other organizational structure you prefer.

### Key Features

- **Platform-specific storage**: Configuration stored in appropriate system directories (`~/.config/flint-note` on Unix, `%APPDATA%\flint-note` on Windows)
- **Easy switching**: Switch between vaults instantly without restarting the server
- **Independent workspaces**: Each vault has its own note types and configuration
- **Legacy support**: Automatically migrates existing workspaces to the vault system

### Vault Management

You can manage vaults through both the MCP server tools and the command-line interface:

#### MCP Tools
- `list_vaults` - List all configured vaults
- `create_vault` - Create a new vault
- `switch_vault` - Switch to a different vault
- `get_current_vault` - Show current vault information
- `update_vault` - Update vault name or description
- `remove_vault` - Remove vault from registry (files preserved)

#### Command Line Interface
```bash
# List all vaults
flint-note list

# Create a new vault
flint-note create work "Work Notes" ~/work-vault

# Switch to a vault
flint-note switch work

# Initialize current directory as a vault
flint-note init --id=project --name="Project Notes"

# Show current vault
flint-note current

# Update vault information
flint-note update work --name "Work & Research"

# Remove a vault (files not deleted)
flint-note remove work

# Delete a specific note
flint-note delete note "path/to/note.md"

# Delete a note type (with safety options)
flint-note delete note-type "reading" --action=error
flint-note delete note-type "old-project" --action=migrate --target="project"
flint-note delete note-type "deprecated" --action=delete --confirm

# Bulk delete notes matching criteria
flint-note delete notes --type="draft" --confirm
```

### System Prompts and Multi-Vault Context

When working with multi-vault systems, flint-note automatically provides context to AI agents about the current vault and its purpose. This enables intelligent, vault-aware assistance:

- **Current Vault Context**: All MCP tool responses include information about which vault is currently active
- **Vault-Specific Behavior**: Agents understand the purpose and context of each vault (work, personal, research, etc.)
- **Cross-Vault Awareness**: When switching vaults, agents maintain awareness of the transition and can help organize content appropriately
- **Contextual Suggestions**: Note creation and management suggestions are tailored to the current vault's purpose and existing content

## Agent Instructions System

The agent instructions system is a core feature that enables users to define specific behaviors and guidance for AI agents when working with different note types. This creates a personalized, context-aware experience where agents understand the purpose and conventions of each note category.

### How Agent Instructions Work

1. **Per-Note-Type Guidance**: Each note type can have its own set of agent instructions
2. **Automatic Context**: When agents work with notes, they automatically receive relevant instructions
3. **User-Customizable**: Instructions can be easily updated using natural language through the MCP interface
4. **Contextual Responses**: Note creation responses include agent instructions and helpful suggestions
5. **Vault-Aware Context**: Agent instructions automatically include current vault information and context
6. **Cross-Vault Intelligence**: When switching vaults, agents understand the transition and adapt their behavior accordingly

### Example Agent Instructions

```markdown
## Reading Notes
- Always ask about the author's background and credentials
- Extract key insights and actionable takeaways
- Ask for the user's personal rating and recommendation
- Suggest connections to previously read books

## Project Notes
- Always ask about project goals and success criteria
- Extract and track action items with owners and deadlines
- Suggest next steps and potential blockers
- Link to related project documentation

## Meeting Notes
- Extract attendees, decisions made, and action items
- Identify follow-up meetings or deadlines
- Suggest creating linked notes for action items
- Ask about meeting effectiveness and outcomes

## Note and Note Type Deletion

### Note Deletion
The system supports safe deletion of individual notes with the following features:

- **Soft deletion option**: Notes can be marked as deleted but preserved on filesystem
- **Hard deletion**: Permanent removal from filesystem
- **Confirmation requirement**: Deletion requires explicit confirmation to prevent accidents
- **Link validation**: Check for incoming links from other notes before deletion
- **Backup creation**: Automatic backup before deletion (configurable)

#### Deletion Process
1. Validate note exists and is accessible
2. Check for incoming links from other notes
3. Warn user about potential orphaned links
4. Require confirmation if links exist or if configured
5. Create backup if enabled
6. Remove note file and update any indexes

### Note Type Deletion
Deleting note types is more complex due to potential existing notes of that type:

#### Deletion Strategies
- **Error mode**: Prevent deletion if notes of this type exist
- **Migrate mode**: Convert existing notes to a different specified type
- **Delete mode**: Delete all notes of this type along with the type definition

#### Note Type Deletion Process
1. Validate note type exists
2. Count existing notes of this type
3. Based on selected action:
   - **Error**: Abort if notes exist, provide count and examples
   - **Migrate**: Validate target type exists and is compatible, convert all notes
   - **Delete**: Create backup of all notes, then delete notes and type definition
4. Update vault configuration to remove note type
5. Clean up any empty directories
6. Update search indexes

#### Safety Measures
- Mandatory confirmation for note type deletion
- Automatic backup creation before bulk operations
- Rollback capability for failed migrations
- Detailed logging of all deletion operations
- Prevention of deleting built-in note types (configurable)

## Metadata Schema System

The metadata schema system provides structured data validation and type safety for note frontmatter, enabling consistent data collection and intelligent agent interactions.

### How Metadata Schemas Work

1. **Type-Specific Schemas**: Each note type can define its own metadata schema with field definitions
2. **Automatic Validation**: Metadata is validated against the schema when creating or updating notes
3. **Rich Field Types**: Support for strings, numbers, booleans, dates, arrays, and select fields
4. **Constraint Validation**: Enforce min/max values, string patterns, and selection options
5. **Default Values**: Automatic generation of sensible defaults for required fields

### Supported Field Types

- **string**: Text fields with optional pattern validation
- **number**: Numeric fields with min/max constraints
- **boolean**: True/false fields
- **date**: ISO date strings with automatic validation
- **array**: Lists of values with optional length constraints
- **select**: Single choice from predefined options

### Schema Definition Format

Metadata schemas are defined in the note type's `_description.md` file:

```markdown
## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- title: Book title (required, string)
- author: Author name (required, string)
- rating: Personal rating (required, number, min: 1, max: 5)
- genre: Book genre (optional, string)
- isbn: ISBN number (optional, string, pattern: "^[0-9-]{10,17}$")
- status: Reading status (optional, select, options: ["to-read", "reading", "completed"])
- tags: Topic tags (optional, array)
- finished_date: Date completed (optional, date)
```

### Validation and Error Handling

- **Required Field Validation**: Ensures all required fields are present
- **Type Validation**: Verifies field values match expected types
- **Constraint Validation**: Enforces min/max, patterns, and selection options
- **Unknown Field Warnings**: Warns about fields not defined in schema
- **Helpful Error Messages**: Clear feedback when validation fails

## Architecture

### File System Structure

```
flint-note-workspace/
├── .flint-note/
│   ├── config.yml              # Global configuration
│   ├── search-index.json       # Search index cache
│   └── mcp-server.log         # MCP server logs
├── {note-type-1}/
│   ├── _description.md        # Type definition, agent instructions, and metadata schema
│   ├── note-1.md
│   └── note-2.md
├── {note-type-2}/
│   ├── _description.md
│   └── another-note.md
└── general/                   # Default note type
    ├── _description.md
    └── misc-thoughts.md
```

### Note Type Definition

Each note type directory contains a `_description.md` file that defines:

```markdown
# {Note Type Name}

## Purpose
Brief description of what this note type is for.

## Agent Instructions
- Specific behaviors agents should exhibit for this note type
- Auto-extraction rules (e.g., "extract action items from meeting notes")
- Linking suggestions (e.g., "link to related project notes")
- Content enhancement suggestions

## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- title: Note title (required, string)
- author: Author name (optional, string)
- rating: Personal rating (optional, number, min: 1, max: 5)
- status: Current status (optional, select, options: ["draft", "published", "archived"])
- tags: Relevant tags (optional, array)
- isbn: ISBN number (optional, string, pattern: "^[0-9-]{10,17}$")
- published_date: Publication date (optional, date)
```

### Note File Structure with Metadata

Individual notes are stored as Markdown files with YAML frontmatter containing structured metadata:

```markdown
---
title: "Atomic Habits"
author: "James Clear"
rating: 5
status: "completed"
tags: ["productivity", "habits", "self-improvement"]
isbn: "978-0735211292"
published_date: "2024-01-15T00:00:00Z"
type: "book-reviews"
created: "2024-01-15T10:30:00Z"
updated: "2024-01-15T10:30:00Z"
---

# Atomic Habits

## Summary
Excellent book about building good habits and breaking bad ones...

## Key Insights
- Small changes compound over time
- Focus on systems, not goals
- Environment design is crucial

## My Rating: 5/5
Would definitely recommend to anyone interested in personal development.
```

### MCP Server Interface

The flint-note MCP server exposes the following tools and resources:

#### Tools

| Tool Name | Purpose | Parameters |
|:----------|:--------|:-----------|
| **Vault Management** | | |
| `list_vaults` | List all configured vaults | none |
| `create_vault` | Create a new vault | `vault_id`, `name`, `path`, `description?` |
| `switch_vault` | Switch to a different vault | `vault_id` |
| `get_current_vault` | Show current vault information | none |
| `update_vault` | Update vault name or description | `vault_id`, `name?`, `description?` |
| `remove_vault` | Remove vault from registry (files preserved) | `vault_id` |
| **Note Management** | | |
| `create_note_type` | Create new note type with description | `type_name`, `description`, `agent_instructions?`, `metadata_schema?` |
| `create_note` | Create one or more notes | Single: `type`, `title`, `content`, `metadata?` OR Batch: `notes` (array) |
| `get_note` | Retrieve specific note | `identifier` |
| `update_note` | Update one or more existing notes | Single: `identifier`, `content?`, `metadata?` OR Batch: `updates` (array) |
| `search_notes` | Search notes by content/type | `query`, `type_filter?`, `limit?`, `use_regex?` |
| `list_note_types` | List all available note types | none |
| `link_notes` | Create explicit links between notes | `source`, `target`, `relationship?` |
| `update_note_type` | Update specific field of existing note type | `type_name`, `field` (instructions\|description\|metadata_schema), `value` |
| `get_note_type_info` | Get comprehensive note type information including agent instructions | `type_name` |
| `analyze_note` | Get AI analysis/suggestions for a note | `identifier` |
| `delete_note` | Delete an existing note permanently | `identifier`, `confirm?` |
| `delete_note_type` | Delete a note type and optionally handle existing notes | `type_name`, `action` (error\|migrate\|delete), `target_type?`, `confirm?` |

#### Resources

| Resource URI | Description | Content |
|:-------------|:------------|:--------|
| `flint-note://vaults` | All configured vaults | JSON list of vault configurations |
| `flint-note://current-vault` | Current active vault information | JSON with vault details and stats |
| `flint-note://types` | Available note types and descriptions | JSON list of types |
| `flint-note://recent` | Recently modified notes | JSON list of recent notes |
| `flint-note://stats` | Workspace statistics | JSON with counts, types, etc. |

## Batch Operations

Flint-note supports batch operations through the standard `create_note` and `update_note` tools. These tools accept either single note objects or arrays for batch processing, providing a unified API for both individual and bulk operations.

### Batch Note Creation

The `create_note` tool can create multiple notes by passing a `notes` array:

```json
{
  "name": "create_note",
  "arguments": {
    "notes": [
      {
        "type": "general",
        "title": "First Note",
        "content": "Content for the first note",
        "metadata": {
          "tags": ["batch", "import"],
          "priority": "high"
        }
      },
      {
        "type": "projects",
        "title": "Second Note", 
        "content": "Content for the second note"
      }
    ]
  }
}
```

**Features:**
- Creates notes atomically - each note creation is independent
- Supports metadata validation per note type
- Returns detailed results with success/failure status for each note
- Handles partial failures gracefully
- Updates search index for all successfully created notes

**Response Format:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "input": { /* original note input */ },
      "success": true,
      "result": {
        "id": "general/first-note.md",
        "type": "general",
        "title": "First Note",
        "filename": "first-note.md",
        "path": "/path/to/vault/general/first-note.md",
        "created": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

### Batch Note Updates

The `update_note` tool can update multiple notes by passing an `updates` array:

```json
{
  "name": "update_note", 
  "arguments": {
    "updates": [
      {
        "identifier": "general/first-note.md",
        "content": "Updated content"
      },
      {
        "identifier": "projects/second-note.md",
        "metadata": {
          "status": "completed",
          "priority": "low"
        }
      },
      {
        "identifier": "general/third-note.md",
        "content": "New content",
        "metadata": {
          "updated_by": "batch-operation"
        }
      }
    ]
  }
}
```

**Features:**
- Supports content-only, metadata-only, or combined updates
- Validates metadata against note type schemas
- Preserves existing metadata when updating content only
- Returns detailed results with success/failure status for each update
- Updates search index for all successfully modified notes

**Update Types:**
- **Content Only**: Preserves existing metadata, updates content
- **Metadata Only**: Preserves existing content, updates metadata
- **Combined**: Updates both content and metadata

### Single Note Operations

Both tools also support single note operations using the same API:

**Single Note Creation:**
```json
{
  "name": "create_note",
  "arguments": {
    "type": "general",
    "title": "My Note",
    "content": "Note content",
    "metadata": { "tags": ["example"] }
  }
}
```

**Single Note Update:**
```json
{
  "name": "update_note",
  "arguments": {
    "identifier": "general/my-note.md",
    "content": "Updated content",
    "metadata": { "updated": true }
  }
}
```

### Error Handling

Batch operations use a "fail-fast per item" approach:
- Each note/update operation is independent
- If one item fails, others continue processing
- Detailed error messages are provided for failed items
- Successful operations are completed even if others fail

**Common Error Scenarios:**
- Invalid note type names
- Missing required metadata fields
- Note identifier not found (for updates)
- Filename conflicts (for creation)
- Metadata validation failures

### Performance Considerations

- Batch operations are more efficient than individual API calls
- Search index is updated efficiently for all modified notes
- Memory usage scales linearly with batch size
- Recommended batch size: 50-100 notes per operation
- Large batches are automatically processed in chunks

## Vault Initialization

When flint-note initializes a new vault, it automatically creates several default note types to provide a comprehensive foundation for knowledge management. These pre-configured note types come with optimized agent instructions and metadata schemas.

### Default Note Types

#### Daily Notes
**Purpose**: Track daily events, reflections, and activities
**Directory**: `daily/`
**Agent Instructions**:
- Ask about key events and accomplishments from the day
- Encourage reflection on lessons learned or insights gained
- Help identify priorities for the next day
- Suggest connections to previous daily entries when relevant

**Metadata Schema**:
- `date`: Date of entry (required, date, format: YYYY-MM-DD)
- `mood`: Daily mood rating (optional, select, options: ["excellent", "good", "neutral", "challenging", "difficult"])
- `energy_level`: Energy level (optional, number, min: 1, max: 10)
- `tags`: Topics or themes (optional, array)

#### Reading Notes
**Purpose**: Track articles, papers, books, and other reading material
**Directory**: `reading/`
**Agent Instructions**:
- Always ask for author information and publication context
- Extract and organize key insights and takeaways
- Request a personal rating and ask what made it memorable
- Suggest connections to other readings or note types
- Encourage noting specific quotes with page/section references

**Metadata Schema**:
- `title`: Title of the material (required, string)
- `author`: Author or creator (required, string)
- `type`: Type of reading (required, select, options: ["book", "article", "paper", "blog_post", "documentation"])
- `status`: Reading status (required, select, options: ["to_read", "reading", "completed", "abandoned"])
- `rating`: Personal rating (required, number, min: 1, max: 5)
- `tags`: Categories or topics (optional, array)
- `isbn`: ISBN for books (optional, string)
- `url`: Web link for online content (optional, string)
- `published_date`: Publication date (optional, date)

#### Todo Lists
**Purpose**: Track tasks, action items, and things that need to be done
**Directory**: `todos/`
**Agent Instructions**:
- Help break down large tasks into smaller, actionable items
- Ask about priorities and deadlines
- Suggest realistic timeframes and dependencies
- Encourage regular status updates and progress tracking
- Connect related todos and identify recurring patterns

**Metadata Schema**:
- `title`: Task or todo list name (required, string)
- `priority`: Priority level (required, select, options: ["low", "medium", "high", "urgent"])
- `status`: Current status (required, select, options: ["not_started", "in_progress", "completed", "on_hold", "cancelled"])
- `due_date`: Target completion date (optional, date)
- `tags`: Categories or contexts (optional, array)
- `estimated_time`: Time estimate in minutes (optional, number, min: 1)

#### Project Tracking
**Purpose**: Track ongoing projects, goals, and long-term initiatives
**Directory**: `projects/`
**Agent Instructions**:
- Ask about project scope, goals, and success criteria
- Help identify key milestones and deadlines
- Encourage breaking projects into manageable phases
- Suggest resource gathering and stakeholder identification
- Track progress and help identify blockers or risks

**Metadata Schema**:
- `title`: Project name (required, string)
- `status`: Current status (required, select, options: ["planning", "active", "on_hold", "completed", "cancelled"])
- `priority`: Priority level (optional, select, options: ["low", "medium", "high"])
- `start_date`: Project start date (optional, date)
- `target_date`: Target completion date (optional, date)
- `team_members`: People involved (optional, array)
- `tags`: Project categories or skills (optional, array)

#### Goals Tracking
**Purpose**: Track long-term personal and professional goals
**Directory**: `goals/`
**Agent Instructions**:
- Help define specific, measurable, achievable goals
- Ask about motivation and personal significance
- Encourage breaking goals into smaller milestones
- Suggest regular check-ins and progress reviews
- Help identify potential obstacles and mitigation strategies
- Connect goals to daily actions and habits

**Metadata Schema**:
- `title`: Goal name (required, string)
- `category`: Goal category (required, select, options: ["personal", "professional", "health", "financial", "learning", "relationships"])
- `timeline`: Target timeframe (required, select, options: ["short_term", "medium_term", "long_term"])
- `status`: Current status (required, select, options: ["not_started", "in_progress", "achieved", "on_hold", "abandoned"])
- `target_date`: Target achievement date (optional, date)
- `progress`: Progress percentage (optional, number, min: 0, max: 100)
- `tags`: Related themes or skills (optional, array)

### Vault Initialization Process

1. **Create vault structure**: Initialize `.flint-note/` directory with configuration
2. **Generate default config**: Create `config.yml` with optimal defaults
3. **Create note type directories**: Set up folders for all default note types
4. **Generate description files**: Create `_description.md` for each note type with instructions and schemas
5. **Create welcome note**: Generate an introductory note explaining the vault structure and how to get started

## Technical Specifications

### Dependencies
- **Runtime**: Node.js 18+
- **MCP SDK**: @modelcontextprotocol/sdk
- **File Operations**: Node.js fs/promises
- **Search**: Simple text search with regex support, with plans for vector search
- **Configuration**: YAML parsing (js-yaml)

### Configuration Schema

#### Global Configuration (~/.flint-note/config.yml)
```yaml
# Global vault registry
vaults:
  work:
    name: "Work Notes"
    path: "~/work-notes"
    description: "Professional projects and meeting notes"
    last_used: "2024-01-15T10:30:00Z"
  personal:
    name: "Personal Journal"
    path: "~/personal-notes"
    description: "Personal thoughts, goals, and interests"
    last_used: "2024-01-14T20:15:00Z"

current_vault: "work"  # Currently active vault

mcp_server:
  port: 3000
  log_level: "info"
  auto_switch_vault: true  # Switch vault context based on MCP client requests
```

#### Per-Vault Configuration (.flint-note/config.yml in each vault)
```yaml
# Individual vault configuration
vault_id: "work"
workspace_root: "."
default_note_type: "general"
search:
  index_enabled: true
  index_path: ".jade-note/search-index.json"
note_types:
  auto_create_directories: true
  require_descriptions: true
metadata:
  validate_on_create: true
  validate_on_update: true
  strict_validation: false  # If true, unknown fields cause errors instead of warnings
deletion:
  require_confirmation: true  # Require explicit confirmation for all deletions
  create_backups: true  # Automatically backup notes before deletion
  backup_path: ".flint-note/backups"  # Where to store deletion backups
  allow_note_type_deletion: true  # Allow deletion of custom note types
  protect_builtin_types: true  # Prevent deletion of built-in note types
  max_bulk_delete: 10  # Maximum notes to delete in single note type deletion
```

### Error Handling
- Graceful handling of missing directories
- Validation of note type names (filesystem-safe)
- Concurrent file access protection
- MCP protocol error responses
- Regex validation and error handling for malformed patterns
- Metadata schema validation with detailed error messages
- Type coercion and constraint validation
- Unknown field warnings vs. errors based on configuration
- Note deletion safety checks and confirmation requirements
- Note type deletion with dependency validation
- Orphaned note handling during note type deletion

### Security Considerations
- Restrict file operations to workspace directory
- Validate all file paths to prevent directory traversal
- No execution of user-provided code
- Read-only access to system files
- Sanitize metadata field names and values
- Validate regex patterns in metadata constraints
- Prevent schema injection attacks through field definitions
- Secure deletion operations with proper authorization checks
- Prevent accidental deletion through confirmation requirements
- Audit logging for all deletion operations
- Rate limiting for bulk deletion operations
- Backup verification before permanent deletion

## Development Roadmap

### Current Status
The project has a comprehensive design document and core implementation with MCP server, note management, and metadata systems.

### Immediate Priorities (Fix Foundation)

#### **1. Verify Core Functionality**
- **Action**: Manual testing of all MVP features through MCP interface
- **Verify**: Note CRUD operations, note type management, search, metadata validation
- **Timeline**: 1 week
- **Success Criteria**: All core features work reliably

### Short-term Development (Next 2-4 weeks)

#### **2. Complete Phase 1 MVP Features**
- ✅ Basic note creation/reading/updating (implemented)
- ✅ Note type system (implemented)
- ✅ File-based storage (implemented)
- ✅ MCP server interface (implemented)
- ✅ metadata validation (implemented)
- ✅ search indexing (implemented)
- ✅ Unified batch operations through create_note and update_note tools (implemented)
- 🔄 Note and note type deletion with safety checks

#### **3. Improve Documentation with Real Examples**
- Add working copy-paste example commands
- Create troubleshooting guide with actual error messages
- Include screenshots/GIFs of system in action
- Test setup guide with fresh user

#### **4. Add Error Handling & Validation**
- Implement robust error messages for common mistakes
- Add validation for note type schemas
- Ensure graceful handling of malformed files
- Create user-friendly error reporting
- Implement safe deletion with confirmation and rollback capabilities
- Add validation for note dependencies before deletion

### Medium-term Goals (1-2 months)

#### **5. Agent Instructions System Enhancement**
- Implement dynamic agent instruction loading
- Create instruction library for common note types (meetings, books, projects)
- Test agent instruction effectiveness with multiple AI assistants
- Add instruction versioning and rollback

#### **6. Search & Discovery Improvements**
- Implement full-text search with relevance ranking
- Add tag-based filtering and faceted search
- Create smart suggestions for note connections
- Optimize search index performance

#### **7. User Experience Polish**
- Add progress feedback for long operations
- Improve error messages with actionable suggestions
- Create guided onboarding flow for new users
- Implement keyboard shortcuts and power-user features

### Long-term Vision (3+ months)

#### **8. Advanced Features**
- Full-text search with semantic similarity
- Note relationship visualization
- Batch operations on note collections
- Export/import functionality
- Plugin system for custom note types

#### **9. Community & Adoption**
- Create example workspaces for different use cases
- Build integrations with popular AI tools beyond MCP
- Develop community instruction and schema library
- Establish contribution guidelines and developer documentation

## Success Metrics

### MVP Success Criteria
- [x] Successfully create and manage note types through MCP
- [x] Agent instruction management and contextual guidance
- [x] Seamless integration with at least one MCP client
- [x] Basic search and retrieval functionality
- [x] File system remains clean and portable

### Long-term Success Indicators
- User retention and daily active usage
- Quality of agent suggestions and automations
- Speed and accuracy of search functionality
- Community adoption and contribution
- Metadata schema adoption and effectiveness
- Reduction in data entry errors through validation
- User satisfaction with structured data features

---

*This design document is a living document that evolves as the project develops.*
