/**
 * Tests for WorkflowManager - Execution and Scheduling Logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../api/test-setup.js';
import { WorkflowManager } from '../../../src/server/core/workflow-manager.js';
import type { RecurringSpec } from '../../../src/server/types/workflow.js';

describe('WorkflowManager - Workflow Execution', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let workflowManager: WorkflowManager;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('workflow-exec-test');

    const db = await testSetup.api.getDatabaseConnection();
    workflowManager = new WorkflowManager(db);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('completeWorkflow', () => {
    it('should complete a one-time workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'One-time Task',
        purpose: 'Complete once',
        description: 'Test'
      });

      const completion = await workflowManager.completeWorkflow({
        workflowId: workflow.id
      });

      expect(completion).toBeDefined();
      expect(completion.id).toMatch(/^wc-[a-f0-9]{8}$/);
      expect(completion.workflowId).toBe(workflow.id);
      expect(completion.completedAt).toBeDefined();

      // Verify workflow status changed to completed
      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      expect(updated.status).toBe('completed');
      expect(updated.lastCompleted).toBeDefined();
    });

    it('should complete a recurring workflow and keep it active', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Daily Task',
        purpose: 'Runs daily',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      await workflowManager.completeWorkflow({
        workflowId: workflow.id
      });

      // Verify workflow status is still active
      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      expect(updated.status).toBe('active');
      expect(updated.lastCompleted).toBeDefined();
    });

    it('should record completion notes', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task with Notes',
        purpose: 'Test',
        description: 'Test'
      });

      const completion = await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        notes: 'Completed successfully with no issues'
      });

      expect(completion.notes).toBe('Completed successfully with no issues');
    });

    it('should record output note ID', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task with Output',
        purpose: 'Test',
        description: 'Test'
      });

      const completion = await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        outputNoteId: 'general/output-note'
      });

      expect(completion.outputNoteId).toBe('general/output-note');
    });

    it('should record completion metadata', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task with Metadata',
        purpose: 'Test',
        description: 'Test'
      });

      const metadata = {
        duration: '15 minutes',
        difficulty: 'easy'
      };

      const completion = await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        metadata
      });

      expect(completion.metadata).toEqual(metadata);
    });

    it('should allow multiple completions of recurring workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Weekly Task',
        purpose: 'Runs weekly',
        description: 'Test',
        recurringSpec: { frequency: 'weekly', dayOfWeek: 1 }
      });

      // Complete multiple times
      await workflowManager.completeWorkflow({ workflowId: workflow.id });
      await workflowManager.completeWorkflow({ workflowId: workflow.id });
      await workflowManager.completeWorkflow({ workflowId: workflow.id });

      // Get completion history
      const history = await workflowManager.getCompletionHistory(workflow.id);
      expect(history.length).toBe(3);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(
        workflowManager.completeWorkflow({ workflowId: 'w-nonexist' })
      ).rejects.toThrow(/Workflow not found/);
    });
  });

  describe('getCompletionHistory', () => {
    it('should retrieve completion history', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      // Complete three times (with small delays to ensure different timestamps)
      await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        notes: 'First completion'
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        notes: 'Second completion'
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await workflowManager.completeWorkflow({
        workflowId: workflow.id,
        notes: 'Third completion'
      });

      const history = await workflowManager.getCompletionHistory(workflow.id);

      expect(history).toHaveLength(3);
      // Should be in reverse chronological order
      expect(history[0].notes).toBe('Third completion');
      expect(history[1].notes).toBe('Second completion');
      expect(history[2].notes).toBe('First completion');
    });

    it('should respect limit parameter', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      // Complete five times
      for (let i = 0; i < 5; i++) {
        await workflowManager.completeWorkflow({ workflowId: workflow.id });
      }

      const history = await workflowManager.getCompletionHistory(workflow.id, 2);

      expect(history).toHaveLength(2);
    });

    it('should include completion history when loading workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task',
        purpose: 'Test',
        description: 'Test'
      });

      await workflowManager.completeWorkflow({ workflowId: workflow.id });

      const loaded = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id,
        includeCompletionHistory: true
      });

      expect(loaded.completionHistory).toBeDefined();
      expect(loaded.completionHistory).toHaveLength(1);
    });

    it('should respect history limit when loading workflow', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      // Complete five times
      for (let i = 0; i < 5; i++) {
        await workflowManager.completeWorkflow({ workflowId: workflow.id });
      }

      const loaded = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id,
        includeCompletionHistory: true,
        completionHistoryLimit: 3
      });

      expect(loaded.completionHistory).toHaveLength(3);
    });
  });

  describe('isWorkflowDue', () => {
    it('should return true for one-time workflow with past due date', async () => {
      const pastDate = new Date('2020-01-01T00:00:00Z');
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Overdue',
        purpose: 'Past due',
        description: 'Test',
        dueDate: pastDate.toISOString()
      });

      const isDue = workflowManager.isWorkflowDue(workflow);
      expect(isDue).toBe(true);
    });

    it('should return false for one-time workflow with future due date', async () => {
      const futureDate = new Date('2030-12-31T23:59:59Z');
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Future',
        purpose: 'Not due yet',
        description: 'Test',
        dueDate: futureDate.toISOString()
      });

      const isDue = workflowManager.isWorkflowDue(workflow);
      expect(isDue).toBe(false);
    });

    it('should return true for daily workflow never completed', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Daily Never Done',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const isDue = workflowManager.isWorkflowDue(workflow);
      expect(isDue).toBe(true);
    });

    it('should return true for daily workflow completed more than 24 hours ago', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Daily Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      // Manually set last_completed to 2 days ago
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const db = await testSetup.api.getDatabaseConnection();
      await db.run('UPDATE workflows SET last_completed = ? WHERE id = ?', [
        twoDaysAgo,
        workflow.id
      ]);

      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      const isDue = workflowManager.isWorkflowDue(updated);
      expect(isDue).toBe(true);
    });

    it('should return false for daily workflow completed recently', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Daily Recent',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      // Complete it now
      await workflowManager.completeWorkflow({ workflowId: workflow.id });

      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      const isDue = workflowManager.isWorkflowDue(updated);
      expect(isDue).toBe(false);
    });

    it('should return true for weekly workflow on correct day after 7 days', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Weekly Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'weekly', dayOfWeek: new Date().getDay() }
      });

      // Set last_completed to 8 days ago
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const db = await testSetup.api.getDatabaseConnection();
      await db.run('UPDATE workflows SET last_completed = ? WHERE id = ?', [
        eightDaysAgo,
        workflow.id
      ]);

      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      const isDue = workflowManager.isWorkflowDue(updated);
      expect(isDue).toBe(true);
    });

    it('should return false for weekly workflow on wrong day', async () => {
      const wrongDay = (new Date().getDay() + 1) % 7; // Tomorrow's day of week
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Weekly Wrong Day',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'weekly', dayOfWeek: wrongDay }
      });

      // Set last_completed to 8 days ago (but wrong day)
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const db = await testSetup.api.getDatabaseConnection();
      await db.run('UPDATE workflows SET last_completed = ? WHERE id = ?', [
        eightDaysAgo,
        workflow.id
      ]);

      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      const isDue = workflowManager.isWorkflowDue(updated);
      expect(isDue).toBe(false);
    });

    it('should return true for monthly workflow on correct day after 28+ days', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Monthly Task',
        purpose: 'Test',
        description: 'Test',
        recurringSpec: { frequency: 'monthly', dayOfMonth: new Date().getDate() }
      });

      // Set last_completed to 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const db = await testSetup.api.getDatabaseConnection();
      await db.run('UPDATE workflows SET last_completed = ? WHERE id = ?', [
        thirtyDaysAgo,
        workflow.id
      ]);

      const updated = await workflowManager.getWorkflow(testVaultId, {
        workflowId: workflow.id
      });
      const isDue = workflowManager.isWorkflowDue(updated);
      expect(isDue).toBe(true);
    });
  });

  describe('getWorkflowsDueNow', () => {
    it('should find workflows with past due dates', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Overdue Task',
        purpose: 'Past due',
        description: 'Test',
        dueDate: new Date('2020-01-01T00:00:00Z').toISOString()
      });

      await workflowManager.createWorkflow(testVaultId, {
        name: 'Future Task',
        purpose: 'Not due',
        description: 'Test',
        dueDate: new Date('2030-12-31T23:59:59Z').toISOString()
      });

      const dueNow = await workflowManager.getWorkflowsDueNow(testVaultId);

      expect(dueNow.length).toBeGreaterThanOrEqual(1);
      const overdue = dueNow.find((w) => w.name === 'Overdue Task');
      expect(overdue).toBeDefined();
    });

    it('should find never-completed recurring workflows', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'New Daily Task',
        purpose: 'Never run',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      const dueNow = await workflowManager.getWorkflowsDueNow(testVaultId);

      const newTask = dueNow.find((w) => w.name === 'New Daily Task');
      expect(newTask).toBeDefined();
    });

    it('should not include recently completed daily tasks', async () => {
      const workflow = await workflowManager.createWorkflow(testVaultId, {
        name: 'Recent Daily',
        purpose: 'Just completed',
        description: 'Test',
        recurringSpec: { frequency: 'daily' }
      });

      await workflowManager.completeWorkflow({ workflowId: workflow.id });

      const dueNow = await workflowManager.getWorkflowsDueNow(testVaultId);

      const recent = dueNow.find((w) => w.name === 'Recent Daily');
      expect(recent).toBeUndefined();
    });

    it('should only include active workflows', async () => {
      const paused = await workflowManager.createWorkflow(testVaultId, {
        name: 'Paused Task',
        purpose: 'Paused',
        description: 'Test',
        status: 'paused',
        dueDate: new Date('2020-01-01T00:00:00Z').toISOString()
      });

      const dueNow = await workflowManager.getWorkflowsDueNow(testVaultId);

      const pausedTask = dueNow.find((w) => w.name === 'Paused Task');
      expect(pausedTask).toBeUndefined();
    });
  });

  describe('getUpcomingWorkflows', () => {
    it('should find workflows due within specified days', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Tomorrow Task',
        purpose: 'Due tomorrow',
        description: 'Test',
        dueDate: tomorrow.toISOString()
      });

      const upcoming = await workflowManager.getUpcomingWorkflows(testVaultId, 7);

      const tomorrowTask = upcoming.find((w) => w.name === 'Tomorrow Task');
      expect(tomorrowTask).toBeDefined();
    });

    it('should not include workflows due far in the future', async () => {
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Next Year',
        purpose: 'Far future',
        description: 'Test',
        dueDate: nextYear.toISOString()
      });

      const upcoming = await workflowManager.getUpcomingWorkflows(testVaultId, 7);

      const nextYearTask = upcoming.find((w) => w.name === 'Next Year');
      expect(nextYearTask).toBeUndefined();
    });
  });

  describe('getWorkflowContextForPrompt', () => {
    it('should generate workflow context for system prompt', async () => {
      // Create a due now workflow
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Due Now',
        purpose: 'Urgent task',
        description: 'Test',
        dueDate: new Date('2020-01-01T00:00:00Z').toISOString()
      });

      // Create an upcoming workflow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Upcoming',
        purpose: 'Soon task',
        description: 'Test',
        dueDate: tomorrow.toISOString()
      });

      // Create an on-demand workflow
      await workflowManager.createWorkflow(testVaultId, {
        name: 'On Demand',
        purpose: 'Run when needed',
        description: 'Test'
      });

      const context = await workflowManager.getWorkflowContextForPrompt(testVaultId);

      expect(context).toContain('## Available Workflows');
      expect(context).toContain('Due Now');
      expect(context).toContain('Upcoming');
      expect(context).toContain('On Demand');
      expect(context).toContain('get_workflow');
      expect(context).toContain('complete_workflow');
    });

    it('should handle vaults with no workflows', async () => {
      const context = await workflowManager.getWorkflowContextForPrompt(testVaultId);

      expect(context).toContain('## Available Workflows');
      // Should still have the tool hint even if no workflows
      expect(context).toContain('get_workflow');
    });

    it('should include recurring schedule information', async () => {
      await workflowManager.createWorkflow(testVaultId, {
        name: 'Weekly Report',
        purpose: 'Generate report',
        description: 'Test',
        recurringSpec: { frequency: 'weekly', dayOfWeek: 1 }
      });

      const context = await workflowManager.getWorkflowContextForPrompt(testVaultId);

      expect(context).toContain('Weekly Report');
      // Should include formatted schedule
      expect(context).toMatch(/Every (Monday|day|week)/i);
    });
  });
});
