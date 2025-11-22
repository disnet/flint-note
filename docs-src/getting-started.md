# Getting Started

Welcome to Flint! This guide will help you install Flint, set up your first vault, and start building deep knowledge.

## What is Flint?

Flint is a **local-first, AI-powered note-taking application** designed to build deep knowledge through the complete learning cycle.

**The Core Philosophy:**

Flint supports **externalizing** (getting ideas out), **internalizing** (making them yours), and **resurfacing** (bringing them back repeatedly over time to ground memory).

**How it works:**

- **Frictionless capture** - Get ideas out without worrying about organization. Notes as first-class abstractions mean you think in ideas, not files
- **Connected thinking** - Wikilinks and backlinks surface relationships. See how ideas connect across time
- **AI learning partner** - An agent that helps you capture better, connect deeper, and resurface at the right moments
- **Active recall practice** - Spaced repetition with AI-generated review prompts builds deep retention
- **Type-guided thinking** - Note types encode different patterns (synthesis, prediction, reflection)
- **Systematic resurfacing** - Routines and search bring past ideas back into focus

Your notes stay on your machine in plain markdown files. You own and control everything. The AI assists your learning process, but the insights come from you.

## System Requirements

- **macOS**: 10.13 (High Sierra) or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04 or later (or equivalent)

## Installation

Download the latest release for your platform:

- **macOS**: Download `.dmg` → Open → Drag to Applications
- **Windows**: Download `.exe` → Run installer → Launch from Start menu
- **Linux**: Download `.AppImage` → `chmod +x Flint-*.AppImage` → Run, or use `.deb` package

::: tip
Visit [flint.app/download](https://flint.app/download) for the latest releases
:::

See [Installation Guide](/guides/installation) for detailed platform-specific instructions.

## First Launch: Create Your Vault

A **vault** is a folder containing your notes. You can have multiple vaults for different contexts (work, personal, research).

**Creating your first vault:**

1. Choose a location (we recommend `~/Documents/Flint Notes/My Vault`)
2. Name it ("Personal Notes", "Work", "Research")
3. Flint creates the folder structure and default configuration

::: tip
Your vault is just a folder of markdown files. Back it up, sync it with cloud storage (Dropbox, iCloud), or open files in any text editor.
:::

See [Vaults](/features/vaults) for managing multiple vaults.

## The Interface

Flint uses a **three-column layout**:

- **Left Sidebar**: Pinned notes and recent tabs for quick access
- **Main View**: Note editor where you write
- **Right Sidebar**: AI agent, metadata, and backlinks

See the [User Interface Guide](/guides/interface) for a detailed walkthrough.

## Your First Note

**Create a note:**

1. Click **"New Note"** or press `Cmd+Shift+N` (Mac) / `Ctrl+Shift+N` (Windows/Linux)
2. Choose **"General"** type (start simple)
3. Start writing

**Example:**

```markdown
# My First Note

Testing out Flint's **markdown** support.

## Ideas

- Notes save automatically
- I can link to other notes: [[Another Note]]
- The system handles organization

This is about [[productivity]] and [[learning]]
```

**What happens:**

- Saves automatically as you type
- `[[Links]]` become clickable (creates notes if they don't exist)
- Backlinks panel shows incoming connections
- Appears in your [inbox](/features/organization#inbox) for processing later

See [Note Management](/features/notes) for markdown syntax, metadata, and advanced features.

## Basic Navigation

**Quick search** (`Cmd+O` / `Ctrl+O`):
- Opens overlay
- Type to find notes by title or content
- Press Enter to open

**Pin important notes:**
- Right-click note → "Pin to Sidebar"
- Drag to reorder
- Perfect for daily notes, active projects, reference materials

**Workspaces:**
- Group pinned notes by project
- Switch between contexts without losing your place
- See [Workspaces](/features/workspaces)

**Daily notes:**
- Click today's date in sidebar
- Automatic creation if doesn't exist
- Great for journaling and daily capture
- See [Daily Notes](/features/daily-notes)

## Linking Notes

**Create connections:**

```markdown
I discussed this in [[My Other Note]]
Related: [[project-ideas]] and [[design-principles]]
```

**What you get:**

- Click to navigate between notes
- Backlinks panel shows all references automatically
- Build a knowledge graph that mirrors your thinking

**Why link?**

- Connection-making deepens learning (internalizing)
- Discover unexpected relationships
- See all references to a concept in one place

See [Wikilinks and Backlinks](/features/wikilinks) for advanced patterns.

## Using the AI Agent

Open the agent with the **AI button** or `Cmd+K` / `Ctrl+K`.

**What the agent can do:**

- **Create notes**: "Create a meeting note for today's standup"
- **Find connections**: "What notes relate to API design?"
- **Organize**: "Process my inbox and suggest links"
- **Synthesize**: "Summarize this week's daily notes"
- **Execute routines**: "Run my weekly review routine"

**Example conversation:**

```
You: Create a meeting note for today with Sarah and John

AI: Created meetings/2025-01-15-meeting.md with:
    - Date: 2025-01-15
    - Attendees: Sarah, John
    - Sections for agenda and action items

You: Link it to the website redesign project

AI: Added link to [[projects/website-redesign]]
    and updated backlinks
```

See [AI Agent](/features/agent) for detailed capabilities and [Workflows](/features/workflows) for routines.

### Setting Up API Keys

The AI agent requires an API key. **We recommend OpenRouter** (supports multiple models).

1. Visit [openrouter.ai](https://openrouter.ai) and create an account
2. Generate an API key
3. In Flint: Settings → API Keys → Paste key
4. Key stored securely in system keychain

::: warning macOS Keychain
First save prompts for keychain access. Click **"Always Allow"** to avoid repeated prompts.
:::

See [Configuration](/guides/configuration) for all settings.

## Building Your Practice

### Week 1: Capture Freely

- Create notes without worrying about organization
- Add `[[wikilinks]]` between related ideas
- Let the [inbox](/features/organization#inbox) catch everything
- Focus on externalizing thoughts

### Week 2: Make Connections

- Process your inbox—review and link notes
- Try different [note types](/features/notes#note-types) (daily, meeting, project)
- Use the [AI agent](/features/agent) to suggest connections
- Practice internalizing through linking

### Week 3: Add Structure

- Create a [workspace](/features/workspaces) for your main project
- Set up a weekly [routine](/features/workflows#routines) for synthesis
- Mark important notes [for review](/features/review-system)
- Build resurfacing habits

### Week 4: Deepen Practice

- Refine your note types based on what you're learning
- Build more sophisticated routines (reading processing, prediction calibration)
- Trust the complete cycle: externalize → internalize → resurface
- Let your system grow organically

## Essential Keyboard Shortcuts

| Action            | macOS           | Windows/Linux   |
| ----------------- | --------------- | --------------- |
| New note          | `Cmd+Shift+N`   | `Ctrl+Shift+N`  |
| Quick search      | `Cmd+O`         | `Ctrl+O`        |
| AI agent          | `Cmd+K`         | `Ctrl+K`        |
| Today's daily     | `Cmd+Shift+D`   | `Ctrl+Shift+D`  |
| Command palette   | `Cmd+Shift+P`   | `Ctrl+Shift+P`  |

See [Shortcuts](/guides/shortcuts) for the complete list.

## Key Concepts to Understand

Before diving deeper, review these core ideas:

**[Core Concepts](/guides/core-concepts)** - Understand Flint's philosophy and the externalize/internalize/resurface cycle

**[Note Types](/features/notes#note-types)** - Different types guide different thinking patterns

**[Wikilinks](/features/wikilinks)** - Making connections explicit is how learning deepens

**[Review System](/features/review-system)** - Active recall builds deep retention

**[Routines](/features/workflows#routines)** - Systematize recurring learning practices

## Next Steps

### Core Features

- **[User Interface](/guides/interface)** - Detailed walkthrough of all UI elements
- **[Note Management](/features/notes)** - Master notes, types, metadata, and organization
- **[Search](/features/search)** - Find anything quickly with semantic search
- **[Organization](/features/organization)** - Inbox, reference shelf, and spatial organization

### Learning System

- **[AI Agent](/features/agent)** - Deep dive into AI capabilities and tools
- **[Review System](/features/review-system)** - Build active recall practice with spaced repetition
- **[Workflows](/features/workflows)** - Automate recurring tasks with routines
- **[Daily Notes](/features/daily-notes)** - Daily journaling and reflection workflow

### Advanced

- **[Workspaces](/features/workspaces)** - Manage multiple projects and contexts
- **[Vaults](/features/vaults)** - Separate work, personal, and other collections
- **[Custom Functions](/features/custom-functions)** - Extend the AI with custom code
- **[Configuration](/guides/configuration)** - Customize Flint to match your workflow

## Getting Help

- **[FAQ](/guides/faq)** - Common questions and answers
- **[Troubleshooting](/guides/troubleshooting)** - Solve common issues
- **[Privacy & Security](/guides/privacy-security)** - How your data is handled
- **GitHub**: [Report bugs](https://github.com/flint-org/flint-ui/issues) or [ask questions](https://github.com/flint-org/flint-ui/discussions)

## Tips for Success

::: tip Start Simple
Don't try every feature at once. Start by creating notes and linking ideas. Add AI assistance, routines, and review practice as you need them.
:::

::: tip Capture Without Friction
Don't worry about perfect organization upfront. Capture freely, then organize later with AI help. The [inbox](/features/organization#inbox) catches everything.
:::

::: tip Your Notes Are Portable
Your notes are plain markdown in a folder. You can open them in any text editor, sync with cloud storage, back them up, search with command-line tools, or process with scripts. You're never locked in.
:::

::: tip Trust the Cycle
The complete cycle builds knowledge: **capture** fluidly (externalize) → **connect** with links (internalize) → **process** periodically (internalize) → **review** on schedule (resurface) → **synthesize** with AI (internalize).
:::

---

**Ready to dive deeper?** Continue with [Core Concepts](/guides/core-concepts) to understand how all of Flint's features work together to support deep knowledge building.
