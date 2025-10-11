/**
 * Unit tests for NoteCache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { NoteMetadata } from '../../../src/renderer/src/services/noteStore.svelte';

// Mock event types
type NoteEvent =
  | { type: 'note.created'; note: NoteMetadata }
  | { type: 'note.updated'; noteId: string; updates: Partial<NoteMetadata> }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.renamed'; oldId: string; newId: string }
  | { type: 'note.moved'; noteId: string; oldType: string; newType: string }
  | { type: 'notes.bulkRefresh'; notes: NoteMetadata[] }
  | { type: 'vault.switched'; vaultId: string };

// Simplified NoteCache for testing (without Svelte runes)
class TestNoteCache {
  private cache = new Map<string, NoteMetadata>();

  handleNoteCreated(event: Extract<NoteEvent, { type: 'note.created' }>): void {
    this.cache.set(event.note.id, event.note);
  }

  handleNoteUpdated(event: Extract<NoteEvent, { type: 'note.updated' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, ...event.updates });
    }
  }

  handleNoteDeleted(event: Extract<NoteEvent, { type: 'note.deleted' }>): void {
    this.cache.delete(event.noteId);
  }

  handleNoteRenamed(event: Extract<NoteEvent, { type: 'note.renamed' }>): void {
    const existing = this.cache.get(event.oldId);
    if (existing) {
      this.cache.delete(event.oldId);
      this.cache.set(event.newId, { ...existing, id: event.newId });
    }
  }

  handleNoteMoved(event: Extract<NoteEvent, { type: 'note.moved' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, type: event.newType });
    }
  }

  handleBulkRefresh(event: Extract<NoteEvent, { type: 'notes.bulkRefresh' }>): void {
    this.cache.clear();
    event.notes.forEach((note) => this.cache.set(note.id, note));
  }

  handleVaultSwitch(): void {
    this.cache.clear();
  }

  getNote(noteId: string): NoteMetadata | undefined {
    return this.cache.get(noteId);
  }

  getAllNotes(): NoteMetadata[] {
    return Array.from(this.cache.values());
  }

  getNotesByType(type: string): NoteMetadata[] {
    return this.getAllNotes().filter((note) => note.type === type);
  }

  hasNote(noteId: string): boolean {
    return this.cache.has(noteId);
  }

  get size(): number {
    return this.cache.size;
  }
}

describe('NoteCache', () => {
  let cache: TestNoteCache;

  const createTestNote = (overrides: Partial<NoteMetadata> = {}): NoteMetadata => ({
    id: 'test-note',
    type: 'general',
    filename: 'test.md',
    title: 'Test Note',
    created: '2024-01-01',
    modified: '2024-01-01',
    size: 100,
    tags: [],
    path: '/test.md',
    ...overrides
  });

  beforeEach(() => {
    cache = new TestNoteCache();
  });

  describe('handleNoteCreated', () => {
    it('should add a new note to the cache', () => {
      const note = createTestNote({ id: 'new-note', title: 'New Note' });

      cache.handleNoteCreated({ type: 'note.created', note });

      expect(cache.hasNote('new-note')).toBe(true);
      expect(cache.getNote('new-note')).toEqual(note);
      expect(cache.size).toBe(1);
    });

    it('should add multiple notes to the cache', () => {
      const note1 = createTestNote({ id: 'note-1', title: 'Note 1' });
      const note2 = createTestNote({ id: 'note-2', title: 'Note 2' });

      cache.handleNoteCreated({ type: 'note.created', note: note1 });
      cache.handleNoteCreated({ type: 'note.created', note: note2 });

      expect(cache.size).toBe(2);
      expect(cache.getNote('note-1')).toEqual(note1);
      expect(cache.getNote('note-2')).toEqual(note2);
    });

    it('should overwrite existing note with same ID', () => {
      const note1 = createTestNote({ id: 'same-id', title: 'Original' });
      const note2 = createTestNote({ id: 'same-id', title: 'Updated' });

      cache.handleNoteCreated({ type: 'note.created', note: note1 });
      cache.handleNoteCreated({ type: 'note.created', note: note2 });

      expect(cache.size).toBe(1);
      expect(cache.getNote('same-id')?.title).toBe('Updated');
    });
  });

  describe('handleNoteUpdated', () => {
    it('should update existing note with partial updates', () => {
      const note = createTestNote({ id: 'update-note', title: 'Original Title' });
      cache.handleNoteCreated({ type: 'note.created', note });

      cache.handleNoteUpdated({
        type: 'note.updated',
        noteId: 'update-note',
        updates: { title: 'Updated Title', size: 200 }
      });

      const updated = cache.getNote('update-note');
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.size).toBe(200);
      expect(updated?.id).toBe('update-note'); // Other fields preserved
      expect(updated?.type).toBe('general');
    });

    it('should do nothing if note does not exist', () => {
      cache.handleNoteUpdated({
        type: 'note.updated',
        noteId: 'non-existent',
        updates: { title: 'Should Not Add' }
      });

      expect(cache.hasNote('non-existent')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('should update modified timestamp', () => {
      const note = createTestNote({ id: 'time-note', modified: '2024-01-01' });
      cache.handleNoteCreated({ type: 'note.created', note });

      cache.handleNoteUpdated({
        type: 'note.updated',
        noteId: 'time-note',
        updates: { modified: '2024-01-02' }
      });

      expect(cache.getNote('time-note')?.modified).toBe('2024-01-02');
    });
  });

  describe('handleNoteDeleted', () => {
    it('should remove note from cache', () => {
      const note = createTestNote({ id: 'delete-note' });
      cache.handleNoteCreated({ type: 'note.created', note });

      expect(cache.hasNote('delete-note')).toBe(true);

      cache.handleNoteDeleted({ type: 'note.deleted', noteId: 'delete-note' });

      expect(cache.hasNote('delete-note')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('should do nothing if note does not exist', () => {
      cache.handleNoteDeleted({ type: 'note.deleted', noteId: 'non-existent' });

      expect(cache.size).toBe(0); // No error thrown
    });

    it('should only delete specified note', () => {
      const note1 = createTestNote({ id: 'note-1' });
      const note2 = createTestNote({ id: 'note-2' });

      cache.handleNoteCreated({ type: 'note.created', note: note1 });
      cache.handleNoteCreated({ type: 'note.created', note: note2 });

      cache.handleNoteDeleted({ type: 'note.deleted', noteId: 'note-1' });

      expect(cache.hasNote('note-1')).toBe(false);
      expect(cache.hasNote('note-2')).toBe(true);
      expect(cache.size).toBe(1);
    });
  });

  describe('handleNoteRenamed', () => {
    it('should rename note ID and preserve data', () => {
      const note = createTestNote({
        id: 'old-id',
        title: 'My Note',
        tags: ['important']
      });
      cache.handleNoteCreated({ type: 'note.created', note });

      cache.handleNoteRenamed({
        type: 'note.renamed',
        oldId: 'old-id',
        newId: 'new-id'
      });

      expect(cache.hasNote('old-id')).toBe(false);
      expect(cache.hasNote('new-id')).toBe(true);

      const renamed = cache.getNote('new-id');
      expect(renamed?.id).toBe('new-id');
      expect(renamed?.title).toBe('My Note');
      expect(renamed?.tags).toEqual(['important']);
    });

    it('should do nothing if old ID does not exist', () => {
      cache.handleNoteRenamed({
        type: 'note.renamed',
        oldId: 'non-existent',
        newId: 'new-id'
      });

      expect(cache.hasNote('new-id')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('should handle renaming to existing ID (overwrites)', () => {
      const note1 = createTestNote({ id: 'note-1', title: 'Note 1' });
      const note2 = createTestNote({ id: 'note-2', title: 'Note 2' });

      cache.handleNoteCreated({ type: 'note.created', note: note1 });
      cache.handleNoteCreated({ type: 'note.created', note: note2 });

      cache.handleNoteRenamed({
        type: 'note.renamed',
        oldId: 'note-1',
        newId: 'note-2'
      });

      expect(cache.hasNote('note-1')).toBe(false);
      expect(cache.hasNote('note-2')).toBe(true);
      expect(cache.getNote('note-2')?.title).toBe('Note 1'); // Renamed note overwrites
      expect(cache.size).toBe(1);
    });
  });

  describe('handleNoteMoved', () => {
    it('should update note type', () => {
      const note = createTestNote({ id: 'move-note', type: 'general' });
      cache.handleNoteCreated({ type: 'note.created', note });

      cache.handleNoteMoved({
        type: 'note.moved',
        noteId: 'move-note',
        oldType: 'general',
        newType: 'task'
      });

      expect(cache.getNote('move-note')?.type).toBe('task');
    });

    it('should preserve other note properties', () => {
      const note = createTestNote({
        id: 'preserve-note',
        type: 'general',
        title: 'My Title',
        tags: ['tag1']
      });
      cache.handleNoteCreated({ type: 'note.created', note });

      cache.handleNoteMoved({
        type: 'note.moved',
        noteId: 'preserve-note',
        oldType: 'general',
        newType: 'daily'
      });

      const moved = cache.getNote('preserve-note');
      expect(moved?.type).toBe('daily');
      expect(moved?.title).toBe('My Title');
      expect(moved?.tags).toEqual(['tag1']);
    });

    it('should do nothing if note does not exist', () => {
      cache.handleNoteMoved({
        type: 'note.moved',
        noteId: 'non-existent',
        oldType: 'general',
        newType: 'task'
      });

      expect(cache.size).toBe(0);
    });
  });

  describe('handleBulkRefresh', () => {
    it('should replace entire cache with new notes', () => {
      // Add some initial notes
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'old-1' })
      });
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'old-2' })
      });

      expect(cache.size).toBe(2);

      // Bulk refresh with new notes
      const newNotes = [
        createTestNote({ id: 'new-1', title: 'New 1' }),
        createTestNote({ id: 'new-2', title: 'New 2' }),
        createTestNote({ id: 'new-3', title: 'New 3' })
      ];

      cache.handleBulkRefresh({ type: 'notes.bulkRefresh', notes: newNotes });

      expect(cache.size).toBe(3);
      expect(cache.hasNote('old-1')).toBe(false);
      expect(cache.hasNote('old-2')).toBe(false);
      expect(cache.hasNote('new-1')).toBe(true);
      expect(cache.hasNote('new-2')).toBe(true);
      expect(cache.hasNote('new-3')).toBe(true);
    });

    it('should handle empty bulk refresh', () => {
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'note-1' })
      });

      cache.handleBulkRefresh({ type: 'notes.bulkRefresh', notes: [] });

      expect(cache.size).toBe(0);
    });
  });

  describe('handleVaultSwitch', () => {
    it('should clear the cache', () => {
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'note-1' })
      });
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'note-2' })
      });

      expect(cache.size).toBe(2);

      cache.handleVaultSwitch();

      expect(cache.size).toBe(0);
      expect(cache.hasNote('note-1')).toBe(false);
      expect(cache.hasNote('note-2')).toBe(false);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      // Set up test data
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'general-1', type: 'general', title: 'General 1' })
      });
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'general-2', type: 'general', title: 'General 2' })
      });
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'task-1', type: 'task', title: 'Task 1' })
      });
      cache.handleNoteCreated({
        type: 'note.created',
        note: createTestNote({ id: 'daily-1', type: 'daily', title: 'Daily 1' })
      });
    });

    describe('getAllNotes', () => {
      it('should return all notes in the cache', () => {
        const allNotes = cache.getAllNotes();

        expect(allNotes).toHaveLength(4);
        expect(allNotes.map((n) => n.id).sort()).toEqual([
          'daily-1',
          'general-1',
          'general-2',
          'task-1'
        ]);
      });

      it('should return empty array when cache is empty', () => {
        cache.handleVaultSwitch();
        expect(cache.getAllNotes()).toEqual([]);
      });
    });

    describe('getNotesByType', () => {
      it('should return notes of specified type', () => {
        const generalNotes = cache.getNotesByType('general');

        expect(generalNotes).toHaveLength(2);
        expect(generalNotes.map((n) => n.id).sort()).toEqual(['general-1', 'general-2']);
      });

      it('should return empty array for type with no notes', () => {
        const projectNotes = cache.getNotesByType('project');
        expect(projectNotes).toEqual([]);
      });

      it('should return only exact type matches', () => {
        const taskNotes = cache.getNotesByType('task');

        expect(taskNotes).toHaveLength(1);
        expect(taskNotes[0].id).toBe('task-1');
      });
    });

    describe('hasNote', () => {
      it('should return true for existing notes', () => {
        expect(cache.hasNote('general-1')).toBe(true);
        expect(cache.hasNote('task-1')).toBe(true);
      });

      it('should return false for non-existent notes', () => {
        expect(cache.hasNote('non-existent')).toBe(false);
      });
    });

    describe('size', () => {
      it('should return correct cache size', () => {
        expect(cache.size).toBe(4);
      });

      it('should update when notes are added or removed', () => {
        cache.handleNoteDeleted({ type: 'note.deleted', noteId: 'general-1' });
        expect(cache.size).toBe(3);

        cache.handleNoteCreated({
          type: 'note.created',
          note: createTestNote({ id: 'new-note' })
        });
        expect(cache.size).toBe(4);
      });
    });
  });
});
