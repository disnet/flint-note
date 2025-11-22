# Getting Started

Welcome to Flint! This guide will help you install Flint, set up your first vault, and start taking notes with AI assistance.

## What is Flint?

Flint is a **local-first, AI-powered note-taking application** designed to extend and amplify human thinking. It combines:

- **Plain-text markdown notes** that you own and control
- **AI agent** that helps with organization and automation
- **Spaced repetition** to strengthen your understanding
- **Powerful organization** with links, tags, and custom note types

Your notes stay on your machine in simple markdown files. The AI helps you structure and connect ideas, but you remain in control of your thinking and content.

## System Requirements

- **macOS**: 10.13 (High Sierra) or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04 or later (or equivalent)

## Installation

### Download Flint

Download the latest release for your platform:

- **macOS**: Download the `.dmg` file
- **Windows**: Download the `.exe` installer
- **Linux**: Download the `.AppImage` or `.deb` package

::: tip
Visit [flint.app/download](https://flint.app/download) for the latest releases
:::

### Install on macOS

1. Open the downloaded `.dmg` file
2. Drag Flint to your Applications folder
3. Open Flint from Applications
4. If you see a security warning, go to System Preferences → Security & Privacy and click "Open Anyway"

### Install on Windows

1. Run the downloaded `.exe` installer
2. Follow the installation wizard
3. Launch Flint from the Start menu

### Install on Linux

**Using AppImage:**
1. Make the file executable: `chmod +x Flint-*.AppImage`
2. Run the AppImage: `./Flint-*.AppImage`

**Using .deb package:**
1. Install with: `sudo dpkg -i Flint-*.deb`
2. Launch from your application menu or run `flint` in terminal

## First Launch: Setting Up Your Vault

When you first open Flint, you'll be greeted with the **First-Time Experience** which helps you create your initial vault.

### What is a Vault?

A **vault** is a collection of notes stored in a folder on your computer. Think of it as a workspace or notebook. You can have multiple vaults for different purposes (work, personal, research, etc.).

### Creating Your First Vault

1. **Choose a location** - Select where your notes will be stored
   - We recommend: `~/Documents/Flint Notes/My Vault`
   - The folder will be created automatically

2. **Name your vault** - Give it a meaningful name like:
   - "Personal Notes"
   - "Work"
   - "Research"

3. **Initialize** - Flint will create:
   - The vault folder structure
   - Default note types
   - Initial configuration
   - A welcome note

::: tip Good to Know
Your vault is just a folder containing markdown files. You can back it up, sync it with cloud storage (Dropbox, iCloud, etc.), or open the files in any text editor.
:::

## Understanding the Interface

Flint uses a **three-column layout**:

```
┌──────────────┬─────────────────────┬──────────────┐
│              │                     │              │
│   Left       │   Main View         │   Right      │
│   Sidebar    │   (Note Editor)     │   Sidebar    │
│              │                     │              │
│  Navigation  │   Your note         │  AI Agent    │
│  Pinned      │   content goes      │  Metadata    │
│  Tabs        │   here              │  Backlinks   │
│              │                     │              │
└──────────────┴─────────────────────┴──────────────┘
```

- **Left Sidebar**: Quick access to pinned notes and recent tabs
- **Main View**: The note editor where you write
- **Right Sidebar**: AI agent, metadata editor, and backlinks

See the [User Interface Guide](/guides/interface) for a detailed walkthrough.

## Creating Your First Note

Let's create your first note:

1. **Open the note creation dialog**:
   - Click the **"New Note"** button in the top bar, or
   - Press `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (Mac)

2. **Choose a note type**:
   - Start with **"General"** - the default note type for any content
   - Other types like "Meeting", "Task", and "Daily" are available

3. **Start writing**:
   - The editor uses **markdown** syntax
   - Your note saves automatically as you type
   - No need to click "Save"!

**Example note:**

```markdown
# My First Note

This is a **markdown** note with:

- Bullet points
- **Bold** and *italic* text
- Links to other notes: [[Another Note]]

## Ideas

I can organize my thoughts with headings and lists.
```

::: tip
See the [Note Management](/features/notes) guide to learn about markdown, frontmatter, and advanced features.
:::

## Basic Navigation

### Opening Notes

**Search for notes** (`Ctrl+O` / `Cmd+O`):
- Opens a quick search overlay
- Type to find notes by title or content
- Press Enter to open the selected note

**Use the sidebar**:
- Click on pinned notes for instant access
- Click on temporary tabs for recently viewed notes

### Pinning Important Notes

To keep a note easily accessible:

1. Right-click the note (or click the pin icon)
2. Select **"Pin to Sidebar"**
3. The note appears in your left sidebar
4. Drag to reorder pinned notes

Pinned notes are perfect for:
- Your daily note
- Active project notes
- Reference materials you check frequently

### Daily Notes

Access today's daily note:

1. Look for the **"Daily"** section in the left sidebar
2. Click on today's date
3. A new daily note is created if it doesn't exist

Daily notes are great for journaling, logging ideas, and capturing thoughts throughout the day.

## Using the AI Agent

Flint includes a built-in AI agent that can help you with note operations.

### Opening the Agent

- Click the **AI button** in the top-right corner, or
- Press `Ctrl+K` (Windows/Linux) or `Cmd+K` (Mac)

The agent appears in the right sidebar.

### What Can the AI Do?

The AI can help you:

- **Create notes**: "Create a project note for the website redesign"
- **Find notes**: "Find all notes about API design"
- **Organize**: "Summarize my notes from this week"
- **Link notes**: "What notes should I link to from here?"
- **Answer questions**: "What are the main themes in my research notes?"

### Example Conversation

```
You: Create a meeting note for today's standup with the team

AI: I'll create a meeting note for today.
    [Creates meetings/2024-01-15-standup.md]

    I've created a meeting note with:
    - Date: 2024-01-15
    - Type: meeting
    - Default sections for attendees and notes

You: Add Sarah and John as attendees

AI: I've updated the meeting note with attendees.
```

::: tip
The AI has access to all your notes and can perform operations on your behalf. See [AI Agent](/features/agent) for detailed capabilities.
:::

### Setting Up Your API Key

To use the AI agent, you'll need an API key from an AI provider.

**Recommended: OpenRouter** (supports multiple models)

1. Visit [openrouter.ai](https://openrouter.ai) and create an account
2. Generate an API key
3. In Flint, click the **Settings** icon
4. Navigate to **API Keys**
5. Paste your OpenRouter key
6. The key is stored securely in your system keychain

::: warning macOS Users
When you first save an API key, macOS may prompt you to allow "Flint" access to your keychain. Click **"Always Allow"** to avoid repeated prompts. This is a security feature - your keys are encrypted by the operating system.
:::

## Basic Markdown Syntax

Flint notes use standard markdown:

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `# Heading` | Large heading |
| `## Subheading` | Smaller heading |
| `- List item` | Bullet list |
| `1. Numbered` | Numbered list |
| `[[Note Title]]` | Link to another note |
| `` `code` `` | Inline code |
| ` ```code block``` ` | Code block |

## Linking Notes

One of Flint's most powerful features is **wikilinks** - connections between notes.

**Create a link:**

```markdown
I discussed this in [[My Other Note]]
```

**What happens:**
- Click the link to open "My Other Note"
- The other note automatically shows this note in its backlinks
- If the note doesn't exist, you can create it by clicking

**Why link notes?**
- Build a web of connected knowledge
- Discover unexpected connections
- See all references to a concept in one place

See [Wikilinks and Backlinks](/features/wikilinks) for advanced linking patterns.

## Next Steps

Now that you're set up, explore these guides:

### Essential Features
- **[Core Concepts](/guides/core-concepts)** - Understand Flint's mental model
- **[User Interface](/guides/interface)** - Detailed interface walkthrough
- **[Note Management](/features/notes)** - Master note types, metadata, and organization
- **[Search](/features/search)** - Find anything quickly

### Power Features
- **[Wikilinks](/features/wikilinks)** - Build connected knowledge
- **[Daily Notes](/features/daily-notes)** - Daily journaling workflow
- **[Review System](/features/review-system)** - Strengthen understanding with spaced repetition
- **[Multi-Vault](/features/vaults)** - Separate work, personal, and other contexts

### AI Automation
- **[AI Agent](/features/agent)** - Deep dive into AI capabilities
- **[Workflows](/features/workflows)** - Automate repetitive tasks
- **[Custom Functions](/features/custom-functions)** - Extend AI with custom code

## Getting Help

Need assistance?

- **Documentation**: Browse these guides for detailed information
- **Issues**: [Report bugs on GitHub](https://github.com/flint-org/flint-ui/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/flint-org/flint-ui/discussions)

## Tips for Success

::: tip Start Simple
Don't try to use every feature at once. Start by:
1. Creating notes as you think
2. Linking related ideas together
3. Using the AI when you need help organizing

Add workflows, custom functions, and advanced features when you need them.
:::

::: tip Let Capture Be Frictionless
Don't worry about perfect organization upfront. Capture ideas quickly, then organize later with AI assistance. Use the Inbox for truly unorganized thoughts.
:::

::: tip Your Notes Are Just Files
Remember: your notes are plain markdown files in a folder. You can:
- Open them in any text editor
- Sync with cloud storage
- Back them up like any other files
- Search with command-line tools
- Process with scripts

You're never locked in to Flint.
:::

---

**Ready to dive deeper?** Continue with [Core Concepts](/guides/core-concepts) to understand how Flint thinks about notes, knowledge, and AI assistance.
