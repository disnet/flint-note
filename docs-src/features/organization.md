# Organization Features

Master Flint's organizational tools: pinned notes, temporary tabs, and navigation.

## Overview

Flint provides multiple ways to organize and access your notes:

**Pinned Notes:**

- Permanent quick access
- Most important notes
- Manually curated

**Temporary Tabs:**

- Arc browser-style ephemeral tabs
- Recently accessed notes
- Automatic management

**Navigation History:**

- Browser-style back/forward
- Track your path through notes
- Jump to previous contexts

Together, these create a flexible system for both permanent structure and fluid exploration.

## Pinned Notes

**Pinned notes** are notes you want constant, immediate access to.

### What to Pin

**Good candidates:**

- Your daily note
- Active project notes
- Reference materials (style guides, templates)
- Frequently accessed notes
- Current focus areas

**Examples:**

```
Pinned:
- Today's Daily Note
- Current Sprint Plan
- Team Directory
- Code Style Guide
- Quick Reference
```

**Don't pin:**

- Everything (defeats the purpose)
- Archived projects
- Rarely accessed notes
- Notes you'll find via search

**Sweet spot: 5-10 pins**

- Enough for quick access
- Not so many you can't scan them
- Easy to find what you need

### Pinning Notes

**Method 1: Right-click menu**

1. Right-click any note (in list, temporary tab, or open note)
2. Select "Pin to Sidebar"
3. Note appears in pinned section

**Method 2: Pin button**

1. Open the note
2. Click pin icon in editor header
3. Note pinned

**Method 3: Via AI**

```
You: Pin this note to sidebar

AI: [Pins current note]

    ✓ Pinned "Project Overview" to sidebar
```

**Method 4: Drag and drop** (future)

Drag from temporary tabs to pinned section.

### Pinned Notes Section

**Location:** Top of left sidebar

**Display:**

```
📌 PINNED
   📅 Today's Daily Note
   📊 Q1 Projects
   👥 Team Directory
   📝 Meeting Template
   🎨 Design System
```

**Features:**

- Note type icons
- Note titles
- Visual grouping
- Quick click access

### Organizing Pinned Notes

**Reordering:**

1. Click and hold a pinned note
2. Drag up or down
3. Drop in new position
4. Order persisted

**Grouping strategy:**

```
Top (most frequent):
- Today's daily note
- Current active project

Middle (reference):
- Team info
- Style guides
- Templates

Bottom (occasional):
- Long-running projects
- Resources
```

**By workflow:**

```
Morning routine:
- Daily note
- Task list
- Calendar

Active work:
- Current project
- Related docs

Reference:
- Guides
- Templates
```

### Unpinning Notes

**When to unpin:**

- Project completed
- No longer accessing frequently
- Replaced by something more relevant

**How to unpin:**

1. Right-click pinned note
2. Select "Unpin from Sidebar"
3. Note removed from pinned section

**Or:**

- Click pin icon again (toggles off)

**Note still exists:**

- Just not in sidebar
- Find via search
- Still in note collection

### Pinned Notes Persistence

**Per vault:**

- Each vault has its own pinned notes
- Switch vaults = different pins
- Appropriate for context

**Stored locally:**

- `{userData}/pinned-notes/{vaultId}.json`
- Survives app restarts
- Syncs with vault data

**Backup included:**

- Part of vault data
- Backed up automatically if syncing vault

## Temporary Tabs

**Temporary tabs** provide ephemeral access to recently viewed notes, inspired by Arc browser.

### What are Temporary Tabs?

**Ephemeral quick access:**

- Notes you've recently opened
- Automatically created
- Automatically cleaned up
- Convertible to pinned

**The Arc browser model:**

- Tabs for exploration
- Don't clutter permanent structure
- Auto-cleanup after 24 hours
- Pin what matters

**In Flint:**

- Open note via search → Creates temporary tab
- Open note via wikilink → Creates temporary tab
- Open from pinned note → Opens directly, no tab
- Click temporary tab → Reopens that note

### How Temporary Tabs Work

**Automatic creation:**

**From search (`Ctrl+O`):**

```
1. Press Ctrl+O
2. Search for "project"
3. Select "Project Overview"
4. Note opens
5. Temporary tab created
```

**From wikilinks:**

```
Reading Note A
Click [[Note B]]
Note B opens
Temporary tab created for Note B
```

**From AI:**

```
You: Open the project overview note

AI: [Opens note, creates temporary tab]
```

**Reusing existing tabs:**

- If tab already exists for that note
- Clicking it again just opens it
- Doesn't create duplicate

### Temporary Tabs Section

**Location:** Left sidebar, below pinned notes

**Display:**

```
🕒 TEMPORARY
   × General Ideas
   × API Documentation
   × Meeting Notes - Jan 15
   × Research Paper Summary
   [Close All]
```

**Features:**

- Individual close buttons (`×`)
- "Close All" button
- Source tracking (where tab came from)
- 24-hour auto-cleanup

### Managing Temporary Tabs

**Closing individual tabs:**

- Click `×` next to tab name
- Tab removed
- Note still exists, just not in sidebar

**Close all tabs:**

- Click "Close All" button
- Removes all temporary tabs
- Clean slate for new exploration

**Converting to pinned:**

**When you realize a note is important:**

1. Right-click temporary tab
2. Select "Pin to Sidebar"
3. Moves from temporary to pinned
4. Now permanent quick access

**Or:**

- Click pin icon while note is open

### Source Tracking

Temporary tabs remember how they were created:

**Metadata stored:**

- Created from search
- Created from wikilink (which note)
- Created from AI action
- Timestamp

**View source** (future):

- Hover over tab
- See "Opened from: [[Previous Note]]"
- Understand your navigation path

### Automatic Cleanup

**24-hour rule:**

- Tabs older than 24 hours are removed
- Cleanup happens on app start
- Also periodic cleanup while running

**Why cleanup:**

- Prevent clutter
- Keep only recent exploration
- Encourage pinning what's important

**Preservation:**

- Pin before 24 hours if you want to keep it
- Or just reopen later (will create new tab)

### Temporary Tabs Best Practices

**Use for exploration:**

- Following wikilink chains
- Search results
- Quick references
- Temporary context

**Pin when:**

- Accessing note multiple times
- Part of current work
- Want permanent access
- Important reference

**Don't worry about cleanup:**

- Let the system clean up
- Reopen if needed later
- Trust the process

**Example workflow:**

```
Monday morning:
- Search for project notes (creates 5 temporary tabs)
- Work with them throughout day
- Pin the 2 most important
- Let others expire overnight

Tuesday morning:
- Those 2 notes still pinned
- Old temporary tabs cleaned up
- Start fresh exploration
```

## Navigation History

Track your path through notes with browser-style navigation.

### How It Works

**Every navigation tracked:**

- Opening a note
- Following a wikilink
- Searching and opening
- AI opening a note

**Stack maintained:**

- Current position in history
- Can go back to previous notes
- Can go forward if you went back

**Example history:**

```
1. Daily Note (starting point)
2. Project Overview (clicked link)
3. API Documentation (clicked link)
4. Implementation Notes (clicked link)
← Back to API Documentation
← Back to Project Overview
→ Forward to API Documentation
→ Forward to Implementation Notes
```

### Navigation Controls

**Back button** (future UI):

- Go to previous note
- Keyboard: `Ctrl+[` / `Cmd+[`

**Forward button** (future UI):

- Go to next note (if you went back)
- Keyboard: `Ctrl+]` / `Cmd+]`

**History dropdown** (future):

- See full history
- Click any entry to jump there

### Current Implementation

**Via AI:**

```
You: Go back to the previous note I was viewing

AI: [Navigates to previous note in history]

    Opened: Project Overview
    (You were viewing this before API Documentation)
```

**Navigation shortcuts:**

- Pinned notes bypass history (direct access)
- Temporary tabs reopen notes (adds to history)

### History Persistence

**Per vault:**

- Each vault has separate history
- Switch vaults = switch history context

**Stored locally:**

- `vault-data/{vaultId}/navigation-history.json`
- Survives app restarts
- Recent history maintained

**Limits:**

- Last 100 navigations stored
- Older history dropped
- Keeps memory usage reasonable

## Organizing Your Workflow

### The Three-Tier System

**Tier 1: Pinned (Permanent Structure)**

```
What: 5-10 most important notes
When: Always visible
Use: Current focus, references, daily notes
```

**Tier 2: Temporary Tabs (Active Exploration)**

```
What: Recently accessed notes
When: Within 24 hours
Use: Following links, search results, current research
```

**Tier 3: Search (Everything Else)**

```
What: All other notes
When: As needed
Use: Find anything not in tiers 1-2
```

### Example Workflows

**Daily Work:**

```
Morning:
1. Pin: Today's daily note
2. Pin: Current project
3. Search & explore (temporary tabs accumulate)
4. Pin particularly useful finds
5. End of day: Close some temporary tabs

Evening:
- Review temporary tabs
- Pin 1-2 more if needed
- Let rest clean up overnight
```

**Research Project:**

```
Starting research:
1. Create project hub note
2. Pin the hub
3. Follow links (temporary tabs)
4. Take notes in hub
5. Pin 2-3 key references
6. Let exploration tabs cycle

Completing research:
- Unpin the hub
- Create summary note
- Pin summary if ongoing reference
```

**Writing/Creating:**

```
Active writing:
1. Pin the draft note
2. Pin outline/structure note
3. Research (temporary tabs)
4. Reference materials (pin or temporary)

After shipping:
- Unpin draft
- Archive or move to completed
- Clean up
```

### Combining with Other Features

**With Daily Notes:**

```
Pinned:
- Today's daily note
- Current project

Temporary:
- Notes you mentioned in daily
- Meeting notes from today
- References you looked up
```

**With AI:**

```
You: Show me my pinned notes and temporary tabs

AI: Pinned notes (5):
    - Today's Daily Note
    - Q1 Project Plan
    - Team Directory
    - API Guide
    - Style Guide

    Temporary tabs (7):
    - Meeting Notes (opened 2 hours ago)
    - Code Review (opened 1 hour ago)
    - Design Mockups (opened 30 min ago)
    ... (4 more)

    Recommendation: Pin "Meeting Notes" if recurring reference
```

**With Search:**

```
Workflow:
1. Search for topic (Ctrl+O)
2. Explore results (temporary tabs)
3. Pin winners
4. Close tabs when done
```

## Best Practices

### Keep Pinned Notes Lean

**Regularly review:**

- Weekly: Check if all pins still relevant
- Monthly: Major cleanup
- Project end: Unpin completed work

**Questions to ask:**

- "Have I accessed this in the past week?"
- "Is this for current work or future reference?"
- "Can I find this easily via search?"

**If no to these, unpin it.**

### Trust Temporary Tabs

**Don't manually manage them:**

- Let them accumulate during exploration
- Pin what proves important
- Let cleanup happen automatically

**Don't pre-emptively pin:**

- Access note a few times first
- If keeps coming up, then pin
- Avoid "just in case" pins

### Use Navigation History

**Think in paths:**

- "How did I get here?"
- "What was I looking at before?"
- "Retrace my steps"

**Navigate intentionally:**

- Back to context
- Forward to destination
- Jump via history

### Establish Routines

**Morning routine:**

```
1. Pin today's daily note (if not auto-pinned)
2. Check temporary tabs from yesterday
3. Pin anything that proved useful
4. Close the rest
```

**End of day:**

```
1. Review temporary tabs
2. Pin important discoveries
3. Close obvious one-offs
4. Tomorrow: clean slate
```

**Weekly review:**

```
1. Review all pins
2. Unpin completed projects
3. Reorganize if needed
4. Check for dead pins
```

## Troubleshooting

### Too Many Pins

**Problem:** 20+ pinned notes, can't find anything.

**Solution:**

1. Ask: "Which have I accessed this week?"
2. Unpin the rest
3. Target: 10 or fewer
4. Use temporary tabs for exploration

### Temporary Tabs Not Cleaning Up

**Problem:** Old tabs still visible after 24 hours.

**Solution:**

1. Restart Flint (triggers cleanup)
2. Check if notes were recently accessed (resets timer)
3. Manually close with "Close All"

### Lost My Place

**Problem:** Can't remember which notes I was working with.

**Solutions:**

1. Check temporary tabs (recent access)
2. Check navigation history (via AI)
3. Search for recent notes: `created:today`
4. Check daily note for links/references

## Advanced Techniques

### Context Switching

**Multiple projects:**

```
Project A mode:
- Pin Project A notes
- Work on Project A
- Accumulate Project A tabs

Switch to Project B:
- Close all tabs
- Unpin Project A notes
- Pin Project B notes
- Fresh context
```

**Or use multiple vaults for major context switches.**

### Progressive Pinning

**Start minimal:**

- Begin with daily note only
- Let needs emerge
- Pin as patterns become clear

**Example evolution:**

```
Week 1: Just daily note
Week 2: + Current project
Week 3: + Team directory, Style guide
Week 4: + Most-referenced docs
Month 2: Stable set of 7-8 pins
```

### Tab Archaeology

**Before cleanup:**

```
Review temporary tabs:
- What did I explore today?
- What themes emerged?
- What deserves permanence?
- What was dead-end?

Document in daily note:
"Explored [[Topic X]] today via:
- [[Note A]]
- [[Note B]]
- [[Note C]]

[[Note A]] particularly useful - pinned."
```

Builds awareness of your thinking patterns.

## Next Steps

- **[User Interface Guide](/guides/interface)** - Understand sidebar sections
- **[Daily Notes](/features/daily-notes)** - Pin your daily note

---

**Remember:** Organization isn't about perfect structure—it's about reducing friction. Pin what you need now, explore freely with temporary tabs, and trust search for everything else. Your system should evolve with your work, not constrain it.
