/**
 * Suggestion Service
 *
 * Manages AI-generated suggestions for notes. Handles caching, generation,
 * and dismissal of suggestions based on note type configuration.
 */

import type { DatabaseManager, DatabaseConnection } from '../database/schema.js';
import type {
  NoteSuggestion,
  NoteSuggestionRecord,
  NoteTypeSuggestionConfig,
  GetSuggestionsResult,
  GenerateSuggestionsResult
} from '../types/index.js';

interface NoteTypeDescription {
  id: string;
  vault_id: string;
  type_name: string;
  purpose?: string;
  agent_instructions?: string;
  metadata_schema?: string;
  content_hash?: string;
  icon?: string;
  suggestions_config?: string;
  created_at: string;
  updated_at: string;
}

interface NoteRecord {
  id: string;
  content: string;
  content_hash: string;
  type: string;
}

/**
 * Service for managing note suggestions
 */
export class SuggestionService {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Get suggestions for a note (with caching)
   */
  async getSuggestions(noteId: string): Promise<GetSuggestionsResult> {
    const db = await this.dbManager.connect();

    try {
      // Check if suggestions are enabled for this note
      const enabled = await this.areSuggestionsEnabled(noteId, db);
      if (!enabled) {
        return { suggestions: [] };
      }

      // Get cached suggestions if available
      const cached = await db.get<NoteSuggestionRecord>(
        `SELECT id, note_id, suggestions, generated_at, model_version, dismissed_ids
         FROM note_suggestions
         WHERE note_id = ?`,
        [noteId]
      );

      if (!cached) {
        return { suggestions: [] };
      }

      // Parse suggestions and filter out dismissed ones
      const allSuggestions: NoteSuggestion[] = JSON.parse(cached.suggestions);
      const dismissedIds = cached.dismissed_ids ? JSON.parse(cached.dismissed_ids) : [];
      const suggestions = allSuggestions.filter((s) => !dismissedIds.includes(s.id));

      return {
        suggestions,
        generated_at: cached.generated_at,
        model_version: cached.model_version || undefined
      };
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      throw error;
    }
  }

  /**
   * Save generated suggestions for a note
   */
  async saveSuggestions(
    noteId: string,
    suggestions: NoteSuggestion[],
    modelVersion: string
  ): Promise<GenerateSuggestionsResult> {
    const db = await this.dbManager.connect();

    try {
      const now = new Date().toISOString();

      // Check if suggestions already exist
      const existing = await db.get<{ id: number }>(
        'SELECT id FROM note_suggestions WHERE note_id = ?',
        [noteId]
      );

      if (existing) {
        // Update existing suggestions
        await db.run(
          `UPDATE note_suggestions
           SET suggestions = ?, generated_at = ?, model_version = ?, dismissed_ids = NULL
           WHERE note_id = ?`,
          [JSON.stringify(suggestions), now, modelVersion, noteId]
        );
      } else {
        // Insert new suggestions
        await db.run(
          `INSERT INTO note_suggestions (note_id, suggestions, generated_at, model_version)
           VALUES (?, ?, ?, ?)`,
          [noteId, JSON.stringify(suggestions), now, modelVersion]
        );
      }

      return {
        suggestions,
        generated_at: now,
        model_version: modelVersion
      };
    } catch (error) {
      console.error('Failed to save suggestions:', error);
      throw error;
    }
  }

  /**
   * Check if suggestions should be regenerated
   * Note: Regeneration is now manual-only. This method just checks if suggestions exist.
   */
  async shouldRegenerate(noteId: string): Promise<boolean> {
    const db = await this.dbManager.connect();

    try {
      // Check if suggestions exist
      const cached = await db.get<{ id: number }>(
        'SELECT id FROM note_suggestions WHERE note_id = ?',
        [noteId]
      );

      // If no cache exists, user can generate
      return !cached;
    } catch (error) {
      console.error('Failed to check if suggestions exist:', error);
      return true;
    }
  }

  /**
   * Clear suggestions for a note
   */
  async clearSuggestions(noteId: string): Promise<void> {
    const db = await this.dbManager.connect();

    try {
      await db.run('DELETE FROM note_suggestions WHERE note_id = ?', [noteId]);
    } catch (error) {
      console.error('Failed to clear suggestions:', error);
      throw error;
    }
  }

  /**
   * Check if suggestions are enabled for a note
   * Checks both note type configuration and per-note override
   */
  async areSuggestionsEnabled(noteId: string, db?: DatabaseConnection): Promise<boolean> {
    const connection = db || (await this.dbManager.connect());

    try {
      // Get note type
      const note = await connection.get<{ type: string }>(
        'SELECT type FROM notes WHERE id = ?',
        [noteId]
      );

      if (!note) {
        return false;
      }

      // Check per-note override first
      const override = await connection.get<{ value: string }>(
        `SELECT value FROM note_metadata
         WHERE note_id = ? AND key = '_suggestions_disabled'`,
        [noteId]
      );

      if (override && override.value === 'true') {
        return false;
      }

      // Check note type configuration
      const config = await this.getNoteTypeSuggestionConfig(note.type, connection);
      return config?.enabled || false;
    } catch (error) {
      console.error('Failed to check if suggestions enabled:', error);
      return false;
    }
  }

  /**
   * Dismiss a specific suggestion
   */
  async dismissSuggestion(noteId: string, suggestionId: string): Promise<void> {
    const db = await this.dbManager.connect();

    try {
      // Get current dismissed IDs
      const record = await db.get<{ dismissed_ids: string | null }>(
        'SELECT dismissed_ids FROM note_suggestions WHERE note_id = ?',
        [noteId]
      );

      if (!record) {
        console.warn(`No suggestions found for note ${noteId}`);
        return;
      }

      const dismissedIds: string[] = record.dismissed_ids
        ? JSON.parse(record.dismissed_ids)
        : [];

      // Add the new dismissed ID if not already present
      if (!dismissedIds.includes(suggestionId)) {
        dismissedIds.push(suggestionId);
      }

      // Update the database
      await db.run('UPDATE note_suggestions SET dismissed_ids = ? WHERE note_id = ?', [
        JSON.stringify(dismissedIds),
        noteId
      ]);
    } catch (error) {
      console.error('Failed to dismiss suggestion:', error);
      throw error;
    }
  }

  /**
   * Get note type suggestion configuration
   */
  private async getNoteTypeSuggestionConfig(
    noteType: string,
    db: DatabaseConnection
  ): Promise<NoteTypeSuggestionConfig | null> {
    try {
      const typeDesc = await db.get<NoteTypeDescription>(
        'SELECT suggestions_config FROM note_type_descriptions WHERE type_name = ?',
        [noteType]
      );

      if (!typeDesc || !typeDesc.suggestions_config) {
        return null;
      }

      return JSON.parse(typeDesc.suggestions_config) as NoteTypeSuggestionConfig;
    } catch (error) {
      console.error('Failed to get note type suggestion config:', error);
      return null;
    }
  }

  /**
   * Update note type suggestion configuration
   */
  async updateNoteTypeSuggestionConfig(
    noteType: string,
    config: NoteTypeSuggestionConfig
  ): Promise<void> {
    const db = await this.dbManager.connect();

    try {
      await db.run(
        'UPDATE note_type_descriptions SET suggestions_config = ? WHERE type_name = ?',
        [JSON.stringify(config), noteType]
      );
    } catch (error) {
      console.error('Failed to update note type suggestion config:', error);
      throw error;
    }
  }

  /**
   * Get note content for suggestion generation
   */
  async getNoteForSuggestions(noteId: string): Promise<{
    content: string;
    type: string;
  } | null> {
    const db = await this.dbManager.connect();

    try {
      const note = await db.get<NoteRecord>(
        'SELECT id, content, type FROM notes WHERE id = ?',
        [noteId]
      );

      if (!note) {
        return null;
      }

      return {
        content: note.content || '',
        type: note.type
      };
    } catch (error) {
      console.error('Failed to get note for suggestions:', error);
      return null;
    }
  }
}
