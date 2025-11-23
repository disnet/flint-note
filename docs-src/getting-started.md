# Getting Started

Welcome to Flint! This guide will help you install Flint, set up your first vault, and start building deep knowledge.

## What is Flint?

Flint is a **local-first, AI-powered note-taking application** designed to build deep knowledge through the complete learning cycle.

**The Core Philosophy:**

Flint supports **externalizing** (getting ideas out), **internalizing** (making them yours), and **resurfacing** (bringing them back repeatedly over time to ground memory).

Your notes stay on your machine in plain markdown files. You own and control everything. The AI assists your learning process, but the insights come from you.

## System Requirements

- **macOS**: 10.13 (High Sierra) or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04 or later (or equivalent)

## Installation

Download the latest release for your platform:

- **macOS**: Download `.dmg` → Open → Drag to Applications
- **Windows**: Download `.exe` → Run installer → Launch from Start menu
- **Linux**: Download `.AppImage` → `chmod +x Flint-*.AppImage` → Run

::: tip
Visit [flintnote.com](https://www.flintnote.com/#download) for the latest releases
:::

See [Installation Guide](/guides/installation) for detailed platform-specific instructions.

## First Launch: Create Your Vault

A **vault** is a folder containing your notes. You can have multiple vaults for different contexts (work, personal, research).

**Creating your first vault:**

1. Choose a location (e.g. `~/Documents/Flint Notes/My Vault`)
2. Name it ("Personal Notes", "Work", "Research")
3. Flint creates the folder structure and default configuration

::: tip
Your vault is just a folder of markdown files. Back it up, sync it with cloud storage (Dropbox, iCloud), or open files in any text editor.
:::

## The Interface

Flint uses a three-column layout:

- **Left Sidebar**: Pinned and recent notes for quick access
- **Main View**: Note editor where you write
- **Right Sidebar**: AI agent, notes shelf

See the [User Interface Guide](/guides/interface) for a detailed walkthrough.

## Your First Note

**Create a note:**

1. Click **"New Note"** or press `Cmd+Shift+N` (Mac) / `Ctrl+Shift+N` (Windows/Linux)
1. Start writing

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

See [Notes](/features/notes) for markdown syntax, metadata, and advanced features.

## Basic Navigation

**Quick search** (`Cmd+O` / `Ctrl+O`):
- Opens overlay
- Type to find notes by title or content
- Press Enter to open

**Pin important notes:**
- Right-click note → "Pin"
- Drag to reorder
- Perfect for active projects, reference materials, etc.

**Workspaces:**
- Create groups of pinned and recent notes
- Switch between contexts without losing your place
- See [Workspaces](/guides/interface#workspaces-bar)

**Daily notes:**
- Click "Daily" in sidebar
- See list of notes for each day of the week.
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

## Using the AI Agent

Open the agent with the **AI button** or `Cmd+Shift+A` / `Ctrl+Shift+A`.

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

See [AI Agent](/features/agent) for detailed capabilities.

### Setting Up API Keys

The AI agent requires an OpenRouter API key.

1. Visit [openrouter.ai](https://openrouter.ai) and create an account and purchase credits
2. Generate an API key
3. In Flint: Settings → API Keys → Paste key
4. Key stored securely in system keychain

::: warning macOS Keychain
First save prompts for keychain access. Click **"Always Allow"** to avoid repeated prompts.
:::

## Essential Keyboard Shortcuts

| Action            | macOS           | Windows/Linux   |
| ----------------- | --------------- | --------------- |
| New note          | `Cmd+Shift+N`   | `Ctrl+Shift+N`  |
| Quick search      | `Cmd+O`         | `Ctrl+O`        |
| AI agent          | `Cmd+Shift+A`   | `Ctrl+Shift+A`  |
| Daily view        | `Cmd+2`         | `Ctrl+2`        |

See [Shortcuts](/guides/shortcuts) for the complete list.

## Key Concepts to Understand

Before diving deeper, review these core ideas:

**[Core Concepts](/guides/core-concepts)** - Understand Flint's philosophy and the externalize/internalize/resurface cycle

**[Note Types](/features/notes#note-types)** - Different types guide different thinking patterns

**[Review System](/features/review-system)** - Active recall builds deep retention


## Next Steps

### Core Features

- **[User Interface](/guides/interface)** - Detailed walkthrough of all UI elements
- **[Note Management](/features/notes)** - Master notes, types, metadata, and organization

### Learning System

- **[AI Agent](/features/agent)** - Deep dive into AI capabilities and tools
- **[Review System](/features/review-system)** - Build active recall practice with spaced repetition
- **[Daily Notes](/features/daily-notes)** - Daily journaling and reflection workflow

### Advanced

- **[Workspaces](/guides/interface#workspaces-bar)** - Manage multiple projects and contexts

## Getting Help

- **[FAQ](/guides/faq)** - Common questions and answers
- **[Privacy & Security](/guides/privacy-security)** - How your data is handled

## Tips for Success

::: tip Capture Without Friction
Don't worry about perfect organization upfront. Capture freely, then organize later with AI help.
:::

::: tip Your Notes Are Portable
Your notes are plain markdown in a folder. You can open them in any text editor, sync with cloud storage, back them up, search with command-line tools, or process with scripts. You're never locked in.
:::

---

**Ready to dive deeper?** Continue with [Core Concepts](/guides/core-concepts) to understand how all of Flint's features work together to support deep knowledge building.
