import { mcpClient } from './mcpClient';
import type { NoteType, NoteMetadata, Note } from '../types/chat';

export class NotesService {
  private noteTypesCache: NoteType[] | null = null;
  private notesCache: Map<string, NoteMetadata[]> = new Map();
  private noteContentCache: Map<string, Note> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clear cache when MCP status changes
    mcpClient.on('statusChanged', (status) => {
      if (status === 'disconnected' || status === 'error') {
        this.clearCache();
      }
    });
  }

  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  private setCacheExpiry(key: string): void {
    this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  }

  private clearCache(): void {
    this.noteTypesCache = null;
    this.notesCache.clear();
    this.noteContentCache.clear();
    this.cacheExpiry.clear();
  }

  async getNoteTypes(): Promise<NoteType[]> {
    // Check cache first
    if (this.noteTypesCache && this.isCacheValid('note-types')) {
      console.log('📁 NotesService: Returning cached note types:', this.noteTypesCache);
      return this.noteTypesCache;
    }

    try {
      console.log('📁 NotesService: Fetching note types from MCP resource...');
      const content = await mcpClient.readResource('flint-note://types');
      console.log('📁 NotesService: Raw content from flint-note://types:', content);

      if (content.text) {
        const rawData = JSON.parse(content.text);
        console.log('📁 NotesService: Raw parsed data:', rawData);

        // Check if this matches the expected NoteType structure
        if (Array.isArray(rawData)) {
          // Transform the data if needed - the API might return different field names
          const types = rawData.map((item) => {
            console.log('📁 NotesService: Processing item:', item);
            return {
              name: item.name || item.type,
              count: item.count || item.noteCount || 0,
              path: item.path,
              purpose: item.purpose,
              agentInstructions: item.agentInstructions,
              hasDescription: item.hasDescription,
              lastModified: item.lastModified
            };
          }) as NoteType[];

          console.log('📁 NotesService: Transformed note types:', types);
          this.noteTypesCache = types;
          this.setCacheExpiry('note-types');
          return types;
        } else {
          console.warn(
            '📁 NotesService: Expected array but got:',
            typeof rawData,
            rawData
          );
          return [];
        }
      } else {
        console.warn('📁 NotesService: No text content in response');
        return [];
      }
    } catch (error) {
      console.error('📁 NotesService: Error fetching note types:', error);
      return [];
    }
  }

  async getNotesByType(type: string, vaultId?: string): Promise<NoteMetadata[]> {
    const cacheKey = vaultId ? `${vaultId}:${type}` : type;

    // Check cache first
    if (this.notesCache.has(cacheKey) && this.isCacheValid(cacheKey)) {
      return this.notesCache.get(cacheKey)!;
    }

    try {
      const uri = vaultId
        ? `flint-note://notes/${vaultId}/${type}`
        : `flint-note://notes/${type}`;

      console.log(`📁 NotesService: Fetching notes from URI: ${uri}`);
      const content = await mcpClient.readResource(uri);
      console.log(`📁 NotesService: Raw content for ${type}:`, content);

      if (content.text) {
        const notes = JSON.parse(content.text) as NoteMetadata[];
        console.log(
          `📁 NotesService: Parsed ${notes.length} notes for type ${type}:`,
          notes
        );
        this.notesCache.set(cacheKey, notes);
        this.setCacheExpiry(cacheKey);
        return notes;
      } else {
        console.warn(`📁 NotesService: No text content for type ${type}`);
        return [];
      }
    } catch (error) {
      console.error(`📁 NotesService: Error fetching notes for type ${type}:`, error);
      return [];
    }
  }

  async getNote(type: string, filename: string, vaultId?: string): Promise<Note | null> {
    const cacheKey = vaultId ? `${vaultId}:${type}:${filename}` : `${type}:${filename}`;

    // Check cache first
    if (this.noteContentCache.has(cacheKey) && this.isCacheValid(cacheKey)) {
      return this.noteContentCache.get(cacheKey)!;
    }

    try {
      const uri = vaultId
        ? `flint-note://note/${vaultId}/${type}/${filename}`
        : `flint-note://note/${type}/${filename}`;

      const content = await mcpClient.readResource(uri);
      if (content.text) {
        const note = JSON.parse(content.text) as Note;
        this.noteContentCache.set(cacheKey, note);
        this.setCacheExpiry(cacheKey);
        return note;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching note ${type}/${filename}:`, error);
      return null;
    }
  }

  async getNotesWithTag(tag: string, vaultId?: string): Promise<NoteMetadata[]> {
    const cacheKey = vaultId ? `tag:${vaultId}:${tag}` : `tag:${tag}`;

    // Check cache first
    if (this.notesCache.has(cacheKey) && this.isCacheValid(cacheKey)) {
      return this.notesCache.get(cacheKey)!;
    }

    try {
      const uri = vaultId
        ? `flint-note://notes/tagged/${vaultId}/${tag}`
        : `flint-note://notes/tagged/${tag}`;

      const content = await mcpClient.readResource(uri);
      if (content.text) {
        const notes = JSON.parse(content.text) as NoteMetadata[];
        this.notesCache.set(cacheKey, notes);
        this.setCacheExpiry(cacheKey);
        return notes;
      }
      return [];
    } catch (error) {
      console.error(`Error fetching notes with tag ${tag}:`, error);
      return [];
    }
  }

  async getRecentNotes(): Promise<NoteMetadata[]> {
    const cacheKey = 'recent';

    // Check cache first
    if (this.notesCache.has(cacheKey) && this.isCacheValid(cacheKey)) {
      return this.notesCache.get(cacheKey)!;
    }

    try {
      const content = await mcpClient.readResource('flint-note://recent');
      if (content.text) {
        const notes = JSON.parse(content.text) as NoteMetadata[];
        this.notesCache.set(cacheKey, notes);
        this.setCacheExpiry(cacheKey);
        return notes;
      }
      return [];
    } catch (error) {
      console.error('Error fetching recent notes:', error);
      return [];
    }
  }

  async getIncomingLinks(
    type: string,
    filename: string,
    vaultId?: string
  ): Promise<string[]> {
    try {
      const uri = vaultId
        ? `flint-note://links/incoming/${vaultId}/${type}/${filename}`
        : `flint-note://links/incoming/${type}/${filename}`;

      const content = await mcpClient.readResource(uri);
      if (content.text) {
        return JSON.parse(content.text) as string[];
      }
      return [];
    } catch (error) {
      console.error(`Error fetching incoming links for ${type}/${filename}:`, error);
      return [];
    }
  }

  // Invalidate cache for specific items
  invalidateNoteTypeCache(): void {
    this.noteTypesCache = null;
    this.cacheExpiry.delete('note-types');
  }

  invalidateNotesCache(type?: string, vaultId?: string): void {
    if (type) {
      const cacheKey = vaultId ? `${vaultId}:${type}` : type;
      this.notesCache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
    } else {
      // Clear all notes cache
      this.notesCache.clear();
      // Keep only note-types in cache expiry
      for (const [key] of this.cacheExpiry) {
        if (key !== 'note-types') {
          this.cacheExpiry.delete(key);
        }
      }
    }
  }

  invalidateNoteCache(type: string, filename: string, vaultId?: string): void {
    const cacheKey = vaultId ? `${vaultId}:${type}:${filename}` : `${type}:${filename}`;
    this.noteContentCache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }

  // Refresh methods that force cache invalidation
  async refreshNoteTypes(): Promise<NoteType[]> {
    this.invalidateNoteTypeCache();
    return this.getNoteTypes();
  }

  async refreshNotesByType(type: string, vaultId?: string): Promise<NoteMetadata[]> {
    this.invalidateNotesCache(type, vaultId);
    return this.getNotesByType(type, vaultId);
  }

  async refreshNote(
    type: string,
    filename: string,
    vaultId?: string
  ): Promise<Note | null> {
    this.invalidateNoteCache(type, filename, vaultId);
    return this.getNote(type, filename, vaultId);
  }
}

// Export singleton instance
export const notesService = new NotesService();
