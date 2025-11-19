# Review Mode Scheduling Algorithm PRD

## Overview

This document describes the redesign of Flint's review mode scheduling algorithm from a simple date-based system to a session-based spaced engagement system.

## Problem Statement

The current review scheduling algorithm is extremely basic:

- Pass = review in 7 days
- Fail = review in 1 day

This approach has several problems:

1. **No adaptive spacing**: All notes are treated equally regardless of user performance or note difficulty
2. **Backlog accumulation**: Missing reviews creates an overwhelming queue that discourages return
3. **Wrong optimization target**: Traditional SRS optimizes for memorization/recall, but Flint's review mode is about deep engagement with ideas
4. **Unused data**: Review history is captured but never used to improve scheduling

## Goals

- Create a sustainable review practice that doesn't punish users for taking breaks
- Adapt intervals based on user feedback about engagement quality
- Give users control over their review pace and preferences
- Support the goal of "deep engagement with notes" rather than strict memorization

## Non-Goals

- Optimizing for a specific retention rate (this isn't memorization)
- Implementing full FSRS or SM-2 algorithms
- Automatic difficulty estimation from note content
- Social/competitive features

## Design Decisions

### Session-Based Scheduling

**Decision**: Schedule notes relative to review sessions, not calendar dates.

**Rationale**:

- Prevents backlog accumulation when users take breaks
- Creates sustainable, predictable review load
- Intervals measured in "engagement units" rather than time
- User controls pace by completing sessions, not racing against dates

**Trade-off**: Less calendar predictability ("when will I see this?"), mitigated by showing "due in N sessions" and allowing users to configure sessions per week.

### Four-Point Rating Scale

**Decision**: Replace binary pass/fail with four engagement-quality ratings.

**Rationale**:

- Binary is too coarse for adaptive scheduling
- Ratings reflect engagement quality, not recall accuracy
- Includes explicit "graduate" option for fully processed notes

### Configurable Parameters

**Decision**: Make key scheduling parameters user-configurable with sensible defaults.

**Rationale**:

- Different users have different review capacities and preferences
- Defaults should work well for most users without configuration
- Power users can tune the system to their needs

## Specification

### Rating Scale

| Rating | Label            | Multiplier | Description                                      |
| ------ | ---------------- | ---------- | ------------------------------------------------ |
| 1      | Need more time   | ×0.5       | Struggled with this note, need to revisit sooner |
| 2      | Productive       | ×1.5       | Good engagement, appropriate timing              |
| 3      | Already familiar | ×2.5       | Could have waited longer, push out further       |
| 4      | Fully processed  | —          | No more reviews needed, retire from rotation     |

### Configuration Options

| Setting               | Default | Description                                       |
| --------------------- | ------- | ------------------------------------------------- |
| `sessionSize`         | 5       | Maximum notes per review session                  |
| `sessionsPerWeek`     | 7       | Expected sessions per week (for time estimates)   |
| `maxIntervalSessions` | 15      | Maximum interval cap (~30 days at daily sessions) |
| `minIntervalDays`     | 1       | Minimum days between reviewing the same note      |

### Scheduling Algorithm

```typescript
interface SchedulingConfig {
  sessionSize: number;
  sessionsPerWeek: number;
  maxIntervalSessions: number;
  minIntervalDays: number;
}

const DEFAULT_CONFIG: SchedulingConfig = {
  sessionSize: 5,
  sessionsPerWeek: 7,
  maxIntervalSessions: 15,
  minIntervalDays: 1
};

const RATING_MULTIPLIERS = {
  1: 0.5, // Need more time
  2: 1.5, // Productive
  3: 2.5 // Already familiar
};

function calculateNextSession(
  currentSession: number,
  currentInterval: number,
  rating: 1 | 2 | 3 | 4,
  config: SchedulingConfig
): { nextSession: number; interval: number } | 'retired' {
  if (rating === 4) {
    return 'retired';
  }

  const multiplier = RATING_MULTIPLIERS[rating];
  const newInterval = Math.max(1, Math.round(currentInterval * multiplier));
  const cappedInterval = Math.min(newInterval, config.maxIntervalSessions);

  return {
    nextSession: currentSession + cappedInterval,
    interval: cappedInterval
  };
}
```

### Session Selection

When a user starts a review session:

1. Get the current global session number
2. Query all active review items where `nextSessionNumber <= currentSessionNumber`
3. Sort by most overdue first (`currentSessionNumber - nextSessionNumber`, descending)
4. Take the first `sessionSize` items
5. Apply `minIntervalDays` filter (exclude items reviewed too recently)

```typescript
function getSessionNotes(
  currentSession: number,
  allItems: ReviewItem[],
  config: SchedulingConfig,
  now: Date
): ReviewItem[] {
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() - config.minIntervalDays);

  return allItems
    .filter(
      (item) =>
        item.status === 'active' &&
        item.enabled &&
        item.nextSessionNumber <= currentSession &&
        new Date(item.lastReviewed) < minDate
    )
    .sort(
      (a, b) =>
        currentSession - a.nextSessionNumber - (currentSession - b.nextSessionNumber)
    )
    .slice(0, config.sessionSize);
}
```

### New Note Behavior

When a note is added to review:

- `nextSessionNumber = currentSessionNumber + 1` (due next session)
- `currentInterval = 1`
- `status = 'active'`

### Retiring and Reactivating Notes

**Retiring**: When user selects "Fully processed" (rating 4):

- Set `status = 'retired'`
- Note no longer appears in review sessions
- History is preserved

**Reactivating**: User can manually reactivate a retired note:

- Set `status = 'active'`
- Set `nextSessionNumber = currentSessionNumber + 1`
- Set `currentInterval = 1` (start fresh)

## Data Model

### Review Item Schema

```typescript
interface ReviewItem {
  id: string;
  noteId: string;
  enabled: boolean;

  // Session-based scheduling
  nextSessionNumber: number;
  currentInterval: number;
  status: 'active' | 'retired';

  // Tracking
  reviewCount: number;
  lastReviewed: string; // ISO datetime
  reviewHistory: ReviewHistoryEntry[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

interface ReviewHistoryEntry {
  date: string; // ISO datetime
  sessionNumber: number;
  rating: 1 | 2 | 3 | 4;
  response?: string; // User's written response
  prompt?: string; // AI prompt shown
  feedback?: string; // AI feedback given
}
```

### Global Review State

```typescript
interface ReviewState {
  currentSessionNumber: number;
  lastSessionCompletedAt: string; // ISO datetime
}
```

This needs to be stored per-user. Increment `currentSessionNumber` when a review session is completed.

### Database Schema Changes

```sql
-- Add new columns to review_items table
ALTER TABLE review_items ADD COLUMN next_session_number INTEGER DEFAULT 1;
ALTER TABLE review_items ADD COLUMN current_interval INTEGER DEFAULT 1;
ALTER TABLE review_items ADD COLUMN status TEXT DEFAULT 'active';

-- Add review state table
CREATE TABLE IF NOT EXISTS review_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_session_number INTEGER DEFAULT 0,
  last_session_completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Add review config table
CREATE TABLE IF NOT EXISTS review_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  session_size INTEGER DEFAULT 5,
  sessions_per_week INTEGER DEFAULT 7,
  max_interval_sessions INTEGER DEFAULT 15,
  min_interval_days INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Migration Plan

### Phase 1: Schema Migration

1. Add new columns with defaults to `review_items`
2. Create `review_state` and `review_config` tables
3. Initialize `current_session_number = 0`

### Phase 2: Data Migration

For existing review items:

```typescript
function migrateReviewItem(
  item: OldReviewItem,
  currentDate: Date,
  currentSession: number
): Partial<ReviewItem> {
  // Convert next_review date to approximate session number
  const nextReviewDate = new Date(item.next_review);
  const daysUntilReview = Math.max(
    0,
    Math.ceil((nextReviewDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Assume daily sessions for conversion
  const nextSessionNumber = currentSession + daysUntilReview;

  // Estimate current interval from review history
  // Default to 1 if no history
  const currentInterval = estimateIntervalFromHistory(item.reviewHistory) || 1;

  return {
    nextSessionNumber,
    currentInterval,
    status: 'active'
  };
}

function migrateHistoryEntry(entry: OldHistoryEntry): ReviewHistoryEntry {
  return {
    ...entry,
    sessionNumber: 0, // Unknown for old entries
    rating: entry.passed ? 2 : 1 // Map pass→Productive, fail→Need more time
  };
}
```

### Phase 3: Code Migration

1. Update `review-scheduler.ts` with new algorithm
2. Update `review-manager.ts` for new data model
3. Update API endpoints
4. Update UI components for new rating scale

## UI Changes

### Review Feedback Component

Replace current pass/fail buttons with four rating options:

```
How was this review session?

[Need more time]  [Productive]  [Already familiar]  [Fully processed]
   See sooner       Normal         See later          Done with this
```

### Review Settings

Add settings panel for configuration:

- Session size (1-20, default 5)
- Sessions per week (1-14, default 7)
- Max interval (5-60 sessions, default 15)

### Review Dashboard

Update to show:

- Current session number
- Notes due this session
- Notes retired
- Option to reactivate retired notes

### Session Display

Show "Due in N sessions" rather than dates. Optionally show approximate date based on `sessionsPerWeek` setting.

## Analytics Considerations

The new system enables better analytics:

- **Engagement patterns**: Which ratings are most common?
- **Note difficulty**: Which notes consistently get "Need more time"?
- **Retirement rate**: How many notes get fully processed?
- **Session completion rate**: How often does user complete full sessions?

These can be computed from the review history without additional tracking.

## Future Enhancements

Potential improvements not in initial scope:

- **Streak tracking**: Encourage consistent review habit
- **Smart suggestions**: Recommend session size based on available notes
- **Note clustering**: Group related notes in same session
- **Undo**: Allow undoing a rating immediately after
- **Skip**: Allow skipping a note without rating (defer to next session)

## Additional Design Decisions

### Session Completion

A session is complete when all notes in the session have been rated. This provides a clear endpoint and ensures users engage with all scheduled notes before the session number increments.

### Multiple Sessions Per Day

Users can complete multiple sessions per day. After completing a session, show a "Start next session" button that allows them to continue if they have more time. The `minIntervalDays` setting prevents the same note from appearing in back-to-back sessions on the same day.

### Interval Floor

The minimum interval is 1 session. Even after a "Need more time" rating, notes won't appear more frequently than once per session. This is enforced by `Math.max(1, ...)` in the algorithm.
