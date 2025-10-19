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

    it('should normalize missing title from filename', async () => {
      // Create note without title field
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'my-awesome-note.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-12345678\ntype: note\n---\n\nContent here.'
      );

      // Sync should add it and normalize title
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify title was generated from filename and written to frontmatter
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/title: My Awesome Note/);

      // Verify it's searchable with generated title
      const response = await searchManager.searchNotes('My Awesome Note');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('My Awesome Note');
    });

    it('should normalize empty title from filename', async () => {
      // Create note with empty title field
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'camelCaseFileName.md');
      await fs.writeFile(
        notePath,
        '---\nid: n-12345678\ntitle:\ntype: note\n---\n\nContent here.'
      );

      // Sync should add it and normalize title
      const result = await searchManager.syncFileSystemChanges();

      expect(result.added).toBe(1);

      // Verify title was generated from camelCase filename
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/title: Camel Case File Name/);

      // Verify it's searchable
      const response = await searchManager.searchNotes('Camel Case');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('Camel Case File Name');
    });

    it('should handle filename with underscores and hyphens', async () => {
      // Create note to test various filename formats
      const noteDir = path.join(testWorkspacePath, 'note');
      await fs.mkdir(noteDir, { recursive: true });

      const notePath = path.join(noteDir, 'test_file-name_example.md');
      await fs.writeFile(notePath, '---\nid: n-12345678\ntype: note\n---\n\nContent.');

      await searchManager.syncFileSystemChanges();

      // Verify title was generated with proper capitalization
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/title: Test File Name Example/);
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

      // Verify frontmatter was created with id, title, and type
      const content = await fs.readFile(notePath, 'utf-8');
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/id: n-[a-f0-9]{8}/);
      expect(content).toMatch(/title: Plain File/);
      expect(content).toMatch(/type: note/);
      expect(content).toMatch(/---\n# Plain File/);

      // Verify it's searchable
      const response = await searchManager.searchNotes('Plain File');
      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe('Plain File');
      expect(response.results[0].id).toMatch(/^n-[a-f0-9]{8}$/);
    });
  });
});
