# Implementation Decisions: Database as Source of Truth

**Status**: Approved
**Date**: 2025-11-01
**Decided By**: Project Team
**Related Documents**:
- PRD: `docs/PRD-DATABASE-SOURCE-OF-TRUTH.md`
- Questions: `docs/PRD-DATABASE-SOURCE-OF-TRUTH-QUESTIONS.md`

---

## Executive Summary

All critical decisions for database-first architecture implementation have been made. We are approved to proceed with implementation starting Sprint 1.

**Key Decisions**:
- ✅ All-at-once deployment (no feature flags)
- ✅ 6-week timeline with all 6 phases
- ✅ 1000ms file write queue delay
- ✅ Conflict dialogs for agent updates
- ✅ Simple v1 (no user settings initially)

---

## Critical Decisions (Sprint 1 Blockers)

### Decision 1: File Write Queue Delay ⏱️

**Question**: What should the default file write queue delay be?

**Decision**: ✅ **1000ms**

**Rationale**:
- Balanced approach between durability and batching
- External tools see updates within ~1 second (acceptable)
- Significant I/O reduction during rapid typing (~50%)
- Can make configurable later if needed

**Alternatives Considered**:
- 500ms: Too little batching benefit
- 1500ms: External tool lag becomes noticeable
- 2000ms: May feel sluggish to users with external workflows

**Configuration**:
- Fixed at 1000ms for v1
- May add user preference in v2 if requested

**Validation**:
- Monitor file I/O metrics during beta
- User feedback on external editor latency
- Adjust if >20% of users report issues

---

### Decision 2: Agent Update Conflict Behavior 🤖

**Question**: When agent updates a note while user has unsaved changes, what should happen?

**Decision**: ✅ **Option A - Show Conflict Dialog**

**Behavior**:
```
┌─────────────────────────────────────────┐
│  Agent Updated This Note                │
│                                         │
│  This note was modified by the agent    │
│  while you have unsaved changes.        │
│                                         │
│  Your changes will be overwritten if    │
│  you reload the note.                   │
│                                         │
│  [View Agent Changes] [Keep Editing]    │
└─────────────────────────────────────────┘
```

**Rationale**:
- Safe: No risk of data loss
- Clear: User understands what happened
- Actionable: User can make informed choice
- Simple to implement correctly
- Matches user expectations (similar to merge conflicts)

**Alternatives Considered**:
- Silent notification: Too risky for data loss
- Auto-merge: Too complex for v1 (defer to v2)
- Queue updates: Complex state management

**Edge Cases**:
- If user has been typing for >30 seconds → Show dialog
- If user made trivial change (e.g., added single space) → Still show dialog (err on safe side)
- If agent changes different section → v1 still shows dialog, v2 could auto-merge

**Future Enhancement**:
- v2: Implement auto-merge for non-overlapping edits
- v2: Show diff visualization in dialog

---

### Decision 3: MVP Scope Definition 📦

**Question**: Which phases are essential for v1 release?

**Decision**: ✅ **All 6 Phases (Complete Solution)**

**Included in v1**:
- ✅ Phase 1: File Write Queue
- ✅ Phase 2: Reverse DB/File Order
- ✅ Phase 3: Remove Expected Write Tracking
- ✅ Phase 4: Simplify File Watcher
- ✅ Phase 5: Enhanced External Edit UX
- ✅ Phase 6: Agent Update Synchronization

**Rationale**:
- Phase 6 fixes critical bug (agent updates not visible)
- Phase 5 provides significant UX improvement
- All phases are well-scoped and achievable in 6 weeks
- Shipping incomplete solution would require v2 soon anyway
- Better to ship complete, tested solution once

**Timeline Impact**:
- 6 weeks total (Sprint 1-6)
- Acceptable timeline for value delivered

**Release Criteria** (all must pass):
- Zero P0 bugs (data loss, crashes)
- Zero false positive external edit dialogs in testing
- 100% of agent updates visible in open editors
- Performance targets met (DB <5ms p95, 50% I/O reduction)
- Positive feedback from beta testers

---

## Important Decisions (Early Implementation)

### Decision 4: Migration Strategy 🔄

**Question**: Should we migrate all users at once or gradual rollout?

**Decision**: ✅ **Option B - All Users, Single Release**

**Approach**:
- Deploy to all users simultaneously in single release
- No feature flags or A/B testing
- Internal beta testing (1 week) + power user beta (2 weeks) before general release
- Clear communication about changes in release notes

**Rationale**:
- Simpler codebase: No dual code paths to maintain
- Faster to ship: No gradual rollout complexity
- Confidence from thorough beta testing: 3 weeks total beta period
- Clean cut: Everyone on same version immediately
- Easier to debug: No "which version is user on?" questions

**Risk Mitigation**:
- Comprehensive testing: Unit, integration, manual QA
- 3-week beta period with real users
- Detailed rollback plan (see Decision 14)
- Clear user communication
- Fast hotfix process if needed (4-hour SLA)

**Rollback Plan**:
- If critical issues found: Revert entire release
- Hotfix window: 4-8 hours
- On-call rotation for first week post-release
- Automated alerts for error spikes

---

### Decision 5: Notification Design 🎨

**Question**: How should we notify users about note updates?

**Decision**: ✅ **Toast for Non-Blocking, Modal for Conflicts**

**Notification Strategy**:

| Scenario | Notification Type | Duration | Example |
|----------|------------------|----------|---------|
| Agent update (no conflict) | Toast | 5 seconds | "🤖 Agent updated 'Meeting Notes'" |
| Agent update (conflict) | Modal Dialog | Until dismissed | "Agent Updated This Note" (see Q2) |
| External edit (auto-reload) | Toast | 3 seconds | "Note reloaded (modified externally)" |
| File write failed | Toast (persistent) | Until dismissed | "⚠️ Failed to sync note to disk" |

**Toast Design**:
```
┌──────────────────────────────────────┐
│ 🤖 Agent updated "Meeting Notes"     │
│ [View] [Dismiss]                     │
└──────────────────────────────────────┘
Position: Bottom-right corner
Animation: Slide in, fade out
```

**Rationale**:
- Non-blocking: Doesn't interrupt user flow
- Informative: User knows what happened
- Actionable: Can click to see changes
- Familiar: Matches common toast patterns
- Temporary: Auto-dismisses to avoid clutter

**User Actions**:
- Click toast → Opens note (if different note) or shows changes
- Dismiss → Hides notification
- Ignore → Auto-dismisses after timeout

---

### Decision 6: File Write Failure Handling

**Question**: When file write fails after retries, what should we do?

**Decision**: ✅ **Status Bar + Error Log + Toast on First Failure**

**Behavior**:

**First Failure**:
```
┌──────────────────────────────────────┐
│ ⚠️ Failed to sync note to disk        │
│ "Meeting Notes 2025-11-01"           │
│                                      │
│ [Retry Now] [View Log] [Dismiss]     │
└──────────────────────────────────────┘
Duration: Persistent (until user dismisses)
```

**Subsequent Failures**:
```
Bottom-right status bar:
[⚠️ 3 notes pending sync] ← Clickable
```

**Error Log**:
- Settings → Advanced → Sync Errors
- Shows: Note name, timestamp, error message, retry count
- Action: Manual retry button per note

**Retry Strategy**:
- 3 retries with exponential backoff: 100ms, 500ms, 1000ms
- If all retries fail → Show notification + status bar
- Manual retry available from notification or error log

**Rationale**:
- First failure: User needs to know immediately (may need to free disk space)
- Multiple failures: Status bar less intrusive than multiple toasts
- Error log: Historical view for debugging
- Manual retry: User can retry after fixing issue (e.g., reconnecting network drive)

---

### Decision 7: File Write Flush Triggers

**Question**: Besides timeout and app close, when should we flush pending file writes?

**Decision**: ✅ **Note Switch + Explicit Command + System Suspend**

**Flush Triggers**:

| Trigger | Rationale |
|---------|-----------|
| Timeout (1000ms) | Default batching mechanism |
| App close | Prevent data loss on shutdown |
| Note switch | Ensures previous note saved before loading next |
| Explicit "Sync Now" command | User control for paranoia/"just to be sure" |
| System suspend/sleep | Prevent data loss on crash during sleep |

**Implementation**:

**Note Switch**:
```typescript
async setActiveNote(noteId: string) {
  // Flush previous note before switching
  if (this.previousNoteId) {
    await fileWriteQueue.flushWrite(this.previousNoteId);
  }
  // Load new note
  this.currentNote = await loadNote(noteId);
}
```

**Explicit Command**:
```
Command Palette:
"Flint: Sync All Notes to Disk"

Keyboard: Cmd/Ctrl+Shift+S (or configurable)
```

**System Suspend**:
```typescript
// Electron API
app.on('before-quit', async () => {
  await fileWriteQueue.flushAll();
});

// Power monitor (suspend/hibernate)
powerMonitor.on('suspend', async () => {
  await fileWriteQueue.flushAll();
});
```

**Not Included** (deferred):
- Vault switch: Rare operation, timeout will handle
- Git operation: Too complex to detect reliably

---

### Decision 8: User Settings and Preferences

**Question**: What should be user-configurable vs. fixed?

**Decision**: ✅ **No User Settings in v1 - Keep Simple**

**Rationale**:
- Simplicity: Easier to implement, test, and support
- Confidence: Chosen defaults work for most users
- Focus: Ship core functionality first
- Feedback-driven: Add settings based on user requests in v2

**Fixed Values in v1**:
- File write delay: 1000ms
- Auto-reload external edits: Yes (with notification)
- Agent update behavior: Show dialog on conflict
- Notification style: Toast
- Retry count: 3 attempts

**Settings to Consider for v2** (based on user feedback):
- File write delay (if users want faster/slower sync)
- Auto-reload behavior (if some users prefer dialogs)
- Notification preferences (if some users want less/more)

**User Feedback Collection**:
- Survey after 2 weeks of general release
- GitHub issues for feature requests
- Discord channel for informal feedback

---

## Performance and Quality

### Decision 9: Performance Targets

**Question**: What are acceptable latency targets?

**Decision**: ✅ **Validate Targets After Phase 1 Benchmarking**

**Proposed Targets** (from PRD):
- DB write latency: p50 <1ms, p95 <5ms, p99 <10ms
- File write batching: 50%+ reduction during rapid editing
- IPC latency: No regression (maintain <1ms)

**Validation Plan**:
- Phase 1: Implement FileWriteQueue
- Sprint 2: Run benchmarks on various hardware (Mac, Windows, Linux)
- Sprint 2: Measure actual DB write performance
- Sprint 2: Adjust targets if needed based on real data

**If Targets Not Met**:
- Investigate optimization opportunities
- Consider relaxing targets if UX is still good
- Don't block release for marginal misses (e.g., p95 = 6ms vs 5ms)

**Telemetry** (added in Phase 1):
- Track DB write latency (p50, p95, p99)
- Track file write batching ratio
- Track queue depth (how many pending writes)
- Anonymous aggregated data only

---

### Decision 10: Beta Testing Scope

**Question**: Who should beta test and for how long?

**Decision**: ✅ **Internal (1 week) → Power Users (2 weeks) → General Release**

**Beta Timeline**:

**Week 1: Internal Beta**
- Audience: Dev team + PMs (5-10 people)
- Duration: 1 week
- Focus: Find critical bugs, validate core functionality
- Success criteria: No P0 bugs, basic workflows work

**Week 2-3: Power User Beta**
- Audience: 10-20 active community members
- Duration: 2 weeks
- Focus: Real-world usage patterns, edge cases
- Success criteria: Positive feedback from >80%, <5 P1 bugs

**Week 4: General Release**
- Audience: All users
- Communication: Release notes, blog post, Discord announcement

**Beta Recruitment**:
- Internal: All hands announcement
- Power users: Invite via Discord, email to active contributors
- Opt-in mechanism: Settings flag or early access program

**Feedback Collection**:
- Daily check-ins with internal team
- Weekly survey for power users
- Dedicated Discord channel for beta feedback
- GitHub issues for bug reports

**Exit Criteria** (all must be true):
- ✅ Zero P0 bugs (data loss, crashes)
- ✅ <5 P1 bugs (major functionality broken)
- ✅ Positive feedback from >80% of beta users
- ✅ Performance targets met
- ✅ No regressions in core workflows

---

## Deferred Decisions (Can Be Made During Implementation)

### Decision 11: Cursor Position After Agent Update

**Question**: Where should cursor go after agent reload?

**Decision**: 🔄 **Defer to Implementation Phase**

**Initial Implementation**: Preserve cursor position (best effort)

**Fallback**: If preservation fails, move to start of file

**Future Enhancement**: Jump to changed region (requires diffing)

**Validation**: User feedback during beta

---

### Decision 12: Event Source Tagging Implementation

**Question**: How to track which editor instance made a change?

**Decision**: 🔄 **Defer to Phase 6 Implementation**

**Likely Approach**: Semantic IDs (`main-editor`, `sidebar-0`)

**Will finalize during Phase 6 based on actual multi-editor implementation**

---

## Documentation and Communication

### Decision 13: Developer Documentation

**Question**: When to update docs?

**Decision**: ✅ **Update During Implementation (Per Phase)**

**Schedule**:
- Phase 1: Add FileWriteQueue docs
- Phase 2: Update data flow diagrams
- Phase 4: Rewrite EXTERNAL-EDIT-HANDLING.md
- Phase 6: Add agent sync documentation
- Sprint 5: Final polish and review

**Documents to Update**:
- ✅ `docs/ARCHITECTURE.md`
- ✅ `docs/architecture/EXTERNAL-EDIT-HANDLING.md` (rewrite)
- ✅ `docs/architecture/FILE-WRITE-QUEUE.md` (new)
- ✅ Inline code comments
- ✅ Release notes

---

### Decision 14: User Communication Plan

**Question**: How do we communicate changes to users?

**Decision**: ✅ **Multi-Channel Communication Before General Release**

**Communication Channels**:

**Before Beta**:
- Blog post: "What's Coming: Improved Note Synchronization"
- Discord announcement
- Design document shared publicly (this PRD)

**With Beta Release**:
- Blog post: "Join the Beta: Database-First Architecture"
- Email to active users (opt-in invitation)
- Discord beta channel created

**With General Release**:
- Release notes (in-app)
- Blog post: "Faster, More Reliable Note Sync is Here"
- Email to all users
- Discord announcement
- Twitter/social media

**Key Messages**:
1. What's changing: Database-first, auto-reload, agent sync
2. Why it's better: Fewer dialogs, faster, agent updates visible
3. Any action required: None (seamless upgrade)
4. How to report issues: GitHub, Discord, email support

**Migration Guide**: Not needed (no user action required)

---

## Rollback and Risk Management

### Decision 15: Rollback Strategy

**Question**: What triggers rollback and how fast can we execute?

**Decision**: ✅ **Fast Revert on Critical Issues**

**Rollback Triggers** (any one triggers immediate rollback):
- Data loss reported (P0)
- Widespread crashes (>5% of users)
- Database corruption
- Performance regression (>100% slower - 2x degradation)
- Critical security issue

**Rollback Mechanism**:
- Emergency hotfix release (target: 4-8 hours)
- Revert to previous release entirely
- Communication: Immediate notification to affected users

**Rollback Procedure**:
1. On-call engineer detects issue (monitoring alerts)
2. Notify engineering lead + PM
3. Decision made within 30 minutes
4. Revert PR created and reviewed (1 hour)
5. Emergency release build (1-2 hours)
6. Deploy and monitor (1 hour)
7. Post-mortem within 24 hours

**Rollback Testing**:
- Test rollback procedure in staging before launch
- Document runbook (step-by-step instructions)
- On-call rotation for first week post-release
- 24/7 monitoring for first 48 hours

---

## Implementation Readiness Checklist

### Sprint 1 Prerequisites ✅

- [x] Critical decisions made (Q1-3)
- [x] Important decisions made (Q4-8)
- [x] PRD approved and documented
- [x] Questions document created
- [x] Decisions document created (this file)
- [x] Team aligned on scope and timeline

### Ready to Start ✅

**We are GO for implementation!**

**Sprint 1 begins**: Immediately
**Target completion**: 6 weeks from start
**Next milestone**: Phase 1 complete + benchmarking (end of Sprint 2)

---

## Decision Authority

**Decisions Made By**: Project Team
**Approved By**: Engineering Lead + PM

**Change Process**:
- Minor changes: Engineering lead approval
- Major changes: Full team review + approval
- Critical changes: Stakeholder sign-off

**Review Cadence**:
- Weekly check-in on progress
- Bi-weekly decision review
- Ad-hoc for urgent decisions

---

## Appendix: Quick Reference

### Critical Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| File write delay | 1000ms | Balanced durability/batching |
| Retry attempts | 3 | Standard pattern, sufficient |
| Retry backoff | 100ms, 500ms, 1s | Exponential, quick recovery |
| Toast duration (info) | 5 seconds | Readable, not annoying |
| Toast duration (warning) | 3 seconds | Quick acknowledgment |
| Beta duration | 3 weeks | 1 internal + 2 power users |
| MVP scope | All 6 phases | Complete solution |
| User settings in v1 | 0 | Keep simple |

### Timeline Summary

| Sprint | Duration | Phases | Deliverables |
|--------|----------|--------|--------------|
| 1 | Week 1 | Foundation | Infrastructure, telemetry |
| 2 | Week 2 | 1-2 | FileWriteQueue, DB-first |
| 3 | Week 3 | 3-4 | Remove tracking, simplify watcher |
| 4 | Week 4 | 5-6 | External UX, agent sync |
| 5 | Week 5 | Testing | Integration tests, polish |
| 6 | Week 6 | Beta | Internal → Power users → Release |

**Total**: 6 weeks to general availability

---

**Status**: ✅ **Approved - Ready for Implementation**

**Next Steps**:
1. ✅ Kick off Sprint 1
2. Set up project tracking (GitHub project board)
3. Create implementation tasks for Phase 1
4. Begin infrastructure work (telemetry, benchmarking)
5. Schedule weekly sync meetings

---

*Document Version: 1.0*
*Last Updated: 2025-11-01*
*Next Review: After Phase 2 (Sprint 2)*
