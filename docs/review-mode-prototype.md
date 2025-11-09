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

**Choice: Dedicated Full-Screen Review View**

```
┌─────────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]          [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│ 🤔 Synthesis Prompt:                            │
│                                                 │
│ Your notes [[elaborative-encoding]] and         │
│ [[schema-formation]] both discuss memory...     │
│                                                 │
│ ──────────────────────────────────────────────│
│                                                 │
│ Your Response:                                  │
│ ┌───────────────────────────────────────────┐ │
│ │ [User types explanation here]             │ │
│ │                                           │ │
│ │                                           │ │
│ └───────────────────────────────────────────┘ │
│                                                 │
│ [Show Note Content] [Submit]                    │
└─────────────────────────────────────────────────┘
```

**Rationale:**
- Dedicated system view (like Inbox, Daily)
- Focus mode for review
- Full screen real estate for typing
- Clear workflow separation from editing
- Can show note content below when revealed

### Decision 5: Prompt Generation - When? ✅ DECIDED

**Choice: Generate During Review (On-Demand)**

```
User clicks "Review Now"
  → Load note
  → Show loading state
  → Call AI to generate prompt
  → Display prompt and response area
```

**Rationale:**
- Always fresh, uses latest knowledge graph
- Simpler implementation (no background jobs)
- Prompts reflect user's current context
- 2-3 second wait is acceptable with good loading UX

**Loading State:**
```
Analyzing your knowledge graph...
Generating synthesis prompt...
[Spinner]
```

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

**Step 2: Prompt Shown + Response Entry**
```
┌─────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]            │
│ Last reviewed: 7 days ago · Review #2       │
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
│ Related: [[schema-formation]], [[memory]]   │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ Your Response:                              │
│ ┌─────────────────────────────────────────┐ │
│ │ [Type your explanation here...]         │ │
│ │                                         │ │
│ │                                         │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Show Note Content] [Submit Response]       │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 3: AI Analysis + Note Content**
```
┌─────────────────────────────────────────────┐
│ Review: [[elaborative-encoding]]            │
├─────────────────────────────────────────────┤
│                                             │
│ Your Response:                              │
│ "Elaborative encoding creates connections   │
│ between new info and existing knowledge.    │
│ These connections form schemas..."          │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ 💡 AI Analysis:                             │
│                                             │
│ Great! You captured the core mechanism.     │
│ Elaborative encoding creates the links,     │
│ and those links become schema structure.    │
│                                             │
│ Consider: This also connects to             │
│ [[memory-consolidation]] - the connections  │
│ you create during encoding strengthen       │
│ during consolidation.                       │
│                                             │
│ [Create link to [[memory-consolidation]]?]  │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ 📄 Note Content: [Click to show/hide]      │
│                                             │
│ ───────────────────────────────────────────│
│                                             │
│ Did you understand this concept well?       │
│                                             │
│ [Pass] [Fail]                               │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 4: Complete**
```
✓ Review complete!

Next review: January 22 (in 7 days)

[Close] [Review Another Note]
```

*If user clicks [Fail]:*
```
✓ Review saved

We'll review this again tomorrow so you can
reinforce your understanding.

Next review: Tomorrow

[Close] [Review Another Note]
```

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

#### 6. Pass/Fail Scheduler

```typescript
function getNextReviewDate(passed: boolean): Date {
  const now = new Date();

  // Simple binary intervals (MVP)
  if (passed) {
    return addDays(now, 7);  // Pass: review in 7 days
  } else {
    return addDays(now, 1);  // Fail: retry tomorrow
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
    response: userResponse  // Store for future reference
  });
  item.review_history = JSON.stringify(history);

  save(item);
}
```

**Note:** Phase 1 will add SM-2 algorithm with adaptive intervals based on review history.

### What's Explicitly NOT in MVP

1. **Multiple prompt types** - Only synthesis, no application/explanation/reconstruction/etc.
2. **Session mode** - No auto-advance through multiple notes
3. **Analytics dashboard** - No charts, statistics, or retention metrics
4. **Workflow integration** - No automated triggers or workflow-based review
5. **Custom prompts** - No user editing of prompt templates
6. **Adaptive scheduling** - Fixed pass/fail intervals, no SM-2 yet
7. **Progressive hints** - No hint system if user is stuck (just "show note")
8. **Review from chat** - No conversational interface, UI-only
9. **Prompt regeneration** - Can't ask for different prompt (single attempt)
10. **Multiple difficulty levels** - All prompts same difficulty (no easy/hard modes)

## Implementation Checklist

### Backend (Server)

- [ ] Database migration: Create `review_items` table
- [ ] API: `enableReview(noteId)` → Sets `review: true` in frontmatter
- [ ] API: `disableReview(noteId)` → Sets `review: false` in frontmatter
- [ ] API: `getNotesForReview()` → Returns notes where `next_review <= today`
- [ ] API: `completeReview(noteId, passed, userResponse)` → Updates schedule
- [ ] Prompt generation: `generateSynthesisPrompt(noteId)`
  - Get linked notes
  - Fallback to tag-based similarity
  - Call AI to generate prompt
  - Handle errors gracefully
- [ ] Response analysis: `analyzeReviewResponse(noteId, prompt, userResponse)`
  - AI analyzes user's explanation
  - Identifies what was captured well
  - Suggests additional connections
  - Returns constructive feedback

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
  - Full-screen review interface (not modal)
- [ ] Review flow UI
  - Step 1: Loading state with spinner
  - Step 2: Show prompt + response text area
  - Step 3: AI analysis + note content (collapsible)
  - Step 4: Pass/Fail buttons
  - Step 5: Completion message with next review date
- [ ] Store: Review state management
  - Track current review state
  - Cache prompts
  - Store user responses
  - Handle pass/fail submission

### AI Integration

- [ ] MCP tool: `generate_synthesis_prompt`
  - System prompt for creating synthesis questions
  - Context: note content + related notes
  - Returns: prompt text + related note IDs
- [ ] MCP tool: `analyze_review_response`
  - System prompt for analyzing user responses
  - Context: prompt + user response + note content
  - Returns: feedback text + suggested connections
- [ ] Error handling for AI failures
  - Fallback prompts (templates) if generation fails
  - Graceful degradation if analysis fails
  - Timeout handling (10s max)

### Polish

- [ ] Loading states (spinners for prompt generation and analysis)
- [ ] Error messages (AI timeout, no related notes, generation failed)
- [ ] Toast notifications (review enabled, completed, link created)
- [ ] Keyboard shortcuts
  - `Cmd/Ctrl+Enter` to submit response
  - `P` for Pass, `F` for Fail
- [ ] Responsive design (full-screen view on all sizes)
- [ ] Empty state when no notes are due
- [ ] Smooth transitions between review steps

## Success Metrics for Prototype

### Usage Metrics
- % of users who enable review for at least 1 note
- % of due reviews that get completed (completion rate)
- Average time spent per review
- Pass rate (% reviews marked as passed)
- Average response length (words)

### Qualitative Feedback
- Do users find AI-generated prompts valuable vs. annoying?
- Is the typing requirement acceptable or too much friction?
- Is AI feedback helpful or unnecessary?
- Are prompts appropriate difficulty?
- Would users use this regularly?
- Do pass/fail feel sufficient or do users want more granularity?

### Technical Validation
- Does prompt generation work reliably (>95% success rate)?
- Does AI analysis provide useful feedback?
- Are pass/fail intervals reasonable (7 days / 1 day)?
- Do users find enough related notes for synthesis?
- Database schema sufficient for tracking?
- Performance acceptable (2-3s for prompt, 3-4s for analysis)?

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
