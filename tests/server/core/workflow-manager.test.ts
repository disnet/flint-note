/**
 * Tests for WorkflowManager - Core workflow management functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../api/test-setup.js';
import { WorkflowManager } from '../../../src/server/core/workflow-manager.js';
import type { Workflow, RecurringSpec } from '../../../src/server/types/workflow.js';

describe('WorkflowManager - CRUD Operations', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let workflowManager: WorkflowManager;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('workflow-test-vault');

    // Access the database connection from the API
    const db = await testSetup.api.getDatabaseConnection();
    workflowManager = new WorkflowManager(db);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('createWorkflow', () => {
    it('should create a simple workflow with basic properties', async () => {
      const input = {
        name: 'Test Workflow',
        purpose: 'Test purpose',
        description: 'This is a test workflow description'
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow).toBeDefined();
      expect(workflow.id).toMatch(/^w-[a-f0-9]{8}$/);
      expect(workflow.name).toBe(input.name);
      expect(workflow.purpose).toBe(input.purpose);
      expect(workflow.description).toBe(input.description);
      expect(workflow.status).toBe('active');
      expect(workflow.type).toBe('workflow');
      expect(workflow.vaultId).toBe(testVaultId);
      expect(workflow.createdAt).toBeDefined();
      expect(workflow.updatedAt).toBeDefined();
    });

    it('should create a workflow with recurring schedule (daily)', async () => {
      const recurringSpec: RecurringSpec = {
        frequency: 'daily',
        time: '09:00'
      };

      const input = {
        name: 'Daily Workflow',
        purpose: 'Daily task',
        description: 'Runs every day',
        recurringSpec
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.recurringSpec).toBeDefined();
      expect(workflow.recurringSpec?.frequency).toBe('daily');
      expect(workflow.recurringSpec?.time).toBe('09:00');
    });

    it('should create a workflow with recurring schedule (weekly)', async () => {
      const recurringSpec: RecurringSpec = {
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        time: '10:00'
      };

      const input = {
        name: 'Weekly Workflow',
        purpose: 'Weekly task',
        description: 'Runs every Monday',
        recurringSpec
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.recurringSpec).toBeDefined();
      expect(workflow.recurringSpec?.frequency).toBe('weekly');
      expect(workflow.recurringSpec?.dayOfWeek).toBe(1);
      expect(workflow.recurringSpec?.time).toBe('10:00');
    });

    it('should create a workflow with recurring schedule (monthly)', async () => {
      const recurringSpec: RecurringSpec = {
        frequency: 'monthly',
        dayOfMonth: 15,
        time: '12:00'
      };

      const input = {
        name: 'Monthly Workflow',
        purpose: 'Monthly task',
        description: 'Runs on the 15th of each month',
        recurringSpec
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.recurringSpec).toBeDefined();
      expect(workflow.recurringSpec?.frequency).toBe('monthly');
      expect(workflow.recurringSpec?.dayOfMonth).toBe(15);
      expect(workflow.recurringSpec?.time).toBe('12:00');
    });

    it('should create a workflow with due date', async () => {
      const dueDate = new Date('2025-12-31T23:59:59Z').toISOString();

      const input = {
        name: 'Deadline Task',
        purpose: 'Has a deadline',
        description: 'Must be completed by end of year',
        dueDate
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.dueDate).toBe(dueDate);
    });

    it('should create a backlog-type workflow', async () => {
      const input = {
        name: 'Backlog Item',
        purpose: 'Fix broken link',
        description: 'Found a broken link that needs fixing',
        type: 'backlog' as const
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.type).toBe('backlog');
    });

    it('should create a workflow with supplementary materials', async () => {
      const input = {
        name: 'With Materials',
        purpose: 'Has attachments',
        description: 'This workflow has supplementary materials',
        supplementaryMaterials: [
          {
            type: 'text' as const,
            content: 'Some helpful text'
          },
          {
            type: 'code' as const,
            content: 'console.log("test");',
            metadata: { language: 'javascript' }
          }
        ]
      };

      const workflow = await workflowManager.createWorkflow(testVaultId, input);

      expect(workflow.supplementaryMaterials).toBeDefined();
      expect(workflow.supplementaryMaterials).toHaveLength(2);
      expect(workflow.supplementaryMaterials?.[0].materialType).toBe('text');
      expect(workflow.supplementaryMaterials?.[0].content).toBe('Some helpful text');
      expect(workflow.supplementaryMaterials?.[1].materialType).toBe('code');
      expect(workflow.supplementaryMaterials?.[1].content).toBe('console.log("test");');
      expect(workflow.supplementaryMaterials?.[1].metadata).toEqual({
        language: 'javascript'
      });
    });

    it('should reject workflow with name too short', async () => {
      const input = {
        name: '',
        purpose: 'Test purpose',
        description: 'Test description'
      };

      await expect(workflowManager.createWorkflow(testVaultId, input)).rejects.toThrow(
        /name must be between 1 and 20 characters/
      );
    });

    it('should reject workflow with name too long', async () => {
      const input = {
        name: 'This name is way too long for a workflow name',
        purpose: 'Test purpose',
        description: 'Test description'
      };

      await expect(workflowManager.createWorkflow(testVaultId, input)).rejects.toThrow(
        /name must be between 1 and 20 characters/
      );
    });

    it('should reject workflow with purpose too short', async () => {
      const input = {
        name: 'Test',
        purpose: '',
        description: 'Test description'
      };

      await expect(workflowManager.createWorkflow(testVaultId, input)).rejects.toThrow(
        /purpose must be between 1 and 100 characters/
      );
    });

    it('should reject workflow with purpose too long', async () => {
      const input = {
        name: 'Test',
        purpose: 'A'.repeat(101),
        description: 'Test description'
      };

      await expect(workflowManager.createWorkflow(testVaultId, input)).rejects.toThrow(
        /purpose must be between 1 and 100 characters/
      );
    });

    it('should reject duplicate workflow names (case-insensitive)', async () => {
      const input1 = {
        name: 'Weekly Summary',
        purpose: 'Create summary',
        description: 'First workflow'
      };

      const input2 = {
        name: 'WEEKLY SUMMARY',
        purpose: 'Create summary',
        description: 'Second workflow'
      };

      await workflowManager.createWorkflow(testVaultId, input1);

      await expect(workflowManager.createWorkflow(testVaultId, input2)).rejects.toThrow(
        /already exists in this vault/
      );
    });
  });

  describe('getWorkflow', () => {
    it('should retrieve a workflow by ID', async () => {
      const input = {
        name: 'Retrievable',
        purpose: 'Can be retrieved',
        description: 'Test workflow'
      };

      const created = await workflowManager.createWorkflow(testVaultId, input);
      const retrieved = await workflowManager.getWorkflow({ workflowId: created.id });

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe(input.name);
      expect(retrieved.purpose).toBe(input.purpose);
    });

    it('should include supplementary materials when requested', async () => {
      const input = {
        name: 'With Materials',
        purpose: 'Has materials',
        description: 'Test',
        supplementaryMaterials: [
          { type: 'text' as const, content: 'Material 1' },
          { type: 'text' as const, content: 'Material 2' }
        ]
      };

      const created = await workflowManager.createWorkflow(testVaultId, input);
      const retrieved = await workflowManager.getWorkflow({
        workflowId: created.id,
        includeSupplementaryMaterials: true
      });

      expect(retrieved.supplementaryMaterials).toBeDefined();
      expect(retrieved.supplementaryMaterials).toHaveLength(2);
    });

    it('should not include materials when not requested', async () => {
      const input = {
        name: 'With Materials 2',
        purpose: 'Has materials',
        description: 'Test',
        supplementaryMaterials: [{ type: 'text' as const, content: 'Material' }]
      };

      const created = await workflowManager.createWorkflow(testVaultId, input);
      const retrieved = await workflowManager.getWorkflow({ workflowId: created.id });

      expect(retrieved.supplementaryMaterials).toBeUndefined();
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(
        workflowManager.getWorkflow({ workflowId: 'w-nonexist' })
      ).rejects.toThrow(/Workflow not found/);
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow name', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Original',
        purpose: 'Test',
        description: 'Test'
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        name: 'Updated Name'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.purpose).toBe('Test'); // Unchanged
    });

    it('should update workflow purpose', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Original purpose',
        description: 'Test'
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        purpose: 'Updated purpose'
      });

      expect(updated.purpose).toBe('Updated purpose');
    });

    it('should update workflow description', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Original description'
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        description: 'Updated description'
      });

      expect(updated.description).toBe('Updated description');
    });

    it('should update workflow status', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        status: 'paused'
      });

      expect(updated.status).toBe('paused');
    });

    it('should update recurring spec', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const newSpec: RecurringSpec = {
        frequency: 'weekly',
        dayOfWeek: 3,
        time: '14:00'
      };

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        recurringSpec: newSpec
      });

      expect(updated.recurringSpec?.frequency).toBe('weekly');
      expect(updated.recurringSpec?.dayOfWeek).toBe(3);
      expect(updated.recurringSpec?.time).toBe('14:00');
    });

    it('should clear recurring spec when set to null', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        recurringSpec: null
      });

      expect(updated.recurringSpec).toBeUndefined();
    });

    it('should update multiple fields at once', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Original',
        purpose: 'Original purpose',
        description: 'Original description'
      });

      const updated = await workflowManager.updateWorkflow({
        workflowId: created.id,
        name: 'New Name',
        purpose: 'New purpose',
        status: 'paused'
      });

      expect(updated.name).toBe('New Name');
      expect(updated.purpose).toBe('New purpose');
      expect(updated.status).toBe('paused');
      expect(updated.description).toBe('Original description'); // Unchanged
    });

    it('should reject duplicate name on update', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'First',
        purpose: 'Test',
        description: 'Test'
      });

      const second = await workflowManager.createWorkflow(testVaultId, {
        name: 'Second',
        purpose: 'Test',
        description: 'Test'
      });

      await expect(
        workflowManager.updateWorkflow({
          workflowId: second.id,
          name: 'First'
        })
      ).rejects.toThrow(/already exists in this vault/);
    });

    it('should reject name too long on update', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      await expect(
        workflowManager.updateWorkflow({
          workflowId: created.id,
          name: 'This name is way too long for a workflow'
        })
      ).rejects.toThrow(/name must be between 1 and 20 characters/);
    });

    it('should reject purpose too long on update', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'Test',
        purpose: 'Test',
        description: 'Test'
      });

      await expect(
        workflowManager.updateWorkflow({
          workflowId: created.id,
          purpose: 'A'.repeat(101)
        })
      ).rejects.toThrow(/purpose must be between 1 and 100 characters/);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(
        workflowManager.updateWorkflow({
          workflowId: 'w-nonexist',
          name: 'New Name'
        })
      ).rejects.toThrow(/Workflow not found/);
    });
  });

  describe('deleteWorkflow', () => {
    it('should soft delete a workflow (mark as archived)', async () => {
      const created = await workflowManager.createWorkflow(testVaultId, {
        name: 'To Delete',
        purpose: 'Will be deleted',
        description: 'Test'
      });

      await workflowManager.deleteWorkflow(created.id);

      const archived = await workflowManager.getWorkflow({ workflowId: created.id });
      expect(archived.status).toBe('archived');
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(workflowManager.deleteWorkflow('w-nonexist')).rejects.toThrow(
        /Workflow not found/
      );
    });
  });

  describe('listWorkflows', () => {
    it('should list all workflows in a vault', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'First',
        purpose: 'First workflow',
        description: 'Test'
      });

      await workflowManager.createWorkflow(testVaultId, {
        name: 'Second',
        purpose: 'Second workflow',
        description: 'Test'
      });

      const workflows = await workflowManager.listWorkflows(testVaultId);

      expect(workflows).toHaveLength(2);
      const names = workflows.map((w) => w.name).sort();
      expect(names).toEqual(['First', 'Second']);
    });

    it('should filter by status', async () => {
      const active = await workflowManager.createWorkflow(testVaultId, {
        name: 'Active',
        purpose: 'Active workflow',
        description: 'Test'
      });

      const paused = await workflowManager.createWorkflow(testVaultId, {
        name: 'Paused',
        purpose: 'Paused workflow',
        description: 'Test',
        status: 'paused'
      });

      const activeList = await workflowManager.listWorkflows(testVaultId, {
        status: 'active'
      });

      expect(activeList).toHaveLength(1);
      expect(activeList[0].name).toBe('Active');

      const pausedList = await workflowManager.listWorkflows(testVaultId, {
        status: 'paused'
      });

      expect(pausedList).toHaveLength(1);
      expect(pausedList[0].name).toBe('Paused');
    });

    it('should filter by type', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Workflow Type',
        purpose: 'Regular workflow',
        description: 'Test',
        type: 'workflow'
      });

      await workflowManager.createWorkflow(testVaultId, {
        name: 'Backlog Type',
        purpose: 'Backlog item',
        description: 'Test',
        type: 'backlog'
      });

      const workflows = await workflowManager.listWorkflows(testVaultId, {
        type: 'workflow'
      });

      expect(workflows).toHaveLength(1);
      expect(workflows[0].type).toBe('workflow');

      const backlog = await workflowManager.listWorkflows(testVaultId, {
        type: 'backlog'
      });

      expect(backlog).toHaveLength(1);
      expect(backlog[0].type).toBe('backlog');
    });

    it('should exclude archived workflows by default', async () => {
      const active = await workflowManager.createWorkflow(testVaultId, {
        name: 'Active',
        purpose: 'Active workflow',
        description: 'Test'
      });

      const toArchive = await workflowManager.createWorkflow(testVaultId, {
        name: 'To Archive',
        purpose: 'Will be archived',
        description: 'Test'
      });

      await workflowManager.deleteWorkflow(toArchive.id);

      const workflows = await workflowManager.listWorkflows(testVaultId);

      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('Active');
    });

    it('should include archived workflows when requested', async () => {
      const active = await workflowManager.createWorkflow(testVaultId, {
        name: 'Active',
        purpose: 'Active workflow',
        description: 'Test'
      });

      const toArchive = await workflowManager.createWorkflow(testVaultId, {
        name: 'Archived',
        purpose: 'Archived workflow',
        description: 'Test'
      });

      await workflowManager.deleteWorkflow(toArchive.id);

      const workflows = await workflowManager.listWorkflows(testVaultId, {
        includeArchived: true
      });

      expect(workflows.length).toBeGreaterThanOrEqual(2);
      const archived = workflows.find((w) => w.name === 'Archived');
      expect(archived).toBeDefined();
    });

    it('should filter recurring-only workflows', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'One-time',
        purpose: 'One-time task',
        description: 'Test'
      });

      await workflowManager.createWorkflow(testVaultId, {
        name: 'Recurring',
        purpose: 'Recurring task',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const recurring = await workflowManager.listWorkflows(testVaultId, {
        recurringOnly: true
      });

      expect(recurring).toHaveLength(1);
      expect(recurring[0].name).toBe('Recurring');
      expect(recurring[0].isRecurring).toBe(true);
    });

    it('should sort by name', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Zebra',
        purpose: 'Last alphabetically',
        description: 'Test'
      });

      await workflowManager.createWorkflow(testVaultId, {
        name: 'Alpha',
        purpose: 'First alphabetically',
        description: 'Test'
      });

      const workflows = await workflowManager.listWorkflows(testVaultId, {
        sortBy: 'name',
        sortOrder: 'asc'
      });

      expect(workflows[0].name).toBe('Alpha');
      expect(workflows[1].name).toBe('Zebra');
    });
  });
});
