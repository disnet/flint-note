import type { NoteMetadata } from './noteStore.svelte';

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
  | { type: 'file.sync-started'; fileCount: number }
  | { type: 'file.sync-completed'; added: number; updated: number; deleted: number };

type EventHandler<T extends NoteEvent = NoteEvent> = (event: T) => void;

class MessageBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private eventLog: NoteEvent[] = $state([]);
  private loggingEnabled = $state(false);

  /**
   * Subscribe to specific event type
   */
  subscribe<T extends NoteEvent['type']>(
    eventType: T | '*',
    handler: EventHandler<Extract<NoteEvent, { type: T }>>
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
  publish(event: NoteEvent): void {
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
  getEventLog(): NoteEvent[] {
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
