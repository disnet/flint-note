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
const ARTICLE_EXAMPLE = `This is an example Article note for summarizing content you've read.

## Source
- Title: Example Article
- Author: Jane Doe
- URL: https://example.com/article

## Key Takeaways
1. First important point from the article
2. Second key insight
3. Third notable idea

## Summary
Write a brief summary of the main ideas here. This helps you remember the core content without re-reading the entire piece.

## My Thoughts
Add your own reflections, critiques, or how this connects to other ideas in your knowledge base.

## Related
- [[Other concepts to link to]]
`;

const CONCEPT_EXAMPLE = `This is an example Concept note for capturing ideas you want to develop.

## Definition
A clear, concise explanation of the concept in your own words.

## Why It Matters
Explain why this concept is important or useful to understand.

## Examples
- Example 1: A practical application
- Example 2: Another way this shows up

## Connections
This concept relates to:
- [[Other concepts]]
- [[Related ideas]]

## Questions
- What aspects need more exploration?
- How does this apply to my work?
`;

const RESOURCE_EXAMPLE = `This is an example Resource note for tracking useful tools and references.

## Overview
A brief description of what this resource is and why it's valuable.

## Links
- Main site: https://example.com
- Documentation: https://docs.example.com
- Tutorial: https://example.com/getting-started

## Use Cases
- When to use this resource
- Problems it solves
- Projects where it's applicable

## Notes
Any tips, tricks, or important details to remember about using this resource.
`;

// Sample notes for Project Notes template
const MEETING_EXAMPLE = `Example meeting note showing how to capture discussions and action items.

## Agenda
1. Project status update
2. Discuss blockers
3. Plan next steps

## Discussion Notes
- Reviewed current progress on main deliverables
- Identified two blocking issues that need resolution
- Agreed on timeline for next milestone

## Action Items
- [ ] @Alice: Complete the design review by Friday
- [ ] @Bob: Set up meeting with stakeholders
- [ ] @Carol: Update project documentation

## Decisions Made
- Decided to postpone feature X to next sprint
- Approved budget for additional resources

## Next Meeting
Scheduled for next Tuesday at 2pm
`;

const TASK_EXAMPLE = `Example task note showing how to track work items.

## Description
A clear description of what needs to be done for this task.

## Acceptance Criteria
- [ ] First requirement to complete
- [ ] Second requirement
- [ ] Third requirement

## Notes
Any additional context, approach ideas, or things to remember while working on this task.

## Related
- [[Related meeting notes]]
- [[Relevant decisions]]
`;

const DECISION_EXAMPLE = `Example decision note for documenting choices and their rationale.

## Context
Describe the situation or problem that required a decision.

## Options Considered
1. **Option A**: Description and pros/cons
2. **Option B**: Description and pros/cons
3. **Option C**: Description and pros/cons

## Decision
We decided to go with **Option B** because...

## Rationale
- Primary reason for this choice
- Supporting factors
- Trade-offs we accepted

## Consequences
- Expected positive outcomes
- Potential risks to monitor
- Follow-up actions needed

## Related
- [[Meeting where this was discussed]]
- [[Tasks created from this decision]]
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
        title: 'Example Article',
        content: ARTICLE_EXAMPLE,
        typeName: 'Article',
        props: {
          source: 'https://example.com/article',
          author: 'Jane Doe',
          readDate: '2024-01-15'
        }
      },
      {
        title: 'Example Concept',
        content: CONCEPT_EXAMPLE,
        typeName: 'Concept',
        props: {
          maturity: 'seedling'
        }
      },
      {
        title: 'Example Resource',
        content: RESOURCE_EXAMPLE,
        typeName: 'Resource',
        props: {
          url: 'https://example.com',
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
        title: 'Example Meeting',
        content: MEETING_EXAMPLE,
        typeName: 'Meeting',
        props: {
          date: '2024-01-16',
          attendees: 'Alice, Bob, Carol'
        }
      },
      {
        title: 'Example Task',
        content: TASK_EXAMPLE,
        typeName: 'Task',
        props: {
          status: 'in-progress',
          due: '2024-01-20'
        }
      },
      {
        title: 'Example Decision',
        content: DECISION_EXAMPLE,
        typeName: 'Decision',
        props: {
          date: '2024-01-10',
          status: 'approved'
        }
      }
    ]
  }
];

// ============================================================================
// Onboarding Content
// ============================================================================

const WELCOME_NOTE_CONTENT = `Welcome to Flint! This note will help you get started.

## Quick Start

**Create a new note** by pressing \`Cmd/Ctrl + N\` or clicking the + button in the sidebar.

**Link notes together** by typing \`[[\` and selecting a note, or just type \`[[Note Title]]\` to create a wikilink.

**Search everything** with \`Cmd/Ctrl + K\` to quickly find and navigate to any note.

## Key Features

- **Wikilinks**: Connect your thoughts with \`[[Note Title]]\` links
- **Workspaces**: Organize notes into different contexts (work, personal, projects)
- **Note Types**: Categorize notes with types like Meeting, Task, or create your own
- **Properties**: Add structured data to notes (dates, tags, status)
- **Full-text Search**: Find any note instantly

## Tips

1. Use the left sidebar to navigate between notes and workspaces
2. Pin frequently used notes to keep them at the top
3. Archive notes you don't need anymore instead of deleting them
4. Your notes are stored locally and work offline

Happy note-taking!
`;

const TUTORIAL_1_CONTENT = `This tutorial covers the basics of creating and editing notes in Flint.

## Creating Notes

There are several ways to create a new note:

1. **Keyboard shortcut**: Press \`Cmd/Ctrl + N\`
2. **Sidebar button**: Click the + button at the top of the sidebar
3. **Quick search**: Press \`Cmd/Ctrl + K\`, type a new title, and select "Create new note"

## Editing Notes

Notes use Markdown for formatting. Here are some basics:

- **Bold**: \`**text**\` or \`Cmd/Ctrl + B\`
- **Italic**: \`*text*\` or \`Cmd/Ctrl + I\`
- **Headers**: Start a line with \`#\`, \`##\`, or \`###\`
- **Lists**: Start with \`-\` or \`1.\`
- **Code**: Use backticks for \`inline code\` or triple backticks for code blocks

## Note Titles

The title is the first line of your note (the large text at the top). You can click it to rename the note, which will automatically update all links to it.

## Next Steps

Try creating a few notes and experiment with formatting!
`;

const TUTORIAL_2_CONTENT = `Wikilinks are the heart of Flint - they let you connect your notes together.

## Creating Wikilinks

Type \`[[\` to open the link picker, then:
- Start typing to search for an existing note
- Select a note to insert a link
- Or type a new title to create a link to a note that doesn't exist yet

## Link Syntax

Wikilinks look like this: \`[[Note Title]]\`

When you click a wikilink:
- If the note exists, it opens
- If it doesn't exist, Flint creates it for you

## Backlinks

Every note shows its backlinks - other notes that link to it. This helps you discover connections and navigate your knowledge graph.

## Tips

1. Use descriptive titles so links are self-explanatory
2. Don't worry about organizing - just link related ideas together
3. Check backlinks to see how ideas connect
4. Links are automatically updated if you rename a note
`;

const TUTORIAL_3_CONTENT = `Workspaces help you organize notes into separate contexts.

## What Are Workspaces?

Think of workspaces as different "views" of your notes. Each workspace can have:
- Its own pinned notes
- Recent notes specific to that context
- A focused set of notes you're working with

## Default Workspace

Every vault starts with a default workspace. You can rename it or add more workspaces as needed.

## Creating Workspaces

Click on the workspace name in the sidebar to open the workspace menu, then select "New Workspace".

## Switching Workspaces

Use the workspace dropdown in the sidebar to switch between workspaces. Your pinned and recent notes will update to show that workspace's context.

## Use Cases

- **Work vs Personal**: Keep work projects separate from personal notes
- **Projects**: Create a workspace for each major project
- **Areas of Focus**: Learning, Research, Writing, etc.
`;

const TUTORIAL_4_CONTENT = `Note Types let you categorize notes and add structured properties.

## What Are Note Types?

Note types are categories for your notes, like "Meeting", "Task", or "Article". Each type can have:
- A distinctive icon
- A description of its purpose
- Custom properties (fields) for structured data

## Default Note Type

Every vault has a default note type for general-purpose notes. You can customize it or create new types.

## Creating Note Types

Go to Settings > Note Types to create and manage types.

## Properties

Properties are fields you can add to note types:
- **Text**: Free-form text
- **Date**: Calendar date picker
- **Number**: Numeric values
- **Boolean**: Yes/No checkboxes
- **Select**: Dropdown with predefined options

## Example: Task Type

A Task note type might have:
- Status property (select: todo, in-progress, done)
- Due date property (date)
- Priority property (select: low, medium, high)

This makes it easy to track and filter tasks!
`;

const QUICK_REFERENCE_CONTENT = `# Flint Quick Reference

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New note | \`Cmd/Ctrl + N\` |
| Search | \`Cmd/Ctrl + K\` |
| Save | \`Cmd/Ctrl + S\` |
| Bold | \`Cmd/Ctrl + B\` |
| Italic | \`Cmd/Ctrl + I\` |
| Undo | \`Cmd/Ctrl + Z\` |
| Redo | \`Cmd/Ctrl + Shift + Z\` |

## Markdown Formatting

| Format | Syntax |
|--------|--------|
| Bold | \`**text**\` |
| Italic | \`*text*\` |
| Heading 1 | \`# Title\` |
| Heading 2 | \`## Title\` |
| Heading 3 | \`### Title\` |
| Bullet list | \`- item\` |
| Numbered list | \`1. item\` |
| Checkbox | \`- [ ] task\` |
| Code inline | \`\\\`code\\\`\` |
| Link | \`[text](url)\` |
| Wikilink | \`[[Note Title]]\` |

## Quick Tips

- **Create a wikilink**: Type \`[[\` to link to another note
- **Pin a note**: Right-click and select "Pin" to keep it at the top
- **Archive a note**: Move unused notes to archive instead of deleting
- **Switch workspaces**: Click the workspace name in the sidebar
- **Change note type**: Use the type selector in the note header
`;

export const ONBOARDING_OPTIONS: OnboardingOption[] = [
  {
    id: 'welcome',
    name: 'Welcome Note',
    description: 'A getting-started guide with tips',
    icon: '👋',
    notes: [
      {
        title: 'Welcome to Flint',
        content: WELCOME_NOTE_CONTENT
      }
    ]
  },
  {
    id: 'tutorials',
    name: 'Tutorial Series',
    description: 'Step-by-step guides for key features',
    icon: '📖',
    notes: [
      {
        title: 'Tutorial: Creating Notes',
        content: TUTORIAL_1_CONTENT
      },
      {
        title: 'Tutorial: Using Wikilinks',
        content: TUTORIAL_2_CONTENT
      },
      {
        title: 'Tutorial: Organizing with Workspaces',
        content: TUTORIAL_3_CONTENT
      },
      {
        title: 'Tutorial: Note Types and Properties',
        content: TUTORIAL_4_CONTENT
      }
    ]
  },
  {
    id: 'quick-reference',
    name: 'Quick Reference',
    description: 'Keyboard shortcuts and cheat sheet',
    icon: '⚡',
    notes: [
      {
        title: 'Quick Reference Card',
        content: QUICK_REFERENCE_CONTENT
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
