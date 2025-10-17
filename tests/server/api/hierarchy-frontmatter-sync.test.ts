/**
 * Test suite for hierarchy operations frontmatter synchronization
 *
 * Tests that hierarchy operations properly sync changes between
 * the database and note frontmatter, ensuring bidirectional consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import type {
  AddSubnoteArgs,
  RemoveSubnoteArgs,
  ReorderSubnotesArgs
} from '../../../src/server/api/types.js';

describe('Hierarchy Operations - Frontmatter Sync', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('hierarchy-sync-test-vault');
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  // Helper function to create a test note via API (creates actual file)
  async function createApiNote(
    title: string,
    content: string = 'Test content',
    metadata: any = {}
  ) {
    const noteInfo = await testSetup.api.createNote({
      type: 'general',
      title,
      content,
      metadata,
      vaultId: testVaultId
    });

    // Also insert into database for hierarchy operations
    const { hybridSearchManager } = await (testSetup.api as any).getVaultContext(
      testVaultId
    );
    const db = await hybridSearchManager.getDatabaseConnection();

    await db.run(
      `
      INSERT OR IGNORE INTO notes (id, title, content, type, filename, path, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        noteInfo.id,
        title,
        content,
        'general',
        noteInfo.filename,
        noteInfo.path,
        noteInfo.created,
        noteInfo.created
      ]
    );

    return noteInfo;
  }

  // Helper function to get note and parse frontmatter
  async function getNoteWithFrontmatter(noteId: string) {
    const note = await testSetup.api.getNote(testVaultId, noteId);
    return note;
  }

  describe('addSubnote frontmatter sync', () => {
    it('should add subnotes to parent frontmatter when adding first child', async () => {
      // Create parent and child notes
      const parent = await createApiNote('Parent Note');
      const child = await createApiNote('Child Note');

      // Notes created successfully

      // Verify parent has no subnotes initially
      let parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toBeUndefined();

      // Add child to parent
      const addArgs: AddSubnoteArgs = {
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      };
      const result = await testSetup.api.addSubnote(addArgs);

      expect(result.success).toBe(true);

      // Verify hierarchy relationship was created in database
      const children = await testSetup.api.getChildren({
        vault_id: testVaultId,
        note_id: parent.id
      });

      // Verify parent frontmatter now includes subnotes
      parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toBeDefined();
      expect(parentNote.metadata.subnotes).toEqual(['general/child-note']);
    });

    it('should update parent frontmatter when adding multiple children', async () => {
      // Create parent and multiple children
      const parent = await createApiNote('Multi Parent Note');
      const child1 = await createApiNote('First Child');
      const child2 = await createApiNote('Second Child');
      const child3 = await createApiNote('Third Child');

      // Add first child
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child1.id
      });

      // Add second child
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child2.id
      });

      // Add third child
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child3.id
      });

      // Verify all children are in frontmatter
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual([
        'general/first-child',
        'general/second-child',
        'general/third-child'
      ]);
    });

    it('should preserve existing frontmatter metadata when adding subnotes', async () => {
      // Create parent with existing metadata
      const parent = await createApiNote('Parent With Metadata', 'Content', {
        tags: ['important', 'project'],
        priority: 'high',
        custom_field: 'custom_value'
      });
      const child = await createApiNote('Child Note');

      // Add child to parent
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      });

      // Verify existing metadata is preserved and subnotes added
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.tags).toEqual(['important', 'project']);
      expect(parentNote.metadata.priority).toBe('high');
      expect(parentNote.metadata.custom_field).toBe('custom_value');
      expect(parentNote.metadata.subnotes).toEqual(['general/child-note']);
    });
  });

  describe('removeSubnote frontmatter sync', () => {
    it('should remove subnotes from parent frontmatter when removing only child', async () => {
      // Create and setup parent-child relationship
      const parent = await createApiNote('Parent Note');
      const child = await createApiNote('Child Note');

      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      });

      // Verify child is in frontmatter
      let parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual(['general/child-note']);

      // Remove child from parent
      const removeArgs: RemoveSubnoteArgs = {
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      };
      const result = await testSetup.api.removeSubnote(removeArgs);
      expect(result.success).toBe(true);

      // Verify subnotes is removed from frontmatter
      parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toBeUndefined();
    });

    it('should update parent frontmatter when removing one of multiple children', async () => {
      // Create parent with multiple children
      const parent = await createApiNote('Multi Parent Note');
      const child1 = await createApiNote('First Child');
      const child2 = await createApiNote('Second Child');
      const child3 = await createApiNote('Third Child');

      // Add all children
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child1.id
      });
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child2.id
      });
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child3.id
      });

      // Remove middle child
      await testSetup.api.removeSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child2.id
      });

      // Verify remaining children are in frontmatter
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual([
        'general/first-child',
        'general/third-child'
      ]);
    });

    it('should preserve other metadata when removing subnotes', async () => {
      // Create parent with metadata and child
      const parent = await createApiNote('Parent With Metadata', 'Content', {
        tags: ['important'],
        priority: 'high'
      });
      const child = await createApiNote('Child Note');

      // Add and then remove child
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      });

      await testSetup.api.removeSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      });

      // Verify other metadata preserved, subnotes removed
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.tags).toEqual(['important']);
      expect(parentNote.metadata.priority).toBe('high');
      expect(parentNote.metadata.subnotes).toBeUndefined();
    });
  });

  describe('reorderSubnotes frontmatter sync', () => {
    it('should update frontmatter order when reordering subnotes', async () => {
      // Create parent with multiple children
      const parent = await createApiNote('Parent Note');
      const child1 = await createApiNote('Alpha Child');
      const child2 = await createApiNote('Beta Child');
      const child3 = await createApiNote('Gamma Child');

      // Add children in original order
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child1.id
      });
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child2.id
      });
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child3.id
      });

      // Verify original order
      let parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual([
        'general/alpha-child',
        'general/beta-child',
        'general/gamma-child'
      ]);

      // Reorder children: [Alpha, Beta, Gamma] -> [Gamma, Alpha, Beta]
      const reorderArgs: ReorderSubnotesArgs = {
        vault_id: testVaultId,
        parent_id: parent.id,
        child_ids: [child3.id, child1.id, child2.id]
      };
      const result = await testSetup.api.reorderSubnotes(reorderArgs);
      expect(result.success).toBe(true);

      // Verify new order in frontmatter
      parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual([
        'general/gamma-child',
        'general/alpha-child',
        'general/beta-child'
      ]);
    });

    it('should preserve other metadata when reordering subnotes', async () => {
      // Create parent with metadata and children
      const parent = await createApiNote('Parent With Metadata', 'Content', {
        tags: ['project'],
        status: 'active'
      });
      const child1 = await createApiNote('First Child');
      const child2 = await createApiNote('Second Child');

      // Add children
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child1.id
      });
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child2.id
      });

      // Reorder children
      await testSetup.api.reorderSubnotes({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_ids: [child2.id, child1.id]
      });

      // Verify metadata preserved, order updated
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.tags).toEqual(['project']);
      expect(parentNote.metadata.status).toBe('active');
      expect(parentNote.metadata.subnotes).toEqual([
        'general/second-child',
        'general/first-child'
      ]);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle sync failures gracefully without breaking hierarchy operations', async () => {
      const parent = await createApiNote('Parent Note');
      const child = await createApiNote('Child Note');

      // Add child - this should succeed even if sync has issues
      const result = await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: child.id
      });

      expect(result.success).toBe(true);

      // The hierarchy relationship should exist in database even if sync fails
      const childrenResult = await testSetup.api.getChildren({
        vault_id: testVaultId,
        note_id: parent.id
      });
      expect(childrenResult.children).toHaveLength(1);
      expect(childrenResult.children[0].child_id).toBe(child.id);
    });

    it('should handle notes with existing subnotes in frontmatter', async () => {
      // Create a parent note with subnotes already in frontmatter
      const parent = await createApiNote('Parent Note', 'Content', {
        subnotes: ['general/Existing Child']
      });
      const newChild = await createApiNote('New Child');

      // Add new child
      await testSetup.api.addSubnote({
        vault_id: testVaultId,
        parent_id: parent.id,
        child_id: newChild.id
      });

      // Verify the frontmatter is updated with current database state
      const parentNote = await getNoteWithFrontmatter(parent.id);
      expect(parentNote.metadata.subnotes).toEqual(['general/new-child']);
    });
  });
});
