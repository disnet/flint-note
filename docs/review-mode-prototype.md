# Review Mode: Minimal Prototype Specification

## Purpose

This document specifies a **minimal viable prototype** for Flint's AI-powered review mode. The goal is to validate the core concept with the simplest possible implementation that demonstrates the key innovation: **Agent-driven conversational review that forces deep processing**.

## Prototype Goals

### What We're Testing

1. **Does agent-driven review feel valuable?** - Can the AI agent create effective review experiences by choosing strategies autonomously?
2. **Does deep processing work better than passive re-reading?** - Does this approach actually help understanding?
3. **Is the conversational UX intuitive?** - Can users interact naturally with the agent during review?
4. **Do users want this feature?** - Will they enable review and use it regularly?
5. **Does full context enable better prompts?** - With complete note content, can the agent generate more meaningful synthesis questions?

### What We're NOT Testing (Yet)

- Complex scheduling algorithms (simple fixed intervals)
- Analytics and metrics (just basic tracking)
- Workflow integration (manual only)
- Custom functions (use defaults)
- Multi-note batch sessions with auto-advance

## Core Design Decisions

### Decision 1: Metadata Approach ✅ DECIDED

**Choice: Simple frontmatter toggle**

```yaml
---
type: permanent
title: 'My Note'
review: true # Simple boolean to opt-in
---
```

**Rationale:**

- Minimal complexity
- Git-friendly
- User-visible and editable
- Easy to implement
- Can migrate to database later if needed

**Database backing:**

- When `review: true` is set, create entry in `review_items` table
- Tracks: last_reviewed, next_review, review_count, confidence history
- Frontmatter is source of truth for "enabled", database manages scheduling

### Decision 2: Agent-Driven Review Strategy ✅ DECIDED

**Choice: AI agent autonomously chooses review approach**

Instead of predetermined prompt types, the agent receives:

- **Full content** of all notes ready for review
- **Guidelines** on effective review strategies
- **Full tool access** to fetch additional context as needed

**The agent decides:**

- Which review strategy to use (synthesis, application, explanation, reconstruction, etc.)
- Whether to review notes individually or find thematic connections
- What additional context to fetch (daily notes, related notes, backlinks)
- How to adapt based on review history

**Example strategies the agent might choose:**

**Synthesis (connect multiple notes):**

```
Your notes [[elaborative-encoding]] and [[schema-formation]]
both discuss memory. Explain how elaborative encoding helps
build schemas. What's the mechanism connecting them?
```

**Application (connect to user's work):**

```
Looking at your daily notes, you've been learning React. How could
you apply retrieval practice to learning React hooks? Give a concrete
example.
```

**Reconstruction (memory test):**

```
Without looking at the note, explain the main argument in your own
words. Then we'll compare.
```

**Thematic review (multiple notes with shared theme):**

```
I noticed these three notes due today all relate to learning theory.
Rather than review them separately, let's synthesize: how do they
work together as a system?
```

**Rationale:**

- **More flexible** - Agent adapts to note characteristics and user context
- **More intelligent** - Can discover connections and patterns
- **More natural** - Conversational flow rather than rigid templates
- **Simpler implementation** - No need to pre-categorize prompt types
- **Better use of AI** - Leverages agent's reasoning capabilities
- **Full context available** - With complete notes, agent can make better decisions

### Decision 3: Review Trigger - How to Start Review? ✅ DECIDED

**Choice: New "Review" Main View (Option B)**

```
Main Navigation:
- Inbox
- Daily
- Review  ← NEW
- All Notes
- AI Assistant
```

**Rationale:**

- Most aligned with long-term vision
- Clear, dedicated entry point for feature
- Supports session-based review
- More intentional than ad-hoc button clicks

### Decision 4: Review UI - Where Does Review Happen? ✅ DECIDED

**Choice: Conversational Review Interface (AI Assistant View)**

Review happens through natural conversation with the AI agent, similar to the AI Assistant view but in review context.

```
┌─────────────────────────────────────────────────┐
│ Review Session                            [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│ AI: I see you have 3 notes ready for review:    │
│     • [[elaborative-encoding]]                  │
│     • [[schema-formation]]                      │
│     • [[retrieval-practice]]                    │
│                                                 │
│     These all relate to learning - let me       │
│     create a synthesis review for you.          │
│                                                 │
│ ───────────────────────────────────────────────│
│                                                 │
│ AI: Your notes [[elaborative-encoding]] and     │
│     [[schema-formation]] both discuss memory    │
│     organization. Explain how elaborative       │
│     encoding helps build schemas.               │
│                                                 │
│ ───────────────────────────────────────────────│
│                                                 │
│ You: [Type your explanation here...]            │
│                                                 │
│ ┌───────────────────────────────────────────┐ │
│ │                                           │ │
│ └───────────────────────────────────────────┘ │
│                                                 │
│ [Show Note Content] [Send]                      │
└─────────────────────────────────────────────────┘
```

After user responds:

```
┌─────────────────────────────────────────────────┐
│ You: Elaborative encoding creates connections   │
│      between new info and existing knowledge... │
│                                                 │
│ ───────────────────────────────────────────────│
│                                                 │
│ AI: Excellent! You captured the core mechanism. │
│     Elaborative encoding creates the links, and │
│     those links become schema structure.        │
│                                                 │
│     I also notice you have [[memory-            │
│     consolidation]] which relates closely.      │
│     Should we add a link?                       │
│                                                 │
│     Did you understand this concept well?       │
│     [Pass] [Fail]                               │
└─────────────────────────────────────────────────┘
```

**Rationale:**

- **Natural conversation** - More engaging than rigid forms
- **Agent-driven flow** - AI guides the review experience
- **Flexible interaction** - User can ask questions, request hints
- **Reuses existing UI** - Similar to AI Assistant view
- **Simpler implementation** - No complex multi-step modal state
- **More powerful** - Agent can fetch additional notes, adapt strategy mid-review

### Decision 5: Context and Agent Initialization ✅ DECIDED

**Choice: Provide full context upfront, agent generates strategy dynamically**

When user starts review session:

```
User clicks "Start Review"
  → Fetch all notes due for review (with FULL content)
  → Fetch recent daily notes (for project context)
  → Initialize agent with:
     • All due notes (complete content, metadata, stats)
     • Review guidelines (synthesis, application, etc.)
     • Available tools (get_note, get_linked_notes, search_daily_notes)
  → Agent analyzes and proposes review approach
  → Conversational review begins
```

**Initial Context Structure:**

```typescript
{
  notesForReview: [
    {
      id: "note-123",
      title: "Elaborative Encoding",
      content: "...", // FULL CONTENT - no truncation
      metadata: {
        tags: ["learning", "memory"],
        created: "2024-01-10",
        lastReviewed: "2024-01-08",
        reviewCount: 2,
        lastConfidence: "pass"
      },
      stats: {
        outboundLinks: 5,
        backlinks: 12,
        relatedByTags: 8
      }
    }
    // ... more notes
  ],
  recentContext: {
    dailyNotes: [...], // Last 7 days for project awareness
  },
  reviewGuidelines: "..." // Strategies the agent can use
}
```

**Rationale:**

- **Full context** - Agent sees complete notes, makes better decisions
- **On-demand tool calls** - Agent fetches additional context only if needed
- **Adaptive** - Agent can change strategy mid-review if needed
- **Simpler than pre-generation** - No need to anticipate what agent needs
- **Cost-effective** - Only pay for context actually used
- **Fresh every time** - Always uses current state of knowledge graph

### Decision 6: Response Capture - How Does User Answer? ✅ DECIDED

**Choice: Required Text Response**

```
🤔 Synthesis Prompt: [AI-generated question]

Your Response:
┌─────────────────────────────────────────┐
│ [User must type their explanation]      │
│                                         │
│                                         │
└─────────────────────────────────────────┘

[Submit Response]
```

**Rationale:**

- **Forces articulation** → Stronger learning through generation
- **Enables AI analysis** → AI can provide feedback on understanding
- **Creates engagement** → User must actually think, not just click through
- **Records thinking** → Can track understanding evolution over time

**UX Considerations:**

- Large text area for comfort
- Can click [Show Note Content] if stuck
- No "wrong answer" - AI provides constructive feedback
- User can edit response before submitting

### Decision 7: Confidence Rating - How to Measure? ✅ DECIDED

**Choice: Pass/Fail (Binary Rating)**

```
After AI provides feedback on response:

Did you understand this concept well enough?

[Pass] [Fail]
```

**Rationale:**

- **Simpler decision** → Less cognitive overhead than 1-5 scale
- **Clear outcome** → Either you got it or you didn't
- **Easier scheduling** → Two intervals instead of five
- **Reduces analysis paralysis** → No "is this a 3 or a 4?"
- **User decides** → Self-assessment after seeing AI feedback

**Intervals:**

- **Pass** → Next review in 7 days (standard interval)
- **Fail** → Next review in 1 day (quick retry)

**Note:** Can upgrade to SM-2 adaptive algorithm in Phase 1

### Decision 8: Scheduling Algorithm ✅ DECIDED

**Choice: Simple binary intervals for MVP**

**MVP Schedule:**

```
First review: 1 day after enabling review
If Pass: 7 days until next review
If Fail: 1 day until retry
```

**Rationale:**

- Minimal complexity (two intervals only)
- Pass/fail aligns with binary rating
- Still demonstrates spaced repetition value
- Can upgrade to SM-2 in Phase 1 without UI changes

**Future (Phase 1):**

- Add SM-2 adaptive algorithm
- Multiple intervals based on review history
- Confidence tracking over time

### Decision 9: Scope - Single Note or Session? ✅ DECIDED

**Choice: Single-note review for MVP, session mode in Phase 2**

**MVP Flow:**

```
Review View shows: "3 notes due for review"
Click note → Review modal opens for that note
Complete → Modal closes, back to list
Click next note → Repeat
```

**NOT in MVP:**

- Auto-advance to next note
- Session tracking
- "Complete session" button

**Rationale:**

- Simpler state management
- User controls pace
- Can add session flow later

**Phase 2 addition:**

```
[Start Review Session] button
  → Auto-advances through all notes
  → Shows progress: "Note 2 of 3"
  → Session summary at end
```

### Decision 10: AI Analysis of Response? ✅ DECIDED

**Choice: AI Analyzes Written Response (Required for MVP)**

```
After user submits typed response:

💡 AI Feedback:
"Good explanation! You captured the key mechanism
of how elaborative encoding creates connections.

Consider also: This relates to [[memory-consolidation]]
- the connections you create during encoding make
consolidation more effective. Would you like to create
a link?"

[Pass] [Fail]
```

**Rationale:**

- **Required** since we're collecting typed responses
- **Provides value** - AI feedback helps user learn
- **Suggests connections** - Builds knowledge graph
- **Justifies typing effort** - User gets immediate benefit
- **Enables improvement** - AI can identify gaps

**Analysis includes:**

- What user got right
- What could be added or refined
- Suggested connections to other notes
- Optional: Offer to create links automatically

## Prototype Specification

### Minimum Viable Feature Set

#### 1. Enable Review Toggle

**Location:** Note editor toolbar

```
┌──────────────────────────────────────────────┐
│ [Save] [Metadata] [★ Enable Review]         │
└──────────────────────────────────────────────┘
```

**Behavior:**

- Clicking toggles `review: true/false` in frontmatter
- Creates/deletes entry in `review_items` table
- Sets `next_review` to tomorrow if newly enabled
- Shows toast: "Review enabled. First review in 1 day"

**Visual state:**

- Enabled: "★ Review Enabled" (filled star, highlighted)
- Disabled: "☆ Enable Review" (empty star, normal)

#### 2. Review View

**Location:** New main navigation item

**Shows:**

```
┌─────────────────────────────────────────────┐
│ 📚 Review                                   │
├─────────────────────────────────────────────┤
│                                             │
│ Due Today (3)                               │
│                                             │
│ • permanent/elaborative-encoding            │
│   Last reviewed: 7 days ago                 │
│   [Review Now]                              │
│                                             │
│ • permanent/schema-formation                │
│   Last reviewed: 14 days ago                │
│   [Review Now]                              │
│                                             │
│ • permanent/retrieval-practice              │
│   Last reviewed: 3 days ago                 │
│   [Review Now]                              │
│                                             │
├─────────────────────────────────────────────┤
│ Upcoming (2)                                │
│ • Tomorrow: 1 note                          │
│ • Next 7 days: 1 note                       │
└─────────────────────────────────────────────┘
```

**Empty state:**

```
No notes enabled for review yet.

Enable review for permanent notes to build
understanding through spaced repetition.

[Learn More]
```

#### 3. Review Session Interface

**Triggered by:** Clicking "Start Review" from Review view

**Conversational Flow:**

The review session opens in a chat-like interface where the agent guides the user through reviewing notes.

**Step 1: Session Initialization**

```
┌─────────────────────────────────────────────┐
│ Review Session                        [X]   │
├─────────────────────────────────────────────┤
│                                             │
│ AI: Starting review session...              │
│     Loading your notes...                   │
│                                             │
│ [Loading spinner]                           │
└─────────────────────────────────────────────┘
```

**Step 2: Agent Analyzes and Proposes Strategy**

```
┌─────────────────────────────────────────────┐
│ Review Session                        [X]   │
├─────────────────────────────────────────────┤
│                                             │
│ AI: I see you have 3 notes ready for        │
│     review today:                           │
│                                             │
│     • [[elaborative-encoding]]              │
│       Last reviewed: 7 days ago             │
│                                             │
│     • [[schema-formation]]                  │
│       Last reviewed: 14 days ago            │
│                                             │
│     • [[retrieval-practice]]                │
│       Last reviewed: 3 days ago             │
│                                             │
│     These all relate to learning theory.    │
│     I'd like to do a synthesis review       │
│     connecting all three. Sound good?       │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ You: [Type response or "yes"]               │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 3: Agent Poses Review Challenge**

```
┌─────────────────────────────────────────────┐
│ AI: Perfect. Here's your challenge:         │
│                                             │
│     Your notes [[elaborative-encoding]],    │
│     [[schema-formation]], and [[retrieval-  │
│     practice]] form a learning system.      │
│                                             │
│     Explain how these three concepts work   │
│     together:                               │
│     1. What's the sequence?                 │
│     2. How do they reinforce each other?    │
│     3. How would you apply all three to     │
│        learning React? (I noticed you're    │
│        working on that from your daily      │
│        notes)                               │
│                                             │
│     Take your time - this is a synthesis    │
│     question.                               │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ You: [Large text area for typed response]   │
│                                             │
│ [Show Note Contents] [Send]                 │
└─────────────────────────────────────────────┘
```

**Step 4: Agent Analyzes Response**

```
┌─────────────────────────────────────────────┐
│ You: [User's typed explanation...]          │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ AI: Excellent synthesis! You captured the   │
│     key relationships between encoding,     │
│     schema formation, and retrieval.        │
│                                             │
│     I particularly liked your React         │
│     example - building schemas through      │
│     practice, then testing retrieval.       │
│                                             │
│     One connection you might add: This      │
│     relates to [[memory-consolidation]]     │
│     which explains why spacing these        │
│     practices over days works better.       │
│                                             │
│     Would you like me to add a link to      │
│     [[memory-consolidation]]?               │
│     [Yes] [No]                              │
│                                             │
│     Did you understand these concepts well? │
│     [Pass] [Fail]                           │
└─────────────────────────────────────────────┘
```

**Step 5: Completion and Next Steps**

```
┌─────────────────────────────────────────────┐
│ AI: ✓ Review complete!                      │
│                                             │
│     I've updated your review schedule:      │
│     • [[elaborative-encoding]] → Jan 22     │
│     • [[schema-formation]] → Jan 22         │
│     • [[retrieval-practice]] → Jan 22       │
│                                             │
│     Great synthesis today. Next review      │
│     in 7 days.                              │
│                                             │
│     [Close] [Start Another Review]          │
└─────────────────────────────────────────────┘
```

**Flexible Interaction:**

User can also:

- Ask for hints: "Can you give me a hint?"
- Request different approach: "Too hard, can we review these separately?"
- Show note content anytime: "Show me the elaborative encoding note"
- Skip a note: "Let's skip this one for now"

Agent adapts accordingly.

#### 4. Database Schema (Minimal)

```sql
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  vault_id TEXT NOT NULL,

  -- Scheduling (simple pass/fail intervals for MVP)
  enabled BOOLEAN DEFAULT TRUE,
  last_reviewed TEXT,
  next_review TEXT NOT NULL,
  review_count INTEGER DEFAULT 0,

  -- Review history (JSON array)
  review_history TEXT, -- JSON: [{"date": "...", "passed": true, "response": "..."}]

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_review_next_review ON review_items(next_review, enabled);
```

**Simplified schema:**

- Pass/fail tracked in `review_history` JSON
- User responses stored for future reference
- No complex review_sessions table in MVP

#### 5. Agent Tools for Review

**MCP Tools available to the review agent:**

```typescript
// Core context access
{
  name: "get_note",
  description: "Fetch complete note by ID",
  inputSchema: {
    note_id: string
  },
  outputSchema: {
    id: string,
    title: string,
    content: string,  // Full content
    metadata: object,
    stats: object
  }
}

{
  name: "get_linked_notes",
  description: "Get notes that this note links to",
  inputSchema: {
    note_id: string,
    include_content: boolean  // default: false (just titles)
  },
  outputSchema: {
    outbound: Array<Note>,
    inbound: Array<Note>
  }
}

{
  name: "search_notes_by_tags",
  description: "Find notes with shared tags",
  inputSchema: {
    tags: string[],
    limit: number
  },
  outputSchema: {
    notes: Array<Note>
  }
}

{
  name: "search_daily_notes",
  description: "Search recent daily notes for context (e.g., current projects)",
  inputSchema: {
    days_back: number,  // default: 7
    query?: string      // optional search term
  },
  outputSchema: {
    dailyNotes: Array<{
      date: string,
      content: string,
      projects_mentioned: string[]
    }>
  }
}

{
  name: "complete_review",
  description: "Mark note as reviewed with pass/fail",
  inputSchema: {
    note_id: string,
    passed: boolean,
    user_response: string,
    connections_created?: string[]  // optional new links
  },
  outputSchema: {
    next_review_date: string,
    review_count: number
  }
}

{
  name: "create_note_link",
  description: "Add a link between two notes",
  inputSchema: {
    from_note_id: string,
    to_note_id: string,
    context?: string  // optional context for why link was created
  }
}
```

**Agent System Prompt (Review Guidelines):**

```
You are helping a user review their notes to build deep understanding
through spaced repetition. Your role is to create review experiences
that force deep cognitive processing, not shallow recognition.

Available review strategies:

1. SYNTHESIS - Connect 2-3 related notes, ask user to explain relationships
2. APPLICATION - Connect concepts to user's current projects/work
3. RECONSTRUCTION - Ask user to explain from memory before revealing content
4. EXPLANATION - Ask user to teach the concept to an imagined audience
5. CRITICAL ANALYSIS - Ask what user would add/change with current knowledge
6. CONNECTION DISCOVERY - Suggest implicit links for user to evaluate

Choose the strategy based on:
- Note characteristics (well-connected vs isolated)
- Review history (first time vs. confident)
- User's current work (check daily notes for active projects)
- Relationships between notes due today

Guidelines:
- Use FULL note content to generate specific, contextual questions
- Reference specific notes with [[wikilink]] syntax
- Ask "how" and "why", not "what"
- Adapt difficulty based on review history
- Suggest connections to strengthen knowledge graph
- Be encouraging and constructive in feedback

You have tools to fetch additional notes, search daily notes, and
create links. Use them to create the best review experience.
```

**Example Agent Flow:**

```typescript
// Agent receives initial context with all due notes
const context = {
  notesForReview: [
    { id: "1", title: "Elaborative Encoding", content: "...", /* full */ },
    { id: "2", title: "Schema Formation", content: "...", /* full */ },
    { id: "3", title: "Retrieval Practice", content: "...", /* full */ }
  ],
  recentDailyNotes: [...],
  reviewGuidelines: "..."
};

// Agent analyzes and chooses strategy
// Might call search_daily_notes() to check user's current projects
// Might call get_linked_notes() to see connections
// Then creates conversational review experience
```

#### 6. Pass/Fail Scheduler

```typescript
function getNextReviewDate(passed: boolean): Date {
  const now = new Date();

  // Simple binary intervals (MVP)
  if (passed) {
    return addDays(now, 7); // Pass: review in 7 days
  } else {
    return addDays(now, 1); // Fail: retry tomorrow
  }
}

function completeReview(noteId: string, passed: boolean, userResponse: string) {
  const item = getReviewItem(noteId);

  // Update review record
  item.review_count++;
  item.last_reviewed = now();
  item.next_review = getNextReviewDate(passed);

  // Append to review history
  const history = JSON.parse(item.review_history || '[]');
  history.push({
    date: now(),
    passed: passed,
    response: userResponse // Store for future reference
  });
  item.review_history = JSON.stringify(history);

  save(item);
}
```

**Note:** Phase 1 will add SM-2 algorithm with adaptive intervals based on review history.

### What's Explicitly NOT in MVP

1. **SM-2 adaptive scheduling** - Fixed pass/fail intervals (1 day / 7 days) for simplicity
2. **Analytics dashboard** - No charts, statistics, or retention metrics
3. **Workflow integration** - No automated triggers or workflow-based review
4. **Custom prompt templates** - Agent generates all prompts, no user-defined templates
5. **Multi-session tracking** - No session analytics or streak tracking
6. **Batch auto-advance** - User manually starts each review, no auto-advance through queue
7. **Review reminders** - No notifications or daily review reminders
8. **Export/import** - No data export or integration with other SRS tools
9. **Mobile optimization** - Desktop-first, mobile is future work
10. **Embedding-based similarity** - Uses links and tags only, no semantic search yet

## Implementation Checklist

### Backend (Server)

- [ ] Database migration: Create `review_items` table
- [ ] API: `enableReview(noteId)` → Sets `review: true` in frontmatter
- [ ] API: `disableReview(noteId)` → Sets `review: false` in frontmatter
- [ ] API: `getNotesForReview()` → Returns notes where `next_review <= today` with FULL content
- [ ] API: `completeReview(noteId, passed, userResponse)` → Updates schedule
- [ ] API: `getRecentDailyNotes(daysBack)` → Returns recent daily notes for context
- [ ] API: `createNoteLink(fromId, toId)` → Adds link between notes

### Frontend (Renderer)

- [ ] Note editor: Add "Enable Review" toggle button
  - Visual states (enabled/disabled)
  - Call API to enable/disable
  - Show toast notification
- [ ] Navigation: Add "Review" main view
  - Route: `/review`
  - Icon in sidebar
- [ ] Review view component
  - List notes due for review
  - Show "upcoming" section
  - Empty state message
  - "Start Review" button
- [ ] Review session interface
  - Conversational UI (chat-like)
  - Message history
  - Text input for user responses
  - Pass/Fail buttons (inline with agent messages)
  - "Show Note Content" action button
- [ ] Store: Review session state management
  - Track conversation history
  - Store agent context (notes being reviewed)
  - Handle pass/fail submission
  - Track which notes completed in session

### AI Integration

- [ ] Review agent system prompt
  - Guidelines for review strategies (synthesis, application, etc.)
  - Instructions for adapting to note characteristics
  - Emphasis on deep processing over recognition
- [ ] MCP tools: `get_note`, `get_linked_notes`, `search_notes_by_tags`
  - Allow agent to fetch additional context as needed
- [ ] MCP tool: `search_daily_notes`
  - Extract user's current projects/work
  - Provide context for application prompts
- [ ] MCP tool: `complete_review`
  - Mark note as reviewed
  - Update next review date
  - Store user response in history
- [ ] MCP tool: `create_note_link`
  - Allow agent to suggest and create links
  - Build knowledge graph during review
- [ ] Agent initialization
  - Load all due notes with full content
  - Include recent daily notes for context
  - Start conversational review flow
- [ ] Error handling
  - Graceful degradation if agent fails
  - Timeout handling
  - Fallback to simple "explain this note" if agent can't generate strategy

### Polish

- [ ] Loading states
  - Spinner when initializing review session
  - Typing indicator while agent is thinking
  - Loading state when fetching notes
- [ ] Error messages
  - AI timeout (with retry option)
  - No notes due today (friendly message)
  - Agent initialization failed (fallback to simple review)
- [ ] Toast notifications
  - Review enabled
  - Review completed with next date
  - Link created between notes
- [ ] Keyboard shortcuts
  - `Cmd/Ctrl+Enter` to send message
  - `Escape` to close review session
- [ ] Conversational UI polish
  - Markdown rendering in agent messages
  - [[wikilink]] highlighting and clicking
  - Smooth scroll to new messages
  - Auto-focus on text input
- [ ] Empty states
  - No notes due for review
  - No notes enabled for review yet
- [ ] Responsive design (desktop-first for MVP)

## Success Metrics for Prototype

### Usage Metrics

- % of users who enable review for at least 1 note
- % of due reviews that get completed (completion rate)
- Average time spent per review session
- Pass rate (% reviews marked as passed)
- Average response length (words)
- Notes reviewed per session (are users reviewing multiple?)
- Link creation rate (connections made during review)

### Qualitative Feedback

- Do users find agent-driven review valuable vs. rigid prompts?
- Is the conversational interface intuitive?
- Is the typing requirement acceptable or too much friction?
- Are agent's review strategies appropriate (synthesis, application, etc.)?
- Does full note context lead to better prompts?
- Would users use this regularly?
- Do pass/fail feel sufficient or do users want more granularity?
- Is agent feedback helpful and encouraging?

### Technical Validation

- Does agent successfully generate review strategies (>95% success rate)?
- Are agent's chosen strategies appropriate for the notes?
- Does agent effectively use tools (fetch related notes, search daily notes)?
- Is agent feedback constructive and accurate?
- Are pass/fail intervals reasonable (7 days / 1 day)?
- Database schema sufficient for tracking?
- Performance acceptable with full note content?
- Cost per review session within budget (target: <$0.10/session)?

## Migration Path to Full Feature

### Phase 1: Enhanced Agent Capabilities

- Add SM-2 adaptive scheduling (replace fixed intervals)
- Embedding-based note similarity (beyond links and tags)
- More sophisticated daily note parsing (project extraction)
- Review history analysis (agent adapts based on past performance)
- Multi-turn conversations (user can ask followup questions)

### Phase 2: Enhanced UX

- Auto-advance through multiple notes in session
- Review dashboard with basic stats
- Review history browser
- Progressive hints system
- Mobile-optimized review interface

### Phase 3: Advanced Features

- Custom review strategies (user-defined prompt templates)
- Workflow integration (scheduled review sessions)
- Review analytics and insights
- Bulk operations (enable review for many notes)
- Export review data

### Phase 4: Intelligence & Optimization

- Agent learns from review patterns
- Personalized difficulty adaptation
- Optimal review timing predictions
- Knowledge graph analysis during review
- Retention prediction and recommendations

## Cost and Context Estimates

### Context Budget per Review Session

**Initial context (passed to agent):**

- Notes for review: 3 notes × ~2,000 tokens each = 6,000 tokens
- Recent daily notes: 7 days × ~300 tokens = 2,100 tokens
- Review guidelines: ~1,000 tokens
- Metadata and stats: ~500 tokens
- **Total input: ~9,600 tokens**

**Agent output:**

- Review conversation: ~1,000-1,500 tokens
- Analysis and feedback: ~500 tokens
- **Total output: ~1,500 tokens**

**Tool calls (if agent uses them):**

- `get_linked_notes`: ~500 tokens (titles + summaries)
- `search_daily_notes`: ~1,000 tokens (if searching)
- Additional notes fetched: ~2,000 tokens each

**Total per session estimate: 10,000-15,000 tokens**

### Cost Estimates

**With Sonnet ($3/MTok input, $15/MTok output):**

- Input: 12,000 tokens × $3/MTok = $0.036
- Output: 1,500 tokens × $15/MTok = $0.0225
- Tool calls: ~3,000 tokens × $3/MTok = $0.009
- **Total per session: ~$0.07**
- **Per note: ~$0.02-0.03**

**With Haiku ($0.25/MTok input, $1.25/MTok output):**

- Input: 12,000 tokens × $0.25/MTok = $0.003
- Output: 1,500 tokens × $1.25/MTok = $0.0019
- Tool calls: ~3,000 tokens × $0.25/MTok = $0.0008
- **Total per session: ~$0.006**
- **Per note: ~$0.002**

**Recommendation:** Start with Sonnet for better agent reasoning, evaluate if Haiku is sufficient.

**Monthly cost (100 review sessions):**

- Sonnet: ~$7/month
- Haiku: ~$0.60/month

Very affordable compared to value provided!

## Open Questions for User Feedback

1. **Should "Enable Review" be automatic for permanent notes?**
   - Currently: Manual opt-in
   - Alternative: Auto-enable with ability to disable

2. **Is agent autonomy acceptable or do users want control?**
   - Currently: Agent chooses review strategy
   - Alternative: User picks from menu (synthesis, application, etc.)

3. **Is conversational UI better than structured forms?**
   - Currently: Chat-like interface
   - Alternative: Rigid prompt → response → feedback flow

4. **Should agent suggest thematic reviews (multiple notes at once)?**
   - Currently: Agent can choose to review notes together or separately
   - Alternative: Always review notes individually

5. **Is typing required or should it be optional?**
   - Currently: Required text response
   - Alternative: Optional typing, or mental-only with pass/fail

## Risk Mitigation

### Risk: Agent-generated strategies are poor quality

- **Mitigation:** Test agent with real user notes before launch
- **Mitigation:** Include diverse strategy examples in system prompt
- **Fallback:** Simple template-based prompts if agent fails
- **Escape hatch:** Users can disable review per note

### Risk: Users don't understand the value

- **Mitigation:** Clear onboarding explanation with example
- **Mitigation:** "Learn More" link demonstrating agent capabilities
- **Escape hatch:** Feature is opt-in, non-intrusive

### Risk: Conversational interface confusing

- **Mitigation:** Keep agent instructions clear and explicit
- **Mitigation:** Use familiar chat UI patterns
- **Testing:** Extensive user testing with MVP
- **Fallback:** Can revert to rigid flow if needed

### Risk: AI costs too high with full note content

- **Mitigation:** Cost estimates show ~$0.07/session (affordable)
- **Mitigation:** Can switch to Haiku (~$0.006/session) if needed
- **Monitoring:** Track actual costs in production
- **Cap:** Set per-user monthly limits if necessary

### Risk: Not enough related notes for synthesis

- **Mitigation:** Agent can choose single-note reconstruction instead
- **Mitigation:** Agent adapts strategy to available context
- **Mitigation:** Only suggest review for notes with some connections

### Risk: Agent takes too long to respond

- **Mitigation:** Set strict timeouts (15s max)
- **Fallback:** Simple template prompt if agent times out
- **UX:** Show typing indicator so user knows agent is working

## Advantages of Agent-Driven Approach

### Compared to Predetermined Prompts

**Agent-Driven (Chosen Approach):**

- ✅ **Adaptive** - Chooses best strategy for each note/context
- ✅ **Intelligent** - Discovers connections and themes
- ✅ **Contextual** - Incorporates user's current work/projects
- ✅ **Conversational** - Natural, flexible interaction
- ✅ **Simpler implementation** - No need to pre-categorize strategies
- ✅ **Full context** - Agent sees complete notes, makes better decisions
- ✅ **Tool access** - Can fetch additional context as needed
- ✅ **Future-proof** - Easy to add new strategies without UI changes

**Predetermined Prompts (Original Spec):**

- ❌ Fixed strategy per note type
- ❌ Limited context (200-char summaries)
- ❌ Rigid UI flow
- ❌ Complex state management
- ❌ Hard to extend with new prompt types

### Key Innovations

1. **Full Note Context** - No truncation means better synthesis questions
2. **Project Awareness** - Agent checks daily notes for current work
3. **Dynamic Tool Use** - Agent fetches exactly what it needs
4. **Adaptive Difficulty** - Adjusts based on review history and note characteristics
5. **Connection Building** - Agent suggests and creates links during review
6. **Conversational Flow** - More engaging than rigid forms

### Alignment with Flint Philosophy

- ✅ **AI assists, human thinks** - Agent creates challenge, user does the synthesis
- ✅ **Agent SDK** - Perfect use case for agentic workflows
- ✅ **Local-first** - All review data stays local
- ✅ **Flexible** - Agent adapts to user's note-taking style
- ✅ **Deep processing** - Forces understanding over recognition

## Timeline Estimate

**Week 1: Backend & MCP Tools**

- Database schema and migrations
- API endpoints (getNotesForReview, completeReview, etc.)
- MCP tools for agent (get_note, get_linked_notes, search_daily_notes, etc.)
- Agent system prompt and review guidelines

**Week 2: Frontend & Agent Integration**

- Review view (list of due notes)
- Enable review toggle
- Conversational review interface (chat UI)
- Agent initialization and context loading

**Week 3: Polish & Testing**

- Error handling and fallbacks
- Loading states and UX polish
- User testing with real notes
- Bug fixes and iteration

**Total: 3 weeks for prototype**

## Next Steps

1. **Review and approve this revised spec**
2. **Test agent prompt with sample notes** - Validate quality before building UI
3. **Implement MCP tools** - Get backend ready for agent
4. **Build conversational UI** - Chat-like review interface
5. **Test with real users** - Validate the agent-driven approach

---

**Document Status:** Revised prototype specification (agent-driven approach)
**Created:** 2025-01-15
**Revised:** 2025-01-15 (Major revision: agent-driven review with full context)
**Key Changes:**

- Agent chooses review strategy instead of predetermined prompts
- Full note content instead of truncated summaries
- Conversational interface instead of rigid modal flow
- Tool-based context fetching instead of pre-computed context
  **Next Step:** Review with team, test agent prompt, begin implementation
