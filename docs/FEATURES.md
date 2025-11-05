# Flint Features Guide

A comprehensive guide to all features in Flint, the AI-powered note-taking application designed as a thinking system.

## Table of Contents

- [Core Note Management](#core-note-management)
- [AI Assistant Integration](#ai-assistant-integration)
- [Workflow Automation](#workflow-automation)
- [Custom Functions](#custom-functions)
- [Organizational Features](#organizational-features)
- [Search and Discovery](#search-and-discovery)
- [Link Management](#link-management)
- [Daily Notes System](#daily-notes-system)
- [Inbox System](#inbox-system)
- [Multi-Vault Support](#multi-vault-support)
- [Editor Features](#editor-features)
- [System Features](#system-features)

---

## Core Note Management

### Note Creation and Editing

**Purpose:** Create and manage markdown notes with optional YAML frontmatter.

**Key Features:**
- Create notes with customizable note types
- Full markdown support with live preview
- YAML frontmatter for structured metadata
- Content hashing for change detection
- Automatic save functionality

**Usage:**
- Press `Ctrl+Shift+N` to create a new note
- Select note type from dropdown
- Write content in markdown
- Metadata automatically saved

**Technical Details:**
- Notes stored as `.md` files in type-specific directories
- SQLite database tracks metadata and indexes
- Content hash prevents concurrent edit conflicts
- Location: `src/server/core/note-manager.ts`

### Note Types

**Purpose:** Define schemas and behaviors for different categories of notes.

**Key Features:**
- Custom note type creation
- Metadata schemas with validation
- Agent instructions per type
- Visual type indicators (icons)
- Template support for new notes

**Built-in Types:**
- **General** - Default note type for any content
- **Daily** - Daily journal entries
- **Meeting** - Meeting notes with attendees
- **Task** - Action items with status tracking
- **Project** - Project documentation

**Custom Type Creation:**
Via AI assistant or Settings:
```
"Create a new note type called 'book-notes' with fields for author,
publication date, and rating"
```

**Technical Details:**
- Defined in `{vault}/.note-types/` directory
- Markdown format with structured sections
- Location: `src/server/core/note-type-manager.ts`

### Metadata Editor

**Purpose:** Edit structured note metadata using YAML frontmatter.

**Key Features:**
- Visual YAML editor with syntax highlighting
- Real-time validation
- Field-specific types (string, number, date, array, boolean)
- Custom field addition
- Error highlighting with line numbers
- Auto-save on changes

**Supported Field Types:**
```yaml
---
title: "My Note"
created: 2024-01-15T10:30:00Z
tags: ['important', 'project']
priority: 5
completed: false
due_date: 2024-01-20
custom_field: "Any value"
---
```

**Technical Details:**
- Component: `src/renderer/src/components/MetadataEditor.svelte`
- Uses `js-yaml` for parsing
- Validates against note type schemas

---

## AI Assistant Integration

### Chat Interface

**Purpose:** Natural language interaction with AI for note operations and thinking assistance.

**Key Features:**
- Streaming responses with real-time updates
- Conversation history per vault
- Context-aware suggestions
- Tool call execution
- Multi-model support (Claude, GPT, etc.)
- Cost tracking per conversation
- Message editing and regeneration

**Model Context Protocol (MCP) Tools:**

The AI has access to comprehensive note operations via MCP:

**Note Operations:**
- `create_note` - Create new notes
- `read_note` - Read note content
- `update_note` - Modify existing notes
- `delete_note` - Remove notes
- `list_notes` - List notes by type
- `search_notes` - Full-text search
- `rename_note` - Rename with link updates
- `move_note` - Change note type

**Note Type Operations:**
- `create_note_type` - Define new types
- `list_note_types` - View available types
- `update_note_type` - Modify type schemas

**Link Operations:**
- `get_backlinks` - Find notes linking to current note
- `find_broken_links` - Detect broken wikilinks
- `get_note_links` - Get all links for a note

**Vault Operations:**
- `list_vaults` - View all vaults
- `switch_vault` - Change active vault
- `create_vault` - Initialize new workspace

**Usage Patterns:**

```
User: "Create a project note for the website redesign with
       high priority and due date next Friday"

AI: [Creates note with metadata]

User: "Find all notes mentioning API design"

AI: [Searches and lists relevant notes]
```

**Technical Details:**
- Service: `src/main/ai-service.ts`
- MCP Client connects to `@flint-note/server` via stdio
- Streaming via AI SDK
- Store: `src/renderer/src/stores/unifiedChatStore.svelte.ts`

### Task Management

**Purpose:** Track AI agent tasks and their execution status.

**Key Features:**
- Automatic task extraction from tool calls
- Visual status indicators:
  - ✓ Completed
  - ⟳ In Progress
  - ○ Pending
- Expandable task details
- Related note links (clickable)
- Task grouping by conversation
- Progress tracking

**How It Works:**

When AI uses tools, tasks are automatically created:

```
User: "Create meeting notes for today and summarize
       yesterday's notes"

AI executes two tasks:
[⟳] Creating meeting note...
[✓] Meeting note created: meetings/2024-01-15.md
[⟳] Summarizing yesterday's notes...
[✓] Summary complete
```

**Technical Details:**
- Extracted from MCP tool calls
- Displayed in `AIAssistant.svelte`
- Stored in conversation history

### Prompt Caching

**Purpose:** Reduce costs and latency by caching system prompts and conversation history.

**Key Features:**
- Automatic system message caching
- Conversation history caching
- Cache hit tracking and metrics
- Configurable cache thresholds
- Real-time savings calculation
- Performance recommendations

**Cache Metrics:**
- Cache hits vs misses
- Tokens saved
- Cost savings in micro-cents
- Optimization suggestions

**Technical Details:**
- Service: `src/main/ai-service.ts`
- Uses Anthropic's prompt caching API
- Configurable via settings

---

## Workflow Automation

**Purpose:** Create repeatable AI-assisted automation sequences.

**Key Features:**
- Visual workflow builder (planned)
- Pre-built workflows for common tasks
- Step-by-step execution
- Context preservation across steps
- Error handling and retry logic
- Workflow templates

**Built-in Workflows:**

**Daily Review:**
```
1. Search for notes created today
2. AI summarizes key points
3. Create summary note
4. Link to daily note
```

**Weekly Planning:**
```
1. Review incomplete tasks
2. AI suggests priorities
3. Create weekly plan
4. Schedule items
```

**Research Synthesis:**
```
1. Gather notes by tag
2. AI identifies themes
3. Create synthesis document
4. Generate connections
```

**Creating Custom Workflows:**

Via AI assistant:
```
User: "Create a workflow called 'monthly-review' that finds all
       notes from the past month, groups them by type, and creates
       a summary report"
```

**Technical Details:**
- Service: `src/main/workflow-service.ts`
- Store: `src/renderer/src/stores/workflowStore.svelte.ts`
- UI: `src/renderer/src/components/ConversationStartWorkflowPanel.svelte`

---

## Custom Functions

**Purpose:** User-defined JavaScript functions that extend AI capabilities.

**Key Features:**
- Write custom JavaScript functions
- Available as tools to AI
- Secure sandbox execution (QuickJS)
- Access to note data
- Return structured data
- Code editor with syntax highlighting
- Function testing interface

**Example Custom Function:**

```javascript
// Function: calculateReadingTime
function calculateReadingTime(noteContent) {
  const words = noteContent.split(/\s+/).length;
  const wordsPerMinute = 200;
  const minutes = Math.ceil(words / wordsPerMinute);
  return {
    words: words,
    readingTime: minutes,
    message: `~${minutes} min read`
  };
}
```

**Usage:**

```
User: "Calculate the reading time for my project overview note"

AI: [Calls custom function with note content]
    "This note has 1,234 words and takes about 7 minutes to read"
```

**Security:**
- Sandboxed execution prevents file system access
- Limited API surface
- Timeout protection
- Memory limits

**Technical Details:**
- Evaluation: `src/main/enhanced-evaluate-note-code.ts`
- Storage: `src/renderer/src/stores/customFunctionsStore.svelte.ts`
- Editor: `src/renderer/src/components/custom-functions/`

---

## Organizational Features

### Pinned Notes

**Purpose:** Quick access to frequently used notes.

**Key Features:**
- Pin/unpin any note
- Persistent across sessions
- Visual indicators by note type
- Drag-and-drop reordering
- Vault-specific pinning
- Quick navigation

**Usage:**
- Right-click note → "Pin to Sidebar"
- Drag to reorder
- Click to open

**Technical Details:**
- Stored in `{userData}/pinned-notes/{vaultId}.json`
- Store: `src/renderer/src/stores/sidebarNotesStore.svelte.ts`

### Temporary Tabs

**Purpose:** Arc browser-style temporary note access for recently viewed notes.

**Key Features:**
- Automatic tab creation on note open
- Source tracking (search, wikilink, navigation)
- Individual close buttons
- Bulk close all
- 24-hour automatic cleanup
- Session persistence

**How It Works:**

Opening a note from:
- **Search** → Creates temporary tab
- **Wikilink** → Creates temporary tab
- **Pinned note** → Opens directly, no tab
- **Temporary tab** → Reuses tab

**Making Permanent:**
- Pin the note to remove from temporary tabs

**Technical Details:**
- Service: `src/renderer/src/stores/temporaryTabsStore.svelte.ts`
- Persisted: `vault-data/{vaultId}/temporary-tabs.json`
- Cleanup: Runs on app start and periodically

### Navigation History

**Purpose:** Browser-style back/forward navigation through notes.

**Key Features:**
- Full history stack
- Forward/back buttons (planned)
- Jump to specific history entry
- Preserves scroll position
- Vault-scoped history
- Persistent across sessions

**Technical Details:**
- Store: `src/renderer/src/stores/navigationHistoryStore.svelte.ts`
- Persisted: `vault-data/{vaultId}/navigation-history.json`

---

## Search and Discovery

### Full-Text Search

**Purpose:** Find notes by content, title, or metadata.

**Key Features:**
- Fast SQLite FTS5 search
- Fuzzy matching
- Type filtering
- Tag filtering
- Date range filtering
- Regex support
- Result highlighting
- Relevance scoring

**Search Operators:**

```
basic search          - Match any field
type:meeting         - Filter by type
tag:important        - Filter by tag
created:today        - Today's notes
created:2024-01-15   - Specific date
created:>2024-01-01  - Date range
"exact phrase"       - Exact match
```

**Advanced Search:**

Via API or AI assistant:
```typescript
await api.searchNotesAdvanced({
  query: 'project planning',
  types: ['project', 'meeting'],
  tags: ['important'],
  created_after: '2024-01-01',
  limit: 20
});
```

**Technical Details:**
- Manager: `src/server/core/hybrid-search-manager.ts`
- SQLite FTS5 for full-text indexing
- Keyboard shortcut: `Ctrl+O`

### Global Search Overlay

**Purpose:** Quick note access from anywhere.

**Key Features:**
- Keyboard-activated (`Ctrl+O`)
- Instant search results
- Fuzzy title matching
- Recent notes prioritized
- Click or Enter to open
- ESC to close

**Technical Details:**
- Component: `src/renderer/src/components/SearchOverlay.svelte` (likely)
- Overlays entire application

---

## Link Management

### Wikilinks

**Purpose:** Create bidirectional connections between notes.

**Syntax:**

**Title-based links:**
```markdown
[[Note Title]]
```

**Path-based links:**
```markdown
[[type/filename|Display Text]]
[[projects/website-redesign|Website Project]]
```

**Features:**
- Click-to-navigate
- Automatic backlink tracking
- Broken link detection
- Link renaming on note rename
- Link updating on note move

### Backlinks

**Purpose:** Discover notes that reference the current note.

**Key Features:**
- Automatic backlink tracking
- Visual backlink panel
- Context snippets
- Click to navigate
- Real-time updates

**Display:**
```
Backlinks (3):
- projects/website-redesign
  "... discussed in [[meeting-notes]] with team..."
- tasks/follow-up
  "... action items from [[meeting-notes]]"
```

**Technical Details:**
- Component: `src/renderer/src/components/Backlinks.svelte`
- Database table: `note_links`
- Auto-populated on note update

### Broken Link Detection

**Purpose:** Find and fix wikilinks to non-existent notes.

**Features:**
- Automatic detection
- Broken link report
- Suggestions for fixes
- Bulk operations (via AI)

**Technical Details:**
- Query: `findBrokenLinks()` in API
- Highlighted in editor

---

## Daily Notes System

**Purpose:** Dedicated interface for daily journal entries.

**Key Features:**
- Calendar-style day navigation
- Automatic daily note creation
- Day sections (Morning, Afternoon, Evening)
- Time-stamped entries
- Quick capture interface
- Day-at-a-glance view
- Past days browsing

**Daily Note Structure:**

```markdown
---
type: daily
date: 2024-01-15
---

## Morning
- Started project planning
- Team standup meeting

## Afternoon
- [[Website Redesign]] progress
- Code review

## Evening
- Planning for tomorrow
```

**Features:**
- Navigate by calendar
- Quick add button
- Section templates
- Related note linking
- Activity timeline

**Technical Details:**
- View: `src/renderer/src/components/DailyView.svelte`
- Store: `src/renderer/src/stores/dailyViewStore.svelte.ts`
- Note type: `daily`

---

## Inbox System

**Purpose:** Frictionless note capture with gradual organization.

**Key Features:**
- Quick capture interface
- Zero-friction note creation
- "Inbox Zero" workflow
- Process notes later
- Batch operations
- Smart suggestions for organization

**Workflow:**

1. **Capture** - Write without thinking about organization
2. **Review** - Periodically review inbox
3. **Process** - Move to appropriate types/locations
4. **Archive** - Clear inbox

**AI Assistance:**

```
User: "Help me organize my inbox"

AI: [Reviews inbox notes]
    "I found 12 inbox notes:
    - 3 look like meeting notes → move to 'meetings'
    - 5 are task items → move to 'tasks'
    - 4 are ideas → move to 'general'"
```

**Technical Details:**
- View: `src/renderer/src/components/InboxView.svelte`
- Store: `src/renderer/src/stores/inboxStore.svelte.ts`
- Note type: `inbox`

---

## Multi-Vault Support

**Purpose:** Separate workspaces for different contexts (work, personal, etc.).

**Key Features:**
- Multiple isolated vaults
- Independent note collections
- Separate settings per vault
- Vault switching
- Vault creation wizard
- Vault metadata (name, description)

**Use Cases:**
- **Work** - Professional notes
- **Personal** - Personal journal
- **Research** - Academic research
- **Projects** - Specific project workspaces

**Vault Isolation:**
- Separate directories
- Independent databases
- Isolated search indexes
- Separate conversation histories
- Independent settings

**Creating Vaults:**

Via UI:
1. Click vault selector
2. "Create New Vault"
3. Choose location and name
4. Initialize with default types

Via AI:
```
User: "Create a new vault called 'Research' for academic notes"
```

**Technical Details:**
- Manager: `src/server/core/workspace-manager.ts`
- Vault registry: `{userData}/vaults.json`
- Each vault has own directory and SQLite database

---

## Editor Features

### CodeMirror Integration

**Purpose:** Professional-grade markdown editing experience.

**Key Features:**
- Syntax highlighting
- Line numbers (optional)
- Code folding
- Auto-indentation
- Multi-cursor editing
- Find and replace
- Keyboard shortcuts
- Theme support (light/dark)

**Markdown Features:**
- Live syntax highlighting
- Link detection
- Code block highlighting
- Header folding
- List management
- Table support

**Customization:**
- Font size adjustment
- Line height control
- Theme selection
- Vim mode (optional)
- Emacs keybindings (optional)

**Technical Details:**
- Component: `src/renderer/src/components/CodeMirrorEditor.svelte`
- Store: `src/renderer/src/stores/editorConfig.svelte.ts`
- Extensions: CodeMirror 6 packages

### Auto-Save

**Purpose:** Never lose work with automatic saving.

**Key Features:**
- Debounced saves (reduces writes)
- Visual save indicators
- Conflict detection
- Content hashing
- Error recovery

**Behavior:**
- Saves after 1 second of inactivity
- Shows "Saving..." indicator
- Shows "Saved" confirmation
- Handles concurrent edits

**Technical Details:**
- Store: `src/renderer/src/stores/autoSave.svelte.ts`
- Debounce time: 1000ms

### External Edit Detection

**Purpose:** Handle notes edited outside the application.

**Key Features:**
- File system watching
- Conflict notification
- Choose which version to keep
- Diff view (planned)
- Auto-reload option

**Conflict Resolution:**
- Keep app version
- Use file version
- Merge manually

**Technical Details:**
- Component: `src/renderer/src/components/ExternalEditConflictNotification.svelte`
- Watcher: `chokidar` library

---

## System Features

### Auto-Updater

**Purpose:** Seamless application updates.

**Key Features:**
- Automatic update checking
- Background downloads
- Update notifications
- Release notes display
- Restart to update
- Rollback support
- Channel support (stable, canary)

**Update Channels:**
- **Stable** - Production releases
- **Canary** - Bleeding edge features

**User Experience:**
1. App checks for updates on start
2. Downloads in background if available
3. Shows notification when ready
4. User chooses when to restart
5. Update applies on restart

**Technical Details:**
- Service: `src/main/auto-updater-service.ts`
- Uses `electron-updater`
- Component: `src/renderer/src/components/ChangelogViewer.svelte`

### Settings Management

**Purpose:** Centralized application configuration.

**Key Features:**
- Global settings (all vaults)
- Vault-specific settings
- API key management (secure)
- Model preferences
- UI preferences
- Editor preferences
- Keyboard shortcuts (planned)

**Settings Categories:**

**Appearance:**
- Theme (light/dark/system)
- Font size
- Layout preferences
- Sidebar visibility defaults

**Editor:**
- Line numbers
- Word wrap
- Tab size
- Auto-save interval

**AI:**
- Default model
- Model per vault
- Cache preferences
- Cost limits (planned)

**Privacy:**
- Telemetry (opt-in)
- Crash reports

**Technical Details:**
- Store: `src/renderer/src/stores/settingsStore.svelte.ts`
- Persisted: `settings/app-settings.json`
- Secure keys: OS keychain via `secure-storage-service`

### Slash Commands

**Purpose:** Quick actions via `/` commands.

**Key Features:**
- Custom command creation
- Predefined commands
- Command templates
- Variable substitution
- AI integration

**Built-in Commands:**
```
/today        - Open today's daily note
/inbox        - Jump to inbox
/search       - Open search
/new [type]   - Create note of type
```

**Custom Commands:**

Create via settings:
```
Command: /standup
Action: Create a note with standup template
Template:
  ## What I did yesterday

  ## What I'm doing today

  ## Blockers
```

**Technical Details:**
- Store: `src/renderer/src/stores/slashCommandsStore.svelte.ts`
- Persisted: `settings/slash-commands.json`

### First-Time Experience

**Purpose:** Onboard new users smoothly.

**Key Features:**
- Welcome wizard
- Vault setup
- Sample notes
- Feature tour
- Settings guidance
- API key setup help

**Flow:**
1. Welcome screen
2. Create first vault
3. Optional sample content
4. Configure AI (optional)
5. Quick tutorial
6. Start using Flint

**Technical Details:**
- Component: `src/renderer/src/components/FirstTimeExperience.svelte`
- Tracks completion state

### Activity Monitoring

**Purpose:** Track AI agent activity and system operations.

**Key Features:**
- Real-time activity feed
- Operation history
- Error logging
- Performance metrics
- Debug information

**Widget Display:**
- Current operations
- Recent completions
- Error notifications
- Resource usage

**Technical Details:**
- Component: `src/renderer/src/components/AgentActivityWidget.svelte`
- Real-time updates via IPC events

---

## Developer Features

### Code Evaluation

**Purpose:** Execute JavaScript code in notes safely.

**Key Features:**
- Secure sandboxed execution
- QuickJS runtime
- Timeout protection
- Memory limits
- Access to note context
- Return structured data

**Use Cases:**
- Data transformations
- Calculations
- Custom logic
- Report generation

**Technical Details:**
- Service: `src/main/enhanced-evaluate-note-code.ts`
- Sandbox: QuickJS WebAssembly

### Debug Tools

**Purpose:** Development and debugging capabilities.

**Key Features:**
- Message bus inspector
- IPC message logging
- Store state viewer
- Performance profiler
- Error tracking

**Technical Details:**
- Component: `src/renderer/src/components/MessageBusDebugPanel.svelte`

---

## Summary

Flint provides a comprehensive feature set for AI-assisted note-taking:

**Core Strengths:**
- ✅ Powerful AI integration via MCP
- ✅ Flexible organization (types, vaults, links)
- ✅ Automation (workflows, custom functions)
- ✅ Professional editor (CodeMirror 6)
- ✅ Local-first with auto-update

**Feature Philosophy:**
Every feature is designed to enhance human thinking, not replace it. AI assists with structure and automation while humans maintain control over content and meaning.

For implementation details, see the architecture documentation in `docs/architecture/`.
