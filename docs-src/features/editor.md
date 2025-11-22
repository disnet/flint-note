# Editor Features

Flint uses a powerful CodeMirror-based editor with markdown support, syntax highlighting, and intelligent editing features.

## Editor Overview

**Core editor:** CodeMirror 6
- Modern, extensible editor
- Fast and lightweight
- Accessibility support
- Mobile-friendly

**Key capabilities:**
- **Markdown editing** with live syntax
- **Wikilink support** with inline preview
- **Auto-save** after 1 second of inactivity
- **Spell check** built-in
- **Line wrapping** enabled
- **Syntax highlighting** for code blocks

## Markdown Editing

### Syntax Highlighting

**Real-time highlighting as you type:**

```markdown
# Heading 1
## Heading 2
### Heading 3

**Bold text**
*Italic text*
~~Strikethrough~~

- Bullet list
1. Numbered list

`Inline code`

```javascript
// Code blocks with language highlighting
function example() {
  return "highlighted";
}
\```

[Links](https://example.com)
[[Wikilinks]]
```

**Visual feedback:**
- Headers: Larger, bold text
- Bold/italic: Styled appropriately
- Code: Monospace background
- Links: Underlined, clickable
- Lists: Proper indentation

### Live Markdown Rendering

**While editing, you see:**
- Formatted text (not raw markdown)
- Visual list bullets and numbers
- Styled headers
- Highlighted code blocks
- Clickable wikilinks

**Switch between:**
- **Edit mode** - See some formatting, edit freely
- **Preview** - Full markdown render (future feature)

### List Editing

**Smart list handling:**

**Auto-continuation:**
```markdown
- First item [press Enter]
- [Cursor here - bullet added automatically]
```

**Indentation with Tab:**
```markdown
- Top level
  - Nested (press Tab)
    - Deeply nested (press Tab again)
```

**Un-indent with Shift+Tab:**
```markdown
- Top level
  - Nested
- [Shift+Tab to return to top level]
```

**List completion:**
```markdown
- Item one
- [press Enter on empty item]
[Bullet removed, list ended]
```

**Checkbox lists:**
```markdown
- [ ] Uncompleted task
- [x] Completed task
```

### Code Blocks

**Fenced code blocks:**

````markdown
```javascript
function hello() {
  console.log("Hello world");
}
```

```python
def greet():
    print("Hello world")
```

```typescript
const greet = (): void => {
  console.log("Hello world");
};
```
````

**Syntax highlighting** for 100+ languages:
- JavaScript, TypeScript
- Python, Ruby, Go, Rust
- HTML, CSS, JSON, YAML
- SQL, Shell scripts
- And many more

**Inline code:**
```markdown
Use the `createNote()` function to create a note.
```

## Wikilink Features

### Creating Wikilinks

**Type `[[` to start:**
```markdown
I want to link to [[
```

**Auto-suggest appears:**
- Shows matching notes
- Filters as you type
- Select with arrow keys + Enter
- Or finish typing and close with `]]`

### Wikilink Display

**In editor:**
```markdown
See [[Project Overview]] for details
     ^^^^^^^^^^^^^^^^^
     Styled as link, underlined
```

**Hover to preview:**
- Hover over any wikilink
- See note title and preview
- Click to navigate
- Cmd/Ctrl+click to open in new tab (future)

### Broken Wikilinks

**Non-existent notes:**
```markdown
[[This Note Doesn't Exist]]
^^^^^^^^^^^^^^^^^^^^^
Red/orange styling (broken link)
```

**Click broken link:**
- Offers to create note
- Or navigate to create manually

### Wikilink Editing

**Rename linked note:**
- Note renames automatically update wikilinks
- All references stay valid
- No manual find/replace needed

**Delete linked note:**
- Wikilinks become "broken"
- Visual indication in editor
- Easy to identify orphaned references

## Editor Commands

### Text Manipulation

**Select all:**
- `Ctrl/Cmd+A`

**Copy/Cut/Paste:**
- `Ctrl/Cmd+C` - Copy
- `Ctrl/Cmd+X` - Cut
- `Ctrl/Cmd+V` - Paste

**Undo/Redo:**
- `Ctrl/Cmd+Z` - Undo
- `Ctrl/Cmd+Shift+Z` - Redo (or `Ctrl+Y` on Windows)

**Find:**
- `Ctrl/Cmd+F` - Find in note
- `Ctrl/Cmd+G` - Find next
- `Ctrl/Cmd+Shift+G` - Find previous

**Replace:**
- `Ctrl/Cmd+H` - Find and replace

### Line Operations

**Indent/Unindent:**
- `Tab` - Indent line or selection
- `Shift+Tab` - Unindent line or selection

**Move lines:**
- `Alt+Up` - Move line up (future)
- `Alt+Down` - Move line down (future)

**Duplicate line:**
- `Ctrl/Cmd+D` - Duplicate current line (future)

**Delete line:**
- `Ctrl/Cmd+Shift+K` - Delete entire line (future)

### Code Actions

**Comment toggle:**
- `Ctrl/Cmd+/` - Toggle markdown comment (future)

**Format:**
- `Alt+Shift+F` - Format document (future)

## Editor Themes

### Light Theme

**GitHub Light theme:**
- Clean, readable design
- High contrast text
- Subtle syntax colors
- Easy on eyes in bright environments

**Activates when:**
- System theme is light
- Or manual theme selection

### Dark Theme

**GitHub Dark theme:**
- Reduced eye strain in low light
- Consistent with system dark mode
- Proper contrast for readability
- Professional appearance

**Activates when:**
- System theme is dark
- Or manual theme selection

**Theme follows system:**
- Auto-switches with OS
- Or set manually in settings

## Editor Variants

### Default Editor

**Standard note editor:**
- Full-featured markdown editing
- 25vh bottom margin for scrolling
- Spell check enabled
- All features available

**Used for:**
- Regular notes
- Meeting notes
- Project documentation

### Daily Note Editor

**Optimized for daily journaling:**
- Compact design
- No bottom margin
- Quick inline editing
- Minimal UI

**Special features:**
- Section collapsing
- Time-based sections
- Quick entry shortcuts

### Backlink Context Editor

**Mini-editor for backlink snippets:**
- Single-line or minimal multiline
- Compact display
- Inline editing
- Fast, lightweight

**Purpose:**
- Edit backlink context
- Update surrounding text
- Quick fixes

## Auto-Save

**Automatic saving:**
- Waits 1 second after you stop typing
- Saves to database
- Updates file on disk
- No manual save needed

**Visual feedback:**
- "Saving..." indicator (brief)
- "Saved" confirmation
- Timestamp of last save

**Benefits:**
- Never lose work
- No need to remember to save
- Seamless experience

**Caution:**
- Changes are immediate
- No "undo save" (use version control)
- Undo/redo available within session

## Spell Check

**Built-in spell checking:**
- Browser-based spell check
- Red underline for misspelled words
- Right-click for suggestions
- Multiple languages supported (based on OS)

**Enabled by default:**
- Works in all editors
- Can't be disabled currently (future setting)

**Works in:**
- Note content
- Daily note entries
- Metadata fields (title, etc.)

## Line Wrapping

**Soft wrap enabled:**
- Long lines wrap visually
- No horizontal scrolling
- More readable
- Actual content unchanged

**Benefits:**
- See full sentences
- No need to manually wrap
- Mobile-friendly

## Special Features

### Inline AI Suggestions

**AI-generated inline comments:**
- Appear as `<!-- Suggestion: ... -->` in margin
- Clickable to expand
- Dismissible
- Contextual to note content

**Example:**
```markdown
## Project Goals

[Suggestion: Consider adding specific metrics]

We want to improve performance.
```

**Interaction:**
- Hover to see full suggestion
- Click to expand details
- Dismiss if not helpful
- AI learns from feedback

### Comment Markers

**Special comment syntax:**

```markdown
<!-- TODO: Finish this section -->
<!-- NOTE: Important consideration -->
<!-- IDEA: Could extend this feature -->
```

**Visual indicators:**
- Icon in margin
- Color-coded by type
- Hoverable for full text

### Wikilink Popovers

**Rich hover experience:**

**On wikilink hover:**
1. Popover appears
2. Shows note title
3. Shows note preview (first ~200 chars)
4. Links to navigate

**Actions available:**
- Click to navigate
- Edit wikilink text
- Open in new view (future)

## Editor Settings

### Font

**Default font:**
```
iA Writer Quattro
→ SF Mono (fallback)
→ Monaco (fallback)
→ Cascadia Code (fallback)
→ Roboto Mono (fallback)
→ Monospace (system fallback)
```

**Characteristics:**
- Monospace for alignment
- Clear character distinction
- Good for markdown and code
- Cross-platform availability

**Future:** Font family customization

### Font Size

**Default size:**
- Set via CSS variable
- Responsive to system preferences
- Adjustable (future setting)

**Future:** Per-user font size preference

### Line Height

**Default: 1.6**
- Good readability
- Proper spacing
- Balanced for long-form content

## Accessibility

**Keyboard navigation:**
- Full editor control via keyboard
- No mouse required
- Standard keyboard shortcuts

**Screen reader support:**
- ARIA labels
- Semantic HTML
- Proper focus management

**High contrast:**
- Themes support high contrast
- Clear text/background separation
- Readable in all lighting

## Performance

**Optimized for large notes:**
- Fast rendering
- Smooth scrolling
- No lag on typing
- Efficient updates

**Handles well:**
- Notes with 10,000+ lines
- Complex markdown
- Many wikilinks
- Large code blocks

**Memory efficient:**
- Only renders visible content
- Lazy loads off-screen sections
- Minimal memory footprint

## Mobile Support

**Touch-friendly:**
- Tap to position cursor
- Swipe to scroll
- Select text with long press
- Context menus

**Mobile keyboard:**
- Works with on-screen keyboard
- Auto-corrects and suggestions
- Proper keyboard type for fields

**Responsive:**
- Adapts to screen size
- Readable on phones
- Usable on tablets

## Integration Features

### With Search

**Quick open:**
- `Ctrl/Cmd+O` from editor
- Search and open notes
- Returns to same scroll position

### With AI

**AI can edit:**
- AI agent can modify note content
- Uses diff-based updates
- Preserves cursor position
- Shows changes clearly

**AI suggestions:**
- Inline suggestions in margin
- Contextual to what you're writing
- Dismissible and actionable

### With Metadata

**Frontmatter editing:**
- Edit YAML frontmatter at top
- Syntax highlighted
- Validated on save
- Errors shown inline

### With Backlinks

**Backlink navigation:**
- Click backlink → jump to context
- Edit context inline
- Navigate back easily

## Best Practices

### Markdown Formatting

**Use headers appropriately:**
```markdown
# Note Title (H1 - one per note)
## Major Section (H2)
### Subsection (H3)
#### Details (H4)
```

**Lists for structure:**
```markdown
Unordered lists for:
- Non-sequential items
- Collections
- Options

Ordered lists for:
1. Sequential steps
2. Prioritized items
3. Procedures
```

**Code blocks for code:**
````markdown
```language
// Always specify language for highlighting
function example() {
  return true;
}
```
````

### Wikilink Usage

**Link generously:**
- Connect related ideas
- Build knowledge graph
- Don't worry about over-linking

**Use descriptive link text:**
```markdown
Good: See [[API Design Principles]]
Bad: See [[this]]
```

**Create notes proactively:**
- Don't hesitate to create new notes
- Split large notes into smaller ones
- Link them together

### Editor Workflow

**Start typing immediately:**
- No need to click "edit"
- Editor is always ready
- Auto-save handles persistence

**Use keyboard shortcuts:**
- Faster than mouse
- Better flow
- Learn gradually

**Trust auto-save:**
- Don't manually save
- Focus on writing
- System handles persistence

## Troubleshooting

### Cursor Jumping

**Problem:** Cursor moves while typing.

**Causes:**
- Auto-save during typing
- External file change
- Sync conflict

**Solutions:**
- Wait for "Saved" indicator before continuing
- Pause typing briefly during save
- Close external editors

### Slow Performance

**Problem:** Editor lags while typing.

**Solutions:**
1. **Check note size:**
   - Split very large notes (10,000+ lines)
   - Use wikilinks to reference

2. **Check code blocks:**
   - Limit very large code blocks
   - Link to code files instead

3. **Restart app:**
   - Clears memory
   - Resets editor state

### Wikilinks Not Working

**Problem:** Wikilinks not clickable or don't show previews.

**Solutions:**
1. **Check syntax:**
   ```markdown
   [[Note Title]]  ✓ Correct
   [ [Note Title]]  ❌ Extra space
   ```

2. **Check note exists:**
   - Broken wikilink appears red/orange
   - Create note if needed

3. **Refresh editor:**
   - Close and reopen note
   - Reinitializes wikilink processing

## Next Steps

- **[Markdown Guide](/guides/markdown)** - Complete markdown syntax
- **[Wikilinks](/features/wikilinks)** - Deep dive into wikilinks
- **[Keyboard Shortcuts](/guides/shortcuts)** - Full shortcut reference
- **[Notes](/features/notes)** - Note management

---

**Tip:** The editor is designed to stay out of your way. Most features activate automatically based on context. Just write naturally and let the editor help you.
