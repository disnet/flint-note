import type { NoteMetadata } from './noteStore.svelte';
import { messageBus, type NoteEvent } from './messageBus.svelte';

class NoteCache {
  private cache = $state<Map<string, NoteMetadata>>(new Map());
  private version = $state(0); // Increment this when cache changes to trigger reactivity

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
    this.version++;
  }

  private handleNoteUpdated(event: Extract<NoteEvent, { type: 'note.updated' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, ...event.updates });
      this.version++;
    }
  }

  private handleNoteDeleted(event: Extract<NoteEvent, { type: 'note.deleted' }>): void {
    this.cache.delete(event.noteId);
    this.version++;
  }

  private handleNoteRenamed(event: Extract<NoteEvent, { type: 'note.renamed' }>): void {
    const existing = this.cache.get(event.oldId);
    if (existing) {
      this.cache.delete(event.oldId);
      this.cache.set(event.newId, { ...existing, id: event.newId });
      this.version++;
    }
  }

  private handleNoteMoved(event: Extract<NoteEvent, { type: 'note.moved' }>): void {
    const existing = this.cache.get(event.noteId);
    if (existing) {
      this.cache.set(event.noteId, { ...existing, type: event.newType });
      this.version++;
    }
  }

  private handleBulkRefresh(
    event: Extract<NoteEvent, { type: 'notes.bulkRefresh' }>
  ): void {
    // Replace entire cache (used for initial load)
    console.log(`[noteCache] Handling bulk refresh with ${event.notes.length} notes`);
    this.cache.clear();
    event.notes.forEach((note) => this.cache.set(note.id, note));
    this.version++;
    console.log(
      `[noteCache] Cache now contains ${this.cache.size} notes, version ${this.version}`
    );
  }

  private handleVaultSwitch(): void {
    // Clear cache when vault is switched
    this.cache.clear();
    this.version++;
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
   * Note: Returns a new array on each call to ensure Svelte reactivity tracking
   */
  getAllNotes(): NoteMetadata[] {
    // Access this.version to ensure Svelte tracks changes
    const version = this.version; // Track the version for reactivity
    const notes = Array.from(this.cache.values());
    console.log(
      '[noteCache] getAllNotes() called, returning',
      notes.length,
      'notes (version:',
      version,
      ')'
    );
    return notes;
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
