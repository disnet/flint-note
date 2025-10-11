/**
 * Integration tests for event sourcing architecture
 * Tests the API → event flow and cache simulation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../server/api/test-setup.js';
import type { NoteMetadata } from '../../src/renderer/src/services/noteStore.svelte';

// Event types for testing
type NoteEvent =
  | { type: 'note.created'; note: NoteMetadata }
  | { type: 'note.updated'; noteId: string; updates: Partial<NoteMetadata> }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.renamed'; oldId: string; newId: string }
  | { type: 'note.moved'; noteId: string; oldType: string; newType: string }
  | { type: 'notes.bulkRefresh'; notes: NoteMetadata[] };

describe('Event Sourcing Integration', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let eventLog: NoteEvent[];

  // Helper to simulate event publishing
  function publishEvent(event: NoteEvent) {
    eventLog.push(event);
  }

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('event-test-vault');
    eventLog = [];
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('API operations to event conversion', () => {
    it('should convert createNote result to event data', async () => {
      const noteOptions = {
        type: 'general',
        title: 'Test Note',
        content: 'Test content',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Simulate event creation (what IPC handler does)
      const event: NoteEvent = {
        type: 'note.created',
        note: {
          id: createdNote.id,
          type: noteOptions.type,
          filename: createdNote.filename,
          title: createdNote.title,
          created: createdNote.created,
          modified: createdNote.updated,
          size: createdNote.size || 0,
          tags: [],
          path: createdNote.path
        }
      };
      publishEvent(event);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toMatchObject({
        type: 'note.created',
        note: expect.objectContaining({
          id: createdNote.id,
          title: 'Test Note',
          type: 'general'
        })
      });
    });

    it('should convert updateNote result to event data', async () => {
      const createdNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Original Title',
        content: 'Original content',
        vaultId: testVaultId
      });

      const fullNote = await testSetup.api.getNote(testVaultId, createdNote.id);

      const updateResult = await testSetup.api.updateNote({
        identifier: createdNote.id,
        content: 'Updated content',
        contentHash: fullNote?.content_hash || '',
        vaultId: testVaultId
      });

      // Note: API returns updated: true/false, not a timestamp
      // In real implementation, IPC handler would set the current timestamp
      const event: NoteEvent = {
        type: 'note.updated',
        noteId: createdNote.id,
        updates: {
          modified: new Date().toISOString(),
          size: updateResult.size || 0
        }
      };
      publishEvent(event);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toMatchObject({
        type: 'note.updated',
        noteId: createdNote.id,
        updates: expect.objectContaining({
          modified: expect.any(String),
          size: expect.any(Number)
        })
      });
    });

    it('should convert deleteNote to event data', async () => {
      const createdNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Note to Delete',
        content: 'Will be deleted',
        vaultId: testVaultId
      });

      await testSetup.api.deleteNote({
        identifier: createdNote.id,
        confirm: true,
        vaultId: testVaultId
      });

      const event: NoteEvent = {
        type: 'note.deleted',
        noteId: createdNote.id
      };
      publishEvent(event);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toEqual({
        type: 'note.deleted',
        noteId: createdNote.id
      });
    });

    it('should convert renameNote to event data', async () => {
      const createdNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Original Title',
        content: 'Content',
        vaultId: testVaultId
      });

      const fullNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      const renameResult = await testSetup.api.renameNote({
        noteId: createdNote.id,
        newTitle: 'New Title',
        contentHash: fullNote?.content_hash || '',
        vault_id: testVaultId
      });

      const event: NoteEvent = {
        type: 'note.renamed',
        oldId: createdNote.id,
        newId: renameResult.new_id || createdNote.id
      };
      publishEvent(event);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toMatchObject({
        type: 'note.renamed',
        oldId: createdNote.id,
        newId: expect.any(String)
      });
    });
  });

  describe('cache simulation from events', () => {
    it('should build cache from create/update/delete events', async () => {
      // Simulate a note cache
      const cache = new Map<string, NoteMetadata>();

      // Helper to process events
      function processEvent(event: NoteEvent) {
        switch (event.type) {
          case 'note.created':
            cache.set(event.note.id, event.note);
            break;
          case 'note.updated':
            {
              const existing = cache.get(event.noteId);
              if (existing) {
                cache.set(event.noteId, { ...existing, ...event.updates });
              }
            }
            break;
          case 'note.deleted':
            cache.delete(event.noteId);
            break;
          case 'note.renamed':
            {
              const existing = cache.get(event.oldId);
              if (existing) {
                cache.delete(event.oldId);
                cache.set(event.newId, { ...existing, id: event.newId });
              }
            }
            break;
        }
      }

      // Create note
      const note1 = await testSetup.api.createNote({
        type: 'general',
        title: 'Note 1',
        content: 'Content 1',
        vaultId: testVaultId
      });

      const event1: NoteEvent = {
        type: 'note.created',
        note: {
          id: note1.id,
          type: 'general',
          filename: note1.filename,
          title: note1.title,
          created: note1.created,
          modified: note1.updated,
          size: note1.size || 0,
          tags: [],
          path: note1.path
        }
      };
      processEvent(event1);

      expect(cache.size).toBe(1);
      expect(cache.has(note1.id)).toBe(true);

      // Create another note
      const note2 = await testSetup.api.createNote({
        type: 'task',
        title: 'Note 2',
        content: 'Content 2',
        vaultId: testVaultId
      });

      const event2: NoteEvent = {
        type: 'note.created',
        note: {
          id: note2.id,
          type: 'task',
          filename: note2.filename,
          title: note2.title,
          created: note2.created,
          modified: note2.updated,
          size: note2.size || 0,
          tags: [],
          path: note2.path
        }
      };
      processEvent(event2);

      expect(cache.size).toBe(2);

      // Update note
      const fullNote = await testSetup.api.getNote(testVaultId, note1.id);
      await testSetup.api.updateNote({
        identifier: note1.id,
        content: 'Updated content',
        contentHash: fullNote?.content_hash || '',
        vaultId: testVaultId
      });

      const event3: NoteEvent = {
        type: 'note.updated',
        noteId: note1.id,
        updates: { size: 150 }
      };
      processEvent(event3);

      expect(cache.get(note1.id)?.size).toBe(150);

      // Delete note
      await testSetup.api.deleteNote({
        identifier: note2.id,
        confirm: true,
        vaultId: testVaultId
      });

      const event4: NoteEvent = {
        type: 'note.deleted',
        noteId: note2.id
      };
      processEvent(event4);

      expect(cache.size).toBe(1);
      expect(cache.has(note2.id)).toBe(false);
    });

    it('should handle bulk refresh for initial load', async () => {
      // Create multiple notes
      const notes = await Promise.all([
        testSetup.api.createNote({
          type: 'general',
          title: 'Note 1',
          content: 'Content 1',
          vaultId: testVaultId
        }),
        testSetup.api.createNote({
          type: 'general',
          title: 'Note 2',
          content: 'Content 2',
          vaultId: testVaultId
        }),
        testSetup.api.createNote({
          type: 'task',
          title: 'Task 1',
          content: 'Task content',
          vaultId: testVaultId
        })
      ]);

      // Simulate bulk refresh event
      const bulkNotes: NoteMetadata[] = notes.map((note) => ({
        id: note.id,
        type: note.type || 'general',
        filename: note.filename,
        title: note.title,
        created: note.created,
        modified: note.updated,
        size: note.size || 0,
        tags: [],
        path: note.path
      }));

      const event: NoteEvent = {
        type: 'notes.bulkRefresh',
        notes: bulkNotes
      };
      publishEvent(event);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toMatchObject({
        type: 'notes.bulkRefresh',
        notes: expect.arrayContaining([
          expect.objectContaining({ title: 'Note 1' }),
          expect.objectContaining({ title: 'Note 2' }),
          expect.objectContaining({ title: 'Task 1' })
        ])
      });

      // Verify we can build cache from bulk refresh
      const cache = new Map<string, NoteMetadata>();
      if (event.type === 'notes.bulkRefresh') {
        event.notes.forEach((note) => cache.set(note.id, note));
      }

      expect(cache.size).toBe(3);
    });
  });
});
