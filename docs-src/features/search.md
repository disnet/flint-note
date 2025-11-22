# Search and Discovery

Find anything in your notes instantly with Flint's powerful search system.

## Quick Search Overlay

The fastest way to find and open notes.

### Opening Quick Search

**Keyboard shortcut:**
- `Ctrl+O` (Windows/Linux) or `Cmd+O` (Mac)

**What it does:**
- Opens a full-screen overlay
- Searches as you type
- Shows instant results
- Works from anywhere in Flint

### How to Use

1. Press `Ctrl+O` / `Cmd+O`
2. Start typing (note title or content)
3. Results appear instantly
4. Use arrow keys to navigate results
5. Press Enter to open the selected note
6. Press ESC to close without opening

**Example workflow:**

```
1. Press Ctrl+O
2. Type "project"
3. See:
   - Website Redesign Project
   - Project Planning Template
   - Client Project Notes
4. Arrow down to select
5. Enter to open
```

### Search Behavior

**Fuzzy matching:**
- Handles typos: "wbsite" finds "Website"
- Partial matches: "proj" finds "Project"
- Out-of-order: "redesign web" finds "Website Redesign"

**What's searched:**
- Note titles (highest priority)
- Note content
- Metadata values
- Tags

**Result ordering:**
- Title matches first
- Recent notes prioritized
- Fuzzy matches last

### Opening Behavior

When you open a note from quick search:
- Creates a **temporary tab** in left sidebar
- Adds to navigation history
- Focuses the note for immediate reading/editing

## Full-Text Search

Comprehensive search across all notes with advanced filtering.

### Search Syntax

**Basic search:**
```
search term
```
Finds notes containing "search term" anywhere.

**Exact phrase:**
```
"exact phrase here"
```
Finds notes with that exact phrase.

**Multiple terms (AND):**
```
term1 term2
```
Finds notes containing both terms.

### Search Operators

Filter and refine your searches with operators.

#### Type Filter

Find notes of a specific type:

```
type:meeting
type:project
type:daily
```

**Example:**
```
type:meeting api design
```
Finds meeting notes about "api design"

#### Tag Filter

Find notes with specific tags:

```
tag:important
tag:project-alpha
```

**Combine tags:**
```
tag:important tag:urgent
```
Finds notes with BOTH tags.

#### Date Filters

Find notes by creation date:

**Today's notes:**
```
created:today
```

**Specific date:**
```
created:2024-01-15
```

**Date range:**
```
created:>2024-01-01
created:<2024-02-01
created:>=2024-01-01
```

**Relative dates:**
```
created:today
created:yesterday
created:this-week
created:last-week
created:this-month
```

**Combined date filter:**
```
created:>2024-01-01 created:<2024-02-01
```
Finds notes created in January 2024.

### Combining Operators

Use multiple operators together:

**Example 1: Project meetings this week**
```
type:meeting tag:project created:this-week
```

**Example 2: Important API notes**
```
tag:important api design
```

**Example 3: Recent project documents**
```
type:project created:>2024-01-01
```

### Search via AI Agent

Ask the AI to search for you:

**Natural language search:**
```
You: Find all meeting notes from last week about the API

AI: [Searches with: type:meeting created:last-week api]

    I found 3 meeting notes from last week mentioning API:

    1. Team Standup (Jan 8) - API design discussion
    2. Client Review (Jan 9) - API feedback
    3. Planning Session (Jan 12) - API roadmap

    Would you like me to summarize them?
```

**Complex queries:**
```
You: Show me all incomplete tasks tagged as urgent that are overdue

AI: [Searches and filters]

    I found 5 urgent, overdue tasks:

    1. [Task name] - Due Jan 10
    2. [Task name] - Due Jan 12
    ...
```

## Advanced Search Features

### FTS5 Full-Text Search

Flint uses SQLite's **FTS5** (Full-Text Search 5) for fast, comprehensive search.

**Benefits:**
- **Blazing fast** - Indexes all note content
- **Fuzzy matching** - Finds similar terms
- **Relevance ranking** - Best matches first
- **Stemming** - Finds variations (run, running, ran)
- **Phrase search** - Exact phrase matching

### Search Highlighting

When you search, Flint highlights matches in results:

- **Title matches** - Highlighted in result list
- **Content previews** - Shows surrounding context
- **Match count** - Shows number of matches per note

### Search Scope

**What's indexed:**
- All note content
- Note titles
- Metadata fields
- Tag values

**What's NOT indexed:**
- Binary files (images, PDFs)
- Note types (just the type name is indexed)

**Re-indexing:**

If search seems incorrect:
1. Go to Settings → Database
2. Click "Rebuild Database"
3. Wait for re-indexing to complete

## Search Best Practices

### Start Broad, Then Filter

**Good approach:**
```
1. Search: "design"
   → 50 results

2. Add filter: "design type:project"
   → 10 results

3. Add date: "design type:project created:this-month"
   → 3 results
```

**Avoid starting too specific:**
```
❌ type:project tag:important tag:urgent created:>2024-01-01 api
   → May miss relevant notes

✓ api
   → Then filter down
```

### Use Tags for Findability

**Tag notes with findable terms:**

```yaml
---
title: Product Launch Plan
tags: [launch, product, marketing, Q1-2024]
---
```

Now searchable by:
- `tag:launch`
- `tag:product`
- `tag:Q1-2024`

### Create Index Notes

For complex topics, create an index note:

```markdown
# API Design Index

Related notes:
- [[API Design Principles]]
- [[RESTful API Guide]]
- [[GraphQL vs REST]]
- [[API Versioning Strategy]]

See also: [[Architecture Decisions]], [[Technical Standards]]
```

Search for "api design" → Find index → Navigate to specific topics.

### Use Consistent Naming

**Good naming conventions:**
```
✓ meeting-2024-01-15-standup.md
✓ project-website-redesign.md
✓ client-acme-corp.md
```

**Inconsistent naming:**
```
❌ mtg_jan15.md
❌ standupmeeting.md
❌ meeting.md
```

Consistent names make search predictable.

## Finding Connections

### Backlinks Search

To find all notes that reference a specific note:

1. Open the note
2. Check the **Backlinks tab** (right sidebar)
3. See all notes linking to this one

**Via AI:**
```
You: What notes reference this one?

AI: This note is referenced by:
    - [[Project Overview]]
    - [[Team Meeting Notes]]
    - [[Action Items]]
```

### Finding Broken Links

Find wikilinks that point to non-existent notes:

**Via AI:**
```
You: Find broken links in my vault

AI: [Searches for broken wikilinks]

    I found 3 broken links:

    In "Project Plan":
    - [[Team Structure]] - note doesn't exist
    - [[Budget Approval]] - note doesn't exist

    In "Meeting Notes":
    - [[Sarah's Report]] - note doesn't exist

    Would you like me to create these notes?
```

### Finding Similar Notes

Let AI help discover related content:

```
You: Find notes similar to this one

AI: Based on content, links, and tags, here are similar notes:

    1. [[API Architecture]] - discusses similar patterns
    2. [[System Design]] - shares 3 wikilinks
    3. [[Technical Decisions]] - similar tags

    Would you like me to add links to these?
```

## Search Shortcuts

Master these for power-user efficiency:

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` / `Cmd+O` | Open quick search |
| Type search term | Search starts immediately |
| `↑` `↓` | Navigate results |
| `Enter` | Open selected note |
| `ESC` | Close search |
| `Ctrl+F` / `Cmd+F` | Find in current note |

## Search Examples

### Example 1: Find Recent Meeting Notes

**Goal:** Find all meetings from the past week

**Search:**
```
type:meeting created:this-week
```

**Result:** All meeting notes created in the last 7 days.

### Example 2: Find High-Priority Tasks

**Goal:** Find incomplete tasks marked as high priority

**Via AI:**
```
You: Show me high-priority tasks that aren't done

AI: [Searches: type:task priority:high status:pending]

    Found 7 high-priority pending tasks...
```

### Example 3: Find Notes Mentioning Multiple Topics

**Goal:** Find notes about both "API" and "authentication"

**Search:**
```
api authentication
```

**Result:** Notes containing both terms.

### Example 4: Find All Notes by Tag

**Goal:** Find everything tagged "research"

**Search:**
```
tag:research
```

**Result:** All notes with the "research" tag.

### Example 5: Find Notes in Date Range

**Goal:** Find notes created in January 2024

**Search:**
```
created:>=2024-01-01 created:<2024-02-01
```

**Result:** Notes from January 2024.

## Troubleshooting Search

### Search Not Finding Expected Results

**Problem:** Search doesn't find notes you know exist.

**Solutions:**

1. **Rebuild database:**
   - Settings → Database → Rebuild Database
   - Fixes index corruption

2. **Check spelling:**
   - Fuzzy matching helps, but won't catch everything
   - Try alternate terms

3. **Broaden search:**
   - Remove filters
   - Try synonyms
   - Check tags vs content

### Search Is Slow

**Problem:** Search takes several seconds.

**Solutions:**

1. **Rebuild index:**
   - Settings → Database → Rebuild Database

2. **Check vault size:**
   - Very large vaults (>10,000 notes) may be slower
   - Consider splitting into multiple vaults

3. **Restart Flint:**
   - Occasionally clears performance issues

### Too Many Results

**Problem:** Search returns hundreds of results.

**Solutions:**

1. **Add filters:**
   ```
   Before: design
   After:  type:project tag:current design
   ```

2. **Use exact phrases:**
   ```
   Before: api design
   After:  "api design"
   ```

3. **Add date filters:**
   ```
   Before: meeting notes
   After:  type:meeting created:this-month
   ```

## Next Steps

- **[Wikilinks and Backlinks](/features/wikilinks)** - Navigate by connections
- **[AI Agent](/features/agent)** - Use AI for complex searches
- **[Note Management](/features/notes)** - Organize for better findability
- **[Tags](/features/notes#tags)** - Tag strategically for search

---

**Pro tip:** The best search is the one you don't have to do. Create wikilinks as you write, and you'll navigate by association instead of searching.
