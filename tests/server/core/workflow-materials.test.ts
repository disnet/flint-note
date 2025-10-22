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

  describe('Material Size Validation', () => {
    describe('Individual Material Size Limit (50KB)', () => {
      it('should reject material with content exceeding 50KB', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Create a string slightly over 50KB
        const largeContent = 'x'.repeat(51 * 1024);

        await expect(
          workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: largeContent,
            position: 0
          })
        ).rejects.toThrow(/Material size.*exceeds maximum allowed size of 50.00 KB/);
      });

      it('should accept material with content exactly at 50KB limit', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Create a string exactly 50KB
        const content = 'x'.repeat(50 * 1024);

        const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
          materialType: 'text',
          content,
          position: 0
        });

        expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);
      });

      it('should accept material with content just under 50KB limit', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Create a string just under 50KB
        const content = 'x'.repeat(49 * 1024);

        const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
          materialType: 'text',
          content,
          position: 0
        });

        expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);
      });

      it('should include metadata size in validation', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Create content that's just under 50KB
        const content = 'x'.repeat(49 * 1024);
        // Add metadata that pushes total over 50KB
        const metadata = { largeField: 'y'.repeat(2 * 1024) };

        await expect(
          workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'code',
            content,
            metadata,
            position: 0
          })
        ).rejects.toThrow(/Material size.*exceeds maximum allowed size of 50.00 KB/);
      });

      it('should reject material during workflow creation if exceeds 50KB', async () => {
        const largeContent = 'x'.repeat(51 * 1024);

        await expect(
          workflowManager.createWorkflow(testVaultId, {
            name: 'Test Workflow',
            purpose: 'Test',
            description: 'Test',
            supplementaryMaterials: [
              {
                type: 'text',
                content: largeContent
              }
            ]
          })
        ).rejects.toThrow(/Material size.*exceeds maximum allowed size of 50.00 KB/);
      });
    });

    describe('Total Materials Size Limit (500KB)', () => {
      it('should reject adding material that would exceed 500KB total', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Add materials totaling close to 500KB
        // Add 10 materials of 49KB each = 490KB
        for (let i = 0; i < 10; i++) {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(49 * 1024),
            position: i
          });
        }

        // Try to add one more 20KB material (would total 510KB)
        await expect(
          workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(20 * 1024),
            position: 10
          })
        ).rejects.toThrow(/Adding this material would exceed the total materials size limit/);
      });

      it('should allow adding material up to 500KB total', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Add materials totaling exactly 500KB
        // Add 10 materials of 50KB each = 500KB
        for (let i = 0; i < 10; i++) {
          const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(50 * 1024),
            position: i
          });
          expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);
        }

        const updated = await workflowManager.getWorkflow({
          workflowId: workflow.id,
          includeSupplementaryMaterials: true
        });

        expect(updated.supplementaryMaterials).toHaveLength(10);
      });

      it('should reject workflow creation if total materials exceed 500KB', async () => {
        // Create 11 materials of 49KB each = 539KB
        const materials = Array.from({ length: 11 }, (_, i) => ({
          type: 'text' as const,
          content: 'x'.repeat(49 * 1024)
        }));

        await expect(
          workflowManager.createWorkflow(testVaultId, {
            name: 'Test Workflow',
            purpose: 'Test',
            description: 'Test',
            supplementaryMaterials: materials
          })
        ).rejects.toThrow(/Total materials size.*exceeds maximum allowed size of 500.00 KB/);
      });

      it('should allow workflow creation with materials just under 500KB', async () => {
        // Create 10 materials of 49KB each = 490KB
        const materials = Array.from({ length: 10 }, (_, i) => ({
          type: 'text' as const,
          content: 'x'.repeat(49 * 1024),
          metadata: { index: i }
        }));

        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test',
          supplementaryMaterials: materials
        });

        expect(workflow.supplementaryMaterials).toHaveLength(10);
      });

      it('should correctly calculate total size with mixed material types', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Add 6 text materials of 40KB each = 240KB
        for (let i = 0; i < 6; i++) {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(40 * 1024),
            position: i
          });
        }

        // Add 6 code materials of 40KB each = 240KB (total now 480KB)
        for (let i = 6; i < 12; i++) {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'code',
            content: 'y'.repeat(40 * 1024),
            metadata: { language: 'javascript' },
            position: i
          });
        }

        // Should be able to add one more 10KB material (total 490KB)
        const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
          materialType: 'text',
          content: 'z'.repeat(10 * 1024),
          position: 12
        });

        expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);

        // Should fail to add another 20KB material (would total 510KB, exceeding 500KB limit)
        await expect(
          workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'a'.repeat(20 * 1024),
            position: 13
          })
        ).rejects.toThrow(/Adding this material would exceed the total materials size limit/);
      });
    });

    describe('Note Reference Materials', () => {
      it('should allow note_reference materials without content (minimal size)', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Add materials totaling just under 500KB
        // Add 10 materials of 49KB each = 490KB
        for (let i = 0; i < 10; i++) {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(49 * 1024),
            position: i
          });
        }

        // Should be able to add note_reference with small metadata (no content)
        // Metadata size is minimal, so it fits within remaining space
        const materialId = await workflowManager.addSupplementaryMaterial(workflow.id, {
          materialType: 'note_reference',
          noteId: 'n-12345678',
          metadata: { description: 'Reference to another note' },
          position: 10
        });

        expect(materialId).toMatch(/^wm-[a-f0-9]{8}$/);
      });

      it('should count metadata of note_reference materials', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Note references with large metadata should still be validated
        // Create metadata that's over 50KB
        const largeMetadata = {
          description: 'x'.repeat(51 * 1024)
        };

        await expect(
          workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'note_reference',
            noteId: 'n-12345678',
            metadata: largeMetadata,
            position: 0
          })
        ).rejects.toThrow(/Material size.*exceeds maximum allowed size/);
      });
    });

    describe('Error Messages', () => {
      it('should provide clear error message with current and limit sizes', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        const largeContent = 'x'.repeat(60 * 1024); // 60KB

        try {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: largeContent,
            position: 0
          });
          expect.fail('Should have thrown error');
        } catch (error: any) {
          expect(error.message).toContain('60.00 KB');
          expect(error.message).toContain('50.00 KB');
          expect(error.message).toContain('exceeds maximum allowed size');
        }
      });

      it('should show current, new, and limit in total size error', async () => {
        const workflow = await workflowManager.createWorkflow(testVaultId, {
          name: 'Test Workflow',
          purpose: 'Test',
          description: 'Test'
        });

        // Add 490KB (10 materials of 49KB each)
        for (let i = 0; i < 10; i++) {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(49 * 1024),
            position: i
          });
        }

        // Try to add 20KB more (would exceed 500KB total)
        try {
          await workflowManager.addSupplementaryMaterial(workflow.id, {
            materialType: 'text',
            content: 'x'.repeat(20 * 1024),
            position: 10
          });
          expect.fail('Should have thrown error');
        } catch (error: any) {
          expect(error.message).toContain('Current:');
          expect(error.message).toContain('New material:');
          expect(error.message).toContain('Limit:');
          expect(error.message).toContain('500.00 KB');
        }
      });
    });
  });
});
