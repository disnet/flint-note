# Review Mode Design Document

## Overview

Review Mode is a spaced repetition learning system integrated into Flint that helps users strengthen their understanding of notes through AI-generated challenges and feedback. The system stays entirely within a unified interface, providing a seamless review experience with intelligent prompts, contextual feedback, and automated scheduling.

## Goals

1. **Active Recall**: Test understanding through AI-generated review challenges
2. **Spaced Repetition**: Schedule reviews based on performance (pass = 7 days, fail = 1 day)
3. **Contextual Feedback**: Provide AI-generated feedback that references related notes
4. **Unified Experience**: Keep all review interactions in a single, focused view
5. **Minimal Friction**: Auto-advance through notes with keyboard shortcuts

## Architecture

### High-Level Flow

```
┌─────────────┐
│   Idle      │ Stats Dashboard
│   State     │ "Start Review" button
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Loading    │ Loading skeleton with spinner
│   State     │ "Generating review challenge..."
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Prompting   │ Review challenge + response editor
│   State     │ CodeMirror with wikilink autocomplete
└──────┬──────┘
       │ Submit
       ▼
┌─────────────┐
│  Analyzing  │ Loading skeleton with spinner
│   State     │ "Analyzing your response..."
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Feedback   │ AI feedback + Pass/Fail buttons
│   State     │ Scrollable content, fixed controls
└──────┬──────┘
       │ Pass/Fail
       ▼
┌─────────────┐
│ Transition  │ Brief progress indicator
│   State     │ Auto-advance to next note
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Complete   │ Session summary
│   State     │ Statistics and results
└─────────────┘
```

### State Machine

The review system uses a simple state machine with 6 states:

```typescript
type ReviewSessionState =
  | 'idle' // Stats dashboard
  | 'loading' // Generating prompt
  | 'prompting' // User answering
  | 'feedback' // Showing AI feedback
  | 'transition' // Between notes
  | 'complete'; // Session summary
```

## Components

### 1. ReviewView.svelte (Main Controller)

**Responsibility**: State machine orchestration, session management

**Key Features**:

- Manages session state transitions
- Loads notes for review
- Coordinates AI service calls
- Tracks session results
- Handles auto-advancement

**State Variables**:

```typescript
sessionState: ReviewSessionState
notesToReview: SessionReviewNote[]
currentNoteIndex: number
currentPrompt: string
userResponse: string
agentFeedback: AgentFeedback | null
sessionResults: ReviewResult[]
isGeneratingPrompt: boolean
isAnalyzingResponse: boolean
isCompletingReview: boolean
```

### 2. ReviewStats.svelte (Dashboard)

**Responsibility**: Display review statistics and session entry point

**Features**:

- Shows notes due today
- Shows notes due this week
- Total notes with review enabled
- "Start Today's Review" button

### 3. ReviewPrompt.svelte (Challenge & Response)

**Responsibility**: Display review challenge and collect user response

**Features**:

- Shows AI-generated review prompt
- CodeMirror editor with:
  - Auto-growing height (starts at 80px, max 400px)
  - Wikilink autocomplete (`[[` triggers)
  - Wikilink navigation support
- Keyboard shortcuts:
  - Cmd/Ctrl+Enter to submit
  - Escape to end session
- Action buttons: Show Note, Skip, End Session, Submit
- Scrollable content with fixed controls at bottom

**Layout**:

```
┌─────────────────────────────────┐
│ Header (fixed)                  │
│ Title | Progress                │
├─────────────────────────────────┤
│                                 │
│ Scrollable Content              │
│ - Review Challenge              │
│ - Response Editor (auto-grow)   │
│                                 │
├─────────────────────────────────┤
│ Fixed Controls (bottom)         │
│ - Hint text                     │
│ - Action buttons                │
└─────────────────────────────────┘
```

### 4. ReviewFeedback.svelte (Feedback & Rating)

**Responsibility**: Display AI feedback and collect pass/fail rating

**Features**:

- Shows collapsed prompt (for reference)
- Shows user's response
- Shows AI-generated feedback with:
  - Analysis of understanding
  - Suggested related notes (wikilinks)
- Pass/Fail buttons:
  - Pass (P key): Schedule 7 days out
  - Fail (F key): Schedule 1 day out
- Scrollable conversation with fixed controls

**Layout**:

```
┌─────────────────────────────────┐
│                                 │
│ Scrollable Feedback Content     │
│ - Prompt (collapsed)            │
│ - User Response                 │
│ - AI Feedback                   │
│                                 │
├─────────────────────────────────┤
│ Fixed Controls (bottom)         │
│ Pass / Fail buttons             │
│ Keyboard hints                  │
└─────────────────────────────────┘
```

### 5. ReviewSessionSummary.svelte (Results)

**Responsibility**: Display session statistics and results

**Features**:

- Total notes reviewed
- Pass/Fail counts
- Skipped count
- Session duration
- Expandable per-note details
- "Back to Dashboard" button

### 6. NoteContentDrawer.svelte (Reference)

**Responsibility**: Show note content during review

**Features**:

- Slide-out drawer from right
- Shows full note content
- Escape to close
- Available during prompting state

## Loading States & Animations

### Challenge Loading Skeleton

Shows while AI generates the review prompt:

```
┌─────────────────────────────────┐
│ Reviewing: [Note Title]         │
├─────────────────────────────────┤
│ Review Challenge:               │
│   ⟳ Generating...              │
│                                 │
│ Your Response:                  │
│   [Disabled placeholder]        │
└─────────────────────────────────┘
```

### Feedback Loading Skeleton

Shows while AI analyzes the response:

```
┌─────────────────────────────────┐
│ Review Prompt: [collapsed]      │
│                                 │
│ Your Response:                  │
│ [User's actual response]        │
│                                 │
│ Feedback:                       │
│   ⟳ Analyzing your response... │
│                                 │
├─────────────────────────────────┤
│ [Disabled Pass/Fail buttons]    │
└─────────────────────────────────┘
```

**Design Decisions**:

- Skeletons match final layout to prevent jarring transitions
- User's response is shown during analysis for context
- Controls stay visible but disabled to maintain spatial consistency
- Green-tinted spinner for feedback (matches success theme)
- Blue-tinted spinner for challenge (matches accent theme)

## AI Integration

### Review Prompt Generation

**API**: `window.api.generateReviewPrompt(noteId)`

**Process**:

1. Agent reads note content using `get_note_full` tool
2. Agent searches related notes using `search_notes_by_tags`
3. Agent generates contextual challenge question
4. Response wrapped in `<question>` tags for extraction

**Prompt Strategy**:

- Minimal system prompt to avoid context bloat
- Agent decides question difficulty based on note content
- Can include thinking/context before the question
- Extracted via regex: `/<question>(.*?)<\/question>/i`

**Fallback**: "Explain the main concepts in this note in your own words."

### Response Analysis

**API**: `window.api.analyzeReviewResponse({ noteId, prompt, userResponse })`

**Process**:

1. Agent reads original note using `get_note_full`
2. Agent receives prompt and user's response
3. Agent searches related notes for context
4. Agent provides feedback on understanding
5. Agent suggests relevant wikilinks
6. Response wrapped in `<feedback>` tags for extraction

**Feedback Strategy**:

- Minimal system prompt to reduce token usage
- Context-aware analysis referencing note content
- Suggests related notes to explore
- Positive, constructive tone
- Extracted via regex: `/<feedback>(.*?)<\/feedback>/i`

**Fallback**: "Thank you for your response."

## Spaced Repetition Scheduling

### Algorithm

Simple interval-based scheduling:

- **Pass**: Next review in 7 days
- **Fail**: Next review in 1 day (tomorrow)

### Implementation

**Database Fields** (notes table):

- `review_enabled`: Boolean flag
- `last_reviewed_at`: ISO timestamp
- `next_review_date`: YYYY-MM-DD format

**Queries**:

```sql
-- Get notes due for review
SELECT * FROM notes
WHERE review_enabled = 1
AND next_review_date <= ?
ORDER BY next_review_date ASC

-- Update after review
UPDATE notes
SET last_reviewed_at = ?,
    next_review_date = ?
WHERE id = ?
```

## Scrolling & Layout Architecture

### Problem

Long AI feedback would push controls off-screen, requiring page scrolling to access Pass/Fail buttons.

### Solution

Flexbox layout with three regions:

1. **Fixed Header** (`flex-shrink: 0`)
   - Note title and progress
   - Never scrolls

2. **Scrollable Content** (`flex: 1`, `overflow-y: auto`)
   - Review challenge or feedback conversation
   - Grows to fill available space
   - Scrolls independently

3. **Fixed Controls** (`flex-shrink: 0`)
   - Action buttons or Pass/Fail buttons
   - Always visible at bottom
   - Never scrolls

**CSS Pattern**:

```css
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  flex-shrink: 0;
}

.content {
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* Critical for flex scrolling */
}

.controls {
  flex-shrink: 0;
}
```

## Editor Features

### Auto-Growing Height

**Problem**: Fixed-height editor wastes space for short responses and limits long ones.

**Solution**:

- Start small: `min-height: 80px`
- Grow with content: `height: auto` on CodeMirror elements
- Cap growth: `max-height: 400px` on wrapper
- Wrapper handles overflow when max reached

**CSS**:

```css
.editor-wrapper {
  min-height: 80px;
  max-height: 400px;
  overflow: auto;
}

.editor-wrapper :global(.cm-editor) {
  height: auto;
  min-height: 80px;
}

.editor-wrapper :global(.cm-scroller) {
  overflow-y: visible;
  min-height: 80px;
}
```

### Wikilink Autocomplete

**Integration**:

- Enabled via `onWikilinkClick` prop
- Uses `wikilinkService.handleWikilinkClick()`
- Triggers on `[[` input
- Shows note search popup
- Supports:
  - Click to navigate
  - Shift+Click to open in sidebar
  - Creating new notes
  - Hover previews
  - Edit display text

## Session Management

### Session Data

```typescript
interface SessionReviewNote {
  id: string;
  title: string;
  content?: string;
  next_review_date: string;
  skipped?: boolean;
  reviewedAt?: string;
}

interface ReviewResult {
  noteId: string;
  noteTitle: string;
  passed: boolean;
  userResponse: string;
  agentFeedback: string;
  timestamp: string;
  scheduledFor: string;
}
```

### Session Flow

1. **Start Session**
   - Query notes due today
   - Initialize session state
   - Load first note

2. **Per Note**
   - Generate prompt (AI call)
   - Collect response
   - Analyze response (AI call)
   - Record pass/fail
   - Update schedule

3. **Complete Session**
   - Calculate statistics
   - Show summary
   - Reload stats for dashboard

## Keyboard Shortcuts

### Global (during review)

- `Escape`: End session early

### Prompting State

- `Cmd/Ctrl+Enter`: Submit response
- `Escape`: End session

### Feedback State

- `P`: Pass (schedule 7 days)
- `F`: Fail (schedule 1 day)

## Error Handling

### Graceful Degradation

**Prompt Generation Fails**:

- Use fallback: "Explain the main concepts in this note in your own words."
- Continue with session

**Response Analysis Fails**:

- Use fallback: "Thank you for your response."
- Continue with session (user can still pass/fail)

**API Errors**:

- Log to console
- Show error in UI (future improvement)
- Allow session to continue or gracefully end

### Context Window Management

**Problem**: Large notes + search results exceeded 200k token limit

**Solutions**:

1. Minimal system prompts (removed verbose instructions)
2. Search tools return metadata + preview only (not full content)
3. Tool results limited to prevent bloat
4. Agent generates concise feedback

## Future Improvements

### Scheduling Algorithm

- SM-2 algorithm for better retention
- Difficulty tracking per note
- Performance-based intervals

### UI Enhancements

- Progress visualization
- Stats graphs and trends
- Review history per note
- Customizable scheduling

### AI Improvements

- Remember previous review sessions
- Adaptive question difficulty
- Multi-turn conversations
- Explanations and hints

### Session Features

- Pause/resume sessions
- Custom review filters (by tag, type, etc.)
- Batch review settings
- Review reminders

## Technical Debt & Known Issues

1. **State Transitions**: Currently use `setTimeout` for brief transitions - could use CSS transitions
2. **Error UI**: Errors logged to console only - need user-facing error messages
3. **Session Persistence**: Sessions lost on app restart - could save in-progress sessions
4. **Review History**: Not stored - could track attempts and performance over time
5. **Undo**: No way to undo pass/fail rating - could add confirmation or undo option

## Files Reference

### Main Implementation

- `src/renderer/src/components/ReviewView.svelte` - State machine and orchestration
- `src/renderer/src/components/review/ReviewStats.svelte` - Dashboard
- `src/renderer/src/components/review/ReviewPrompt.svelte` - Challenge UI
- `src/renderer/src/components/review/ReviewFeedback.svelte` - Feedback UI
- `src/renderer/src/components/review/ReviewSessionSummary.svelte` - Results
- `src/renderer/src/components/review/NoteContentDrawer.svelte` - Reference drawer

### Backend Services

- `src/main/ai-service.ts` - AI prompt generation and analysis
- `src/main/review-tools.ts` - MCP tools for review agent
- `src/main/review-agent-prompt.ts` - Agent system prompts
- `src/server/core/review-manager.ts` - Database operations
- `src/server/core/review-scheduler.ts` - Scheduling logic

### Type Definitions

- `src/renderer/src/types/review.ts` - TypeScript interfaces

### Store

- `src/renderer/src/stores/reviewStore.svelte.ts` - Stats management

## Testing

### Test Coverage

- `tests/server/core/review-manager.test.ts` - Database operations
- `tests/server/core/review-scheduler.test.ts` - Scheduling logic
- `tests/server/api/review-integration.test.ts` - End-to-end API tests

### Manual Testing Checklist

- [ ] Start review session
- [ ] Answer challenge question
- [ ] Receive AI feedback
- [ ] Pass note (verify 7-day schedule)
- [ ] Fail note (verify 1-day schedule)
- [ ] Skip note
- [ ] End session early
- [ ] View session summary
- [ ] Test with very long feedback (scrolling)
- [ ] Test with very short response (editor size)
- [ ] Test keyboard shortcuts (P, F, Enter, Escape)
- [ ] Test wikilink autocomplete in response
- [ ] Test note content drawer

## Conclusion

The Review Mode implementation provides a complete spaced repetition system that leverages Flint's AI capabilities to generate contextual challenges and feedback. The unified interface keeps users focused on learning without context switching, while the intelligent scheduling ensures optimal retention. The architecture is extensible for future enhancements while maintaining simplicity in the current implementation.
