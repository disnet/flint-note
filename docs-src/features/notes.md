# Note Management

Learn everything about creating, organizing, and managing notes in Flint.

## Creating Notes

### Quick Creation

**Keyboard shortcut:**
- Press `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (Mac)

**From workspace bar:**
- Click the "New Note" button in the top-right

**Via AI:**
```
You: Create a project note for the website redesign

AI: [Creates projects/website-redesign.md with appropriate metadata]
```

### Choosing a Note Type

When creating a note, you'll select a **note type** that determines:
- Which folder the note is stored in
- What metadata fields are available
- Any template content
- AI instructions for helping with this type

See [Note Types](#note-types) below for details.

### Auto-Save

Flint automatically saves your notes:

- **Trigger**: 1 second after you stop typing
- **Indicator**: Brief "Saving..." message
- **Confirmation**: "Saved" appears when complete
- **No manual save needed**: Just write and move on

**External edit detection:**

If you edit a note outside Flint (in another editor), Flint detects the change and prompts you to:
- Keep the app version
- Use the file version
- Manually merge changes

## Writing in Markdown

Flint notes use **standard markdown** syntax.

### Basic Formatting

**Text styles:**
```markdown
**bold text**
*italic text*
~~strikethrough~~
`inline code`
```

Result: **bold text**, *italic text*, ~~strikethrough~~, `inline code`

**Headers:**
```markdown
# H1 - Largest Header
## H2 - Section Header
### H3 - Subsection
#### H4 - Smaller
```

### Lists

**Bullet lists:**
```markdown
- First item
- Second item
  - Nested item
  - Another nested
- Back to top level
```

**Numbered lists:**
```markdown
1. First step
2. Second step
   1. Sub-step
   2. Another sub-step
3. Third step
```

**Task lists:**
```markdown
- [ ] Incomplete task
- [x] Completed task
- [ ] Another todo
```

### Links

**Wikilinks** (to other notes):
```markdown
[[Note Title]]
[[type/filename|Display Text]]
```

**External links:**
```markdown
[Link text](https://example.com)
[Link with title](https://example.com "Hover title")
```

**Images:**
```markdown
![Alt text](path/to/image.png)
```

### Code

**Inline code:**
```markdown
Use the `createNote()` function.
```

**Code blocks:**
````markdown
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

**Supported languages:**
- JavaScript, TypeScript, Python, Go, Rust
- JSON, YAML, Markdown, HTML, CSS
- And many more...

### Tables

```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

Left-aligned  | Center-aligned | Right-aligned
:---          | :---:          | ---:
Left          | Center         | Right
```

### Quotes

```markdown
> This is a blockquote.
> It can span multiple lines.
>
> > Nested quotes work too.
```

### Horizontal Rules

```markdown
---
***
___
```

All create horizontal lines.

## Note Metadata (Frontmatter)

Metadata provides **structured data** about your note using YAML frontmatter.

### What is Frontmatter?

YAML frontmatter appears at the **very start** of your note, enclosed in `---`:

```markdown
---
title: Team Standup
type: meeting
date: 2024-01-15
attendees: [Sarah, John, Maria]
priority: high
tags: [weekly, standup]
---

# Meeting content starts here

Notes from today's standup...
```

### Editing Metadata

**Two ways to edit:**

1. **Metadata tab** (right sidebar):
   - Visual YAML editor
   - Syntax highlighting
   - Real-time validation
   - Auto-complete for fields

2. **Directly in note**:
   - Edit the YAML at the top
   - Syntax must be valid
   - Changes save automatically

### Common Metadata Fields

**System fields** (auto-managed):
```yaml
title: Note Title        # Note title
type: general           # Note type
created: 2024-01-15T... # Creation timestamp
updated: 2024-01-15T... # Last modified
filename: my-note.md    # File name
```

**Organizational fields:**
```yaml
tags: [tag1, tag2]      # Tags array
priority: high          # Priority level
status: active          # Current status
```

**Date fields:**
```yaml
date: 2024-01-15        # ISO date
due_date: 2024-01-20    # Due date
start_date: 2024-01-10  # Start date
```

**Custom fields:**

You can add any field you want:
```yaml
author: Sarah
rating: 4.5
category: technical
is_public: true
related_projects: [proj1, proj2]
```

### Field Types

YAML supports multiple data types:

**String:**
```yaml
title: My Note
description: A longer description
```

**Number:**
```yaml
priority: 5
rating: 4.5
```

**Boolean:**
```yaml
completed: true
archived: false
```

**Array:**
```yaml
tags: [tag1, tag2, tag3]
# Or multi-line:
attendees:
  - Sarah
  - John
  - Maria
```

**Date:**
```yaml
date: 2024-01-15
created: 2024-01-15T10:30:00Z
```

**Object** (nested):
```yaml
metadata:
  source: meeting
  location: office
  duration: 60
```

## Note Types

Note types define schemas and behaviors for different categories of notes.

### Built-in Note Types

Flint includes several default types:

#### General
- **Purpose**: Any content that doesn't fit other types
- **Fields**: Just title and tags
- **Use for**: Ideas, thoughts, general notes

#### Daily
- **Purpose**: Daily journal entries
- **Fields**: date (auto-set to today)
- **Use for**: Journaling, daily logs
- **Special**: Integrated with Daily View

#### Meeting
- **Purpose**: Meeting notes
- **Fields**:
  - `date` - Meeting date
  - `attendees` - Array of participants
- **Use for**: Meeting minutes, standups, reviews

#### Task
- **Purpose**: Action items and todos
- **Fields**:
  - `status` - pending/in-progress/completed
  - `due_date` - When it's due
  - `priority` - Importance level
- **Use for**: Tasks, action items

#### Project
- **Purpose**: Project documentation
- **Fields**:
  - `status` - active/on-hold/completed
  - `start_date` - Project start
- **Use for**: Project overviews, plans

#### Inbox
- **Purpose**: Quick capture without organization
- **Fields**: Minimal (title only)
- **Use for**: Rapid idea capture
- **Special**: Integrated with Inbox View

### Creating Custom Note Types

You can create custom note types for specific needs.

**Via AI Agent:**

```
You: Create a note type called "book-notes" with fields for:
     - author (string)
     - publication_year (number)
     - rating (number, 1-5)
     - genre (array of strings)
     - finished_reading (boolean)

AI: I'll create the book-notes type with those fields.
    [Creates .note-types/book-notes/book-notes.md]

    The new type is ready. Create a book note with:
    "Create a book-notes note for [book title]"
```

**Via Settings:**

1. Go to Settings
2. Navigate to "Note Types"
3. Click "Create Note Type"
4. Define:
   - Type name
   - Description
   - Metadata schema
   - Template content
   - AI instructions

**Manual creation:**

Create a file at `.note-types/[type-name]/[type-name].md`:

```markdown
# Book Notes

## Description

Template for book reading notes with metadata for tracking reading progress.

## Metadata Schema

```yaml
author: string
publication_year: number
rating: number  # 1-5 scale
genre: array
finished_reading: boolean
current_page: number
```

## Template

```markdown
---
title: ${TITLE}
type: book-notes
author:
publication_year:
rating:
genre: []
finished_reading: false
---

# ${TITLE}

## Summary



## Key Takeaways

-

## Quotes



## My Thoughts


```

## Agent Instructions

When helping with book-notes:
- Suggest related books to link
- Track reading progress
- Generate summaries
- Find quotes and key points
```

### Note Type Organization

**Storage structure:**

```
vault/
├── .note-types/
│   ├── general/
│   │   └── general.md
│   ├── meeting/
│   │   └── meeting.md
│   └── book-notes/
│       └── book-notes.md
├── general/
│   ├── note1.md
│   └── note2.md
├── meetings/
│   ├── 2024-01-15-standup.md
│   └── 2024-01-16-review.md
└── book-notes/
    ├── atomic-habits.md
    └── deep-work.md
```

Each note type gets its own folder for organization.

## Tags

Tags provide flexible, cross-cutting organization.

### Adding Tags

**In frontmatter** (recommended):
```markdown
---
title: My Note
tags: [important, project, api-design]
---
```

**In content** (inline):
```markdown
This note is about #api-design and #architecture.
```

Both methods work, but frontmatter is more structured and searchable.

### Tag Conventions

**Lowercase with hyphens:**
```yaml
tags: [api-design, project-alpha, high-priority]
```

**Hierarchical tags:**
```yaml
tags: [project/alpha, project/beta, status/active]
```

**Use sparingly:**
- Too many tags = no organization
- Aim for 3-5 tags per note
- Tags for themes, not just keywords

### Filtering by Tags

**In search:**
```
tag:important
tag:project AND tag:api-design
```

**Via AI:**
```
You: Find all notes tagged with 'project' and 'urgent'

AI: [Searches for notes with both tags]
```

## Linking Notes (Wikilinks)

Create connections between notes with **wikilinks**.

### Basic Syntax

**Link by title:**
```markdown
I discussed this in [[My Other Note]].
```

**Link by path with custom text:**
```markdown
See the [[projects/website-redesign|Website Project]] for details.
```

### Creating Links

**Manual:**
- Type `[[` to trigger autocomplete
- Start typing the note title
- Select from suggestions
- Press Enter or `]]` to complete

**Via AI:**
```
You: What notes should I link from here?

AI: Based on the content, you might want to link:
    - [[Project Overview]] - mentions same project
    - [[API Design]] - discusses similar architecture
    - [[Team Decisions]] - related decisions
```

### Following Links

**Click to navigate:**
- Click any wikilink to open that note
- Creates a temporary tab
- Adds to navigation history

**Link to non-existent notes:**
- Links show in different color
- Click to create the note
- Useful for outlining before writing

### Backlinks

When you link to a note, that note automatically shows the backlink.

**Example:**

`Note A.md`:
```markdown
This relates to [[Note B]].
```

`Note B.md` will show in its Backlinks tab:
```
Backlinks (1)

📄 Note A
  "This relates to [[Note B]]."
```

**Why backlinks matter:**
- See all references to current note
- Discover connections you forgot
- Navigate your knowledge graph
- Find related context

See [Wikilinks and Backlinks](/features/wikilinks) for advanced usage.

## Moving and Renaming Notes

### Renaming Notes

**Edit the title:**
1. Click the note title in the editor
2. Type the new name
3. Press Enter

**What happens:**
- File is renamed
- All wikilinks are updated automatically
- No broken links

**Via AI:**
```
You: Rename this note to "Website Redesign Phase 2"

AI: [Renames note and updates all linking notes]
```

### Moving Notes (Changing Type)

**Change note type:**
1. Click the type dropdown in editor
2. Select new type
3. Note moves to new type's folder

**What happens:**
- File moves to new folder
- Metadata `type` field updates
- Wikilinks remain valid

### Deleting Notes

**Caution:** Deleting is permanent.

**How to delete:**
1. Right-click the note
2. Select "Delete Note"
3. Confirm the action

**What happens:**
- Note file deleted
- Removed from database
- Wikilinks become broken (shown in red)
- Backlinks removed

**Best practice:**
- Archive instead of delete (add `archived: true` to metadata)
- Or move to an `archive` note type

## External Editing

Your notes are just markdown files. You can edit them outside Flint.

### Using External Editors

**Popular combinations:**
- Flint for AI assistance and organization
- VS Code for bulk editing
- Vim/Emacs for power users
- iA Writer for distraction-free writing

**How it works:**
1. Open your vault folder in another editor
2. Edit any `.md` file
3. Save the file
4. Flint detects the change

### Conflict Resolution

If a note is changed externally while open in Flint:

**Flint shows a conflict notification:**
- "This note was modified externally"
- Options:
  1. **Keep app version** - Discard external changes
  2. **Use file version** - Reload from disk
  3. **View both** - See diff (planned)

**Recommendation:**
- If you made both changes: Copy your Flint changes, then reload
- If only external: Use file version
- If only Flint: Keep app version

### File Watching

Flint watches your vault folder for changes:

**Detects:**
- Modified notes
- New notes created externally
- Deleted notes
- Renamed files

**Updates:**
- Database automatically
- Search index
- UI in real-time

## Note Suggestions

Some note types can have AI-generated suggestions enabled.

### What are Suggestions?

The AI analyzes your note and suggests:
- Related notes to link
- Missing metadata to fill in
- Tasks to extract
- Content to expand
- Tags to add

### Viewing Suggestions

**Suggestions tab** (right sidebar):
- Shows current suggestions for this note
- Each suggestion has:
  - Type (link, metadata, task, etc.)
  - Description
  - Actions (Accept, Dismiss)

### Enabling Suggestions

**Via note type settings:**
1. Edit the note type definition
2. Add suggestions configuration:
```yaml
suggestions_enabled: true
suggestion_types: [links, metadata, tasks]
prompt_guidance: |
  Look for:
  - Related notes to link
  - Missing metadata fields
  - Action items to extract
```

**Per note:**
```yaml
---
suggestions_enabled: true
---
```

### Managing Suggestions

**Accept:**
- Applies the suggestion
- Updates the note
- Removes from list

**Dismiss:**
- Hides this suggestion
- Doesn't apply it
- Won't show again

**Regenerate:**
- Ask AI for new suggestions
- Based on current note content

## Templates

Note types can include template content for new notes.

### Default Templates

When you create a note of a specific type, the template is applied:

**Meeting template:**
```markdown
---
title: ${TITLE}
type: meeting
date: ${DATE}
attendees: []
---

# ${TITLE}

## Attendees



## Agenda

-

## Notes



## Action Items

- [ ]
```

Variables like `${TITLE}` and `${DATE}` are replaced automatically.

### Custom Templates

Define templates in your note type:

```markdown
## Template

\`\`\`markdown
---
title: ${TITLE}
type: recipe
servings:
prep_time:
cook_time:
---

# ${TITLE}

## Ingredients

-

## Instructions

1.

## Notes


\`\`\`
```

See [Note Types](#note-types) for details on creating types with templates.

## Best Practices

### Capture Quickly, Organize Later

**Don't overthink on capture:**
1. Create note (possibly in Inbox)
2. Write your thoughts
3. Add basic links as you think of them
4. Move on

**Organize periodically:**
- Use AI to suggest organization
- Add proper metadata
- Move from Inbox to appropriate type
- Add more wikilinks
- Refine tags

### Use Wikilinks Liberally

**Link as you write:**
- Mention another note? Link it
- Reference a concept? Link to its note
- Don't worry about "over-linking"

**Benefits:**
- Builds your knowledge graph
- Creates discoverable connections
- Lets you navigate by association

### Let Note Types Emerge

**Start simple:**
- Use General type initially
- Notice patterns in what you write
- When you have 10+ similar notes, create a type

**Example evolution:**
1. Week 1: All general notes
2. Week 3: Notice lots of book notes → create book-notes type
3. Week 5: Notice project planning notes → create project type
4. Month 3: System reflects your actual needs

### Metadata is Optional

**Start minimal:**
```yaml
---
title: My Note
tags: [topic]
---
```

**Add more as needed:**
- Add fields when they'd be useful for search
- Skip fields that don't matter
- Let AI suggest what's missing

### Keep Tags Focused

**Too few:**
- Hard to find related notes
- Miss connections

**Too many:**
- Tags become meaningless
- Defeats purpose

**Just right:**
- 3-5 tags per note
- Consistent naming
- Meaningful categories

## Next Steps

- **[Wikilinks and Backlinks](/features/wikilinks)** - Master bidirectional linking
- **[Search and Discovery](/features/search)** - Find anything instantly
- **[AI Agent](/features/agent)** - Let AI help organize
- **[Daily Notes](/features/daily-notes)** - Use the daily journaling system

---

**Remember:** Notes are just markdown files. You own them, control them, and can process them however you want. Flint just makes it easier to manage them with AI assistance.
