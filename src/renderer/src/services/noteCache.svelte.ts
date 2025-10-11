import type { NoteMetadata } from './noteStore.svelte';
import { messageBus, type NoteEvent } from './messageBus.svelte';

class NoteCache {
  private cache = $state<Map<string, NoteMetadata>>(new Map());

  constructor() {
    // Subscribe to all note events and update cache accordingly
    messageBus.subscribe('note.created', (e) => this.handleNoteCreated(e));
    messageBus.subscribe('note.updated', (e) => this.handleNoteUpdated(e));
    messageBus.subscribe('note.deleted', (e) => this.handleNoteDeleted(e));
    messageBus.subscribe('note.renamed', (e) => this.handleNoteRenamed(e));
    messageBus.subscribe('note.moved', (e) => this.handleNoteMoved(e));
    messageBus.subscribe('notes.bulkRefresh', (e) => this.handleBulkRefresh(e));
    messageBus.subscribe('vault.switched', () => this.handleVaultSwitch());
  }

  // --- Event Handlers ---

  private handleNoteCreated(event: Extract<NoteEvent, { type: 'note.created' }>): void {
    this.cache.set(event.note.id, event.note);
  }

  private handleNoteUpdated(event: Extract<NoteEvent, { type: 'note.updated' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, ...event.updates });
    }
  }

  private handleNoteDeleted(event: Extract<NoteEvent, { type: 'note.deleted' }>): void {
    this.cache.delete(event.noteId);
  }

  private handleNoteRenamed(event: Extract<NoteEvent, { type: 'note.renamed' }>): void {
    const existing = this.cache.get(event.oldId);
    if (existing) {
      this.cache.delete(event.oldId);
      this.cache.set(event.newId, { ...existing, id: event.newId });
    }
  }

  private handleNoteMoved(event: Extract<NoteEvent, { type: 'note.moved' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, type: event.newType });
    }
  }

  private handleBulkRefresh(
    event: Extract<NoteEvent, { type: 'notes.bulkRefresh' }>
  ): void {
    // Replace entire cache (used for initial load)
    this.cache.clear();
    event.notes.forEach((note) => this.cache.set(note.id, note));
  }

  private handleVaultSwitch(): void {
    // Clear cache when vault is switched
    this.cache.clear();
  }

  // --- Public API ---

  /**
   * Get a note by ID
   */
  getNote(noteId: string): NoteMetadata | undefined {
    return this.cache.get(noteId);
  }

  /**
   * Get all notes
   */
  getAllNotes(): NoteMetadata[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get notes by type
   */
  getNotesByType(type: string): NoteMetadata[] {
    return this.getAllNotes().filter((note) => note.type === type);
  }

  /**
   * Check if cache has a note
   */
  hasNote(noteId: string): boolean {
    return this.cache.has(noteId);
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Manually add/update note (for optimistic updates)
   */
  addNote(note: NoteMetadata): void {
    this.cache.set(note.id, note);
  }

  /**
   * Manually update note (for optimistic updates)
   */
  updateNote(noteId: string, updates: Partial<NoteMetadata>): void {
    const existing = this.cache.get(noteId);
    if (existing) {
      this.cache.set(noteId, { ...existing, ...updates });
    }
  }

  /**
   * Manually delete note (for optimistic updates)
   */
  deleteNote(noteId: string): void {
    this.cache.delete(noteId);
  }
}

export const noteCache = new NoteCache();
