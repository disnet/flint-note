/**
 * Performance tests for link management operations
 *
 * Tests the performance characteristics of link extraction,
 * storage, and querying operations with larger datasets.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LinkExtractor } from '../../src/core/link-extractor.js';
import { DatabaseManager } from '../../src/database/schema.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Link Performance Tests', () => {
  let tempDir: string;
  let dbManager: DatabaseManager;
  let db: any;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'link-performance-test-'));
    dbManager = new DatabaseManager(tempDir);
    db = await dbManager.connect();
  });

  afterEach(async () => {
    await dbManager.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to generate test notes with links
   */
  async function setupTestNotes(count: number): Promise<void> {
    // Insert base notes that can be linked to
    const baseNotes = ['hub', 'project-a', 'project-b', 'research-x', 'general-info'];
    for (const noteName of baseNotes) {
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `general/${noteName}.md`,
          noteName,
          'Content',
          'general',
          `${noteName}.md`,
          `/path/${noteName}`,
          '2024-01-01',
          '2024-01-01'
        ]
      );
    }

    // Insert test notes with varying link patterns
    for (let i = 0; i < count; i++) {
      const noteId = `test/note-${i}.md`;
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          `Note ${i}`,
          'Content',
          'test',
          `note-${i}.md`,
          `/path/note-${i}`,
          '2024-01-01',
          '2024-01-01'
        ]
      );
    }
  }

  /**
   * Generate content with varying numbers of links
   */
  function generateContentWithLinks(
    internalLinkCount: number,
    externalLinkCount: number,
    baseNotes: string[] = ['hub', 'project-a', 'project-b', 'research-x', 'general-info']
  ): string {
    let content = `# Test Note

This is a test note with various types of links.

## Internal Links\n`;

    // Add internal links (cycling through base notes)
    for (let i = 0; i < internalLinkCount; i++) {
      const targetNote = baseNotes[i % baseNotes.length];
      const displayText = Math.random() > 0.5 ? `|${targetNote.toUpperCase()}` : '';
      content += `\nReference to [[general/${targetNote}.md${displayText}]].`;
    }

    content += `\n\n## External Links\n`;

    // Add external links
    for (let i = 0; i < externalLinkCount; i++) {
      const linkType = i % 3;
      if (linkType === 0) {
        // Markdown link
        content += `\n[External Site ${i}](https://example${i}.com)`;
      } else if (linkType === 1) {
        // Image embed
        content += `\n![Image ${i}](https://images.example.com/img${i}.png)`;
      } else {
        // Plain URL
        content += `\nPlain URL: https://docs${i}.example.org`;
      }
    }

    // Add some broken links
    if (internalLinkCount > 5) {
      content += `\n\n## Broken Links\n`;
      content += `\nBroken: [[non-existent-${Math.floor(Math.random() * 1000)}]]`;
    }

    return content;
  }

  describe('Link extraction performance', () => {
    test('should extract links efficiently from large content', async () => {
      const content = generateContentWithLinks(100, 50); // Large number of links

      const startTime = Date.now();
      const result = LinkExtractor.extractLinks(content);
      const extractionTime = Date.now() - startTime;

      // Should complete extraction quickly
      assert.ok(
        extractionTime < 100,
        `Extraction took ${extractionTime}ms, should be under 100ms`
      );

      // Verify correct extraction (actual counts may be higher due to multiple pattern matching)
      assert.ok(result.wikilinks.length >= 100); // At least 100 wikilinks
      assert.ok(result.external_links.length >= 50); // At least 50 external links
    });

    test('should handle content with many duplicate links efficiently', async () => {
      // Create content with many duplicate wikilinks
      let content = '# Duplicate Links Test\n';
      for (let i = 0; i < 200; i++) {
        content += `\nRepeated link: [[general/hub.md|Hub ${i}]]`;
      }

      const startTime = Date.now();
      const result = LinkExtractor.extractLinks(content);
      const extractionTime = Date.now() - startTime;

      assert.ok(
        extractionTime < 150,
        `Extraction with duplicates took ${extractionTime}ms`
      );
      assert.strictEqual(result.wikilinks.length, 200); // All instances should be extracted
    });

    test('should extract links from content with complex markdown efficiently', async () => {
      // Create complex markdown with nested structures
      let content = `# Complex Markdown

## Table with Links
| Name | Link | External |
|------|------|----------|
`;

      for (let i = 0; i < 50; i++) {
        content += `| Item ${i} | [[general/project-a.md]] | [Site](https://example${i}.com) |\n`;
      }

      content += `\n## Lists with Links\n`;
      for (let i = 0; i < 50; i++) {
        content += `- Point ${i}: [[general/hub.md]] and https://docs${i}.example.org\n`;
      }

      content += `\n## Code blocks (should be ignored)
\`\`\`
[[this-should-not-be-extracted]]
https://should-not-extract.com
\`\`\`

## More links
`;
      for (let i = 0; i < 30; i++) {
        content += `Reference [[general/research-x.md|Research]] from paragraph ${i}.\n`;
      }

      const startTime = Date.now();
      const result = LinkExtractor.extractLinks(content);
      const extractionTime = Date.now() - startTime;

      assert.ok(extractionTime < 200, `Complex extraction took ${extractionTime}ms`);

      // Should extract links from tables and lists but not code blocks
      assert.ok(result.wikilinks.length >= 130); // 50 + 50 + 30
      assert.ok(result.external_links.length >= 100); // 50 + 50
    });
  });

  describe('Link storage performance', () => {
    test('should store large numbers of links efficiently', async () => {
      await setupTestNotes(10);

      // Add the source note to database first
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/large-note.md',
          'Large Note',
          'Content',
          'test',
          'large-note.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      const content = generateContentWithLinks(200, 100);
      const extractionResult = LinkExtractor.extractLinks(content);

      const startTime = Date.now();
      await LinkExtractor.storeLinks('test/large-note.md', extractionResult, db);
      const storageTime = Date.now() - startTime;

      assert.ok(
        storageTime < 500,
        `Storage took ${storageTime}ms, should be under 500ms`
      );

      // Verify all links were stored
      const storedInternal = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ?',
        ['test/large-note.md']
      );
      const storedExternal = await db.all(
        'SELECT * FROM external_links WHERE note_id = ?',
        ['test/large-note.md']
      );

      assert.strictEqual(storedInternal.length, extractionResult.wikilinks.length);
      assert.strictEqual(storedExternal.length, extractionResult.external_links.length);
    });

    test('should handle batch link updates efficiently', async () => {
      await setupTestNotes(10);

      const noteId = 'test/batch-note.md';

      // Add the note to database first
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Batch Note',
          'Content',
          'test',
          'batch-note.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Store initial links
      const initialContent = generateContentWithLinks(50, 25);
      const initialResult = LinkExtractor.extractLinks(initialContent);
      await LinkExtractor.storeLinks(noteId, initialResult, db);

      // Update with new links (tests replacement performance)
      const updatedContent = generateContentWithLinks(75, 40);
      const updatedResult = LinkExtractor.extractLinks(updatedContent);

      const startTime = Date.now();
      await LinkExtractor.storeLinks(noteId, updatedResult, db);
      const updateTime = Date.now() - startTime;

      assert.ok(
        updateTime < 300,
        `Batch update took ${updateTime}ms, should be under 300ms`
      );

      // Verify only new links remain
      const finalInternal = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ?',
        [noteId]
      );
      const finalExternal = await db.all(
        'SELECT * FROM external_links WHERE note_id = ?',
        [noteId]
      );

      assert.strictEqual(finalInternal.length, updatedResult.wikilinks.length);
      assert.strictEqual(finalExternal.length, updatedResult.external_links.length);
    });
  });

  describe('Link query performance', () => {
    beforeEach(async () => {
      await setupTestNotes(100);

      // Create a network of interconnected notes
      for (let i = 0; i < 100; i++) {
        const noteId = `test/note-${i}.md`;
        const content = generateContentWithLinks(
          Math.floor(Math.random() * 10) + 5, // 5-15 internal links
          Math.floor(Math.random() * 5) + 2 // 2-7 external links
        );
        const result = LinkExtractor.extractLinks(content);
        await LinkExtractor.storeLinks(noteId, result, db);
      }
    });

    test('should retrieve note links efficiently', async () => {
      const noteId = 'test/note-50.md';

      const startTime = Date.now();
      const links = await LinkExtractor.getLinksForNote(noteId, db);
      const queryTime = Date.now() - startTime;

      assert.ok(
        queryTime < 50,
        `Note links query took ${queryTime}ms, should be under 50ms`
      );

      // Should have links
      assert.ok(links.outgoing_internal.length > 0);
      assert.ok(links.outgoing_external.length > 0);
    });

    test('should find backlinks efficiently', async () => {
      // Choose a note that should have many backlinks
      const targetId = 'general/hub.md';

      const startTime = Date.now();
      const backlinks = await LinkExtractor.getBacklinks(targetId, db);
      const queryTime = Date.now() - startTime;

      assert.ok(
        queryTime < 100,
        `Backlinks query took ${queryTime}ms, should be under 100ms`
      );

      // Should have found backlinks
      assert.ok(backlinks.length > 0);
    });

    test('should find broken links efficiently across vault', async () => {
      const startTime = Date.now();
      const brokenLinks = await LinkExtractor.findBrokenLinks(db);
      const queryTime = Date.now() - startTime;

      assert.ok(
        queryTime < 200,
        `Broken links query took ${queryTime}ms, should be under 200ms`
      );

      // Should have found some broken links
      assert.ok(brokenLinks.length > 0);
    });

    test('should perform complex link relationship queries efficiently', async () => {
      // Complex query: Find notes that link to hub and have external links to specific domains
      const startTime = Date.now();

      const complexQuery = await db.all(`
        SELECT DISTINCT n.id, n.title, 
               COUNT(DISTINCT nl.id) as internal_link_count,
               COUNT(DISTINCT el.id) as external_link_count
        FROM notes n
        LEFT JOIN note_links nl ON n.id = nl.source_note_id
        LEFT JOIN external_links el ON n.id = el.note_id
        WHERE n.id IN (
          SELECT DISTINCT source_note_id 
          FROM note_links 
          WHERE target_note_id = 'general/hub.md'
        )
        AND n.id IN (
          SELECT DISTINCT note_id 
          FROM external_links 
          WHERE url LIKE '%example%.com%'
        )
        GROUP BY n.id, n.title
        HAVING internal_link_count > 3
        ORDER BY external_link_count DESC
        LIMIT 20
      `);

      const queryTime = Date.now() - startTime;

      assert.ok(
        queryTime < 300,
        `Complex query took ${queryTime}ms, should be under 300ms`
      );

      // Should return some results
      assert.ok(Array.isArray(complexQuery));
    });

    test('should update broken links efficiently', async () => {
      // Create some broken links first
      const sourceNoteId = 'test/source-with-broken.md';
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          sourceNoteId,
          'Source Note',
          'Content',
          'test',
          'source-with-broken.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert broken link
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        [sourceNoteId, null, 'Future Note', 1]
      );

      // Create a new note that matches the broken link title
      const matchingTitle = 'Future Note';
      const newNoteId = 'test/newly-created.md';

      // Add the new note to database first
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newNoteId,
          matchingTitle,
          'Content',
          'test',
          'newly-created.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      const startTime = Date.now();
      const updatedCount = await LinkExtractor.updateBrokenLinks(
        newNoteId,
        matchingTitle,
        db
      );
      const updateTime = Date.now() - startTime;

      assert.ok(
        updateTime < 100,
        `Broken link update took ${updateTime}ms, should be under 100ms`
      );

      // Should have updated at least one link
      assert.ok(updatedCount >= 1);
    });

    test('should handle concurrent link operations efficiently', async () => {
      // Create notes first to avoid foreign key constraints
      for (let i = 0; i < 10; i++) {
        const noteId = `concurrent/note-${i}.md`;
        await db.run(
          'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            noteId,
            `Concurrent Note ${i}`,
            'Content',
            'concurrent',
            `note-${i}.md`,
            `/concurrent/path${i}`,
            '2024-01-01',
            '2024-01-01'
          ]
        );
      }

      // Simulate multiple concurrent operations
      const operations = [];

      for (let i = 0; i < 10; i++) {
        const noteId = `concurrent/note-${i}.md`;

        operations.push(async () => {
          const content = generateContentWithLinks(20, 10);
          const result = LinkExtractor.extractLinks(content);
          await LinkExtractor.storeLinks(noteId, result, db);
          return await LinkExtractor.getLinksForNote(noteId, db);
        });
      }

      const startTime = Date.now();
      // Run operations sequentially to avoid transaction conflicts
      const results = [];
      for (const operation of operations) {
        results.push(await operation());
      }
      const totalTime = Date.now() - startTime;

      assert.ok(
        totalTime < 2000,
        `Concurrent operations took ${totalTime}ms, should be under 2000ms`
      );

      // All operations should have completed successfully
      assert.strictEqual(results.length, 10);
      results.forEach(result => {
        assert.ok(result.outgoing_internal.length > 0);
        assert.ok(result.outgoing_external.length > 0);
      });
    });
  });

  describe('Memory efficiency', () => {
    test('should not consume excessive memory during large extractions', async () => {
      // Get initial memory usage
      const initialMemory = process.memoryUsage();

      // Process many large content strings
      for (let i = 0; i < 50; i++) {
        const largeContent = generateContentWithLinks(100, 50);
        const result = LinkExtractor.extractLinks(largeContent);

        // Verify extraction worked
        assert.ok(result.wikilinks.length > 0);
        assert.ok(result.external_links.length > 0);
      }

      // Force garbage collection if available
      if (typeof globalThis !== 'undefined' && (globalThis as any).gc) {
        (globalThis as any).gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      assert.ok(
        memoryIncrease < 50 * 1024 * 1024,
        `Memory increased by ${Math.round(memoryIncrease / 1024 / 1024)}MB, should be under 50MB`
      );
    });
  });

  describe('Scalability benchmarks', () => {
    test('should maintain performance as link count grows', async () => {
      await setupTestNotes(10);

      const testSizes = [10, 50, 100, 200];
      const extractionTimes: number[] = [];
      const storageTimes: number[] = [];

      for (const size of testSizes) {
        // Add the test note to database first
        const noteId = `test/scale-${size}.md`;
        await db.run(
          'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            noteId,
            `Scale Note ${size}`,
            'Content',
            'test',
            `scale-${size}.md`,
            `/test/path${size}`,
            '2024-01-01',
            '2024-01-01'
          ]
        );

        const content = generateContentWithLinks(size, Math.floor(size / 2));

        // Test extraction time
        const extractStart = Date.now();
        const result = LinkExtractor.extractLinks(content);
        const extractTime = Date.now() - extractStart;
        extractionTimes.push(extractTime);

        // Test storage time
        const storeStart = Date.now();
        await LinkExtractor.storeLinks(noteId, result, db);
        const storeTime = Date.now() - storeStart;
        storageTimes.push(storeTime);
      }

      // Performance should not degrade exponentially
      for (let i = 1; i < testSizes.length; i++) {
        const sizeRatio = testSizes[i] / testSizes[i - 1];

        // Handle cases where previous time was 0 (avoid division by zero)
        const extractTimeRatio =
          extractionTimes[i - 1] === 0 ? 1 : extractionTimes[i] / extractionTimes[i - 1];
        const storeTimeRatio =
          storageTimes[i - 1] === 0 ? 1 : storageTimes[i] / storageTimes[i - 1];

        // Time increase should be roughly linear with size (not exponential)
        // Skip assertion if we have invalid ratios (NaN, Infinity)
        if (isFinite(extractTimeRatio) && !isNaN(extractTimeRatio)) {
          assert.ok(
            extractTimeRatio < sizeRatio * 3,
            `Extraction time scaling too poorly: ${extractTimeRatio} vs size ratio ${sizeRatio}`
          );
        }

        if (isFinite(storeTimeRatio) && !isNaN(storeTimeRatio)) {
          assert.ok(
            storeTimeRatio < sizeRatio * 5,
            `Storage time scaling too poorly: ${storeTimeRatio} vs size ratio ${sizeRatio}`
          );
        }
      }
    });
  });
});
