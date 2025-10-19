# External Edit Handling Architecture

## Problem Statement

Flint currently does not handle external edits to markdown files in the vault. When a user edits a note outside of Flint (e.g., in VSCode, via git operations, or through filesystem operations), the following issues occur:

1. **Stale Database**: Flint's SQLite database becomes out of sync with filesystem
2. **Broken Links**: Renaming files externally breaks wikilinks without updating references
3. **Missing Content**: Content changes aren't reflected in search index or UI
4. **Metadata Drift**: Frontmatter changes don't update the database
5. **File Renames/Moves**: Moving files between directories isn't detected
6. **Deletions**: Deleted files remain in database and UI

This is a **prerequisite** for multi-device sync, as synced changes from other devices will manifest as filesystem changes that must be detected and processed.

---

## Design Principles

### 1. Filesystem is Source of Truth

From the user's perspective, the markdown files in their vault folder are the canonical data. The database is a cache/index layer.

### 2. Eventual Consistency

The database will eventually reflect the filesystem state. Brief inconsistencies during file operations are acceptable.

### 3. Non-Destructive

File watching should never modify user files without explicit user action. Only read and index.

### 4. Robust Error Handling

File operations can fail or be interrupted. The system must handle partial states gracefully.

---

## Implementation Status

### ✅ Phase 1: Startup Sync (Implemented - 2025-10-19)

**What's Working:**

Flint now detects and syncs filesystem changes on vault startup using a hybrid mtime + content hash approach.

**Database Changes:**

- Added `file_mtime BIGINT` column to notes table
- Automatic migration for existing databases
- All note operations now track filesystem modification time

**Sync Algorithm (`syncFileSystemChanges`):**

1. **Fast Filter (mtime)**: Compare filesystem mtime with stored mtime
   - Skip files where `fs_mtime <= db_mtime` (no read needed)
   - Only check files with newer mtime

2. **Reliable Verification (content hash)**: For files with newer mtime
   - Read file and compute SHA256 hash
   - Compare with stored content_hash
   - If hash differs → content changed, reindex
   - If hash matches → just touched, update mtime only

3. **Comprehensive Detection**:
   - ✅ New files (not in database) → indexed
   - ✅ Modified files (content hash changed) → reindexed
   - ✅ Touched files (mtime changed, content same) → mtime updated
   - ✅ Deleted files (in DB but not on disk) → removed

**Performance:**

- Fast: Most unchanged files skipped via mtime check
- Reliable: Content hash catches git operations, clock skew, reverts
- Efficient: Batch processing with progress callbacks

**Example Startup Logs:**

```
Hybrid search index ready (150 notes indexed)
Syncing filesystem changes: 3 new, 2 updated, 1 deleted
```

**Integration:**

- Runs automatically on vault initialization (unless index empty → full rebuild)
- Works seamlessly with ID normalization (auto-generates missing IDs)
- Handles frontmatter normalization (type, id fields)

**Code Locations:**

- `src/server/database/schema.ts` - Database schema and migration
- `src/server/database/search-manager.ts` - Sync implementation
  - `syncFileSystemChanges()` - Main sync method
  - `handleIndexRebuild()` - Startup integration

### 🚧 Phase 2: Real-time Watching (Planned)

The following sections describe the planned implementation for real-time file watching while Flint is running.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  Filesystem (Vault Directory)           │
│  - User edits files externally          │
│  - Git operations                       │
│  - Sync from other devices              │
└──────────────┬──────────────────────────┘
               │ File System Events
               ↓
┌─────────────────────────────────────────┐
│  File Watcher (chokidar)                │
│  - Detects: add, change, unlink, rename │
│  - Debounces rapid changes              │
│  - Filters ignored paths                │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  Change Processor                       │
│  - Distinguishes internal vs external   │
│  - Parses frontmatter + content         │
│  - Extracts links and metadata          │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  Database Updater                       │
│  - Updates notes table                  │
│  - Rebuilds search index                │
│  - Updates link graph                   │
│  - Maintains hierarchies                │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  UI Notification                        │
│  - Notifies renderer of changes         │
│  - Triggers view refresh                │
│  - Shows toast for user awareness       │
└─────────────────────────────────────────┘
```

---

## Implementation Details

### 1. File Watcher Setup

**Technology:** Use `chokidar` for cross-platform file watching.

```typescript
import chokidar from 'chokidar';

interface FileWatcherConfig {
  vaultPath: string;
  ignored?: string[];
  debounceMs?: number;
}

class VaultFileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private pendingChanges = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_MS = 100;

  async start(config: FileWatcherConfig): Promise<void> {
    this.watcher = chokidar.watch(config.vaultPath, {
      ignored: [
        '**/.flint-note/**', // Flint's internal directory
        '**/.git/**', // Git directory
        '**/node_modules/**', // Node modules
        '**/.DS_Store', // macOS metadata
        '**/desktop.ini', // Windows metadata
        '**/*~', // Backup files
        ...(config.ignored || [])
      ],
      ignoreInitial: true, // Don't fire events for existing files
      persistent: true, // Keep process running
      awaitWriteFinish: {
        // Wait for write operations to complete
        stabilityThreshold: 200, // Wait 200ms of no changes
        pollInterval: 100 // Check every 100ms
      }
    });

    // Handle file events
    this.watcher
      .on('add', (path) => this.onFileAdded(path))
      .on('change', (path) => this.onFileChanged(path))
      .on('unlink', (path) => this.onFileDeleted(path))
      .on('addDir', (path) => this.onDirectoryAdded(path))
      .on('unlinkDir', (path) => this.onDirectoryDeleted(path));

    // Special handling for renames (detected as unlink + add)
    // Track recent deletions to detect renames
    this.watcher.on('raw', (event, path, details) => {
      if (event === 'rename') {
        this.onFileRenamed(path, details);
      }
    });
  }

  private debounceChange(path: string, handler: () => void): void {
    // Clear existing timeout for this path
    const existing = this.pendingChanges.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      handler();
      this.pendingChanges.delete(path);
    }, this.DEBOUNCE_MS);

    this.pendingChanges.set(path, timeout);
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Clear all pending changes
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
  }
}
```

### 2. Distinguishing Internal vs External Changes

**Problem:** When Flint writes a file, the file watcher fires. We need to ignore these self-caused changes.

**Solution:** Track file modification times and operation IDs.

```typescript
interface FileOperationTracker {
  // Track ongoing write operations by Flint
  operations: Map<
    string,
    {
      type: 'write' | 'rename' | 'delete';
      startedAt: number;
      expectedMtime?: number;
    }
  >;
}

class ChangeProcessor {
  private tracker: FileOperationTracker = { operations: new Map() };

  // Call this before Flint writes a file
  async trackWrite(path: string): Promise<void> {
    const absolutePath = path.normalize();
    this.tracker.operations.set(absolutePath, {
      type: 'write',
      startedAt: Date.now()
    });
  }

  // Call this after Flint writes a file
  async completeWrite(path: string, stats: fs.Stats): Promise<void> {
    const absolutePath = path.normalize();
    const op = this.tracker.operations.get(absolutePath);
    if (op) {
      op.expectedMtime = stats.mtimeMs;

      // Clean up after 5 seconds (safety timeout)
      setTimeout(() => {
        this.tracker.operations.delete(absolutePath);
      }, 5000);
    }
  }

  // Check if a change event is from Flint itself
  isInternalChange(path: string, stats: fs.Stats): boolean {
    const absolutePath = path.normalize();
    const op = this.tracker.operations.get(absolutePath);

    if (!op) return false;

    // Check if modification time matches what we expect
    if (op.expectedMtime && Math.abs(stats.mtimeMs - op.expectedMtime) < 1000) {
      // This change is from our recent write operation
      this.tracker.operations.delete(absolutePath);
      return true;
    }

    // Check if operation just started (within 2 seconds)
    if (Date.now() - op.startedAt < 2000) {
      return true;
    }

    return false;
  }
}
```

### 3. Processing File Changes

```typescript
class FileChangeHandler {
  async onFileChanged(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);

      // Ignore if this is our own change
      if (this.changeProcessor.isInternalChange(filePath, stats)) {
        console.log(`Ignoring internal change: ${filePath}`);
        return;
      }

      console.log(`External change detected: ${filePath}`);

      // Read and parse file
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.noteManager.parseNoteContent(content);

      // Extract note ID from frontmatter
      const noteId = parsed.metadata.id as string;
      if (!noteId) {
        console.warn(`Note missing ID in frontmatter: ${filePath}`);
        // Generate ID if missing
        const newId = this.noteManager.generateNoteId();
        parsed.metadata.id = newId;

        // Write back with ID
        const updatedContent = this.noteManager.formatUpdatedNoteContent(
          parsed.metadata,
          parsed.content
        );
        await this.changeProcessor.trackWrite(filePath);
        await fs.writeFile(filePath, updatedContent, 'utf-8');
        await this.changeProcessor.completeWrite(filePath, await fs.stat(filePath));
      }

      // Update database
      await this.updateDatabase(noteId, filePath, parsed, stats);

      // Notify UI
      this.notifyUI('note.changed', { noteId, path: filePath });
    } catch (error) {
      console.error(`Failed to process file change: ${filePath}`, error);
      // Don't throw - continue processing other files
    }
  }

  private async updateDatabase(
    noteId: string,
    filePath: string,
    parsed: ParsedNote,
    stats: fs.Stats
  ): Promise<void> {
    // Update note in database
    const relativePath = path.relative(this.workspace.rootPath, filePath);
    const pathParts = relativePath.split(path.sep);
    const typeName = pathParts[0];
    const filename = pathParts.slice(1).join(path.sep);

    await this.hybridSearchManager.upsertNote(
      noteId,
      parsed.metadata.title || filename.replace('.md', ''),
      parsed.content,
      typeName,
      filename,
      filePath,
      parsed.metadata
    );

    // Update link graph
    await this.updateLinkGraph(noteId, parsed.content);
  }

  private async updateLinkGraph(noteId: string, content: string): Promise<void> {
    const db = await this.hybridSearchManager.getDatabaseConnection();

    // Extract links from content
    const extractionResult = LinkExtractor.extractLinks(content);

    // Store links in database
    await LinkExtractor.storeLinks(noteId, extractionResult, db);
  }
}
```

### 4. Handling Renames

**Scenario:** User renames `project/alpha.md` → `project/beta.md` in Finder.

**Detection Strategy:**

1. File watcher fires: `unlink(alpha.md)` then `add(beta.md)`
2. Check if new file has same note ID as recently deleted file
3. If yes, this is a rename; update database references

```typescript
class RenameDetector {
  private recentDeletions = new Map<
    string,
    {
      noteId: string;
      deletedAt: number;
      oldPath: string;
    }
  >();

  private readonly RENAME_DETECTION_WINDOW_MS = 1000; // 1 second

  async onFileDeleted(filePath: string): Promise<void> {
    // Try to read note ID before it's gone
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.noteManager.parseNoteContent(content);
      const noteId = parsed.metadata.id as string;

      if (noteId) {
        this.recentDeletions.set(noteId, {
          noteId,
          deletedAt: Date.now(),
          oldPath: filePath
        });

        // Clean up after detection window
        setTimeout(() => {
          this.recentDeletions.delete(noteId);
        }, this.RENAME_DETECTION_WINDOW_MS);
      }
    } catch (error) {
      // File already gone, can't detect rename
    }

    // Process as deletion (will be undone if rename detected)
    await this.processFileDeletion(filePath);
  }

  async onFileAdded(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.noteManager.parseNoteContent(content);
      const noteId = parsed.metadata.id as string;

      // Check if this is a renamed file
      const recentDeletion = this.recentDeletions.get(noteId);
      if (recentDeletion) {
        // This is a rename!
        console.log(`Rename detected: ${recentDeletion.oldPath} → ${filePath}`);

        await this.processFileRename(noteId, recentDeletion.oldPath, filePath, parsed);

        this.recentDeletions.delete(noteId);
        this.notifyUI('note.renamed', {
          noteId,
          oldPath: recentDeletion.oldPath,
          newPath: filePath
        });

        return;
      }

      // Not a rename, process as new file
      await this.processFileAddition(filePath, parsed);
    } catch (error) {
      console.error(`Failed to process file addition: ${filePath}`, error);
    }
  }

  private async processFileRename(
    noteId: string,
    oldPath: string,
    newPath: string,
    parsed: ParsedNote
  ): Promise<void> {
    // Extract new filename from path
    const newFilename = path.basename(newPath, '.md');
    const relativePath = path.relative(this.workspace.rootPath, newPath);
    const pathParts = relativePath.split(path.sep);
    const typeName = pathParts[0];

    // Update frontmatter to reflect new filename
    if (parsed.metadata.filename !== newFilename) {
      parsed.metadata.filename = newFilename;
      parsed.metadata.updated = new Date().toISOString();

      // Write back updated frontmatter
      const updatedContent = this.noteManager.formatUpdatedNoteContent(
        parsed.metadata,
        parsed.content
      );

      await this.changeProcessor.trackWrite(newPath);
      await fs.writeFile(newPath, updatedContent, 'utf-8');
      const stats = await fs.stat(newPath);
      await this.changeProcessor.completeWrite(newPath, stats);
    }

    // Update database with new path and filename
    await this.hybridSearchManager.upsertNote(
      noteId,
      parsed.metadata.title || newFilename,
      parsed.content,
      typeName,
      path.basename(newPath),
      newPath,
      parsed.metadata
    );

    // Update any wikilinks that referenced the old filename
    await this.updateWikilinksForRename(
      noteId,
      path.basename(oldPath, '.md'),
      newFilename
    );
  }
}
```

### 5. Handling Link Updates

When a note is renamed, wikilinks in other notes may need updating:

```markdown
Before rename:
[[Project Alpha]] → References note with title "Project Alpha"

After rename (title changes to "Alpha Initiative"):
[[Project Alpha]] → Broken link (title no longer matches)

Should update to:
[[Alpha Initiative]] → Working link
```

**Strategy:**

1. Wikilinks use note IDs internally (in database)
2. Display text uses current title
3. When title changes, links still resolve via ID
4. Optionally update markdown text to reflect new title

```typescript
class WikilinkUpdater {
  async updateLinksForRenamedNote(
    noteId: string,
    oldTitle: string,
    newTitle: string
  ): Promise<{ filesUpdated: number; linksUpdated: number }> {
    const db = await this.hybridSearchManager.getDatabaseConnection();

    // Find all notes that link to this note
    const linkingNotes = await db.all<{ source_note_id: string; source_path: string }>(
      `SELECT DISTINCT n.id as source_note_id, n.path as source_path
       FROM note_links nl
       JOIN notes n ON n.id = nl.source_note_id
       WHERE nl.target_note_id = ?`,
      [noteId]
    );

    let filesUpdated = 0;
    let linksUpdated = 0;

    for (const linkingNote of linkingNotes) {
      try {
        const content = await fs.readFile(linkingNote.source_path, 'utf-8');

        // Replace wikilinks with old title
        const oldLinkPattern = new RegExp(`\\[\\[${escapeRegex(oldTitle)}\\]\\]`, 'g');
        let updatedContent = content;
        let changeCount = 0;

        updatedContent = updatedContent.replace(oldLinkPattern, () => {
          changeCount++;
          return `[[${newTitle}]]`;
        });

        if (changeCount > 0) {
          // Write updated content
          await this.changeProcessor.trackWrite(linkingNote.source_path);
          await fs.writeFile(linkingNote.source_path, updatedContent, 'utf-8');
          const stats = await fs.stat(linkingNote.source_path);
          await this.changeProcessor.completeWrite(linkingNote.source_path, stats);

          filesUpdated++;
          linksUpdated += changeCount;
        }
      } catch (error) {
        console.error(`Failed to update links in ${linkingNote.source_path}:`, error);
      }
    }

    return { filesUpdated, linksUpdated };
  }
}
```

---

## Edge Cases and Handling

### 1. **Rapid Successive Edits**

**Problem:** User saves file multiple times quickly.

**Solution:** Debounce file change events (100-200ms).

### 2. **Large File Operations** (e.g., git checkout)

**Problem:** Hundreds of files change simultaneously.

**Solution:**

- Batch process changes in groups of 10-20
- Show progress indicator in UI
- Allow user to cancel/pause processing

### 3. **Frontmatter Corruption**

**Problem:** User manually edits frontmatter incorrectly.

**Solution:**

- Gracefully parse with fallbacks
- Log warnings for invalid YAML
- Preserve original file, don't auto-fix
- Show notification: "Invalid frontmatter in note X"

### 4. **ID Conflicts**

**Problem:** Two notes end up with same ID (rare, but possible with manual editing or merges).

**Solution:**

```typescript
async function detectAndResolveIdConflicts(): Promise<void> {
  const db = await this.hybridSearchManager.getDatabaseConnection();

  // Find duplicate IDs
  const duplicates = await db.all<{ id: string; count: number }>(
    `SELECT id, COUNT(*) as count
     FROM notes
     GROUP BY id
     HAVING count > 1`
  );

  for (const dup of duplicates) {
    console.warn(`Duplicate note ID detected: ${dup.id}`);

    // Get all notes with this ID
    const notes = await db.all<{ path: string }>(`SELECT path FROM notes WHERE id = ?`, [
      dup.id
    ]);

    // Keep first note, reassign IDs to others
    for (let i = 1; i < notes.length; i++) {
      const newId = this.noteManager.generateNoteId();
      await this.reassignNoteId(notes[i].path, newId);
    }
  }
}
```

### 5. **Missing Frontmatter ID**

**Problem:** Note exists without an ID (legacy or manually created).

**Solution:** Auto-generate and inject ID when first detected.

```typescript
async function ensureNoteHasId(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = this.noteManager.parseNoteContent(content);

  if (!parsed.metadata.id) {
    // Generate new ID
    const newId = this.noteManager.generateNoteId();
    parsed.metadata.id = newId;

    // Write back with ID
    const updatedContent = this.noteManager.formatUpdatedNoteContent(
      parsed.metadata,
      parsed.content
    );

    await this.changeProcessor.trackWrite(filePath);
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    await this.changeProcessor.completeWrite(filePath, await fs.stat(filePath));

    console.log(`Generated ID for note: ${filePath} → ${newId}`);
    return newId;
  }

  return parsed.metadata.id as string;
}
```

---

## Integration Points

### 1. **Electron Main Process**

- File watcher runs in main process (has filesystem access)
- Communicates with renderer via IPC for UI updates

### 2. **Note Manager**

- Add hooks for external change notifications
- Expose `processExternalChange(filePath)` method

### 3. **Database Manager**

- Ensure upsert operations are idempotent
- Handle concurrent updates gracefully

### 4. **UI/Renderer**

- Subscribe to file change events
- Refresh views when external changes detected
- Show non-intrusive notifications

---

## Testing Strategy

### Unit Tests

```typescript
describe('FileChangeHandler', () => {
  it('should detect external content changes', async () => {
    // Externally modify file
    await fs.writeFile(notePath, updatedContent);

    // Wait for change detection
    await waitFor(() => expect(db.getNote(noteId).content).toBe(updatedContent));
  });

  it('should ignore internal changes', async () => {
    const spy = jest.spyOn(handler, 'processExternalChange');

    // Change via Flint's API
    await noteManager.updateNote(noteId, newContent, contentHash);

    // Should not trigger external change handler
    expect(spy).not.toHaveBeenCalled();
  });

  it('should detect renames', async () => {
    const oldPath = 'project/alpha.md';
    const newPath = 'project/beta.md';

    // Rename file
    await fs.rename(oldPath, newPath);

    // Wait for detection
    await waitFor(() => {
      const note = db.getNote(noteId);
      expect(note.path).toBe(newPath);
      expect(note.filename).toBe('beta.md');
    });
  });
});
```

### Integration Tests

```typescript
describe('External Edit Integration', () => {
  it('should maintain database consistency after external edits', async () => {
    // Create note via Flint
    const noteId = await noteManager.createNote('test', 'Original', 'Content');

    // Edit externally
    const notePath = /* ... */;
    await fs.writeFile(notePath, '---\nid: ' + noteId + '\ntitle: Modified\n---\n\nNew content');

    // Wait for sync
    await waitFor(() => {
      const note = noteManager.getNote(noteId);
      expect(note.title).toBe('Modified');
      expect(note.content).toBe('New content');
    });

    // Verify search index updated
    const results = await searchManager.searchNotes('New content');
    expect(results).toContainEqual(expect.objectContaining({ id: noteId }));
  });
});
```

---

## Performance Considerations

### 1. **Debouncing**

- Debounce rapid changes (100-200ms)
- Batch process multiple pending changes

### 2. **Selective Indexing**

- Only re-index changed notes
- Don't rebuild entire database on single file change

### 3. **Async Processing**

- Process file changes in background
- Don't block main thread or UI

### 4. **Memory Management**

- Limit size of recent operations tracking
- Clean up old entries periodically

---

## Future Enhancements

### 1. **Git Integration**

- Detect git operations (checkout, pull, merge)
- Batch process all changes from git operation
- Show "Syncing from git..." progress

### 2. **Conflict Resolution UI**

- When external edit conflicts with unsaved local changes
- Show diff view with merge options

### 3. **Smart Link Updating**

- Optionally update wikilinks when titles change
- User preference: auto-update vs manual review

### 4. **Undo External Changes**

- Track file history
- Allow user to revert external changes
- "This note was modified externally. [Revert] [Keep]"

---

## Summary

### Current Implementation (Phase 1)

**Implemented ✅:**

1. **Startup sync** with hybrid mtime + content hash detection
2. **Change detection** for new, modified, and deleted files
3. **Database updates** with automatic migration
4. **ID normalization** for imported/external notes
5. **Error handling** for missing files and edge cases
6. **Performance optimization** via mtime-based filtering

**Working Today:**

- ✅ External edits synced on vault startup
- ✅ Git operations (checkout, pull, merge) detected
- ✅ Multi-device compatible (detects synced changes)
- ✅ Handles Readwise imports and external note creation
- ✅ Graceful handling of clock skew, file touching, content reverts

### Planned Implementation (Phase 2)

**Not Yet Implemented 🚧:**

1. **Real-time file watching** (chokidar) while Flint is running
2. **Internal vs external change tracking** to avoid self-triggers
3. **Rename detection** using ID tracking
4. **Link graph updates** when files are renamed
5. **UI notifications** for user awareness of external changes
6. **Conflict resolution** when external edits clash with unsaved local changes

**Phase 2 Benefits:**

- Real-time sync without restarting Flint
- Immediate UI updates when files change externally
- Better UX for git workflows (see changes instantly)
- Live collaboration potential (multiple editors on same vault)

### Architecture Benefits

This two-phase architecture provides:

**Today (Phase 1):**

- ✅ Reliable startup sync for external editors
- ✅ Git workflow compatibility
- ✅ Multi-device sync foundation
- ✅ Import workflow support (Readwise, etc.)

**Future (Phase 2):**

- 🚧 Real-time external edit detection
- 🚧 Live collaboration support
- 🚧 Advanced conflict resolution
- 🚧 Rename and link maintenance
