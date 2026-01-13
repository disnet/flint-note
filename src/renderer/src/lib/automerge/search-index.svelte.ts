/**
 * Search index for full-text content search using MiniSearch
 *
 * Features:
 * - Persisted index in IndexedDB (avoids rebuilding on every startup)
 * - Incremental updates for changed notes
 * - Background content loading and indexing
 * - Fuzzy matching support
 * - Field weighting (title > content)
 */

import MiniSearch from 'minisearch';
import type { NoteMetadata } from './types';

export interface IndexedNote {
  id: string;
  title: string;
  content: string;
  type: string;
  updated: string;
}

export interface ContentSearchResult {
  id: string;
  score: number;
  match: Record<string, string[]>;
  terms: string[];
}

// IndexedDB constants
const DB_NAME = 'flint-search-index';
const DB_VERSION = 1;
const STORE_NAME = 'search-data';
const INDEX_KEY = 'miniSearchIndex';
const TIMESTAMPS_KEY = 'noteTimestamps';

// MiniSearch options - must match for serialization/deserialization
const MINISEARCH_OPTIONS = {
  fields: ['title', 'content'],
  storeFields: ['id', 'title', 'type', 'updated'],
  searchOptions: {
    boost: { title: 3, content: 1 },
    fuzzy: 0.2,
    prefix: true
  }
};

/**
 * Open the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Get a value from IndexedDB
 */
async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
  });
}

/**
 * Set a value in IndexedDB
 */
async function dbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Clear all data from IndexedDB
 */
async function dbClear(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

class SearchIndex {
  private miniSearch: MiniSearch<IndexedNote>;
  private indexedNoteIds = new Set<string>();
  // Track note timestamps for incremental updates (noteId -> updated timestamp)
  private noteTimestamps = new Map<string, string>();
  private _isIndexing = $state(false);
  private _indexProgress = $state({ current: 0, total: 0 });
  private loadContentFn: ((noteId: string) => Promise<string>) | null = null;

  constructor() {
    this.miniSearch = new MiniSearch<IndexedNote>(MINISEARCH_OPTIONS);
  }

  /**
   * Set the function used to load note content
   */
  setContentLoader(fn: (noteId: string) => Promise<string>): void {
    this.loadContentFn = fn;
  }

  /**
   * Index a single note (add or update)
   */
  async indexNote(note: NoteMetadata, content?: string): Promise<void> {
    // Remove existing entry if present
    if (this.indexedNoteIds.has(note.id)) {
      try {
        this.miniSearch.discard(note.id);
      } catch {
        // Note may not exist in index, ignore
      }
    }

    // Load content if not provided
    const noteContent = content ?? (await this.loadContentFn?.(note.id)) ?? '';

    // Add to index
    this.miniSearch.add({
      id: note.id,
      title: note.title,
      content: noteContent,
      type: note.type,
      updated: note.updated
    });

    this.indexedNoteIds.add(note.id);
    this.noteTimestamps.set(note.id, note.updated);
  }

  /**
   * Try to load the persisted index from IndexedDB
   * Returns true if successful, false if index needs to be rebuilt
   */
  private async loadPersistedIndex(): Promise<boolean> {
    try {
      const [serializedIndex, timestamps] = await Promise.all([
        dbGet<string>(INDEX_KEY),
        dbGet<Record<string, string>>(TIMESTAMPS_KEY)
      ]);

      if (!serializedIndex || !timestamps) {
        return false;
      }

      // Deserialize the MiniSearch index
      this.miniSearch = MiniSearch.loadJSON(serializedIndex, MINISEARCH_OPTIONS);
      this.noteTimestamps = new Map(Object.entries(timestamps));
      this.indexedNoteIds = new Set(this.noteTimestamps.keys());

      return true;
    } catch (error) {
      console.warn('[Search] Failed to load persisted index:', error);
      return false;
    }
  }

  /**
   * Persist the current index to IndexedDB
   */
  private async persistIndex(): Promise<void> {
    try {
      const serializedIndex = JSON.stringify(this.miniSearch);
      const timestamps = Object.fromEntries(this.noteTimestamps);

      await Promise.all([
        dbSet(INDEX_KEY, serializedIndex),
        dbSet(TIMESTAMPS_KEY, timestamps)
      ]);
    } catch (error) {
      console.warn('[Search] Failed to persist index:', error);
    }
  }

  /**
   * Build the full search index from all notes
   * Uses persisted index if available, with incremental updates for changes
   */
  async buildIndex(
    notes: NoteMetadata[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (this._isIndexing) return;
    this._isIndexing = true;
    const startTime = performance.now();

    try {
      // Filter out archived notes
      const activeNotes = notes.filter((n) => !n.archived);
      const activeNoteIds = new Set(activeNotes.map((n) => n.id));

      // Try to load persisted index
      const hasPersistedIndex = await this.loadPersistedIndex();

      if (hasPersistedIndex) {
        // Incremental update mode
        console.log(
          `[Search] Loaded persisted index with ${this.indexedNoteIds.size} notes, checking for changes...`
        );

        // Find notes that need updating
        const notesToAdd: NoteMetadata[] = [];
        const notesToUpdate: NoteMetadata[] = [];
        const notesToRemove: string[] = [];

        // Check for new and updated notes
        for (const note of activeNotes) {
          const storedTimestamp = this.noteTimestamps.get(note.id);
          if (!storedTimestamp) {
            notesToAdd.push(note);
          } else if (storedTimestamp !== note.updated) {
            notesToUpdate.push(note);
          }
        }

        // Check for deleted notes
        for (const noteId of this.indexedNoteIds) {
          if (!activeNoteIds.has(noteId)) {
            notesToRemove.push(noteId);
          }
        }

        const totalChanges =
          notesToAdd.length + notesToUpdate.length + notesToRemove.length;

        if (totalChanges === 0) {
          const duration = performance.now() - startTime;
          console.log(`[Search] Index up to date (${duration.toFixed(0)}ms to verify)`);
          return;
        }

        console.log(
          `[Search] Incremental update: ${notesToAdd.length} new, ${notesToUpdate.length} updated, ${notesToRemove.length} removed`
        );

        this._indexProgress = { current: 0, total: totalChanges };

        // Remove deleted notes
        for (const noteId of notesToRemove) {
          this.removeNote(noteId);
        }

        // Index new and updated notes in batches
        const notesToIndex = [...notesToAdd, ...notesToUpdate];
        const BATCH_SIZE = 10;
        for (let i = 0; i < notesToIndex.length; i += BATCH_SIZE) {
          const batch = notesToIndex.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((note) => this.indexNote(note)));

          this._indexProgress.current =
            notesToRemove.length + Math.min(i + BATCH_SIZE, notesToIndex.length);
          onProgress?.(this._indexProgress.current, totalChanges);

          // Yield to main thread
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        // Persist the updated index
        await this.persistIndex();

        const duration = performance.now() - startTime;
        console.log(
          `[Search] Incremental update complete in ${duration < 1000 ? duration.toFixed(0) + 'ms' : (duration / 1000).toFixed(2) + 's'}`
        );
      } else {
        // Full rebuild mode
        this._indexProgress = { current: 0, total: activeNotes.length };
        console.log(`[Search] Building full index for ${activeNotes.length} notes...`);

        // Clear any existing data
        this.clear();

        // Index in batches to avoid blocking UI
        const BATCH_SIZE = 10;
        for (let i = 0; i < activeNotes.length; i += BATCH_SIZE) {
          const batch = activeNotes.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((note) => this.indexNote(note)));

          this._indexProgress.current = Math.min(i + BATCH_SIZE, activeNotes.length);
          onProgress?.(this._indexProgress.current, activeNotes.length);

          // Yield to main thread
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        // Persist the newly built index
        await this.persistIndex();

        const duration = performance.now() - startTime;
        console.log(
          `[Search] Full index built and persisted in ${duration < 1000 ? duration.toFixed(0) + 'ms' : (duration / 1000).toFixed(2) + 's'}`
        );
      }
    } finally {
      this._isIndexing = false;
    }
  }

  /**
   * Search the index
   */
  search(query: string): ContentSearchResult[] {
    if (!query.trim()) return [];

    const results = this.miniSearch.search(query, {
      fuzzy: 0.2,
      prefix: true
    });

    return results.map((r) => ({
      id: r.id,
      score: r.score,
      match: r.match,
      terms: r.terms
    }));
  }

  /**
   * Remove a note from the index
   */
  removeNote(noteId: string): void {
    if (this.indexedNoteIds.has(noteId)) {
      try {
        this.miniSearch.discard(noteId);
      } catch {
        // Note may not exist in index, ignore
      }
      this.indexedNoteIds.delete(noteId);
      this.noteTimestamps.delete(noteId);
    }
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.miniSearch = new MiniSearch<IndexedNote>(MINISEARCH_OPTIONS);
    this.indexedNoteIds.clear();
    this.noteTimestamps.clear();
  }

  /**
   * Clear the persisted index from IndexedDB
   */
  async clearPersisted(): Promise<void> {
    await dbClear();
  }

  /**
   * Check if the index is currently being built
   */
  get isBuilding(): boolean {
    return this._isIndexing;
  }

  /**
   * Get the current index build progress
   */
  get progress(): { current: number; total: number } {
    return this._indexProgress;
  }

  /**
   * Get the number of indexed notes
   */
  get indexedCount(): number {
    return this.indexedNoteIds.size;
  }

  /**
   * Check if a note is indexed
   */
  isIndexed(noteId: string): boolean {
    return this.indexedNoteIds.has(noteId);
  }
}

// Singleton instance
export const searchIndex = new SearchIndex();
