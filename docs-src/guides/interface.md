# User Interface Guide

This guide walks you through Flint's interface, explaining each component and how to use it effectively.

## Overview: Three-Column Layout

Flint uses a **three-column layout** designed for efficient note-taking with AI assistance:

```
┌───────────────────────────────────────────────────────────────┐
│  Workspace Bar (Top)                                          │
├──────────────┬─────────────────────┬─────────────────────────┤
│              │                     │                         │
│   Left       │   Main View         │   Right Sidebar        │
│   Sidebar    │   (Editor)          │                         │
│              │                     │   ┌─────────────────┐  │
│  ┌────────┐  │  ┌──────────────┐   │   │                 │  │
│  │Pinned  │  │  │ Note Title   │   │   │  AI Agent       │  │
│  │Notes   │  │  ├──────────────┤   │   │                 │  │
│  │        │  │  │              │   │   │  [Chat input]   │  │
│  │ • Note │  │  │   Editor     │   │   │                 │  │
│  │ • Note │  │  │   Content    │   │   └─────────────────┘  │
│  │        │  │  │              │   │                         │
│  └────────┘  │  │              │   │   Metadata Editor      │
│              │  │              │   │   Backlinks            │
│  ┌────────┐  │  │              │   │   Suggestions          │
│  │Temp    │  │  │              │   │                         │
│  │Tabs    │  │  └──────────────┘   │                         │
│  │        │  │                     │                         │
│  │ × Tab  │  │                     │                         │
│  │ × Tab  │  │                     │                         │
│  └────────┘  │                     │                         │
│              │                     │                         │
└──────────────┴─────────────────────┴─────────────────────────┘
```

### Key Areas

1. **Workspace Bar** (top) - Vault selector, new note, search, settings
2. **Left Sidebar** - Navigation, pinned notes, temporary tabs
3. **Main View** - Note editor where you write
4. **Right Sidebar** - AI agent, metadata, backlinks

You can **resize** these sections by dragging the dividers between them.

## Workspace Bar

The workspace bar at the top provides global actions and navigation.

### Components

**Left side:**

- **Vault Selector** - Switch between vaults
- **System Views** - Access Daily, Inbox, Review, Workflows

**Center:**

- **Current note title** - Shows the active note

**Right side:**

- **New Note** (`Ctrl+Shift+N` / `Cmd+Shift+N`) - Create a note
- **Search** (`Ctrl+O` / `Cmd+O`) - Quick search overlay
- **Settings** - Application settings
- **Update Indicator** - Shows when updates are available

### Vault Selector

Click the vault name in the top-left to:

- See all your vaults
- Switch to a different vault
- Create a new vault

Each vault is completely isolated with its own:

- Notes and database
- AI conversation history
- Settings and preferences
- Pinned notes and tabs

## Left Sidebar: Navigation

The left sidebar provides quick access to your notes.

### Pinned Notes Section

**What are pinned notes?**

Pinned notes are notes you want constant access to. They appear at the top of the sidebar.

**How to pin a note:**

1. Right-click on a note anywhere in Flint
2. Select "Pin to Sidebar"
3. The note appears in the pinned section

Or click the pin icon when viewing a note.

**Organizing pinned notes:**

- **Drag to reorder** - Click and drag notes to change order
- **Unpin** - Right-click and select "Unpin"
- **Visual indicators** - Note type icons help identify notes

**Best practices:**

Pin notes you reference frequently:

- Today's daily note
- Active project notes
- Reference materials (style guide, templates)
- Important documents

**Limit to 5-10 pins** - Too many defeats the purpose of quick access.

### Temporary Tabs Section

**What are temporary tabs?**

Temporary tabs are like Arc browser's temporary tabs - ephemeral access to recently viewed notes.

**How they work:**

When you open a note via:

- **Search** (`Ctrl+O`) → Creates temporary tab
- **Wikilink** → Creates temporary tab
- **Pinned note** → Opens directly, no tab
- **Existing temporary tab** → Reuses that tab

**Features:**

- **Individual close buttons** - Click `×` to close a tab
- **"Close All" button** - Clear all temporary tabs at once
- **24-hour auto-cleanup** - Old tabs are removed automatically
- **Source tracking** - Remember how you opened each note

**Converting to permanent:**

If you want to keep a note accessible:

1. Right-click the temporary tab
2. Select "Pin to Sidebar"
3. It moves from temporary to pinned

**Why use temporary tabs?**

They keep your navigation history visible without cluttering your pinned notes. Perfect for:

- Notes you're referencing while writing
- Following a chain of wikilinks
- Working through search results

### System Views

Below pinned notes and tabs, you'll find quick access to:

- **Daily** - Jump to today's daily note
- **Inbox** - View uncategorized notes
- **Review** - Access spaced repetition review
- **Workflows** - Manage workflows and automations

### Workspaces Bar

**At the bottom of the left sidebar**, the workspaces bar lets you organize different contexts within your vault.

**What are workspaces?**

Workspaces are independent contexts that each have their own:

- Pinned notes
- Temporary tabs
- Visual identity (icon and name)

**Why use workspaces?**

Switch between projects, workflows, or focus areas without losing your place. Each workspace maintains its own set of open notes.

**Quick actions:**

- **Click workspace icon** - Switch to that workspace
- **Right-click workspace** - Edit or delete
- **Drag workspace icons** - Reorder
- **Click `+` button** - Create new workspace
- **Keyboard shortcuts** - `Ctrl+1` through `Ctrl+9` (or `Cmd` on Mac) switch to first 9 workspaces

**Examples:**

```
[📋] [📱] [🌐] [+]
 ↑    ↑    ↑    ↑
Daily Mobile Web  Add
(active)
```

**Learn more:** See the [Workspaces feature guide](/features/workspaces) for detailed information.

## Main View: Note Editor

The main view is where you create and edit notes.

### Editor Header

At the top of the editor:

**Left side:**

- **Note title** - Editable inline, press Enter to confirm
- **Note type dropdown** - Change the note's type
- **Type indicator** - Visual icon showing current type

**Right side:**

- **Pin button** - Pin/unpin this note
- **More actions** - Additional note operations

### Editor Area

The editor uses **CodeMirror 6** for professional editing:

**Features:**

- **Markdown syntax highlighting**
- **Auto-save** - Changes saved automatically after 1 second
- **Wikilink autocomplete** - Type `[[` to search for notes
- **Wikilink navigation** - Click links to follow them
- **Multi-cursor editing** - Hold `Ctrl/Cmd` to add cursors
- **Find/Replace** - `Ctrl+F` / `Cmd+F` to search

**Visual feedback:**

- **Saving indicator** - Shows "Saving..." when saving
- **Saved confirmation** - Brief "Saved" message
- **Conflict warning** - Alert if file changed externally

### Markdown Editing Tips

**Headers:**

```markdown
# Large Header

## Medium Header

### Smaller Header
```

**Text formatting:**

```markdown
**bold text**
_italic text_
`inline code`
```

**Lists:**

```markdown
- Bullet item
- Another item
  - Nested item

1. Numbered item
2. Another item
```

**Code blocks:**

````markdown
```javascript
function hello() {
  console.log('Hello!');
}
```
````

**Wikilinks:**

```markdown
[[Note Title]]
[[type/filename|Display Text]]
```

**Tables:**

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

## Right Sidebar: Agent and Metadata

The right sidebar contains tools for AI assistance and note management.

### Tabs

The right sidebar has multiple tabs:

1. **Agent** - AI agent chat
2. **Metadata** - YAML frontmatter editor
3. **Backlinks** - Notes linking to this note
4. **Suggestions** - AI-generated suggestions (if enabled)

Click the tab headers to switch between them.

### Agent Tab

The AI agent appears in this tab.

**Components:**

**Chat history:**

- Scrollable conversation with the AI
- Your messages and AI responses
- Tool calls shown inline with results

**Message input:**

- Text area for your messages
- `Ctrl+Enter` / `Cmd+Enter` to send
- Supports multi-line input

**Model selector:**

- Dropdown to choose AI model
- Shows current model and provider
- Cost estimates per message

**Conversation controls:**

- **New conversation** - Start fresh
- **Clear history** - Remove all messages
- **Export** - Save conversation

**Example usage:**

```
You: Find all meeting notes from last week

AI: [Searches notes]
    I found 3 meeting notes from last week:

    1. Team Standup (Jan 8)
    2. Client Review (Jan 9)
    3. Planning Session (Jan 12)

    Would you like me to summarize them?

You: Yes, create a summary note

AI: [Creates note]
    I've created "Weekly Meeting Summary" with key points...
```

See [AI Agent](/features/agent) for detailed capabilities.

### Metadata Tab

The metadata editor lets you edit YAML frontmatter visually.

**Features:**

- **Syntax highlighting** - YAML syntax colored
- **Real-time validation** - Errors highlighted instantly
- **Auto-save** - Changes saved on blur
- **Field types** - Strings, numbers, dates, arrays, booleans
- **Type hints** - Suggestions based on note type schema

**Example metadata:**

```yaml
---
title: Team Standup
type: meeting
date: 2024-01-15
attendees: [Sarah, John, Maria]
priority: high
tags: [weekly, standup]
---
```

**Common operations:**

**Add a field:**

```yaml
new_field: value
```

**Add a tag:**

```yaml
tags: [existing-tag, new-tag]
```

**Change date:**

```yaml
date: 2024-01-16
```

**Add array:**

```yaml
attendees:
  - Sarah
  - John
```

**Errors:**

If you make a syntax error (invalid YAML), the editor highlights the line and shows an error message. Fix the syntax to save.

### Backlinks Tab

Shows notes that link to the current note.

**What you see:**

For each backlink:

- **Note title** - Clickable to open
- **Context snippet** - Surrounding text showing how it links
- **Note type** - Visual indicator

**Example:**

```
Backlinks (3)

📄 Project Overview
  "...discussed in [[Team Standup]] meeting..."

✓ Action Items
  "...follow up from [[Team Standup]]..."

📅 Weekly Summary
  "...key points from [[Team Standup]]..."
```

**Why backlinks matter:**

They help you:

- See where this note is referenced
- Discover related context
- Navigate between connected ideas
- Find notes you forgot about

### Suggestions Tab

If the note type has AI suggestions enabled, this tab shows suggestions.

**What are suggestions?**

AI-generated recommendations for:

- Related notes to link
- Missing metadata to add
- Tasks to create
- Content to expand

**Actions:**

- **Accept** - Apply the suggestion
- **Dismiss** - Hide this suggestion
- **Regenerate** - Get new suggestions

See [Note Suggestions](/features/notes#suggestions) for more.

## Search Overlay

Press `Ctrl+O` / `Cmd+O` to open the global search overlay.

**Features:**

- **Instant search** - Results appear as you type
- **Fuzzy matching** - Finds notes even with typos
- **Title and content** - Searches both
- **Keyboard navigation** - Arrow keys to select, Enter to open
- **ESC to close** - Quick dismissal

**Search operators:**

```
type:meeting          Find meetings
tag:important         Find tagged notes
created:today         Today's notes
created:>2024-01-01   Notes after date
"exact phrase"        Exact match
```

**Example workflow:**

1. Press `Ctrl+O`
2. Type "project"
3. See all notes with "project" in title or content
4. Arrow down to select
5. Press Enter to open
6. Temporary tab created

See [Search and Discovery](/features/search) for advanced search.

## Settings Panel

Click the **Settings** icon to access application settings.

### Settings Sections

**Appearance:**

- Theme (light/dark/system)
- Font preferences
- Layout settings

**API Keys:**

- OpenRouter API key
- Secure keychain storage
- Validation indicators

**Database:**

- Rebuild database from files
- Database statistics

**Updates:**

- Current version
- Check for updates
- View changelog
- Update channel (stable/canary)

See [Configuration](/guides/configuration) for detailed settings.

## Status Indicators

Visual feedback throughout the interface:

### Saving Indicators

**In editor header:**

- **"Saving..."** - Note is being saved
- **"Saved"** - Save completed successfully
- **"Conflict"** - External edit detected

### Update Indicator

**In workspace bar:**

- **Green dot** - Update available
- **Click to view** - Shows update details

### AI Activity

**In Agent tab:**

- **Typing indicator** - AI is responding
- **Tool execution** - Shows which tool is running
- **Progress bars** - For long operations

## Keyboard Shortcuts

Essential shortcuts for productivity:

### Global

| Shortcut                       | Action          |
| ------------------------------ | --------------- |
| `Ctrl+Shift+N` / `Cmd+Shift+N` | New note        |
| `Ctrl+O` / `Cmd+O`             | Search overlay  |
| `Ctrl+K` / `Cmd+K`             | Toggle AI agent |
| `Ctrl+,` / `Cmd+,`             | Settings        |

### Editor

| Shortcut                   | Action                        |
| -------------------------- | ----------------------------- |
| `Ctrl+F` / `Cmd+F`         | Find in note                  |
| `Ctrl+H` / `Cmd+H`         | Replace                       |
| `Ctrl+S` / `Cmd+S`         | Save (auto-save handles this) |
| `Ctrl+Enter` / `Cmd+Enter` | Submit (in chat/review)       |

### Navigation

| Shortcut           | Action      |
| ------------------ | ----------- |
| `Ctrl+[` / `Cmd+[` | Go back     |
| `Ctrl+]` / `Cmd+]` | Go forward  |
| Click wikilink     | Follow link |

## Customization

### Resizing Panels

**Drag dividers** between sections:

- Between left sidebar and main view
- Between main view and right sidebar

Your preferred sizes are saved per vault.

### Collapsing Sidebars

- Click the chevron icons to collapse sidebars
- Double-click divider to toggle
- Focus on writing when you need it

### Theme

Choose your theme in Settings:

- **Light** - Always light mode
- **Dark** - Always dark mode
- **System** - Follow OS preference

## Tips for Effective Use

### Left Sidebar

- Keep **5-10 pinned notes** maximum
- Use temporary tabs for exploration
- Pin your daily note and active projects
- Close temporary tabs when done

### Main View

- Use **full-width** when writing
- Collapse sidebars for focused work
- Use wikilinks liberally as you write
- Let auto-save handle saving

### Right Sidebar

- Keep **Agent tab** open when organizing
- Switch to **Metadata** when adding structure
- Check **Backlinks** to find connections
- Use **Suggestions** for ideas

### Keyboard-First

Power users can work mostly keyboard-driven:

1. `Ctrl+Shift+N` - New note
2. Write with markdown and wikilinks
3. `Ctrl+K` - Ask AI to organize
4. `Ctrl+O` - Search for next note
5. Repeat

## Next Steps

Now that you understand the interface:

- **[Note Management](/features/notes)** - Learn about note types and metadata
- **[Search and Discovery](/features/search)** - Master search techniques
- **[AI Agent](/features/agent)** - Use AI effectively
- **[Wikilinks](/features/wikilinks)** - Build connected knowledge

---

**Remember:** The interface is designed to stay out of your way. Focus on capturing and connecting ideas—the tools are there when you need them.
