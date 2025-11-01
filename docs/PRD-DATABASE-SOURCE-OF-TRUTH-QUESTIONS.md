# Pre-Implementation Questions: Database as Source of Truth

**Status**: Draft - Needs Stakeholder Input
**Date**: 2025-11-01
**Related PRD**: `docs/PRD-DATABASE-SOURCE-OF-TRUTH.md`

---

## Critical Decisions (Must Answer Before Sprint 1)

### 1. File Write Queue Timing ⏱️

**Question**: What should the default file write queue delay be?

**Options**:
- **500ms**: Faster durability, less batching
- **1000ms**: Balanced (PRD recommendation)
- **1500ms**: More batching, slower durability
- **2000ms**: Maximum batching, slowest durability

**Trade-offs**:
| Delay | Batching | Durability | User Perception | External Tool Latency |
|-------|----------|------------|-----------------|----------------------|
| 500ms | Low | Fast | Feels instant | Good |
| 1000ms | Medium | Medium | Still fast | Acceptable |
| 1500ms | High | Slower | Acceptable | Noticeable |
| 2000ms | Highest | Slowest | May feel laggy | Frustrating |

**Context**:
- Database writes are ~1ms, so user always sees instant save in UI
- File delay only affects: external editors, git status, file-based tools
- Longer delays = more batching = fewer disk writes during rapid editing

**Recommendation**: Start with 1000ms, make configurable in settings

**Decision**: [ ] 500ms  [ ] 1000ms  [ ] 1500ms  [ ] 2000ms  [ ] Other: ___ms

**Make configurable?**: [ ] Yes  [ ] No  [ ] Later

---

### 2. Agent Update Conflict Behavior 🤖

**Question**: When agent updates a note while user has unsaved changes, what should happen?

**Scenario**: User is typing in note X. Agent modifies note X via `update_note` tool.

**Options**:

**A) Show Conflict Dialog (Conservative)**
```
┌─────────────────────────────────────────┐
│  Note Updated by Agent                  │
│                                         │
│  This note was modified by the agent    │
│  while you have unsaved changes.        │
│                                         │
│  [View Agent Changes] [Keep Typing]     │
└─────────────────────────────────────────┘
```
- ✅ Prevents data loss
- ✅ User always in control
- ❌ Interrupts user flow
- ❌ May be annoying for frequent agent updates

**B) Silent Notification (Non-Blocking)**
```
┌─────────────────────────────────────────┐
│ 🤖 Agent updated this note              │  ← Toast notification
└─────────────────────────────────────────┘
```
- ✅ Doesn't interrupt typing
- ✅ User can finish their thought
- ⚠️ User's changes will overwrite agent's on save (last write wins)
- ❌ Potential confusion about final state

**C) Auto-Merge with Notification**
```
Try to merge changes automatically:
- Agent modified line 5-10
- User modified line 20-25
→ Both changes kept, user continues typing
```
- ✅ Best UX - no interruption, no data loss
- ✅ Works for non-overlapping edits
- ❌ Complex to implement correctly
- ❌ Out of scope for initial version

**D) Queue Agent Update (Deferred)**
```
- User has unsaved changes → Agent update queued
- User saves → Apply queued agent update → Reload editor
```
- ✅ No data loss
- ⚠️ Agent update delayed until user saves
- ❌ Complex state management
- ❌ Agent sees stale content

**Recommendation**: Start with Option A (Conflict Dialog), add Option C (Auto-Merge) in future

**Decision**: [ ] A - Conflict Dialog  [ ] B - Silent Notification  [ ] C - Auto-Merge  [ ] D - Queue Update

**Fallback for complex cases**: [ ] Always show dialog  [ ] Always queue

---

### 3. External Edit Auto-Reload Behavior 🔄

**Question**: When external tool modifies a note with NO unsaved changes, should we reload silently?

**Scenario**: User has note X open (no edits). External editor (VSCode, Obsidian) modifies note X.

**Current Behavior**: Show "External edit detected" dialog every time

**Proposed Behavior**: Auto-reload silently (no dialog)

**User Impact**:
- ✅ Fewer interruptions for users who use multiple editors
- ✅ More like modern IDEs (VSCode, IntelliJ)
- ⚠️ Cursor position might jump to start of file
- ⚠️ Unexpected for users used to current behavior

**Options**:
1. **Always auto-reload** (PRD recommendation)
   - Simple, predictable
   - Matches VSCode behavior

2. **User preference** (default: auto-reload)
   - Checkbox in settings: "Automatically reload externally modified notes"
   - More complexity, but accommodates different workflows

3. **Show subtle notification after reload**
   ```
   ┌─────────────────────────────────────────┐
   │ Note reloaded (modified externally)     │  ← 2-second toast
   └─────────────────────────────────────────┘
   ```
   - User knows what happened
   - Not blocking/annoying

**Recommendation**: Option 3 (auto-reload + subtle notification)

**Decision**: [ ] Always auto-reload (silent)  [ ] Auto-reload with notification  [ ] User preference  [ ] Keep current behavior

---

### 4. Cursor Position After Agent Update 📍

**Question**: When agent updates a note and editor reloads, where should cursor go?

**Options**:

**A) Preserve Cursor Position**
- Try to keep cursor at same line/column
- ✅ Less jarring for user
- ⚠️ Might not make sense if agent changed surrounding text
- 🔧 Medium complexity (need to map old position to new content)

**B) Move to Start of File**
- Cursor goes to line 1, column 0
- ✅ Simple, predictable
- ❌ Annoying if user was deep in document
- 🔧 Trivial to implement

**C) Move to Start of Changed Region**
- Diff old vs new content, jump to first changed line
- ✅ User sees what agent changed
- ⚠️ May be confusing if multiple changes
- 🔧 High complexity (need diffing algorithm)

**D) User Preference**
- Setting: "After agent update: [Preserve cursor] [Start of file] [Changed region]"
- 🔧 Most complex

**Recommendation**: Start with A (Preserve), fallback to B if position invalid

**Decision**: [ ] A - Preserve  [ ] B - Start of file  [ ] C - Changed region  [ ] D - User preference

---

## Important Decisions (Needed Before Relevant Phase)

### 5. File Write Flush Triggers (Phase 1)

**Question**: Besides timeout and app close, when should we flush pending file writes?

**Current PRD**: Flush on timeout (1s) and app close

**Additional Flush Points to Consider**:

**A) Note Switch**
- User navigates from Note A to Note B
- Should we flush Note A to disk immediately?
- ✅ Ensures file is saved when switching context
- ❌ Negates some batching benefits

**B) Vault Switch**
- User switches vaults
- Should we flush all pending writes?
- ✅ Clean state when switching contexts
- ⚠️ Multiple vaults might share file system

**C) Git Operation Request**
- User clicks "Commit" or opens git panel
- Should we flush all pending writes?
- ✅ Ensures git sees current state
- 🔧 Requires git integration awareness

**D) Explicit "Sync Now" Command**
- Add command palette: "Flint: Sync All Notes to Disk"
- ✅ User control for paranoia/"just to be sure" moments
- ✅ Good for before external operations
- 🔧 Requires UI/command addition

**E) System Suspend/Hibernate**
- OS is about to sleep
- Should we flush everything?
- ✅ Prevents data loss on crash during sleep
- 🔧 Need to hook OS events (Electron supports this)

**Recommendation**: Implement A (note switch), D (explicit command), E (system suspend)

**Decision**:
- [ ] A - Note Switch
- [ ] B - Vault Switch
- [ ] C - Git Operation
- [ ] D - Explicit "Sync Now" Command
- [ ] E - System Suspend
- [ ] Other: _________________

---

### 6. File Write Failure Handling (Phase 1)

**Question**: When file write fails after retries, what should we do?

**Scenario**: Database has latest content, but file write fails (disk full, permissions, network drive disconnected)

**Options**:

**A) Silent Logging Only**
- Log error to console/file
- Show no UI
- ✅ Doesn't interrupt user
- ❌ User unaware of problem
- ❌ Files out of sync indefinitely

**B) Status Bar Indicator**
```
Bottom right corner:
[⚠️ 3 notes pending sync]  ← Clickable
```
- ✅ Visible but non-blocking
- ✅ User can investigate when convenient
- 🔧 Requires status bar UI

**C) Notification Toast**
```
┌─────────────────────────────────────────┐
│ ⚠️ Failed to sync note to disk          │
│ "Meeting Notes 2025-11-01"              │
│                                         │
│ [Retry Now] [Details] [Dismiss]         │
└─────────────────────────────────────────┘
```
- ✅ User immediately aware
- ⚠️ May interrupt flow
- ⚠️ Multiple failures = multiple toasts (annoying)

**D) Error Log UI**
```
Settings → Advanced → Sync Errors
Shows list of failed writes with timestamps
```
- ✅ Non-intrusive
- ❌ User may never check
- 🔧 Requires new settings panel

**Recommendation**: Combination:
- First failure: Option C (notification toast)
- Subsequent failures for same file: Option B (status bar)
- Always log to Option D (error log)

**Decision**: [ ] A - Silent  [ ] B - Status bar  [ ] C - Toast  [ ] D - Error log  [ ] Combination (specify): _______

**Retry Strategy**:
- [ ] 3 retries with exponential backoff (PRD recommendation)
- [ ] 5 retries
- [ ] Retry indefinitely with increasing delays
- [ ] Other: _________________

---

### 7. Event Source Tagging Implementation (Phase 6)

**Question**: How should we track which editor instance made a change?

**Context**: Multiple editors can have same note open (main view + sidebar)

**Options**:

**A) Random UUID per Editor Instance**
```typescript
class NoteDocument {
  private editorId = crypto.randomUUID(); // 'a3f2b8c9-...'
}
```
- ✅ Guaranteed unique
- ✅ Works across windows/tabs
- ❌ Not human-readable for debugging

**B) Semantic IDs**
```typescript
const editorId = 'main-editor';  // or 'sidebar-0', 'sidebar-1'
```
- ✅ Easy to debug
- ✅ Matches UI structure
- ⚠️ Need to ensure uniqueness

**C) Combination: Semantic + Instance Number**
```typescript
let instanceCounter = 0;
const editorId = `main-${++instanceCounter}`;  // 'main-1', 'main-2'
```
- ✅ Human-readable
- ✅ Unique
- ⚠️ Counter resets on app restart (might cause issues?)

**Recommendation**: Option B (Semantic IDs) with careful uniqueness management

**Decision**: [ ] A - UUID  [ ] B - Semantic  [ ] C - Combination

**How to pass editorId to backend?**
- [ ] Include in every IPC call (e.g., `updateNote({ editorId, ... })`)
- [ ] Store in session state (backend tracks which editor is "active")
- [ ] Only use for event publishing (renderer-side only)

---

### 8. Migration Timing Strategy 🔄

**Question**: Should we migrate all users at once or gradual rollout?

**Options**:

**A) Feature Flag - Gradual Rollout**
```typescript
const USE_DB_FIRST = config.get('features.dbFirst.enabled', false);

if (USE_DB_FIRST) {
  // New code path
} else {
  // Old code path
}
```
- ✅ Can enable for internal users first
- ✅ Easy rollback if issues found
- ✅ A/B testing possible
- ❌ Maintain two code paths during transition
- ❌ More complexity

**B) All Users, Single Release**
- Deploy to everyone at once
- ✅ Simpler codebase
- ✅ Faster to ship
- ❌ Higher risk if bugs exist
- ❌ No easy rollback without reverting release

**C) Phased by Platform**
- Week 1: macOS only
- Week 2: Windows
- Week 3: Linux
- ⚠️ Platform-specific bugs might not manifest
- 🔧 Complex release process

**Recommendation**: Option A (Feature Flag) for first 2-3 weeks, then remove flag

**Decision**: [ ] A - Feature Flag  [ ] B - All at once  [ ] C - Phased by platform

**If using feature flag**:
- Default state: [ ] Enabled  [ ] Disabled
- Internal testing duration: [ ] 1 week  [ ] 2 weeks  [ ] 4 weeks
- Rollout plan: [ ] 10% → 50% → 100%  [ ] Internal → Beta → All

---

## Performance Targets (Needed Before Testing Phase)

### 9. Database Write Performance

**Question**: What are acceptable latency targets for DB writes?

**Current PRD Targets**:
- p50: < 1ms
- p95: < 5ms
- p99: < 10ms

**Questions**:
- Are these targets realistic? (Need benchmarking)
- What happens if we miss targets?
  - [ ] Block until performance improved
  - [ ] Ship anyway with warning
  - [ ] Add performance degradation handling

**Should we add**:
- Telemetry to track actual performance in production?
  - [ ] Yes, track all writes
  - [ ] Yes, sample 1% of writes
  - [ ] No, only during beta

**Decision**: Confirm targets after benchmarking in Phase 1

---

### 10. File Write Batching Goals

**Question**: What level of I/O reduction are we targeting?

**Current PRD Target**: 50%+ reduction in file writes during rapid editing

**Measurement Scenario**: User types continuously for 60 seconds

**Current Behavior**: ~120 file writes (500ms autosave debounce)

**Proposed Behavior with 1000ms queue**: ~60 file writes (50% reduction)

**Is this enough?**
- [ ] Yes, 50% is good target
- [ ] No, aim for 75% reduction (2000ms delay)
- [ ] No, aim for 90% reduction (5000ms delay)
- [ ] Need to benchmark first

**Decision**: _____________

---

## User Experience Questions

### 11. Notification Design 🎨

**Question**: How should we notify users about note updates?

**Scenarios Needing Notification**:
1. Agent updated note (no conflict)
2. Agent updated note (conflict - user has unsaved changes)
3. External edit (no conflict, auto-reloaded)
4. File write failed

**Design Constraints**:
- Don't block/interrupt typing
- Clear who/what made the change
- Actionable (user can respond)

**Notification Types**:

**A) Toast Notifications (Temporary)**
```
┌──────────────────────────────────────┐
│ 🤖 Agent updated "Meeting Notes"     │
│                                      │
│ [View Changes] [Dismiss]             │
└──────────────────────────────────────┘
```
- Duration: [ ] 3 seconds  [ ] 5 seconds  [ ] 10 seconds  [ ] Until dismissed

**B) Inline Banner (Persistent)**
```
┌──────────────────────────────────────┐
│ Note Editor                          │
├──────────────────────────────────────┤
│ ℹ️ This note was updated by agent    │  ← Banner at top
│    [Reload] [Dismiss]                │
├──────────────────────────────────────┤
│ Note content here...                 │
```

**C) Status Bar Indicator**
```
Bottom right:
[🤖 Updated] ← Clickable for details
```

**Recommendation**:
- Scenario 1 (agent, no conflict): Toast (5s) or Status Bar
- Scenario 2 (agent, conflict): Modal Dialog (blocking)
- Scenario 3 (external, auto-reload): Toast (3s)
- Scenario 4 (write failed): Toast (persistent) + Status Bar

**Decision**:
- Agent update (no conflict): [ ] Toast  [ ] Banner  [ ] Status  [ ] None
- Agent update (conflict): [ ] Modal  [ ] Banner  [ ] Skip (handled in Q2)
- External auto-reload: [ ] Toast  [ ] Banner  [ ] Status  [ ] None
- File write failed: [ ] Toast  [ ] Banner  [ ] Status  [ ] Modal

**Toast duration for non-blocking notifications**: [ ] 3s  [ ] 5s  [ ] 10s  [ ] Custom: ___s

---

### 12. User Settings and Preferences ⚙️

**Question**: What should be user-configurable vs. fixed?

**Potentially Configurable Settings**:

| Setting | Fixed | Configurable | Notes |
|---------|-------|--------------|-------|
| File write queue delay | | | Default: 1000ms, Range: 100ms-5000ms |
| Auto-reload external edits | | | Default: Yes, Option: Show dialog |
| Agent update behavior | | | Default: Auto-reload, Option: Always ask |
| Cursor preservation | | | Default: Yes, Option: Jump to changes |
| Notification style | | | Default: Toast, Options: Banner/Status/None |
| Sync on note switch | | | Default: Yes |
| Sync errors visibility | | | Default: Toast + Log, Option: Silent |

**Recommendation**: Start with all fixed, add top 3 requested settings after launch

**Settings to include in MVP**:
- [ ] File write queue delay
- [ ] Auto-reload external edits
- [ ] Agent update behavior
- [ ] None (keep simple for v1)

**Decision**: Start with [ ] 0 settings  [ ] 3 settings  [ ] All settings

---

## Testing Strategy Questions

### 13. Beta Testing Scope 🧪

**Question**: Who should beta test and for how long?

**Options**:

**A) Internal Team Only (1-2 weeks)**
- Developers + PMs use it daily
- ✅ Fast feedback cycle
- ❌ Limited diverse workflows
- ❌ May miss edge cases

**B) Power Users (2-3 weeks)**
- Invite 10-20 active users from community
- ✅ Real-world usage patterns
- ✅ Diverse workflows (note-taking, coding, research)
- ⚠️ Need beta program infrastructure

**C) Open Beta (4+ weeks)**
- Anyone can opt-in via settings flag
- ✅ Maximum coverage
- ❌ More support burden
- ❌ Reputation risk if major bugs

**Recommendation**: A (internal) → B (power users) → C (open beta opt-in)

**Decision**: [ ] A only  [ ] A + B  [ ] A + B + C

**Minimum beta duration before general release**: [ ] 1 week  [ ] 2 weeks  [ ] 4 weeks

**Beta exit criteria** (all must be true):
- [ ] Zero P0 bugs (data loss, crashes)
- [ ] < 5 P1 bugs (major functionality broken)
- [ ] Positive feedback from >80% of beta users
- [ ] Performance targets met (DB writes, I/O reduction)
- [ ] Other: _________________

---

### 14. Rollback Strategy 🔙

**Question**: What triggers a rollback and how fast can we execute?

**Rollback Triggers** (any one triggers rollback):
- [ ] Data loss reported (P0)
- [ ] Widespread crashes (>5% of users affected)
- [ ] Database corruption
- [ ] Performance regression (>50% slower)
- [ ] Critical security issue
- [ ] >20% of users disable feature via flag

**Rollback Mechanism**:
- [ ] Feature flag flip (instant, if using feature flag)
- [ ] Hotfix release (4-8 hours)
- [ ] Full revert release (next day)

**Rollback Testing**:
- [ ] Test rollback procedure before launch
- [ ] Document rollback runbook
- [ ] Designate on-call person for rollback decision

**Decision**: Rollback triggers: ____________, Mechanism: ____________

---

## Scope and Prioritization

### 15. MVP Scope Definition 📦

**Question**: Which features are essential for MVP vs. nice-to-have?

**Feature Classification**:

| Feature | Essential (MVP) | Nice-to-Have | Future Version |
|---------|-----------------|--------------|----------------|
| FileWriteQueue (Phase 1) | ✅ | | |
| DB-first writes (Phase 2) | ✅ | | |
| Remove expected writes (Phase 3) | ✅ | | |
| Simplify file watcher (Phase 4) | ✅ | | |
| Auto-reload external edits (Phase 5) | | | |
| Agent update sync (Phase 6) | | | |
| Conflict notification UI | | | |
| User preferences/settings | | | |
| Optimistic merge (Strategy 3) | | | |
| Diff-based cursor positioning | | | |
| "Sync Now" command | | | |
| Sync error UI panel | | | |

**Questions**:
1. Is Phase 6 (Agent Updates) essential or can it ship separately?
   - [ ] Essential - blocks MVP release
   - [ ] Important - include if time allows
   - [ ] Separate - ship as v2 feature

2. Is auto-reload (Phase 5) essential or can we keep current dialog?
   - [ ] Essential - major UX improvement
   - [ ] Nice-to-have - can ship without
   - [ ] Risky - defer to v2

**Minimum viable release** (check all required):
- [ ] Phases 1-4 only (eliminate false positives, simplify code)
- [ ] Phases 1-4 + Phase 5 (add auto-reload UX)
- [ ] Phases 1-6 (complete solution including agent sync)

**Decision**: MVP includes phases _____ through _____

---

### 16. Timeline Flexibility 📅

**Question**: Is 6-week timeline fixed or flexible?

**Current Plan**: 6 sprints (1 week each)

**Risk Scenarios**:
- What if Phase 1-2 takes longer than expected?
  - [ ] Extend timeline
  - [ ] Cut Phase 5 or 6
  - [ ] Add more developers

- What if critical bug found in beta (Sprint 6)?
  - [ ] Extend beta period
  - [ ] Ship with known issues (if non-critical)
  - [ ] Delay release indefinitely

**Flexibility Questions**:
- Hard deadline? [ ] Yes: ______  [ ] No, ship when ready
- Buffer time included? [ ] Yes: ___ days  [ ] No
- Approval needed to extend timeline? [ ] Yes, from: _______  [ ] No

**Decision**: Timeline is [ ] Fixed  [ ] Flexible  [ ] Fixed with 1-week buffer

---

## Documentation and Communication

### 17. User Communication Plan 📢

**Question**: How do we communicate changes to users?

**Channels**:
- [ ] Release notes (in-app)
- [ ] Blog post
- [ ] Email to users
- [ ] Discord/Community announcement
- [ ] Migration guide
- [ ] Video demo

**Key Messages to Communicate**:
1. What's changing? (DB-first, auto-reload, agent sync)
2. Why it's better? (fewer dialogs, faster, more reliable)
3. Any action required? (probably none)
4. How to report issues? (GitHub, Discord, email)

**Communication Timing**:
- [ ] Announce before beta (transparency)
- [ ] Announce with beta release (opt-in messaging)
- [ ] Announce with general release only

**Decision**: Channels: _______, Timing: _______

---

### 18. Developer Documentation 📚

**Question**: What developer docs need updating?

**Documents to Update**:
- [ ] `docs/ARCHITECTURE.md` - Add DB-first section
- [ ] `docs/architecture/EXTERNAL-EDIT-HANDLING.md` - Rewrite completely
- [ ] Create new: `docs/architecture/FILE-WRITE-QUEUE.md`
- [ ] `docs/DESIGN.md` - Update data flow diagrams
- [ ] `README.md` - Update architecture overview
- [ ] Inline code comments - Document new classes
- [ ] API documentation - Update if API changes

**When to update**:
- [ ] Before implementation (prevents confusion)
- [ ] During implementation (keeps docs in sync)
- [ ] After implementation (cleanup)

**Decision**: Update docs _______ (before/during/after)

---

## Summary: Priority Matrix

### Must Answer Before Starting (Sprint 1)

High Priority (Blocks Start):
1. **Q1: File write queue delay** → Affects implementation
2. **Q2: Agent conflict behavior** → Affects UX design
3. **Q15: MVP scope** → Determines what we build

Medium Priority (Needed Soon):
4. **Q8: Migration strategy** → Affects how we ship
5. **Q11: Notification design** → Needs design time

### Can Decide During Implementation

Low Priority (Can Wait):
6. **Q5: Additional flush triggers** → Can add incrementally
7. **Q12: User settings** → Can add post-launch
8. **Q14: Rollback strategy** → Define before beta

### Nice to Clarify But Not Blocking

9. **Q17-18: Communication plan** → Important but not technical blocker
10. **Q9-10: Performance targets** → Will benchmark to determine

---

## Decision Log Template

**Use this to record decisions:**

```markdown
## Decision: [Question Number and Title]

**Date**: YYYY-MM-DD
**Decided By**: [Name/Team]
**Decision**: [Chosen option]

**Rationale**:
[Why this option was chosen]

**Alternatives Considered**:
[What else was discussed]

**Risks**:
[Any concerns or risks with this decision]

**Validation Plan**:
[How we'll verify this was the right choice]
```

---

**Next Steps**:
1. Schedule stakeholder meeting to review these questions
2. Prioritize which decisions must be made before Sprint 1
3. Assign DRIs (Directly Responsible Individuals) for each decision
4. Set deadline for all critical decisions (recommend: before PRD approval)
5. Document decisions in this file or separate decision log
