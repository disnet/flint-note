# flint-note

**NOTE: Experimental! This is very work in progress. Do not trust it yet!**

A Model Context Protocol (MCP) server that provides an agent-first note-taking system designed from the ground up for AI collaboration. Instead of adding AI features to traditional notes, flint-note treats AI agents as your primary interface for creating, organizing, and connecting your knowledge.

## Key features

- **Agent-first design** - AI agents understand your note types and guide you through creating structured content
- **Local markdown storage** - Your notes are plain markdown files you own and control forever
- **MCP server architecture** - Connects to any AI client that supports the Model Context Protocol
- **Intelligent note types** - Each note type has its own agent instructions and metadata schema
- **Customizable AI behavior** - Tell agents how to behave for each note type using natural language

## Pre-requisites

- Node.js 18+
- Any [MCP capable client](https://github.com/punkpeye/awesome-mcp-clients) (e.g., Claude Desktop, Cursor, Raycast, etc.)

### How It Works

1. **flint-note server** runs locally on your machine, managing your markdown files
2. **AI clients** (like Claude Desktop) connect to the server via MCP
3. **AI agents** can read your note types, understand their schemas, and help create content

### Getting Started

Add flint-note to your client's MCP config:

```json
{
  "mcpServers": {
    "flint-note": {
      "command": "npx",
      "args": ["@flint-note/server"],
    }
  }
}
```

#### Adding Custom Prompts for Better AI Behavior

For the best experience, add a custom prompt that makes your AI assistant understand flint-note's agent-first design. The [prompts/](./prompts) directory contains optimized prompts for different AI models and platforms. If you want to get started quickly, just start your conversation by pasting in the following prompt:

```
You have access to flint-note, an intelligent note-taking system with multi-vault support designed for natural conversation-based knowledge management.

CORE BEHAVIORS:
- Be conversational: "I've added that to your work vault meeting notes" vs "Note created successfully"
- Be proactive: extract action items, suggest connections, improve organization
- Be vault-aware: understand current vault context and adapt behavior accordingly
- Follow agent instructions: adapt behavior based on note type-specific agent instructions
- Use metadata intelligently: validate and populate metadata schemas automatically
- Evolve continuously: suggest agent instruction improvements based on usage patterns

ESSENTIAL WORKFLOW:
1. Check current vault context using get_current_vault when needed
2. Determine appropriate note type based on content and vault context
3. **ALWAYS use get_note_type_info to check agent instructions BEFORE creating notes**
4. Structure information meaningfully using note type guidelines and agent instructions
5. Extract actionable items: `- [ ] Task (Owner: Name, Due: Date)`
6. Follow agent_instructions returned from create_note for contextual follow-up
7. Use update_note_type to refine agent instructions based on user feedback
8. Populate metadata schemas automatically when possible

**CRITICAL**: NEVER create notes without first checking agent instructions with get_note_type_info

VAULT MANAGEMENT:
- Always understand which vault is currently active
- Help users create and switch between vaults for different contexts (work, personal, research)
- Provide vault-aware suggestions and organization
- Use list_vaults, create_vault, switch_vault, get_current_vault as needed
- Adapt behavior based on vault purpose and context

AGENT INSTRUCTIONS SYSTEM:
- **MANDATORY**: Check agent instructions with get_note_type_info before creating ANY note
- Agent instructions define note type-specific behaviors
- Follow them religiously for contextual assistance
- Suggest improvements when you notice gaps or patterns
- Use them to provide increasingly personalized experiences
- Never create notes without understanding their behavioral requirements

Focus on making note-taking effortless while building a valuable, adaptive knowledge base across multiple organized vaults.
```

## Example Agent Conversations

### Agent-Guided Note Creation
```
You: I just finished reading "The Psychology of Money"
Agent: I'll create a reading note for you. Based on your reading note schema, I need:
       - Your rating (1-5 stars)
       - Key insights that stuck with you
       - The author's name

       What would you rate this book?
You: I'd give it a 4/5. Main insight was how behavior matters more than knowledge in investing.
Agent: Perfect! I'm creating your reading note with Morgan Housel as author, 4/5 rating,
       and that key insight. The note will be saved as reading/psychology-of-money.md
```

### Intelligent Note Suggestions
```
You: Create a project note for our website redesign
Agent: I'll set up a project note. Based on your project schema, I should include:
       - Project goals and success criteria
       - Key milestones and deadlines
       - Team members and stakeholders
       - Risk assessment

       What's the main goal for this redesign?
You: Improve user engagement and reduce support tickets by 30%
Agent: Excellent! I'll create projects/website-redesign.md with that goal and template
       sections for milestones, team, and risks. Should I link this to any existing notes?
```

### Smart Metadata and Organization
```
You: Add a meeting note for today's standup
Agent: Creating your meeting note. I see you have a standup template that includes:
       - Attendees
       - What did we accomplish yesterday?
       - What are we working on today?
       - Any blockers?

       Who attended today's standup?
You: The whole team - Sarah, Mike, Alex, and me
Agent: Got it! I'll create meetings/standup-2024-01-15.md with those attendees and
       the standup template. The metadata will automatically tag this as a "standup"
       meeting for easy filtering later.
```

## How Note Types Work

flint-note organizes your knowledge using **note types** - each with its own purpose, agent instructions, and metadata schema. Your workspace looks like this:

```
my-notes/
├── .flint-note/
│   └── config.yml
├── reading/
│   ├── _description.md          # Defines how agents help with reading notes
│   ├── atomic-habits.md
│   └── psychology-of-money.md
├── projects/
│   ├── _description.md          # Defines how agents help with projects
│   ├── website-redesign.md
│   └── mobile-app.md
├── meetings/
│   ├── _description.md          # Defines how agents handle meeting notes
│   └── team-standup-2024-01-15.md
└── daily/
    ├── _description.md          # Defines daily note format and prompts
    └── 2024-01-15.md
```

Each `_description.md` file tells agents how to behave for that note type:

```markdown
# Reading Notes

## Purpose
Track books, articles, and papers with structured insights and ratings.

## Agent Instructions
- Always ask for the author's background and credentials
- Extract key insights and actionable takeaways
- Request a personal rating (1-5 stars) and what made it memorable
- Suggest connections to other readings in the vault
- Encourage specific quotes with page references

## Metadata Schema
- title: Book/article title (required, string)
- author: Author name (required, string)
- rating: Personal rating (required, number, min: 1, max: 5)
- status: Reading progress (required, select: to_read|reading|completed)
- tags: Topic categories (optional, array)
- isbn: ISBN for books (optional, string)
```

### Customizing Agent Behavior

You can modify how agents work with any note type just by talking to them:

```
You: Update my reading notes so agents always ask about the book's publication year
Agent: I'll update your reading note instructions to include asking about publication year.
       [Updates reading/_description.md with the new instruction]

You: Make project notes more focused on deadlines and blockers
Agent: I'll modify your project note instructions to emphasize deadline tracking
       and proactive blocker identification.
       [Updates projects/_description.md accordingly]
```
