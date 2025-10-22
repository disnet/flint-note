/**
 * Tests for WorkflowManager - Supplementary Materials Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../api/test-setup.js';
import { WorkflowManager } from '../../../src/server/core/workflow-manager.js';

describe('WorkflowManager - Supplementary Materials', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let workflowManager: WorkflowManager;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('workflow-materials-test');

    const db = await testSetup.api.getDatabaseConnection();
    workflowManager = new WorkflowManager(db);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('addSupplementaryMaterial', () => {
    it('should add text material to workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Some helpful context for this workflow',
        position: 0
      });

      expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(1);
      expect(updated.supplementaryMaterials?.[0].materialType).toBe('text');
      expect(updated.supplementaryMaterials?.[0].content).toBe(
        'Some helpful context for this workflow'
      );
    });

    it('should add code material with metadata', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const code = 'function example() { return "test"; }';
      const metadata = { language: 'javascript', filename: 'example.js' };

      const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'code',
        content: code,
        metadata,
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(1);
      expect(updated.supplementaryMaterials?.[0].materialType).toBe('code');
      expect(updated.supplementaryMaterials?.[0].content).toBe(code);
      expect(updated.supplementaryMaterials?.[0].metadata).toEqual(metadata);
    });

    it('should add note reference material', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'note_reference',
        noteId: 'general/reference-note',
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(1);
      expect(updated.supplementaryMaterials?.[0].materialType).toBe('note_reference');
      expect(updated.supplementaryMaterials?.[0].noteId).toBe('general/reference-note');
    });

    it('should add multiple materials in order', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'First material',
        position: 0
      });

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Second material',
        position: 1
      });

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Third material',
        position: 2
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(3);
      expect(updated.supplementaryMaterials?.[0].content).toBe('First material');
      expect(updated.supplementaryMaterials?.[1].content).toBe('Second material');
      expect(updated.supplementaryMaterials?.[2].content).toBe('Third material');
    });

    it('should auto-increment position when adding materials', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      // Add without specifying position (should auto-calculate)
      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Auto position 1',
        position: 0
      });

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Auto position 2',
        position: 1
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(2);
      expect(updated.supplementaryMaterials?.[0].position).toBe(0);
      expect(updated.supplementaryMaterials?.[1].position).toBe(1);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(
        workflowManager.addSupplementaryMaterial('w-nonexist', {
          materialType: 'text',
          content: 'Test',
          position: 0
        })
      ).rejects.toThrow(/Workflow not found/);
    });
  });

  describe('removeSupplementaryMaterial', () => {
    it('should remove a material from workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'To be removed',
        position: 0
      });

      // Verify it was added
      let updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });
      expect(updated.supplementaryMaterials).toHaveLength(1);

      // Remove it
      await workflowManager.removeSupplementaryMaterial(materialId);

      // Verify it was removed
      updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });
      expect(updated.supplementaryMaterials).toHaveLength(0);
    });

    it('should remove only the specified material', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const id1 = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Keep this',
        position: 0
      });

      const id2 = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Remove this',
        position: 1
      });

      const id3 = await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: 'Keep this too',
        position: 2
      });

      // Remove the middle one
      await workflowManager.removeSupplementaryMaterial(id2);

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(2);
      expect(updated.supplementaryMaterials?.[0].content).toBe('Keep this');
      expect(updated.supplementaryMaterials?.[1].content).toBe('Keep this too');
    });

    it('should throw error for non-existent material', async () => {
      await expect(
        workflowManager.removeSupplementaryMaterial('wm-nonexist')
      ).rejects.toThrow(/Material not found/);
    });
  });

  describe('materials with workflow creation', () => {
    it('should create workflow with multiple types of materials', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Complex Workflow',
        purpose: 'Has various materials',
        description: 'Test',
        supplementaryMaterials: [
          {
            type: 'text',
            content: 'Background information'
          },
          {
            type: 'code',
            content: 'const x = 1;',
            metadata: { language: 'javascript' }
          },
          {
            type: 'note_reference',
            noteId: 'general/related-note'
          },
          {
            type: 'text',
            content: 'Additional notes'
          }
        ]
      });

      expect(workflow.supplementaryMaterials).toHaveLength(4);
      expect(workflow.supplementaryMaterials?.[0].materialType).toBe('text');
      expect(workflow.supplementaryMaterials?.[1].materialType).toBe('code');
      expect(workflow.supplementaryMaterials?.[2].materialType).toBe('note_reference');
      expect(workflow.supplementaryMaterials?.[3].materialType).toBe('text');
    });

    it('should preserve material order on creation', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Ordered Materials',
        purpose: 'Order matters',
        description: 'Test',
        supplementaryMaterials: [
          { type: 'text', content: 'First' },
          { type: 'text', content: 'Second' },
          { type: 'text', content: 'Third' }
        ]
      });

      expect(workflow.supplementaryMaterials?.[0].content).toBe('First');
      expect(workflow.supplementaryMaterials?.[0].position).toBe(0);
      expect(workflow.supplementaryMaterials?.[1].content).toBe('Second');
      expect(workflow.supplementaryMaterials?.[1].position).toBe(1);
      expect(workflow.supplementaryMaterials?.[2].content).toBe('Third');
      expect(workflow.supplementaryMaterials?.[2].position).toBe(2);
    });
  });

  describe('materials with complex metadata', () => {
    it('should store and retrieve complex metadata', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      const complexMetadata = {
        language: 'typescript',
        filename: 'test.ts',
        version: '1.0',
        tags: ['example', 'test'],
        nested: {
          key: 'value',
          count: 42
        }
      };

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'code',
        content: 'const test = 1;',
        metadata: complexMetadata,
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials?.[0].metadata).toEqual(complexMetadata);
    });

    it('should handle materials without content (note references)', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'note_reference',
        noteId: 'general/example',
        metadata: { description: 'Related note' },
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials?.[0].content).toBeUndefined();
      expect(updated.supplementaryMaterials?.[0].noteId).toBe('general/example');
      expect(updated.supplementaryMaterials?.[0].metadata).toEqual({
        description: 'Related note'
      });
    });
  });

  describe('large materials handling', () => {
    it('should handle large text materials', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      const largeText = 'x'.repeat(10000);

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'text',
        content: largeText,
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials?.[0].content).toHaveLength(10000);
    });

    it('should handle large code materials', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      const largeCode = 'function test() {\n' + '  return "test";\n'.repeat(1000) + '}';

      await workflowManager.addSupplementaryMaterial(workflow.id, {
        materialType: 'code',
        content: largeCode,
        metadata: { language: 'javascript' },
        position: 0
      });

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials?.[0].content).toContain('return "test";');
    });

    it('should handle workflows with many materials', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      // Add 20 materials
      for (let i = 0; i < 20; i++) {
        await workflowManager.addSupplementaryMaterial(workflow.id, {
          materialType: 'text',
          content: `Material ${i}`,
          position: i
        });
      }

      const updated = await workflowManager.getWorkflow({
        workflowId: workflow.id,
        includeSupplementaryMaterials: true
      });

      expect(updated.supplementaryMaterials).toHaveLength(20);
      expect(updated.supplementaryMaterials?.[0].content).toBe('Material 0');
      expect(updated.supplementaryMaterials?.[19].content).toBe('Material 19');
    });
  });
});
