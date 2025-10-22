/**
 * Workflow Service
 *
 * Main process service for managing workflows through the WorkflowManager.
 * Provides a high-level interface for workflow operations.
 */

import { WorkflowManager } from '../server/core/workflow-manager.js';
import type { NoteService } from './note-service.js';
import type {
  Workflow,
  WorkflowListItem,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CompleteWorkflowInput,
  ListWorkflowsInput,
  GetWorkflowInput,
  SupplementaryMaterial,
  WorkflowCompletion
} from '../server/types/workflow.js';
import type { DatabaseConnection } from '../server/database/schema.js';
import { logger } from './logger.js';
import { publishWorkflowEvent } from './workflow-events.js';

export class WorkflowService {
  private workflowManager: WorkflowManager | null = null;

  constructor(
    private noteService: NoteService | null,
    db: DatabaseConnection | null
  ) {
    if (db) {
      this.workflowManager = new WorkflowManager(db);
      logger.info('WorkflowService initialized with database connection');
    } else {
      logger.warn('WorkflowService initialized without database connection');
    }
  }

  /**
   * Get the workflow manager instance
   */
  getWorkflowManager(): WorkflowManager | null {
    if (!this.workflowManager) {
      logger.warn('WorkflowManager not initialized');
      return null;
    }
    return this.workflowManager;
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const vault = await this.noteService?.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }

    const workflow = await this.workflowManager.createWorkflow(vault.id, input);

    // Fetch the workflow as a list item to get properly calculated dueInfo
    const listItems = await this.workflowManager.listWorkflows(vault.id, {
      status: 'all',
      includeArchived: true
    });
    const listItem = listItems.find((w) => w.id === workflow.id);

    if (listItem) {
      // Publish event for UI updates with full dueInfo
      publishWorkflowEvent({
        type: 'workflow.created',
        workflow: listItem
      });
    }

    return workflow;
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(input: UpdateWorkflowInput): Promise<Workflow> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const workflow = await this.workflowManager.updateWorkflow(input);

    // Publish event for UI updates
    publishWorkflowEvent({
      type: 'workflow.updated',
      workflowId: workflow.id,
      workflow
    });

    return workflow;
  }

  /**
   * Delete a workflow (soft delete)
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    await this.workflowManager.deleteWorkflow(workflowId);

    // Publish event for UI updates
    publishWorkflowEvent({
      type: 'workflow.deleted',
      workflowId
    });
  }

  /**
   * Get a workflow by ID or name
   */
  async getWorkflow(input: GetWorkflowInput): Promise<Workflow> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const vault = await this.noteService?.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }

    return this.workflowManager.getWorkflow(vault.id, input);
  }

  /**
   * List workflows with filtering
   */
  async listWorkflows(input?: ListWorkflowsInput): Promise<WorkflowListItem[]> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const vault = await this.noteService?.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }

    return this.workflowManager.listWorkflows(vault.id, input);
  }

  /**
   * Complete a workflow
   */
  async completeWorkflow(input: CompleteWorkflowInput): Promise<WorkflowCompletion> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const completion = await this.workflowManager.completeWorkflow(input);

    // Publish event for UI updates
    publishWorkflowEvent({
      type: 'workflow.completed',
      workflowId: input.workflowId,
      completion
    });

    return completion;
  }

  /**
   * Add supplementary material to a workflow
   */
  async addSupplementaryMaterial(
    workflowId: string,
    material: Omit<SupplementaryMaterial, 'id' | 'workflowId' | 'createdAt'>
  ): Promise<string> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    const materialId = await this.workflowManager.addSupplementaryMaterial(
      workflowId,
      material
    );

    // Publish event for UI updates
    publishWorkflowEvent({
      type: 'workflow.material-added',
      workflowId,
      materialId
    });

    return materialId;
  }

  /**
   * Remove supplementary material from a workflow
   */
  async removeSupplementaryMaterial(materialId: string): Promise<void> {
    if (!this.workflowManager) {
      throw new Error('WorkflowService not initialized');
    }

    await this.workflowManager.removeSupplementaryMaterial(materialId);

    // Note: We don't publish an event here because material changes
    // don't affect the workflow list view, and we'd need to query
    // the database to get the workflow ID.
  }

  /**
   * Get workflow context for system prompt
   */
  async getWorkflowContextForPrompt(): Promise<string> {
    if (!this.workflowManager) {
      return '';
    }

    const vault = await this.noteService?.getCurrentVault();
    if (!vault) {
      return '';
    }

    try {
      return await this.workflowManager.getWorkflowContextForPrompt(vault.id);
    } catch (error) {
      logger.error('Failed to get workflow context for prompt', { error });
      return '';
    }
  }

  /**
   * Check if the service is initialized
   */
  isReady(): boolean {
    return this.workflowManager !== null;
  }
}
