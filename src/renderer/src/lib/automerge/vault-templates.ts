/**
 * Vault template and onboarding content definitions
 */

import type { PropertyDefinition } from './types';

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceTemplate {
  name: string;
  icon: string;
}

export interface NoteTypeTemplate {
  name: string;
  purpose: string;
  icon: string;
  properties?: PropertyDefinition[];
}

export interface TemplateNote {
  title: string;
  content: string;
  /** Name of the note type to use (must match a noteType name in the template) */
  typeName?: string;
  /** Property values for the note (keys must match property names in the note type) */
  props?: Record<string, unknown>;
  /** Whether this note should be pinned in the sidebar */
  pinned?: boolean;
}

export interface VaultTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  workspaces: WorkspaceTemplate[];
  noteTypes: NoteTypeTemplate[];
  notes: TemplateNote[];
}

export interface OnboardingNote {
  title: string;
  content: string;
  /** Whether this note should be pinned in the sidebar */
  pinned?: boolean;
}

export interface OnboardingOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  notes: OnboardingNote[];
}

// ============================================================================
// Vault Templates
// ============================================================================

// Sample notes for Personal Knowledge Base template
const ARTICLE_EXAMPLE = `Really interesting piece on how our brains handle context switching. Explains why it takes ~23 minutes to fully refocus after an interruption.

## Key Takeaways
- The "attention residue" concept - part of your brain stays on the previous task
- Batching similar tasks is way more effective than I thought
- Even quick glances at email count as interruptions

## Summary
Basically argues that multitasking is a myth. When we think we're multitasking, we're actually just switching rapidly between tasks, and each switch has a cognitive cost. The author cites a UC Irvine study that found it takes an average of 23 minutes to return to the original task after an interruption.

## My Thoughts
This explains so much about my afternoon productivity crashes. I've been checking Slack way too often. Going to try:
- Turning off notifications for 2-hour blocks
- Checking email only 3x per day

Wonder if this connects to [[Deep Work]] ideas?
`;

const CONCEPT_EXAMPLE = `The idea that small, consistent actions compound over time into massive results. Like compound interest but for habits and skills.

## Why It Matters
Gets me out of the "I need to make big changes" mindset. 1% better each day = 37x better over a year (math checks out, surprisingly).

## Examples
- Writing 200 words daily → a book in a year
- 10 minutes of stretching → actually touching my toes now
- Learning one new keyboard shortcut per week

## Connections
- Related to [[Atomic Habits]] book notes
- Opposite of the "motivation" trap - don't wait to feel like it
- Works because habits reduce decision fatigue

## Open Questions
- How do you pick which 1% improvements to focus on?
- What about things that need a big initial push to get started?
`;

const RESOURCE_EXAMPLE = `Free tool for creating diagrams as code. Way faster than dragging boxes around in Figma when I just need a quick flowchart.

## Links
- Main site: https://excalidraw.com
- VS Code extension (handy for README diagrams)

## When I Use It
- Quick architecture sketches during planning
- Explaining async flows to the team
- Hand-drawn style looks less "formal" which helps in early discussions

## Tips
- Cmd+D to duplicate elements
- The library feature saves common shapes - I have arrows and database symbols saved
- Export as SVG for crisp images in docs
- There's a collaboration mode but haven't tried it yet
`;

// Sample notes for Project Notes template
const MEETING_EXAMPLE = `Weekly sync - ran a bit long because we got into the weeds on the API redesign.

## What We Covered
- Sprint is on track, should hit the demo deadline
- API breaking changes - agreed to version the endpoints instead of migrating everything at once
- Sarah's out next week, Marcus covering her PRs

## Action Items
- [ ] I need to write up the versioning proposal by Thursday
- [ ] Marcus: Review the auth PR (blocked on this)
- [ ] Whole team: Update your ticket estimates, planning is Monday

## Decisions
- Going with REST over GraphQL for now - team more familiar, can revisit later
- Pushing the dashboard redesign to next quarter

## Notes
Jamie mentioned some performance issues on the search page - not urgent but should look into it. Might be related to that N+1 query I noticed last week.
`;

const TASK_EXAMPLE = `Add email validation to the signup form. Users are entering invalid emails and then can't recover their accounts.

## What Done Looks Like
- [x] Basic format validation (has @, valid domain)
- [ ] Check for common typos (gmial.com, etc)
- [ ] Show inline error message, not just on submit
- [ ] Add unit tests

## Notes
The validation library we use elsewhere is \`validator.js\` - should probably use that for consistency.

Check with design if we want to show suggestions for typos ("Did you mean gmail.com?") or just reject.

## Context
This came from 3 support tickets last week. See [[Q4 Support Analysis]] for the pattern.
`;

const DECISION_EXAMPLE = `We need to pick a state management approach for the new dashboard. Current Redux setup is getting unwieldy.

## Options We Considered

**Zustand**
- Pros: Simple, small bundle, easy to learn
- Cons: Less ecosystem, team would need to learn it

**Stick with Redux + RTK**
- Pros: Team knows it, good devtools
- Cons: Still verbose, the boilerplate is what's slowing us down

**React Query + Context**
- Pros: Handles server state well, less code for our use case
- Cons: Different mental model, mixing two approaches

## Decision
Going with **Zustand** for the new dashboard.

## Why
- Dashboard is mostly client-side state (filters, UI state)
- We can try it in isolation without touching existing Redux code
- If it doesn't work out, migration back isn't too painful

Marcus had concerns about splitting approaches but agreed to try it scoped to this feature first.
`;

// Guide notes explaining the note types
// Use {{type:Name}} placeholder syntax - gets replaced with [[type-id|Name]] during vault creation
const PKB_GUIDE = `This vault is set up with three note types to help you build a personal knowledge base. Use whatever works for you - these are just starting points.

## {{type:Article}}
For capturing ideas from things you read - articles, blog posts, papers, books. The goal is to summarize in your own words so you actually remember it later.

See [[The Cost of Context Switching]] for an example.

## {{type:Concept}}
For ideas you want to develop over time. Could be something you're learning, a mental model, or just a thought you want to explore. I like to revisit these and add to them as I learn more.

See [[Compound Growth]] for an example.

## {{type:Resource}}
For tools, websites, references - anything you want to find again. I use these as quick-reference cards for stuff I don't want to keep googling.

See [[Excalidraw]] for an example.

---

Feel free to create your own note types or modify these. The properties on each type (like "source" for {{type:Article}}s) show up in the editor so you can track metadata without cluttering the note itself.
`;

const PROJECT_GUIDE = `This vault is set up for tracking project work. Three note types to start:

## {{type:Meeting}}
For meeting notes. Has date and attendees fields so you can find "that meeting where we discussed X" later. I try to always capture action items with checkboxes.

See [[Team Sync - Dec 12]] for an example.

## {{type:Task}}
For work items. The status field (todo/in-progress/done) makes it easy to see what's active. I like breaking down acceptance criteria as checkboxes.

See [[Signup form email validation]] for an example.

## {{type:Decision}}
For documenting choices and why we made them. Super useful when someone asks "why did we do it this way?" six months later. The status field tracks whether it's still pending or approved.

See [[Dashboard state management]] for an example.

---

The workspaces (Active, Planning, Archive) are a suggestion for organizing notes by project phase. Move notes between them as projects progress.
`;

export const VAULT_TEMPLATES: VaultTemplate[] = [
  {
    id: 'empty',
    name: 'Empty',
    description: 'Start fresh with just a default workspace',
    icon: '📄',
    workspaces: [],
    noteTypes: [],
    notes: []
  },
  {
    id: 'personal-kb',
    name: 'Personal Knowledge Base',
    description: 'Organized for learning, projects, and references',
    icon: '🧠',
    workspaces: [
      { name: 'Learning', icon: '📚' },
      { name: 'Projects', icon: '🚀' },
      { name: 'References', icon: '📖' }
    ],
    noteTypes: [
      {
        name: 'Article',
        purpose: 'Summaries and analysis of articles, papers, or books',
        icon: '📰',
        properties: [
          { name: 'source', type: 'string', description: 'Source URL or publication' },
          { name: 'author', type: 'string', description: 'Author of the article' },
          { name: 'readDate', type: 'date', description: 'Date when you read it' }
        ]
      },
      {
        name: 'Concept',
        purpose: 'Ideas and concepts to remember and develop',
        icon: '💡',
        properties: [
          {
            name: 'maturity',
            type: 'string',
            description: 'How developed is this concept',
            constraints: { options: ['seedling', 'growing', 'evergreen'] },
            default: 'seedling'
          }
        ]
      },
      {
        name: 'Resource',
        purpose: 'Links, tools, and references to external content',
        icon: '🔗',
        properties: [
          { name: 'url', type: 'string', description: 'Main URL for this resource' },
          {
            name: 'category',
            type: 'string',
            description: 'Resource category',
            constraints: {
              options: ['tool', 'documentation', 'tutorial', 'reference', 'other']
            },
            default: 'other'
          }
        ]
      }
    ],
    notes: [
      {
        title: 'How to Use This Vault',
        content: PKB_GUIDE,
        pinned: true
      },
      {
        title: 'The Cost of Context Switching',
        content: ARTICLE_EXAMPLE,
        typeName: 'Article',
        props: {
          source: 'https://hbr.org/2022/08/the-cost-of-context-switching',
          author: 'Sophie Leroy',
          readDate: '2024-11-20'
        }
      },
      {
        title: 'Compound Growth',
        content: CONCEPT_EXAMPLE,
        typeName: 'Concept',
        props: {
          maturity: 'growing'
        }
      },
      {
        title: 'Excalidraw',
        content: RESOURCE_EXAMPLE,
        typeName: 'Resource',
        props: {
          url: 'https://excalidraw.com',
          category: 'tool'
        }
      }
    ]
  },
  {
    id: 'project-notes',
    name: 'Project Notes',
    description: 'Organized for project management and tracking',
    icon: '📋',
    workspaces: [
      { name: 'Active', icon: '⚡' },
      { name: 'Planning', icon: '📝' },
      { name: 'Archive', icon: '📦' }
    ],
    noteTypes: [
      {
        name: 'Meeting',
        purpose: 'Meeting notes and action items',
        icon: '👥',
        properties: [
          { name: 'date', type: 'date', description: 'Meeting date' },
          { name: 'attendees', type: 'string', description: 'Meeting attendees' }
        ]
      },
      {
        name: 'Task',
        purpose: 'Tasks and to-dos',
        icon: '✅',
        properties: [
          {
            name: 'status',
            type: 'string',
            description: 'Task status',
            constraints: { options: ['todo', 'in-progress', 'done'] },
            default: 'todo'
          },
          { name: 'due', type: 'date', description: 'Due date' }
        ]
      },
      {
        name: 'Decision',
        purpose: 'Decisions and their rationale',
        icon: '⚖️',
        properties: [
          { name: 'date', type: 'date', description: 'Date of the decision' },
          {
            name: 'status',
            type: 'string',
            description: 'Decision status',
            constraints: { options: ['pending', 'approved', 'rejected'] },
            default: 'pending'
          }
        ]
      }
    ],
    notes: [
      {
        title: 'How to Use This Vault',
        content: PROJECT_GUIDE,
        pinned: true
      },
      {
        title: 'Team Sync - Dec 12',
        content: MEETING_EXAMPLE,
        typeName: 'Meeting',
        props: {
          date: '2024-12-12',
          attendees: 'Me, Sarah, Marcus, Jamie'
        }
      },
      {
        title: 'Signup form email validation',
        content: TASK_EXAMPLE,
        typeName: 'Task',
        props: {
          status: 'in-progress',
          due: '2024-12-20'
        }
      },
      {
        title: 'Dashboard state management',
        content: DECISION_EXAMPLE,
        typeName: 'Decision',
        props: {
          date: '2024-12-10',
          status: 'approved'
        }
      }
    ]
  }
];

// ============================================================================
// Onboarding Content
// ============================================================================

// Philosophy note - explains the "why" behind Flint
const PHILOSOPHY_NOTE_CONTENT = `Most note apps optimize for capture. Flint optimizes for *knowledge* - turning information into understanding that lasts.

## The Problem

Notes pile up. You capture ideas, save articles, jot down meeting notes. But then what? Most of it sits there, never revisited. The information doesn't become knowledge.

## The Deep Knowledge Cycle

Flint is built around three interconnected phases:

### 1. Externalize - Get Ideas Out

Capture thoughts without worrying about organization. Daily notes, quick ideas, meeting notes - just write. The goal is frictionless capture so nothing gets lost.

Note types handle structure for you. A meeting note knows it needs attendees and action items. A concept note knows it's something to develop over time.

### 2. Internalize - Make Ideas Yours

This is where notes become knowledge:

- **Wikilinks** make connections explicit - type \`[[\` to link related ideas
- **The AI agent** helps you synthesize, summarize, and discover connections
- **Processing** transforms raw capture into lasting understanding

### 3. Resurface - Bring Knowledge Back

Notes you don't revisit might as well not exist. Flint brings ideas back at optimal intervals:

- **Review system** uses spaced repetition with AI-generated prompts
- **Active recall** builds lasting memory (answer from memory, then check)
- **Daily notes** anchor your thinking in time

## Philosophy

**AI amplifies thinking, doesn't replace it.** The agent handles mechanical tasks - organizing, searching, suggesting connections. You do the thinking.

**Plain text permanence.** Your notes are markdown files. No lock-in, works with any tool, yours forever.

**Local-first.** Your data stays on your machine. Cloud sync is standard file sync (Dropbox, iCloud) - you control it.

---

Now go write something. The system adapts to you.

→ See [[Getting Started with Flint]] for practical essentials
`;

// Quick start note - practical essentials for power users
const QUICK_START_CONTENT = `Everything you need to start building knowledge.

## Take Notes

Press \`Cmd/Ctrl + Shift + N\` to create a new note. Write whatever's on your mind - ideas, meeting notes, things you're learning. Don't worry about organization yet.

## Make Links

Type \`[[\` to connect notes together. Links are how knowledge compounds:
- \`[[Project Ideas]]\` links to that note (creates it if it doesn't exist)
- Backlinks show you what links *to* a note
- Over time, your notes become a web of connected ideas

## Use Note Types

Notes have types that give them structure. The default is "Note", but you can create types like Meeting, Task, or Article - each with their own properties (dates, status, tags).

- **Change a note's type**: \`Cmd/Ctrl + Shift + M\`
- **Manage types**: \`Cmd/Ctrl + 5\`

Types help you think differently about different kinds of notes, and let the AI agent understand your notes better.

## Essential Shortcuts

- **New note**: \`Cmd/Ctrl + Shift + N\`
- **Search**: \`Cmd/Ctrl + K\`
- **Pin note**: \`Cmd/Ctrl + Shift + P\`
- **Change type**: \`Cmd/Ctrl + Shift + M\`

## Three Features to Explore

Once you're comfortable with notes and links, these help you get more out of your knowledge:

### Daily Notes (\`Cmd/Ctrl + 2\`)

A week view for journaling and quick capture. Great for:
- Morning intentions, end-of-day reflections
- Ideas that pop up throughout the day
- Linking out to permanent notes as things develop

### Review System (\`Cmd/Ctrl + 3\`)

Turn notes into lasting knowledge through spaced repetition:
1. Enable review on important notes
2. AI generates challenges testing your understanding
3. Answer from memory, rate your confidence
4. Notes resurface at optimal intervals

### AI Agent (\`Cmd/Ctrl + Shift + A\`)

Your knowledge partner. Ask it to:
- "Create a meeting note for tomorrow"
- "Find notes about [topic]"
- "Suggest wikilinks for this note"
- "Summarize my notes from last week"

---

Start simple: take notes, make links. The rest will follow.

→ See [[The Deep Knowledge Cycle]] for the philosophy behind Flint
`;

// Welcome hub note - links to all tutorials
const WELCOME_HUB_CONTENT = `Flint helps you build knowledge that lasts - not just store information.

## What Makes Flint Different

Most tools optimize for capture. Flint optimizes for the complete cycle:

**Externalize** (capture freely) → **Internalize** (make it yours) → **Resurface** (remember it)

See [[The Deep Knowledge Cycle]] for the full philosophy.

## Quick Start

- **New note**: \`Cmd/Ctrl + Shift + N\`
- **Search**: \`Cmd/Ctrl + K\`
- **Toggle AI agent**: \`Cmd/Ctrl + Shift + A\`

## Your Learning Path

### Start Here
1. [[Tutorial: Notes and Connections]] - Create notes, link ideas
2. Open the AI agent (\`Cmd/Ctrl + Shift + A\`) and ask it something

### Go Deeper
3. [[Tutorial: The AI Agent]] - Your knowledge partner
4. [[Tutorial: Daily Notes]] - Capture and reflect
5. [[Tutorial: Review System]] - Active learning that sticks

### Reference
- [[Quick Reference Card]] - All shortcuts and syntax

Welcome to building knowledge that lasts.
`;

// Merged basics tutorial - notes, wikilinks, types, workspaces
const TUTORIAL_NOTES_CONTENT = `This tutorial covers the foundations: creating notes, connecting them, and organizing your vault.

## Creating Notes

**Keyboard**: \`Cmd/Ctrl + Shift + N\`
**Search**: \`Cmd/Ctrl + K\` → type a title → select "Create new note"
**From wikilink**: Type \`[[New Note Title]]\` → click the link to create it

## Wikilinks - Connecting Ideas

Type \`[[\` anywhere to link to another note. Start typing to search, or enter a new title.

**Why link?**
- Makes relationships explicit (not just in your head)
- Creates backlinks automatically - see what links *to* a note
- Builds your knowledge graph over time

**Tip**: Don't overthink it. Link liberally. You can always clean up later.

## Note Types

Notes have types that give them structure:
- **Note** - General purpose (default)
- **Daily** - Journal entries, time-anchored
- Custom types you create (Meeting, Task, Article, etc.)

Each type can have:
- **Properties** - structured fields (dates, status, tags)
- **Agent instructions** - guide how the AI works with that type

**Change type**: \`Cmd/Ctrl + Shift + M\` or right-click

**Manage types**: \`Cmd/Ctrl + 5\` or Settings → Note Types

## Properties

Properties are fields attached to notes via their type:
- **Text**: Free-form text
- **Date**: Calendar picker
- **Select**: Dropdown with predefined options
- **Notelinks**: Links to other notes

Properties appear as chips in the editor header. Click to edit.

## Workspaces

Workspaces are separate contexts with their own pinned notes. Use them for:
- Work vs Personal
- Different projects
- Different areas of focus

**Switch/create**: Click workspace name in sidebar

## Pinning Notes

Pin frequently-used notes to keep them at the top of your sidebar:
- Right-click → Pin
- Or \`Cmd/Ctrl + Shift + P\`

## Next Steps

→ [[Tutorial: The AI Agent]] - Learn what the agent can do
→ [[Tutorial: Daily Notes]] - Structured capture
`;

// AI Agent deep-dive tutorial
const TUTORIAL_AGENT_CONTENT = `The AI agent is your knowledge partner - it handles mechanical tasks so you can focus on thinking.

## Opening the Agent

**Shortcut**: \`Cmd/Ctrl + Shift + A\`
**Or**: Click the floating agent icon in the editor

## What the Agent Can Do

### Create and Organize Notes
- "Create a meeting note for tomorrow's standup with Sarah and Marcus"
- "Move my inbox notes to appropriate types"
- "Add a due date to this task"
- "Create a concept note about spaced repetition"

### Search and Synthesize
- "Find all notes about authentication"
- "Summarize my meeting notes from last week"
- "What have I written about project X?"
- "Show me notes I haven't reviewed in a month"

### Suggest Connections
- "What notes should I link from here?"
- "Find notes related to this one"
- "Suggest wikilinks for this note"

### Understand Context
The agent reads your notes, follows wikilinks, and understands note types. It knows the difference between a daily note and a project note. Ask it to work with "this note" or "my recent notes" - it understands context.

## Philosophy: Amplification, Not Replacement

The agent handles:
- Organizing, searching, structuring
- Finding connections you might miss
- Mechanical transformations (summarize, format, extract)

You handle:
- Insights, judgment, understanding
- Deciding what matters
- Making meaning from information

## Tips for Effective Use

1. **Be specific**: "Create a meeting note for tomorrow's standup" beats "create a note"
2. **Let it read context**: "Based on this note, suggest related notes"
3. **Start fresh conversations** when switching topics
4. **Ask for explanations**: "Why do you suggest linking to X?"

## Model Selection

- **Normal** (Haiku): Fast, economical, great for most tasks
- **Plus Ultra** (Sonnet): Extra reasoning power for complex synthesis

Toggle in the agent panel.

## Privacy

Notes are only sent to the AI when you ask about them. Your vault content stays local until you explicitly involve the agent. API keys are stored in your OS keychain.

## Next Steps

→ [[Tutorial: Daily Notes]] - Structured capture workflow
→ [[Tutorial: Review System]] - Active learning
`;

// Daily Notes deep-dive tutorial
const TUTORIAL_DAILY_CONTENT = `Daily notes are your capture hub - a place for thoughts, tasks, and reflections anchored in time.

## Opening Daily View

**Shortcut**: \`Cmd/Ctrl + 2\`
**Or**: Click "Daily" in the sidebar

## The Week View

You see a full week at a glance:
- Each day shows a preview or quick entry area
- Click a day to expand and edit
- Past days for context, future for planning

## Navigation

- **Previous week**: \`[\`
- **Next week**: \`]\`
- **Jump to today**: \`T\`

## What to Capture

Daily notes are flexible. Common patterns:

**Morning**
- Intentions for the day
- What you're thinking about

**Throughout the day**
- Quick captures - ideas, observations
- Meeting notes (or link to separate meeting notes)
- Tasks as they come up

**End of day**
- What happened
- What you learned
- What's on your mind

## The Capture → Process Pattern

Daily notes are *ephemeral* captures. They're where ideas land first. But lasting knowledge lives in *permanent* notes.

**The workflow:**
1. Capture in daily notes freely
2. Later, process: extract insights into permanent notes
3. Link daily entries to permanent notes for context

**Example:**
- Daily: "Had interesting conversation with Sarah about API versioning. She suggested we look at how Stripe does it."
- Later: Create \`[[API Versioning Patterns]]\` permanent note
- Daily links to permanent, permanent links back

## Ask the Agent

The agent can help with daily notes:
- "Summarize my daily notes from this week"
- "What tasks did I mention this week that aren't done?"
- "Create a weekly review from my daily notes"

## Next Steps

→ [[Tutorial: Review System]] - Turn notes into lasting knowledge
`;

// Review System deep-dive tutorial
const TUTORIAL_REVIEW_CONTENT = `The review system transforms notes from passive archives into active knowledge you can actually use.

## Why Review?

Most notes are written once, forgotten forever. Even re-reading creates an illusion of knowledge - it feels familiar, but you can't recall or apply it when you need it.

**The science**: Active recall + spaced repetition = lasting memory. You learn by struggling to retrieve, not by re-reading.

## How It Works

1. **Enable review** on a note (click the Review button or ask the agent)
2. **AI generates a challenge** testing your understanding
3. **You respond from memory** - this is the key. Don't peek at the note.
4. **Rate your confidence** - this schedules the next review
5. **Note resurfaces** at optimal intervals (soon if hard, later if easy)

## Opening Review

**Shortcut**: \`Cmd/Ctrl + 3\`
**Or**: Click "Review" in the sidebar when notes are due

## What to Review

**Good candidates:**
- Core concepts you need to internalize
- Technical knowledge (APIs, patterns, architecture decisions)
- Important decisions and their rationale
- Key learnings from courses, books, or conversations

**Skip these:**
- Pure reference material (just search when needed)
- Notes you naturally revisit anyway
- Temporary or time-sensitive content
- Meeting notes (unless there's a concept to retain)

## During a Review Session

1. Read the AI's challenge
2. **Answer from memory** - the discomfort of recalling is what builds understanding
3. Compare your answer to the note
4. Be honest about your confidence

## Tips for Effective Reviews

- **Use your own words**, not memorized phrases
- **Explain connections** - how does this relate to other things you know?
- **Show understanding**, not just recognition
- **Quality over quantity** - 20 well-chosen notes beats 100 neglected ones

## The Deeper Point

Review isn't about perfect recall. It's about engaging with your ideas repeatedly, from different angles, over time. Each review strengthens understanding, reveals gaps, and builds connections.

That's how notes become knowledge.

## Next Steps

Start reviewing: enable review on your most important notes.

→ [[Quick Reference Card]] - All shortcuts in one place
`;

// Updated Quick Reference - comprehensive shortcuts and syntax
const NEW_QUICK_REFERENCE_CONTENT = `## Keyboard Shortcuts

### Notes
- **New note**: \`Cmd/Ctrl + Shift + N\`
- **Search**: \`Cmd/Ctrl + K\`
- **Pin/Unpin note**: \`Cmd/Ctrl + Shift + P\`
- **Change note type**: \`Cmd/Ctrl + Shift + M\`
- **Focus title**: \`Cmd/Ctrl + E\`
- **Toggle preview**: \`Cmd/Ctrl + Shift + E\`

### Views
- **Inbox**: \`Cmd/Ctrl + 1\`
- **Daily**: \`Cmd/Ctrl + 2\`
- **Review**: \`Cmd/Ctrl + 3\`
- **Routines**: \`Cmd/Ctrl + 4\`
- **Note Types**: \`Cmd/Ctrl + 5\`
- **Settings**: \`Cmd/Ctrl + 6\`

### Panels
- **Toggle sidebar**: \`Cmd/Ctrl + B\`
- **Toggle AI agent**: \`Cmd/Ctrl + Shift + A\`
- **Toggle shelf**: \`Cmd/Ctrl + Shift + L\`

### Files
- **New deck**: \`Cmd/Ctrl + Shift + D\`
- **Switch vault**: \`Cmd/Ctrl + Shift + O\`
- **Show in Finder/Explorer**: \`Cmd/Ctrl + Shift + R\`

### Editing
- **Undo**: \`Cmd/Ctrl + Z\`
- **Redo**: \`Cmd/Ctrl + Shift + Z\`

## Markdown

- **Bold**: \`**text**\`
- **Italic**: \`*text*\`
- **Heading 1**: \`# Title\`
- **Heading 2**: \`## Title\`
- **Heading 3**: \`### Title\`
- **Bullet list**: \`- item\`
- **Numbered list**: \`1. item\`
- **Checkbox**: \`- [ ] task\`
- **Code inline**: \`\\\`code\\\`\`
- **Code block**: \`\\\`\\\`\\\`language\`
- **Link**: \`[text](url)\`
- **Wikilink**: \`[[Note Title]]\`

## Wikilinks

- Type \`[[\` to open autocomplete
- \`[[Note Title]]\` links to existing or creates new
- \`[[Note Title|Display Text]]\` for custom display
- Backlinks appear in the right sidebar
- Rename a note → all links update automatically

## AI Agent

**Open**: \`Cmd/Ctrl + Shift + A\`

Common commands:
- "Create a [type] note about X"
- "Find notes about X"
- "Summarize notes from [time period]"
- "Suggest wikilinks for this note"
- "Enable review for this note"
- "What have I written about X?"

## Review System

- **Enable**: Click Review button or ask the agent
- **Open queue**: \`Cmd/Ctrl + 3\`
- **Flow**: AI challenge → answer from memory → rate confidence
- **Why**: Active recall builds lasting knowledge

## Daily Notes

- **Open**: \`Cmd/Ctrl + 2\`
- **Navigate**: \`[\` prev week, \`]\` next week, \`T\` today
- **Use for**: Capture, journal, time-anchored notes
`;

export const ONBOARDING_OPTIONS: OnboardingOption[] = [
  {
    id: 'philosophy-quickstart',
    name: 'Philosophy + Quick Start',
    description: 'Understand Flint fast: philosophy and essentials',
    icon: '🧭',
    notes: [
      {
        title: 'The Deep Knowledge Cycle',
        content: PHILOSOPHY_NOTE_CONTENT
      },
      {
        title: 'Getting Started with Flint',
        content: QUICK_START_CONTENT,
        pinned: true
      }
    ]
  },
  {
    id: 'complete-guide',
    name: 'Complete Guide',
    description: 'Comprehensive tutorials for all key features',
    icon: '📖',
    notes: [
      {
        title: 'Welcome to Flint',
        content: WELCOME_HUB_CONTENT,
        pinned: true
      },
      {
        title: 'The Deep Knowledge Cycle',
        content: PHILOSOPHY_NOTE_CONTENT
      },
      {
        title: 'Tutorial: Notes and Connections',
        content: TUTORIAL_NOTES_CONTENT
      },
      {
        title: 'Tutorial: The AI Agent',
        content: TUTORIAL_AGENT_CONTENT
      },
      {
        title: 'Tutorial: Daily Notes',
        content: TUTORIAL_DAILY_CONTENT
      },
      {
        title: 'Tutorial: Review System',
        content: TUTORIAL_REVIEW_CONTENT
      }
    ]
  },
  {
    id: 'quick-reference',
    name: 'Quick Reference',
    description: 'All shortcuts and syntax in one card',
    icon: '⚡',
    notes: [
      {
        title: 'Quick Reference Card',
        content: NEW_QUICK_REFERENCE_CONTENT
      }
    ]
  }
];

// ============================================================================
// Utility Functions
// ============================================================================

export function getTemplate(id: string): VaultTemplate | undefined {
  return VAULT_TEMPLATES.find((t) => t.id === id);
}

export function getOnboardingOption(id: string): OnboardingOption | undefined {
  return ONBOARDING_OPTIONS.find((o) => o.id === id);
}
