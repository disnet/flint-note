# Workspaces

Organize different contexts within a vault using workspaces—your command center for context switching.

## Overview

**Workspaces** let you maintain multiple independent contexts within a single vault. Each workspace has its own set of pinned notes and temporary tabs, making it easy to switch between different projects, workflows, or focus areas without losing your place.

**Think of workspaces as:**

- Different desks in the same office
- Separate contexts within one vault
- Independent sets of open notes
- Project-specific views

**Key benefits:**

- Switch contexts instantly
- Keep different projects organized
- Maintain separate sets of pinned notes
- Reduce cognitive overhead

**When to use workspaces vs. vaults:**

| Use Workspaces When                          | Use Separate Vaults When                     |
| -------------------------------------------- | -------------------------------------------- |
| Working on different projects in same domain | Completely separate contexts (work/personal) |
| Context switching within one knowledge base  | Different security/privacy requirements      |
| Same set of notes, different focal points    | Completely separate note collections         |
| Short-term organization                      | Long-term separation                         |

## What is a Workspace?

A workspace is a **UI-level organization** within your vault that maintains:

**Independent state:**

- **Pinned notes**: Each workspace has its own pinned notes
- **Temporary tabs**: Each workspace has its own open tabs
- **Active note**: Switching workspaces clears the active note

**Visual identity:**

- **Icon**: Emoji or symbol for quick recognition
- **Name**: Descriptive label
- **Color**: Optional color coding (coming soon)
- **Order**: Customizable position in workspace bar

**Persistence:**

- Saved per vault
- Survives app restarts
- Automatically synced with vault

## Creating Workspaces

### Create Your First Workspace

**Method 1: Via workspace bar**

1. Click the `+` button in the workspace bar (bottom of left sidebar)
2. Click "New Workspace"
3. Choose an icon (click emoji picker)
4. Enter a name
5. Click "Create"

**Method 2: Via menu**

1. Menu → Workspace → New Workspace
2. Follow the form prompts

**Default workspace:**

When you first use Flint, a "Default" workspace (📋) is created automatically with any existing pinned notes and tabs migrated into it.

### Naming Workspaces

**Good workspace names:**

- **Project-based**: "Mobile App", "Website Redesign"
- **Role-based**: "Management", "Technical Writing"
- **Context-based**: "Deep Work", "Meetings", "Learning"
- **Goal-based**: "Q1 Goals", "Book Project"

**Choose names that:**

- Clearly describe the context
- Are short (1-3 words)
- Are easy to scan quickly
- Match your workflow

**Examples:**

```
📱 Mobile App
🌐 Website
📊 Analytics
📝 Writing
🎨 Design
🔬 Research
```

### Choosing Icons

**Icon picker:**

- Click the icon field in the workspace form
- Browse emoji categories
- Search for specific emoji
- Select your choice

**Icon strategies:**

**By category:**

- 📱 Mobile projects
- 🌐 Web projects
- 📊 Data/analytics work
- 📝 Writing projects
- 🎨 Design work
- 🔬 Research

**By status:**

- 🔥 Active/urgent
- 📋 Planning
- ✅ In progress
- 🎯 Goals

**By context:**

- 🏢 Work
- 🎓 Learning
- 💡 Ideas
- 🛠️ Building

**Consistency helps:**

- Use similar icons for related workspaces
- Develop your own icon vocabulary
- Make icons visually distinct

## Using Workspaces

### The Workspace Bar

**Location:** Bottom of left sidebar

**Display:**

```
┌────────────────────────┐
│  [📋] [📱] [🌐] [+]   │
│   ↑    ↑    ↑    ↑     │
│   │    │    │    Add   │
│   │    │    Inactive   │
│   │    Inactive        │
│   Active               │
└────────────────────────┘
```

**Visual indicators:**

- **Active workspace**: Highlighted with colored border
- **Inactive workspaces**: Muted appearance
- **Add button**: Dashed border `+` button
- **Hover**: Shows workspace name tooltip

### Switching Workspaces

**Method 1: Click workspace icon**

Click any workspace icon in the workspace bar to switch to it.

**Method 2: Keyboard shortcuts**

Quick switch to first 9 workspaces:

| Shortcut                     | Action                |
| ---------------------------- | --------------------- |
| `Ctrl+1` (Win) / `⌘+1` (Mac) | Switch to workspace 1 |
| `Ctrl+2` (Win) / `⌘+2` (Mac) | Switch to workspace 2 |
| ...                          | ...                   |
| `Ctrl+9` (Win) / `⌘+9` (Mac) | Switch to workspace 9 |

**Tooltip shows shortcuts:**

Hover over workspace icons to see their keyboard shortcut (for first 9).

**What happens when switching:**

1. Current workspace's state is saved
2. Active note is cleared
3. New workspace's pinned notes and tabs are loaded
4. You see a fresh context

### Active Workspace Behavior

**Each workspace remembers:**

- Which notes are pinned
- Which temporary tabs are open
- Tab order and organization

**Switching workspaces:**

- Doesn't close notes in other workspaces
- Doesn't affect note content
- Only changes which notes are visible in sidebar
- Provides clean context switch

**Example:**

```
Workspace "Mobile App" has:
- Pinned: App Architecture, Current Sprint
- Tabs: 3 recent feature notes

Switch to "Website":
- See completely different pins
- See different temporary tabs
- "Mobile App" notes still there when you switch back
```

## Managing Workspaces

### Editing Workspaces

**Edit name, icon, or color:**

1. Right-click workspace icon
2. Select "Edit"
3. Modify fields
4. Click "Save"

**Or via menu:**

1. Click on active workspace icon (opens popover)
2. Menu → Workspace → Edit Workspace
3. Modify and save

**What you can edit:**

- **Name**: Change descriptive label
- **Icon**: Pick different emoji
- **Color**: Set accent color (UI enhancement)

**When to edit:**

- Project scope changes
- Better icon found
- Name no longer fits
- Consolidating similar workspaces

### Reordering Workspaces

**Drag and drop:**

1. Click and hold workspace icon
2. Drag left or right
3. Drop in new position
4. Order persists

**Why reorder:**

- **Most used first**: Put frequent workspaces in positions 1-3
- **Workflow order**: Arrange by process sequence
- **Logical grouping**: Related workspaces together

**Keyboard shortcut positions:**

Workspaces in positions 1-9 get keyboard shortcuts (`Ctrl+1` through `Ctrl+9`). Arrange your most-used workspaces in these positions.

**Example ordering:**

```
Position: [1]      [2]       [3]        [4]      [5]
Icon:     📋       📱        🌐         📊       📝
Name:     Daily    Mobile    Website    Data     Writing
Shortcut: Ctrl+1   Ctrl+2    Ctrl+3     Ctrl+4   Ctrl+5
```

### Deleting Workspaces

**When to delete:**

- Project completed
- Context no longer needed
- Consolidating workspaces
- Workspace is empty/unused

**How to delete:**

1. Right-click workspace icon
2. Select "Delete"
3. Confirm deletion

**Or via menu:**

Menu → Workspace → Delete Workspace

**Important:**

- **Cannot delete the last workspace**: You must have at least one
- **Deleting removes all pins and tabs**: Notes themselves are not deleted
- **Auto-switch**: If you delete the active workspace, you'll switch to another
- **No undo**: Deletion is permanent (though notes remain)

**What gets deleted:**

- Workspace configuration
- Pinned notes list (not the notes)
- Temporary tabs list (not the notes)

**What's preserved:**

- All note files
- Note content
- Links and metadata

### Moving Notes Between Workspaces

**Move a pinned note or tab to another workspace:**

1. Right-click the note (in pins or tabs)
2. Hover over "Move to Workspace"
3. Select target workspace
4. Note moves to that workspace

**Behavior:**

- Removed from current workspace
- Added as temporary tab in target workspace (always unpinned in destination)
- Note content unchanged

**Use cases:**

- Realizing note belongs in different context
- Reorganizing after project scope change
- Consolidating related work

## Workspace Workflows

### Project-Based Workspaces

**One workspace per active project:**

```
📱 Mobile App
   Pinned:
   - App Architecture
   - Current Sprint Plan
   - Design System
   Tabs:
   - Recent feature work
   - Bug reports
   - Meeting notes

🌐 Website Redesign
   Pinned:
   - Wireframes
   - Content Strategy
   - Brand Guidelines
   Tabs:
   - Page drafts
   - User research
```

**Benefits:**

- Clear project boundaries
- Easy context switching
- Project-specific quick access
- Reduced clutter

### Context-Based Workspaces

**Organize by work mode:**

```
🔥 Deep Work
   Pinned:
   - Current writing project
   - Research notes
   - Outline
   Tabs: Minimal or empty

💬 Communications
   Pinned:
   - Meeting templates
   - Team directory
   - Project status
   Tabs: Recent meetings

📚 Learning
   Pinned:
   - Course notes
   - Book highlights
   - Practice exercises
   Tabs: Current topics
```

**Benefits:**

- Match your mental state
- Appropriate tools for mode
- Minimize distractions
- Clear purpose

### Role-Based Workspaces

**Different hats you wear:**

```
👔 Management
   Pinned:
   - Team 1-1s
   - OKRs
   - Budget planning
   Tabs: Recent reports

🔧 IC Work
   Pinned:
   - Technical specs
   - Code documentation
   - Current implementation
   Tabs: Related research

📝 Writing
   Pinned:
   - Blog drafts
   - Style guide
   - Publication schedule
   Tabs: Research sources
```

### Temporal Workspaces

**Organize by timeframe:**

```
📅 This Week
   Pinned:
   - Weekly plan
   - Active tasks
   - Current meetings
   Tabs: In-progress work

🎯 Q1 Goals
   Pinned:
   - OKR tracker
   - Project roadmap
   - Key metrics
   Tabs: Goal-related notes

💡 Someday/Maybe
   Pinned:
   - Idea inbox
   - Future projects
   - Inspiration
   Tabs: Things to explore
```

### Hybrid Approach

**Combine strategies:**

```
📋 Daily (context: daily workflow)
🏢 Work Project A (project)
🏡 Home Renovation (project)
📚 Learning Web3 (context: learning)
💡 Ideas (temporal: future)
```

**Adapt to your needs:**

- Start simple (2-3 workspaces)
- Add as patterns emerge
- Delete when no longer useful
- Reorganize as work changes

## Advanced Workspace Techniques

### Workspace Templates

**Create template workspaces for recurring project types:**

**Example: New client project template**

1. Create workspace: "Client Template"
2. Pin standard notes:
   - Client brief template
   - Project timeline template
   - Communication log template
3. When new client arrives:
   - Create new workspace
   - Duplicate template notes
   - Pin in new workspace

### Workspace Rotation

**Seasonal or periodic workspace rotation:**

```
Monday-Wednesday:
- 🔬 Research workspace active
- Deep exploration
- Accumulate findings

Thursday-Friday:
- 📝 Writing workspace active
- Synthesize research
- Create content

Weekend:
- 💡 Ideas workspace active
- Free exploration
- Capture thoughts
```

### Archive Pattern

**Move completed projects to archive workspace:**

```
Active:
📱 Mobile App (current)
🌐 Website (current)
📊 Analytics (current)

Archive:
📦 Completed Projects
   Pinned:
   - Mobile App v1 (completed)
   - Old Website (completed)
   - Q4 Analysis (completed)
```

**Benefits:**

- Clean active workspace bar
- Preserve access to old work
- Clear completion
- Reduce clutter

### Focus Mode

**Single-workspace focus:**

1. Create "Focus" workspace
2. Pin only current critical work (1-3 notes)
3. No temporary tabs
4. Switch here for deep work
5. Minimal distractions

**Example:**

```
🎯 Focus
   Pinned:
   - Current writing draft
   Tabs: (empty)

Purpose: Eliminate everything except the one thing
```

## Best Practices

### Start Simple

**Begin with 2-3 workspaces:**

```
Week 1:
📋 Default (everything)

Week 2:
📋 General
🏢 Work

Week 3:
📋 Daily
🏢 Current Project
💡 Ideas

Let your system emerge organically
```

**Don't over-organize initially:**

- Let needs become clear
- Add workspaces as patterns emerge
- Delete if not using

### Name Intentionally

**Clear > Clever:**

- "Mobile App" > "🚀 The Big One"
- "Writing" > "Word Factory"
- "Research" > "🔬🧪🔭"

**Think future you:**

- Will you remember what "Project X" meant?
- Is the name still relevant after 3 months?
- Can collaborators understand it? (if sharing vault)

### Regular Maintenance

**Weekly review:**

```
Questions to ask:
1. Am I using all workspaces?
2. Are any workspaces duplicated?
3. Do names still make sense?
4. Should any be deleted/merged?
5. Are they in optimal order?
```

**Monthly cleanup:**

- Delete unused workspaces
- Consolidate similar ones
- Update names/icons
- Reorganize if needed

### Limit Workspace Count

**Recommended: 3-7 workspaces**

**Why:**

- Easy to scan visually
- Keyboard shortcuts work (Ctrl+1-9)
- Not overwhelming
- Clear purpose for each

**Too many workspaces:**

- Hard to remember which is which
- Defeats the purpose (too much organization)
- Context switching overhead
- Visual clutter

**If you have >7:**

- Ask: "Have I used this in the past month?"
- Consider: Can any be merged?
- Evaluate: Is this serving a purpose?

### Leverage Keyboard Shortcuts

**Muscle memory for first 3 workspaces:**

```
Ctrl+1: Your most-used workspace (often "Daily" or "General")
Ctrl+2: Second most-used (often current primary project)
Ctrl+3: Third most-used (often secondary project or reference)
```

**Practice:**

- Use shortcuts instead of clicking
- Builds automatic context switching
- Faster workflow

**Position matters:**

- Put most-used in slots 1-3
- Less-used can be 4-9
- Rarely-used beyond 9 (no shortcut)

### Trust the System

**Don't pre-optimize:**

- Create workspaces as needs arise
- Don't create "just in case"
- Let workflow drive structure

**Iterate:**

- Try an organization
- Use it for a week
- Adjust as needed
- Don't be afraid to delete/recreate

## Common Patterns

### The Starter Set

**Minimal, works for most people:**

```
📋 Daily
   - Today's daily note
   - Current tasks
   - Quick captures

🎯 Current Focus
   - Active project
   - Related resources
   - Work in progress

💡 Exploration
   - Research
   - Ideas
   - Learning
```

### The Professional Set

**Work-focused:**

```
📋 Daily
🏢 Primary Project
📊 Secondary Project
📚 Knowledge Base
💬 Meetings
```

### The Creative Set

**Content/creation-focused:**

```
📝 Writing
🎨 Design
🔬 Research
💡 Ideas
📋 Daily
```

### The Student Set

**Learning-focused:**

```
📋 Daily
📚 Current Course
🔬 Research Project
💡 Ideas & Notes
📝 Assignments
```

## Integration with Other Features

### Workspaces + Daily Notes

**Daily workspace pattern:**

```
📋 Daily workspace
   Pinned:
   - Today's daily note (auto or manual)
   - Weekly plan
   - Task list

   Temporary tabs:
   - Notes mentioned in daily
   - Follow-up items
   - Quick references
```

**Workflow:**

1. Start day in Daily workspace
2. Switch to project workspaces for focused work
3. Return to Daily for planning/review

### Workspaces + Pinned Notes

**Each workspace = different pins:**

Your pinned notes are **per workspace**, so:

- Mobile App workspace: Pins relevant to mobile work
- Website workspace: Pins relevant to web work
- No overlap unless needed

**Advantage:**

- Focused quick access
- No clutter from other contexts
- Appropriate tools for each context

### Workspaces + Temporary Tabs

**Tabs auto-manage per workspace:**

Opening notes in a workspace creates tabs in that workspace only.

**Benefits:**

- Context-appropriate tab history
- Switching workspaces = clean tab slate
- Tab archaeology per project

### Workspaces + Search

**Search is vault-wide:**

Workspaces don't affect search results—you can find any note from any workspace.

**Workflow:**

```
1. Search for note (Ctrl+O)
2. Open note (creates tab in current workspace)
3. Pin if appropriate for this context
4. Or switch workspace and move note there
```

### Workspaces + AI Agent

**Agent works across workspaces:**

The AI agent can access notes in any workspace, regardless of which is active.

**Workspace-aware requests:**

```
You: Show me what's pinned in my Mobile App workspace

AI: Mobile App workspace pins:
    - App Architecture
    - Current Sprint Plan
    - Design System
    - API Documentation
```

```
You: Switch to the Website workspace

AI: [Switches to Website workspace]
    Now viewing: Website workspace
    Pinned notes (3): Wireframes, Content Strategy, Brand Guidelines
```

## Troubleshooting

### Too Many Workspaces

**Problem:** 15+ workspaces, can't remember what's where.

**Solution:**

1. List all workspaces and their purpose
2. Delete any unused in past month
3. Merge similar ones
4. Target: 5-7 maximum
5. Consider if you need multiple vaults instead

### Lost Notes After Switching

**Problem:** "Where did my pinned notes go?"

**Explanation:** Each workspace has independent pins/tabs.

**Solution:**

1. Switch back to previous workspace
2. Notes are still there
3. If needed, move note to current workspace

### Can't Delete Last Workspace

**Problem:** Delete button disabled on last workspace.

**Explanation:** You must have at least one workspace.

**Solution:**

1. Create a new workspace first
2. Then delete the old one
3. Or just rename/repurpose the existing one

### Workspace Seems Empty

**Problem:** Switched workspace has no pins or tabs.

**Explanation:** New or unused workspaces start empty.

**Solution:**

1. Pin notes relevant to this context
2. Open notes (creates tabs)
3. Build the workspace organically

### Accidentally Deleted Workspace

**Problem:** Deleted workspace, lost pins/tabs organization.

**Notes:** Notes themselves are not deleted, just the workspace organization.

**Recovery:**

1. Create new workspace
2. Search for notes that were pinned
3. Re-pin them
4. Rebuild organization

**Prevention:**

- Regular reviews reduce accidental deletes
- Don't delete unless certain

## Workspaces vs. Vaults

**When to use workspaces:**

- Different projects in same domain
- Context switching within single knowledge base
- Same notes, different focal points
- Temporary or project-based organization

**When to use separate vaults:**

- Completely separate contexts (work vs. personal)
- Different privacy/security needs
- Separate knowledge bases
- Long-term major separation
- Different sync/backup needs

**Can combine:**

```
Vault: Work
  Workspaces:
  - Daily
  - Project A
  - Project B
  - Meetings

Vault: Personal
  Workspaces:
  - Daily
  - Home Projects
  - Learning
  - Ideas
```

**Workspaces are lighter:**

- Faster to switch
- Same search index
- Shared note types
- Single vault config

**Vaults are heavier:**

- Complete separation
- Independent configs
- Separate databases
- Different search indices

## Next Steps

- **[Organization Features](/features/organization)** - Understand pinned notes and tabs
- **[User Interface](/guides/interface)** - Navigate the workspace bar
- **[Multi-Vault](/features/vaults)** - Learn about vault-level separation
- **[Daily Notes](/features/daily-notes)** - Combine with daily workspace pattern

---

**Remember:** Workspaces are tools for reducing friction, not adding structure. Create them as needs emerge, delete them when they're no longer useful, and let your system evolve with your work. Start simple, iterate based on actual use, and don't over-organize.
