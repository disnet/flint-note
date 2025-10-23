/**
 * Integration tests for workflow management tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../server/api/test-setup.js';
import { ToolService } from '../../src/main/tool-service.js';
import { NoteService } from '../../src/main/note-service.js';
import { WorkflowService } from '../../src/main/workflow-service.js';
import type { RecurringSpec } from '../../src/server/types/workflow.js';

describe('Workflow Tools Integration', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let noteService: NoteService;
  let workflowService: WorkflowService;
  let toolService: ToolService;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('workflow-tools-test');

    // Set up mock NoteService
    noteService = {
      getFlintNoteApi: () => testSetup.api,
      getCurrentVault: async () => ({
        id: testVaultId,
        name: 'Test Vault',
        path: testSetup.testWorkspacePath,
        created: new Date().toISOString(),
        last_accessed: new Date().toISOString()
      })
    } as any;

    // Set up WorkflowService
    const db = await testSetup.api.getDatabaseConnection();
    workflowService = new WorkflowService(noteService, db);

    // Set up ToolService
    toolService = new ToolService(noteService, undefined, undefined, workflowService);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('create_routine tool', () => {
    it('should create a basic workflow', async () => {
      const tools = toolService.getTools();
      expect(tools?.create_routine).toBeDefined();

      const result = await tools!.create_routine.execute({
        name: 'Test Workflow',
        purpose: 'Test purpose',
        description: 'This is a test workflow'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe('Test Workflow');
      expect(result.data.routineId).toMatch(/^w-[a-f0-9]{8}$/);
      expect(result.message).toContain('Created routine');
    });

    it('should create a recurring workflow', async () => {
      const tools = toolService.getTools();

      const result = await tools!.create_routine.execute({
        name: 'Daily Task',
        purpose: 'Daily routine',
        description: 'Runs every day',
        recurringSpec: { frequency: 'daily' }
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Daily Task');
    });

    it('should create a backlog item silently', async () => {
      const tools = toolService.getTools();

      const result = await tools!.create_routine.execute({
        name: 'Fix Link',
        purpose: 'Broken link found',
        description: 'Fix broken wikilink in note X',
        type: 'backlog'
      });

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('backlog');
      expect(result.message).toContain('Recorded backlog item');
    });

    it('should reject duplicate workflow names', async () => {
      const tools = toolService.getTools();

      await tools!.create_routine.execute({
        name: 'Duplicate',
        purpose: 'Test',
        description: 'First'
      });

      const result = await tools!.create_routine.execute({
        name: 'Duplicate',
        purpose: 'Test',
        description: 'Second'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DUPLICATE_NAME');
      expect(result.message).toContain('already exists');
    });

    it('should validate name length', async () => {
      const tools = toolService.getTools();

      // Name too long
      const result = await tools!.create_routine.execute({
        name: 'This name is way too long for a workflow',
        purpose: 'Test',
        description: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Workflow name must be');
    });
  });

  describe('list_routines tool', () => {
    it('should list all workflows', async () => {
      const tools = toolService.getTools();

      // Create some workflows
      await tools!.create_routine.execute({
        name: 'First',
        purpose: 'Test 1',
        description: 'Test'
      });

      await tools!.create_routine.execute({
        name: 'Second',
        purpose: 'Test 2',
        description: 'Test'
      });

      const result = await tools!.list_routines.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(2);
      expect(result.data.map((w: any) => w.name).sort()).toEqual(['First', 'Second']);
    });

    it('should filter by status', async () => {
      const tools = toolService.getTools();

      await tools!.create_routine.execute({
        name: 'Active',
        purpose: 'Test',
        description: 'Test'
      });

      const paused = await tools!.create_routine.execute({
        name: 'Paused',
        purpose: 'Test',
        description: 'Test',
        status: 'paused'
      });

      const result = await tools!.list_routines.execute({
        status: 'paused'
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Paused');
    });

    it('should filter by type', async () => {
      const tools = toolService.getTools();

      await tools!.create_routine.execute({
        name: 'Regular',
        purpose: 'Test',
        description: 'Test',
        type: 'workflow'
      });

      await tools!.create_routine.execute({
        name: 'Backlog',
        purpose: 'Test',
        description: 'Test',
        type: 'backlog'
      });

      const result = await tools!.list_routines.execute({
        type: 'backlog'
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].type).toBe('backlog');
    });

    it('should exclude archived by default', async () => {
      const tools = toolService.getTools();

      await tools!.create_routine.execute({
        name: 'Active',
        purpose: 'Test',
        description: 'Test'
      });

      const toArchive = await tools!.create_routine.execute({
        name: 'To Archive',
        purpose: 'Test',
        description: 'Test'
      });

      await tools!.delete_routine.execute({
        workflowId: toArchive.data.routineId
      });

      const result = await tools!.list_routines.execute({});

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Active');
    });
  });

  describe('get_routine tool', () => {
    it('should retrieve workflow details', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Detailed',
        purpose: 'Full details',
        description: 'Test workflow with details'
      });

      const result = await tools!.get_routine.execute({
        workflowId: created.data.routineId
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe('Detailed');
      expect(result.data.purpose).toBe('Full details');
      expect(result.data.description).toBe('Test workflow with details');
    });

    it('should include supplementary materials when requested', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'With Materials',
        purpose: 'Has materials',
        description: 'Test'
      });

      await tools!.add_routine_material.execute({
        workflowId: created.data.routineId,
        type: 'text',
        content: 'Some context'
      });

      const result = await tools!.get_routine.execute({
        workflowId: created.data.routineId,
        includeSupplementaryMaterials: true
      });

      expect(result.success).toBe(true);
      expect(result.data.supplementaryMaterials).toBeDefined();
      expect(result.data.supplementaryMaterials.length).toBe(1);
      expect(result.data.supplementaryMaterials[0].content).toBe('Some context');
    });

    it('should include completion history when requested', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'With History',
        purpose: 'Has completions',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      await tools!.complete_routine.execute({
        workflowId: created.data.routineId,
        notes: 'Completed successfully'
      });

      const result = await tools!.get_routine.execute({
        workflowId: created.data.routineId,
        includeCompletionHistory: true
      });

      expect(result.success).toBe(true);
      expect(result.data.completionHistory).toBeDefined();
      expect(result.data.completionHistory.length).toBe(1);
      expect(result.data.completionHistory[0].notes).toBe('Completed successfully');
    });

    it('should handle non-existent workflow', async () => {
      const tools = toolService.getTools();

      const result = await tools!.get_routine.execute({
        workflowId: 'w-nonexist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ROUTINE_NOT_FOUND');
      expect(result.message).toContain('not found');
    });
  });

  describe('update_routine tool', () => {
    it('should update workflow name', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Original',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.update_routine.execute({
        workflowId: created.data.routineId,
        name: 'Updated'
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated');
    });

    it('should update workflow status', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Active',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.update_routine.execute({
        workflowId: created.data.routineId,
        status: 'paused'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('paused');
    });

    it('should update recurring spec', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Scheduled',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const newSpec: RecurringSpec = {
        frequency: 'weekly',
        dayOfWeek: 1,
        time: '09:00'
      };

      const result = await tools!.update_routine.execute({
        workflowId: created.data.routineId,
        recurringSpec: newSpec
      });

      expect(result.success).toBe(true);
      expect(result.data.recurringSpec.frequency).toBe('weekly');
      expect(result.data.recurringSpec.dayOfWeek).toBe(1);
    });

    it('should reject duplicate name on update', async () => {
      const tools = toolService.getTools();

      await tools!.create_routine.execute({
        name: 'First',
        purpose: 'Test',
        description: 'Test'
      });

      const second = await tools!.create_routine.execute({
        name: 'Second',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.update_routine.execute({
        workflowId: second.data.routineId,
        name: 'First'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DUPLICATE_NAME');
    });
  });

  describe('delete_routine tool', () => {
    it('should soft delete a workflow', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'To Delete',
        purpose: 'Will be deleted',
        description: 'Test'
      });

      const result = await tools!.delete_routine.execute({
        workflowId: created.data.routineId
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Deleted routine');

      // Verify it's archived
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId
      });

      expect(retrieved.data.status).toBe('archived');
    });

    it('should handle non-existent workflow', async () => {
      const tools = toolService.getTools();

      const result = await tools!.delete_routine.execute({
        workflowId: 'w-nonexist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ROUTINE_NOT_FOUND');
    });
  });

  describe('complete_routine tool', () => {
    it('should complete a one-time workflow', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'One-time',
        purpose: 'Complete once',
        description: 'Test'
      });

      const result = await tools!.complete_routine.execute({
        workflowId: created.data.routineId
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Completed');

      // Verify status changed to completed
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId
      });

      expect(retrieved.data.status).toBe('completed');
    });

    it('should complete a recurring workflow and keep it active', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Recurring',
        purpose: 'Runs daily',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const result = await tools!.complete_routine.execute({
        workflowId: created.data.routineId
      });

      expect(result.success).toBe(true);

      // Verify status is still active
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId
      });

      expect(retrieved.data.status).toBe('active');
      expect(retrieved.data.lastCompleted).toBeDefined();
    });

    it('should record completion notes', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Task',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.complete_routine.execute({
        workflowId: created.data.routineId,
        notes: 'Completed with extra notes'
      });

      expect(result.success).toBe(true);

      // Verify notes in history
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId,
        includeCompletionHistory: true
      });

      expect(retrieved.data.completionHistory[0].notes).toBe(
        'Completed with extra notes'
      );
    });

    it('should record output note ID', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Task',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.complete_routine.execute({
        workflowId: created.data.routineId,
        outputNoteId: 'general/output'
      });

      expect(result.success).toBe(true);

      // Verify output note in history
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId,
        includeCompletionHistory: true
      });

      expect(retrieved.data.completionHistory[0].outputNoteId).toBe('general/output');
    });
  });

  describe('add_routine_material tool', () => {
    it('should add text material to workflow', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.add_routine_material.execute({
        workflowId: created.data.routineId,
        type: 'text',
        content: 'Important context information'
      });

      expect(result.success).toBe(true);
      expect(result.data.materialId).toMatch(/^wm-[a-f0-9]{8}$/);
    });

    it('should add code material with metadata', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.add_routine_material.execute({
        workflowId: created.data.routineId,
        type: 'code',
        content: 'function test() { return "test"; }',
        metadata: { language: 'javascript' }
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Added');
    });

    it('should add note reference', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const result = await tools!.add_routine_material.execute({
        workflowId: created.data.routineId,
        type: 'note_reference',
        noteId: 'general/reference'
      });

      expect(result.success).toBe(true);
    });

    it('should handle non-existent workflow', async () => {
      const tools = toolService.getTools();

      const result = await tools!.add_routine_material.execute({
        workflowId: 'w-nonexist',
        type: 'text',
        content: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ROUTINE_NOT_FOUND');
    });
  });

  describe('remove_routine_material tool', () => {
    it('should remove material from workflow', async () => {
      const tools = toolService.getTools();

      const created = await tools!.create_routine.execute({
        name: 'Workflow',
        purpose: 'Test',
        description: 'Test'
      });

      const material = await tools!.add_routine_material.execute({
        workflowId: created.data.routineId,
        type: 'text',
        content: 'To be removed'
      });

      const result = await tools!.remove_routine_material.execute({
        materialId: material.data.materialId
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Removed');

      // Verify it was removed
      const retrieved = await tools!.get_routine.execute({
        workflowId: created.data.routineId,
        includeSupplementaryMaterials: true
      });

      expect(retrieved.data.supplementaryMaterials.length).toBe(0);
    });

    it('should handle non-existent material', async () => {
      const tools = toolService.getTools();

      const result = await tools!.remove_routine_material.execute({
        materialId: 'wm-nonexist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('MATERIAL_NOT_FOUND');
    });
  });

  describe('routine tools availability', () => {
    it('should include all 8 routine tools when service is ready', async () => {
      const tools = toolService.getTools();

      expect(tools).toBeDefined();
      expect(tools?.create_routine).toBeDefined();
      expect(tools?.update_routine).toBeDefined();
      expect(tools?.delete_routine).toBeDefined();
      expect(tools?.list_routines).toBeDefined();
      expect(tools?.get_routine).toBeDefined();
      expect(tools?.complete_routine).toBeDefined();
      expect(tools?.add_routine_material).toBeDefined();
      expect(tools?.remove_routine_material).toBeDefined();
    });
  });
});
