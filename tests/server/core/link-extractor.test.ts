/**
 * Tests for LinkExtractor - ID-based link handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LinkExtractor } from '../../../src/server/core/link-extractor.js';
import { TestApiSetup } from '../api/test-setup.js';

describe('LinkExtractor - ID-based links', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;

  // Helper to get database connection for the test vault
  async function getDb() {
    const { hybridSearchManager } = await (testSetup.api as any).getVaultContext(
      testVaultId
    );
    return await hybridSearchManager.getDatabaseConnection();
  }

  // Helper to insert a note directly into the database for testing LinkExtractor
  async function insertTestNote(options: {
    id?: string;
    title: string;
    content: string;
    type?: string;
  }) {
    const db = await getDb();
    // Generate valid hex ID format (n-xxxxxxxx)
    const id =
      options.id || `n-${Math.random().toString(16).substring(2, 10).padEnd(8, '0')}`;
    const now = Date.now();

    await db.run(
      `INSERT INTO notes (id, title, content, type, filename, path, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        options.title,
        options.content,
        options.type || 'general',
        `${options.title.toLowerCase().replace(/\s+/g, '-')}.md`,
        '',
        now,
        now
      ]
    );

    return { id, title: options.title, content: options.content };
  }

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('link-extractor-test');
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('extractLinks - ID-based wikilinks', () => {
    it('should extract ID-based wikilink without display text', () => {
      const content = 'See [[n-12345678]] for details.';
      const result = LinkExtractor.extractLinks(content);

      expect(result.wikilinks).toHaveLength(1);
      expect(result.wikilinks[0]).toMatchObject({
        target_title: 'n-12345678',
        line_number: 1,
        target_note_id: 'n-12345678'
      });
      expect(result.wikilinks[0].link_text).toBeUndefined();
    });

    it('should extract ID-based wikilink with display text', () => {
      const content = 'See [[n-12345678|My Note]] for details.';
      const result = LinkExtractor.extractLinks(content);

      expect(result.wikilinks).toHaveLength(1);
      expect(result.wikilinks[0]).toMatchObject({
        target_title: 'n-12345678',
        link_text: 'My Note',
        line_number: 1,
        target_note_id: 'n-12345678'
      });
    });

    it('should extract multiple ID-based wikilinks', () => {
      const content = `First line with [[n-11111111|First]].
Second line with [[n-22222222|Second]].
Third line with [[n-33333333]].`;
      const result = LinkExtractor.extractLinks(content);

      expect(result.wikilinks).toHaveLength(3);
      expect(result.wikilinks[0]).toMatchObject({
        target_note_id: 'n-11111111',
        line_number: 1
      });
      expect(result.wikilinks[1]).toMatchObject({
        target_note_id: 'n-22222222',
        line_number: 2
      });
      expect(result.wikilinks[2]).toMatchObject({
        target_note_id: 'n-33333333',
        line_number: 3
      });
    });

    it('should extract mix of ID-based and title-based wikilinks', () => {
      const content = 'See [[n-12345678|ID Link]] and [[meeting/standup|Title Link]].';
      const result = LinkExtractor.extractLinks(content);

      expect(result.wikilinks).toHaveLength(2);

      // ID-based link has target_note_id set
      expect(result.wikilinks[0]).toMatchObject({
        target_title: 'n-12345678',
        target_note_id: 'n-12345678'
      });

      // Title-based link does not have target_note_id set yet
      expect(result.wikilinks[1]).toMatchObject({
        target_title: 'meeting/standup'
      });
      expect(result.wikilinks[1].target_note_id).toBeUndefined();
    });
  });

  describe('resolveWikilinks - ID-based links', () => {
    it('should validate ID-based links exist in database', async () => {
      const db = await getDb();

      // Create a note with a specific ID that the wikilink references
      const targetNote = await insertTestNote({
        id: 'n-12345678',
        title: 'Target Note',
        content: 'Target content'
      });

      const wikilinks = [
        {
          target_title: 'n-12345678',
          line_number: 1,
          target_note_id: 'n-12345678'
        }
      ];

      const resolved = await LinkExtractor.resolveWikilinks(wikilinks, db);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        target_title: 'n-12345678',
        target_note_id: targetNote.id
      });
    });

    it('should set target_note_id to undefined for non-existent ID-based links', async () => {
      const db = await getDb();

      // Don't create a note - the ID doesn't exist
      const wikilinks = [
        {
          target_title: 'n-12345678',
          line_number: 1,
          target_note_id: 'n-12345678'
        }
      ];

      const resolved = await LinkExtractor.resolveWikilinks(wikilinks, db);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        target_title: 'n-12345678'
      });
      // Non-existent ID should become undefined (broken link)
      expect(resolved[0].target_note_id).toBeUndefined();
    });

    it('should resolve title-based links and validate ID-based links', async () => {
      const db = await getDb();

      // Create both notes - one for the ID-based link and one for title-based
      const idNote = await insertTestNote({
        id: 'n-12345678',
        title: 'ID Note',
        content: 'ID content'
      });

      const note = await testSetup.api.createNote({
        vaultId: testVaultId,
        type: 'meeting',
        title: 'Test Meeting',
        content: 'Meeting content'
      });

      const wikilinks = [
        {
          target_title: 'n-12345678',
          line_number: 1,
          target_note_id: 'n-12345678'
        },
        {
          target_title: 'Test Meeting',
          line_number: 2
        }
      ];

      const resolved = await LinkExtractor.resolveWikilinks(wikilinks, db);

      expect(resolved).toHaveLength(2);

      // ID-based link validated and preserved
      expect(resolved[0]).toMatchObject({
        target_note_id: idNote.id
      });

      // Title-based link resolved
      expect(resolved[1]).toMatchObject({
        target_note_id: note.id
      });
    });
  });

  describe('findNoteByTitle - ID validation', () => {
    it('should validate that note ID exists in database', async () => {
      const db = await getDb();

      // Create a note
      const note = await testSetup.api.createNote({
        vaultId: testVaultId,
        type: 'general',
        title: 'Test Note',
        content: 'Content'
      });

      // Should find existing note ID
      const foundId = await LinkExtractor.findNoteByTitle(note.id, db);
      expect(foundId).toBe(note.id);
    });

    it('should return undefined for non-existent note ID', async () => {
      const db = await getDb();

      // Should not find non-existent ID
      const foundId = await LinkExtractor.findNoteByTitle('n-99999999', db);
      expect(foundId).toBeUndefined();
    });

    it('should still resolve title-based links', async () => {
      const db = await getDb();

      const note = await testSetup.api.createNote({
        vaultId: testVaultId,
        type: 'general',
        title: 'My Test Note',
        content: 'Content'
      });

      const foundId = await LinkExtractor.findNoteByTitle('My Test Note', db);
      expect(foundId).toBe(note.id);
    });
  });

  describe('storeLinks - ID-based links', () => {
    it('should store ID-based wikilinks with target_note_id', async () => {
      const db = await getDb();

      // Create target note with specific ID
      const targetNote = await insertTestNote({
        id: 'n-12345678',
        title: 'Target',
        content: 'Target content'
      });

      // Create source note directly in database
      const sourceContent = 'See [[n-12345678|Target]] for details.';
      const sourceNote = await insertTestNote({
        title: 'Source',
        content: sourceContent
      });

      // Extract and store links
      const extractionResult = LinkExtractor.extractLinks(sourceContent);
      await LinkExtractor.storeLinks(sourceNote.id, extractionResult, db);

      // Verify link was stored with target_note_id
      const links = await LinkExtractor.getLinksForNote(sourceNote.id, db);
      expect(links.outgoing_internal).toHaveLength(1);
      expect(links.outgoing_internal[0]).toMatchObject({
        source_note_id: sourceNote.id,
        target_note_id: targetNote.id,
        target_title: 'n-12345678',
        link_text: 'Target'
      });
    });

    it('should store mix of ID-based and title-based links', async () => {
      const db = await getDb();

      // Create target note for ID-based link
      const idTarget = await insertTestNote({
        id: 'n-12345678',
        title: 'ID Target',
        content: 'ID target content'
      });

      // Create target note for title-based link
      const titleTarget = await insertTestNote({
        type: 'meeting',
        title: 'Meeting Note',
        content: 'Meeting content'
      });

      // Create source note with both types of links
      const sourceContent = 'See [[n-12345678|ID Link]] and [[Meeting Note|Title Link]].';
      const sourceNote = await insertTestNote({
        title: 'Source',
        content: sourceContent
      });

      // Extract and store links
      const extractionResult = LinkExtractor.extractLinks(sourceContent);
      await LinkExtractor.storeLinks(sourceNote.id, extractionResult, db);

      // Verify both links were stored
      const links = await LinkExtractor.getLinksForNote(sourceNote.id, db);
      expect(links.outgoing_internal).toHaveLength(2);

      // ID-based link
      expect(links.outgoing_internal[0]).toMatchObject({
        target_note_id: idTarget.id,
        target_title: 'n-12345678'
      });

      // Title-based link (resolved)
      expect(links.outgoing_internal[1]).toMatchObject({
        target_note_id: titleTarget.id,
        target_title: 'Meeting Note'
      });
    });
  });

  describe('getBacklinks - ID-based links', () => {
    it('should find backlinks using ID-based wikilinks', async () => {
      const db = await getDb();

      // Create target note
      const targetNote = await testSetup.api.createNote({
        vaultId: testVaultId,
        type: 'general',
        title: 'Target',
        content: 'Target content'
      });

      // Create source note with ID-based link to target
      const sourceContent = `See [[${targetNote.id}|Target]] for details.`;
      const sourceNote = await testSetup.api.createNote({
        vaultId: testVaultId,
        type: 'general',
        title: 'Source',
        content: sourceContent
      });

      // Extract and store links
      const extractionResult = LinkExtractor.extractLinks(sourceContent);
      await LinkExtractor.storeLinks(sourceNote.id, extractionResult, db);

      // Get backlinks to target
      const backlinks = await LinkExtractor.getBacklinks(targetNote.id, db);
      expect(backlinks).toHaveLength(1);
      expect(backlinks[0]).toMatchObject({
        source_note_id: sourceNote.id,
        target_note_id: targetNote.id
      });
    });
  });

  describe('updateBrokenLinks - with ID-based links', () => {
    it('should not affect ID-based links when updating broken links', async () => {
      const db = await getDb();

      // Create target note for ID-based link
      const idTarget = await insertTestNote({
        id: 'n-12345678',
        title: 'ID Target',
        content: 'ID target content'
      });

      // Create a note with a broken title-based link and a working ID-based link
      const sourceContent = '[[n-12345678|ID Link]] and [[Missing Note]]';
      const sourceNote = await insertTestNote({
        title: 'Source',
        content: sourceContent
      });

      // Extract and store links (ID-based has target, title-based doesn't)
      const extractionResult = LinkExtractor.extractLinks(sourceContent);
      await LinkExtractor.storeLinks(sourceNote.id, extractionResult, db);

      // Create the missing note
      const newNote = await insertTestNote({
        title: 'Missing Note',
        content: 'Now exists'
      });

      // Update broken links
      const updated = await LinkExtractor.updateBrokenLinks(
        newNote.id,
        'Missing Note',
        db
      );
      expect(updated).toBe(1); // Only the title-based link should be updated

      // Verify links
      const links = await LinkExtractor.getLinksForNote(sourceNote.id, db);
      expect(links.outgoing_internal).toHaveLength(2);

      // ID-based link should be unchanged
      const idLink = links.outgoing_internal.find((l) => l.target_title === 'n-12345678');
      expect(idLink?.target_note_id).toBe(idTarget.id);

      // Title-based link should now be resolved
      const titleLink = links.outgoing_internal.find(
        (l) => l.target_title === 'Missing Note'
      );
      expect(titleLink?.target_note_id).toBe(newNote.id);
    });
  });

  describe('convertTitleLinksToIdLinks', () => {
    it('should convert title-based link without display text to bare ID-based link', async () => {
      const db = await getDb();

      // Create target note
      const targetNote = await insertTestNote({
        title: 'My Target Note',
        content: 'Target content'
      });

      const content = 'See [[My Target Note]] for details.';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(`See [[${targetNote.id}]] for details.`);
    });

    it('should convert title-based link with custom display text, preserving the display text', async () => {
      const db = await getDb();

      // Create target note
      const targetNote = await insertTestNote({
        title: 'Long Note Title',
        content: 'Content'
      });

      const content = 'See [[Long Note Title|Short Name]] for details.';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(`See [[${targetNote.id}|Short Name]] for details.`);
    });

    it('should convert multiple title-based links, preserving custom display text', async () => {
      const db = await getDb();

      const note1 = await insertTestNote({
        title: 'First Note',
        content: 'Content 1'
      });

      const note2 = await insertTestNote({
        title: 'Second Note',
        content: 'Content 2'
      });

      const content = 'See [[First Note]] and [[Second Note|Second]].';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(`See [[${note1.id}]] and [[${note2.id}|Second]].`);
    });

    it('should leave ID-based links unchanged', async () => {
      const db = await getDb();

      const content = 'See [[n-12345678|My Link]] for details.';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(content);
    });

    it('should leave broken links unchanged', async () => {
      const db = await getDb();

      const content = 'See [[Nonexistent Note]] for details.';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(content);
    });

    it('should handle mix of ID-based, title-based, and broken links', async () => {
      const db = await getDb();

      const targetNote = await insertTestNote({
        title: 'Existing Note',
        content: 'Content'
      });

      const content = 'See [[n-12345678|ID Link]], [[Existing Note]], and [[Missing]].';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(
        `See [[n-12345678|ID Link]], [[${targetNote.id}]], and [[Missing]].`
      );
    });

    it('should handle type/filename format links', async () => {
      const db = await getDb();

      const targetNote = await insertTestNote({
        id: 'n-abcd1234',
        title: 'Meeting Notes',
        type: 'meeting',
        content: 'Meeting content'
      });

      // Insert note with filename matching type/filename pattern
      await db.run('UPDATE notes SET filename = ? WHERE id = ?', [
        'standup.md',
        targetNote.id
      ]);

      const content = 'See [[meeting/standup]] for details.';
      const rewritten = await LinkExtractor.convertTitleLinksToIdLinks(content, db);

      expect(rewritten).toBe(`See [[${targetNote.id}]] for details.`);
    });
  });
});
