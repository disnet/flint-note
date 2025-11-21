# Website Documentation Plan

## Overview

This document outlines a comprehensive plan for documenting Flint's features on the public-facing website. The current documentation (in `docs-src/`) is very basic. This plan identifies what needs to be documented based on the actual implementation.

## Current State

**Existing Documentation:**
- Getting Started (basic)
- Features: Notes, Agent, Review System (all very minimal)
- Guides: Installation, Configuration (stub)

**Implementation Features Not Documented:**
- Note types system
- Workflows automation
- Custom functions
- Multi-vault workspaces
- Daily notes view
- Inbox system
- Wikilinks and backlinks
- Temporary tabs
- Pinned notes
- External edit detection
- And many more...

## Documentation Structure

### 1. Getting Started (Enhance Existing)

**Current:** Basic installation and first steps
**Add:**
- System requirements
- Download links for each platform
- First-time setup wizard walkthrough
- Creating your first vault
- Understanding the interface (3-column layout)
- Basic keyboard shortcuts
- Where to get help

### 2. Core Concepts (New)

**Purpose:** Help users understand Flint's mental model

**Topics:**
- What are notes?
- What are note types?
- What are vaults?
- Wikilinks and bidirectional linking
- How the AI assistant works
- Local-first philosophy
- Plain text markdown format

### 3. User Interface Guide (New)

**Purpose:** Detailed walkthrough of the interface

**Topics:**
- Three-column layout
  - Left sidebar: Navigation and quick access
  - Main view: Note editor
  - Right sidebar: AI assistant and metadata
- Workspace bar
- Search overlay
- Settings panel
- Visual indicators and status icons

### 4. Note Management (Enhance Features/Notes)

**Current:** Basic markdown and tagging
**Add:**
- Creating and editing notes
- Markdown syntax support
- YAML frontmatter/metadata
- Auto-save behavior
- Note types explained in depth
  - Built-in types (General, Daily, Meeting, Task, Project)
  - Creating custom note types
  - Note type schemas
  - Templates
- Moving and renaming notes
- Deleting notes
- External edit detection and conflict resolution

### 5. Organization Features (New)

**Purpose:** How to organize and navigate notes

**Topics:**
- Pinned notes
  - Pinning/unpinning
  - Reordering
  - When to use pinned vs temporary tabs
- Temporary tabs
  - Arc-browser style ephemeral access
  - How they're created
  - 24-hour cleanup
  - Converting to pinned
- Tags
  - Using tags in frontmatter
  - Filtering by tags
  - Best practices
- Navigation history
  - Back/forward navigation
  - History persistence

### 6. Wikilinks and Backlinks (New)

**Purpose:** Understanding bidirectional linking

**Topics:**
- Wikilink syntax
  - Title-based: `[[Note Title]]`
  - Path-based: `[[type/filename|Display Text]]`
- Creating links
- Following links
- Backlinks panel
  - Viewing backlinks
  - Context snippets
  - Navigating backlinks
- Broken link detection
- Link updating on rename/move

### 7. Search and Discovery (New)

**Purpose:** Finding notes quickly

**Topics:**
- Global search overlay (`Ctrl+O` / `Cmd+O`)
- Full-text search
  - FTS5 indexing
  - Fuzzy matching
  - Search operators
    - `type:meeting`
    - `tag:important`
    - `created:today`
    - `"exact phrase"`
- Advanced search via API
- Search best practices

### 8. Multi-Vault Workspaces (New)

**Purpose:** Managing multiple isolated note collections

**Topics:**
- What are vaults?
- When to use multiple vaults
  - Work vs personal
  - Different projects
  - Research vs journaling
- Creating vaults
- Switching between vaults
- Vault isolation (separate databases, settings, conversations)
- Vault management

### 9. Daily Notes (New)

**Purpose:** Using the daily journaling system

**Topics:**
- What are daily notes?
- Daily view interface
  - Calendar navigation
  - Day sections (Morning, Afternoon, Evening)
  - Time-stamped entries
- Quick capture
- Linking from daily notes
- Daily note templates
- Reviewing past days
- Best practices for journaling

### 10. Inbox System (New)

**Purpose:** Frictionless capture and gradual organization

**Topics:**
- Inbox workflow philosophy
- Quick capture without organization
- Reviewing inbox periodically
- Processing inbox items
  - Moving to appropriate types
  - Adding proper metadata
  - Linking to relevant notes
- AI assistance for inbox organization
- Inbox zero workflow

### 11. AI Assistant (Enhance Features/Agent)

**Current:** Basic overview
**Add:**
- Opening the assistant
- Conversation interface
  - Streaming responses
  - Message editing
  - Regenerating responses
- What the AI can do
  - Note operations (create, read, update, search)
  - Note type management
  - Link operations
  - Vault operations
- Tool calls and tasks
  - Visual task tracking
  - Understanding tool execution
- Model selection
- Conversation history
- Context and memory
- Cost tracking
- Best practices
  - Effective prompts
  - Using AI for organization
  - When AI helps vs when to do it yourself
- Privacy considerations

### 12. Workflow Automation (New)

**Purpose:** Creating repeatable AI-assisted sequences

**Topics:**
- What are workflows?
- Built-in workflows
- Creating custom workflows
  - Via AI assistant
  - Workflow structure
  - Purpose and description
- Supplementary materials
  - Text materials
  - Code snippets
  - Note references
- Recurring workflows
  - Daily, weekly, monthly
  - Scheduling
- Backlog workflows
- Workflow completion tracking
- Practical workflow examples
  - Daily review
  - Weekly planning
  - Monthly retrospective
  - Research synthesis

### 13. Custom Functions (New)

**Purpose:** Extending AI capabilities with custom code

**Topics:**
- What are custom functions?
- Use cases
  - Data transformations
  - Calculations
  - Custom logic
  - Report generation
- Creating custom functions
  - Function editor
  - Parameters and return types
  - TypeScript/JavaScript
- Testing functions
- Security and sandboxing
  - QuickJS sandbox
  - Limited API access
  - Timeout protection
- Making functions available to AI
- Example custom functions

### 14. Review System (Enhance Features/Review-System)

**Current:** Basic overview
**Add:**
- Spaced repetition explained
- Enabling review for notes
  - Marking entire notes
  - Marking specific sections
- Review interface walkthrough
  - Loading challenge
  - Responding to prompts
  - AI feedback
  - Pass/fail rating
- Review scheduling
  - Pass = 7 days
  - Fail = 1 day
- Review statistics
  - Notes due today
  - Notes due this week
  - Total review-enabled notes
- Session management
  - Starting a session
  - Skipping notes
  - Ending early
  - Session summary
- Best practices
  - What to review
  - How to respond
  - Building consistent habits
- Review history

### 15. Editor Features (New)

**Purpose:** Getting the most out of the editor

**Topics:**
- CodeMirror integration
- Markdown features
  - Syntax highlighting
  - Live preview (if applicable)
  - Code blocks
  - Tables
  - Lists
- Editor shortcuts
- Multi-cursor editing
- Find and replace
- Code folding
- Line numbers
- Customization
  - Font size
  - Theme
  - Vim/Emacs modes (if implemented)

### 16. Settings and Configuration (Enhance Guides/Configuration)

**Current:** Stub
**Add:**
- Accessing settings
- Appearance
  - Theme (light/dark/system)
  - Font preferences
- API Keys
  - Secure storage
  - OpenRouter setup
  - Getting API keys
  - Keychain access on macOS
- Database
  - Rebuilding database
  - When to rebuild
- Updates
  - Auto-update system
  - Update channels (stable/canary)
  - Manual update checks
  - Viewing changelog
- Editor preferences
- Privacy settings

### 17. Keyboard Shortcuts (New)

**Purpose:** Quick reference for power users

**Topics:**
- Global shortcuts
  - `Ctrl+Shift+N` - New note
  - `Ctrl+O` / `Cmd+O` - Search
  - `Ctrl+K` / `Cmd+K` - AI assistant
- Editor shortcuts
  - `Cmd/Ctrl+Enter` - Submit (in review/chat)
  - Standard editing shortcuts
- Navigation shortcuts
- Customization

### 18. Advanced Topics (New)

**Purpose:** Power user features and edge cases

**Topics:**
- External editing
  - Using external editors
  - Conflict resolution
  - File watching
- Database management
  - Understanding the database
  - When to rebuild
  - Backup and recovery
- Note suggestions
  - AI-generated suggestions
  - Dismissing suggestions
- Performance optimization
- Troubleshooting common issues

### 19. Best Practices (New)

**Purpose:** Recommended workflows and patterns

**Topics:**
- Note-taking philosophy
  - Agent assistance vs replacement
  - Frictionless capture
  - Gradual organization
- Effective note organization
  - When to create new note types
  - Tagging strategy
  - Linking strategy
- Daily workflow recommendations
  - Morning review
  - Throughout-day capture
  - Evening processing
- Using AI effectively
  - What to ask the AI
  - What to do yourself
  - Building good prompts
- Vault organization
  - Work/life separation
  - Project-based vaults

### 20. Privacy and Security (New)

**Purpose:** Understanding data storage and privacy

**Topics:**
- Local-first architecture
- Where data is stored
- API key security (OS keychain)
- No telemetry by default
- What gets sent to AI providers
- Backup recommendations
- Data portability (plain markdown)

### 21. Troubleshooting (New)

**Purpose:** Common issues and solutions

**Topics:**
- Search not working → Database rebuild
- Notes not syncing → External edit conflicts
- AI not responding → Check API keys
- Performance issues
- Update problems
- Database corruption recovery

### 22. FAQ (New)

**Purpose:** Quick answers to common questions

**Topics:**
- Can I use my own markdown editor? (Yes, with external edit detection)
- Can I sync across devices? (Manual sync via cloud storage)
- What AI providers are supported? (OpenRouter, Anthropic, OpenAI)
- Is my data private? (Yes, local-first)
- Can I export my notes? (Yes, they're plain markdown)
- How do I backup? (Copy vault directory)
- What happens if I switch vaults? (Isolated workspaces)

## Implementation Priority

### Phase 1: Essential User Journey (High Priority)
1. Getting Started (enhance)
2. Core Concepts (new)
3. User Interface Guide (new)
4. Note Management (enhance)
5. Search and Discovery (new)
6. AI Assistant (enhance)

### Phase 2: Power Features (Medium Priority)
7. Wikilinks and Backlinks (new)
8. Multi-Vault Workspaces (new)
9. Daily Notes (new)
10. Review System (enhance)
11. Organization Features (new)
12. Settings and Configuration (enhance)

### Phase 3: Advanced Features (Lower Priority)
13. Workflow Automation (new)
14. Custom Functions (new)
15. Editor Features (new)
16. Keyboard Shortcuts (new)
17. Advanced Topics (new)

### Phase 4: Supporting Content
18. Best Practices (new)
19. Privacy and Security (new)
20. Troubleshooting (new)
21. FAQ (new)

## Documentation Style Guide

### Writing Principles
- **User-focused:** Write for end users, not developers
- **Clear and concise:** Avoid jargon, explain technical terms
- **Practical:** Include concrete examples and use cases
- **Visual:** Use screenshots and diagrams where helpful
- **Progressive:** Start simple, add complexity gradually
- **Searchable:** Use clear headings and keywords

### Format
- Use VitePress markdown
- Include code examples with proper syntax highlighting
- Use callouts for tips, warnings, and notes
- Link between related documentation pages
- Include "Next Steps" sections

### Examples Over Theory
Every feature should include:
1. What it is (brief)
2. Why you'd use it (use cases)
3. How to use it (step-by-step)
4. Example (real-world scenario)

## Next Steps

1. Review and refine this plan
2. Prioritize which sections to start with
3. Create documentation templates
4. Begin writing Phase 1 content
5. Gather screenshots and diagrams
6. Review with users for clarity
7. Iterate based on feedback

## Notes

- This plan is based on the actual implementation as of the current codebase
- Some features may be partially implemented or in development
- Documentation should be updated as features evolve
- Consider creating video tutorials for complex workflows
- Interactive demos could be valuable for key features
