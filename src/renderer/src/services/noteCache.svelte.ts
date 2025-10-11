import type { NoteMetadata } from './noteStore.svelte';
import { messageBus, type NoteEvent } from './messageBus.svelte';

class NoteCache {
  // Use reactive array as source of truth for Svelte reactivity
  private cacheArray = $state<NoteMetadata[]>([]);

  // Derived Map for O(1) lookups - recomputes when cacheArray changes
  private cacheMap = $derived.by(() => {
    return new Map(this.cacheArray.map((note) => [note.id, note]));
  });

  constructor() {
    // Subscribe to all note events and update cache accordingly
    messageBus.subscribe('note.created', (e) => this.handleNoteCreated(e));
    messageBus.subscribe('note.updated', (e) => this.handleNoteUpdated(e));
    messageBus.subscribe('note.deleted', (e) => this.handleNoteDeleted(e));
    messageBus.subscribe('note.renamed', (e) => this.handleNoteRenamed(e));
    messageBus.subscribe('note.moved', (e) => this.handleNoteMoved(e));
    messageBus.subscribe('notes.bulkRefresh', (e) => this.handleBulkRefresh(e));
    // NOTE: vault.switched listener removed to prevent race conditions
    // Cache is now cleared and repopulated via notes.bulkRefresh event during vault switch
    // This ensures proper sequencing: tabs load -> notes load -> bulk refresh -> tabs hydrate
    // messageBus.subscribe('vault.switched', () => this.handleVaultSwitch());
  }

  // --- Event Handlers ---

  private handleNoteCreated(event: Extract<NoteEvent, { type: 'note.created' }>): void {
    // Add note to array - array reassignment triggers reactivity
    this.cacheArray = [...this.cacheArray, event.note];
  }

  private handleNoteUpdated(event: Extract<NoteEvent, { type: 'note.updated' }>): void {
    // Update note in array - array reassignment triggers reactivity
    this.cacheArray = this.cacheArray.map((note) =>
      note.id === event.noteId ? { ...note, ...event.updates } : note
    );
  }

  private handleNoteDeleted(event: Extract<NoteEvent, { type: 'note.deleted' }>): void {
    // Remove note from array - array reassignment triggers reactivity
    this.cacheArray = this.cacheArray.filter((note) => note.id !== event.noteId);
  }

  private handleNoteRenamed(event: Extract<NoteEvent, { type: 'note.renamed' }>): void {
    // Update note ID in array - array reassignment triggers reactivity
    this.cacheArray = this.cacheArray.map((note) =>
      note.id === event.oldId ? { ...note, id: event.newId } : note
    );
  }

  private handleNoteMoved(event: Extract<NoteEvent, { type: 'note.moved' }>): void {
    // Update note type in array - array reassignment triggers reactivity
    this.cacheArray = this.cacheArray.map((note) =>
      note.id === event.noteId ? { ...note, type: event.newType } : note
    );
  }

  private handleBulkRefresh(
    event: Extract<NoteEvent, { type: 'notes.bulkRefresh' }>
  ): void {
    // Replace entire cache (used for initial load and vault switches)
    console.log(`[noteCache] Handling bulk refresh with ${event.notes.length} notes`);
    this.cacheArray = event.notes;
    console.log(`[noteCache] Cache now contains ${this.cacheArray.length} notes`);
  }

  // --- Public API ---

  /**
   * Get a note by ID - uses derived Map for O(1) lookup
   */
  getNote(noteId: string): NoteMetadata | undefined {
    return this.cacheMap.get(noteId);
  }

  /**
   * Get all notes - returns the reactive array directly
   */
  getAllNotes(): NoteMetadata[] {
    console.log(
      '[noteCache] getAllNotes() called, returning',
      this.cacheArray.length,
      'notes'
    );
    return this.cacheArray;
  }

  /**
   * Get notes by type
   */
  getNotesByType(type: string): NoteMetadata[] {
    return this.getAllNotes().filter((note) => note.type === type);
  }

  /**
   * Check if cache has a note - uses derived Map for O(1) lookup
   */
  hasNote(noteId: string): boolean {
    return this.cacheMap.has(noteId);
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cacheArray.length;
  }

  /**
   * Manually add/update note (for optimistic updates)
   */
  addNote(note: NoteMetadata): void {
    const existingIndex = this.cacheArray.findIndex((n) => n.id === note.id);
    if (existingIndex >= 0) {
      // Update existing note
      this.cacheArray = this.cacheArray.map((n, i) => (i === existingIndex ? note : n));
    } else {
      // Add new note
      this.cacheArray = [...this.cacheArray, note];
    }
  }

  /**
   * Manually update note (for optimistic updates)
   */
  updateNote(noteId: string, updates: Partial<NoteMetadata>): void {
    this.cacheArray = this.cacheArray.map((note) =>
      note.id === noteId ? { ...note, ...updates } : note
    );
  }

  /**
   * Manually delete note (for optimistic updates)
   */
  deleteNote(noteId: string): void {
    this.cacheArray = this.cacheArray.filter((note) => note.id !== noteId);
  }
}

export const noteCache = new NoteCache();
