# Keyboard Shortcuts

Complete reference for all keyboard shortcuts in Flint.

## Notation

**Modifier keys:**

- `Ctrl` - Control key (Windows/Linux)
- `Cmd` - Command key (macOS)
- `Alt` - Alt/Option key
- `Shift` - Shift key
- `Mod` - Platform modifier (Ctrl on Windows/Linux, Cmd on macOS)

**Examples:**

```
Ctrl+O = Control + O (Windows/Linux)
Cmd+O = Command + O (macOS)
Mod+O = Either, depending on platform
```

## Global Shortcuts

### Application

| Shortcut | Action           | Notes                          |
| -------- | ---------------- | ------------------------------ |
| `Mod+,`  | Open Settings    | Opens settings panel           |
| `Mod+Q`  | Quit Application | macOS only, prompts if unsaved |
| `Mod+W`  | Close Window     | Windows/Linux                  |

### Navigation

| Shortcut | Action          | Notes                  |
| -------- | --------------- | ---------------------- |
| `Mod+O`  | Quick Open      | Search and open notes  |
| `Mod+K`  | Command Palette | Future feature         |
| `Mod+\`  | Toggle Sidebar  | Show/hide left sidebar |

## Note Management

### Creating Notes

| Shortcut      | Action                      | Notes                    |
| ------------- | --------------------------- | ------------------------ |
| `Mod+N`       | New Note                    | Create in current type   |
| `Mod+Shift+N` | New Note with Type Selector | Future feature           |
| `Mod+D`       | New Daily Note              | Opens today's daily note |

### Opening Notes

| Shortcut      | Action           | Notes                         |
| ------------- | ---------------- | ----------------------------- |
| `Mod+O`       | Quick Open       | Type to search, Enter to open |
| `Mod+P`       | Open Recent      | Future feature                |
| `Mod+Shift+O` | Open in New View | Future feature                |

### Note Actions

| Shortcut     | Action        | Notes                          |
| ------------ | ------------- | ------------------------------ |
| `Mod+S`      | Save Note     | Auto-save usually handles this |
| `Mod+Delete` | Delete Note   | Prompts for confirmation       |
| `Mod+R`      | Rename Note   | Future feature                 |
| `Mod+E`      | Edit Metadata | Opens metadata panel           |

## Editor Shortcuts

### Basic Editing

| Shortcut      | Action     | Notes                         |
| ------------- | ---------- | ----------------------------- |
| `Mod+A`       | Select All | Select entire note content    |
| `Mod+C`       | Copy       | Copy selected text            |
| `Mod+X`       | Cut        | Cut selected text             |
| `Mod+V`       | Paste      | Paste from clipboard          |
| `Mod+Z`       | Undo       | Undo last change              |
| `Mod+Shift+Z` | Redo       | Redo (or `Ctrl+Y` on Windows) |

### Text Formatting

| Shortcut | Action      | Notes                                  |
| -------- | ----------- | -------------------------------------- |
| `Mod+B`  | Bold        | Wraps selection in `**bold**` (future) |
| `Mod+I`  | Italic      | Wraps selection in `*italic*` (future) |
| `Mod+K`  | Insert Link | Wraps selection in `[]()` (future)     |
| `Mod+E`  | Inline Code | Wraps selection in backticks (future)  |

### Find and Replace

| Shortcut      | Action        | Notes                   |
| ------------- | ------------- | ----------------------- |
| `Mod+F`       | Find          | Find in current note    |
| `Mod+G`       | Find Next     | Jump to next match      |
| `Mod+Shift+G` | Find Previous | Jump to previous match  |
| `Mod+H`       | Replace       | Find and replace dialog |
| `Mod+Shift+H` | Replace All   | Future feature          |

### Line Operations

| Shortcut    | Action         | Notes                             |
| ----------- | -------------- | --------------------------------- |
| `Tab`       | Indent         | Indent line or selected lines     |
| `Shift+Tab` | Unindent       | Unindent line or selected lines   |
| `Mod+]`     | Indent         | Alternative to Tab (future)       |
| `Mod+[`     | Unindent       | Alternative to Shift+Tab (future) |
| `Mod+/`     | Toggle Comment | Markdown comment (future)         |

### Navigation in Editor

| Shortcut   | Action        | Notes                |
| ---------- | ------------- | -------------------- |
| `Home`     | Start of Line | Jump to line start   |
| `End`      | End of Line   | Jump to line end     |
| `Mod+Home` | Start of Note | Jump to note start   |
| `Mod+End`  | End of Note   | Jump to note end     |
| `Mod+Up`   | Start of Note | Alternative (macOS)  |
| `Mod+Down` | End of Note   | Alternative (macOS)  |
| `PageUp`   | Page Up       | Scroll up one page   |
| `PageDown` | Page Down     | Scroll down one page |

### Selection

| Shortcut           | Action               | Notes                         |
| ------------------ | -------------------- | ----------------------------- |
| `Shift+Left/Right` | Select Character     | Extend selection by character |
| `Shift+Up/Down`    | Select Line          | Extend selection by line      |
| `Mod+Shift+Left`   | Select to Word Start | Select to start of word       |
| `Mod+Shift+Right`  | Select to Word End   | Select to end of word         |
| `Shift+Home`       | Select to Line Start | Select to start of line       |
| `Shift+End`        | Select to Line End   | Select to end of line         |

## Wikilink Shortcuts

### Creating Wikilinks

| Shortcut | Action            | Notes                                |
| -------- | ----------------- | ------------------------------------ |
| `[[`     | Start Wikilink    | Type `[[` to begin wikilink          |
| `]]`     | Close Wikilink    | Complete wikilink                    |
| `Enter`  | Accept Suggestion | While wikilink autocomplete open     |
| `Escape` | Cancel            | Close autocomplete without selecting |

### Navigating Wikilinks

| Shortcut    | Action           | Notes                          |
| ----------- | ---------------- | ------------------------------ |
| `Click`     | Follow Link      | Navigate to linked note        |
| `Mod+Click` | Open in New View | Future feature                 |
| `Mod+Enter` | Open from Hover  | Open note from hover popover   |
| `Alt+Enter` | Create Note      | Create note from hover popover |

## Search Shortcuts

### Quick Search

| Shortcut    | Action            | Notes                       |
| ----------- | ----------------- | --------------------------- |
| `Mod+O`     | Open Quick Search | Main search interface       |
| `Escape`    | Close Search      | Close without selecting     |
| `Enter`     | Open Selected     | Open highlighted result     |
| `Up/Down`   | Navigate Results  | Move through search results |
| `Mod+Enter` | Open in New View  | Future feature              |

### Search Operators

**Type in search box:**

```
type:daily          → Search by note type
tag:important       → Search by tag
created:today       → Search by creation date
modified:this-week  → Search by modified date
```

## AI Agent Shortcuts

### Chat Interface

| Shortcut      | Action               | Notes                         |
| ------------- | -------------------- | ----------------------------- |
| `Mod+Enter`   | Send Message         | Send message to AI            |
| `Escape`      | Cancel               | Cancel message composition    |
| `Up`          | Previous Message     | Edit last message (future)    |
| `Mod+Shift+C` | New Conversation     | Start fresh conversation      |
| `Mod+K`       | Open Command Palette | AI command shortcuts (future) |

### Agent Actions

| Shortcut      | Action         | Notes                               |
| ------------- | -------------- | ----------------------------------- |
| `Mod+L`       | Ask About Note | Ask AI about current note (future)  |
| `Mod+Shift+L` | Summarize Note | AI summarizes current note (future) |

## View Management

### Panels

| Shortcut      | Action               | Notes                  |
| ------------- | -------------------- | ---------------------- |
| `Mod+\`       | Toggle Sidebar       | Show/hide left sidebar |
| `Mod+Shift+\` | Toggle Right Sidebar | Future feature         |
| `Mod+B`       | Toggle Both Sidebars | Future feature         |
| `Mod+J`       | Toggle Panel         | Future feature         |

### Focus

| Shortcut | Action        | Notes                     |
| -------- | ------------- | ------------------------- |
| `Mod+1`  | Focus Sidebar | Jump to sidebar (future)  |
| `Mod+2`  | Focus Editor  | Jump to editor            |
| `Mod+3`  | Focus Agent   | Jump to AI agent (future) |
| `Mod+0`  | Focus Search  | Jump to search (future)   |

## Daily Note Shortcuts

### Navigation

| Shortcut      | Action       | Notes                          |
| ------------- | ------------ | ------------------------------ |
| `Mod+D`       | Today's Note | Open or create today's note    |
| `Mod+Shift+D` | Daily View   | Open daily notes view          |
| `Mod+Left`    | Previous Day | Navigate to yesterday (future) |
| `Mod+Right`   | Next Day     | Navigate to tomorrow (future)  |

### Quick Entry

| Shortcut | Action           | Notes                              |
| -------- | ---------------- | ---------------------------------- |
| `Mod+1`  | Add to Morning   | Jump to morning section (future)   |
| `Mod+2`  | Add to Afternoon | Jump to afternoon section (future) |
| `Mod+3`  | Add to Evening   | Jump to evening section (future)   |

## Review System Shortcuts

### Review Session

| Shortcut    | Action          | Notes                            |
| ----------- | --------------- | -------------------------------- |
| `Mod+Enter` | Submit Response | Submit review response           |
| `Escape`    | End Session     | End review session               |
| `Space`     | Show Note       | View original note during review |
| `P`         | Pass            | Mark as passed (future)          |
| `F`         | Fail            | Mark as failed (future)          |
| `S`         | Skip            | Skip current review (future)     |

## Workflow Shortcuts

### Workflow Management

| Shortcut      | Action       | Notes                             |
| ------------- | ------------ | --------------------------------- |
| `Mod+Shift+R` | Run Workflow | Execute selected workflow (future) |

## Organization Shortcuts

### Tabs and Pins

| Shortcut      | Action            | Notes                                  |
| ------------- | ----------------- | -------------------------------------- |
| `Mod+T`       | New Temporary Tab | Open current note in temp tab (future) |
| `Mod+P`       | Pin Note          | Pin current note to sidebar (future)   |
| `Mod+Shift+P` | Unpin Note        | Remove from pinned notes (future)      |
| `Mod+W`       | Close Tab         | Close temporary tab (future)           |

### Navigation History

| Shortcut    | Action     | Notes                              |
| ----------- | ---------- | ---------------------------------- |
| `Mod+[`     | Go Back    | Navigate to previous note (future) |
| `Mod+]`     | Go Forward | Navigate to next note (future)     |
| `Alt+Left`  | Go Back    | Alternative (future)               |
| `Alt+Right` | Go Forward | Alternative (future)               |

## Multi-Vault Shortcuts

### Vault Management

| Shortcut      | Action              | Notes                        |
| ------------- | ------------------- | ---------------------------- |
| `Mod+Shift+V` | Vault Selector      | Open vault switcher (future) |
| `Mod+1-9`     | Switch to Vault 1-9 | Quick vault switch (future)  |

## Developer Shortcuts

### Debug and Inspect

| Shortcut      | Action          | Notes                  |
| ------------- | --------------- | ---------------------- |
| `Mod+Shift+I` | DevTools        | Open developer tools   |
| `Mod+Shift+C` | Inspect Element | Inspect mode           |
| `Mod+R`       | Reload          | Reload application     |
| `Mod+Shift+R` | Hard Reload     | Clear cache and reload |

## Customization

### Future: Custom Keybindings

**Not yet implemented** - Planned features:

- Rebind any shortcut
- Export/import keybindings
- Per-vault keybinding profiles
- Conflict detection

**When available:**

```
Settings → Keyboard Shortcuts → Customize
```

## Tips for Learning Shortcuts

### Start with Essentials

**Learn these first:**

```
Mod+O     → Quick open
Mod+N     → New note
Mod+S     → Save (though auto-save handles this)
Mod+F     → Find
Mod+,     → Settings
```

**These cover 80% of usage.**

### Learn Gradually

**Add shortcuts weekly:**

1. Week 1: Basic navigation (Mod+O, Mod+N)
2. Week 2: Editor basics (Mod+F, Tab, Shift+Tab)
3. Week 3: Wikilinks (`[[`, Enter in autocomplete)
4. Week 4: Advanced (Mod+G, Mod+H)

**Don't try to learn all at once.**

### Use Visual Aids

**Future features:**

- On-screen shortcut hints
- Shortcut overlay (like Cmd+K in VS Code)
- Contextual shortcut suggestions

### Create Muscle Memory

**Practice frequently used shortcuts:**

- `Mod+O` → Quick open (multiple times daily)
- `Tab/Shift+Tab` → Indentation (whenever writing lists)
- `Mod+Enter` → Send to AI (every interaction)

**Repetition builds speed.**

## Platform Differences

### macOS vs Windows/Linux

**Modifier key differences:**

```
macOS:            Windows/Linux:
Cmd+O             Ctrl+O
Cmd+Shift+N       Ctrl+Shift+N
Opt+Up            Alt+Up
```

**Special macOS shortcuts:**

```
Cmd+H             → Hide window
Cmd+M             → Minimize window
Cmd+Q             → Quit application
Cmd+,             → Preferences (Settings)
```

**Special Windows shortcuts:**

```
Alt+F4            → Close window
F1                → Help
Win+D             → Show desktop
```

### Context-Specific Shortcuts

**Different behavior in different contexts:**

**In editor:**

```
Tab → Indent line
Enter → New line
```

**In wikilink autocomplete:**

```
Tab → Select next suggestion
Enter → Accept suggestion
```

**In search:**

```
Enter → Open note
Escape → Close search
```

## Shortcut Conflicts

### Application Conflicts

**Some shortcuts may conflict with:**

- OS shortcuts
- Browser shortcuts (if web version)
- Other running applications

**Resolution:**

1. **Check OS shortcuts:** System Preferences → Keyboard
2. **Disable conflicting shortcuts** in other apps
3. **Use alternative shortcuts** if available

### Future: Conflict Detection

**Planned feature:**

- Detect shortcut conflicts
- Suggest alternatives
- Show which shortcuts are available
- Remap automatically

## Accessibility

### Screen Reader Support

**Navigation without mouse:**

- `Tab` → Move to next element
- `Shift+Tab` → Move to previous element
- `Enter` → Activate element
- `Space` → Toggle checkboxes/buttons
- `Escape` → Close dialogs

**All shortcuts work with screen readers.**

### High Contrast Mode

**Shortcuts remain visible** in high contrast mode.

### Sticky Keys

**Compatible with sticky keys:**

- Press modifiers sequentially
- Don't need to hold multiple keys
- System-level setting

## Troubleshooting

### Shortcuts Not Working

**Problem:** Shortcut doesn't trigger action.

**Solutions:**

1. **Check modifier key:**
   - macOS: Use `Cmd`, not `Ctrl`
   - Windows/Linux: Use `Ctrl`, not `Cmd`

2. **Check context:**
   - Some shortcuts only work in specific contexts
   - Example: `Mod+F` only works when editor focused

3. **Check for conflicts:**
   - OS or other app may intercept shortcut
   - Try alternative shortcut if available

4. **Restart application:**
   - Refresh key bindings
   - Clear any stuck key states

### Wrong Action Triggered

**Problem:** Shortcut triggers different action than expected.

**Check documentation:**

- Verify correct shortcut for action
- May have remembered incorrectly
- Shortcuts may have changed in updates

**Check keyboard layout:**

- Non-US keyboards may have different key positions
- Shortcuts based on physical key location
- May need to use different keys

## Quick Reference Card

### Most Used Shortcuts

**Print or keep handy:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ESSENTIAL SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Mod+O          Quick Open
 Mod+N          New Note
 Mod+,          Settings
 Mod+F          Find in Note
 Mod+Enter      Send to AI
 Escape         Close/Cancel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 EDITOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Mod+Z          Undo
 Mod+Shift+Z    Redo
 Tab            Indent
 Shift+Tab      Unindent
 Mod+A          Select All
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 WIKILINKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [[             Start Wikilink
 Enter          Accept Suggestion
 Click          Follow Link
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Next Steps

- **[Interface Guide](/guides/interface)** - Understand UI layout

---

**Pro tip:** Don't memorize shortcuts. Use them when convenient. The ones you need will become automatic through use. The ones you don't need won't slow you down.
