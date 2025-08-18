/**
 * Link Manager Tests
 *
 * Tests for the LinkManager class and link_notes functionality
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Workspace } from '../../src/core/workspace.ts';
import { NoteManager } from '../../src/core/notes.ts';
import { LinkManager } from '../../src/core/links.ts';
import type { LinkRelationship } from '../../src/types/index.ts';

let tempDir: string;
let workspace: Workspace;
let noteManager: NoteManager;
let linkManager: LinkManager;

describe('LinkManager', () => {
  beforeEach(async () => {
    // Create temporary workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flint-note-test-'));
    workspace = new Workspace(tempDir);
    await workspace.initialize();

    noteManager = new NoteManager(workspace);
    linkManager = new LinkManager(workspace, noteManager);

    // Create test notes
    await noteManager.createNote(
      'general',
      'Source Note',
      'This is the source note content.'
    );
    await noteManager.createNote(
      'general',
      'Target Note',
      'This is the target note content.'
    );
    await noteManager.createNote(
      'general',
      'Another Note',
      'This is another note for testing.'
    );
  });

  afterEach(async () => {
    // Clean up temporary workspace
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Linking', () => {
    test('should create a basic bidirectional link', async () => {
      const result = await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references',
        bidirectional: true
      });

      assert.ok(result.success, 'Link creation should succeed');
      assert.strictEqual(result.link_created.source, 'general/source-note.md');
      assert.strictEqual(result.link_created.target, 'general/target-note.md');
      assert.strictEqual(result.link_created.relationship, 'references');
      assert.strictEqual(result.link_created.bidirectional, true);
      assert.ok(result.reverse_link_created, 'Reverse link should be created');
    });

    test('should create a unidirectional link', async () => {
      const result = await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'mentions',
        bidirectional: false
      });

      assert.ok(result.success, 'Link creation should succeed');
      assert.strictEqual(result.link_created.bidirectional, false);
      assert.strictEqual(
        result.reverse_link_created,
        false,
        'Reverse link should not be created'
      );
    });

    test('should include context in link metadata', async () => {
      const context = 'This is a test link with context';

      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references',
        context
      });

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');
      const links = sourceNote.metadata.links || { outbound: [], inbound: [] };

      assert.ok(links.outbound && links.outbound.length > 0, 'Links should exist');
      const link = links.outbound.find(l => l.target === 'general/target-note.md');
      assert.ok(link, 'Specific link should exist');
      assert.strictEqual(link.context, context, 'Context should be preserved');
    });
  });

  describe('Relationship Types', () => {
    const relationshipTests: Array<{
      relationship: LinkRelationship;
      expectedReverse: LinkRelationship;
    }> = [
      { relationship: 'references', expectedReverse: 'mentions' },
      { relationship: 'follows-up', expectedReverse: 'mentions' },
      { relationship: 'contradicts', expectedReverse: 'contradicts' },
      { relationship: 'supports', expectedReverse: 'supports' },
      { relationship: 'mentions', expectedReverse: 'mentions' },
      { relationship: 'depends-on', expectedReverse: 'blocks' },
      { relationship: 'blocks', expectedReverse: 'depends-on' },
      { relationship: 'related-to', expectedReverse: 'related-to' }
    ];

    relationshipTests.forEach(({ relationship, expectedReverse }) => {
      test(`should handle "${relationship}" relationship correctly`, async () => {
        const result = await linkManager.linkNotes({
          source: 'general/source-note.md',
          target: 'general/target-note.md',
          relationship,
          bidirectional: true
        });

        assert.ok(result.success, `${relationship} link should succeed`);
        assert.strictEqual(result.link_created.relationship, relationship);

        // Check forward link
        const sourceNote = await noteManager.getNote('general/source-note.md');
        assert.ok(sourceNote, 'Source note should exist');
        const sourceLinks = sourceNote.metadata.links || { outbound: [], inbound: [] };
        const forwardLink = sourceLinks.outbound?.find(
          l => l.target === 'general/target-note.md'
        );
        assert.ok(forwardLink, 'Forward link should exist');
        assert.strictEqual(forwardLink.relationship, relationship);

        // Check reverse link
        const targetNote = await noteManager.getNote('general/target-note.md');
        assert.ok(targetNote, 'Target note should exist');
        const targetLinks = targetNote.metadata.links || { outbound: [], inbound: [] };
        const reverseLink = targetLinks.outbound?.find(
          l => l.target === 'general/source-note.md'
        );
        assert.ok(reverseLink, 'Reverse link should exist');
        assert.strictEqual(reverseLink.relationship, expectedReverse);
      });
    });

    test('should reject invalid relationship types', async () => {
      await assert.rejects(
        async () => {
          await linkManager.linkNotes({
            source: 'general/source-note.md',
            target: 'general/target-note.md',
            relationship: 'invalid-relationship' as LinkRelationship
          });
        },
        /Invalid relationship type/,
        'Should reject invalid relationship'
      );
    });
  });

  describe('Link Verification and Metadata', () => {
    test('should store links in YAML frontmatter', async () => {
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');
      const links = sourceNote.metadata.links;

      assert.ok(links && typeof links === 'object', 'Links should be an object');
      assert.ok(Array.isArray(links.outbound), 'Outbound links should be an array');
      assert.ok(links.outbound.length > 0, 'Should have at least one outbound link');

      const link = links.outbound[0];
      assert.strictEqual(link.target, 'general/target-note.md');
      assert.strictEqual(link.relationship, 'references');
      assert.ok(link.created, 'Should have creation timestamp');
      assert.ok(typeof link.created === 'string', 'Timestamp should be string');
    });

    test('should preserve existing metadata when adding links', async () => {
      // Create note with custom metadata
      const customContent = `---
title: "Custom Title"
author: "Test Author"
tags: ["test", "custom"]
---

# Custom Title

This is a note with custom metadata.`;

      await fs.writeFile(
        path.join(workspace.getNoteTypePath('general'), 'custom-note.md'),
        customContent
      );

      await linkManager.linkNotes({
        source: 'general/custom-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      const updatedNote = await noteManager.getNote('general/custom-note.md');
      assert.ok(updatedNote, 'Updated note should exist');

      assert.strictEqual(updatedNote.metadata.author, 'Test Author');
      assert.deepStrictEqual(updatedNote.metadata.tags, ['test', 'custom']);
      assert.ok(updatedNote.metadata.links, 'Links should be added');
    });

    test('should add inline wikilinks to content', async () => {
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');

      assert.ok(
        sourceNote.content.includes('[[general/target-note|Target Note]]'),
        'Should contain wikilink to target note'
      );
    });

    test('should not add duplicate inline links', async () => {
      // Create first link
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      // Create second link to different note
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/another-note.md',
        relationship: 'mentions'
      });

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');
      const wikilinkMatches = sourceNote.content.match(
        /\[\[general\/target-note\|Target Note\]\]/g
      );

      assert.strictEqual(
        wikilinkMatches?.length,
        1,
        'Should only have one wikilink to the same note'
      );
    });
  });

  describe('Duplicate Link Prevention', () => {
    test('should prevent duplicate links with same relationship', async () => {
      // Create first link
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      // Try to create duplicate link
      await assert.rejects(
        async () => {
          await linkManager.linkNotes({
            source: 'general/source-note.md',
            target: 'general/target-note.md',
            relationship: 'references'
          });
        },
        /Link already exists/,
        'Should prevent duplicate links'
      );
    });

    test('should allow different relationships between same notes', async () => {
      // Create first link
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references',
        bidirectional: false
      });

      // Create second link with different relationship
      const result = await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'supports',
        bidirectional: false
      });

      assert.ok(result.success, 'Should allow different relationship');

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');
      const links = sourceNote.metadata.links || { outbound: [], inbound: [] };

      assert.strictEqual(links.outbound?.length || 0, 2, 'Should have two links');
      assert.ok(links.outbound?.some(l => l.relationship === 'references'));
      assert.ok(links.outbound?.some(l => l.relationship === 'supports'));
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent source note', async () => {
      await assert.rejects(
        async () => {
          await linkManager.linkNotes({
            source: 'general/non-existent-source.md',
            target: 'general/target-note.md',
            relationship: 'references'
          });
        },
        /does not exist/,
        'Should reject non-existent source note'
      );
    });

    test('should handle non-existent target note', async () => {
      await assert.rejects(
        async () => {
          await linkManager.linkNotes({
            source: 'general/source-note.md',
            target: 'general/non-existent-target.md',
            relationship: 'references'
          });
        },
        /does not exist/,
        'Should reject non-existent target note'
      );
    });

    test('should handle malformed note identifiers gracefully', async () => {
      await assert.rejects(async () => {
        await linkManager.linkNotes({
          source: '',
          target: 'general/target-note.md',
          relationship: 'references'
        });
      }, 'Should reject empty source identifier');

      await assert.rejects(async () => {
        await linkManager.linkNotes({
          source: 'general/source-note.md',
          target: '',
          relationship: 'references'
        });
      }, 'Should reject empty target identifier');
    });
  });

  describe('Link Retrieval and Management', () => {
    test('should retrieve links for a specific note', async () => {
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/another-note.md',
        relationship: 'mentions',
        bidirectional: false
      });

      const links = await linkManager.getLinksForNote('general/source-note.md');
      assert.strictEqual(links.outbound?.length || 0, 2, 'Should have two links');
      assert.ok(links.outbound.some(l => l.target === 'general/target-note.md'));
      assert.ok(links.outbound.some(l => l.target === 'general/another-note.md'));
    });

    test('should remove specific links', async () => {
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references',
        bidirectional: false
      });

      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/another-note.md',
        relationship: 'mentions',
        bidirectional: false
      });

      const removed = await linkManager.removeLink(
        'general/source-note.md',
        'general/target-note.md',
        'references'
      );

      assert.ok(removed, 'Link removal should succeed');

      const remainingLinks = await linkManager.getLinksForNote('general/source-note.md');
      assert.strictEqual(
        remainingLinks.outbound.length,
        1,
        'Should have one remaining link'
      );
      assert.strictEqual(remainingLinks.outbound[0].target, 'general/another-note.md');
    });

    test('should return false when removing non-existent link', async () => {
      const removed = await linkManager.removeLink(
        'general/source-note.md',
        'general/target-note.md',
        'references'
      );

      assert.strictEqual(removed, false, 'Should return false for non-existent link');
    });
  });

  describe('Edge Cases', () => {
    test('should handle notes with existing links', async () => {
      // Create initial link
      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      // Add another link to same source note
      const result = await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/another-note.md',
        relationship: 'mentions'
      });

      assert.ok(result.success, 'Should successfully add second link');

      const sourceNote = await noteManager.getNote('general/source-note.md');
      assert.ok(sourceNote, 'Source note should exist');
      const links = sourceNote.metadata.links || { outbound: [], inbound: [] };

      assert.strictEqual(links.outbound?.length || 0, 2, 'Should have two links');
    });

    test('should handle notes without existing frontmatter', async () => {
      // Create note without frontmatter
      const plainContent = 'This is a plain note without frontmatter.';
      await fs.writeFile(
        path.join(workspace.getNoteTypePath('general'), 'plain-note.md'),
        plainContent
      );

      const result = await linkManager.linkNotes({
        source: 'general/plain-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      assert.ok(result.success, 'Should handle note without frontmatter');

      const updatedNote = await noteManager.getNote('general/plain-note.md');
      assert.ok(updatedNote, 'Updated note should exist');
      assert.ok(updatedNote.metadata.links, 'Should add links metadata');
    });

    test('should preserve note content structure', async () => {
      const originalNote = await noteManager.getNote('general/source-note.md');
      assert.ok(originalNote, 'Original note should exist');
      const originalContent = originalNote.content;

      await linkManager.linkNotes({
        source: 'general/source-note.md',
        target: 'general/target-note.md',
        relationship: 'references'
      });

      const updatedNote = await noteManager.getNote('general/source-note.md');
      assert.ok(updatedNote, 'Updated note should exist');

      // Content should still contain the original content
      assert.ok(
        updatedNote.content.includes(originalContent.trim()),
        'Should preserve original content'
      );
    });
  });
});
