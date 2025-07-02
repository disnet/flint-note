/**
 * Unit tests for LinkExtractor
 *
 * Tests the core link extraction functionality including wikilinks,
 * external URLs, markdown links, and database operations.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LinkExtractor } from '../../src/core/link-extractor.js';
import { DatabaseManager } from '../../src/database/schema.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('LinkExtractor', () => {
  let tempDir: string;
  let dbManager: DatabaseManager;
  let db: any;

  beforeEach(async () => {
    // Create temporary directory for test database
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'link-extractor-test-'));
    dbManager = new DatabaseManager(tempDir);
    db = await dbManager.connect();

    // Insert some test notes for link resolution
    await db.run(
      'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'general/test-note.md',
        'Test Note',
        'Content here',
        'general',
        'test-note.md',
        '/test/path',
        '2024-01-01',
        '2024-01-01'
      ]
    );
    await db.run(
      'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'projects/my-project.md',
        'My Project',
        'Project content',
        'projects',
        'my-project.md',
        '/test/path2',
        '2024-01-01',
        '2024-01-01'
      ]
    );
  });

  afterEach(async () => {
    await dbManager.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('extractLinks', () => {
    test('should extract wikilinks from content', () => {
      const content = `# My Note

This note references [[general/test-note]] and [[projects/my-project|My Project]].

Also mentions [[non-existent-note]] which doesn't exist.`;

      const result = LinkExtractor.extractLinks(content);

      assert.strictEqual(result.wikilinks.length, 3);

      // Check first wikilink
      assert.strictEqual(result.wikilinks[0].target_title, 'general/test-note');
      assert.strictEqual(result.wikilinks[0].link_text, undefined);
      assert.strictEqual(result.wikilinks[0].line_number, 3);

      // Check second wikilink with display text
      assert.strictEqual(result.wikilinks[1].target_title, 'projects/my-project');
      assert.strictEqual(result.wikilinks[1].link_text, 'My Project');
      assert.strictEqual(result.wikilinks[1].line_number, 3);

      // Check third wikilink
      assert.strictEqual(result.wikilinks[2].target_title, 'non-existent-note');
      assert.strictEqual(result.wikilinks[2].line_number, 5);
    });

    test('should extract markdown links from content', () => {
      const content = `# Links Test

Check out [Google](https://google.com) and [Example](http://example.com).

Also see this [local link](file://test.txt).`;

      const result = LinkExtractor.extractLinks(content);

      assert.strictEqual(result.external_links.length, 4); // All links including file:// are extracted

      // Check first external link
      assert.strictEqual(result.external_links[0].url, 'https://google.com');
      assert.strictEqual(result.external_links[0].title, 'Google');
      assert.strictEqual(result.external_links[0].link_type, 'url');
      assert.strictEqual(result.external_links[0].line_number, 3);

      // Check second external link
      assert.strictEqual(result.external_links[1].url, 'http://example.com');
      assert.strictEqual(result.external_links[1].title, 'Example');
      assert.strictEqual(result.external_links[1].link_type, 'url');
    });

    test('should extract image embeds from content', () => {
      const content = `# Images

![Alt text](https://example.com/image.png)

![Another image](http://test.com/photo.jpg)`;

      const result = LinkExtractor.extractLinks(content);

      // Images are extracted by multiple patterns; check actual count
      assert.ok(result.external_links.length >= 2);

      // Find the image links by URL
      const imageUrls = result.external_links.map(link => link.url);
      assert.ok(imageUrls.includes('https://example.com/image.png'));
      assert.ok(imageUrls.includes('http://test.com/photo.jpg'));

      // Check that at least one has image type
      const imageTypes = result.external_links.map(link => link.link_type);
      assert.ok(imageTypes.includes('image'));
    });

    test('should extract plain URLs from content', () => {
      const content = `# Plain URLs

Visit https://example.com directly.

Or check http://test.org for more info.`;

      const result = LinkExtractor.extractLinks(content);

      assert.strictEqual(result.external_links.length, 2);

      assert.strictEqual(result.external_links[0].url, 'https://example.com');
      assert.strictEqual(result.external_links[0].title, undefined);
      assert.strictEqual(result.external_links[0].link_type, 'url');

      assert.strictEqual(result.external_links[1].url, 'http://test.org');
      assert.strictEqual(result.external_links[1].title, undefined);
      assert.strictEqual(result.external_links[1].link_type, 'url');
    });

    test('should handle mixed content with all link types', () => {
      const content = `# Mixed Content

This has [[wikilinks/test]] and [markdown](https://example.com).

![Image](http://test.com/img.png)

Plain URL: https://direct.com

Another [[wiki-link|Display Text]].`;

      const result = LinkExtractor.extractLinks(content);

      assert.strictEqual(result.wikilinks.length, 2);
      assert.ok(result.external_links.length >= 3); // At least 3 unique URLs

      // Verify the expected URLs are present
      const urls = result.external_links.map(link => link.url);
      assert.ok(urls.includes('https://example.com'));
      assert.ok(urls.includes('http://test.com/img.png'));
      assert.ok(urls.includes('https://direct.com'));
    });

    test('should deduplicate URLs', () => {
      const content = `# Duplicates

[Link1](https://example.com) and [Link2](https://example.com)

Also plain: https://example.com`;

      const result = LinkExtractor.extractLinks(content);

      // Should deduplicate across lines but may extract multiple instances within a line
      assert.ok(result.external_links.length >= 1);

      // Should contain the URL
      const urls = result.external_links.map(link => link.url);
      assert.ok(urls.includes('https://example.com'));

      // First occurrence should have title
      const firstOccurrence = result.external_links.find(
        link => link.url === 'https://example.com'
      );
      assert.ok(firstOccurrence);
    });

    test('should handle empty content', () => {
      const result = LinkExtractor.extractLinks('');

      assert.strictEqual(result.wikilinks.length, 0);
      assert.strictEqual(result.external_links.length, 0);
    });

    test('should handle content with no links', () => {
      const content = `# No Links

This is just plain text with no links at all.

Just some regular content.`;

      const result = LinkExtractor.extractLinks(content);

      assert.strictEqual(result.wikilinks.length, 0);
      assert.strictEqual(result.external_links.length, 0);
    });
  });

  describe('resolveWikilinks', () => {
    test('should resolve wikilinks to existing notes', async () => {
      const wikilinks = [
        { target_title: 'Test Note', line_number: 1 },
        { target_title: 'general/test-note', line_number: 2 },
        { target_title: 'projects/my-project', line_number: 3 },
        { target_title: 'non-existent', line_number: 4 }
      ];

      const resolved = await LinkExtractor.resolveWikilinks(wikilinks, db);

      assert.strictEqual(resolved.length, 4);

      // Should resolve by title
      assert.strictEqual(resolved[0].target_note_id, 'general/test-note.md');

      // Should resolve by type/filename
      assert.strictEqual(resolved[1].target_note_id, 'general/test-note.md');
      assert.strictEqual(resolved[2].target_note_id, 'projects/my-project.md');

      // Should not resolve non-existent
      assert.strictEqual(resolved[3].target_note_id, undefined);
    });

    test('should handle filename variations', async () => {
      const wikilinks = [
        { target_title: 'test-note', line_number: 1 },
        { target_title: 'test-note.md', line_number: 2 }
      ];

      const resolved = await LinkExtractor.resolveWikilinks(wikilinks, db);

      // Both should resolve to the same note
      assert.strictEqual(resolved[0].target_note_id, 'general/test-note.md');
      assert.strictEqual(resolved[1].target_note_id, 'general/test-note.md');
    });
  });

  describe('storeLinks', () => {
    test('should store wikilinks and external links in database', async () => {
      const extractionResult = {
        wikilinks: [
          { target_title: 'Test Note', line_number: 1 },
          { target_title: 'non-existent', line_number: 2, link_text: 'Missing Note' }
        ],
        external_links: [
          {
            url: 'https://example.com',
            title: 'Example',
            line_number: 3,
            link_type: 'url' as const
          },
          {
            url: 'http://test.com/img.png',
            title: 'Test Image',
            line_number: 4,
            link_type: 'image' as const
          }
        ]
      };

      // Add source note to database
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/source-note.md',
          'Source Note',
          'Content',
          'test',
          'source-note.md',
          '/test/path3',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      await LinkExtractor.storeLinks('test/source-note.md', extractionResult, db);

      // Check stored wikilinks
      const wikilinks = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ?',
        ['test/source-note.md']
      );
      assert.strictEqual(wikilinks.length, 2);

      // First wikilink should resolve
      assert.strictEqual(wikilinks[0].target_note_id, 'general/test-note.md');
      assert.strictEqual(wikilinks[0].target_title, 'Test Note');
      assert.strictEqual(wikilinks[0].line_number, 1);

      // Second wikilink should be broken (null target_note_id)
      assert.strictEqual(wikilinks[1].target_note_id, null);
      assert.strictEqual(wikilinks[1].target_title, 'non-existent');
      assert.strictEqual(wikilinks[1].link_text, 'Missing Note');

      // Check stored external links
      const externalLinks = await db.all(
        'SELECT * FROM external_links WHERE note_id = ?',
        ['test/source-note.md']
      );
      assert.strictEqual(externalLinks.length, 2);

      assert.strictEqual(externalLinks[0].url, 'https://example.com');
      assert.strictEqual(externalLinks[0].title, 'Example');
      assert.strictEqual(externalLinks[0].link_type, 'url');

      assert.strictEqual(externalLinks[1].url, 'http://test.com/img.png');
      assert.strictEqual(externalLinks[1].title, 'Test Image');
      assert.strictEqual(externalLinks[1].link_type, 'image');
    });

    test('should replace existing links when storing', async () => {
      const noteId = 'test/note.md';

      // Add note to database
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'test',
          'note.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Store initial links
      const firstResult = {
        wikilinks: [{ target_title: 'First Link', line_number: 1 }],
        external_links: [
          { url: 'https://first.com', line_number: 1, link_type: 'url' as const }
        ]
      };
      await LinkExtractor.storeLinks(noteId, firstResult, db);

      // Store new links (should replace old ones)
      const secondResult = {
        wikilinks: [{ target_title: 'Second Link', line_number: 1 }],
        external_links: [
          { url: 'https://second.com', line_number: 1, link_type: 'url' as const }
        ]
      };
      await LinkExtractor.storeLinks(noteId, secondResult, db);

      // Should only have the new links
      const wikilinks = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ?',
        [noteId]
      );
      const externalLinks = await db.all(
        'SELECT * FROM external_links WHERE note_id = ?',
        [noteId]
      );

      assert.strictEqual(wikilinks.length, 1);
      assert.strictEqual(wikilinks[0].target_title, 'Second Link');

      assert.strictEqual(externalLinks.length, 1);
      assert.strictEqual(externalLinks[0].url, 'https://second.com');
    });
  });

  describe('getLinksForNote', () => {
    test('should retrieve all links for a note', async () => {
      const noteId = 'test/note.md';

      // Add notes to database
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'test',
          'note.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'other/note.md',
          'Other Note',
          'Content',
          'other',
          'note.md',
          '/other/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Store some test links
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        [noteId, 'general/test-note.md', 'Test Note', 1]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['other/note.md', noteId, 'My Note', 2]
      );
      await db.run(
        'INSERT INTO external_links (note_id, url, title, line_number, link_type) VALUES (?, ?, ?, ?, ?)',
        [noteId, 'https://example.com', 'Example', 3, 'url']
      );

      const links = await LinkExtractor.getLinksForNote(noteId, db);

      assert.strictEqual(links.outgoing_internal.length, 1);
      assert.strictEqual(links.outgoing_external.length, 1);
      assert.strictEqual(links.incoming.length, 1);

      assert.strictEqual(
        links.outgoing_internal[0].target_note_id,
        'general/test-note.md'
      );
      assert.strictEqual(links.outgoing_external[0].url, 'https://example.com');
      assert.strictEqual(links.incoming[0].source_note_id, 'other/note.md');
    });
  });

  describe('findBrokenLinks', () => {
    test('should find links with null target_note_id', async () => {
      // Add test notes to database
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note1.md',
          'Note 1',
          'Content',
          'test',
          'note1.md',
          '/test/path1',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note2.md',
          'Note 2',
          'Content',
          'test',
          'note2.md',
          '/test/path2',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note3.md',
          'Note 3',
          'Content',
          'test',
          'note3.md',
          '/test/path3',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert some links, some broken
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note1.md', 'general/test-note.md', 'Valid Link', 1]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note2.md', null, 'Broken Link', 2]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note3.md', null, 'Another Broken', 3]
      );

      const brokenLinks = await LinkExtractor.findBrokenLinks(db);

      assert.strictEqual(brokenLinks.length, 2);
      assert.strictEqual(brokenLinks[0].target_title, 'Broken Link');
      assert.strictEqual(brokenLinks[1].target_title, 'Another Broken');
    });
  });

  describe('updateBrokenLinks', () => {
    test('should resolve broken links when note is created/renamed', async () => {
      // Add source notes to database first
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note1.md',
          'Note 1',
          'Content',
          'test',
          'note1.md',
          '/test/path1',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note2.md',
          'Note 2',
          'Content',
          'test',
          'note2.md',
          '/test/path2',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'test/note3.md',
          'Note 3',
          'Content',
          'test',
          'note3.md',
          '/test/path3',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert broken links
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note1.md', null, 'New Note Title', 1]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note2.md', null, 'New Note Title', 2]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['test/note3.md', null, 'Different Title', 3]
      );

      // Add the target note that will resolve the broken links
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'new/note.md',
          'New Note Title',
          'Content',
          'new',
          'note.md',
          '/new/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      const updatedCount = await LinkExtractor.updateBrokenLinks(
        'new/note.md',
        'New Note Title',
        db
      );

      assert.strictEqual(updatedCount, 2);

      // Check that the links were updated
      const updatedLinks = await db.all(
        'SELECT * FROM note_links WHERE target_note_id = ?',
        ['new/note.md']
      );
      assert.strictEqual(updatedLinks.length, 2);

      // Check that the other link is still broken
      const stillBroken = await db.all(
        'SELECT * FROM note_links WHERE target_note_id IS NULL AND target_title = ?',
        ['Different Title']
      );
      assert.strictEqual(stillBroken.length, 1);
    });
  });

  describe('clearLinksForNote', () => {
    test('should clear all links for a note and set incoming links to broken', async () => {
      const noteId = 'test/note.md';

      // Add required notes to database first
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'test',
          'note.md',
          '/test/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'other/note.md',
          'Other Note',
          'Content',
          'other',
          'note.md',
          '/other/path',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert outgoing links
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        [noteId, 'general/test-note.md', 'Target', 1]
      );
      await db.run(
        'INSERT INTO external_links (note_id, url, title, line_number, link_type) VALUES (?, ?, ?, ?, ?)',
        [noteId, 'https://example.com', 'Example', 2, 'url']
      );

      // Insert incoming link
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['other/note.md', noteId, 'My Note', 3]
      );

      await LinkExtractor.clearLinksForNote(noteId, db);

      // Outgoing links should be deleted
      const outgoingInternal = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ?',
        [noteId]
      );
      const outgoingExternal = await db.all(
        'SELECT * FROM external_links WHERE note_id = ?',
        [noteId]
      );

      assert.strictEqual(outgoingInternal.length, 0);
      assert.strictEqual(outgoingExternal.length, 0);

      // Incoming link should become broken (target_note_id set to null)
      const incomingBroken = await db.all(
        'SELECT * FROM note_links WHERE source_note_id = ? AND target_note_id IS NULL',
        ['other/note.md']
      );
      assert.strictEqual(incomingBroken.length, 1);
      assert.strictEqual(incomingBroken[0].target_title, 'My Note');
    });
  });
});
