# Note Management

Learn everything about creating, organizing, and managing notes in Flint.

## Creating Notes

### Quick Creation

**Keyboard shortcut:**

- Press `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (Mac)

**From workspace bar:**

- Click the "New Note" button in the workspace bar

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

## Writing in Markdown

Flint notes use **standard markdown** syntax.

### Basic Formatting

**Text styles:**

```markdown
**bold text**
_italic text_
~~strikethrough~~
`inline code`
```

Result: **bold text**, _italic text_, ~~strikethrough~~, `inline code`

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
[Link with title](https://example.com 'Hover title')
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
| -------- | -------- | -------- |
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

| Left-aligned | Center-aligned | Right-aligned |
| :----------- | :------------: | ------------: |
| Left         |     Center     |         Right |
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

---

---
```

All create horizontal lines.

## Note Metadata

Metadata provides **structured data** about your notes - things like dates, tags, status, and custom fields.

**Editing metadata:**

Click the **Metadata** button in the note toolbar to expand the metadata editor. The available fields are defined by your note type.

## Note Types

Note types define schemas and behaviors for different categories of notes.

### Built-in Note Types

Flint includes two default types:

#### Note

- **Purpose**: General-purpose notes for any content
- **Fields**: Basic metadata (title, tags, dates)
- **Use for**: Ideas, thoughts, reference materials, anything

#### Daily

- **Purpose**: Daily journal entries
- **Fields**: date (auto-set to today)
- **Use for**: Journaling, daily logs, daily planning
- **Special**: Integrated with Daily view

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

    The new type is ready. Create a book note with:
    "Create a book-notes note for [book title]"
```

**Via Note Types:**

1. Go to Note Types system view
3. Click "+ Note Type"
4. Define:
   - Type name
   - Description
   - Icon

Once the type is created, you can further customize it by adding metadata schema and agent instructions content.

### Customizing Agent Behavior with Instructions

Each note type can include **agent instructions** that guide how the AI agent interacts with notes of that type. Instructions tell the AI agent:

- What actions to take when working with this note type
- What suggestions to make
- What patterns to look for
- What connections to create

**How it works:**

When you ask the agent to help with a note, it first reads the agent instructions from that note's type definition. This gives the agent context-specific knowledge about how to best help you.

**Example (book-notes type):**

```markdown
- Suggest related books to link based on genre and themes
- Track reading progress using the current_page field
- Generate summaries from the content
- Extract and highlight notable quotes
- Identify key takeaways and concepts
- Link to other notes about similar topics
```

**In practice:**

With these instructions, when you ask "Help me organize this book note," the agent knows to:

1. Check if metadata fields like `author` and `genre` are filled
2. Look for related books in your vault to suggest linking
3. Extract key takeaways from your notes
4. Update `current_page` or `finished_reading` based on your content

**Writing effective instructions:**

- **Be specific**: "Extract action items and create task notes" is better than "help with tasks"
- **Describe patterns**: Tell the agent what to look for in the content
- **Define workflows**: Explain multi-step processes for this note type
- **Reference metadata**: Tell the agent which fields to use and when

## Linking Notes (Wikilinks)

Create connections between notes with **wikilinks**.

### Basic Syntax

**Link by title:**

```markdown
I discussed this in [[My Other Note]].
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

### Backlinks

When you link to a note, that note automatically shows the backlink.

**Example:**

`Note A.md`:

```markdown
This relates to [[Note B]].
```

`Note B.md` will show in its Backlinks widget.

**Why backlinks matter:**

- See all references to current note
- Discover connections you forgot
- Navigate your knowledge graph
- Find related context


## Moving and Renaming Notes

### Renaming Notes

**Edit the title:**

1. Click the note title in the editor
2. Type the new name
3. Press Enter

**What happens:**

- File is renamed
- All wikilinks are updated automatically

**Via AI:**

```
You: Rename this note to "Website Redesign Phase 2"

AI: [Renames note and updates all linking notes]
```

### Moving Notes (Changing Type)

**Change note type:**

1. Click the type dropdown in editor (`Cmd+Shift+M`/`Ctrl+Shift+M`)
2. Select new type
3. Note moves to new type's folder

**What happens:**

- File moves to new folder
- Metadata `type` field updates
- Wikilinks remain valid

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

## Note Suggestions

Note types can have AI-generated suggestions enabled.

### What are Suggestions?

The AI analyzes your note and suggests makes suggestions for improvement to display along with your note. Suggestions are enabled by note type and can be guided by a prompt.

Once enabled for a note type you will need to click a button for each note to generate suggestions.

### Enabling Suggestions

**Edit a note type via note type settings:**

1. Open a note type in the Note Types system view
2. Check "Enable AI Suggestions"
3. Optionally fill out the custom prompt

### Viewing Suggestions

When viewing a note click the "Generate suggestions" button in the action bar. This will:

- Send the note to the agent with the suggestion prompt
- Shows agent suggestions as comments along the side of the editor


## Next Steps

- **[AI Agent](/features/agent)** - Let AI help organize
- **[Daily Notes](/features/daily-notes)** - Use the daily journaling system

---

**Remember:** Notes are just markdown files. You own them, control them, and can process them however you want. Flint just makes it easier to manage them with AI assistance.
