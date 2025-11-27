/**
 * Tests for HybridSearchManager filesystem sync functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { HybridSearchManager } from '../../../src/server/database/search-manager.js';

describe('HybridSearchManager - Filesystem Sync', () => {
  let searchManager: HybridSearchManager;
  let testWorkspacePath: string;

  beforeEach(async () => {
    // Create temporary workspace
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    testWorkspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), `flint-sync-test-${uniqueId}-`)
    );

    // Initialize search manager (it creates its own DatabaseManager)
    searchManager = new HybridSearchManager(testWorkspacePath);
  });

  afterEach(async () => {
    // Cleanup
    if (searchManager) {
      await searchManager.close();
    }
    await fs.rm(testWorkspacePath, { recursive: true, force: true });
  });

  describe('syncFileSystemChanges', () => {
    it('should detect new files added to filesystem', async () => {
      // Create initial note structure
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const note1Path = path.join(noteDir, 'test1.md');
      await fs.writeFile(
        note1Path,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note 1\n\nContent here.'
      );

      // Index the first note
      await searchManager.rebuildIndex();

      // Add a second note directly to filesystem (simulating external edit)
      const note2Path = path.join(noteDir, 'test2.md');
      await fs.writeFile(
        note2Path,
        '---\nid: n-00000002\ntype: note\n---\n# Test Note 2\n\nNew content.'
      );

      // Sync filesystem changes
      const result = await searchManager.syncFileSystemChanges();

      // Verify new file was detected
      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);

      // Verify note is searchable
      const response = await searchManager.searchNotes('Test Note 2');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].id).toBe('n-00000002');
    });

    it('should detect modified files using hybrid mtime+hash check', async () => {
      // Create and index initial note
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note\n\nOriginal content.'
      );

      await searchManager.rebuildIndex();

      // Wait a bit to ensure mtime differs
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify the note externally
      await fs.writeFile(
        notePath,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note\n\nModified content!'
      );

      // Sync filesystem changes
      const result = await searchManager.syncFileSystemChanges();

      // Verify file was detected as modified
      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(0);

      // Verify updated content is indexed
      const response = await searchManager.searchNotes('Modified content');
      expect(response.results.length).toBeGreaterThan(0);
    });

    it('should detect deleted files', async () => {
      // Create and index notes
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const note1Path = path.join(noteDir, 'test1.md');
      const note2Path = path.join(noteDir, 'test2.md');

      await fs.writeFile(
        note1Path,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note 1\n\nContent 1.'
      );
      await fs.writeFile(
        note2Path,
        '---\nid: n-00000002\ntype: note\n---\n# Test Note 2\n\nContent 2.'
      );

      await searchManager.rebuildIndex();

      // Delete one note externally
      await fs.unlink(note2Path);

      // Sync filesystem changes
      const result = await searchManager.syncFileSystemChanges();

      // Verify deletion was detected
      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(1);

      // Verify deleted note is no longer searchable
      const response = await searchManager.searchNotes('Test Note 2');
      expect(response.results.length).toBe(0);

      // Verify other note still exists
      const remainingResponse = await searchManager.searchNotes('Test Note 1');
      expect(remainingResponse.results.length).toBeGreaterThan(0);
    });

    it('should optimize by skipping files with unchanged mtime', async () => {
      // This test verifies the mtime optimization - files with same/older mtime are skipped

      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test.md');
      const content = '---\nid: n-00000001\ntype: note\n---\n# Test Note\n\nContent.';

      await fs.writeFile(notePath, content);
      await searchManager.rebuildIndex();

      // WITHOUT modifying the file, sync again
      // The mtime should be unchanged, so the file should be skipped entirely
      const result = await searchManager.syncFileSystemChanges();

      // Should detect no changes
      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should use relative paths for comparison (not absolute)', async () => {
      // This test explicitly verifies the bug fix - that paths are normalized

      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note\n\nContent.'
      );

      // Index the note
      await searchManager.rebuildIndex();

      // Get the indexed note from database
      const db = await searchManager.getConnection();
      const indexedNotes = await db.all<{ path: string }>('SELECT path FROM notes');

      // Verify database stores relative paths
      expect(indexedNotes.length).toBe(1);
      expect(indexedNotes[0].path).toBe('note/test.md');
      expect(indexedNotes[0].path).not.toContain(testWorkspacePath);

      // Sync should not detect any changes (paths match correctly)
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should skip files with unchanged mtime (optimization)', async () => {
      // Create and index note
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note\n\nContent.'
      );

      await searchManager.rebuildIndex();

      // Sync again without any changes
      const result = await searchManager.syncFileSystemChanges();

      // Should detect no changes (mtime optimization working)
      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should handle multiple simultaneous changes', async () => {
      // Create initial notes
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const note1Path = path.join(noteDir, 'test1.md');
      const note2Path = path.join(noteDir, 'test2.md');

      await fs.writeFile(
        note1Path,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note 1\n\nContent 1.'
      );
      await fs.writeFile(
        note2Path,
        '---\nid: n-00000002\ntype: note\n---\n# Test Note 2\n\nContent 2.'
      );

      await searchManager.rebuildIndex();

      // Wait for mtime to differ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate external changes:
      // - Modify test1.md
      await fs.writeFile(
        note1Path,
        '---\nid: n-00000001\ntype: note\n---\n# Test Note 1\n\nModified!'
      );

      // - Delete test2.md
      await fs.unlink(note2Path);

      // - Add test3.md
      const note3Path = path.join(noteDir, 'test3.md');
      await fs.writeFile(
        note3Path,
        '---\nid: n-00000003\ntype: note\n---\n# Test Note 3\n\nNew!'
      );

      // Sync all changes
      const result = await searchManager.syncFileSystemChanges();

      // Verify all changes detected
      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(1);

      // Verify database state
      const allResponse = await searchManager.searchNotes('Test Note');
      expect(allResponse.results.length).toBe(2); // test1 (modified) and test3 (new)
    });

    it('should handle notes in subdirectories', async () => {
      // Create notes in different type directories
      const noteDir = path.join(testWorkspacePath, 'note');
      const dailyDir = path.join(testWorkspacePath, 'daily');

      await fs.mkdir(noteDir, { recursive: true });
      await fs.mkdir(dailyDir, { recursive: true });

      await fs.writeFile(
        path.join(noteDir, 'test.md'),
        '---\nid: n-00000001\ntype: note\n---\n# Note\n\nContent.'
      );
      await fs.writeFile(
        path.join(dailyDir, '2025-01-01.md'),
        '---\nid: n-00000002\ntype: daily\n---\n# Daily\n\nContent.'
      );

      await searchManager.rebuildIndex();

      // Add new notes to both directories
      await fs.writeFile(
        path.join(noteDir, 'test2.md'),
        '---\nid: n-00000003\ntype: note\n---\n# Note 2\n\nContent.'
      );
      await fs.writeFile(
        path.join(dailyDir, '2025-01-02.md'),
        '---\nid: n-00000004\ntype: daily\n---\n# Daily 2\n\nContent.'
      );

      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);

      // Verify both directories were scanned
      const allResponse = await searchManager.searchNotes('Content');
      expect(allResponse.results.length).toBe(4);
    });

    it('should handle notes without IDs via normalization', async () => {
      // Create note without ID (like Readwise import)
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'imported.md');
      await fs.writeFile(notePath, '---\ntype: note\n---\n# Imported Note\n\nNo ID yet.');

      // Sync should add it and normalize ID
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify ID was generated and written to frontmatter
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/id: n-[a-f0-9]{8}/);

      // Verify it's searchable
      const response = await searchManager.searchNotes('Imported Note');
      expect(response.results.length).toBe(1);
      expect(response.results[0].id).toMatch(/^n-[a-f0-9]{8}$/);
    });

    it('should keep missing title empty (not generate from filename)', async () => {
      // Create note without title field
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'my-awesome-note.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-12345678\ntype: note\n---\n\nContent here.'
      );

      // Sync should add it without modifying title
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify title was NOT generated from filename (file unchanged for title)
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).not.toMatch(/flint_title:/);

      // Note should still be indexed with empty title
      const response = await searchManager.searchNotes('Content here');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('');
    });

    it('should keep empty title empty (not generate from filename)', async () => {
      // Create note with empty title field
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'camelCaseFileName.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-12345678\ntitle:\ntype: note\n---\n\nContent here.'
      );

      // Sync should add it without modifying title
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify title field was NOT modified (still empty)
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/flint_title:\n/);
      expect(content).not.toMatch(/flint_title: Camel/);

      // Note should still be indexed with empty title
      const response = await searchManager.searchNotes('Content here');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('');
    });

    it('should not modify file for missing title field', async () => {
      // Create note to test that files are not modified for missing titles
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test_file-name_example.md');
      const originalContent = '---\nid: n-12345678\ntype: note\n---\n\nContent.';
      await fs.writeFile(notePath, originalContent);

      await searchManager.syncFileSystemChanges();

      // Verify file was not modified for title
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).not.toMatch(/flint_title:/);
    });

    it('should not overwrite existing valid title', async () => {
      // Create note with existing title
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'my-note.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-12345678\ntitle: Custom Title\ntype: note\n---\n\nContent.'
      );

      await searchManager.syncFileSystemChanges();

      // Verify title was NOT changed
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/title: Custom Title/);
      expect(content).not.toMatch(/title: My Note/);
    });

    it('should create frontmatter for notes with no frontmatter at all', async () => {
      // Create note with NO frontmatter (like external files)
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'plain-file.md');
      await fs.writeFile(
        notePath,
        '# Plain File\n\nJust some content with no frontmatter.'
      );

      // Sync should add it and create frontmatter
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify frontmatter was created with id and type (but no flint_title - empty titles allowed)
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/id: n-[a-f0-9]{8}/);
      expect(content).toMatch(/type: note/);
      expect(content).toMatch(/---\n# Plain File/);
      // Title should NOT be generated from filename
      expect(content).not.toMatch(/title: Plain File/);

      // Verify it's searchable by content
      const response = await searchManager.searchNotes('Just some content');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('');
      expect(response.results[0].id).toMatch(/^n-[a-f0-9]{8}$/);
    });
  });

  describe('wikilink normalization on external edits', () => {
    it('should normalize title-based wikilinks to ID-based on external edit', async () => {
      // Create target note first
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });

      const targetPath = path.join(noteDir, 'target.md');
      await fs.writeFile(
        targetPath,
        '---\nid: n-12345678\ntitle: Target Note\ntype: general\n---\n# Target Note\n\nTarget content.'
      );

      // Create source note with title-based wikilink
      const sourcePath = path.join(noteDir, 'source.md');
      await fs.writeFile(
        sourcePath,
        '---\nid: n-87654321\ntitle: Source Note\ntype: general\n---\n# Source Note\n\nSee [[Target Note]] for details.'
      );

      // Index both notes
      await searchManager.rebuildIndex();

      // Wait a bit to ensure mtime differs
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Externally edit source to add another title-based link
      await fs.writeFile(
        sourcePath,
        '---\nid: n-87654321\ntitle: Source Note\ntype: general\n---\n# Source Note\n\nSee [[Target Note]] and [[Target Note|custom display]] for details.'
      );

      // Sync filesystem changes - should trigger normalization
      await searchManager.syncFileSystemChanges();

      // Verify wikilinks were normalized to ID-based
      const content = await fs.readFile(sourcePath, 'utf-8');
      expect(content).toContain('[[n-12345678|Target Note]]');
      expect(content).toContain('[[n-12345678|custom display]]');
      expect(content).not.toContain('See [[Target Note]]'); // Original should be replaced
    });

    it('should handle type/filename wikilinks and normalize them', async () => {
      // Create target note
      const meetingDir = path.join(testWorkspacePath, 'meeting');
      await fs.mkdir(meetingDir, { recursive: true });

      const targetPath = path.join(meetingDir, 'standup.md');
      await fs.writeFile(
        targetPath,
        '---\nid: n-aaaabbbb\ntitle: Daily Standup\ntype: meeting\nfilename: standup\n---\n# Daily Standup\n\nStandup notes.'
      );

      // Create source note with type/filename wikilink
      const generalDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(generalDir, { recursive: true });

      const sourcePath = path.join(generalDir, 'notes.md');
      await fs.writeFile(
        sourcePath,
        '---\nid: n-ccccdddd\ntitle: My Notes\ntype: general\n---\n# My Notes\n\nSee [[meeting/standup]] for standup.'
      );

      // Index both notes
      await searchManager.rebuildIndex();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Externally edit source
      await fs.writeFile(
        sourcePath,
        '---\nid: n-ccccdddd\ntitle: My Notes\ntype: general\n---\n# My Notes\n\nSee [[meeting/standup]] for standup.\nAlso [[meeting/standup|Custom Display]].'
      );

      // Sync should normalize
      await searchManager.syncFileSystemChanges();

      // Verify normalization
      const content = await fs.readFile(sourcePath, 'utf-8');
      expect(content).toContain('[[n-aaaabbbb|meeting/standup]]');
      expect(content).toContain('[[n-aaaabbbb|Custom Display]]');
    });

    it('should preserve wikilinks that cannot be resolved', async () => {
      // Create source note with link to non-existent note
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });

      const sourcePath = path.join(noteDir, 'source.md');
      await fs.writeFile(
        sourcePath,
        '---\nid: n-11111111\ntitle: Source\ntype: general\n---\n# Source\n\nSee [[Nonexistent Note]] for details.'
      );

      // Index
      await searchManager.rebuildIndex();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Externally edit
      await fs.writeFile(
        sourcePath,
        '---\nid: n-11111111\ntitle: Source\ntype: general\n---\n# Source\n\nSee [[Nonexistent Note]] and [[Another Missing]] for details.'
      );

      // Sync
      await searchManager.syncFileSystemChanges();

      // Verify broken links are preserved as-is
      const content = await fs.readFile(sourcePath, 'utf-8');
      expect(content).toContain('[[Nonexistent Note]]');
      expect(content).toContain('[[Another Missing]]');
    });

    it('should normalize only resolvable links in mixed content', async () => {
      // Create one target note
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });

      const targetPath = path.join(noteDir, 'existing.md');
      await fs.writeFile(
        targetPath,
        '---\nid: n-99999999\ntitle: Existing Note\ntype: general\n---\n# Existing Note\n\nExists.'
      );

      // Create source with mix of resolvable and broken links
      const sourcePath = path.join(noteDir, 'mixed.md');
      await fs.writeFile(
        sourcePath,
        '---\nid: n-88888888\ntitle: Mixed\ntype: general\n---\n# Mixed\n\nSee [[Existing Note]] and [[Missing Note]].'
      );

      // Index
      await searchManager.rebuildIndex();

      // Wait
      await new Promise((resolve) => setTimeout(resolve, 100));

      // External edit
      await fs.writeFile(
        sourcePath,
        '---\nid: n-88888888\ntitle: Mixed\ntype: general\n---\n# Mixed\n\nSee [[Existing Note]] and [[Missing Note]] here.'
      );

      // Sync
      await searchManager.syncFileSystemChanges();

      // Verify only resolvable link was normalized
      const content = await fs.readFile(sourcePath, 'utf-8');
      expect(content).toContain('[[n-99999999|Existing Note]]');
      expect(content).toContain('[[Missing Note]]'); // Unchanged
    });

    it('should not normalize already ID-based wikilinks', async () => {
      // Create source note with already ID-based link
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });

      const sourcePath = path.join(noteDir, 'source.md');
      const originalContent =
        '---\nid: n-11111111\ntitle: Source\ntype: general\n---\n# Source\n\nSee [[n-12345678|Already ID-based]] for details.';

      await fs.writeFile(sourcePath, originalContent);

      // Index
      await searchManager.rebuildIndex();

      // Wait
      await new Promise((resolve) => setTimeout(resolve, 100));

      // External edit (just add a word)
      await fs.writeFile(
        sourcePath,
        '---\nid: n-11111111\ntitle: Source\ntype: general\n---\n# Source\n\nSee [[n-12345678|Already ID-based]] for more details.'
      );

      // Sync
      await searchManager.syncFileSystemChanges();

      // Verify ID-based link is unchanged
      const content = await fs.readFile(sourcePath, 'utf-8');
      expect(content).toContain('[[n-12345678|Already ID-based]]');
    });
  });

  describe('upsert conflict detection and resolution', () => {
    it('should detect and resolve ID conflict when same (type, filename) exists with different ID', async () => {
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });
      const testPath = path.join(noteDir, 'conflict-test.md');

      // First, create a note with a specific ID in the database
      const oldId = 'n-oldid123';
      const db = await searchManager.getDatabaseConnection();
      await db.run(
        `INSERT INTO notes (id, type, filename, path, title, content, created, updated, size, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          oldId,
          'general',
          'conflict-test.md',
          'conflict-test.md',
          'Old Title',
          'Old content',
          '2024-01-01',
          '2024-01-01',
          100,
          'oldhash'
        ]
      );

      // Verify the old note exists
      let notes = await db.all('SELECT id, title FROM notes WHERE filename = ?', [
        'conflict-test.md'
      ]);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(oldId);
      expect(notes[0].title).toBe('Old Title');

      // Now create a file with a DIFFERENT ID in frontmatter but same (type, filename)
      const newId = 'n-newidabc';
      await fs.writeFile(
        testPath,
        `---
id: ${newId}
title: New Title
type: general
---
# New Title

New content with different ID.`
      );

      // Sync - this should detect the conflict and resolve it
      await searchManager.syncFileSystemChanges();

      // Verify the old note was deleted and new one inserted
      notes = await db.all('SELECT id, title FROM notes WHERE filename = ?', [
        'conflict-test.md'
      ]);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(newId); // Should use the file's ID
      expect(notes[0].title).toBe('New Title'); // Should use the file's content
    });

    it('should update existing note when ID matches', async () => {
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });
      const testPath = path.join(noteDir, 'update-test.md');
      const noteId = 'n-12345678';

      // Create initial note
      await fs.writeFile(
        testPath,
        `---
id: ${noteId}
title: Original Title
type: general
---
# Original Title

Original content.`
      );

      await searchManager.syncFileSystemChanges();

      // Verify initial note
      const db = await searchManager.getDatabaseConnection();
      let notes = await db.all('SELECT id, title FROM notes WHERE id = ?', [noteId]);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Original Title');

      // Update the file
      await fs.writeFile(
        testPath,
        `---
id: ${noteId}
title: Updated Title
type: general
---
# Updated Title

Updated content.`
      );

      await searchManager.syncFileSystemChanges();

      // Verify note was updated (not duplicated)
      notes = await db.all('SELECT id, title FROM notes WHERE id = ?', [noteId]);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Updated Title');

      // Verify no duplicate with same filename
      const allNotes = await db.all('SELECT id FROM notes WHERE filename = ?', [
        'update-test.md'
      ]);
      expect(allNotes).toHaveLength(1);
    });

    it('should handle conflict when file type changes but filename stays same', async () => {
      const generalDir = path.join(testWorkspacePath, 'general');
      const meetingDir = path.join(testWorkspacePath, 'meeting');
      await fs.mkdir(generalDir, { recursive: true });
      await fs.mkdir(meetingDir, { recursive: true });

      const oldId = 'n-oldtype1';
      const newId = 'n-newtype2';

      // Create note in database with type 'general'
      const db = await searchManager.getDatabaseConnection();
      await db.run(
        `INSERT INTO notes (id, type, filename, path, title, content, created, updated, size, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          oldId,
          'general',
          'type-change.md',
          'general/type-change.md',
          'Original',
          'Content',
          '2024-01-01',
          '2024-01-01',
          100,
          'hash1'
        ]
      );

      // Create file in MEETING directory with different ID (simulating a move + type change)
      const newPath = path.join(meetingDir, 'type-change.md');
      await fs.writeFile(
        newPath,
        `---
id: ${newId}
title: Changed Type
type: meeting
---
# Changed Type

Changed to meeting type.`
      );

      await searchManager.syncFileSystemChanges();

      // Verify old note is gone (was in general/, no longer exists)
      const oldNotes = await db.all('SELECT id FROM notes WHERE id = ?', [oldId]);
      expect(oldNotes).toHaveLength(0);

      // Verify new note exists with correct type
      const newNotes = await db.all(
        'SELECT id, type, title, path FROM notes WHERE id = ?',
        [newId]
      );
      expect(newNotes).toHaveLength(1);
      expect(newNotes[0].type).toBe('meeting');
      expect(newNotes[0].title).toBe('Changed Type');
      expect(newNotes[0].path).toBe('meeting/type-change.md');

      // Verify no duplicates for this filename (checking across all types)
      const allNotes = await db.all(
        'SELECT id, type, path FROM notes WHERE filename = ?',
        ['type-change.md']
      );
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0].type).toBe('meeting');
    });

    it('should not create duplicate when upserting note with existing (type, filename)', async () => {
      const noteDir = path.join(testWorkspacePath, 'general');
      await fs.mkdir(noteDir, { recursive: true });
      const testPath = path.join(noteDir, 'no-dup.md');
      const noteId = 'n-nodup123';

      // Create note via sync
      await fs.writeFile(
        testPath,
        `---
id: ${noteId}
title: Original
type: general
---
# Original

Content.`
      );

      await searchManager.syncFileSystemChanges();

      const db = await searchManager.getDatabaseConnection();

      // Try to upsert the same note again (simulating another sync)
      await searchManager.syncFileSystemChanges();

      // Verify no duplicate created
      const notes = await db.all('SELECT id FROM notes WHERE filename = ?', [
        'no-dup.md'
      ]);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(noteId);
    });

    it('should generate new ID when importing file with legacy ID that clashes with existing note', async () => {
      // Create existing note in DB at path1
      const noteDir1 = path.join(testWorkspacePath, 'general');
      const noteDir2 = path.join(testWorkspacePath, 'meeting');
      await fs.mkdir(noteDir1, { recursive: true });
      await fs.mkdir(noteDir2, { recursive: true });

      const existingPath = path.join(noteDir1, 'existing-note.md');
      const clashingId = 'n-clash123';

      // Create and sync the first note
      await fs.writeFile(
        existingPath,
        `---
flint_id: ${clashingId}
flint_title: Existing Note
flint_type: general
---
# Existing Note

This is the original note.`
      );

      await searchManager.syncFileSystemChanges();

      // Verify existing note is in DB
      const db = await searchManager.getDatabaseConnection();
      const existingNotes = await db.all('SELECT id, path FROM notes WHERE id = ?', [
        clashingId
      ]);
      expect(existingNotes).toHaveLength(1);
      expect(existingNotes[0].path).toBe('general/existing-note.md');

      // Now import a file with LEGACY frontmatter that has the same ID (at different path)
      const importedPath = path.join(noteDir2, 'imported-note.md');
      await fs.writeFile(
        importedPath,
        `---
id: ${clashingId}
title: Imported Note
type: meeting
---
# Imported Note

This is an imported note with clashing legacy ID.`
      );

      await searchManager.syncFileSystemChanges();

      // Verify the imported note got a NEW ID (not the clashing one)
      const allNotes = await db.all('SELECT id, path, title FROM notes ORDER BY path');
      expect(allNotes).toHaveLength(2);

      // Original note should still have its ID
      const originalNote = allNotes.find((n) => n.path === 'general/existing-note.md');
      expect(originalNote?.id).toBe(clashingId);
      expect(originalNote?.title).toBe('Existing Note');

      // Imported note should have a different ID
      const importedNote = allNotes.find((n) => n.path === 'meeting/imported-note.md');
      expect(importedNote?.id).not.toBe(clashingId);
      expect(importedNote?.id).toMatch(/^n-[a-f0-9]{8}$/);
      expect(importedNote?.title).toBe('Imported Note');

      // Verify the imported file was updated with the new flint_id
      const importedContent = await fs.readFile(importedPath, 'utf-8');
      expect(importedContent).toMatch(/flint_id: n-[a-f0-9]{8}/);
      expect(importedContent).not.toContain(`flint_id: ${clashingId}`);
    });
  });
});
