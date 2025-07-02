/**
 * Unit tests for database schema link tables
 *
 * Tests the link-related database tables, constraints, and operations.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseManager } from '../../src/database/schema.js';
import type { NoteLinkRow, ExternalLinkRow } from '../../src/database/schema.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Database Schema - Link Tables', () => {
  let tempDir: string;
  let dbManager: DatabaseManager;
  let db: any;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'db-schema-links-test-'));
    dbManager = new DatabaseManager(tempDir);
    db = await dbManager.connect();

    // Insert test notes for foreign key references
    await db.run(
      'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'source/note.md',
        'Source Note',
        'Content',
        'source',
        'note.md',
        '/path1',
        '2024-01-01',
        '2024-01-01'
      ]
    );
    await db.run(
      'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'target/note.md',
        'Target Note',
        'Content',
        'target',
        'note.md',
        '/path2',
        '2024-01-01',
        '2024-01-01'
      ]
    );
  });

  afterEach(async () => {
    await dbManager.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('note_links table', () => {
    test('should create note_links table with correct schema', async () => {
      // Verify table exists
      const tableInfo = await db.all('PRAGMA table_info(note_links)');

      const columnNames = tableInfo.map((col: any) => col.name);
      const expectedColumns = [
        'id',
        'source_note_id',
        'target_note_id',
        'target_title',
        'link_text',
        'line_number',
        'created'
      ];

      for (const col of expectedColumns) {
        assert.ok(columnNames.includes(col), `Column ${col} should exist`);
      }

      // Verify primary key
      const pkColumn = tableInfo.find((col: any) => col.pk === 1);
      assert.strictEqual(pkColumn.name, 'id');
    });

    test('should insert note links successfully', async () => {
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, link_text, line_number) VALUES (?, ?, ?, ?, ?)',
        ['source/note.md', 'target/note.md', 'Target Note', 'Custom Display', 5]
      );

      const links = await db.all('SELECT * FROM note_links');
      assert.strictEqual(links.length, 1);

      const link = links[0] as NoteLinkRow;
      assert.strictEqual(link.source_note_id, 'source/note.md');
      assert.strictEqual(link.target_note_id, 'target/note.md');
      assert.strictEqual(link.target_title, 'Target Note');
      assert.strictEqual(link.link_text, 'Custom Display');
      assert.strictEqual(link.line_number, 5);
      assert.ok(link.created); // Should have auto-generated timestamp
    });

    test('should allow null target_note_id for broken links', async () => {
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', null, 'Broken Link', 10]
      );

      const links = await db.all('SELECT * FROM note_links WHERE target_note_id IS NULL');
      assert.strictEqual(links.length, 1);
      assert.strictEqual(links[0].target_title, 'Broken Link');
    });

    test('should handle foreign key constraints with CASCADE DELETE', async () => {
      // Insert a link
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'target/note.md', 'Target Note', 1]
      );

      // Delete source note
      await db.run('DELETE FROM notes WHERE id = ?', ['source/note.md']);

      // Link should be deleted automatically
      const remainingLinks = await db.all('SELECT * FROM note_links');
      assert.strictEqual(remainingLinks.length, 0);
    });

    test('should handle foreign key constraints with SET NULL on target deletion', async () => {
      // Insert a link
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'target/note.md', 'Target Note', 1]
      );

      // Delete target note
      await db.run('DELETE FROM notes WHERE id = ?', ['target/note.md']);

      // Link should still exist but target_note_id should be null
      const links = await db.all('SELECT * FROM note_links');
      assert.strictEqual(links.length, 1);
      assert.strictEqual(links[0].target_note_id, null);
      assert.strictEqual(links[0].target_title, 'Target Note');
    });

    test('should have proper indexes for performance', async () => {
      const indexes = await db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='note_links'"
      );
      const indexNames = indexes.map((idx: any) => idx.name);

      assert.ok(indexNames.includes('idx_note_links_source'), 'Should have source index');
      assert.ok(indexNames.includes('idx_note_links_target'), 'Should have target index');
      assert.ok(
        indexNames.includes('idx_note_links_target_title'),
        'Should have target title index'
      );
    });

    test('should require non-null values for required fields', async () => {
      // Should fail without source_note_id
      await assert.rejects(async () => {
        await db.run(
          'INSERT INTO note_links (target_note_id, target_title, line_number) VALUES (?, ?, ?)',
          ['target/note.md', 'Target', 1]
        );
      });

      // Should fail without target_title
      await assert.rejects(async () => {
        await db.run(
          'INSERT INTO note_links (source_note_id, target_note_id, line_number) VALUES (?, ?, ?)',
          ['source/note.md', 'target/note.md', 1]
        );
      });
    });
  });

  describe('external_links table', () => {
    test('should create external_links table with correct schema', async () => {
      const tableInfo = await db.all('PRAGMA table_info(external_links)');

      const columnNames = tableInfo.map((col: any) => col.name);
      const expectedColumns = [
        'id',
        'note_id',
        'url',
        'title',
        'line_number',
        'link_type',
        'created'
      ];

      for (const col of expectedColumns) {
        assert.ok(columnNames.includes(col), `Column ${col} should exist`);
      }

      // Verify primary key
      const pkColumn = tableInfo.find((col: any) => col.pk === 1);
      assert.strictEqual(pkColumn.name, 'id');
    });

    test('should insert external links successfully', async () => {
      await db.run(
        'INSERT INTO external_links (note_id, url, title, line_number, link_type) VALUES (?, ?, ?, ?, ?)',
        ['source/note.md', 'https://example.com', 'Example Site', 3, 'url']
      );

      const links = await db.all('SELECT * FROM external_links');
      assert.strictEqual(links.length, 1);

      const link = links[0] as ExternalLinkRow;
      assert.strictEqual(link.note_id, 'source/note.md');
      assert.strictEqual(link.url, 'https://example.com');
      assert.strictEqual(link.title, 'Example Site');
      assert.strictEqual(link.line_number, 3);
      assert.strictEqual(link.link_type, 'url');
      assert.ok(link.created);
    });

    test('should enforce link_type constraints', async () => {
      // Valid link types should work
      const validTypes = ['url', 'image', 'embed'];

      for (const type of validTypes) {
        await db.run(
          'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
          ['source/note.md', `https://example.com/${type}`, 1, type]
        );
      }

      const links = await db.all('SELECT * FROM external_links');
      assert.strictEqual(links.length, 3);

      // Invalid link type should fail
      await assert.rejects(async () => {
        await db.run(
          'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
          ['source/note.md', 'https://example.com', 1, 'invalid']
        );
      });
    });

    test('should default link_type to "url"', async () => {
      await db.run(
        'INSERT INTO external_links (note_id, url, line_number) VALUES (?, ?, ?)',
        ['source/note.md', 'https://example.com', 1]
      );

      const links = await db.all('SELECT * FROM external_links');
      assert.strictEqual(links[0].link_type, 'url');
    });

    test('should handle CASCADE DELETE on note deletion', async () => {
      // Insert external links
      await db.run(
        'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'https://example.com', 1, 'url']
      );
      await db.run(
        'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'https://test.com', 2, 'image']
      );

      // Delete note
      await db.run('DELETE FROM notes WHERE id = ?', ['source/note.md']);

      // External links should be deleted
      const remainingLinks = await db.all('SELECT * FROM external_links');
      assert.strictEqual(remainingLinks.length, 0);
    });

    test('should have proper indexes for performance', async () => {
      const indexes = await db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='external_links'"
      );
      const indexNames = indexes.map((idx: any) => idx.name);

      assert.ok(indexNames.includes('idx_external_links_note'), 'Should have note index');
      assert.ok(indexNames.includes('idx_external_links_url'), 'Should have URL index');
    });

    test('should allow null title for external links', async () => {
      await db.run(
        'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'https://example.com', 1, 'url']
      );

      const links = await db.all('SELECT * FROM external_links');
      assert.strictEqual(links[0].title, null);
    });

    test('should require non-null values for required fields', async () => {
      // Should fail without note_id
      await assert.rejects(async () => {
        await db.run(
          'INSERT INTO external_links (url, line_number, link_type) VALUES (?, ?, ?)',
          ['https://example.com', 1, 'url']
        );
      });

      // Should fail without url
      await assert.rejects(async () => {
        await db.run(
          'INSERT INTO external_links (note_id, line_number, link_type) VALUES (?, ?, ?)',
          ['source/note.md', 1, 'url']
        );
      });
    });
  });

  describe('Database rebuild with link tables', () => {
    test('should clear link tables during rebuild', async () => {
      // Insert data in all tables
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'target/note.md', 'Target', 1]
      );
      await db.run(
        'INSERT INTO external_links (note_id, url, line_number, link_type) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'https://example.com', 1, 'url']
      );

      // Verify data exists
      const linksBefore = await db.all('SELECT * FROM note_links');
      const externalBefore = await db.all('SELECT * FROM external_links');
      assert.strictEqual(linksBefore.length, 1);
      assert.strictEqual(externalBefore.length, 1);

      // Rebuild database
      await dbManager.rebuild();

      // All data should be cleared
      const linksAfter = await db.all('SELECT * FROM note_links');
      const externalAfter = await db.all('SELECT * FROM external_links');
      const notesAfter = await db.all('SELECT * FROM notes');

      assert.strictEqual(linksAfter.length, 0);
      assert.strictEqual(externalAfter.length, 0);
      assert.strictEqual(notesAfter.length, 0);
    });
  });

  describe('Complex queries on link tables', () => {
    beforeEach(async () => {
      // Insert more test notes
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'hub/central.md',
          'Central Hub',
          'Content',
          'hub',
          'central.md',
          '/path3',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert test links
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'target/note.md', 'Target Note', 1]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', 'hub/central.md', 'Central Hub', 2]
      );
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['target/note.md', 'hub/central.md', 'Central Hub', 1]
      );

      // Insert broken link
      await db.run(
        'INSERT INTO note_links (source_note_id, target_note_id, target_title, line_number) VALUES (?, ?, ?, ?)',
        ['source/note.md', null, 'Broken Link', 3]
      );

      // Insert external links
      await db.run(
        'INSERT INTO external_links (note_id, url, title, line_number, link_type) VALUES (?, ?, ?, ?, ?)',
        ['source/note.md', 'https://google.com', 'Google', 4, 'url']
      );
      await db.run(
        'INSERT INTO external_links (note_id, url, title, line_number, link_type) VALUES (?, ?, ?, ?, ?)',
        ['target/note.md', 'https://example.com/image.png', 'Example Image', 1, 'image']
      );
    });

    test('should find notes that link to a specific target', async () => {
      const notes = await db.all(
        `
        SELECT DISTINCT n.* FROM notes n 
        INNER JOIN note_links nl ON n.id = nl.source_note_id 
        WHERE nl.target_note_id = ?
      `,
        ['hub/central.md']
      );

      assert.strictEqual(notes.length, 2);
      const noteIds = notes.map((n: any) => n.id);
      assert.ok(noteIds.includes('source/note.md'));
      assert.ok(noteIds.includes('target/note.md'));
    });

    test('should find notes with external links to specific domains', async () => {
      const notes = await db.all(
        `
        SELECT DISTINCT n.* FROM notes n 
        INNER JOIN external_links el ON n.id = el.note_id 
        WHERE el.url LIKE ?
      `,
        ['%google.com%']
      );

      assert.strictEqual(notes.length, 1);
      assert.strictEqual(notes[0].id, 'source/note.md');
    });

    test('should find notes with broken links', async () => {
      const notes = await db.all(`
        SELECT DISTINCT n.* FROM notes n 
        INNER JOIN note_links nl ON n.id = nl.source_note_id 
        WHERE nl.target_note_id IS NULL
      `);

      assert.strictEqual(notes.length, 1);
      assert.strictEqual(notes[0].id, 'source/note.md');
    });

    test('should count incoming links for notes', async () => {
      const linkCounts = await db.all(`
        SELECT 
          n.id,
          n.title,
          COUNT(nl.id) as incoming_count
        FROM notes n
        LEFT JOIN note_links nl ON n.id = nl.target_note_id
        GROUP BY n.id, n.title
        ORDER BY incoming_count DESC
      `);

      assert.strictEqual(linkCounts.length, 3);

      // Central hub should have most incoming links (2)
      const centralHub = linkCounts.find((n: any) => n.id === 'hub/central.md');
      assert.strictEqual(centralHub.incoming_count, 2);

      // Target note should have 1 incoming link
      const targetNote = linkCounts.find((n: any) => n.id === 'target/note.md');
      assert.strictEqual(targetNote.incoming_count, 1);

      // Source note should have 0 incoming links
      const sourceNote = linkCounts.find((n: any) => n.id === 'source/note.md');
      assert.strictEqual(sourceNote.incoming_count, 0);
    });

    test('should find notes by external link type', async () => {
      const imageLinks = await db.all(
        `
        SELECT n.*, el.url, el.title as link_title
        FROM notes n
        INNER JOIN external_links el ON n.id = el.note_id
        WHERE el.link_type = ?
      `,
        ['image']
      );

      assert.strictEqual(imageLinks.length, 1);
      assert.strictEqual(imageLinks[0].id, 'target/note.md');
      assert.strictEqual(imageLinks[0].url, 'https://example.com/image.png');
    });
  });
});
