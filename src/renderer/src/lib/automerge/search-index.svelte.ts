/**
 * Search index for full-text content search using MiniSearch
 *
 * Features:
 * - Background content loading and indexing
 * - Incremental index updates when notes change
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

class SearchIndex {
  private miniSearch: MiniSearch<IndexedNote>;
  private indexedNoteIds = new Set<string>();
  private _isIndexing = $state(false);
  private _indexProgress = $state({ current: 0, total: 0 });
  private loadContentFn: ((noteId: string) => Promise<string>) | null = null;

  constructor() {
    this.miniSearch = new MiniSearch<IndexedNote>({
      fields: ['title', 'content'],
      storeFields: ['id', 'title', 'type', 'updated'],
      searchOptions: {
        boost: { title: 3, content: 1 },
        fuzzy: 0.2,
        prefix: true
      }
    });
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
  }

  /**
   * Build the full search index from all notes
   * Indexes in batches to avoid blocking the UI
   */
  async buildIndex(
    notes: NoteMetadata[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (this._isIndexing) return;
    this._isIndexing = true;
    this._indexProgress = { current: 0, total: notes.length };

    try {
      // Filter out archived notes
      const activeNotes = notes.filter((n) => !n.archived);
      this._indexProgress.total = activeNotes.length;

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
    }
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.miniSearch.removeAll();
    this.indexedNoteIds.clear();
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
