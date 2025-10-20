# Cursor Jump Issue: Analysis and Solution

## Problem Summary

Users experience cursor jumping while typing in the editor. The cursor moves to an unexpected position (beginning or middle of document) during active editing. This happens intermittently, particularly when:

1. User types continuously → pauses briefly → resumes typing
2. Timing coincides with auto-save debounce window (~100-200ms)
3. File system events from auto-save trigger just as user resumes typing

## Root Cause Analysis

### Current Architecture

The external edit handling system (see `EXTERNAL-EDIT-HANDLING.md`) uses:

1. **Operation Tracking**: `markWriteStarting()` / `markWriteComplete()` methods
2. **Time-Based Flags**: Write flags kept for 1000ms after completion
3. **Debounced Events**: File watcher debounces changes (100ms)
4. **Write Stabilization**: Chokidar waits for writes to finish (200ms)

### The Race Condition

```
Timeline of the race condition:

T=0ms:    User types "hello" → auto-save triggered
T=0ms:    markWriteStarting(note.md) → ongoingWrites.add(note.md)
T=10ms:   File written to disk
T=10ms:   markWriteComplete(note.md) → cleanup timer starts (1000ms)
T=50ms:   File system event fired
T=150ms:  awaitWriteFinish satisfied (200ms stability)
T=250ms:  Debounce timer expires (100ms)
T=250ms:  isInternalChange() checks → ongoingWrites still has note.md → IGNORED ✓

BUT:

T=0ms:    User types "hello" → auto-save triggered
T=0ms:    markWriteStarting(note.md)
T=10ms:   File written, markWriteComplete(note.md) → cleanup at T=1010ms
T=900ms:  User pauses typing
T=950ms:  User resumes typing "world"
T=1050ms: Cleanup timer fires → ongoingWrites.delete(note.md)
T=1100ms: Previous save's file watcher event fires (delayed FS event)
T=1100ms: isInternalChange() checks → ongoingWrites empty → EXTERNAL CHANGE! ✗
T=1100ms: Triggers sync → editor re-renders → CURSOR JUMPS
```

### Fundamental Issue: **Semantic Gap**

The file watcher operates on **timing heuristics** but lacks **semantic understanding**:

- ❌ **What it knows**: "A file changed at timestamp X"
- ❌ **What it guesses**: "If change is recent and we wrote recently, probably internal"
- ✅ **What it needs**: "Is this note currently open in the editor?"

**The real question isn't "when did we write?" but "who owns this note right now?"**

## Attempted Solutions (Insufficient)

### ❌ Longer Timeouts

- **Approach**: Increase cleanup window from 1000ms to 5000ms
- **Problem**: Still timing-based; just kicks the can down the road
- **Failure**: User could still pause for 6 seconds and trigger the race

### ❌ Better Timing Coordination

- **Approach**: Coordinate debounce/stability/cleanup windows more carefully
- **Problem**: File system timing is unpredictable (OS, disk speed, load)
- **Failure**: No amount of tuning eliminates the race condition

### ❌ Content Hash Comparison

- **Approach**: Compare content hash before triggering reload
- **Problem**: Content HAS changed (user typed more), so hash differs
- **Failure**: Can't distinguish "user typing" from "external edit with similar content"

## Robust Solution: **Editor-Aware File Watching**

### Core Principle

**A note that's currently open in the editor should NEVER trigger a file watcher sync, because the editor is the authoritative source for that note.**

### Design

```
┌─────────────────────────────────────────────┐
│  Renderer Process (Editor)                 │
│  - User opens note A                       │
│  - User types and edits                    │
│  - Auto-save writes to disk                │
└──────────────┬──────────────────────────────┘
               │
               ├─ IPC: noteOpened(noteId: "A")
               │  IPC: noteClosed(noteId: "A")
               ↓
┌─────────────────────────────────────────────┐
│  Main Process (File Watcher)               │
│  - Maintains Set<noteId> of open notes     │
│  - File watcher checks exclusion list      │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│  File System Events                        │
│  - note.md changed                         │
│  - Check: is note ID in exclusion list?    │
│  - YES → ignore (editor owns it)           │
│  - NO → sync (external change)             │
└─────────────────────────────────────────────┘
```

### Implementation Components

#### 1. File Watcher: Exclusion List

```typescript
// src/server/core/file-watcher.ts

export class VaultFileWatcher {
  // Track which notes are currently open in the editor
  private openNotes = new Set<string>();

  /**
   * Mark a note as open in the editor
   * While open, file watcher will ignore all changes to this note
   */
  markNoteOpened(noteId: string): void {
    this.openNotes.add(noteId);
    console.log(`[FileWatcher] Note opened in editor: ${noteId}`);
  }

  /**
   * Mark a note as closed in the editor
   * After closing, file watcher will resume monitoring for external changes
   */
  markNoteClosed(noteId: string): void {
    this.openNotes.delete(noteId);
    console.log(`[FileWatcher] Note closed in editor: ${noteId}`);
  }

  /**
   * Check if a note is currently open in the editor
   */
  private isNoteOpenInEditor(noteId: string): boolean {
    return this.openNotes.has(noteId);
  }

  /**
   * Enhanced internal change detection
   */
  private async isInternalChange(filePath: string): Promise<boolean> {
    // FIRST: Check if this note is currently open in the editor
    const noteId = await this.getNoteIdFromPath(filePath);
    if (noteId && this.isNoteOpenInEditor(noteId)) {
      console.log(`[FileWatcher] Ignoring change to open note: ${noteId}`);
      return true; // Treat as internal (editor is the source of truth)
    }

    // SECOND: Existing write flag checks
    const absolutePath = path.resolve(this.vaultPath, filePath);
    if (this.ongoingWrites.has(absolutePath)) {
      return true;
    }

    // ... rest of existing checks
  }
}
```

#### 2. IPC Protocol: Note Lifecycle Events

```typescript
// src/preload/index.ts (add to window.api)

export interface ElectronAPI {
  // ... existing methods

  // Note lifecycle tracking
  noteOpened: (params: { noteId: string }) => Promise<void>;
  noteClosed: (params: { noteId: string }) => Promise<void>;
}
```

```typescript
// src/main/index.ts (IPC handlers)

ipcMain.handle('note:opened', async (_event, params: { noteId: string }) => {
  const fileWatcher = noteService.getFileWatcher();
  if (fileWatcher) {
    fileWatcher.markNoteOpened(params.noteId);
  }
  return { success: true };
});

ipcMain.handle('note:closed', async (_event, params: { noteId: string }) => {
  const fileWatcher = noteService.getFileWatcher();
  if (fileWatcher) {
    fileWatcher.markNoteClosed(params.noteId);
  }
  return { success: true };
});
```

#### 3. Active Note Store: Lifecycle Notifications

```typescript
// src/renderer/src/stores/activeNoteStore.svelte.ts

class ActiveNoteStore {
  private previousNoteId: string | null = null;

  async setActiveNote(note: NoteMetadata | null): Promise<void> {
    await this.ensureInitialized();

    // Notify main process about note lifecycle changes
    const oldNoteId = this.previousNoteId;
    const newNoteId = note?.id || null;

    if (oldNoteId && oldNoteId !== newNoteId) {
      // Previous note is being closed
      await window.api?.noteClosed({ noteId: oldNoteId });
    }

    if (newNoteId && newNoteId !== oldNoteId) {
      // New note is being opened
      await window.api?.noteOpened({ noteId: newNoteId });
    }

    this.previousNoteId = newNoteId;
    this.state.activeNote = note;
    await this.saveToStorage();
  }

  async clearActiveNote(): Promise<void> {
    await this.ensureInitialized();

    // Notify that note is being closed
    if (this.previousNoteId) {
      await window.api?.noteClosed({ noteId: this.previousNoteId });
      this.previousNoteId = null;
    }

    this.state.activeNote = null;
    await this.saveToStorage();
  }
}
```

### Benefits

✅ **Eliminates Race Conditions**: No timing dependencies
✅ **Semantic Clarity**: "Editor owns open notes" is a clear, understandable rule
✅ **No False Positives**: Never mistakes editor typing for external changes
✅ **No False Negatives**: Still detects real external edits to non-open notes
✅ **Predictable Behavior**: Users can reason about what will happen
✅ **Performance**: Simple Set lookup (O(1)), no file I/O needed

### Edge Cases Handled

#### 1. App Restart

```
Problem: Note was open when app closed; on restart, file watcher doesn't know
Solution: activeNoteStore restoration calls noteOpened() automatically
```

#### 2. Multiple Windows (Future)

```
Problem: Same note open in multiple windows
Solution: Use reference counting: openCount.set(noteId, count + 1)
Only sync when openCount reaches 0
```

#### 3. Rapid Note Switching

```
Problem: User switches notes quickly (A→B→C)
Solution: Each setActiveNote() properly closes old and opens new
IPC calls are async but fire-and-forget (no blocking)
```

#### 4. Editor Crash

```
Problem: Editor crashes without calling noteClosed()
Solution: Main process tracks which renderer owns each note
On renderer disconnect, clean up all its open notes
```

## Implementation Plan

### Phase 1: Core Infrastructure (This PR)

1. Add `openNotes` Set to VaultFileWatcher
2. Add `markNoteOpened()` / `markNoteClosed()` / `isNoteOpenInEditor()` methods
3. Integrate check into `isInternalChange()`
4. Add IPC handlers for note:opened / note:closed
5. Add IPC methods to preload/window.api

### Phase 2: Active Note Integration (This PR)

6. Update activeNoteStore to track previous note ID
7. Call noteOpened() when opening a note
8. Call noteClosed() when closing or switching notes
9. Handle cleanup in clearActiveNote()

### Phase 3: Testing

10. Manual testing: Type while auto-save is happening
11. Manual testing: Pause and resume typing across debounce window
12. Manual testing: External edits to non-open notes still work
13. Manual testing: External edits to open notes are ignored
14. Unit tests for exclusion list logic

### Phase 4: Monitoring & Refinement

15. Add logging for open/close events
16. Monitor for any remaining cursor jump reports
17. Consider adding telemetry for open note count

## Alternative Approaches Considered

### A. Pause File Watching During Typing

```typescript
// Pause when editor focused and active
if (editorHasFocus && userIsTyping) {
  pauseFileWatcher();
}
```

**Rejected**: Could miss legitimate external changes; hard to detect "typing" reliably

### B. Editor Confirms Each Save

```typescript
// Editor sends hash after each save
await noteService.confirmSave(noteId, contentHash);
```

**Rejected**: Too chatty; IPC overhead; doesn't solve the timing issue

### C. File Lock Mechanism

```typescript
// Lock file while editing
await fs.writeFile(`.${noteId}.lock`, '');
```

**Rejected**: File system locks unreliable; leaves artifacts; cross-platform issues

## Rollout Strategy

### Development

- Feature flag: `ENABLE_EDITOR_AWARE_FILE_WATCHING`
- Default: OFF (use existing timing-based approach)
- Manual toggle for testing

### Testing

- Internal testing with flag ON
- Monitor logs for any unexpected behavior
- Verify external edits still detected for non-open notes

### Production

- Ship with flag OFF initially
- Gradual rollout: 10% → 50% → 100%
- Monitor error rates and user reports
- If stable for 1 week, make default ON

### Rollback

- If issues found, flip flag to OFF
- No data loss risk (only affects file watching behavior)
- Can revert to timing-based approach instantly

## Success Metrics

- ✅ Zero cursor jump reports during active editing
- ✅ External edits still detected for non-open notes (verify with test)
- ✅ No performance degradation (Set lookup is O(1))
- ✅ IPC overhead negligible (only 2 calls per note open/close)

## Documentation Updates

- Update `EXTERNAL-EDIT-HANDLING.md` with editor-aware approach
- Add section on "Open Note Exclusion"
- Document IPC protocol for note lifecycle
- Add troubleshooting guide for cursor jump issues

---

**Status**: Ready for implementation
**Risk Level**: Low (fallback to existing behavior available)
**Implementation Effort**: ~2-3 hours
**Testing Effort**: ~1 hour
