# flint-note Tutorial: Your Agent-First Note-Taking System

Welcome to flint-note! This tutorial will guide you through using flint-note, an innovative note-taking application designed from the ground up to work seamlessly with AI agents. Unlike traditional note apps that bolt on AI features, flint-note is built to be controlled entirely through natural language conversations with AI assistants.

## What Makes flint-note Different?

flint-note flips the script on note-taking:
- **Agent-First**: Talk to your AI assistant to manage notes, don't click through menus
- **Multi-Vault Architecture**: Separate your work, personal, and project contexts completely
- **Semantic Organization**: Your note types have meaning that AI agents understand
- **Intelligent Linking**: AI automatically discovers and suggests connections across your knowledge
- **File-Based**: All your notes are stored as simple Markdown files you own
- **Extensible**: Easy to create new note types with custom behaviors and agent instructions
- **MCP-Native**: Works with any MCP-compatible AI client and integrates with other MCP tools

## Getting Started

### Prerequisites

Before you begin, make sure you have:
- Node.js 18.0.0 or higher installed
- An MCP-compatible AI client (like Claude Desktop, Cody, or Cursor)
- Basic familiarity with AI chat interfaces

### Configuration

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
7. Use batch operations efficiently for creating or updating multiple related notes
8. Use update_note_type to refine agent instructions based on user feedback
9. Populate metadata schemas automatically when possible

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

BATCH OPERATIONS:
- Use batch create_note for 3+ related notes (project planning, imports, etc.)
- Use batch update_note for bulk status changes or metadata updates
- Handle partial failures gracefully - report success/failure counts with specific errors
- Group related operations for efficiency
- Provide clear feedback on batch results to users

Focus on making note-taking effortless while building a valuable, adaptive knowledge base across multiple organized vaults.
```

5. **Open your AI client** and you're ready to go!

## Core Concepts

### Multi-Vault System: Separate Your Contexts

One of flint-note's most powerful features is its **multi-vault system**. Each vault is a completely separate knowledge base with its own:

- **Note types** and templates
- **Agent instructions** tailored to that context
- **Metadata schemas** for validation
- **Search indexes** and linking systems
- **Configuration** and behaviors

#### Why Use Multiple Vaults?

**Context Separation**: Keep work notes completely separate from personal notes, research projects, or client work.

**Team Collaboration**: Share specific vaults with team members while keeping others private.

**Project Isolation**: Create dedicated vaults for major projects with specialized note types and workflows.

**Different Workflows**: Use different organizational patterns for different areas of your life.

### Note Types: The Heart of flint-note

Traditional note apps organize by folders or tags. flint-note organizes by **note types** - categories that carry semantic meaning. Each note type defines:

- **Purpose**: What kind of information belongs here
- **Agent Instructions**: Specific behaviors AI should exhibit with these notes
- **Metadata Schema**: Structured data validation and extraction
- **Behaviors**: Special actions (like extracting action items, asking for ratings, tracking deadlines)

#### Agent Instructions: Your Personal AI Assistant

A key innovation in flint-note is **agent instructions** - customizable guidelines that tell AI assistants exactly how to behave with each note type. For example:

- **Meeting notes**: "Always extract action items with owners and deadlines, suggest follow-up meetings"
- **Reading notes**: "Ask for key insights and personal rating, suggest related books"
- **Project notes**: "Track milestones and identify potential blockers, link to related meeting notes"

These instructions make your AI assistant increasingly intelligent and personalized to your workflow.

### Intelligent Linking and Discovery

flint-note's linking system goes far beyond simple keyword matching:

- **Semantic Understanding**: AI understands the meaning and context of your notes
- **Cross-Vault Linking**: Connect related information across different vaults when appropriate
- **Automatic Discovery**: AI suggests connections you might not have noticed
- **Bidirectional Relationships**: Links work both ways for comprehensive navigation
- **Context-Aware Search**: Find information based on meaning, not just keywords

## Multi-Vault Workflows

### Setting Up Your Vault System

Let's start by creating a comprehensive vault system:

**You:** "I want to set up separate vaults for my work, personal projects, and research. How should I organize this?"

**AI:** "I'll help you create a multi-vault system. Let me set up three separate vaults:

**work-vault** for professional activities:
- Meeting notes with action item tracking
- Project management with milestone tracking
- 1-on-1 notes with team member development
- Decision logs with reasoning and outcomes

**personal-vault** for life management:
- Goal tracking with progress monitoring
- Reading notes with insights and ratings
- Daily reflections with mood and gratitude
- Health and fitness tracking

**research-vault** for learning and exploration:
- Academic paper notes with citation tracking
- Experiment logs with hypothesis and results
- Idea development with connection mapping
- Reference materials with source validation

Each vault will have specialized agent instructions tailored to its context. Would you like me to create these vaults and their initial note types?"

### Vault Management in Practice

**Switching Between Vaults:**

**You:** "Switch to my personal vault"

**AI:** "Switched to your personal-vault. This vault contains 47 notes across 5 note types: daily-logs, reading-notes, goals, health-tracking, and ideas. Your recent activity includes 3 reading notes added this week and 2 goal updates. What would you like to work on?"

**Cross-Vault Discovery:**

**You:** "Are there any connections between my work project on user experience and my personal reading notes?"

**AI:** "I found several interesting connections across your vaults:

**From personal-vault**:
- 'Don't Make Me Think' (reading-notes) - UX principles that apply to your dashboard project
- 'The Design of Everyday Things' (reading-notes) - User psychology insights relevant to your current work

**From work-vault**:
- 'UX Research Meeting' (meetings) - Discussion of user testing that connects to principles from your reading

I can create explicit links between these notes, or would you like me to create a cross-vault summary note that brings these insights together for your current project?"

## Practical Workflows

### Workflow 1: Enhanced Meeting Notes with Cross-Vault Intelligence

**Creating Intelligent Meeting Notes:**

**You:** "I have a product strategy meeting today with Sarah and Mike. We'll discuss Q4 priorities, budget allocation, and team resources."

**AI:** "I'll create a meeting note for your product strategy discussion. Based on your previous meetings with Sarah and Mike, I notice this is part of your quarterly planning cycle. I've pre-filled attendees and linked to your Q3 retrospective notes.

Given the topics (Q4 priorities, budget, resources), I've also suggested linking to:
- Your Q4 OKR notes (work-vault)
- Budget planning spreadsheet (if you have file access)
- Team capacity notes from recent 1-on-1s

I've set up the meeting template with agent instructions to extract specific action items, budget decisions, and resource allocations. During the meeting, I'll help track key decisions and suggest follow-up items."

**During and After the Meeting:**

**You:** "We decided to prioritize the mobile app redesign. Sarah will lead it with a $50k budget. Mike will handle the backend API updates. We need to hire 2 more developers by end of October."

**AI:** "I've captured those decisions and automatically created action items:

**Decisions Made:**
- Mobile app redesign prioritized for Q4
- Budget allocated: $50k for mobile project
- Team leads assigned: Sarah (mobile), Mike (backend)

**Action Items Created:**
- [ ] Sarah: Create mobile app project plan (Due: Next week)
- [ ] Mike: Scope backend API updates (Due: This Friday)
- [ ] HR/Management: Hire 2 developers (Due: End of October)

**Cross-Vault Connections:**
I've linked this to your personal reading notes on 'Inspired' and 'The Lean Startup' which have relevant product strategy insights. I've also connected it to your team capacity tracking notes.

**Suggested Follow-ups:**
- Schedule project kickoff meeting with Sarah
- Review developer job descriptions with HR
- Update Q4 OKR tracking with new priorities

Would you like me to automatically create calendar invites or follow-up notes for any of these items?"

### Workflow 2: Cross-Vault Research and Learning

**Integrated Learning Workflow:**

**You:** "I'm reading 'Atomic Habits' and want to apply the concepts to both my personal productivity and our team's development processes."

**AI:** "Perfect! I'll create a reading note in your personal-vault for 'Atomic Habits' with enhanced cross-vault intelligence. Let me set this up with connections to both personal and work contexts.

**Personal Applications:**
- Link to your daily-logs for habit tracking
- Connect to your goals tracking for implementation
- Reference your health-tracking notes for wellness habits

**Work Applications:**
- Link to team development notes in work-vault
- Connect to process improvement discussions from recent meetings
- Reference any existing notes about team productivity

I've also set up agent instructions to ask about both personal and professional applications as you add insights. How would you like to start capturing key concepts from the book?"

**You:** "The main insight is that habits are formed through a 4-step loop: cue, craving, response, reward. This applies to both personal habit formation and designing user behaviors in our product."

**AI:** "Excellent insight! I've captured the 4-step habit loop and I can see powerful applications in both contexts:

**Personal Application (personal-vault):**
- Your morning routine could benefit from better cue design
- I noticed in your daily-logs that you struggle with consistent exercise - we could design better rewards
- Your goal of reading more could use the habit stacking principle

**Work Application (work-vault):**
- This connects to our product's user engagement challenges from the UX meeting
- The habit loop could inform our notification strategy (cue → craving → response → reward)
- Team processes could be improved using habit design principles

**Cross-Vault Insights:**
I've found connections to your reading notes on 'Hooked' (user behavior design) and 'The Power of Habit' (behavioral psychology). Should I create a synthesis note that combines insights from all these sources for your product strategy work?"

### Workflow 3: Advanced Project Management with Intelligence

**You:** "Create a comprehensive project tracking system for our mobile app redesign that pulls insights from across all my vaults."

**AI:** "I'll create an intelligent project tracking system that leverages your entire knowledge base:

**Core Project Note (work-vault):**
- Timeline: 12 weeks, 3 phases
- Budget: $50k allocated
- Team: Sarah (lead), Mike (backend), 2 new hires
- Success metrics: User engagement, app store rating, conversion rates

**Cross-Vault Intelligence Integration:**

**From personal-vault:**
- Your reading notes on 'Don't Make Me Think' - UX principles
- 'The Design of Everyday Things' - User psychology insights
- Your goal tracking shows you want to learn more about mobile UX

**From research-vault:**
- Mobile app best practices research
- User behavior studies you've collected
- Design pattern documentation

**Intelligent Project Features:**
- **Milestone Tracking**: AI will automatically check for progress and suggest adjustments
- **Risk Assessment**: Cross-reference with past project challenges in your notes
- **Resource Optimization**: Connect to team capacity and skill assessments
- **Learning Integration**: Surface relevant insights from your reading as needed

**Agent Instructions for this Project:**
- Weekly progress check-ins with specific milestone questions
- Automatic linking to relevant research and insights
- Risk identification based on past project patterns
- Resource need forecasting based on timeline

Would you like me to set up automated weekly reviews and progress tracking for this project?"

## Advanced MCP Integration Examples

flint-note's true power emerges when combined with other MCP servers. Here are some creative examples:

### Example 1: Research-Powered Note Taking

**Combining flint-note + Web Search + File System MCP:**

**You:** "I'm researching sustainable architecture for a new project. Help me create comprehensive research notes."

**AI:** "I'll help you create an intelligent research workflow combining multiple tools:

1. **Web Research**: I'll search for latest sustainable architecture trends, case studies, and best practices
2. **Note Creation**: Create structured research-notes with citation tracking and insight extraction
3. **File Management**: Organize downloaded PDFs, images, and references
4. **Cross-Referencing**: Link to any existing notes about architecture, sustainability, or related projects

Let me start by searching for current sustainable architecture innovations..."

*[AI searches web, finds relevant articles, creates structured notes with automatic citation, downloads relevant PDFs to organized folders, and creates links to existing notes]*

**AI:** "I've created a comprehensive research note 'Sustainable Architecture Trends 2024' with:

**Web Research Results:**
- 15 recent articles on biophilic design, green building materials, and energy efficiency
- 3 case studies of award-winning sustainable buildings
- Current building codes and certification standards

**Organized Files:**
- Downloaded 8 relevant PDFs to `/research/architecture/sustainable/`
- Saved 12 reference images to organized folders
- Created bibliography with proper citations

**Cross-Vault Connections:**
- Linked to your project planning notes in work-vault
- Connected to your reading notes on environmental design
- Referenced your goals around sustainable living

**AI-Enhanced Insights:**
- Identified 5 key trends that directly apply to your project
- Extracted cost-benefit data for different approaches
- Suggested 3 experts to potentially interview

Would you like me to continue researching specific aspects, or shall we start synthesizing this information into actionable project plans?"

### Example 2: Meeting Intelligence with Real-Time Enhancement

**Combining flint-note + Calendar + Email + Web Search:**

**You:** "I have a client meeting tomorrow about their new e-commerce platform. Help me prepare."

**AI:** "I'll create a comprehensive meeting preparation system:

**Meeting Context (from Calendar MCP):**
- Meeting: "E-commerce Platform Discussion"
- Attendees: John Smith (CTO), Lisa Chen (Product Manager)
- Duration: 2 hours
- Previous meetings: 3 related meetings in the past month

**Background Research (Web Search + Email):**
- Researched their company's recent product launches
- Found their current tech stack from job postings
- Reviewed email thread history for context
- Identified 3 key challenges they've mentioned

**Intelligent Meeting Preparation:**
I've created a meeting note pre-populated with:
- Attendee backgrounds and roles
- Previous conversation history and action items
- Research on their industry and competitors
- Suggested agenda based on email discussions
- Questions to ask based on their stated challenges

**Agent Instructions for this Meeting:**
- Track technical requirements and specifications
- Extract budget and timeline information
- Identify decision makers and approval processes
- Note potential project risks or constraints
- Suggest follow-up actions with specific owners

**During the Meeting:**
I'll help you capture decisions, extract action items, and suggest relevant solutions based on your knowledge base and real-time research. After the meeting, I'll create follow-up tasks and link everything to your client project tracking."

### Example 3: Learning Acceleration with Multi-Source Intelligence

**Combining flint-note + Web Search + PDF Analysis + Code Repository:**

**You:** "I'm learning about machine learning model deployment. Help me create a comprehensive learning system."

**AI:** "I'll create an accelerated learning system that combines multiple knowledge sources:

**Dynamic Learning Notes (flint-note):**
- Created 'ML Model Deployment' in your research-vault
- Set up agent instructions to extract practical insights, code examples, and implementation patterns
- Connected to your existing programming and AI notes

**Real-Time Research Enhancement (Web Search):**
- Monitoring latest deployment best practices and tools
- Finding current industry case studies and benchmarks
- Tracking new frameworks and platforms as they emerge

**Practical Code Integration (Code Repository MCP):**
- Analyzing deployment code patterns from top GitHub repositories
- Extracting practical examples and common solutions
- Creating code snippet library linked to your notes

**Document Intelligence (PDF Analysis):**
- Processing academic papers on model deployment
- Extracting key insights from technical documentation
- Summarizing best practices from industry reports

**Intelligent Learning Features:**
- **Adaptive Questioning**: AI asks progressively deeper questions as your knowledge grows
- **Practical Application**: Suggests hands-on projects based on your learning progress
- **Connection Discovery**: Links new concepts to your existing knowledge base
- **Progress Tracking**: Monitors your understanding and suggests areas for deeper study

**Example Learning Session:**

**You:** "I want to understand model versioning strategies."

**AI:** "I'll research model versioning comprehensively:

**From Web Research:**
- Found 12 current articles on ML model versioning
- Identified 5 popular tools: MLflow, DVC, Weights & Biases, Neptune, Kubeflow

**From Code Analysis:**
- Analyzed 25 GitHub repositories showing versioning patterns
- Extracted 8 common implementation approaches
- Found 15 code examples demonstrating best practices

**From Your Knowledge Base:**
- Connected to your existing notes on version control (git workflows)
- Linked to your project management notes about release processes
- Referenced your reading notes on software engineering practices

**Synthesized Learning Note Created:**
I've created a comprehensive note combining all sources with:
- Conceptual overview with clear explanations
- Practical code examples you can try
- Tool comparisons with pros/cons
- Implementation checklist for your projects
- Links to related concepts in your knowledge base

**Next Learning Steps Suggested:**
1. Hands-on tutorial with MLflow (I found a great tutorial and can guide you)
2. Connect this to your current project deployment needs
3. Explore integration with your existing CI/CD knowledge

Would you like me to continue with hands-on implementation, or explore a different aspect of model deployment?"

### Example 4: Content Creation with Research Intelligence

**Combining flint-note + Web Search + Social Media + Email:**

**You:** "I need to write a blog post about the future of remote work. Help me create a research-backed, engaging article."

**AI:** "I'll create a comprehensive content creation system:

**Research Foundation:**
- **Web Search**: Latest remote work studies, trends, and statistics
- **Social Media Monitoring**: Current conversations and pain points
- **Email Newsletter Analysis**: What topics are resonating with audiences

**Content Strategy (flint-note):**
- Created 'Remote Work Future' article note with structured sections
- Set up agent instructions for engaging writing and fact-checking
- Connected to your existing notes on workplace culture and productivity

**Real-Time Intelligence:**
- Monitoring trending remote work topics and discussions
- Finding current statistics and research data
- Identifying key influencers and thought leaders to potentially reference

**Content Development Process:**

**Research Phase:**
- Found 23 recent studies on remote work effectiveness
- Identified 8 major trends: hybrid models, digital nomadism, async work, AI integration
- Gathered current statistics on productivity, employee satisfaction, and company policies

**Audience Intelligence:**
- Analyzed 100+ social media discussions about remote work challenges
- Identified top pain points: communication, collaboration, work-life balance, career growth
- Found language patterns and terminology that resonate with your audience

**Content Creation:**
I've created a structured article outline with:
- Hook: Surprising statistic about remote work adoption
- 5 key sections addressing main audience concerns
- Data-backed insights and actionable advice
- Personal anecdotes and expert quotes
- Call-to-action aligned with your goals

**AI-Enhanced Writing:**
- Fact-checking all claims against current research
- Suggesting engaging headlines and subheadings
- Optimizing readability and flow
- Adding relevant examples and case studies
- Creating social media snippets for promotion

**Cross-Platform Strategy:**
- Email newsletter version for your subscribers
- LinkedIn article for professional network
- Twitter thread for broader reach
- Podcast talking points for audio content

Would you like me to start with the full article draft, or focus on a specific section first?"

## Organization Strategies

### Multi-Vault Organization Patterns

#### By Life Context
- **professional**: Work projects, meetings, team management
- **personal**: Goals, health, relationships, hobbies
- **learning**: Courses, books, research, skill development
- **creative**: Writing projects, art, music, ideas

#### By Collaboration Level
- **private**: Personal thoughts, sensitive information
- **team**: Shared with specific work groups
- **public**: Open source projects, public writing
- **client**: Dedicated vaults for client work

#### By Time Horizon
- **daily**: Current tasks, immediate concerns
- **quarterly**: Medium-term projects and goals
- **annual**: Long-term vision and planning
- **archive**: Completed projects and historical notes

### Intelligent Organization

Let AI help organize your knowledge:

**You:** "My notes are getting messy. Help me reorganize my vault structure."

**AI:** "I'll analyze your current notes and suggest an improved organization:

**Current Analysis:**
- 156 notes across 8 note types
- 23% are meeting notes (mostly work-related)
- 31% are project notes (mix of work and personal)
- Heavy overlap between work and personal contexts

**Suggested Reorganization:**

**Split into 3 Vaults:**
1. **work-vault**: 89 notes (meetings, work projects, team notes)
2. **personal-vault**: 45 notes (goals, reading, personal projects)
3. **learning-vault**: 22 notes (courses, research, skill development)

**Benefits:**
- Cleaner context switching
- Better collaboration possibilities
- Specialized agent instructions for each context
- Improved search and discovery within domains

**Migration Plan:**
I can automatically categorize and move notes based on content analysis, then update all internal links to maintain connections. Would you like me to proceed with this reorganization?"

## Tips for Success

### Start with Context Separation

Begin by identifying your major life contexts and create separate vaults for each. This immediately improves focus and organization.

### Let AI Evolve Your System

Don't over-plan initially. Let your AI assistant analyze your patterns and suggest improvements over time.

### Embrace Cross-Vault Intelligence

Use the AI's ability to find connections across your entire knowledge base, not just within single vaults.

### Integrate Other MCP Tools

flint-note becomes exponentially more powerful when combined with other MCP servers. Start with web search and file management, then add more as needed.

### Use Natural Language

Talk to your AI assistant like a knowledgeable colleague:
- "What patterns do you see in my project notes?"
- "Help me prepare for next week's strategy meeting"
- "Find connections between my reading and current work challenges"
- "Create a comprehensive research system for sustainable architecture"

### Trust the Intelligence

Let AI handle the heavy lifting of organization, linking, and discovery. Focus on creating and thinking.

## Advanced Workflows

### The Research Accelerator

Combine flint-note with web search, PDF analysis, and code repositories to create a research system that:
- Automatically discovers relevant sources
- Extracts and synthesizes key insights
- Creates comprehensive, linked notes
- Suggests practical applications
- Tracks learning progress and gaps

### The Meeting Intelligence Engine

Use flint-note with calendar, email, and web search to:
- Automatically prepare meeting contexts
- Research attendees and relevant topics
- Extract structured action items and decisions
- Create follow-up tasks and reminders
- Link to relevant historical conversations

### The Content Creation Platform

Combine flint-note with web search, social media monitoring, and email analysis to:
- Research trending topics and audience interests
- Create data-backed content outlines
- Generate multiple format versions
- Track performance and engagement
- Build on successful content patterns

### The Project Intelligence System

Use flint-note with file systems, calendar, and web search to:
- Automatically track project progress
- Identify risks and blockers early
- Connect to relevant research and insights
- Coordinate team activities and resources
- Learn from past project patterns

## What's Next?

Your flint-note system will evolve with your needs:

**Week 1**: Set up basic vault structure and core note types
**Week 2**: Let AI start discovering connections and patterns
**Month 1**: Add other MCP tools for enhanced intelligence
**Month 2**: Develop specialized workflows and agent instructions
**Ongoing**: Continuously refine based on AI insights and usage patterns

### Future Possibilities

As the MCP ecosystem grows, flint-note will integrate with:
- **Database connections** for structured data integration
- **API integrations** with your favorite tools and services
- **Collaboration platforms** for team knowledge sharing
- **AI model fine-tuning** for personalized intelligence
- **Workflow automation** for seamless information flow

## Philosophy: Intelligence-Augmented Knowledge

flint-note represents a new paradigm in knowledge management:

- **AI as Partner**: Your AI assistant becomes increasingly knowledgeable about your specific context and needs
- **Cross-Domain Intelligence**: Insights from one area of your life inform and enhance others
- **Continuous Learning**: The system gets smarter as you use it, discovering patterns you might miss
- **Seamless Integration**: Multiple MCP tools work together to create intelligence greater than the sum of parts
- **Personal Evolution**: Your knowledge system grows and adapts with your changing needs and interests

This creates a living, breathing knowledge ecosystem that actively helps you think, learn, and work better.

---

**Ready to start?** Begin with: "Help me set up a multi-vault system for my work and personal life" and let your AI assistant guide you into the future of intelligent knowledge management.

*flint-note: Where your knowledge and AI evolve together.*
