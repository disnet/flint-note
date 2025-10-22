/**
 * Workflow Store
 *
 * Manages workflow state and operations using Svelte 5 runes.
 * Provides reactive access to workflows, filtering, and CRUD operations.
 */

import type {
  Workflow,
  WorkflowListItem,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CompleteWorkflowInput,
  ListWorkflowsInput,
  GetWorkflowInput,
  WorkflowStatus,
  WorkflowType,
  SupplementaryMaterial
} from '../../../server/types/workflow';
import { messageBus, type WorkflowEvent } from '../services/messageBus.svelte';

// Store state
let workflows = $state<WorkflowListItem[]>([]);
let loading = $state(false);
let error = $state<string | null>(null);
let isInitialized = $state(false);

// Subscribe to workflow events for reactive updates
function handleWorkflowEvent(event: WorkflowEvent): void {
  switch (event.type) {
    case 'workflow.created':
      // Add new workflow to the list
      workflows = [...workflows, event.workflow];
      break;

    case 'workflow.updated': {
      // Update workflow in list - need to refetch to get latest list item format
      // For now, trigger a refresh
      loadWorkflows().catch(console.error);
      break;
    }

    case 'workflow.deleted':
      // Remove workflow from list
      workflows = workflows.filter((w) => w.id !== event.workflowId);
      break;

    case 'workflow.completed': {
      // Refresh to get updated workflow state
      loadWorkflows().catch(console.error);
      break;
    }

    case 'workflow.material-added':
    case 'workflow.material-removed':
      // Material changes don't affect the list view, can be ignored
      break;
  }
}

// Set up event subscription
messageBus.subscribe('workflow.created', handleWorkflowEvent);
messageBus.subscribe('workflow.updated', handleWorkflowEvent);
messageBus.subscribe('workflow.deleted', handleWorkflowEvent);
messageBus.subscribe('workflow.completed', handleWorkflowEvent);

// Derived state for different workflow categories
const workflowsDueNow = $derived(
  workflows.filter((w) => w.dueInfo?.type === 'due_now' && w.status === 'active')
);

const upcomingWorkflows = $derived(
  workflows.filter((w) => w.dueInfo?.type === 'upcoming' && w.status === 'active')
);

const onDemandWorkflows = $derived(
  workflows.filter(
    (w) => !w.isRecurring && w.status === 'active' && !w.dueInfo && w.type === 'workflow' // Only show workflow type, not backlog
  )
);

const activeWorkflows = $derived(workflows.filter((w) => w.status === 'active'));

const backlogWorkflows = $derived(
  workflows.filter((w) => w.type === 'backlog' && w.status === 'active')
);

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minutes ago`;
    }
    return `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Helper to format due date
function formatDueDate(dueInfo?: WorkflowListItem['dueInfo']): string {
  if (!dueInfo) return '';

  if (dueInfo.recurringSchedule) {
    return dueInfo.recurringSchedule;
  }

  if (dueInfo.dueDate) {
    const date = new Date(dueInfo.dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'Overdue';
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays < 7) {
      return `in ${diffDays} days`;
    } else {
      return date.toLocaleDateString();
    }
  }

  return '';
}

// Load workflows from backend
async function loadWorkflows(input?: ListWorkflowsInput): Promise<void> {
  loading = true;
  error = null;
  try {
    const result = await window.api?.workflow.list(input);
    if (result) {
      workflows = result;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load workflows';
    console.error('Failed to load workflows:', err);
  } finally {
    loading = false;
    isInitialized = true;
  }
}

// Workflow store interface
export const workflowStore = {
  // Reactive getters
  get workflows() {
    return workflows;
  },
  get workflowsDueNow() {
    return workflowsDueNow;
  },
  get upcomingWorkflows() {
    return upcomingWorkflows;
  },
  get onDemandWorkflows() {
    return onDemandWorkflows;
  },
  get activeWorkflows() {
    return activeWorkflows;
  },
  get backlogWorkflows() {
    return backlogWorkflows;
  },
  get loading() {
    return loading;
  },
  get error() {
    return error;
  },
  get initialized() {
    return isInitialized;
  },

  // Operations
  async initialize(): Promise<void> {
    if (!isInitialized) {
      await loadWorkflows({ status: 'all', includeArchived: false });
    }
  },

  async refresh(input?: ListWorkflowsInput): Promise<void> {
    await loadWorkflows(input);
  },

  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    try {
      // Use $state.snapshot to serialize reactive data
      const serializableInput = $state.snapshot(input);
      const workflow = await window.api?.workflow.create(serializableInput);
      if (!workflow) {
        throw new Error('Failed to create workflow');
      }
      // Refresh the list
      await this.refresh();
      return workflow;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create workflow';
      throw err;
    }
  },

  async updateWorkflow(input: UpdateWorkflowInput): Promise<Workflow> {
    try {
      const serializableInput = $state.snapshot(input);
      const workflow = await window.api?.workflow.update(serializableInput);
      if (!workflow) {
        throw new Error('Failed to update workflow');
      }
      // Refresh the list
      await this.refresh();
      return workflow;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update workflow';
      throw err;
    }
  },

  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await window.api?.workflow.delete(workflowId);
      // Refresh the list
      await this.refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete workflow';
      throw err;
    }
  },

  async getWorkflow(input: GetWorkflowInput): Promise<Workflow> {
    try {
      const serializableInput = $state.snapshot(input);
      const workflow = await window.api?.workflow.get(serializableInput);
      if (!workflow) {
        throw new Error('Workflow not found');
      }
      return workflow;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to get workflow';
      throw err;
    }
  },

  async completeWorkflow(input: CompleteWorkflowInput): Promise<void> {
    try {
      const serializableInput = $state.snapshot(input);
      await window.api?.workflow.complete(serializableInput);
      // Refresh the list
      await this.refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to complete workflow';
      throw err;
    }
  },

  async addMaterial(
    workflowId: string,
    material: Omit<SupplementaryMaterial, 'id' | 'workflowId' | 'createdAt'>
  ): Promise<string> {
    try {
      const serializableMaterial = $state.snapshot(material);
      const materialId = await window.api?.workflow.addMaterial(
        workflowId,
        serializableMaterial
      );
      if (!materialId) {
        throw new Error('Failed to add material');
      }
      return materialId;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to add material';
      throw err;
    }
  },

  async removeMaterial(materialId: string): Promise<void> {
    try {
      await window.api?.workflow.removeMaterial(materialId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to remove material';
      throw err;
    }
  },

  getWorkflowById(id: string): WorkflowListItem | undefined {
    return workflows.find((w) => w.id === id);
  },

  getWorkflowsByType(type: WorkflowType): WorkflowListItem[] {
    return workflows.filter((w) => w.type === type);
  },

  getWorkflowsByStatus(status: WorkflowStatus): WorkflowListItem[] {
    return workflows.filter((w) => w.status === status);
  },

  // Utility functions
  formatRelativeTime,
  formatDueDate
};
