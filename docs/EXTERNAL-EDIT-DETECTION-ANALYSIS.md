# External Edit Detection False Positives - Root Cause Analysis

## Summary

Users are experiencing false positive "external edit" notifications when editing notes within Flint. The external edit detection system is incorrectly identifying internal edits as external changes.

## Current Architecture

### Write Tracking Mechanism

The system uses a flag-based approach to distinguish internal from external writes:

1. **FileWriteQueue** (src/server/core/notes.ts:141-299)
   - Debounces file writes with 1000ms delay
   - Before write: calls `fileWatcher.markWriteStarting(path)`
   - After write: calls `fileWatcher.markWriteComplete(path)` in finally block

2. **VaultFileWatcher** (src/server/core/file-watcher.ts:57-544)
   - Maintains `ongoingWrites` Set to track active writes
   - `markWriteStarting(path)`: adds path to Set
   - `markWriteComplete(path)`: schedules removal after 1000ms (WRITE_FLAG_CLEANUP_MS)
   - `isInternalChange(path)`: returns true if path is in `ongoingWrites` Set

### File Change Detection Flow

1. User edits → AutoSave (500ms debounce) → `updateNote()`
2. Database updated → `queueWrite(path, content, 1000ms)`
3. After 1000ms: FileWriteQueue flushes write
4. Chokidar detects change (200ms stabilityThreshold + 100ms debounce)
5. `isInternalChange()` checks if path in `ongoingWrites`
6. If internal → return early; if external → emit event

## Identified Issues

### Issue #1: Dual Write System with Race Conditions

**Problem:** Two separate systems write files with different timing:

1. **FileWriteQueue** (notes.ts:215)
   - Used by normal note operations
   - Debounced (1000ms delay)
   - Properly tracked

2. **search-manager.writeFileWithTracking** (search-manager.ts:164-177)
   - Used during auto-normalization
   - Writes IMMEDIATELY (no debouncing)
   - Also properly tracked, BUT...

**The Race:**
When `syncFileSystemChanges()` is called (from file watcher or periodic sync):

- Scans all files for changes
- Calls `indexNoteFile(filePath)` for changed files
- `indexNoteFile` may trigger multiple normalization writes:
  - `normalizeFrontmatterId` (line 1482)
  - `normalizeFrontmatterTitle` (line 1574)
  - `normalizeFrontmatterType` (line 1381)
  - `normalizeWikilinks` (line 1679)

Each normalization:

1. Calls `writeFileWithTracking` IMMEDIATELY
2. Sets flag for 1000ms
3. But file watcher may still be processing the ORIGINAL change that triggered the sync

### Issue #2: Path Normalization Inconsistency

**Current approach:**

```typescript
// In markWriteStarting/markWriteComplete:
const absolutePath = path.resolve(this.vaultPath, filePath);

// In isInternalChange:
const absolutePath = path.resolve(this.vaultPath, filePath);
```

**Problems:**

1. When `filePath` is already absolute (as it is from `workspace.getNotePath()`), `path.resolve()` ignores `vaultPath`
2. Chokidar provides absolute paths
3. Works fine on simple cases, but potential issues with:
   - Symlinks (resolved vs unresolved paths)
   - Case sensitivity (macOS is case-insensitive filesystem but JS string comparison is case-sensitive)
   - Trailing slashes or path separators

### Issue #3: Flag Cleanup Timing Edge Cases

**Timeline of potential race:**

```
T=0:    User saves → queueWrite(..., 1000ms delay)
T=1000: Write flushes, markWriteStarting() called
T=1002: Write completes, markWriteComplete() called → flag scheduled to clear at T=2002
T=1200: Chokidar detects change
T=1300: isInternalChange() checks → flag still set → TRUE ✓

BUT if user makes another edit:
T=1500: Another save → queueWrite (REPLACES previous)
T=2002: FLAG CLEARED from first write
T=2500: Second write flushes, markWriteStarting() called
T=2502: Write completes, markWriteComplete() called → flag scheduled to clear at T=3502

If there's a delayed chokidar event from T=1000 write that fires at T=2100:
T=2100: Late chokidar event arrives
T=2200: isInternalChange() → FLAG NOT SET → FALSE → EXTERNAL CHANGE DETECTED ❌
```

### Issue #4: Document Dirty State During Save

```typescript
get isDirty(): boolean {
  return this.autoSave.hasChanges || this.autoSave.isSaving;
}
```

While `isSaving` is true, if an external-change event arrives, it triggers conflict notification.

The sequence:

1. Save starts → `isSaving = true`
2. `updateNote()` completes quickly (just queues write)
3. `isSaving = false`
4. 1000ms later: actual file write happens

So this is probably okay, UNLESS there's a normalization write that happens immediately.

## Root Cause Hypothesis

The most likely cause of false positives is **Issue #1**:

When a user saves a note:

1. Normal save flow queues write with 1000ms delay
2. If file needs normalization (wrong type, missing ID, etc.), `indexNoteFile` writes IMMEDIATELY
3. The immediate write completes and flag is set
4. User continues typing
5. Another save queues another write
6. Original flag from normalization write expires (1000ms later)
7. Queued write happens but flag might be in transition
8. Chokidar events arrive in complex interleaved pattern
9. Some events checked when flag is cleared → false positive

## Proposed Solutions

### Solution 1: Unified Write Queue (Recommended)

**Goal:** All file writes go through a single queue with consistent tracking

Changes:

1. Remove `writeFileWithTracking` from search-manager.ts
2. Make search-manager normalization writes go through NoteManager's FileWriteQueue
3. This ensures:
   - All writes are debounced consistently
   - Single source of truth for write tracking
   - No interleaved immediate vs delayed writes

**Implementation:**

- Add `fileWriteQueue` reference to search-manager
- Replace all `writeFileWithTracking` calls with calls to the shared queue
- Normalization writes would be queued, not immediate

### Solution 2: Content-Based Change Detection

**Goal:** Don't rely solely on flags, verify that content actually changed

```typescript
private async isInternalChange(filePath: string): Promise<{isInternal: boolean}> {
  // First check flag (fast path)
  if (this.ongoingWrites.has(absolutePath)) {
    return { isInternal: true };
  }

  // Second check: compare file content hash with database
  // If content matches what we just wrote → internal change
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const fileHash = createHash('sha256').update(fileContent).digest('hex');

  const dbNote = await this.getNote ByPath(filePath);
  if (dbNote && dbNote.content_hash === fileHash) {
    return { isInternal: true };  // Content matches DB → we wrote it
  }

  return { isInternal: false };
}
```

**Pros:**

- More robust against timing issues
- Works even if flag is cleared
- Catches all cases where content matches our database

**Cons:**

- Requires file read on every change (slower)
- Requires database query
- May not catch rapid sequential edits correctly

### Solution 3: Extended Flag Duration

**Goal:** Keep flag set longer to cover all edge cases

Changes:

- Increase `WRITE_FLAG_CLEANUP_MS` from 1000ms to 2000ms or 3000ms
- This gives more buffer for chokidar delays and debouncing

**Pros:**

- Minimal code changes
- May fix timing-related false positives

**Cons:**

- Doesn't fix underlying race conditions
- May mask problems rather than solve them
- Could miss genuine external edits that happen soon after internal ones

### Solution 4: Write Transaction IDs

**Goal:** Track each write with a unique ID, not just a boolean flag

```typescript
private ongoingWrites = new Map<string, Set<string>>(); // path → Set of transaction IDs

markWriteStarting(filePath: string, transactionId: string): void {
  if (!this.ongoingWrites.has(filePath)) {
    this.ongoingWrites.set(filePath, new Set());
  }
  this.ongoingWrites.get(filePath)!.add(transactionId);
}

markWriteComplete(filePath: string, transactionId: string): void {
  setTimeout(() => {
    const transactions = this.ongoingWrites.get(filePath);
    if (transactions) {
      transactions.delete(transactionId);
      if (transactions.size === 0) {
        this.ongoingWrites.delete(filePath);
      }
    }
  }, this.WRITE_FLAG_CLEANUP_MS);
}

isInternalChange(filePath: string): boolean {
  const transactions = this.ongoingWrites.get(filePath);
  return transactions !== undefined && transactions.size > 0;
}
```

**Pros:**

- Handles multiple concurrent writes to same file
- More precise tracking
- Solves overlapping write scenarios

**Cons:**

- More complex
- Requires threading transaction IDs through all write paths

## Recommendation

**Implement Solution 1 (Unified Write Queue) + Solution 2 (Content-Based Fallback)**

### Phase 1: Unified Write Queue

1. Refactor search-manager to use shared FileWriteQueue
2. Eliminate immediate normalization writes
3. All writes debounced consistently

### Phase 2: Content-Based Fallback

1. Add content hash comparison as fallback in `isInternalChange()`
2. Use as safety net for edge cases
3. Log when fallback is used to identify remaining issues

### Phase 3: Path Normalization

1. Add explicit path normalization function
2. Use `path.normalize()` and resolve symlinks with `fs.realpath()`
3. Ensure consistent path comparison

### Phase 4: Monitoring

1. Add detailed logging for write tracking
2. Log transaction timings
3. Alert on any external-change events for recently-saved notes

## Testing Strategy

1. **Unit Tests:**
   - Test `isInternalChange()` with various timing scenarios
   - Test path normalization edge cases
   - Test multiple concurrent writes

2. **Integration Tests:**
   - Rapid sequential edits
   - Edit during pending write
   - Normalization during user edit
   - Symlinked files

3. **Manual Testing:**
   - Type rapidly in editor
   - Save note with missing frontmatter fields
   - Edit note in both Flint and external editor simultaneously
   - Monitor for false positives

## Migration Considerations

- This is an internal fix, no user migration needed
- May want to add user-facing setting: "external edit sensitivity" (strict vs lenient)
- Consider adding "Reload" button to notification for manual resolution

---

## Implementation Progress & Current Status

### Phase 1: Unified Write Queue ✅ COMPLETED

**Implemented Changes:**

1. **Unified FileWriteQueue** (src/server/core/notes.ts:141-440)
   - All writes now go through single debounced queue
   - Added `expectedContent: Map<string, Set<string>>` to track content hashes
   - 10-minute TTL for hash cleanup (600000ms)

2. **search-manager Integration** (src/server/database/search-manager.ts:179-206)
   - Added `fileWriteQueue` property
   - Modified `writeFileWithTracking()` to use shared queue
   - Eliminated immediate normalization writes

3. **Path Normalization** (src/server/core/notes.ts:184-186)
   - All paths normalized with `path.resolve()` before use as Map keys
   - Ensures consistent path comparison across all operations

### Phase 2: Content-Based Verification ✅ COMPLETED

**Implemented Changes:**

1. **Hash Tracking in queueWrite** (src/server/core/notes.ts:209-213)

   ```typescript
   if (!this.expectedContent.has(normalizedPath)) {
     this.expectedContent.set(normalizedPath, new Set());
   }
   this.expectedContent.get(normalizedPath)!.add(contentHash);
   ```

2. **Content Verification in File Watcher** (src/server/core/file-watcher.ts:256-298)
   - Two-tier check: flag-based (fast) + content-based (robust)
   - Reads file and computes SHA-256 hash
   - Compares against `expectedContent` Map
   - Falls back to content check if flag expires

3. **Cleanup Timer Synchronization** (src/server/core/notes.ts:261-303)
   - Cleanup timer starts AFTER write completes (not when queued)
   - Synchronized with Chokidar's timing
   - 10-minute buffer for delayed file system events

### Current Issue: Hash Set Not Accumulating 🔴 IN PROGRESS

**Discovery (Nov 2025):**

During rapid editing, the `expectedContent` Map should accumulate multiple hashes in the Set for a file path. However, logs show:

```
[FileWriteQueue] Queue: ... Tracked (1): [sha256:9393c]
[FileWriteQueue] Queue: ... Tracked (1): [sha256:660e4]
[FileWriteQueue] Queue: ... Tracked (1): [sha256:c9d14]
```

Every queue operation shows **only 1 hash** in the Set, indicating:

- Previous hashes are being removed before the next queue
- But cleanup is scheduled for 600000ms (10 minutes) in the future
- Something is deleting Map entries prematurely

**Current Hypothesis:**

Potential causes being investigated:

1. **Path Normalization Variation**: `path.resolve()` might return slightly different strings for the same file across calls
2. **Map Entry Deletion**: Something is calling `this.expectedContent.delete(normalizedPath)` between queues
3. **Set Replacement**: Instead of adding to existing Set, we might be creating new Sets

**Investigation Tools Added:**

1. **Pre-Queue State Logging** (src/server/core/notes.ts:191-204)

   ```typescript
   console.log(
     `[FileWriteQueue] Queue START:`,
     `\n  Map has path: ${beforeHas}`,
     `\n  Existing hashes: [${beforeHashes}]`
   );
   ```

2. **Detailed Cleanup Logging** (src/server/core/notes.ts:264-302)
   - Logs Set state BEFORE cleanup
   - Shows whether hash was present
   - Shows Set state AFTER cleanup
   - Logs when path is deleted from Map

3. **Corruption Detection** (src/server/core/notes.ts:226-237)
   - Verifies hash is still in Map at end of queueWrite
   - Catches if hash mysteriously disappears

**Expected Next Steps:**

1. Collect logs showing Map state before each queue
2. Identify if path exists but with different normalization
3. Check if cleanup timers are firing prematurely
4. Verify if something else is modifying `expectedContent`

**Success Criteria:**

- During rapid edits, Set should show: `Tracked (3): [hash1, hash2, hash3]`
- Hashes should accumulate until cleanup fires after 10 minutes
- No false positives when file watcher checks content

### Known Working Components:

1. ✅ **Flag-based detection**: Works for immediate checks
2. ✅ **Path normalization**: Paths are consistent within operations
3. ✅ **Unified queue**: All writes go through same code path
4. ✅ **Content hashing**: SHA-256 hashes generated correctly
5. ✅ **Timer scheduling**: Cleanup scheduled at correct time

### Unknown/Broken Components:

1. ❌ **Hash accumulation**: Set only contains 1 hash at a time
2. ❓ **Cleanup firing**: No cleanup logs seen despite writes completing
3. ❓ **Map persistence**: Entries appear to vanish between operations
