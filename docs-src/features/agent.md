# Agent

The Agent in Flint helps you organize, search, and manage your notes through natural conversation.

## Philosophy: Agent, Not Replacement

The AI in Flint is designed to **amplify your thinking**, not replace it.

**What the AI does:**

- Handles mechanical tasks (creating, searching, organizing notes)
- Suggests structure and connections
- Automates repetitive workflows
- Answers questions about your notes

**What the AI doesn't do:**

- Think for you
- Replace your judgment

You remain in control of your content and thinking. The AI is a powerful organizational tool.

## The Agent Understands Your Notes

What makes the agent powerful is its deep integration with your note system.

**The agent knows about:**

- **Note types** - Understands the difference between daily notes, meeting notes, tasks, projects, and your custom types
- **Wikilinks** - Can follow connections between notes, understanding your knowledge graph
- **Note structure** - Reads frontmatter metadata, sections, and content to understand context
- **Your vault** - Has access to all your notes when it needs them for context

**This means the agent can:**

- Read one note and follow wikilinks to related notes automatically
- Understand the metadata and fields specific to each note type
- Plan and execute changes across multiple interconnected notes
- Suggest connections based on content across your entire vault

For example, if you ask the agent to "summarize my project notes about the API redesign," it can:

1. Find all project notes mentioning the API redesign
2. Follow wikilinks to related design documents
3. Read meeting notes that reference those projects
4. Synthesize information from across your vault
5. Create a comprehensive summary with proper links

The agent doesn't just perform isolated operations—it understands the relationships in your notes and can work with your entire knowledge system.

## Opening the Agent

**Keyboard shortcut:**

- `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)

**Click the agent button:**

- In the top-right corner of the window

**The agent appears:**

- In the right sidebar
- As a chat interface
- Persistent conversation history per vault

## Chat Interface

### Conversation Area

**What you see:**

- Your messages
- AI responses
- Tool calls (when AI performs actions)
- Timestamps
- Remaining credits

**Streaming responses:**

- AI responds in real-time
- You see text as it's generated
- Tool calls show progress

**Example conversation:**

```
You: Create a project note for the mobile app redesign

AI: I'll create a project note for the mobile app redesign.

    [Tool: create_note]
    Creating: projects/mobile-app-redesign.md

    ✓ Created projects/mobile-app-redesign.md

    I've created a project note titled "Mobile App Redesign" with:
    - Type: project
    - Status: active
    - Basic project template

    Would you like me to add any specific details?

You: Add a due date of Feb 15 and tag it as high priority

AI: I'll update the note with those details.

    [Tool: update_note]
    Updating metadata...

    ✓ Updated projects/mobile-app-redesign.md

    Done! The note now has:
    - due_date: 2024-02-15
    - priority: high
```

### Message Input

**Text area:**

- Type your message
- Supports multi-line input
- Press Enter to send
- `Shift+Enter` for new line

**What to ask:**

- Natural language requests
- Questions about your notes
- Organization tasks
- Workflow automation

### Model Selector

**Available models:**

- **Normal** (Claude Haiku 4.5) - Fast and economical, great for just about everything
- **Plus Ultra** (Claude Sonnet 4.5) - Extra reasoning power when you really need it

**Model selection tips:**

- **Normal** is the recommended choice for most tasks
- **Plus Ultra** provides enhanced reasoning capabilities but is much slower and more expensive
- Only switch to Plus Ultra when you need the extra reasoning power

## What the AI Can Do

The AI has access to powerful tools.

### Note Operations

#### Create Notes

**Ask the AI to create notes:**

```
You: Create a meeting note for tomorrow's standup

AI: [Creates meetings/2024-01-16-standup.md]
```

```
You: Create a general note about my idea for the new feature

AI: [Creates general/new-feature-idea.md]
```

**With metadata:**

```
You: Create a task note for "Review PRs" with high priority and due date tomorrow

AI: [Creates task with priority:high and due_date set]
```

#### Read Notes

**AI can read note content:**

```
You: What does my project overview note say about the timeline?

AI: [Reads projects/overview.md]

    According to your project overview, the timeline is:
    - Phase 1: Jan-Feb (Planning)
    - Phase 2: Mar-Apr (Development)
    - Phase 3: May (Testing)
    - Launch: June 1
```

```
You: Summarize my meeting notes from yesterday

AI: [Reads daily/2024-01-15.md]

    Yesterday's meeting covered:
    - API design decisions
    - Timeline adjustments
    - Resource allocation
```

#### Update Notes

**AI can modify existing notes:**

```
You: Add a section to my project plan about testing strategy

AI: [Reads, updates projects/plan.md]

    I've added a "Testing Strategy" section with:
    - Unit testing approach
    - Integration testing
    - E2E testing plan
```

```
You: Change the priority of my "Review PRs" task to urgent

AI: [Updates task metadata: priority:urgent]
```

#### Search Notes

**AI can search your vault:**

```
You: Find all notes about authentication

AI: [Searches for "authentication"]

    I found 5 notes about authentication:
    - API Authentication Design
    - User Authentication Flow
    - OAuth Implementation Notes
    - Security Considerations
    - Meeting: Auth Discussion

    Would you like me to summarize them?
```

```
You: Show me meeting notes from last week

AI: [Searches: type:meeting created:last-week]

    I found 3 meeting notes from last week:
    1. Team Standup (Jan 8)
    2. Client Review (Jan 9)
    3. Planning Session (Jan 12)
```

#### Rename Notes

**AI can rename notes:**

```
You: Rename my "temp ideas" note to "Product Feature Ideas"

AI: [Renames note, all wikilinks automatically updated]

    Renamed to "Product Feature Ideas"
    Updated 3 wikilinks in other notes
```

#### Move Notes

**AI can change note types:**

```
You: Move this [[Note]] from general to projects

AI: [Updates type: project, moves file]

    Moved to projects/ folder
    Updated type to 'project'
```

#### Delete Notes

**AI can delete notes (with confirmation):**

```
You: Delete my old draft notes

AI: I found these draft notes:
    - Draft Ideas (3 months old)
    - Random Thoughts (6 months old)

    Should I delete these? This cannot be undone.

You: Yes

AI: [Deletes notes]

    Deleted 2 notes
```

### Note Type Operations

#### List Note Types

```
You: What note types do I have?

AI: [Lists types]

    You have 7 note types:
    - general
    - daily
    - meeting
    - task
    - project
    - inbox
    - book-notes (custom)
```

#### Create Note Types

```
You: Create a note type called "recipe" with fields for servings, prep_time, and cook_time

AI: [Creates .note-types/recipe/recipe.md]

    Created new note type "recipe" with fields:
    - servings (number)
    - prep_time (string)
    - cook_time (string)

    You can now create recipe notes!
```

#### Get Note Type Details

```
You: Show me the details of my meeting note type

AI: [Reads meeting type definition]

    Meeting note type:
    - Purpose: Meeting minutes and notes
    - Fields: date, attendees
    - Template includes: Attendees, Agenda, Notes, Action Items
    - Located in: meetings/ folder
```

### Link Operations

#### Get Backlinks

```
You: What notes link to this one?

AI: [Gets backlinks for current note]

    This note is referenced by:
    - Project Overview (2 links)
    - Team Meeting Notes (1 link)
    - Action Items (1 link)
```

### Vault Operations

#### List Vaults

```
You: What vaults do I have?

AI: [Lists vaults]

    You have 3 vaults:
    - Personal Notes (current)
    - Work
    - Research
```

### Organization Tasks

#### Organize Inbox

```
You: Help me organize my inbox

AI: [Reads inbox notes, analyzes content]

    I found 12 inbox notes. Here's what I suggest:

    Move to 'project':
    - Product roadmap ideas
    - Feature planning notes

    Move to 'general':
    - Random thoughts on design
    - Book recommendations

    Move to 'meeting':
    - Quick notes from standup

    Should I proceed with these changes?
```

#### Suggest Links

```
You: What notes should I link from here?

AI: [Analyzes content, finds related notes]

    Based on your content, you might link to:
    - [[API Design Principles]] - discusses similar concepts
    - [[System Architecture]] - related technical decisions
    - [[Project Timeline]] - mentions same milestones

    Would you like me to add these links?
```

#### Add Metadata

```
You: Suggest metadata for this note

AI: [Analyzes content]

    I suggest adding:
    - tags: [api, design, technical]
    - priority: medium
    - status: in-progress
    - related: [[Architecture Docs]]

    Should I add these?
```

#### Generate Summaries

```
You: Summarize all my notes about the API redesign

AI: [Searches, reads relevant notes, creates summary]

    Created summary note: summaries/api-redesign-summary.md

    Key points:
    - Started in December 2023
    - Main goals: performance, scalability
    - 3 design options considered
    - Chose Option B (hybrid approach)
    - Current status: in progress
    - Expected completion: March 2024

    Linked to 7 source notes
```

## Tool Calls: How It Works

When the AI performs actions, it uses **tools**.

### What You See

**Tool execution:**

```
[Tool: create_note]
Creating: projects/my-project.md
✓ Created successfully
```

**Parameters:**

```
[Tool: update_note]
Parameters:
  note_id: n-abc123
  metadata:
    priority: high
    due_date: 2024-02-15
✓ Updated successfully
```

**Results:**

```
[Tool: search_notes]
Query: "api design"
Found: 5 notes
```

### Behind the Scenes

The AI:

1. Understands your request
2. Decides which tool(s) to use
3. Calls tools with appropriate parameters
4. Processes the results
5. Responds to you in natural language

**You don't need to know tool names** - just ask in natural language.

## Conversation Management

### Starting New Conversations

**Why start fresh:**

- Previous context no longer relevant
- Want to change topics
- Conversation got too long

**How to start new:**

- Click "New Conversation" button
- Previous conversation saved
- Start with clean context

### Conversation History

**Persistence:**

- Conversations saved per vault
- Available when you return
- Stored locally in vault data

**Accessing history:**

- Click conversation history icon
- See past conversations
- Resume previous discussions

## Credits

Flint displays your remaining credits in the chat interface.

### What's Displayed

**Credit balance:**

- Shows your current remaining credits
- Updates as you use the AI
- Visible in the chat interface

### Managing Credit Usage

**Tips to conserve credits:**

1. **Use the Normal model:**
   - Normal (Claude Haiku 4.5) uses fewer credits
   - Only use Plus Ultra when you need extra reasoning power

2. **Start fresh conversations:**
   - Long conversations consume more credits due to context
   - New conversation = reduced context size

3. **Be specific:**
   - Clear requests = fewer back-and-forth messages
   - Fewer messages = fewer credits used

## Best Practices

### Effective Prompts

**Be specific:**

```
❌ "Organize my notes"
✓ "Move inbox notes to appropriate types based on their content"
```

**Provide context:**

```
❌ "Add metadata"
✓ "Add priority and due_date metadata to this task note"
```

**Break down complex tasks:**

```
❌ "Set up my project tracking system"
✓ "Create a project note type, then create a note for my website project, then list all tasks related to it"
```

### Understanding Limitations

**The AI can't:**

- Read your mind (be explicit)
- Access external websites
- Remember across vaults
- Execute arbitrary code
- Modify system settings

**The AI might:**

- Misunderstand ambiguous requests
- Suggest imperfect organization
- Need clarification on complex tasks
- Make mistakes (always review!)

## Privacy and Security

### What Data is Shared

**Sent to AI provider (e.g., OpenRouter, Anthropic):**

- Your message content
- Relevant note content (when AI reads notes)
- Conversation history (for context)

**NOT sent:**

- Your entire vault
- System settings or API keys
- Other vaults

### Data Control

**You control:**

- Your API keys (stored in OS keychain)
- When to use AI (it's opt-in per conversation)

**Local-first:**

- Notes never leave your machine except for AI requests
- Conversation history stored locally

### API Key Security

**Storage:**

- Keys stored in OS keychain
- Encrypted by your operating system
- Never sent anywhere except to the AI provider

**Access:**

- Only Flint can access your keys
- Keys not stored in plain text
- Can be cleared at any time

See [Privacy and Security](/guides/privacy-security) for more details.

## Next Steps

- **[Note Management](/features/notes)** - Organize with AI help

---

**Remember:** The AI is a powerful tool for organization and automation, but **you** are the one who creates insights and makes connections. Use the AI to handle the mechanics, so you can focus on thinking.
