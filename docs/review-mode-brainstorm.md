# Review Mode: Brainstorm Document

## Executive Summary

This document explores how to implement a **Review Mode** in Flint that supports crystallized intelligence development through evidence-based learning principles while maintaining Flint's core philosophy: **humans think, AI assists**.

The review mode should support the three-stage process of knowledge accumulation:

1. **Encoding** - Active processing during note creation
2. **Consolidation** - Integration with existing knowledge through review
3. **Retrieval** - Strengthening memory traces through active recall

## Core Principles from Crystallized Intelligence Research

### The Science Behind Review

**Multiple Exposures Matter**

- Vocabulary research shows 12-17 exposures needed for retention
- Single encounters, no matter how intense, rarely produce lasting knowledge
- Review creates the repeated exposure necessary for consolidation

**Retrieval Practice Outperforms Passive Review**

- Testing serves as a learning tool, not just assessment
- Effort of retrieval strengthens memory traces
- Active recall >> passive re-reading

**Spaced Repetition > Massed Practice**

- Gradually increasing intervals between reviews
- Initially more difficult but produces superior long-term retention
- Engages both synaptic (hours) and systems (weeks-months) consolidation

**Elaborative Encoding During Review**

- Connecting to existing knowledge during review
- Making relationships explicit
- Explaining concepts in your own words
- Building schema representations

**Sleep and Consolidation**

- Memory consolidation occurs during rest periods
- Reviews should be scheduled with consolidation periods in mind
- Not just about timing reviews, but respecting biological processes

## Design Philosophy: Aligning with Flint's Values

### Thinking-First, Not Automation-First

**The Key Insight: Deep Processing vs. Shallow Recognition**

The goal is to force **active cognitive engagement**, not passive recognition. Research shows:

- Retrieval practice strengthens memory through _effort_
- Elaborative encoding requires _reconstructing_ understanding
- "Desirable difficulties" make learning harder but more effective

AI-generated review materials can be powerful IF they force deep processing rather than surface recognition.

**Anti-Pattern: Shallow Recognition Prompts**

- ❌ "What is elaborative encoding?" → Reveals definition
- ❌ Generic flashcards from note definitions
- ❌ Multiple choice that tests recognition, not understanding
- ❌ Prompts that can be answered without real thought

**Flint Pattern: AI-Generated Deep Processing Prompts**

- ✅ **Synthesis prompts**: "How do your notes on [[X]] and [[Y]] connect?"
- ✅ **Application prompts**: "Apply this concept to [your project]"
- ✅ **Explanation prompts**: "Explain this to someone who knows [[prerequisite]]"
- ✅ **Connection prompts**: "Should this link to [[related-note]]? Why?"
- ✅ **Extension prompts**: "What questions does this raise?"
- ✅ **Reconstruction prompts**: "Explain the argument without looking"

The AI generates the _prompt_ (leveraging your knowledge graph), you generate the _response_ (doing the thinking).

### User Agency and Control

**Explicit vs. Implicit Review**

- Users should understand WHY a note is being suggested
- Review intervals should be transparent and adjustable
- Opt-in, not mandatory
- No gamification that creates artificial pressure

**Progressive Disclosure**

- Simple review workflow for beginners
- Advanced scheduling options for power users
- Metadata visible but not required

## AI-Generated Review Prompts: Deep Dive

### Why AI-Generated Prompts Are Powerful for Review

Traditional flashcards test isolated facts. But your notes form a **knowledge graph** with rich connections. AI can:

1. **Leverage your entire knowledge base** - Generate prompts that span multiple notes
2. **Identify implicit connections** - Suggest relationships you haven't made explicit
3. **Adapt to your progress** - Harder questions as understanding deepens
4. **Create context-specific challenges** - Reference your projects, recent work, other notes
5. **Force reconstruction** - Require explanation, not recognition

This aligns perfectly with crystallized intelligence principles: knowledge isn't isolated facts, it's an integrated, networked understanding.

### Types of AI-Generated Review Prompts

#### 1. Synthesis Prompts (Connect Multiple Notes)

**Example:**

```
Your notes [[elaborative-encoding]] and [[schema-formation]] both
discuss memory organization. Explain how elaborative encoding
helps build schemas. What's the mechanism?
```

**Why it works:**

- Requires retrieving concepts from multiple notes
- Forces identification of relationships
- Can't be answered by recognition alone
- Builds connections in your knowledge graph

#### 2. Application Prompts (Connect to User's Work)

**Example:**

```
You wrote about retrieval practice in this note. Looking at
your daily note from yesterday, you mentioned working on
[[project-website-redesign]]. How could you apply retrieval
practice to learning the new framework?
```

**Why it works:**

- Bridges abstract concepts to concrete situations
- Requires transfer of learning
- Makes knowledge personally relevant
- Shows whether you truly understand or just memorized

#### 3. Explanation Prompts (Teach to Learn)

**Example:**

```
You have a note on [[working-memory]] that explains basic
concepts. Now explain elaborative encoding to someone who
understands working memory but hasn't read this note. What's
new here? How do they relate?
```

**Why it works:**

- Teaching is the deepest form of understanding
- Requires identifying prerequisites
- Forces clear articulation
- Reveals gaps in understanding

#### 4. Connection Discovery Prompts

**Example:**

```
This note on [[spaced-repetition]] doesn't link to your note
on [[memory-consolidation]], but they're related through sleep
and consolidation timing. Should they be connected? Explain
the relationship and decide if you want to create a link.
```

**Why it works:**

- Identifies potential connections AI found
- User evaluates and decides (maintains agency)
- Strengthens knowledge graph
- Makes implicit connections explicit

#### 5. Critical Analysis Prompts

**Example:**

```
You wrote this note 3 months ago. Since then, you've created
12 related notes about learning science. Does anything in this
note need updating? What would you add now that you know more?
```

**Why it works:**

- Encourages growth and refinement
- Shows knowledge evolution
- Identifies misconceptions
- Promotes active maintenance of knowledge

#### 6. Reconstruction Prompts (Hardest Mode)

**Example:**

```
Without looking at the note content, explain the main argument
of this note in your own words. What are the 2-3 key ideas?
How do they connect? Then check: what did you miss?
```

**Why it works:**

- Pure retrieval practice
- No recognition cues
- Reveals actual retention
- Most effortful, most effective

#### 7. Extension/Question-Generation Prompts

**Example:**

```
This note discusses how elaborative encoding works. What
questions does it raise? What would you need to research to
extend this idea? What's the next note you should write?
```

**Why it works:**

- Promotes active curiosity
- Identifies knowledge gaps
- Generates future learning goals
- Turns passive review into active exploration

### Prompt Difficulty Adaptation

AI adjusts prompt difficulty based on review history:

**First Review (Easiest):**

- Simple reconstruction: "Summarize the main points"
- Context provided: Shows linked notes
- Low pressure: Can reveal note if stuck

**Confident Reviews (2-3 times at high confidence):**

- Synthesis across multiple notes
- Application to new contexts
- Critical analysis and extension

**Struggling Reviews (Low confidence ratings):**

- Simplify: Break into smaller pieces
- Provide scaffolding: "You mentioned X in this note. How does it relate to Y?"
- Offer context: Show related notes upfront

### Prompt Generation Algorithm

```typescript
async function generateReviewPrompt(
  note: Note,
  context: ReviewContext
): Promise<ReviewPrompt> {
  // Gather knowledge graph context
  const linkedNotes = await getLinkedNotes(note.id);
  const recentNotes = await getRecentNotes(7); // last week
  const reviewHistory = await getReviewHistory(note.id);
  const userProjects = await extractProjectsFromDailyNotes();
  const relatedNotes = await findSemanticallySimilar(note.id, 5);

  // Determine prompt type based on:
  // - Review count (first time vs. confident)
  // - Previous confidence ratings
  // - Knowledge graph density (how connected)
  // - Recent activity (what user is working on)

  const promptType = selectPromptType({
    reviewCount: reviewHistory.count,
    avgConfidence: reviewHistory.avgConfidence,
    lastConfidence: reviewHistory.lastConfidence,
    hasRichConnections: linkedNotes.length > 3,
    hasRecentRelatedActivity: checkRecentActivity(note, recentNotes),
    hasApplicationContext: userProjects.length > 0
  });

  // Generate context-aware prompt
  const prompt = await generateWithAI({
    type: promptType,
    note: note,
    linkedNotes: linkedNotes,
    relatedNotes: relatedNotes,
    userContext: {
      recentWork: recentNotes,
      activeProjects: userProjects,
      knowledgeGraph: await getLocalGraph(note.id, (depth = 2))
    },
    constraints: {
      requiresSynthesis: true,
      avoidSimpleRecall: true,
      referenceUserContent: true,
      adaptDifficulty: reviewHistory.avgConfidence
    }
  });

  return {
    type: promptType,
    prompt: prompt.text,
    difficulty: prompt.difficulty,
    relatedNotes: prompt.references,
    editable: true, // User can modify prompt
    hints: prompt.hints, // Progressive hints if user is stuck
    expectedResponseType: 'explanation' | 'synthesis' | 'application'
  };
}
```

### User Control Over AI Prompts

**Users can:**

- Edit prompts before answering
- Request different prompt type ("Give me an application prompt instead")
- Save favorite prompts as templates
- Disable AI prompts per note (use manual review instead)
- Rate prompt quality (feedback loop for improvement)

**Progressive hints:**
If user is stuck on a difficult prompt, they can request hints:

1. First hint: "Consider how this connects to [[related-note]]"
2. Second hint: "You wrote about X in this note. How does it relate to Y?"
3. Final hint: Show note content

This maintains cognitive effort while preventing frustration.

## Review Mode Architecture Options

### Option 1: Note-Level Review Metadata

**Concept**: Each note can have review metadata in frontmatter

```yaml
---
type: permanent
title: 'Elaborative Encoding Strengthens Memory'
created: 2024-01-15
review:
  enabled: true
  last_reviewed: 2024-01-20
  next_review: 2024-01-27
  review_count: 2
  interval_days: 7
  ease_factor: 2.5 # SM-2 algorithm compatibility
  confidence: 4 # User-rated 1-5
---
```

**Pros:**

- Granular control per note
- Works with existing metadata system
- Transparent and user-editable
- Git-friendly (plain text)

**Cons:**

- Clutters frontmatter
- Not all notes need review
- Manual scheduling complex

**Best For:**

- Permanent notes (Zettelkasten workflow)
- Concept notes
- Learning materials

### Option 2: Separate Review Queue System

**Concept**: Review data stored separately from note content

**Database Schema:**

```sql
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_reviewed TEXT,
  next_review TEXT,
  review_count INTEGER DEFAULT 0,
  interval_days INTEGER DEFAULT 1,
  ease_factor REAL DEFAULT 2.5,
  confidence INTEGER, -- 1-5 user rating
  status TEXT DEFAULT 'active', -- active, suspended, completed
  FOREIGN KEY (note_id) REFERENCES notes(id)
);

CREATE TABLE review_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes_reviewed INTEGER DEFAULT 0,
  session_type TEXT -- daily, manual, workflow-triggered
);

CREATE TABLE review_history (
  id TEXT PRIMARY KEY,
  review_item_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  previous_interval INTEGER,
  new_interval INTEGER,
  confidence_rating INTEGER,
  time_spent_seconds INTEGER,
  FOREIGN KEY (review_item_id) REFERENCES review_items(id)
);
```

**Pros:**

- Keeps note content clean
- Efficient queries for "what to review today"
- Rich historical data for analytics
- Can track review sessions

**Cons:**

- Additional database complexity
- Review data separated from notes
- Migration concerns

**Best For:**

- Users with many notes to review
- Analytics and insights
- Workflow automation

### Option 3: Hybrid Approach (RECOMMENDED)

**Concept**: Optional frontmatter + database backing

- **Simple mode**: Enable review with `review: true` in frontmatter
- **Advanced mode**: Additional metadata if user wants control
- **Database**: Automatically manages scheduling and history
- **Transparency**: Users can see database state via UI

```yaml
---
type: permanent
review: true # Simple opt-in
---
```

Database automatically creates review_item when `review: true` detected.

**Pros:**

- Simple for basic users
- Powerful for advanced users
- Best of both approaches
- Backward compatible (review metadata is optional)

**Cons:**

- More complex implementation
- Two sources of truth (reconciliation needed)

## Scheduling Algorithms

### SuperMemo SM-2 Algorithm (Classic)

**How it works:**

- After review, user rates quality (1-5)
- Algorithm adjusts ease factor and interval
- Proven algorithm used by Anki and many others

**Intervals:**

```
First review: 1 day
Second review: 6 days
Subsequent: interval * ease_factor
```

**Ease factor adjustment:**

```
EF' = EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
```

**Pros:**

- Well-tested and proven
- Simple to implement
- Lots of research backing

**Cons:**

- Fixed intervals may not suit all note types
- Some notes need irregular review (context-dependent)

### Custom: Context-Aware Review Scheduling

**Concept**: Different note types have different review patterns

**Permanent Notes (Zettelkasten)**

- Standard spaced repetition (SM-2 based)
- Reviews focus on connections and elaboration
- 1 day → 7 days → 30 days → 90 days → 180 days

**Literature Notes**

- Review when creating related permanent notes
- AI suggests: "You read about this in [[literature/book-x]]"
- Less frequent scheduled review

**Project Notes**

- Review tied to project lifecycle, not fixed schedule
- "Review weekly while project is active"
- Suspend review when project archived

**Daily Notes**

- Weekly review (last 7 days)
- Monthly review (synthesize month)
- No long-term spaced repetition

**Fleeting Notes (Zettelkasten)**

- Review within 48 hours or flag as stale
- Should be processed into permanent notes, not reviewed long-term

**Pros:**

- Respects different purposes of notes
- More intelligent than one-size-fits-all
- Aligns with actual usage patterns

**Cons:**

- More complex to implement and explain
- Requires note type awareness
- Users may want custom schedules

### Hybrid Algorithm (RECOMMENDED)

**Base scheduling on note type with user override:**

```typescript
interface ReviewSchedule {
  type: 'spaced-repetition' | 'periodic' | 'context-based' | 'custom';

  // For spaced-repetition
  algorithm?: 'sm2' | 'sm17' | 'fsrs';
  intervals?: number[]; // Custom intervals

  // For periodic
  frequency?: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number; // For weekly
  day_of_month?: number; // For monthly

  // For context-based
  trigger_conditions?: {
    when_note_types_created?: string[]; // Review when related notes created
    when_tags_used?: string[];
    when_linked_notes_reviewed?: boolean;
  };

  // User overrides
  custom_intervals?: number[];
  min_interval?: number;
  max_interval?: number;
}
```

## Review Session User Experience

### Daily Review Workflow

**Entry Points:**

1. **Dedicated Review View** (new main view)
2. **Daily Note Integration** - "3 notes ready for review today"
3. **Inbox Processing** - "Review and process 5 fleeting notes"
4. **Workflow Trigger** - Morning routine includes review

**Review Session UI:**

```
┌─────────────────────────────────────────────────────────┐
│ Daily Review - January 15, 2025                         │
│ ────────────────────────────────────────────────────── │
│ 📚 3 notes ready for review                             │
│ ⏰ Estimated time: ~8 minutes                           │
│                                                         │
│ [Start Review Session] [Configure]                     │
└─────────────────────────────────────────────────────────┘

Review Session (Note 1 of 3):
┌─────────────────────────────────────────────────────────┐
│ permanent/elaborative-encoding                          │
│ Last reviewed: 7 days ago (Jan 8) · Review #3          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🤔 AI-Generated Review Prompt:                         │
│                                                         │
│ "You have notes on both [[elaborative-encoding]] and   │
│  [[schema-formation]]. Explain how elaborative encoding│
│  helps build and strengthen schemas. What's the        │
│  mechanism that connects these two concepts?"          │
│                                                         │
│ Related notes: [[schema-formation]], [[retrieval]]     │
│                                                         │
│ ──────────────────────────────────────────────────────│
│                                                         │
│ [Show Note Content] [Edit Prompt] [Need a Hint?]      │
│                                                         │
│ Your Response:                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Type your explanation here...                   │   │
│ │                                                 │   │
│ │ (This is where you think through the answer    │   │
│ │  before checking the note)                      │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Check My Understanding] [Skip] [⏭️ Next]              │
│                                                         │
└─────────────────────────────────────────────────────────┘

After user writes their response:
┌─────────────────────────────────────────────────────────┐
│ permanent/elaborative-encoding                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Your Response:                                         │
│ "Elaborative encoding creates connections between      │
│  new information and existing knowledge. These         │
│  connections form the structure of schemas..."         │
│                                                         │
│ ──────────────────────────────────────────────────────│
│                                                         │
│ 📄 Note Content:                                       │
│ ┌─────────────────────────────────────────────────┐   │
│ │ # Elaborative Encoding Strengthens Memory       │   │
│ │                                                 │   │
│ │ Elaborative encoding involves connecting new   │   │
│ │ information to existing knowledge through      │   │
│ │ semantic processing...                          │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 💡 AI Analysis:                                        │
│ "Good explanation! You captured the key mechanism.     │
│  Consider also how this relates to [[memory-           │
│  consolidation]] - the connections you create during   │
│  encoding make consolidation more effective."          │
│                                                         │
│ ──────────────────────────────────────────────────────│
│ How well could you answer this prompt?                 │
│                                                         │
│ [1] [2] [3] [4] [5]                                    │
│ Struggled  OK  Confident                               │
│                                                         │
│ [Create Connection to [[memory-consolidation]]]        │
│ [Review Connections] [✏️ Edit Note] [⏭️ Next]          │
└─────────────────────────────────────────────────────────┘
```

### Multi-Note Synthesis Review

**AI identifies themes across notes and creates synthesis prompts:**

```
┌─────────────────────────────────────────────────────────┐
│ 🧩 Synthesis Review: Learning & Memory                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ AI identified a theme across your recent notes:        │
│                                                         │
│ • [[spaced-repetition]] (reviewed 3 days ago)          │
│ • [[retrieval-practice]] (reviewed 7 days ago)         │
│ • [[elaborative-encoding]] (reviewing now)             │
│ • [[memory-consolidation]] (never reviewed)            │
│                                                         │
│ ──────────────────────────────────────────────────────│
│                                                         │
│ 🤔 Synthesis Prompt:                                   │
│                                                         │
│ "These four notes form a coherent framework for        │
│  effective learning. Explain how they work together:   │
│                                                         │
│  1. Which concept is most fundamental?                 │
│  2. How do the other three build on it?                │
│  3. What's the ideal sequence for learning something   │
│     new, given these principles?"                      │
│                                                         │
│ Your Response:                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │                                                 │   │
│ │                                                 │   │
│ │                                                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 💡 Suggestion: Consider creating an index note to      │
│    capture this synthesis: [[index/learning-science]]  │
│                                                         │
│ [Check Understanding] [Create Index Note] [Skip]       │
└─────────────────────────────────────────────────────────┘
```

**Why this is powerful:**

- Forces integration across multiple notes
- Builds higher-order understanding
- Creates opportunities for index notes
- Makes knowledge graph structure explicit

### Review Connection Mode

**When user clicks "Review Connections":**

```
┌─────────────────────────────────────────────────────────┐
│ Connection Review: elaborative-encoding                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Outbound Links (3):                                    │
│ • [[schema-formation]] - How schemas organize memory   │
│ • [[retrieval-practice]] - Active recall techniques    │
│ • [[working-memory]] - Encoding bottleneck             │
│                                                         │
│ Inbound Links (5):                                     │
│ • [[learning-strategies]] - mentions this technique    │
│ • [[note-taking-methods]] - uses elaborative encoding  │
│ ... (3 more)                                           │
│                                                         │
│ 💡 AI Suggestions:                                      │
│ • This note seems related to [[spaced-repetition]]     │
│   which also deals with memory consolidation           │
│ • You wrote about similar ideas in daily/2024-01-12   │
│                                                         │
│ [Create New Connection] [View Graph]                   │
└─────────────────────────────────────────────────────────┘
```

**Philosophy:**

- Review isn't just re-reading
- It's about strengthening connections
- AI suggests but doesn't auto-link
- User makes conscious decisions

### Confidence Rating System

**1-5 Scale with Clear Meanings:**

```
1 - "I don't remember this / need to relearn"
   → Next review: 1 day

2 - "I vaguely remember / struggled to recall"
   → Next review: 3 days

3 - "I understood but took effort to recall"
   → Next review: 7 days (standard)

4 - "I recalled easily and could explain"
   → Next review: 14 days (increased interval)

5 - "Deeply integrated / could teach this"
   → Next review: 30+ days (maximum interval)
```

**Alternative: Binary + Optional Detail**

Simple mode:

- **Again** (didn't recall well)
- **Good** (recalled successfully)
- **Easy** (trivial to recall)

Advanced mode:

- Add notes about what was difficult
- Tag specific concepts that need work
- Set custom next review date

## Integration with Existing Flint Features

### Workflows for Review

**Built-in Review Workflows:**

**Morning Review Workflow:**

```yaml
name: 'morning-review'
description: 'Start your day with note review'
steps:
  - type: 'query'
    action: 'find-notes-due-for-review'
    params:
      limit: 5

  - type: 'present'
    action: 'start-review-session'

  - type: 'ai-assist'
    prompt: 'After reviewing these notes, suggest connections
      or patterns across them'
```

**Weekly Synthesis Workflow:**

```yaml
name: 'weekly-synthesis'
description: 'Review and synthesize the week'
steps:
  - type: 'query'
    action: 'find-notes'
    params:
      created_after: '7 days ago'
      types: ['permanent', 'literature']

  - type: 'review'
    action: 'connection-review'
    prompt: 'For each note, consider:
      - What did I learn this week?
      - How do new ideas connect to existing knowledge?
      - What questions emerged?'

  - type: 'create-note'
    template: 'weekly-synthesis'
    params:
      type: 'index'
      title: 'Week of {{date}}'
```

**Fleeting Note Processing:**

```yaml
name: 'process-fleeting'
description: 'Transform fleeting notes into permanent knowledge'
steps:
  - type: 'query'
    action: 'find-notes'
    params:
      type: 'fleeting'
      created_before: '2 days ago'
      review_status: 'pending'

  - type: 'ai-assist'
    prompt: 'For each fleeting note:
      1. Is this worth keeping?
      2. Can it be combined with existing notes?
      3. Should it become a permanent note?'

  - type: 'user-process'
    actions: ['convert-to-permanent', 'merge-with', 'delete']
```

### Note Types with Review Support

**Add optional review configuration to note types:**

```yaml
# .note-types/permanent.yml
name: permanent
description: Evergreen notes for long-term knowledge
icon: 📝

schema:
  title: string
  created: date
  tags: array

review_defaults:
  enabled: true
  schedule:
    type: spaced-repetition
    algorithm: sm2
    initial_interval: 1
    max_interval: 180

  prompts:
    - 'Can you explain this concept in your own words?'
    - 'What other notes connect to this idea?'
    - 'How has your understanding evolved since writing this?'
    - 'What questions does this raise?'
```

**Note types opt into review with sensible defaults:**

- **permanent**: Full spaced repetition
- **literature**: Context-based (when related notes created)
- **fleeting**: Must be processed within 48 hours
- **daily**: Weekly/monthly periodic review
- **project**: Review while active (suspend when archived)
- **index**: Review when underlying notes reviewed

### AI Assistant Integration

**Review-Related MCP Tools:**

```typescript
// Enable review for a note
{
  name: "enable_note_review",
  description: "Enable spaced repetition review for a note",
  inputSchema: {
    note_id: string,
    schedule_type: "spaced-repetition" | "periodic" | "custom",
    options: ReviewScheduleOptions
  }
}

// Get notes due for review
{
  name: "get_notes_for_review",
  description: "Find notes due for review today",
  inputSchema: {
    limit: number,
    include_overdue: boolean,
    note_types: string[]
  }
}

// Record review completion
{
  name: "complete_review",
  description: "Mark note as reviewed with confidence rating",
  inputSchema: {
    note_id: string,
    confidence: 1 | 2 | 3 | 4 | 5,
    notes: string,  // Optional user notes
    connections_made: string[]  // New links created
  }
}

// Suggest review connections
{
  name: "suggest_review_connections",
  description: "AI suggests related notes during review",
  inputSchema: {
    note_id: string,
    context: "review"  // Optimizes suggestions for review
  }
}

// Generate review prompt (NEW - KEY FEATURE)
{
  name: "generate_review_prompt",
  description: "Generate an AI-powered review prompt for a note",
  inputSchema: {
    note_id: string,
    prompt_type: "synthesis" | "application" | "explanation" |
                 "connection" | "reconstruction" | "extension" | "auto",
    difficulty: "easy" | "medium" | "hard" | "adaptive",
    context: {
      include_recent_notes: boolean,
      include_projects: boolean,
      related_note_count: number
    }
  },
  outputSchema: {
    prompt: string,
    type: string,
    difficulty: string,
    related_notes: string[],
    hints: string[],  // Progressive hints if user gets stuck
    editable: boolean
  }
}

// Regenerate prompt
{
  name: "regenerate_review_prompt",
  description: "Generate a different prompt for the same note",
  inputSchema: {
    note_id: string,
    previous_prompt: string,
    feedback: "too_easy" | "too_hard" | "not_relevant" | "different_type"
  }
}

// Analyze review response
{
  name: "analyze_review_response",
  description: "AI analyzes user's response to review prompt",
  inputSchema: {
    note_id: string,
    prompt: string,
    user_response: string,
    note_content: string
  },
  outputSchema: {
    analysis: string,  // Feedback on understanding
    gaps_identified: string[],  // What was missed
    suggested_connections: string[],  // New notes to link
    confidence_estimate: 1 | 2 | 3 | 4 | 5
  }
}

// Review analytics
{
  name: "get_review_analytics",
  description: "Statistics about review practice",
  inputSchema: {
    time_period: "week" | "month" | "year" | "all",
    metrics: ["retention_rate", "review_streak", "knowledge_growth"]
  }
}
```

**AI Conversation Examples with Generated Prompts:**

```
User: "Which of my notes should I review today?"

AI: [Calls get_notes_for_review]
    "You have 3 permanent notes due for review today:

    1. [[elaborative-encoding]] (last reviewed 7 days ago)
    2. [[schema-formation]] (last reviewed 14 days ago)
    3. [[retrieval-practice]] (last reviewed 3 days ago, marked as 'hard')

    Would you like to start a review session with AI-generated prompts?"

User: "Yes, let's review them. Start with retrieval-practice since
       I marked it as hard last time."

AI: [Calls generate_review_prompt with difficulty="adaptive"]
    "I've generated a prompt for [[retrieval-practice]].

    Since you struggled with this last time, I've created an
    application prompt that connects it to your recent work:

    🤔 Prompt:
    'Looking at your daily notes, you've been learning React this
     week. How could you use retrieval practice to help learn React's
     hooks? Give a concrete example of how you'd apply this technique.'

    Take your time to think through your answer. Type it out when ready,
    or say 'hint' if you'd like a nudge in the right direction."

User: "I could create practice exercises where I try to write hooks
       from memory without looking at docs. Then check my work. Also
       after reading docs, I could close them and try to explain what
       I just learned."

AI: [Calls analyze_review_response]
    "Excellent application! You've captured two key aspects:

    ✓ Writing from memory (pure retrieval)
    ✓ Explaining after reading (elaborative encoding + retrieval)

    I notice you also mentioned [[elaborative-encoding]] in your
    answer. Your notes are actually connected - retrieval practice
    becomes even more effective when combined with elaboration.

    Would you like to create a link between these notes?

    How confident do you feel about retrieval practice now? (1-5)"

User: "Yes, link them. Confidence: 4"

AI: [Calls complete_review with confidence: 4]
    [Creates link between notes]

    "Great! Scheduled next review for 14 days. The link has been
    created. Ready for the next note?"

User: "Yes, but make the prompt harder this time."

AI: [Calls generate_review_prompt with difficulty="hard"]
    "For [[elaborative-encoding]], I'll create a synthesis prompt:

    🤔 Prompt:
    'You have notes on [[elaborative-encoding]], [[schema-formation]],
     and [[memory-consolidation]]. Explain how these three concepts
     work together in a complete learning cycle. What's the mechanism
     connecting them? Use your notes on sleep and consolidation timing
     to support your explanation.'

    This requires synthesizing across three notes. Take your time!"
```

### Custom Functions for Review

**Users can create custom review logic:**

```javascript
// Function: shouldReviewNote
// Determines if a note should be reviewed based on custom criteria

function shouldReviewNote(note, context) {
  const metadata = note.metadata;

  // Custom logic: Review literature notes when I create
  // a new permanent note in the same domain
  if (metadata.type === 'literature') {
    const tags = metadata.tags || [];
    const recentNotes = context.getRecentNotes(7); // last 7 days

    const hasRelatedActivity = recentNotes.some((recent) => {
      const recentTags = recent.metadata.tags || [];
      return recentTags.some((tag) => tags.includes(tag));
    });

    return hasRelatedActivity;
  }

  // Default to scheduled review
  return context.isScheduledForReview(note.id);
}
```

```javascript
// Function: calculateReviewPriority
// Custom prioritization for review queue

function calculateReviewPriority(note, reviewData) {
  let priority = 0;

  // Overdue notes get higher priority
  const daysOverdue = reviewData.daysOverdue || 0;
  priority += daysOverdue * 2;

  // Notes marked as difficult get higher priority
  if (reviewData.lastConfidence <= 2) {
    priority += 10;
  }

  // Notes with many connections are more important
  const linkCount = note.metadata.links?.outbound?.length || 0;
  priority += Math.min(linkCount, 5);

  // Recently edited notes should be reviewed sooner
  const daysSinceEdit = getDaysSince(note.metadata.updated);
  if (daysSinceEdit <= 1) {
    priority += 5;
  }

  return priority;
}
```

## Metadata Schema Design

### Minimal Frontmatter (Simple Mode)

```yaml
---
type: permanent
title: 'My Concept Note'
review: true
---
```

Database automatically manages scheduling.

### Full Frontmatter (Advanced Mode)

```yaml
---
type: permanent
title: 'My Concept Note'

review:
  enabled: true
  schedule: spaced-repetition

  # Optional overrides
  custom_intervals: [1, 3, 7, 14, 30, 90]
  max_interval: 90

  # User can see these (managed by system)
  last_reviewed: 2024-01-20T10:30:00Z
  next_review: 2024-01-27
  review_count: 3
  current_interval: 7
  confidence: 4

  # Optional user notes
  review_notes:
    - '2024-01-20: Connected to [[schema-formation]]'
    - '2024-01-13: Still confused about applications'

  # Custom review prompts
  prompts:
    - 'How does this apply to my current project?'
    - 'What examples demonstrate this concept?'
---
```

### Database Schema (Backend)

**review_items table:**

```sql
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  vault_id TEXT NOT NULL,

  -- Scheduling
  enabled BOOLEAN DEFAULT TRUE,
  schedule_type TEXT DEFAULT 'spaced-repetition',
  algorithm TEXT DEFAULT 'sm2',

  -- Current state
  last_reviewed TEXT,
  next_review TEXT,
  review_count INTEGER DEFAULT 0,
  current_interval INTEGER DEFAULT 1,

  -- SM-2 algorithm state
  ease_factor REAL DEFAULT 2.5,

  -- User feedback
  last_confidence INTEGER,
  average_confidence REAL,

  -- Status
  status TEXT DEFAULT 'active',
  suspended_at TEXT,
  suspended_reason TEXT,

  -- Metadata
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX idx_review_next_review ON review_items(next_review, status);
CREATE INDEX idx_review_vault ON review_items(vault_id, status);
```

**review_history table:**

```sql
CREATE TABLE review_history (
  id TEXT PRIMARY KEY,
  review_item_id TEXT NOT NULL,
  note_id TEXT NOT NULL,

  -- Session info
  reviewed_at TEXT NOT NULL,
  session_id TEXT,

  -- State before review
  previous_interval INTEGER,
  previous_ease_factor REAL,

  -- User feedback
  confidence INTEGER NOT NULL,
  time_spent_seconds INTEGER,
  review_notes TEXT,

  -- State after review
  new_interval INTEGER,
  new_ease_factor REAL,

  -- Actions taken
  note_edited BOOLEAN DEFAULT FALSE,
  connections_created INTEGER DEFAULT 0,
  connections_list TEXT, -- JSON array of new link IDs

  FOREIGN KEY (review_item_id) REFERENCES review_items(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_review_history_item ON review_history(review_item_id, reviewed_at);
CREATE INDEX idx_review_history_session ON review_history(session_id);
```

**review_sessions table:**

```sql
CREATE TABLE review_sessions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,

  -- Session timing
  started_at TEXT NOT NULL,
  ended_at TEXT,
  total_seconds INTEGER,

  -- Session content
  session_type TEXT, -- daily, manual, workflow, bulk
  notes_planned INTEGER,
  notes_completed INTEGER,
  notes_skipped INTEGER,

  -- Outcomes
  average_confidence REAL,
  total_connections INTEGER,
  notes_edited INTEGER,

  -- Context
  triggered_by TEXT, -- workflow_id, user, scheduled

  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX idx_review_sessions_vault ON review_sessions(vault_id, started_at);
```

## Review Views in the UI

### New Main View: Review

**Add "Review" to main navigation alongside:**

- Inbox
- Daily
- All Notes
- AI Assistant

### Review Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ 📚 Review                                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Today - January 15, 2025                               │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🎯 3 notes ready for review                     │   │
│ │ ⏱️ ~8 minutes estimated                         │   │
│ │                                                 │   │
│ │ [Start Review Session]                         │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 📊 This Week                                           │
│ ├─ 12 notes reviewed                                  │
│ ├─ 5 new connections made                             │
│ ├─ 7-day streak 🔥                                    │
│ └─ Avg confidence: 4.2/5                              │
│                                                         │
│ 📅 Upcoming Reviews                                    │
│ ├─ Tomorrow: 2 notes                                  │
│ ├─ This week: 8 notes                                 │
│ └─ Overdue: 1 note                                    │
│                                                         │
│ ⚙️ [Review Settings] [Analytics] [History]            │
└─────────────────────────────────────────────────────────┘
```

### Review Settings Panel

```
┌─────────────────────────────────────────────────────────┐
│ Review Settings                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Daily Review Goal                                      │
│ ┌─────────────────────────────────────────────────┐   │
│ │ [●●●●●○○○○○] 5 notes per day                    │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ Default Algorithm                                      │
│ ○ SuperMemo SM-2 (classic spaced repetition)          │
│ ○ FSRS (modern, data-driven)                          │
│ ○ Custom intervals                                     │
│                                                         │
│ Notification Settings                                  │
│ [✓] Show daily review reminder                        │
│ [✓] Notify when reviews overdue                       │
│ [ ] Celebrate review streaks                           │
│                                                         │
│ Auto-Enable Review                                     │
│ [ ] Automatically enable review for permanent notes    │
│ [✓] Ask when creating permanent notes                 │
│ [ ] Never enable automatically                         │
│                                                         │
│ Advanced                                               │
│ Maximum reviews per day: [20]                         │
│ Maximum interval (days): [180]                        │
│ [✓] Include weekends in scheduling                    │
│ [ ] Suspend reviews for archived notes                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Review Analytics View

```
┌─────────────────────────────────────────────────────────┐
│ Review Analytics                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [Last 7 Days] [Last 30 Days] [Last Year] [All Time]   │
│                                                         │
│ 📈 Knowledge Growth                                     │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Notes under review: 47                          │   │
│ │ Total reviews completed: 156                    │   │
│ │ Average confidence: 4.1/5                       │   │
│ │ Review completion rate: 94%                     │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 📊 Retention Analysis                                  │
│ ┌─────────────────────────────────────────────────┐   │
│ │  Confidence Distribution                        │   │
│ │  5 ████████████████████ 38%                     │   │
│ │  4 ████████████████ 32%                         │   │
│ │  3 ██████████ 20%                               │   │
│ │  2 ████ 8%                                      │   │
│ │  1 ██ 2%                                        │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 🔗 Connection Building                                 │
│ ┌─────────────────────────────────────────────────┐   │
│ │ New connections during review: 23               │   │
│ │ Notes edited during review: 12                  │   │
│ │ Average connections per note: 4.7               │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ⏱️ Time Investment                                     │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Total review time: 2h 34m                       │   │
│ │ Average per note: 3m 12s                        │   │
│ │ Review sessions: 8                              │   │
│ │ Current streak: 7 days 🔥                       │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 📚 Notes Needing Attention                             │
│ ┌─────────────────────────────────────────────────┐   │
│ │ • [[quantum-computing]] - Low confidence (avg 2.1)│ │
│ │ • [[category-theory]] - Low confidence (avg 2.3)  │ │
│ │ • [[machine-learning]] - 3 days overdue           │ │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Progressive Implementation Path

### Phase 1: Foundation (MVP)

**Goal**: Basic review system that works

**Scope:**

1. Database schema for review_items and review_history
2. Simple opt-in: `review: true` in frontmatter
3. SM-2 algorithm implementation
4. Basic "notes due for review" query
5. Simple review UI (single note view)
6. Confidence rating (1-5)
7. Manual review session start

**No AI integration yet** - Just the mechanics

**Success Criteria:**

- Users can mark notes for review
- System schedules reviews with spaced repetition
- Users can complete reviews and rate confidence
- Next review date updates based on rating

**Time Estimate**: 2-3 weeks

### Phase 2: User Experience

**Goal**: Make review actually pleasant to use

**Scope:**

1. Dedicated Review view in main navigation
2. Review dashboard with stats
3. Review session flow (multiple notes)
4. Connection review mode
5. Skip and reschedule options
6. Review history tracking
7. Basic analytics (streak, completion rate)

**Success Criteria:**

- Daily review feels smooth and quick
- Users can see their progress
- Connection review helps strengthen knowledge network

**Time Estimate**: 2-3 weeks

### Phase 3: AI Integration & Generated Prompts

**Goal**: AI generates intelligent review prompts that force deep processing

**Scope:**

1. **AI-generated review prompts** - Core feature
   - Synthesis prompts (connect multiple notes)
   - Application prompts (apply to user's projects)
   - Explanation prompts (teach concepts)
   - Connection discovery prompts
   - Difficulty adaptation based on history
2. MCP tools for review operations
3. AI suggests connections during review
4. AI helps identify notes worth reviewing
5. Conversational review (via AI assistant)
6. AI analysis of user responses
7. Progressive hints when stuck

**Success Criteria:**

- AI generates contextual prompts from user's knowledge graph
- Prompts require synthesis, not just recognition
- User can edit or regenerate prompts
- AI adapts difficulty based on confidence history
- Prompts reference user's projects and recent work

**Time Estimate**: 2-3 weeks (increased due to prompt generation)

### Phase 4: Advanced Features

**Goal**: Power user features and customization

**Scope:**

1. Custom review schedules per note type
2. Multiple algorithm support (FSRS)
3. Custom functions for review logic
4. Workflow integration
5. Review prompts and cue cards
6. Bulk operations (enable review for multiple notes)
7. Export review data

**Success Criteria:**

- Power users can customize review behavior
- Workflows can trigger review sessions
- Review integrates with other Flint features

**Time Estimate**: 2-3 weeks

### Phase 5: Intelligence & Optimization

**Goal**: System learns and adapts

**Scope:**

1. Advanced analytics and insights
2. Note difficulty estimation
3. Optimal scheduling based on user patterns
4. Review recommendations (AI-powered)
5. Knowledge graph analysis during review
6. Retention prediction

**Success Criteria:**

- System adapts to user's learning patterns
- Analytics provide actionable insights
- Review scheduling feels intelligent

**Time Estimate**: 3-4 weeks

## Open Questions and Design Decisions

### Q1: Gamification - Yes or No?

**Arguments For:**

- Streaks motivate consistency
- Progress bars give satisfaction
- Achievements celebrate milestones

**Arguments Against:**

- Can create unhealthy pressure
- Focus shifts from learning to metrics
- Not aligned with "thinking first" philosophy
- Anki-style gamification has mixed reception

**Recommendation:**

- **Minimal gamification**
- Show streak but don't make it prominent
- No achievements or badges
- Focus on "knowledge growth" not "tasks completed"
- Make all metrics easy to hide/ignore

### Q2: Review Notifications - Push or Pull?

**Push (Notifications):**

- Daily reminder: "3 notes ready for review"
- Overdue alerts
- Streak about to break warnings

**Pull (User-Initiated):**

- Review badge/count in UI
- User checks when ready
- No interruptions

**Recommendation:**

- **Opt-in push notifications**
- Default: Badge/count only (pull)
- User can enable daily reminder
- Never push during "focus time" (if detected)

### Q3: Mobile Review Experience

**Consideration**: Review on mobile vs. desktop

**Desktop Review:**

- Better for connection-making
- Easier to edit notes
- More screen space for context

**Mobile Review:**

- Quick review on the go
- Good for simple recall checks
- Limited editing capability

**Recommendation:**

- **Desktop-first for Phase 1-4**
- Mobile as separate consideration
- Simple mobile review mode (view + rate, no editing)
- Full review requires desktop

### Q4: Mandatory vs. Optional Review

**Mandatory:**

- All permanent notes automatically enrolled
- System assumes you want to remember

**Optional:**

- User explicitly enables review per note
- Opt-in philosophy

**Recommendation:**

- **Optional with smart prompts**
- When creating permanent note: "Enable review for this note?"
- Bulk enable: "Enable review for all permanent notes?"
- Easy to enable/disable at any time
- Note type defaults (permanent: suggested, fleeting: not suggested)

### Q5: Review During Editing vs. Separate Review Mode

**During Editing:**

- Review metadata visible in note editor
- "Mark as reviewed" button while editing
- Inline review workflow

**Separate Review Mode:**

- Dedicated review session UI
- Focus mode for reviewing
- Batch processing

**Recommendation:**

- **Both options**
- Separate review mode for focused sessions
- Quick "mark as reviewed" available in editor
- User chooses workflow that fits

### Q6: Algorithm Choice - Simple vs. Advanced

**Simple (SM-2 only):**

- One algorithm, well-tested
- Easy to understand
- Less choice paralysis

**Advanced (Multiple algorithms):**

- SM-2, FSRS, custom
- Power users can optimize
- More complexity

**Recommendation:**

- **Start simple (SM-2), expand later**
- Phase 1-3: SM-2 only
- Phase 4: Add FSRS as option
- Clear explanation of differences
- Most users never change default

### Q7: Integration with External SRS Tools

**Question**: Should Flint integrate with Anki/RemNote/etc?

**Export to Anki:**

- Could export notes as Anki flashcards
- Leverage Anki's mature algorithm
- Good for users already using Anki

**Import from Anki:**

- Import existing spaced repetition data
- Migrate from Anki to Flint review

**Recommendation:**

- **Phase 1-4: No integration**
- **Phase 5: Consider export format**
- Don't try to replace Anki
- Focus on note review, not flashcard review
- Different use cases

### Q8: Review Scope - What Types of Content?

**Just Notes:**

- Only whole notes are reviewed
- Simple and clear

**Granular (Blocks/Sections):**

- Review specific sections
- More like traditional flashcards
- Much more complex

**Recommendation:**

- **Note-level only**
- Aligns with Flint's note-centric design
- If users want flashcards, they should use Anki
- Review focuses on connections and understanding, not memorization

## Alignment with Crystallized Intelligence Principles

### ✅ Multiple Exposures

- Spaced repetition ensures 10+ exposures over time
- Each review is an additional exposure
- Intervals ensure spacing, not cramming

### ✅ Retrieval Practice

- Active recall during review (before revealing note)
- Confidence rating forces metacognition
- Connection review emphasizes retrieval paths

### ✅ Elaborative Encoding

- Review prompts encourage elaboration
- Connection review creates associations
- AI suggestions spark new connections
- User writes their own connections

### ✅ Schema Formation

- Reviewing connections builds schema
- Index notes serve as schema representations
- Knowledge graph analysis reveals structure

### ✅ Spaced Intervals

- SM-2 algorithm implements optimal spacing
- Gradually increasing intervals
- Respects consolidation periods

### ✅ Context and Integration

- Review emphasizes connections, not isolation
- Backlinks provide context
- AI suggests related notes

### ✅ Metacognition

- Confidence ratings develop self-awareness
- Review history shows learning progress
- Analytics reveal strengths/weaknesses

### ✅ Sleep and Consolidation

- Reviews scheduled across days (respects sleep cycles)
- Not all reviews due immediately (allows consolidation)
- Weekly reviews allow longer consolidation

## Anti-Patterns to Avoid

### ❌ Flashcard Thinking

**Problem**: Treating review as memorization drill

**Why it's wrong**: Crystallized intelligence is about integrated knowledge, not isolated facts

**Flint approach**: Review emphasizes connections and understanding, not rote recall

### ❌ Shallow Recognition Prompts (Not Deep Processing)

**Problem**: AI generates simple flashcards that test recognition, not understanding

**Examples of bad prompts:**

- "What is elaborative encoding?" (definition recall)
- Multiple choice questions (recognition-based)
- Fill-in-the-blank from note text (surface details)

**Why it's wrong**:

- Recognition is easier than recall, less effective for learning
- Doesn't force reconstruction or synthesis
- Tests memory of text, not understanding
- Doesn't leverage your knowledge graph

**Flint approach**:

- AI generates prompts that force synthesis across notes
- Prompts require explanation, application, or connection-making
- User generates the response (does the thinking)
- AI provides the challenge, user provides the understanding

### ❌ Mandatory Daily Grind

**Problem**: Review becomes a chore, not a learning tool

**Why it's wrong**: Extrinsic motivation doesn't build understanding

**Flint approach**: Flexible scheduling, user control, intrinsic motivation

### ❌ Metrics Over Meaning

**Problem**: Optimizing for streaks and completion rates

**Why it's wrong**: Gaming metrics doesn't build knowledge

**Flint approach**: Metrics inform, not dictate; easy to hide

### ❌ One-Size-Fits-All

**Problem**: Same review schedule for all notes

**Why it's wrong**: Different note types serve different purposes

**Flint approach**: Context-aware scheduling, customizable per type

### ❌ Review in Isolation

**Problem**: Reviewing notes without context or connections

**Why it's wrong**: Knowledge isn't isolated; understanding comes from integration

**Flint approach**: Connection review, graph analysis, related notes

## Success Metrics

### User Behavior Metrics

**Engagement:**

- % of users who enable review
- Daily active reviewers
- Review session completion rate
- Average reviews per session

**Retention:**

- 7-day review streak rate
- 30-day active reviewer retention
- Review feature abandonment rate

**Quality:**

- Average confidence ratings over time
- Connections created during review
- Notes edited during review
- Time spent per review

### Learning Outcome Metrics (Harder to Measure)

**Knowledge Integration:**

- Growth in note connections over time
- Clustering coefficient of knowledge graph
- Notes with increasing confidence ratings

**Long-term Retention:**

- Notes maintained at high confidence (4-5)
- Successful transitions from low → high confidence
- Stable review intervals (indicating mastery)

**Knowledge Application:**

- References to reviewed notes in new notes
- Index notes linking to reviewed notes
- Daily notes mentioning reviewed concepts

## What Makes Flint Review Different?

### Compared to Anki/Mnemosyne (Traditional SRS)

**Anki's Approach:**

- User creates flashcards manually
- Isolated question/answer pairs
- Tests memorization of specific facts
- Knowledge is fragmented
- No context or connections

**Flint's Approach:**

- AI generates prompts from your knowledge graph
- Prompts connect multiple notes
- Tests understanding and synthesis
- Knowledge is integrated
- Rich context from your entire vault

**Key Difference**: Anki is for memorizing facts. Flint is for developing understanding.

### Compared to RemNote (Outliner + SRS)

**RemNote's Approach:**

- Flashcards created from outline items
- Bi-directional linking
- Some context from hierarchy
- Still flashcard-based (recognize/recall)

**Flint's Approach:**

- Notes are the unit, not cards
- AI generates synthesis prompts across notes
- Context from entire knowledge graph
- Deep processing required (explain, apply, synthesize)

**Key Difference**: RemNote adds SRS to outlining. Flint uses AI to create intelligent review challenges.

### Compared to Obsidian + Spaced Repetition Plugin

**Obsidian Plugin Approach:**

- Flashcards in markdown files
- Manual card creation
- Basic spaced repetition
- Limited AI integration

**Flint's Approach:**

- Whole-note review with AI prompts
- Zero manual card creation
- Prompts leverage your recent work and projects
- Deep AI integration with response analysis

**Key Difference**: Obsidian plugin brings flashcards to Obsidian. Flint reimagines what review means for a PKM system.

### The Core Innovation: Knowledge Graph-Aware AI Prompts

**What no other tool does:**

1. **Context-aware synthesis**: "Your notes X, Y, and Z form a theme. Explain how they connect."

2. **Project application**: "You're working on [project from daily notes]. How does this concept apply?"

3. **Prerequisite-based explanation**: "Explain this to someone who knows [related note] but not this."

4. **Connection discovery**: "This note and [that note] seem related through [mechanism]. Should they link?"

5. **Knowledge evolution**: "You wrote this 3 months ago. With what you know now, what would you add?"

6. **Adaptive difficulty**: Prompts get harder as confidence grows, forcing continued growth

**The result**: Review becomes a tool for developing crystallized intelligence, not just memory maintenance.

## Conclusion and Recommendations

### Recommended Approach

1. **Start with Phase 1 MVP**: Basic review mechanics, no AI
2. **Validate with beta users**: Does review feel useful?
3. **Iterate on UX (Phase 2)**: Make it pleasant before adding features
4. **Integrate AI (Phase 3)**: Once mechanics are solid
5. **Advanced features (Phase 4-5)**: Based on user feedback

### Core Principles to Maintain

1. **User Agency**: Review is opt-in and controllable, prompts are editable
2. **Deep Processing Over Recognition**: AI generates prompts that require synthesis, not just recall
3. **Knowledge Graph Integration**: Prompts leverage connections across user's entire vault
4. **Context-Aware**: Prompts reference user's projects, recent work, and knowledge state
5. **Connection Focus**: Review builds knowledge graph, not just memory
6. **Flexible, Not Rigid**: Adapt to user patterns, don't enforce one way
7. **Transparent**: Scheduling and algorithms understandable, prompts explainable

### Alignment with Flint Philosophy

✅ **Humans think, AI assists**: AI generates the challenge (prompt), user does the thinking (response)
✅ **Local-first**: Review data stays local, no cloud dependency
✅ **Frictionless capture, gradual organization**: Review fits this flow naturally
✅ **Opinionated but flexible**: Smart defaults (AI prompts), but fully customizable
✅ **Thinking-first design**: Prompts force deep processing, not passive recognition
✅ **AI augments cognition**: Leverages your knowledge graph in ways manual review can't

### Next Steps

1. **Gather feedback on this brainstorm**
2. **Prototype Phase 1 database schema**
3. **Design review session UI mockups**
4. **Implement SM-2 algorithm**
5. **Build MVP and test with small group**

---

**Document Status**: Draft for discussion (REVISED - AI-generated prompts emphasized)
**Last Updated**: 2025-01-15 (Revision 2)
**Next Review**: After initial feedback round

**Revision History**:

- v1 (2025-01-15): Initial brainstorm with basic review concepts
- v2 (2025-01-15): Major revision emphasizing AI-generated prompts that force deep processing rather than recognition. Added detailed prompt types, examples, and comparisons to existing tools.
