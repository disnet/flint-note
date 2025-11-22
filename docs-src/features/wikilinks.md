# Wikilinks and Backlinks

Build a web of connected knowledge with bidirectional links between your notes.

## What are Wikilinks?

**Wikilinks** are Flint's way of connecting notes together. They're inspired by wikis (like Wikipedia) where every page links to related pages.

**Key features:**

- Simple `[[Note Title]]` syntax
- Clickable navigation
- Automatic backlink tracking
- Link updating on rename
- Non-existent note creation

**Why use wikilinks?**

- Build a knowledge graph of connected ideas
- Navigate by association, not folder hierarchy
- Discover unexpected connections
- See all references to a concept

## Basic Wikilink Syntax

### Title-Based Links

The simplest form - link by note title:

```markdown
I discussed this in [[My Project Notes]].

Related concepts: [[API Design]], [[System Architecture]]
```

**How it works:**

- Type `[[` to trigger autocomplete
- Start typing the note title
- Select from suggestions (or keep typing)
- Type `]]` to close (or press Enter in autocomplete)

**Matching:**

- Finds notes by title
- Fuzzy matching helps with typos
- Case-insensitive

### Path-Based Links

Link using the note's path (type/filename):

```markdown
See [[projects/website-redesign]] for details.
```

**Format:**

```
[[type/filename]]
```

**Examples:**

```markdown
[[meetings/2024-01-15-standup]]
[[projects/mobile-app]]
[[general/ideas]]
```

**When to use:**

- Multiple notes with similar titles
- More explicit about which note
- Clearer in documentation

### Custom Display Text

Show different text than the note title:

```markdown
The [[projects/website-redesign|Website Project]] is progressing well.

See [[API Design Principles|our design principles]].
```

**Syntax:**

```
[[target|Display Text]]
```

**Use cases:**

- Better reading flow
- Different context needs different phrasing
- Abbreviations or full names

**Examples:**

```markdown
[[daily/2024-01-15|yesterday's note]]
[[team-members/sarah-johnson|Sarah]]
[[technical-architecture-decision-001|TAD-001]]
```

## Creating Links

### Manual Creation

**Method 1: Autocomplete**

1. Type `[[`
2. Autocomplete appears
3. Type to filter notes
4. Arrow keys to select
5. Enter to insert
6. Type `]]` if needed

**Method 2: Type directly**

```markdown
[[Note Title]]
```

Just type the complete wikilink. If the note exists, it'll link. If not, you can create it.

**Method 3: Select text**

1. Select text in your note
2. Right-click → "Create Wikilink"
3. Search for target note
4. Link created with selected text as display

### AI-Assisted Linking

Let the AI suggest links:

```
You: What notes should I link from here?

AI: Based on your content, I suggest linking to:
    - [[Project Overview]] - mentions same project
    - [[API Design]] - discusses similar architecture
    - [[Team Decisions]] - related decisions

    Would you like me to add these links?
```

**Bulk linking:**

```
You: Find all notes mentioning "authentication" and add links to my Auth Guide note

AI: [Searches, adds wikilinks]

    Added links in 7 notes:
    - API Documentation
    - Security Guidelines
    - Meeting Notes (3 instances)
    - Project Plan
    - Technical Decisions
```

## Following Links

### Click to Navigate

**Click any wikilink:**

- Opens the target note
- Creates a temporary tab
- Adds to navigation history
- Preserves your current note

**Keyboard navigation:**

- `Ctrl+Click` / `Cmd+Click` - Open in new tab (future)
- Regular click - Open in main view

### Link to Non-Existent Notes

**Red/broken links** indicate the note doesn't exist yet.

**Click a broken link:**

1. Flint prompts: "Note doesn't exist. Create it?"
2. Choose note type
3. Note created with that title
4. Opens for editing

**Use case - Outlining:**

```markdown
# Project Plan

## Research Phase

- [[Market Analysis]] (create later)
- [[Competitor Research]] (create later)
- [[User Interviews]] (create later)

## Design Phase

- [[Wireframes]] (create later)
- [[Design System]] (create later)
```

Create the structure first, fill in details later.

### Link Popup (Hover)

**Hover over a wikilink** (future feature):

- Shows note preview
- Quick actions: Open, Edit, Delete
- Metadata preview

## Backlinks

**Backlinks** are the reverse of wikilinks - notes that link to the current note.

### Viewing Backlinks

**Backlinks tab** (right sidebar):

- Shows all notes linking to current note
- Context snippet around each link
- Click to navigate

**Example:**

```
Backlinks (4)

📄 Project Overview
  "...main technical details in [[System Architecture]]..."

📋 Meeting Notes - Jan 15
  "...discussed [[System Architecture]] decisions..."

✓ Implementation Plan
  "...follows the [[System Architecture]]..."

📄 Team Onboarding
  "...review [[System Architecture]] document..."
```

### Why Backlinks Matter

**Discover connections:**

- See where a concept is referenced
- Find related context you forgot
- Understand note's importance (many backlinks = central concept)

**Navigate your graph:**

- Jump between connected ideas
- Follow thought trails
- Explore relationships

**Verify orphans:**

- Notes with no backlinks might be disconnected
- Consider linking them to related notes
- Or archive if no longer relevant

### Backlink Context

Each backlink shows **surrounding text**:

```
"...we need to consider [[Security Guidelines]] when
implementing authentication..."
```

**Benefits:**

- Remember why the link was made
- Understand the connection
- Decide if it's worth navigating

## Link Management

### Automatic Link Updates

When you rename a note, **all wikilinks update automatically**.

**Example:**

1. Note titled "Project Alpha" has 5 wikilinks to it
2. Rename to "Mobile App Project"
3. All 5 links automatically update to `[[Mobile App Project]]`

**What updates:**

- Title-based links
- Path-based links (if filename changes)
- Display text (optional - you can keep old display)

**No broken links!**

### Finding Broken Links

**Via AI:**

```
You: Find broken links in my vault

AI: I found 3 broken wikilinks:

    In "Project Plan":
    - [[Team Structure]] (doesn't exist)

    In "Meeting Notes":
    - [[Q1 Goals]] (doesn't exist)
    - [[Budget Approval]] (doesn't exist)
```

**Fix broken links:**

1. **Create the notes:**

   ```
   You: Create those missing notes
   AI: [Creates them with basic structure]
   ```

2. **Update the links:**

   ```
   You: Change [[Team Structure]] to [[Organization Chart]]
   AI: [Updates the link]
   ```

3. **Remove the links:**
   ```
   You: Remove broken links
   AI: [Converts to plain text]
   ```

### Link Types (Proposed)

Future feature - typed relationships:

```markdown
[[Project Overview|supports]]
[[API Design|contradicts]]
[[User Research|informs]]
```

This would enable:

- Semantic connections
- Relationship filtering
- Graph analysis

## Building a Knowledge Graph

### Linking Strategies

**1. Link as you write:**

Don't wait to organize - link immediately:

```markdown
# New Idea

This relates to [[Previous Idea]] and builds on
[[Foundational Concept]].

Different from [[Alternative Approach]] because...
```

**2. Link abundantly:**

More links = better. Don't worry about "over-linking":

```markdown
The [[API]] uses [[REST]] principles with [[JWT]] for
[[Authentication]]. See [[Security Guidelines]] and
[[API Design Principles]].
```

Each link is a potential path for future discovery.

**3. Link both directions:**

If A relates to B, mention it in both:

**Note A:**

```markdown
This concept connects to [[Note B]].
```

**Note B:**

```markdown
Related to [[Note A]], but different because...
```

Bidirectional mentions strengthen connections.

### Hub Notes

Create **hub notes** (also called MOCs - Maps of Content):

```markdown
# API Design Hub

## Core Principles

- [[REST Principles]]
- [[API Versioning]]
- [[Error Handling]]

## Authentication

- [[JWT Implementation]]
- [[OAuth Flow]]
- [[API Keys]]

## Documentation

- [[API Documentation Guide]]
- [[OpenAPI Spec]]

## Examples

- [[User API Example]]
- [[Product API Example]]
```

**Benefits:**

- Entry point for a topic
- Overview of related concepts
- Curated organization
- Easy discovery

### Zettelkasten Method

Flint works great for Zettelkasten:

**1. Atomic notes:**

```markdown
# Atomic Note Example

One concept per note. Keep it focused.

Links to: [[Related Concept A]], [[Related Concept B]]
```

**2. Link liberally:**
Every note connects to related notes.

**3. Emergence over planning:**
Don't pre-plan structure. Let it emerge from connections.

**4. Hub notes for structure:**
Create index notes when clusters form.

## Advanced Linking Patterns

### Inline References

Reference specific sections:

```markdown
See the authentication section in [[API Documentation]].

As discussed in [[Meeting Notes#Action Items]].
```

(Section linking is a future feature)

### Embed Content

Transclude note content:

```markdown
![[Daily Template]]
```

Shows the content inline. (Future feature)

### Link Aliases

Define aliases for commonly referenced notes:

```markdown
---
aliases: [WP, WebProj, Web Redesign]
---

# Website Project
```

Now linkable via any alias:

```markdown
[[WP]]
[[WebProj]]
[[Web Redesign]]
```

(Aliases are a planned feature)

## Visualizing Connections

### Graph View (Planned)

Visual representation of your knowledge graph:

- Nodes = Notes
- Edges = Wikilinks
- Clusters = Related topics
- Orphans = Disconnected notes

**Interactions:**

- Click node → Open note
- Zoom in/out
- Filter by type/tag
- Highlight connections

### Link Analysis

**Via AI:**

```
You: Analyze the connections in my vault

AI: Your vault has:
    - 247 notes
    - 1,342 wikilinks
    - Average 5.4 links per note

    Most connected notes:
    1. System Architecture (47 backlinks)
    2. Project Overview (32 backlinks)
    3. API Design (28 backlinks)

    Orphaned notes: 12
    (notes with no links in or out)
```

## Best Practices

### Link Generously

**Don't overthink linking:**

- If you mention a concept that has a note, link it
- If unsure, err on the side of linking
- You can always remove links later

**Example:**

```markdown
❌ Today I worked on the authentication system.

✓ Today I worked on the [[Authentication System]].
```

### Create Notes for Concepts

**If you mention a concept multiple times, create a note:**

1. Notice you've written "API design principles" 5 times
2. Create `[[API Design Principles]]` note
3. Link from all 5 places
4. Capture the concept once, centrally

### Use Descriptive Titles

**Good titles:**

```
[[Authentication System Architecture]]
[[User Interview - Sarah Johnson]]
[[Weekly Meeting 2024-01-15]]
```

**Avoid:**

```
[[Notes]]
[[Stuff]]
[[Temp]]
```

Descriptive titles make links meaningful.

### Review Backlinks Regularly

**Periodically check backlinks:**

- Discover forgotten connections
- Find notes to expand
- Identify important concepts (many backlinks)

**Workflow:**

```
1. Open a note
2. Check Backlinks tab
3. Follow interesting connections
4. Update/expand as needed
```

### Link to Evergreen Notes

Create **evergreen notes** (permanent, refined notes):

```markdown
# Evergreen: API Design Principles

(Timeless principles, regularly updated)

## Principle 1: Consistency

...

## Principle 2: Simplicity

...
```

Link to these from temporary notes:

```markdown
# Daily Note - Jan 15

Working on API design. Reviewing [[API Design Principles]].
```

Evergreen notes become hubs of knowledge.

## Common Patterns

### Meeting → Project Links

```markdown
# Meeting Notes - Jan 15

Project: [[Website Redesign]]

Action items:

- Update [[Design System]]
- Review [[User Feedback]]
```

### Project → Task Links

```markdown
# Website Redesign Project

## Tasks

- [[Task: Update Homepage]]
- [[Task: Implement Search]]
- [[Task: Mobile Optimization]]
```

### Literature Notes → Permanent Notes

```markdown
# Book: Atomic Habits

Key idea: [[Identity-based habits are more effective]]

This connects to [[Behavior Change Framework]]
```

### Index → Topic Notes

```markdown
# Programming Languages Index

## Languages

- [[JavaScript]]
- [[Python]]
- [[Rust]]
- [[Go]]

## Concepts

- [[Type Systems]]
- [[Memory Management]]
```

## Troubleshooting

### Links Not Working

**Problem:** Wikilink doesn't navigate.

**Solutions:**

1. Check spelling of note title
2. Verify note exists (search for it)
3. Use path-based link: `[[type/filename]]`
4. Rebuild database: Settings → Database → Rebuild

### Backlinks Not Showing

**Problem:** Expected backlinks missing.

**Solutions:**

1. Verify the link exists (search for it in the source note)
2. Rebuild database: Settings → Database → Rebuild
3. Check that both notes are in current vault

### Broken Links After Rename

**Problem:** Links broke when renaming a note.

**This shouldn't happen!** Flint auto-updates links.

**If it does:**

1. Report the bug
2. Manually update links (or use AI to help)
3. Verify file wasn't renamed externally

## Next Steps

- **[Note Management](/features/notes)** - Create linkable notes
- **[Search](/features/search)** - Find notes to link
- **[AI Agent](/features/agent)** - AI-assisted linking
- **[Daily Notes](/features/daily-notes)** - Link from daily journal

---

**Pro tip:** The quality of your knowledge graph isn't in perfect organization—it's in the connections you make. Link liberally, and let insights emerge from the web of ideas.
