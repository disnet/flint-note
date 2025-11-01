# Implementation Kickoff: Database as Source of Truth

**Status**: ✅ **APPROVED - Ready to Begin**
**Start Date**: 2025-11-01
**Target Completion**: 6 weeks from start
**Team**: Engineering + Product

---

## 🎯 Mission

Transform Flint UI note synchronization from file-first to database-first architecture, eliminating false positive conflict dialogs and enabling seamless agent-editor synchronization.

---

## 📋 What We're Building

### The Problem
1. **False positive "external edit" dialogs** interrupt users while typing
2. **Agent updates don't appear in open editors** (critical bug)
3. **Complex external edit detection** with 3 tracking systems and race conditions

### The Solution
**Database as Primary Source of Truth**
- User edits → Database immediately (~1ms)
- File writes → Queued and batched (1s delay)
- Agent updates → Trigger smart editor reloads
- External edits → Auto-reload when safe

### Expected Impact
- ✅ Zero false positive conflict dialogs
- ✅ 100% agent updates visible in open editors
- ✅ 25% code reduction in sync logic
- ✅ 50% reduction in disk I/O during rapid editing
- ✅ Better user experience (faster, more reliable)

---

## 🗂️ Documentation

**Core Documents**:
1. **PRD**: `docs/PRD-DATABASE-SOURCE-OF-TRUTH.md` (main spec)
2. **Questions**: `docs/PRD-DATABASE-SOURCE-OF-TRUTH-QUESTIONS.md` (decision guide)
3. **Decisions**: `docs/PRD-DATABASE-SOURCE-OF-TRUTH-DECISIONS.md` (approved choices)
4. **This Document**: Implementation kickoff summary

**Read First**: PRD Executive Summary + Decisions Document

---

## ⚙️ Key Decisions Made

### Technical
- **File write delay**: 1000ms (configurable later)
- **Migration**: All users at once (no feature flags)
- **Retry strategy**: 3 attempts with exponential backoff
- **Flush triggers**: Timeout + app close + note switch + explicit command

### UX
- **Agent conflicts**: Show dialog (safe, clear)
- **External edits**: Auto-reload with notification
- **Notifications**: Toast (5s) for info, Modal for conflicts
- **User settings**: None in v1 (keep simple)

### Quality
- **Performance targets**: DB <5ms p95, 50% I/O reduction
- **Beta plan**: 1 week internal + 2 weeks power users
- **Rollback**: 4-8 hour emergency revert if needed

---

## 🗓️ 6-Week Timeline

### Sprint 1 (Week 1): Foundation
**Goal**: Set up infrastructure and telemetry

**Tasks**:
- [ ] Set up project tracking (GitHub project board)
- [ ] Add performance telemetry hooks
- [ ] Create benchmarking framework
- [ ] Set up test fixtures for all 6 phases
- [ ] Document rollback procedure

**Deliverables**:
- Infrastructure ready
- Benchmarking tools available
- Team aligned on implementation approach

---

### Sprint 2 (Week 2): Phase 1 + 2
**Goal**: Implement FileWriteQueue and reverse DB/File order

**Phase 1: FileWriteQueue**
- [ ] Create `FileWriteQueue` class in `notes.ts`
- [ ] Implement queue with 1000ms default delay
- [ ] Add flush methods (single file, all files)
- [ ] Integrate with `NoteManager.updateNote()`
- [ ] Add retry logic (3 attempts)
- [ ] Hook app shutdown to flush queue
- [ ] Unit tests for queue behavior

**Phase 2: DB-First**
- [ ] Reverse order: DB before file in `updateNote()`
- [ ] Update `updateSearchIndex()` to run first
- [ ] Benchmark DB write performance
- [ ] Validate performance targets (p95 <5ms)
- [ ] Integration tests for DB-first flow

**Exit Criteria**:
- ✅ All existing tests pass
- ✅ FileWriteQueue working correctly
- ✅ DB writes complete before file writes
- ✅ Performance targets met

---

### Sprint 3 (Week 3): Phase 3 + 4
**Goal**: Simplify external edit detection

**Phase 3: Remove Expected Write Tracking**
- [ ] Remove `expectWrite()` calls from `NoteDocument.save()`
- [ ] Remove `openNotes` Set from `VaultFileWatcher`
- [ ] Remove `expectedWrites` Map from `VaultFileWatcher`
- [ ] Remove IPC handlers: `note:opened`, `note:closed`, `note:expect-write`
- [ ] Remove preload API bindings
- [ ] Update tests (remove hash matching tests)
- [ ] Verify no broken references

**Phase 4: Simplify File Watcher**
- [ ] Simplify `isInternalChange()` to only check `ongoingWrites`
- [ ] Remove conflict detection logic from watcher
- [ ] Move conflict detection to `handleFileWatcherEvent()`
- [ ] Update related tests
- [ ] Code review and cleanup

**Exit Criteria**:
- ✅ External edits still detected correctly
- ✅ No false positives during internal writes
- ✅ ~238 lines of code removed
- ✅ Simplified logic is easier to understand

---

### Sprint 4 (Week 4): Phase 5 + 6
**Goal**: Enhanced UX for external edits and agent updates

**Phase 5: External Edit UX**
- [ ] Update `handleFileWatcherEvent()` to check dirty state
- [ ] Auto-reload editor when no unsaved changes
- [ ] Add toast notification: "Note reloaded (modified externally)"
- [ ] Keep conflict dialog for unsaved changes
- [ ] Test rapid external changes
- [ ] User acceptance testing

**Phase 6: Agent Update Sync**
- [ ] Add `source` field to `NoteUpdatedEvent` type
- [ ] Update `publishNoteEvent()` in `tool-service.ts` (add `source: 'agent'`)
- [ ] Update `NoteDocument.save()` to publish with `source: 'user'`
- [ ] Add `editorId` tracking to `NoteDocument`
- [ ] Re-enable `note.updated` listener in `noteDocumentRegistry`
- [ ] Implement smart reload logic:
  - Agent update → Reload
  - Self update → Skip
  - Other editor → Reload
- [ ] Add `hasUnsavedChanges` property to `NoteDocument`
- [ ] Create conflict notification component
- [ ] Test agent-editor synchronization
- [ ] Test multi-editor sync (main + sidebar)

**Exit Criteria**:
- ✅ Agent updates appear in open editors immediately
- ✅ No cursor position loss during user typing
- ✅ External edits auto-reload (no unsaved changes)
- ✅ Conflict dialog shown (unsaved changes exist)

---

### Sprint 5 (Week 5): Testing + Polish
**Goal**: Comprehensive testing and documentation

**Testing**:
- [ ] Full integration test suite
- [ ] Agent-editor sync scenarios
- [ ] Multi-editor sync scenarios
- [ ] External edit scenarios (VSCode, Obsidian, etc.)
- [ ] Performance validation
- [ ] Error handling (disk full, permissions, etc.)
- [ ] App crash recovery
- [ ] System suspend/resume

**Documentation**:
- [ ] Update `docs/ARCHITECTURE.md`
- [ ] Rewrite `docs/architecture/EXTERNAL-EDIT-HANDLING.md`
- [ ] Create `docs/architecture/FILE-WRITE-QUEUE.md`
- [ ] Update inline code comments
- [ ] Write release notes (draft)
- [ ] Create migration guide (if needed)

**Polish**:
- [ ] Code review all phases
- [ ] Refactor for clarity
- [ ] Performance optimization
- [ ] User-facing copy review
- [ ] Accessibility check

**Exit Criteria**:
- ✅ All tests passing
- ✅ Performance targets met
- ✅ Documentation complete
- ✅ Code reviewed and approved
- ✅ Ready for beta

---

### Sprint 6 (Week 6): Beta + Launch
**Goal**: Beta testing and general release

**Week 6.1: Internal Beta**
- [ ] Deploy to internal team (5-10 people)
- [ ] Daily check-ins
- [ ] Bug triage and fixes
- [ ] Performance monitoring
- [ ] Exit criteria check

**Week 6.2-6.3: Power User Beta**
- [ ] Invite 10-20 community members
- [ ] Discord beta channel
- [ ] Weekly survey
- [ ] Bug fixes and polish
- [ ] Exit criteria check

**Week 6.4: General Release**
- [ ] Final QA pass
- [ ] Release notes finalized
- [ ] Blog post published
- [ ] Deploy to all users
- [ ] Announcements (Discord, Twitter, email)
- [ ] Monitor for issues (24/7 first 48 hours)

**Exit Criteria (Beta)**:
- ✅ Zero P0 bugs
- ✅ <5 P1 bugs
- ✅ Positive feedback from >80% of beta users
- ✅ Performance targets met
- ✅ No regressions in core workflows

**Exit Criteria (General Release)**:
- ✅ All beta criteria met
- ✅ Release notes approved
- ✅ Rollback plan tested
- ✅ On-call rotation staffed
- ✅ Monitoring alerts configured

---

## 🎯 Success Metrics

### Quantitative
- **Code Complexity**: Reduce file-watcher LOC by 30%+ (768 → <540 lines)
- **Performance**: DB write p95 < 5ms, File I/O reduction 50%+
- **Reliability**: 0 false positive dialogs, 100% agent updates visible
- **Quality**: 0 P0 bugs, <5 P1 bugs in beta

### Qualitative
- **User Feedback**: >80% positive from beta users
- **Developer Experience**: Easier to understand and maintain
- **Support Load**: Fewer issues related to sync conflicts

---

## 🚨 Risk Management

### High-Risk Areas
1. **Data loss on crash** → Mitigation: Flush on app close + suspend
2. **File/DB desync** → Mitigation: Retry logic + error tracking
3. **Performance regression** → Mitigation: Benchmarking + monitoring
4. **Breaking external integrations** → Mitigation: Communication + docs

### Rollback Plan
- **Triggers**: Data loss, crashes >5%, database corruption
- **Process**: Emergency revert within 4-8 hours
- **On-Call**: 24/7 first week, then business hours

---

## 👥 Team and Roles

**Engineering Lead**: [Name]
- Overall architecture decisions
- Code review and approval
- Rollback authority

**Implementation Team**: [Names]
- Phase ownership and execution
- Testing and QA
- Documentation

**Product Manager**: [Name]
- User communication
- Beta program management
- Release coordination

**On-Call Rotation**: [Schedule]
- Week 1 post-release: 24/7
- Week 2-4 post-release: Business hours

---

## 📞 Communication

### Internal
- **Daily standups**: Progress updates (async or sync)
- **Weekly sync**: Blockers, decisions, planning
- **Ad-hoc**: Slack/Discord for urgent questions

### External
- **Beta announcement**: Week 6.1
- **Release announcement**: Week 6.4
- **User support**: GitHub issues + Discord

### Escalation
- **Blockers**: Raise in daily standup or DM engineering lead
- **Critical issues**: Page on-call immediately
- **Scope changes**: Full team review required

---

## 📦 Deliverables Checklist

### Code
- [ ] FileWriteQueue class
- [ ] DB-first updateNote() implementation
- [ ] Simplified VaultFileWatcher
- [ ] Smart note.updated listener
- [ ] Agent update synchronization
- [ ] Conflict notification UI

### Tests
- [ ] Unit tests (all phases)
- [ ] Integration tests (end-to-end flows)
- [ ] Performance benchmarks
- [ ] Manual test scenarios

### Documentation
- [ ] Architecture docs updated
- [ ] External edit handling rewritten
- [ ] File write queue documented
- [ ] Release notes written
- [ ] Migration guide (if needed)

### Operations
- [ ] Telemetry implemented
- [ ] Monitoring configured
- [ ] Rollback procedure tested
- [ ] On-call rotation staffed

---

## 🎬 Next Steps (Immediate)

### Today
1. ✅ Review and approve this kickoff document
2. [ ] Create GitHub project board
3. [ ] Set up Sprint 1 tasks
4. [ ] Schedule weekly sync meeting
5. [ ] Assign phase owners

### This Week (Sprint 1)
1. [ ] Set up telemetry infrastructure
2. [ ] Create benchmarking tools
3. [ ] Document rollback procedure
4. [ ] Begin Phase 1 implementation
5. [ ] First weekly sync (end of week)

### Week 2 (Sprint 2)
1. [ ] Complete Phase 1 (FileWriteQueue)
2. [ ] Complete Phase 2 (DB-first)
3. [ ] Run performance benchmarks
4. [ ] Validate targets met

---

## 📚 Resources

**Documentation**:
- Main PRD: `docs/PRD-DATABASE-SOURCE-OF-TRUTH.md`
- Questions: `docs/PRD-DATABASE-SOURCE-OF-TRUTH-QUESTIONS.md`
- Decisions: `docs/PRD-DATABASE-SOURCE-OF-TRUTH-DECISIONS.md`

**Key Files to Modify**:
- `src/server/core/notes.ts` (FileWriteQueue, updateNote)
- `src/server/core/file-watcher.ts` (simplify)
- `src/renderer/src/stores/noteDocumentRegistry.svelte.ts` (agent sync)
- `src/main/tool-service.ts` (event source tagging)
- `src/main/note-events.ts` (event types)

**References**:
- Current architecture: `docs/architecture/EXTERNAL-EDIT-HANDLING.md`
- Database schema: `src/server/database/schema.ts`
- Search manager: `src/server/database/search-manager.ts`

---

## ✅ Approval Sign-Off

**Engineering Lead**: [ ] Approved - Ready to begin
**Product Manager**: [ ] Approved - Ready to begin
**Team Members**: [ ] Reviewed and ready

**Status**: ✅ **APPROVED - Sprint 1 Begins Now**

---

*Document Version: 1.0*
*Created: 2025-11-01*
*Next Review: End of Sprint 2*

---

## 🚀 Let's Ship This!

**Timeline**: 6 weeks
**Scope**: Complete solution (all 6 phases)
**Goal**: Eliminate false positives + enable agent-editor sync
**Confidence**: High (well-planned, tested approach)

**Team rallying cry**: "Database-first or bust!" 💪

---

**Questions?** Reach out to engineering lead or PM.

**Blockers?** Raise immediately in daily standup.

**Let's build something great!** 🎉
