import type { NoteMetadata } from './noteStore.svelte';
import type {
  WorkflowListItem,
  Workflow,
  WorkflowCompletion
} from '../../../server/types/workflow';

// Event type definitions
export type NoteEvent =
  | { type: 'note.created'; note: NoteMetadata }
  | { type: 'note.updated'; noteId: string; updates: Partial<NoteMetadata> }
  | { type: 'note.deleted'; noteId: string }
  | {
      type: 'note.renamed';
      oldId: string;
      newId: string;
      title: string;
      filename: string;
    }
  | { type: 'note.moved'; noteId: string; oldType: string; newType: string }
  | {
      type: 'note.linksChanged';
      noteId: string;
      addedLinks?: string[];
      removedLinks?: string[];
    }
  | { type: 'notes.bulkRefresh'; notes: NoteMetadata[] } // For initial load
  | { type: 'vault.switched'; vaultId: string }
  | { type: 'file.external-change'; path: string; noteId?: string }
  | { type: 'file.external-add'; path: string }
  | { type: 'file.external-delete'; path: string; noteId?: string }
  | { type: 'file.external-rename'; oldPath: string; newPath: string; noteId: string }
  | { type: 'file.external-edit-conflict'; noteId: string; path: string }
  | { type: 'file.sync-started'; fileCount: number }
  | { type: 'file.sync-completed'; added: number; updated: number; deleted: number };

export type WorkflowEvent =
  | { type: 'workflow.created'; workflow: WorkflowListItem }
  | { type: 'workflow.updated'; workflowId: string; workflow: Workflow }
  | { type: 'workflow.deleted'; workflowId: string }
  | { type: 'workflow.completed'; workflowId: string; completion: WorkflowCompletion }
  | { type: 'workflow.material-added'; workflowId: string; materialId: string }
  | { type: 'workflow.material-removed'; workflowId: string; materialId: string };

export type AppEvent = NoteEvent | WorkflowEvent;

type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void;

class MessageBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private eventLog: AppEvent[] = $state([]);
  private loggingEnabled = $state(false);

  /**
   * Subscribe to specific event type
   */
  subscribe<T extends AppEvent['type']>(
    eventType: T | '*',
    handler: EventHandler<Extract<AppEvent, { type: T }>>
  ): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => this.subscribers.get(eventType)?.delete(handler as EventHandler);
  }

  /**
   * Publish event to all subscribers
   */
  publish(event: AppEvent): void {
    // Log event if debugging enabled
    if (this.loggingEnabled) {
      this.eventLog.push(event);
      console.log('[MessageBus]', event);
    }

    // Notify specific event type subscribers
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[MessageBus] Error in handler for ${event.type}:`, error);
        }
      });
    }

    // Notify wildcard subscribers
    const wildcardHandlers = this.subscribers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error('[MessageBus] Error in wildcard handler:', error);
        }
      });
    }
  }

  /**
   * Enable/disable event logging for debugging
   */
  setLogging(enabled: boolean): void {
    this.loggingEnabled = enabled;
  }

  /**
   * Get event log (for debugging)
   */
  getEventLog(): AppEvent[] {
    return this.eventLog;
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }
}

export const messageBus = new MessageBus();

// Enable logging in development
if (import.meta.env.DEV) {
  messageBus.setLogging(true);
}
