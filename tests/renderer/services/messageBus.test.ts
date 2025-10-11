/**
 * Unit tests for MessageBus event system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NoteMetadata } from '../../../src/renderer/src/services/noteStore.svelte';

// Mock the NoteEvent types since we can't import from .svelte.ts in node environment
type NoteEvent =
  | { type: 'note.created'; note: NoteMetadata }
  | { type: 'note.updated'; noteId: string; updates: Partial<NoteMetadata> }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.renamed'; oldId: string; newId: string }
  | { type: 'note.moved'; noteId: string; oldType: string; newType: string }
  | {
      type: 'note.linksChanged';
      noteId: string;
      addedLinks?: string[];
      removedLinks?: string[];
    }
  | { type: 'notes.bulkRefresh'; notes: NoteMetadata[] }
  | { type: 'vault.switched'; vaultId: string };

type EventHandler<T extends NoteEvent = NoteEvent> = (event: T) => void;

// Simplified MessageBus implementation for testing (without Svelte runes)
class TestMessageBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private eventLog: NoteEvent[] = [];
  private loggingEnabled = false;

  subscribe<T extends NoteEvent['type']>(
    eventType: T | '*',
    handler: EventHandler<Extract<NoteEvent, { type: T }>>
  ): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler as EventHandler);

    return () => this.subscribers.get(eventType)?.delete(handler as EventHandler);
  }

  publish(event: NoteEvent): void {
    if (this.loggingEnabled) {
      this.eventLog.push(event);
    }

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

  setLogging(enabled: boolean): void {
    this.loggingEnabled = enabled;
  }

  getEventLog(): NoteEvent[] {
    return this.eventLog;
  }

  clearEventLog(): void {
    this.eventLog = [];
  }
}

describe('MessageBus', () => {
  let messageBus: TestMessageBus;

  beforeEach(() => {
    messageBus = new TestMessageBus();
  });

  describe('subscribe and publish', () => {
    it('should notify subscribers when an event is published', () => {
      const handler = vi.fn();
      messageBus.subscribe('note.created', handler);

      const event: NoteEvent = {
        type: 'note.created',
        note: {
          id: 'test-note',
          type: 'general',
          filename: 'test.md',
          title: 'Test Note',
          created: '2024-01-01',
          modified: '2024-01-01',
          size: 100,
          tags: [],
          path: '/test.md'
        }
      };

      messageBus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support multiple subscribers to the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      messageBus.subscribe('note.updated', handler1);
      messageBus.subscribe('note.updated', handler2);
      messageBus.subscribe('note.updated', handler3);

      const event: NoteEvent = {
        type: 'note.updated',
        noteId: 'test-note',
        updates: { title: 'Updated Title' }
      };

      messageBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should only notify subscribers of matching event types', () => {
      const createdHandler = vi.fn();
      const updatedHandler = vi.fn();
      const deletedHandler = vi.fn();

      messageBus.subscribe('note.created', createdHandler);
      messageBus.subscribe('note.updated', updatedHandler);
      messageBus.subscribe('note.deleted', deletedHandler);

      const event: NoteEvent = {
        type: 'note.updated',
        noteId: 'test-note',
        updates: { title: 'Updated' }
      };

      messageBus.publish(event);

      expect(createdHandler).not.toHaveBeenCalled();
      expect(updatedHandler).toHaveBeenCalledWith(event);
      expect(deletedHandler).not.toHaveBeenCalled();
    });

    it('should support wildcard subscribers that receive all events', () => {
      const wildcardHandler = vi.fn();
      const specificHandler = vi.fn();

      messageBus.subscribe('*', wildcardHandler);
      messageBus.subscribe('note.created', specificHandler);

      const createEvent: NoteEvent = {
        type: 'note.created',
        note: {
          id: 'test-note',
          type: 'general',
          filename: 'test.md',
          title: 'Test',
          created: '2024-01-01',
          modified: '2024-01-01',
          size: 100,
          tags: [],
          path: '/test.md'
        }
      };

      const deleteEvent: NoteEvent = {
        type: 'note.deleted',
        noteId: 'test-note'
      };

      messageBus.publish(createEvent);
      messageBus.publish(deleteEvent);

      // Wildcard handler should receive both events
      expect(wildcardHandler).toHaveBeenCalledTimes(2);
      expect(wildcardHandler).toHaveBeenCalledWith(createEvent);
      expect(wildcardHandler).toHaveBeenCalledWith(deleteEvent);

      // Specific handler should only receive matching event
      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(specificHandler).toHaveBeenCalledWith(createEvent);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = messageBus.subscribe('note.deleted', handler);

      const event: NoteEvent = {
        type: 'note.deleted',
        noteId: 'test-note'
      };

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should not affect other subscribers when one unsubscribes', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = messageBus.subscribe('note.renamed', handler1);
      messageBus.subscribe('note.renamed', handler2);

      const event: NoteEvent = {
        type: 'note.renamed',
        oldId: 'old-note',
        newId: 'new-note'
      };

      messageBus.publish(event);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      unsubscribe1();

      messageBus.publish(event);
      expect(handler1).toHaveBeenCalledTimes(1); // Not called again
      expect(handler2).toHaveBeenCalledTimes(2); // Called again
    });
  });

  describe('event logging', () => {
    it('should log events when logging is enabled', () => {
      messageBus.setLogging(true);

      const event1: NoteEvent = {
        type: 'note.created',
        note: {
          id: 'note1',
          type: 'general',
          filename: 'note1.md',
          title: 'Note 1',
          created: '2024-01-01',
          modified: '2024-01-01',
          size: 100,
          tags: [],
          path: '/note1.md'
        }
      };

      const event2: NoteEvent = {
        type: 'note.deleted',
        noteId: 'note2'
      };

      messageBus.publish(event1);
      messageBus.publish(event2);

      const log = messageBus.getEventLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toEqual(event1);
      expect(log[1]).toEqual(event2);
    });

    it('should not log events when logging is disabled', () => {
      messageBus.setLogging(false);

      const event: NoteEvent = {
        type: 'note.updated',
        noteId: 'test-note',
        updates: {}
      };

      messageBus.publish(event);

      expect(messageBus.getEventLog()).toHaveLength(0);
    });

    it('should clear event log when requested', () => {
      messageBus.setLogging(true);

      messageBus.publish({
        type: 'note.deleted',
        noteId: 'test'
      });

      expect(messageBus.getEventLog()).toHaveLength(1);

      messageBus.clearEventLog();

      expect(messageBus.getEventLog()).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should catch errors in event handlers and continue processing', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      messageBus.subscribe('note.moved', errorHandler);
      messageBus.subscribe('note.moved', successHandler);

      const event: NoteEvent = {
        type: 'note.moved',
        noteId: 'test-note',
        oldType: 'general',
        newType: 'task'
      };

      // Should not throw
      expect(() => messageBus.publish(event)).not.toThrow();

      // Both handlers should be called
      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('event types', () => {
    it('should handle note.created events', () => {
      const handler = vi.fn();
      messageBus.subscribe('note.created', handler);

      const event: NoteEvent = {
        type: 'note.created',
        note: {
          id: 'new-note',
          type: 'general',
          filename: 'new.md',
          title: 'New Note',
          created: '2024-01-01',
          modified: '2024-01-01',
          size: 200,
          tags: ['tag1'],
          path: '/new.md'
        }
      };

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle note.linksChanged events', () => {
      const handler = vi.fn();
      messageBus.subscribe('note.linksChanged', handler);

      const event: NoteEvent = {
        type: 'note.linksChanged',
        noteId: 'note-with-links',
        addedLinks: ['new-link-1', 'new-link-2'],
        removedLinks: ['old-link']
      };

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle notes.bulkRefresh events', () => {
      const handler = vi.fn();
      messageBus.subscribe('notes.bulkRefresh', handler);

      const notes: NoteMetadata[] = [
        {
          id: 'note1',
          type: 'general',
          filename: 'note1.md',
          title: 'Note 1',
          created: '2024-01-01',
          modified: '2024-01-01',
          size: 100,
          tags: [],
          path: '/note1.md'
        },
        {
          id: 'note2',
          type: 'task',
          filename: 'note2.md',
          title: 'Note 2',
          created: '2024-01-02',
          modified: '2024-01-02',
          size: 150,
          tags: [],
          path: '/note2.md'
        }
      ];

      const event: NoteEvent = {
        type: 'notes.bulkRefresh',
        notes
      };

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle vault.switched events', () => {
      const handler = vi.fn();
      messageBus.subscribe('vault.switched', handler);

      const event: NoteEvent = {
        type: 'vault.switched',
        vaultId: 'new-vault-id'
      };

      messageBus.publish(event);
      expect(handler).toHaveBeenCalledWith(event);
    });
  });
});
