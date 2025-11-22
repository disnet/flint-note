## Overview
Map existing and planned features to Flint's core philosophy: a system for deep knowledge that supports the complete cycle of externalizing, internalizing, and resurfacing.

## Core Philosophy Reference
**Flint builds deep knowledge by supporting the complete cycle of externalizing (getting ideas out), internalizing (making them yours), and resurfacing (bringing them back repeatedly over time to ground memory). Reducing friction in all three areas is critical—but the philosophy is fundamentally about building deep knowledge itself.**

Most tools optimize for one part of this cycle; Flint optimizes for the entire process.

---

## Existing Features

### Notes as First-Class Abstraction
- **Philosophy Connection**: Notes are the unit of thinking, not files, folders, or low-level implementation details. By elevating notes to first-class abstractions, Flint removes cognitive burden—you think in terms of *ideas and their connections*, not storage mechanics
- **Design Choice**: Flint abstracts away filesystem concerns entirely. Users never think about where files live, how to name them, or where they should go. The system handles organization through note types and relationships while you focus entirely on thinking
- **Core Insight**: ID-based notes with stable, immutable identities persist independently of titles or locations. This eliminates the fear of breaking organizational schemes when renaming or reorganizing—you can capture and refactor freely without worrying about breaking connections

#### How It Supports Deep Knowledge:

- **Externalizing**: Capture friction is eliminated because the system handles where ideas belong (through note types) and how they're stored. You externalize thoughts directly into notes without worrying about file naming conventions, folder hierarchies, or metadata tagging. The act of choosing a note type guides *what* and *how* you capture, subtly shaping the thinking process

- **Internalizing**: The system surfaces relationships between notes through multiple mechanisms:
  - **Wikilinks & Backlinks**: See where ideas have been applied, referenced, and built upon across your notes
  - **Note Types**: Different types encode different thinking patterns. An "evergreen" note guides synthesis and universalization; a "prediction" note forces falsifiable claims with calibration; a "daily" note structures reflection and progress tracking. The note type itself shapes how you think about the material
  - **Semantic Discovery**: Search works on ideas and connections, not file paths. You discover patterns in your thinking through the *structure of ideas*, not metadata gymnastics

- **Resurfacing**: The semantic abstraction makes your thinking inherently discoverable. Related notes surface through backlinks and search because connections are encoded in the system, not lost in nested folders

#### Design Principles:

- **Immutable Identity**: Each note has a stable ID independent of its title or location. This allows you to rename, move, or reorganize notes without breaking connections
- **Content-Centric Organization**: How notes are organized emerges from content structure and relationships, not predetermined folder hierarchies imposed before you've thought through the material
- **Type-Guided Thinking**: Note types encode patterns for different kinds of thinking. They're organizational primitives *and* cognitive guides that shape how you approach different types of knowledge

- **Contrast**:
  - **Obsidian/Roam** expose markdown and folder structures—you must manage file naming and hierarchies
  - **Notion** exposes database properties and rigid hierarchies
  - **Flint** abstracts all of this away—you see notes and connections; the system handles everything else

- **Current Implementation**:
  - Note-centric UI where notes are the primary unit of interaction
  - Note types as organizational and cognitive primitives
  - ID-based addressing for stable, rename-safe links
  - Metadata structure within notes (tracked per type, not as flat tags)
  - Parent/child relationships for hierarchical note structures (subnotes)
  - Note status and lifecycle tracking (processed, archived, active states)

- **Planned Enhancements**: [To be added]

### Note Types System
- **Philosophy Connection**: Organizational primitives that encode different thinking patterns for different types of learning
- **Externalizing**: Different note types guide *what* and *how* you capture (daily thoughts vs long-form evergreen ideas vs project-specific thinking)
- **Internalizing**: Agent instructions per type help you process and reflect on information consistently
- **Resurfacing**: Note types structure information so patterns can be discovered and connections made over time
- **Current Implementation**: note types as organizational primitives, note icons to help with recognition and memory
- **Planned Enhancements**: [To be added]

### Pinned and Recent Lists & Spatial Memory

- **Philosophy Connection**: Enables a learning-friendly workflow that mirrors how humans naturally organize physical spaces and track active work
- **Core Insight**: Messiness during note-taking is okay—the system allows you to capture fluidly without premature organization, then clean up and restore order with confidence
- **Pinned Notes**: Your current focus—the notes you're actively working on right now. These remain in place and provide a stable anchor for your thinking.
- **Recent Notes**: As you click on links and create new notes they show up in this list. Can move to pinned notes list via drag and drop or button in the note.
- **Sidebar Organization**: Notes are manually positioned via drag-and-drop, not automatically sorted by alphabetical or timestamp. This **spatial memory** approach works like a messy desk—you know where things are by their position, not by a filing system.
- **The Trust Model**: The pinned and recent lists let you make a mess while exploring—opening many related notes, jumping between links, discovering connections—because you know you can close them and return to your work. The system trusts your navigation will be messy; the cleanup is easy.
- **Current Implementation**: Three-column layout, pinned notes, recent notes, manual sorting and drag-and-drop
- **Future Enhancement**: **Workspaces**—groups of pinned notes organized for different projects/workflows. Switch between workspaces to context-switch between entirely different sets of work while keeping everything recoverable.

### Wikilinks & Backlinks
- **Philosophy Connection**: Making connections explicit is how learning deepens
- **Externalizing**: Forces you to externalize relationships between ideas as you write
- **Internalizing**: Backlinks surface where ideas have been applied/referenced, showing connections across time
- **Resurfacing**: Connections show how ideas have evolved and been reused, enabling pattern discovery
- **Current Implementation**: ID-based links, backlink queries
- **Planned Enhancements**: [To be added]

### The Agent System
- **Philosophy Connection**: The core of Flint—not generating new thoughts, but intelligently supporting all three phases of deep learning (externalizing, internalizing, resurfacing) through conversational interaction
- **Core Concept**: A conversational AI assistant with access to your full note system through a semantic API. The agent understands note types, relationships, content, and your learning patterns. It's your collaborative partner for thinking—helping you capture better, connect deeper, and resurface at the right moments
- **Which Phases Does It Support**: Externalizing / Internalizing / Resurfacing (all three)
- **How It Works**:
  - (1) **Semantic API Access**: The agent has tools for searching, creating, updating, and linking notes. It understands note types and follows type-specific instructions
  - (2) **Conversational Context**: You describe what you're working on naturally. The agent asks clarifying questions, suggests relevant connections, and helps structure your thinking
  - (3) **Type-Aware Assistance**: For each note type, the agent has specific instructions for how to help. Creating an "evergreen" note? The agent helps synthesize timeless concepts. Working with "predictions"? It helps you frame falsifiable claims with proper calibration
  - (4) **Intelligent Suggestions**: Based on what you're working on, the agent proactively suggests related notes, connections, or follow-up actions without interrupting your flow
  - (5) **Task Execution**: Through routines, the agent executes recurring workflows (weekly reviews, reading processing, prediction calibration) according to your defined patterns
- **Key Distinction**: The agent is NOT a general-purpose chatbot. It's deeply integrated with your note system and operates within the philosophy of supporting deep learning, not replacing your thinking
- **Current Implementation**:
  - Conversational UI with access to note operations (create, update, search, link)
  - Note type system guides agent behavior
  - Routine system for recurring tasks
  - Integration with Reference Shelf and Review System for specialized workflows
- **Planned Enhancements**: [To be added]

### Search & Filtering
- **Philosophy Connection**: Making your thinking discoverable and enabling resurfacing
- **Externalizing**: [How?]
- **Internalizing**: [How?]
- **Resurfacing**: Core infrastructure for bringing past ideas back into focus
- **Current Implementation**: [Details needed]
- **Planned Enhancements**: [To be added]

### Routines
- **Philosophy Connection**: Systematizing recurring workflows creates regular practices for internalization and resurfacing. Reduces friction by automating the scheduling and direction of these workflows—the agent executes according to user-defined patterns
- **Concept**: Scheduled skills for the agent. You define a routine with a schedule (daily, weekly, monthly, etc.), a clear purpose, and detailed step-by-step instructions for the agent to follow. The system tracks when routines were last executed and surfaces overdue routines in the UI
- **Which Phases Does It Support**: Externalizing / Internalizing / Resurfacing
- **How It Works**:
  - (1) Define a routine: set a schedule, write a concise purpose statement, and provide detailed instructions for the agent to execute
  - (2) The system tracks execution history and due dates
  - (3) When a routine is due, the UI surfaces it to the user with a reminder
  - (4) The user triggers the routine (or the agent proactively suggests it)
  - (5) The agent executes the routine according to the provided instructions
  - (6) The system records when the routine was last run and reschedules it based on the defined interval
- **Example**: A weekly review routine runs every Sunday. Its purpose: "Synthesize the week's thinking into a cohesive summary." Its instructions: (1) Search for all daily notes from the past week, (2) Identify major themes and activities, (3) Extract key insights, (4) Create a new weekly summary note with sections for each major theme
- **Design Rationale**: Most people know which workflows they'd benefit from repeating (weekly reviews, reading summaries, prediction reviews, project planning prep) but implementing these recurring practices requires discipline. Routines remove friction by encoding these workflows as scheduled agent skills. The system reminds you when they're due and executes them reliably
- **User Benefit**: Build sustainable learning practices without the discipline burden. Externalizing (structured review prompts), internalizing (regular synthesis sessions), and resurfacing (recurring reflection) all become habitual through routine scheduling
- **Current Implementation**: Recurring and one-time routines, backlog type for silent discovery of issues during other work
- **Planned Enhancements**: [To be added]

### Reference Shelf
- **Philosophy Connection**: Reduces friction during the externalizing and internalizing phases by keeping relevant context immediately available without losing focus on primary work
- **Which Phase Does It Support**: Externalizing / Internalizing
- **How It Works**: Add multiple notes to a live "shelf" in the right sidebar while editing a note in the main editor. Each shelf note includes a live editor and can be toggled to show/hide content. The shelf is a personal workspace—notes are manually arranged and serve as reference material while you develop thinking in the main editor
- **Design Rationale**: Mirrors how writers work with physical reference materials on a desk—keeping research, outlines, previous notes, or related concepts visible without switching contexts. The reference shelf maintains "spatial memory" consistent with Flint's philosophy of organized messiness
- **User Benefit**: Work more fluidly by keeping multiple reference notes visible simultaneously. Makes it easier to draw connections, cite related ideas, and maintain context while developing a single note
- **Current Implementation**: Multiple notes can be added to sidebar, live editors on each, toggle visibility per note
- **Planned Enhancements**: Consider better naming (current name "sidebar notes" is descriptive but generic)

### Review System (Spaced Repetition with AI-Generated Prompts)
- [[n-720af481]]
- **Philosophy Connection**: Systematizes the resurfacing phase by making active recall practice automatic and low-friction. The agent handles prompt generation, freeing you to focus on learning
- **Which Phase Does It Support**: Resurfacing / Internalizing
- **How It Works**: (1) Mark notes "for review" with a button in the editor. (2) A dedicated "Review" system view shows marked notes on a spaced repetition schedule. (3) For each note, the agent generates a custom testing prompt based on the note's content to check active recall. (4) You answer the prompt. (5) Agent provides immediate feedback on your answer. (6) You rate how well you performed (pass/fail). (7) The note is rescheduled for future review based on performance—successful recalls lengthen intervals, failures shorten them
- **Design Rationale**: Active recall is the most effective learning mechanism, but writing good test prompts is friction. By having the agent generate prompts contextually from note content, the system removes a barrier to spaced repetition practice. The "mark for review" button is minimal friction for explicitly signaling intent
- **User Benefit**: Build deep retention and recall of your notes without the overhead of maintaining a separate spaced repetition system. Get immediate, contextual feedback that helps you understand what you've internalized and what needs reinforcement
- **Current Implementation**: Mark button in editor, Review system view, agent-generated prompts, performance-based rescheduling
- **Planned Enhancements**: [To be added]

### Inbox
- **Philosophy Connection**: Reduces cognitive load during the externalizing phase by resolving the concern "will I find this note later?" Processing the inbox becomes a lightweight routine for confirming you're happy with recent captures
- **Which Phase Does It Support**: Externalizing / Internalizing
- **How It Works**: (1) The Inbox view lists all recently created notes in reverse chronological order. (2) Each note has a "Mark as Processed" button. (3) When you mark a note as processed, it's removed from the inbox view. (4) The inbox becomes a regular spot to review what you've created and ensure nothing important is forgotten or left in limbo
- **Design Rationale**: Most note systems create friction at the moment of capture because you worry about finding the note later. The inbox removes this friction by providing a simple review mechanism: "I just created this—do I need to do something with it now, or am I happy with how it stands?" Marking notes as processed is a confirmation ritual that builds confidence you've captured well
- **User Benefit**: Capture fluidly without worry. Processing the inbox once a day or week gives you a moment to verify that recent notes are structured well, linked properly, or tagged appropriately—before they disappear into the system. It's a minimal-friction entry point for the internalizing phase
- **Current Implementation**: Inbox view showing recent notes, processed state tracked per note, button to mark processed, badge with number of notes in the inbox
- **Planned Enhancements**: [To be added]

---

## Planned Features

### Note Suggestions (Inline Agent Feedback)
- **Philosophy Connection**: Supports the internalizing phase by providing continuous, low-friction feedback on note quality, structure, and thinking. The agent acts as a collaborative editor—not replacing your judgment, but surfacing opportunities to deepen, connect, or refine your thinking before you move forward
- **Which Phase Does It Support**: Internalizing (primarily) / Externalizing (secondary)
- **Core Concept**: Note types can be configured to enable "agent suggestions." When suggestions are enabled for a type, the agent analyzes notes of that type as they're being edited and returns a list of contextual suggestions displayed alongside the note content (similar to Google Docs comments). Suggestions are opt-in per note type, with optional custom instructions to guide the agent's analysis
- **How It Works**:
  - (1) **Configuration**: In the note type settings, enable "Allow Agent Suggestions" and optionally provide custom prompt guidance (e.g., "Suggest action items, follow-ups, and related concepts" for meeting notes, or "Suggest connections to existing evergreen notes and opportunities to generalize" for concepts)
  - (2) **Triggering**: When a note of a suggestion-enabled type is opened in the editor, the note content is sent to the agent along with the suggestion instructions
  - (3) **Generation**: The agent analyzes the note and returns structured suggestions (each with a type, target location/content, and explanation)
  - (4) **Display**: Suggestions appear in a sidebar panel alongside the note, similar to comments in collaborative docs. Each suggestion can be expanded, accepted, ignored, or dismissed
  - (5) **Interaction**: Users can accept suggestions (which applies the change), dismiss them (removes from view), or ignore them (keeps visible but marks as reviewed)
- **Suggestion Types**: Examples include "action_item" (capture tasks that emerged), "connection" (link to related notes), "clarification" (reword for clarity), "structure" (reorganize sections), "expand" (develop a concept further), "source" (find supporting reference), "generalize" (extract universal principle)
- **Design Rationale**:
  - The agent is already deeply integrated with note types through agent instructions. Suggestions extend this to provide real-time feedback during writing
  - Unlike a general writing assistant that makes unsolicited changes, suggestions are *shown alongside* the note, respecting user control and creative autonomy
  - By allowing custom prompt guidance per note type, different note types get different kinds of suggestions (evergreen notes get connection suggestions, predictions get calibration suggestions, meetings get action items)
  - Suggestions are dismissable and don't interfere with the writing flow—they're collaborative nudges, not automated rewrites
- **User Benefit**:
  - Get real-time feedback on your thinking without switching contexts or asking the agent directly
  - Discover connections you might have missed (related evergreen notes, relevant predictions, past projects)
  - Capture follow-ups and action items without stopping your writing flow
  - Improve clarity and structure without external editing passes
  - Learn better thinking patterns through consistent feedback tailored to each note type
- **Implementation Details**:
  - Agent suggestions API that takes note type, content, and custom instructions; returns structured list of suggestions
  - Suggestion sidebar panel in editor UI
  - Accept/dismiss/ignore buttons per suggestion
  - Configuration UI in note type settings (toggle, prompt guidance text input)
  - Optional: Cache suggestions and only regenerate when note content changes significantly
- **Differentiation from Other Features**: Unlike the Review System (which focuses on active recall after a note is complete), suggestions happen *during* the writing process to shape thinking. Unlike Routines (which are scheduled), suggestions are triggered by user action (opening the note)
- **Future Enhancements**:
  - Machine learning on accepted vs ignored suggestions to personalize suggestion types per user
  - Suggestion history showing what suggestions have been made and accepted over time
  - Collaborative suggestions when multiple users edit the same note
