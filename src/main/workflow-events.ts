import { BrowserWindow } from 'electron';
import type {
  WorkflowListItem,
  Workflow,
  WorkflowCompletion
} from '../server/types/workflow';

// Event type definitions - must match renderer's WorkflowEvent type
export type WorkflowEvent =
  | { type: 'workflow.created'; workflow: WorkflowListItem }
  | { type: 'workflow.updated'; workflowId: string; workflow: Workflow }
  | { type: 'workflow.deleted'; workflowId: string }
  | { type: 'workflow.completed'; workflowId: string; completion: WorkflowCompletion }
  | { type: 'workflow.material-added'; workflowId: string; materialId: string }
  | { type: 'workflow.material-removed'; workflowId: string; materialId: string };

/**
 * Publishes a workflow event to all renderer processes
 * This is the main process side of the event sourcing architecture
 */
export function publishWorkflowEvent(event: WorkflowEvent): void {
  // Skip event publishing in test environment
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTestEnv) {
    return;
  }

  // BrowserWindow may not be available in all environments
  try {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      window.webContents.send('workflow-event', event);
    });
  } catch (error) {
    // Silently fail if BrowserWindow is not available
    console.warn('Failed to publish workflow event:', error);
  }
}
