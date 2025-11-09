# Review Mode: Minimal Prototype Specification

## Purpose

This document specifies a **minimal viable prototype** for Flint's AI-powered review mode. The goal is to validate the core concept with the simplest possible implementation that demonstrates the key innovation: **AI-generated prompts that force deep processing**.

## Prototype Goals

### What We're Testing

1. **Does AI-generated synthesis feel valuable?** - Do users find prompts helpful vs. annoying?
2. **Does deep processing work better than passive re-reading?** - Does this approach actually help understanding?
3. **Is the UX intuitive?** - Can users understand and use the flow without confusion?
4. **Do users want this feature?** - Will they enable review and use it regularly?

### What We're NOT Testing (Yet)

- Multiple prompt types (just synthesis for MVP)
- Complex scheduling algorithms (simple fixed intervals)
- Analytics and metrics (just basic tracking)
- Workflow integration (manual only)
- Custom functions (use defaults)

## Core Design Decisions

### Decision 1: Metadata Approach ✅ DECIDED

**Choice: Simple frontmatter toggle**

```yaml
---
type: permanent
title: "My Note"
review: true  # Simple boolean to opt-in
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

### Decision 2: Which Prompt Type? ✅ DECIDED

**Choice: Synthesis prompts (connect 2-3 notes)**

**Example:**
```
Your notes [[elaborative-encoding]] and [[schema-formation]]
both discuss memory. Explain how elaborative encoding helps
build schemas. What's the mechanism connecting them?
```

**Rationale:**
- Shows off the knowledge graph advantage
- Can't be done with traditional flashcards
- Requires real understanding to answer
- Demonstrates AI's ability to find connections
- Works even with small note collections (2+ notes)

**Alternative considered:** Application prompts
- **Problem:** Requires extracting user's current projects from daily notes
- **Complexity:** Parser for daily notes, project detection logic
- **Decision:** Save for Phase 2, use synthesis for MVP

### Decision 3: Review Trigger - How to Start Review? 🤔 NEEDS DECISION

**Option A: Button in Note Editor**
```
┌─────────────────────────────────────────┐
│ [Save] [Metadata] [Review This Note] ← │
└─────────────────────────────────────────┘
```
- Clicking opens review modal for current note
- Simple, discoverable
- **Problem:** Only reviews one note at a time, not session-based

**Option B: New "Review" Main View**
```
Main Navigation:
- Inbox
- Daily
- Review  ← NEW
- All Notes
- AI Assistant
```
- Shows "X notes due for review"
- Click to start review session
- More intentional, batch-oriented
- **Problem:** More complex to build, requires navigation changes

**Option C: AI Chat Command**
```
User: "Review my notes"
AI: "You have 3 notes due for review. Let's start with..."
```
- Natural language interface
- Uses existing chat UI
- **Problem:** Less discoverable, requires knowing command

**RECOMMENDATION: Start with Option B (Review view)**
- Most aligned with long-term vision
- Clear entry point for feature
- Supports session-based review
- Can add A and C later

**Fallback if too complex:** Option A (button) → modal

### Decision 4: Review UI - Where Does Review Happen? 🤔 NEEDS DECISION

**Option A: Modal Overlay**
```
┌─────────────────────────────────────────────────┐
│ [X]                                             │
│ Review: [[note-title]]                          │
│                                                 │
│ 🤔 Prompt: [AI-generated synthesis prompt]     │
│                                                 │
│ Your Response:                                  │
│ [Text area for user to type]                   │
│                                                 │
│ [Show Note] [Check Understanding]               │
└─────────────────────────────────────────────────┘
```

**Pros:**
- Focus mode, no distractions
- Easy to implement (reuse modal component)
- Clear workflow

**Cons:**
- Blocks rest of UI
- Can't reference other notes easily

**Option B: Dedicated Review View (Split Screen)**
```
┌──────────────────┬──────────────────────────┐
│ Review Queue (3) │ Current Review           │
│                  │                          │
│ ● Note 1        │ 🤔 Prompt:               │
│ ○ Note 2        │ [synthesis prompt]       │
│ ○ Note 3        │                          │
│                  │ Your Response:           │
│                  │ [text area]              │
│                  │                          │
│                  │ [Show Note] [Rate 1-5]   │
└──────────────────┴──────────────────────────┘
```

**Pros:**
- Can see queue of notes
- More context visible
- Better for multiple notes

**Cons:**
- More complex layout
- Requires new view component

**Option C: In-Place (Note Editor Transforms)**
```
[When review button clicked, note editor shows:]

┌─────────────────────────────────────────────────┐
│ 🤔 REVIEW MODE                                  │
│                                                 │
│ Prompt: [synthesis prompt]                     │
│                                                 │
│ [Text area for response]                       │
│                                                 │
│ ──────────────────────────────────────────────│
│ [Show Note Content Below] [Rate 1-5] [Exit]   │
└─────────────────────────────────────────────────┘
```

**Pros:**
- Uses familiar editor space
- No new UI paradigm
- Can easily reference note below

**Cons:**
- Conflates editing and reviewing
- Harder to do multi-note sessions

**RECOMMENDATION: Option A (Modal) for MVP**
- Simplest to implement
- Clear separation from editing
- Can show note content in modal when user clicks "Show Note"
- Can upgrade to Option B later

### Decision 5: Prompt Generation - When? 🤔 NEEDS DECISION

**Option A: Generate During Review (On-Demand)**
```
User clicks "Start Review"
  → Load note
  → Call AI to generate prompt
  → Show prompt to user (shows loading state)
```

**Pros:**
- Always fresh, uses latest knowledge graph
- No pre-generation overhead
- Can adapt based on user context at review time

**Cons:**
- User waits for AI (2-3 seconds per note)
- More expensive (API calls during review)
- Requires AI connection during review

**Option B: Pre-Generate (Background)**
```
When note becomes due for review:
  → Background task generates prompt
  → Stores in database
  → Shows pre-generated prompt instantly
```

**Pros:**
- Instant review start (no waiting)
- Can batch API calls (cheaper)
- Works offline after generation

**Cons:**
- Prompt may be stale (doesn't reflect recent notes)
- More complex (background job system)
- Storage overhead

**RECOMMENDATION: Option A (On-Demand) for MVP**
- Simpler implementation
- Always relevant
- Acceptable UX (show loading spinner)
- Can add pre-generation later as optimization

**UX consideration:** Show loading state clearly
```
"Analyzing your knowledge graph and generating review prompt..."
[Spinner]
```

### Decision 6: Response Capture - How Does User Answer? 🤔 NEEDS DECISION

**Option A: Text Box (Type Response)**
```
🤔 Prompt: [synthesis question]

Your Response:
┌─────────────────────────────────────────┐
│ [User types their explanation here]     │
│                                         │
│                                         │
└─────────────────────────────────────────┘

[Check Understanding]
```

**Pros:**
- Forces articulation (stronger learning)
- AI can analyze response
- Creates record of thinking

**Cons:**
- More friction (typing takes time)
- Some users won't want to type
- What if user's answer is wrong? (awkward)

**Option B: Mental Answer (Just Think)**
```
🤔 Prompt: [synthesis question]

Take a moment to think through your answer.

[I've Thought About It] [Show Note]
```

**Pros:**
- Less friction (fast)
- No wrong answer anxiety
- More like meditation/reflection

**Cons:**
- No AI analysis possible
- Easier to skip without real thought
- No record of understanding

**Option C: Hybrid (Optional Text)**
```
🤔 Prompt: [synthesis question]

Think through your answer, optionally write it down:
┌─────────────────────────────────────────┐
│ [Optional text area]                    │
└─────────────────────────────────────────┘

[Continue] [Show Note]
```

**Pros:**
- Flexibility for different users
- Can add AI analysis for those who type
- Lower friction than required typing

**Cons:**
- Unclear UX (optional fields are confusing)
- Most users probably skip typing

**RECOMMENDATION: Option B (Mental) for MVP**
- Lowest friction = higher adoption
- Focus on prompts quality, not response capture
- Can add Option A in Phase 2 for power users
- Aligns with "review should be fast"

**Implementation:**
```
1. Show prompt
2. [Show Note Content] button → reveals note below
3. User reads note, compares to their mental model
4. Rate confidence 1-5
5. Next note
```

### Decision 7: Confidence Rating - How to Measure? ✅ DECIDED

**Choice: Simple 1-5 scale after seeing note**

```
After revealing note content:

How well did you understand the connection?

[1] [2] [3] [4] [5]
Struggled    OK    Confident
```

**Rationale:**
- Simple, familiar (like Anki)
- User rates their understanding, not recall speed
- Can map to SM-2 algorithm intervals

**Wording matters:**
- NOT "How well did you remember?" (emphasizes memory)
- YES "How well did you understand the connection?" (emphasizes synthesis)

### Decision 8: Scheduling Algorithm ✅ DECIDED

**Choice: Simple fixed intervals for MVP, upgrade to SM-2 in Phase 1**

**MVP (simplest possible):**
```
First review: 1 day after enabling
Second review: 3 days after first
Third review: 7 days after second
Fourth+: 14 days
```

Fixed, no adaptation. Just demonstrates the concept.

**Phase 1 (add SM-2):**
- Adapt intervals based on confidence ratings
- Standard spaced repetition

**Rationale:**
- Fixed intervals = no algorithm complexity in MVP
- Still demonstrates value of review
- Can upgrade without changing UI

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

### Decision 10: AI Analysis of Response? 🤔 NEEDS DECISION

**Context:** If we go with mental-only answers (Decision 6), this is moot. But worth deciding the principle.

**Option A: No AI Analysis (MVP)**
- User rates themselves
- AI doesn't see response
- Simple, fast, cheap

**Option B: AI Analyzes Written Response**
```
After user types response:
"Good explanation! You captured X.
Consider also: Y connects to [[other-note]]"
```
- Helpful feedback
- Can suggest new connections
- Educational

**RECOMMENDATION: Option A (No Analysis) for MVP**
- Consistent with mental-only responses
- Reduces complexity and cost
- Focus on prompt quality
- Can add in Phase 3 when we add text responses

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

#### 3. Review Modal

**Triggered by:** Clicking [Review Now] button

**Flow:**

**Step 1: Loading**
```
┌─────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]            │
├─────────────────────────────────────────────┤
│                                             │
│ Analyzing your knowledge graph...           │
│                                             │
│ [Loading spinner]                           │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 2: Prompt Shown**
```
┌─────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]            │
│ Last reviewed: 7 days ago                   │
├─────────────────────────────────────────────┤
│                                             │
│ 🤔 Synthesis Prompt:                        │
│                                             │
│ Your notes [[elaborative-encoding]] and     │
│ [[schema-formation]] both discuss how       │
│ memory is organized. Explain how            │
│ elaborative encoding helps build schemas.   │
│ What's the mechanism connecting them?       │
│                                             │
│ Related notes:                              │
│ • [[schema-formation]]                      │
│ • [[memory-consolidation]]                  │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ Take a moment to think through your answer. │
│                                             │
│ [Show Note Content]                         │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 3: Note Revealed**
```
┌─────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]            │
├─────────────────────────────────────────────┤
│                                             │
│ 🤔 Prompt: [collapsed, click to re-read]   │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ 📄 Note Content:                            │
│                                             │
│ # Elaborative Encoding Strengthens Memory  │
│                                             │
│ Elaborative encoding involves connecting   │
│ new information to existing knowledge...   │
│                                             │
│ [Full note content shown here]             │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ How well did you understand this concept?  │
│                                             │
│ [1] [2] [3] [4] [5]                        │
│ Struggled    OK    Confident               │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 4: Rated**
```
✓ Review complete!

Next review: January 22 (in 7 days)

[Close] [Review Another Note]
```

#### 4. Database Schema (Minimal)

```sql
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  vault_id TEXT NOT NULL,

  -- Scheduling (simple fixed intervals for MVP)
  enabled BOOLEAN DEFAULT TRUE,
  last_reviewed TEXT,
  next_review TEXT NOT NULL,
  review_count INTEGER DEFAULT 0,

  -- User feedback history (JSON array)
  confidence_history TEXT, -- JSON: [{"date": "...", "rating": 3}, ...]

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_review_next_review ON review_items(next_review, enabled);
```

**No review_history or review_sessions tables in MVP** - keep it simple.

#### 5. Prompt Generation System

**MCP Tool:**

```typescript
{
  name: "generate_synthesis_prompt",
  description: "Generate synthesis prompt connecting 2-3 related notes",
  inputSchema: {
    note_id: string,
    max_related_notes: number // default: 2
  },
  outputSchema: {
    prompt: string,
    related_notes: string[], // Note IDs referenced in prompt
    fallback: boolean // True if couldn't find related notes
  }
}
```

**Algorithm:**

```typescript
async function generateSynthesisPrompt(noteId: string) {
  // 1. Get note content and metadata
  const note = await getNote(noteId);

  // 2. Find related notes (prefer explicit links first)
  let relatedNotes = await getLinkedNotes(noteId);

  // 3. If fewer than 2 links, find by tags or similarity
  if (relatedNotes.length < 2) {
    const byTags = await getNotesWithSharedTags(noteId, limit: 5);
    relatedNotes = [...relatedNotes, ...byTags].slice(0, 3);
  }

  // 4. If still < 2, use fallback prompt (single-note review)
  if (relatedNotes.length < 1) {
    return {
      prompt: `Explain the main concept in this note in your own words. What are the key ideas and how do they connect?`,
      related_notes: [],
      fallback: true
    };
  }

  // 5. Generate synthesis prompt with AI
  const prompt = await generateWithAI({
    systemPrompt: `You are helping create review prompts for a note-taking app.

    Generate a synthesis prompt that:
    - Requires explaining how 2-3 concepts connect
    - Cannot be answered with simple recall
    - References specific notes by title using [[wikilink]] syntax
    - Is specific to the user's actual notes, not generic
    - Asks "how" or "why", not "what"

    Keep it concise (2-3 sentences max).`,

    context: {
      mainNote: {
        title: note.title,
        summary: extractSummary(note.content, maxLength: 200)
      },
      relatedNotes: relatedNotes.map(n => ({
        title: n.title,
        summary: extractSummary(n.content, maxLength: 200),
        relationship: n.linkType || 'related'
      }))
    }
  });

  return {
    prompt: prompt,
    related_notes: relatedNotes.map(n => n.id),
    fallback: false
  };
}
```

**Fallback Strategy:**
- If no related notes: Single-note explanation prompt
- If AI generation fails: Template-based prompt
- If note has no content: Skip review

#### 6. Fixed Interval Scheduler

```typescript
function getNextReviewDate(reviewCount: number, confidence: number): Date {
  const now = new Date();

  // Simple fixed intervals (MVP)
  const intervals = {
    0: 1,   // First review: 1 day
    1: 3,   // Second: 3 days
    2: 7,   // Third: 1 week
    3: 14   // Fourth+: 2 weeks
  };

  const daysToAdd = intervals[Math.min(reviewCount, 3)] || 14;

  return addDays(now, daysToAdd);
}

function completeReview(noteId: string, confidence: number) {
  const item = getReviewItem(noteId);

  // Update review record
  item.review_count++;
  item.last_reviewed = now();
  item.next_review = getNextReviewDate(item.review_count, confidence);

  // Append to confidence history
  const history = JSON.parse(item.confidence_history || '[]');
  history.push({
    date: now(),
    rating: confidence
  });
  item.confidence_history = JSON.stringify(history);

  save(item);
}
```

**Note:** Confidence rating is captured but not yet used for scheduling. Phase 1 will add SM-2 algorithm that adapts based on ratings.

### What's Explicitly NOT in MVP

1. **Multiple prompt types** - Only synthesis, no application/explanation/etc.
2. **AI response analysis** - No feedback on user's thinking
3. **Session mode** - No auto-advance or session tracking
4. **Analytics dashboard** - No charts or statistics
5. **Workflow integration** - No automated triggers
6. **Custom prompts** - No user editing of prompt templates
7. **Adaptive scheduling** - Fixed intervals, no SM-2 yet
8. **Connection suggestions** - AI doesn't suggest new links
9. **Progressive hints** - No hint system if user is stuck
10. **Review from chat** - No conversational interface

## Implementation Checklist

### Backend (Server)

- [ ] Database migration: Create `review_items` table
- [ ] API: `enableReview(noteId)` → Sets `review: true` in frontmatter
- [ ] API: `disableReview(noteId)` → Sets `review: false` in frontmatter
- [ ] API: `getNotesForReview()` → Returns notes where `next_review <= today`
- [ ] API: `completeReview(noteId, confidence)` → Updates schedule
- [ ] Prompt generation: `generateSynthesisPrompt(noteId)`
  - Get linked notes
  - Fallback to tag-based similarity
  - Call AI to generate prompt
  - Handle errors gracefully

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
- [ ] Review modal component
  - Step 1: Loading state
  - Step 2: Show prompt
  - Step 3: Show note content
  - Step 4: Confidence rating
  - Step 5: Completion message
- [ ] Store: Review state management
  - Track current review
  - Handle modal open/close
  - Cache prompts

### AI Integration

- [ ] MCP tool: `generate_synthesis_prompt`
- [ ] System prompt for prompt generation
- [ ] Error handling for AI failures
- [ ] Fallback prompts (templates)

### Polish

- [ ] Loading states (spinners)
- [ ] Error messages (AI timeout, no related notes)
- [ ] Toast notifications (review enabled, completed)
- [ ] Keyboard shortcuts (rate 1-5 with number keys)
- [ ] Responsive design (modal works on smaller screens)

## Success Metrics for Prototype

### Usage Metrics
- % of users who enable review for at least 1 note
- % of due reviews that get completed (completion rate)
- Average time spent per review
- Average confidence ratings

### Qualitative Feedback
- Do users find prompts valuable?
- Is the flow intuitive?
- Are prompts too hard? Too easy?
- Would users use this regularly?

### Technical Validation
- Does prompt generation work reliably?
- Are intervals reasonable?
- Does the fixed schedule make sense?
- Database schema sufficient?

## Migration Path to Full Feature

### Phase 1: Core Review System
- Add SM-2 adaptive scheduling
- Replace fixed intervals with confidence-based
- Add review history tracking
- Improve prompt generation (more context)

### Phase 2: Enhanced UX
- Add review session mode (auto-advance)
- Add review dashboard with basic stats
- Add keyboard shortcuts
- Add progressive hints

### Phase 3: AI Integration
- Add multiple prompt types (application, explanation)
- Add AI response analysis (for typed responses)
- Add connection suggestions during review
- Conversational review via AI chat

### Phase 4: Power Features
- Custom prompt templates
- Workflow integration
- Custom functions for scheduling
- Bulk operations

## Open Questions for User Feedback

1. **Should "Enable Review" be automatic for permanent notes?**
   - Currently: Manual opt-in
   - Alternative: Auto-enable with ability to disable

2. **Is mental-only answer sufficient or do users want to type?**
   - Currently: Mental only (think then rate)
   - Alternative: Optional text box

3. **Are synthesis prompts the right starting point?**
   - Currently: Only synthesis (connect 2-3 notes)
   - Alternative: Start with simpler reconstruction prompts?

4. **Is fixed scheduling acceptable or do users expect adaptation?**
   - Currently: Fixed intervals (1, 3, 7, 14 days)
   - Alternative: Add SM-2 in MVP even though more complex?

5. **Should review view be prominent or hidden?**
   - Currently: Main navigation item
   - Alternative: Subtle badge on All Notes view?

## Risk Mitigation

### Risk: Prompts are low quality
- **Mitigation:** Test with real user notes before launch
- **Fallback:** Template-based prompts if AI fails
- **Escape hatch:** Users can disable review per note

### Risk: Users don't understand the value
- **Mitigation:** Clear onboarding explanation
- **Mitigation:** "Learn More" link with examples
- **Escape hatch:** Feature is opt-in, non-intrusive

### Risk: Review feels like a chore
- **Mitigation:** Keep it fast (mental-only answers)
- **Mitigation:** No guilt (just shows what's due)
- **Mitigation:** No streaks or pressure

### Risk: AI costs too high
- **Mitigation:** Only generate prompts on-demand
- **Mitigation:** Cache prompts (reuse if note unchanged)
- **Mitigation:** Use cheap model (Haiku) for prompt generation

### Risk: Not enough related notes for synthesis
- **Mitigation:** Graceful fallback to single-note prompts
- **Mitigation:** Only suggest review for well-connected notes
- **Mitigation:** Clear messaging when feature won't work well

## Timeline Estimate

**Week 1: Backend**
- Database schema
- API endpoints
- Prompt generation system

**Week 2: Frontend**
- Review view
- Enable toggle
- Review modal

**Week 3: Polish & Testing**
- Error handling
- Loading states
- User testing
- Bug fixes

**Total: 3 weeks for prototype**

---

**Document Status:** Prototype specification (ready for implementation)
**Created:** 2025-01-15
**Dependencies:** Requires design decisions to be finalized first
**Next Step:** Review with team, finalize open decisions, begin implementation
