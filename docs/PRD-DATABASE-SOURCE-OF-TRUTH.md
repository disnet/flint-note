# PRD: Database as Source of Truth Architecture

**Status**: Draft
**Author**: Claude
**Date**: 2025-11-01
**Target Version**: v0.x.0

---

## Executive Summary

This PRD proposes a fundamental architectural change to how Flint UI handles note synchronization between the editor, database, and file system. By making the SQLite database the primary source of truth and deferring file writes to a background queue, we can eliminate the complex external edit detection system that currently causes false positive conflict dialogs.

**Key Benefits:**
- Eliminate false positive "external edit detected" dialogs
- Fix agent updates not appearing in open editors (critical bug)
- Reduce code complexity by ~40% in file watching logic
- Improve search consistency (database always reflects latest edits)
- Enable future features like real-time collaboration

**User Impact:**
- No more spurious conflict dialogs while typing
- Agent modifications immediately visible in editors
- Faster perceived save performance
- More reliable external edit detection
- No breaking changes to user workflows

---

## Problem Statement

### Current Issues

**1. False Positive Conflict Dialogs**
- Users occasionally see "external edit detected" dialogs while typing
- No external edit has occurred - this is a bug in our detection system
- Disrupts user flow and reduces confidence in the application

**2. Complex Race Condition Management**
- Three separate tracking systems: write flags, operation tracking, expected writes
- Content hash matching between editor and file watcher
- Multiple timing windows (1s, 2s, 5s) that can misalign
- Path normalization inconsistencies (absolute vs relative)

**3. Architecture Limitations**
```
Current Flow: Editor → File → DB
Problem: File write triggers file watcher before DB updates
Result: Complex logic to determine "was this our write?"
```

**4. Agent Updates Don't Sync to Editors** ⚠️ **Critical Bug**
- Agents can modify notes via tool calls (`update_note`, `create_note`, etc.)
- These updates go to file + database
- `note.updated` events ARE published
- But `noteDocumentRegistry` has the listener **commented out** to avoid cursor jumps
- Result: Open editors show stale content after agent modifications
- Users don't see their agent's work until they close and reopen the note!

### Root Cause Analysis

The fundamental issue is that we update the file system BEFORE the database:

1. User types in editor
2. After 500ms debounce, content saved to **file**
3. File watcher detects change
4. File watcher uses complex heuristics to determine if change is internal
5. **Then** database gets updated
6. Hash mismatches or timing issues cause false positives

The file watcher is fighting against our own writes because the database (our source of query truth) is out of sync with the filesystem during the write operation.

---

## Current Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CURRENT ARCHITECTURE (File-First)                           │
└─────────────────────────────────────────────────────────────┘

Editor (Renderer Process)
   ↓ (500ms debounce)
   ↓ IPC: updateNote({ content, contentHash })
   ↓
Main Process (notes.ts:updateNote)
   ↓
   ├─→ 1. Read current file
   ├─→ 2. Validate contentHash
   ├─→ 3. Format content + frontmatter
   ├─→ 4. ⚠️  WRITE TO FILE (triggers file watcher)
   │      └─→ File Watcher Event
   │          ├─→ Check: ongoingWrites flag?
   │          ├─→ Check: expected write hash matches?
   │          ├─→ Check: note open in editor?
   │          └─→ Decision: Internal or External?
   │
   └─→ 5. Update database (upsertNote)

Problems:
- File watcher fires before DB is updated
- Complex heuristics to detect "our" writes
- Race conditions in timing windows
- Content hash mismatches cause false positives
```

### Complexity Metrics

**Files Involved in External Edit Detection:**
- `src/server/core/file-watcher.ts` (768 lines)
- `src/server/core/notes.ts` (writeFileWithTracking)
- `src/renderer/src/stores/noteDocumentRegistry.svelte.ts` (expectWrite logic)
- `src/main/index.ts` (IPC handlers for noteOpened/noteClosed/expectWrite)
- `src/preload/index.ts` (IPC bindings)

**State Management:**
- 3 separate tracking mechanisms (write flags, operations, expected writes)
- 5 timeout values (100ms, 200ms, 1000ms, 2000ms, 5000ms)
- Multiple cleanup timers and maps

**Test Coverage Gaps:**
- Limited testing of edge cases
- Difficult to reproduce race conditions
- Hard to test timing-dependent logic

---

## Proposed Solution

### Core Principle

**Make the SQLite database the primary source of truth for note content.**

Files on disk become a "durable storage cache" that is synchronized asynchronously in the background. The database is always current, and file writes are queued and batched.

### New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ PROPOSED ARCHITECTURE (Database-First)                      │
└─────────────────────────────────────────────────────────────┘

Editor (Renderer Process)
   ↓ (500ms debounce - UX only, not perf)
   ↓ IPC: updateNote({ content, contentHash })
   ↓
Main Process (notes.ts:updateNote)
   ↓
   ├─→ 1. Read current content from DB
   ├─→ 2. Validate contentHash (prevent conflicts)
   ├─→ 3. ⚡ UPDATE DATABASE IMMEDIATELY (~1ms)
   │      └─→ Database is now authoritative
   │
   └─→ 4. Queue file write (1-2s debounce)
          ↓
          FileWriteQueue
          ↓ (batch multiple edits)
          ↓ markWriteStarting(path)
          ↓ Write to file system
          ↓ markWriteComplete(path)
          ↓
          File Watcher Event
          ↓
          Simple Check: ongoingWrites.has(path)?
          ├─→ YES: Ignore (internal)
          └─→ NO: External edit!
                  ↓
                  Read file → Update DB → Notify editor

Benefits:
- ✅ Database always current (search works immediately)
- ✅ Simple external edit detection (no hash matching)
- ✅ No race conditions (write flag set BEFORE write)
- ✅ Batched file writes (better performance)
- ✅ No false positives
```

### Key Changes

**1. Reverse Write Order**
```typescript
// OLD: File → DB
await fs.writeFile(path, content);
await db.upsertNote(...);

// NEW: DB → File (queued)
await db.upsertNote(...);
await fileWriteQueue.queue(path, content);
```

**2. Simplified External Edit Detection**
```typescript
// OLD: 3 tracking systems + hash matching
if (ongoingWrites.has(path)) return 'internal';
if (internalOperations.has(path)) return 'internal';
if (openNotes.has(noteId) && expectedWrites.matches(hash)) return 'internal';
return 'external'; // or maybe conflict?

// NEW: Single check
if (ongoingWrites.has(path)) return 'internal';
return 'external';
```

**3. File Write Queue**
```typescript
class FileWriteQueue {
  - Debounces file writes (1-2s)
  - Batches rapid edits to same file
  - Sets write flag before writing
  - Flushes on app close
  - Retries on failure
}
```

---

## Agent Updates and Editor Synchronization

### Current Problem: Agent Updates Don't Reload Editors

**Critical Issue Discovered**: The `noteDocumentRegistry` has a commented-out listener for `note.updated` events (line 247-253 in `noteDocumentRegistry.svelte.ts`). This means **when agents modify notes through tool calls, open editors don't reflect the changes!**

**Why It Was Disabled:**
```typescript
// We don't reload on note.updated because it's typically triggered by
// the document saving itself, which would cause unnecessary reloads
// and cursor position loss.
```

**The Problem:**
- User's edit → `note.updated` event → Editor would reload → Cursor position lost ❌
- So they disabled ALL `note.updated` reloads
- But this also breaks agent updates! 🐛

**Current Behavior:**
1. Agent updates note via `update_note` tool
2. File and database get updated
3. `publishNoteEvent({ type: 'note.updated', noteId, updates })` is called
4. `noteCache` updates the cached metadata ✅
5. **But** `noteDocumentRegistry` ignores the event ❌
6. Editor continues showing stale content!

### Solution: Distinguish Update Sources

The database-first architecture enables a clean solution: we can distinguish between updates from different sources.

#### Strategy 1: Event Source Tagging

**Enhance `note.updated` events with source information:**

```typescript
// In tool-service.ts (agent updates)
publishNoteEvent({
  type: 'note.updated',
  noteId: updates.identifier,
  source: 'agent',  // 🆕 Tag the source
  updates: {
    title: updatedNote.title,
    filename: updatedNote.filename,
    modified: updatedNote.updated,
    content: updatedNote.content  // 🆕 Include content for agent updates
  }
});

// In noteDocument.save() (user edits)
publishNoteEvent({
  type: 'note.updated',
  noteId: this.noteId,
  source: 'self',  // 🆕 This editor caused the update
  editorId: this.currentEditorId,  // 🆕 Which editor
  updates: { /* ... */ }
});
```

**Editor reload logic:**
```typescript
class NoteDocumentRegistryClass {
  constructor() {
    messageBus.subscribe('note.updated', async (event) => {
      const doc = this.documents.get(event.noteId);
      if (!doc) return;

      // Decision tree for reloading
      if (event.source === 'agent') {
        // Agent update - ALWAYS reload (agent is authoritative)
        await doc.reload();
      } else if (event.source === 'self' && event.editorId !== currentEditorId) {
        // Another editor instance updated - reload to sync
        await doc.reload();
      } else if (event.source === 'self' && event.editorId === currentEditorId) {
        // This editor saved - don't reload (already current)
        return;
      } else if (event.source === 'external') {
        // External file edit - already handled by file.external-change
        return;
      }
    });
  }
}
```

#### Strategy 2: Check Dirty State Before Reload

**Alternative approach: reload unless editor has unsaved changes**

```typescript
messageBus.subscribe('note.updated', async (event) => {
  const doc = this.documents.get(event.noteId);
  if (!doc) return;

  // Don't reload if user has unsaved changes (would lose work)
  if (doc.isSaving || doc.hasUnsavedChanges) {
    // Show notification instead
    this.showUpdateNotification(event.noteId, 'Agent updated this note');
    return;
  }

  // Safe to reload - no unsaved work
  await doc.reload();
});
```

#### Strategy 3: Optimistic Merge (Future Enhancement)

**For advanced use cases: merge updates without losing cursor**

```typescript
async handleAgentUpdate(event: NoteUpdatedEvent) {
  const doc = this.documents.get(event.noteId);
  if (!doc) return;

  // If only content changed and user has no edits, just update content
  if (event.updates.content && !doc.hasUnsavedChanges) {
    doc.content = event.updates.content;
    return; // Cursor position preserved!
  }

  // If user has edits, show merge UI
  if (doc.hasUnsavedChanges) {
    this.showMergeDialog(doc, event.updates);
    return;
  }

  // Otherwise full reload
  await doc.reload();
}
```

### Recommended Approach for This PRD

**Use Strategy 1 (Event Source Tagging) with these rules:**

1. **Agent Updates** → Always reload editor
   - Agents are modifying notes intentionally
   - User expects to see agent's work
   - Database is source of truth

2. **Self Updates** → Don't reload same editor
   - Editor just saved its own content
   - Reloading would lose cursor position
   - Content is already current

3. **External Updates** → Handled separately
   - File watcher events trigger `file.external-change`
   - Existing conflict detection applies

4. **Other Editor Updates** → Reload to sync
   - Another editor instance (sidebar, etc.) saved
   - Current editor should sync to match

### Implementation Changes

#### Add Source Tracking to Events

**In `src/main/note-events.ts`:**
```typescript
export type NoteUpdatedEvent = {
  type: 'note.updated';
  noteId: string;
  source: 'agent' | 'user' | 'external' | 'system';
  editorId?: string;  // Optional: which editor instance
  updates: {
    title?: string;
    filename?: string;
    modified?: string;
    content?: string;  // Include for agent updates
  };
};
```

#### Update Agent Tool Calls

**In `src/main/tool-service.ts` (line 478):**
```typescript
publishNoteEvent({
  type: 'note.updated',
  noteId: updates.identifier,
  source: 'agent',  // 🆕
  updates: {
    title: updatedNote.title,
    filename: updatedNote.filename,
    modified: updatedNote.updated,
    content: updatedNote.content  // 🆕
  }
});
```

#### Update User Edits

**In `src/renderer/src/stores/noteDocumentRegistry.svelte.ts`:**
```typescript
private async save(): Promise<void> {
  // ... existing save logic ...

  await noteService.updateNote({
    identifier: this.noteId,
    content: this.content,
    silent: true  // Don't trigger UI refresh
  });

  // Publish update event (other editors will reload)
  messageBus.publish({
    type: 'note.updated',
    noteId: this.noteId,
    source: 'user',  // 🆕
    editorId: this.currentEditorId,  // 🆕
    updates: {
      modified: new Date().toISOString()
    }
  });
}
```

#### Re-enable Editor Reload

**In `src/renderer/src/stores/noteDocumentRegistry.svelte.ts` (line 242):**
```typescript
constructor() {
  // 🆕 Re-enable note.updated listener with smart reload logic
  messageBus.subscribe('note.updated', async (event) => {
    const doc = this.documents.get(event.noteId);
    if (!doc) return;

    // Decision matrix for reloading
    const shouldReload =
      event.source === 'agent' ||  // Always reload agent updates
      event.source === 'system' ||  // System updates (migrations, etc.)
      (event.source === 'user' && event.editorId !== doc.currentEditorId);  // Other editor

    if (shouldReload && !doc.hasUnsavedChanges) {
      await doc.reload();
    } else if (shouldReload && doc.hasUnsavedChanges) {
      // Show notification that note was updated elsewhere
      this.showConflictNotification(event.noteId);
    }
  });

  // Keep existing external-change listener
  messageBus.subscribe('file.external-change', async (event) => {
    // ... existing logic ...
  });
}
```

### User Experience

**Agent Updates:**
1. User asks agent: "Update my meeting notes with action items"
2. Agent calls `update_note` tool
3. Database updated immediately
4. `note.updated` event published with `source: 'agent'`
5. If note is open in editor → **Reloads to show agent's changes**
6. If user has unsaved edits → **Shows notification** (optional: merge UI)

**User Edits:**
1. User types in editor
2. After 500ms, autosave triggers
3. Database updated (DB-first)
4. `note.updated` event published with `source: 'user', editorId`
5. Same editor → **Ignores event** (already current)
6. Other editors → **Reload to sync**

**External Edits:**
1. External tool modifies file
2. File watcher detects change
3. `file.external-change` event published
4. Existing conflict detection logic applies

### Testing Requirements

**Unit Tests:**
```typescript
describe('NoteDocumentRegistry - Agent Updates', () => {
  it('reloads editor when agent updates note')
  it('preserves cursor when user edits same note')
  it('syncs between multiple editor instances')
  it('shows notification when reload would lose unsaved work')
})
```

**Integration Tests:**
```typescript
describe('Agent-Editor Synchronization', () => {
  it('agent update reflects in open editor immediately')
  it('user edit + agent edit = conflict notification')
  it('closed note + agent update = no reload needed')
  it('sidebar editor + main editor stay in sync')
})
```

**Manual Testing Scenarios:**
1. Open note, ask agent to update it, verify editor reloads
2. Type in editor, verify cursor position preserved
3. Open note in sidebar and main editor, edit in one, verify sync
4. Agent updates note while user typing, verify notification shown

---

## Technical Design

### Component Changes

#### 1. `FileWriteQueue` (New Class in `notes.ts`)

**Purpose**: Manage asynchronous, batched file writes

**Interface:**
```typescript
class FileWriteQueue {
  constructor(fileWatcher?: VaultFileWatcher);

  // Queue a write (replaces pending write for same file)
  queueWrite(filePath: string, content: string, delay?: number): Promise<void>;

  // Flush specific file immediately
  flushWrite(filePath: string): Promise<void>;

  // Flush all pending writes (app close)
  flushAll(): Promise<void>;

  // Check if file has pending write
  hasPendingWrite(filePath: string): boolean;

  // Get pending write count (for debugging)
  getPendingCount(): number;
}
```

**Behavior:**
- Default delay: 1000ms (configurable)
- Replaces pending write if same file queued again
- Always calls `markWriteStarting()` before write
- Always calls `markWriteComplete()` after write (even on error)
- Logs failures and retries up to 3 times

#### 2. `NoteManager.updateNote()` (Modified)

**Changes:**
```typescript
async updateNote(identifier: string, newContent: string, contentHash: string) {
  // 1-2: Same (read, validate)

  // 3. NEW: Update database first
  await this.updateSearchIndex(notePath, updatedContent);

  // 4. NEW: Queue file write (don't await)
  await this.#fileWriteQueue.queueWrite(notePath, updatedContent);

  // Return immediately (DB is updated)
  return { id, updated: true, timestamp };
}
```

**Impact:**
- Faster perceived save time (don't wait for file I/O)
- Database always reflects latest content
- File writes batched automatically

#### 3. `VaultFileWatcher.isInternalChange()` (Simplified)

**Changes:**
```typescript
// BEFORE: 50+ lines of logic
async isInternalChange(filePath: string, content?: string) {
  // Check 1: Write flag
  if (this.ongoingWrites.has(filePath)) return { isInternal: true };

  // Check 2: Operation tracking (delete/rename)
  if (this.internalOperations.has(filePath)) return { isInternal: true };

  // Check 3: Expected writes (COMPLEX)
  const noteId = this.noteManager?.getNoteIdFromPath(filePath);
  if (noteId && this.openNotes.has(noteId)) {
    const expected = this.expectedWrites.get(noteId);
    if (expected && content) {
      const hash = await computeHash(content);
      const match = expected.find(e => e.contentHash === hash);
      if (match) {
        return { isInternal: true };
      }
      return { isInternal: false, isConflict: true };
    }
  }

  return { isInternal: false };
}

// AFTER: 8 lines
async isInternalChange(filePath: string) {
  // Our writes always have the flag set
  if (this.ongoingWrites.has(filePath)) return true;

  // Delete/rename operations
  if (this.internalOperations.has(filePath)) return true;

  // Otherwise external
  return false;
}
```

**Removals:**
- ❌ `openNotes` Set
- ❌ `expectedWrites` Map
- ❌ `expectWrite()` method
- ❌ Hash computation and matching
- ❌ 2-second timeout cleanup
- ❌ Conflict detection logic (moves to handler)

#### 4. `NoteDocumentRegistry` (Simplified)

**Removals:**
```typescript
// Remove from save() method:
- ❌ await this.computeContentHash(this.content)
- ❌ await window.api?.expectNoteWrite({ noteId, contentHash })
- ❌ Related logging
```

**Impact:**
- Simpler save flow
- Less IPC overhead
- Fewer moving parts

#### 5. IPC Handlers (Removed)

**Delete from `src/main/index.ts`:**
```typescript
- ipcMain.handle('note:opened', ...)
- ipcMain.handle('note:closed', ...)
- ipcMain.handle('note:expect-write', ...)
```

**Delete from `src/preload/index.ts`:**
```typescript
- noteOpened: (params) => invoke('note:opened', params)
- noteClosed: (params) => invoke('note:closed', params)
- expectNoteWrite: (params) => invoke('note:expect-write', params)
```

#### 6. External Edit Handling (Enhanced)

**New logic in `NoteService.handleFileWatcherEvent()`:**
```typescript
async handleFileWatcherEvent(event: FileWatcherEvent) {
  if (event.type === 'external-change') {
    // Update database from file
    await this.hybridSearchManager.indexNoteFile(event.path);

    // Check if note is open with unsaved changes
    const doc = noteDocumentRegistry.get(event.noteId);
    if (doc && (doc.isSaving || doc.hasChanges)) {
      // User has unsaved work - this is a conflict
      this.publishNoteEvent({
        type: 'file.external-edit-conflict',
        noteId: event.noteId,
        path: event.path
      });
    } else {
      // Safe to reload editor silently
      this.publishNoteEvent({
        type: 'file.external-change',
        noteId: event.noteId,
        path: event.path
      });
    }
  }
}
```

**User-Facing Behavior:**
- **No unsaved changes**: External edits auto-reload in editor (no dialog)
- **Unsaved changes**: Show conflict dialog (existing behavior)
- **Result**: Fewer conflict dialogs, only when truly needed

---

## Migration Plan

### Phase 1: Add File Write Queue ✅ (Safe)

**Goal**: Introduce queue without changing behavior

**Changes:**
1. Add `FileWriteQueue` class to `notes.ts`
2. Initialize queue in `NoteManager` constructor
3. Replace direct `fs.writeFile()` calls with `queue.queueWrite()`
4. Set queue delay to 0ms initially (no behavior change)
5. Add app shutdown handler to flush queue

**Testing:**
- All existing tests pass
- Manual testing of normal edit flow
- Verify files written correctly

**Risk**: Low (queue with 0ms delay is effectively synchronous)

### Phase 2: Reverse DB/File Order ✅ (Medium Risk)

**Goal**: Update database before queuing file write

**Changes:**
1. In `updateNote()`, call `updateSearchIndex()` before `queueWrite()`
2. Increase queue delay to 500ms
3. Update tests to expect DB-first order

**Testing:**
- Verify search reflects latest content immediately
- Test rapid edits batch correctly
- Test app close flushes pending writes
- Test file system reflects changes within 500ms

**Validation:**
- Monitor for increased IPC latency (shouldn't happen)
- Check file write batching reduces I/O operations

**Risk**: Medium (changes core save flow)

### Phase 3: Remove Expected Write Tracking ✅ (Safe)

**Goal**: Simplify file watcher by removing hash matching

**Changes:**
1. Remove `expectWrite()` calls from `NoteDocument.save()`
2. Remove `openNotes`, `expectedWrites` from `VaultFileWatcher`
3. Remove IPC handlers (note:opened, note:closed, note:expect-write)
4. Remove preload API bindings

**Testing:**
- Verify external edits still detected
- Verify internal writes not flagged as external
- Check for any broken references

**Risk**: Low (code removal, no new logic)

### Phase 4: Simplify File Watcher ✅ (Low Risk)

**Goal**: Reduce `isInternalChange()` to simple flag check

**Changes:**
1. Simplify `isInternalChange()` to only check `ongoingWrites`
2. Remove conflict detection logic from watcher
3. Move conflict detection to event handler
4. Update related tests

**Testing:**
- Test external edit detection still works
- Test no false positives during internal writes
- Test conflict detection in new location

**Risk**: Low (simplification of existing logic)

### Phase 5: Enhanced External Edit UX 🎯 (User-Facing)

**Goal**: Only show conflict dialog when user has unsaved work

**Changes:**
1. Update `handleFileWatcherEvent()` to check dirty state
2. Auto-reload editor for non-conflicting external edits
3. Update `ExternalEditConflictNotification` component
4. Add user preference for auto-reload behavior

**Testing:**
- Test external edit with no unsaved changes → silent reload
- Test external edit with unsaved changes → conflict dialog
- Test rapid external changes handled correctly

**Risk**: Medium (changes user-facing behavior)

### Phase 6: Agent Update Synchronization 🤖 (Critical Fix)

**Goal**: Make agent updates immediately visible in open editors

**Changes:**
1. Add `source` field to `NoteUpdatedEvent` type in `note-events.ts`
2. Update `publishNoteEvent()` calls in `tool-service.ts` to include `source: 'agent'`
3. Update `NoteDocument.save()` to publish events with `source: 'user'`
4. Re-enable `note.updated` listener in `noteDocumentRegistry` constructor
5. Implement smart reload logic (reload for agent, skip for self)
6. Add `hasUnsavedChanges` property to `NoteDocument` class
7. Add notification UI for concurrent edit conflicts

**Testing:**
- Test agent updates reload open editors
- Test user edits don't cause cursor jumps
- Test multiple editor instances stay in sync
- Test conflict notification when both user and agent edit
- Test closed notes don't reload unnecessarily

**Manual Scenarios:**
1. Open note, ask agent to update it, verify content reloads
2. Type while agent updating → verify notification shown
3. Open same note in sidebar and main editor, verify sync
4. Agent updates title/metadata → verify all UI elements update

**Risk**: Medium (re-enables previously disabled functionality)

**Validation:**
- No cursor position loss during user typing
- Agent updates visible within 100ms
- Notification shown for true conflicts
- No performance regression with multiple open notes

---

## Success Metrics

### Quantitative Metrics

**Code Complexity:**
- [ ] Reduce file-watcher LOC by 30%+ (768 → <540 lines)
- [ ] Remove 100+ lines of tracking logic
- [ ] Reduce active timers from 5 types to 2 types

**Performance:**
- [ ] DB write latency < 5ms (p95)
- [ ] File write batching reduces I/O by 50%+ during rapid edits
- [ ] IPC call latency unchanged (< 1ms)

**Reliability:**
- [ ] Zero false positive external edit dialogs in testing
- [ ] 100% of external edits detected correctly
- [ ] No data loss during app crashes (with flush-on-close)
- [ ] 100% of agent updates visible in open editors within 100ms
- [ ] Zero cursor position losses during user editing

### Qualitative Metrics

**Developer Experience:**
- [ ] External edit detection logic easier to understand
- [ ] Fewer timing-dependent test failures
- [ ] Easier to onboard new contributors

**User Experience:**
- [ ] No spurious conflict dialogs reported in issues
- [ ] Faster perceived save performance
- [ ] Transparent auto-reload of external edits
- [ ] Agent updates immediately visible in open editors
- [ ] No interruption to typing flow during agent updates

---

## Risks and Mitigation

### Risk 1: Data Loss on Crash

**Scenario**: App crashes before queued writes flush to disk

**Probability**: Low (crashes are rare, queue flushes in 1-2s)

**Impact**: High (user loses recent edits)

**Mitigation:**
1. **Flush on app close**: Register `before-quit` handler to flush queue
2. **Reduce queue delay**: Default 1s (vs 2s+) for faster durability
3. **Flush on navigation**: Flush current note when switching notes
4. **Recovery**: Database still has content, can rebuild files on restart

**Decision**: Accept risk with mitigations. SQLite DB provides durability.

### Risk 2: File/DB Desync

**Scenario**: File write fails, DB and file out of sync

**Probability**: Low (file writes rarely fail)

**Impact**: Medium (external tools see stale content)

**Mitigation:**
1. **Retry logic**: Retry failed writes up to 3 times
2. **Error tracking**: Log failed writes to DB (add `sync_status` column)
3. **Reconciliation**: On app start, compare DB hashes to file hashes
4. **Manual sync**: Add "Force Sync to Files" command in dev menu

**Decision**: Implement retry logic and error tracking

### Risk 3: Performance Regression

**Scenario**: DB writes are slower than expected

**Probability**: Very Low (WAL mode is proven fast)

**Impact**: Medium (perceived save latency)

**Mitigation:**
1. **Benchmarking**: Measure DB write perf before/after
2. **Monitoring**: Add telemetry for DB write times
3. **Fallback**: Can revert to synchronous file writes if needed

**Decision**: Proceed with performance monitoring

### Risk 4: Breaking External Integrations

**Scenario**: External tools expect immediate file updates

**Probability**: Low (most tools watch files, sync on changes)

**Impact**: Low (1-2s delay is acceptable)

**Mitigation:**
1. **Documentation**: Update docs to mention async file sync
2. **Force flush**: Add command to immediately flush all writes
3. **Configuration**: Make queue delay configurable

**Decision**: Document behavior, monitor for issues

### Risk 5: Migration Bugs

**Scenario**: Bugs introduced during phased rollout

**Probability**: Medium (complex refactor)

**Impact**: High (could cause data loss or corruption)

**Mitigation:**
1. **Phased rollout**: 5 phases, each independently testable
2. **Feature flag**: Add `USE_DB_FIRST` flag for gradual rollout
3. **Comprehensive testing**: Unit, integration, and manual QA
4. **Rollback plan**: Each phase can be reverted independently
5. **Beta testing**: Deploy to internal users first

**Decision**: Use feature flag and phased rollout

---

## Testing Strategy

### Unit Tests

**New Tests:**
```typescript
// FileWriteQueue tests
describe('FileWriteQueue', () => {
  it('debounces rapid writes to same file')
  it('batches multiple edits')
  it('flushes on demand')
  it('flushes all on shutdown')
  it('retries failed writes')
  it('sets write flags correctly')
})

// NoteManager tests
describe('NoteManager.updateNote (DB-first)', () => {
  it('updates database before queuing file write')
  it('returns immediately without waiting for file write')
  it('file write completes within queue delay')
})

// VaultFileWatcher tests
describe('VaultFileWatcher.isInternalChange (simplified)', () => {
  it('returns true when write flag set')
  it('returns false when no write flag')
  it('does not use hash matching')
})
```

**Modified Tests:**
- Update timing assumptions in existing tests
- Remove tests for deleted functionality (expectedWrites)
- Add async assertions for queued writes

### Integration Tests

**Scenarios:**
1. **Rapid typing**: User types continuously for 5 seconds
   - Expected: Single file write, DB always current
2. **External edit (no unsaved)**: External tool modifies file
   - Expected: Silent reload in editor
3. **External edit (unsaved)**: External tool modifies file while user typing
   - Expected: Conflict dialog shown
4. **App crash**: Force quit during pending write
   - Expected: DB has content, file syncs on restart
5. **Multiple notes**: Edit 3 notes in quick succession
   - Expected: All DB updates immediate, file writes queued

### Manual Testing Checklist

**Phase 1 (Queue Added):**
- [ ] Normal editing works
- [ ] Files written correctly
- [ ] No perceived latency change

**Phase 2 (DB-First):**
- [ ] Search reflects latest edits immediately
- [ ] Files written within delay window
- [ ] App close flushes queue

**Phase 3 (Remove Expected Writes):**
- [ ] External edits detected
- [ ] No false positives
- [ ] IPC handlers removed

**Phase 4 (Simplify Watcher):**
- [ ] External edits still work
- [ ] Internal writes not flagged

**Phase 5 (Enhanced UX):**
- [ ] Silent reloads work correctly
- [ ] Conflict dialog only when needed

### Performance Testing

**Benchmarks:**
```typescript
// Measure DB write latency
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  await db.upsertNote(...);
  const duration = performance.now() - start;
  // Assert: duration < 5ms (p95)
}

// Measure file write batching
// Scenario: Type 100 characters over 10 seconds
// Expected: 1-2 file writes (vs 20+ without batching)
```

---

## Timeline

### Sprint 1 (Week 1): Foundation
- [ ] Write PRD (this document)
- [ ] Review and approve PRD with team
- [ ] Set up feature flag infrastructure
- [ ] Add telemetry for write performance

### Sprint 2 (Week 2): Phase 1 + 2
- [ ] Implement FileWriteQueue class
- [ ] Add unit tests for queue
- [ ] Integration tests for queue behavior
- [ ] Reverse DB/File order in updateNote()
- [ ] Manual testing and bug fixes

### Sprint 3 (Week 3): Phase 3 + 4
- [ ] Remove expected write tracking
- [ ] Simplify file watcher logic
- [ ] Update all tests
- [ ] Code review and refinement

### Sprint 4 (Week 4): Phase 5 + 6
- [ ] Implement enhanced external edit UX
- [ ] Add user preferences
- [ ] Implement agent update synchronization (Phase 6)
- [ ] Add event source tagging
- [ ] Re-enable smart note.updated listeners

### Sprint 5 (Week 5): Testing + Polish
- [ ] Comprehensive integration testing (all phases)
- [ ] Agent-editor sync testing
- [ ] Performance validation
- [ ] Documentation updates
- [ ] Code review and refinement

### Sprint 6 (Week 6): Beta + Launch
- [ ] Deploy to internal beta users
- [ ] Monitor telemetry and bug reports
- [ ] Test agent updates with real workflows
- [ ] Fix any critical issues
- [ ] Enable feature flag for all users
- [ ] Write release notes

**Total Duration**: 6 weeks (extended for agent sync work)

---

## Documentation Updates

### User-Facing

**Update `docs/USER-GUIDE.md`:**
- Explain that edits are saved to database immediately
- File system sync happens within 1-2 seconds
- External edits auto-reload when safe
- Conflict dialog only shows when unsaved changes exist

**Update `docs/EXTERNAL-EDITORS.md`:**
- Document async file sync behavior
- Explain that search is always current
- Note that file changes detected within 2-3 seconds

### Developer-Facing

**Update `docs/ARCHITECTURE.md`:**
- Document database-first architecture
- Explain FileWriteQueue design
- Update data flow diagrams
- Document external edit detection logic

**Update `docs/architecture/EXTERNAL-EDIT-HANDLING.md`:**
- Rewrite to reflect simplified design
- Remove expected write tracking section
- Add FileWriteQueue section
- Update conflict detection explanation

**Create `docs/architecture/FILE-WRITE-QUEUE.md`:**
- Detailed design of queue implementation
- Failure handling and retry logic
- Performance characteristics
- Configuration options

---

## Future Opportunities

Once this architecture is in place, it enables:

### 1. Real-Time Collaboration
- Database can broadcast changes to multiple clients
- File writes become "export" operation
- Operational transformation becomes feasible

### 2. Version History
- Database can store previous versions
- Enable undo/redo across sessions
- Time-travel debugging

### 3. Conflict-Free Editing
- Multiple editors share same NoteDocument
- Changes merge automatically in DB
- File reflects merged result

### 4. Cloud Sync
- Sync database to cloud service
- Files are local cache
- Offline-first architecture

### 5. Better Mobile Support
- Database-first works well on mobile
- File writes can be deferred during low battery
- Reduced I/O = better battery life

---

## Open Questions

1. **Queue Delay**: Should default be 1000ms, 1500ms, or 2000ms?
   - **Recommendation**: Start with 1000ms, make configurable

2. **Flush Strategy**: When to flush besides timeout and app close?
   - **Recommendation**: Also flush on note switch, vault close

3. **Retry Logic**: How many retries for failed writes?
   - **Recommendation**: 3 retries with exponential backoff (100ms, 500ms, 1s)

4. **User Notification**: Should we notify when file write fails?
   - **Recommendation**: Log error, add "sync issues" indicator in status bar

5. **Configuration**: Should queue delay be user-configurable?
   - **Recommendation**: Yes, add to advanced settings (default 1000ms)

6. **Backward Compatibility**: Do we need to support old architecture?
   - **Recommendation**: No, but use feature flag during rollout

---

## Appendix A: Code Size Comparison

### Before (Estimated Lines)

```
file-watcher.ts:          768 lines
  - isInternalChange():    ~80 lines
  - expectedWrite logic:   ~60 lines
  - openNotes tracking:    ~40 lines

noteDocumentRegistry:      ~30 lines (expectWrite)
main/index.ts:            ~40 lines (IPC handlers)
preload/index.ts:         ~10 lines (API bindings)

Total:                    ~948 lines
```

### After (Estimated Lines)

```
file-watcher.ts:          ~550 lines (-218)
  - isInternalChange():    ~15 lines (-65)
  - expectedWrite logic:   REMOVED (-60)
  - openNotes tracking:    REMOVED (-40)

FileWriteQueue:           ~150 lines (NEW)
noteDocumentRegistry:     ~10 lines (-20)
main/index.ts:            REMOVED (-40)
preload/index.ts:         REMOVED (-10)

Total:                    ~710 lines (-238 lines, -25%)
```

**Net Reduction**: ~238 lines (25% less code in sync logic)

---

## Appendix B: Performance Benchmarks

### Expected Performance Characteristics

**Database Write (WAL Mode):**
- p50: < 1ms
- p95: < 5ms
- p99: < 10ms

**File Write (Queued):**
- Delay: 1000ms (configurable)
- Batching: 10-50x reduction in writes during rapid editing

**IPC Latency:**
- No change expected (< 1ms)

**Search Consistency:**
- Before: Up to 500ms delay (after autosave)
- After: < 5ms (database updated immediately)

### Benchmark Plan

```typescript
// Run before and after implementation
async function benchmarkSaveLatency() {
  const iterations = 1000;
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await noteManager.updateNote(noteId, randomContent(), hash);
    const end = performance.now();
    latencies.push(end - start);
  }

  return {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99)
  };
}
```

---

## Appendix C: Rollback Plan

### If Critical Issues Found

**Phase 1-2 Issues (Queue + DB-First):**
1. Set feature flag `USE_DB_FIRST = false`
2. Revert `updateNote()` to file-first order
3. Keep FileWriteQueue code (unused)
4. Release hotfix within 24 hours

**Phase 3-4 Issues (Simplified Watcher):**
1. Set feature flag `USE_SIMPLIFIED_WATCHER = false`
2. Re-enable expected write tracking
3. Keep simplified code (unused)
4. Release hotfix within 24 hours

**Phase 5 Issues (Enhanced UX):**
1. Set feature flag `AUTO_RELOAD_EXTERNAL_EDITS = false`
2. Always show conflict dialog (old behavior)
3. No code revert needed
4. Release hotfix within 24 hours

### Criteria for Rollback

**Severity 1 (Immediate Rollback):**
- Data loss or corruption
- App crashes or freezes
- Files not written to disk

**Severity 2 (Rollback if Not Fixed in 48h):**
- False positive conflict dialogs return
- External edits not detected
- Significant performance regression

**Severity 3 (Fix Forward):**
- Minor UI issues
- Edge case bugs
- Performance optimization opportunities

---

## Sign-Off

**Stakeholders:**
- [ ] Engineering Lead
- [ ] Product Manager
- [ ] QA Lead
- [ ] Technical Writer

**Approvals:**
- [ ] Architecture Review
- [ ] Security Review (if applicable)
- [ ] Performance Review

**Ready for Implementation**: ⬜ Yes  ⬜ No  ⬜ Needs Changes

---

**End of PRD**
