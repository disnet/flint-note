/**
 * Tests for SuggestionService
 *
 * Tests the core business logic for managing AI-generated note suggestions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SuggestionService } from '../../../src/server/core/suggestion-service.js';
import { Workspace } from '../../../src/server/core/workspace.js';
import { DatabaseManager } from '../../../src/server/database/schema.js';
import type { DatabaseConnection } from '../../../src/server/database/schema.js';
import type {
  NoteSuggestion,
  NoteTypeSuggestionConfig
} from '../../../src/server/types/index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('SuggestionService', () => {
  let workspace: Workspace;
  let dbManager: DatabaseManager;
  let db: DatabaseConnection;
  let suggestionService: SuggestionService;
  let testNoteId: string;
  let testVaultPath: string;
  let vaultId: string;

  // Helper to insert a test note
  async function insertTestNote(options: {
    id?: string;
    title: string;
    content: string;
    type?: string;
  }) {
    const id =
      options.id || `n-${Math.random().toString(16).substring(2, 10).padEnd(8, '0')}`;
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO notes (id, title, content, type, filename, path, created, updated, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        options.title,
        options.content,
        options.type || 'general',
        `${options.title.toLowerCase().replace(/\s+/g, '-')}.md`,
        '',
        now,
        now,
        'test-hash'
      ]
    );

    return { id, title: options.title, content: options.content };
  }

  // Helper to create a note type with suggestion config
  async function createNoteTypeWithConfig(
    typeName: string,
    config: NoteTypeSuggestionConfig
  ) {
    const id = `type-${typeName}`;
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO note_type_descriptions (id, vault_id, type_name, purpose, suggestions_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, vaultId, typeName, 'Test type', JSON.stringify(config), now, now]
    );
  }

  beforeEach(async () => {
    // Create temporary vault directory
    testVaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'suggestion-service-test-'));
    vaultId = testVaultPath; // Use vault path as ID

    // Create .flint-note directory
    await fs.mkdir(path.join(testVaultPath, '.flint-note'), { recursive: true });

    // Initialize workspace and database - this runs migrations
    dbManager = new DatabaseManager(testVaultPath);
    workspace = new Workspace(testVaultPath, dbManager);
    await workspace.initialize();

    suggestionService = new SuggestionService(dbManager);
    db = await dbManager.connect();

    // Create a test note
    const note = await insertTestNote({
      title: 'Test Note',
      content: 'This is a test note with some content.'
    });
    testNoteId = note.id;
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('getSuggestions', () => {
    it('should return empty array when no suggestions exist', async () => {
      // Enable suggestions for the note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test guidance'
      });

      const result = await suggestionService.getSuggestions(testNoteId);

      expect(result.suggestions).toEqual([]);
      expect(result.generated_at).toBeUndefined();
    });

    it('should return cached suggestions', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test guidance'
      });

      const testSuggestions: NoteSuggestion[] = [
        {
          id: 'sug-1',
          type: 'action',
          text: 'Add more details',
          priority: 'high'
        },
        {
          id: 'sug-2',
          type: 'link',
          text: 'Link to related note',
          priority: 'medium'
        }
      ];

      // Save suggestions
      await suggestionService.saveSuggestions(testNoteId, testSuggestions, 'test-model');

      // Retrieve suggestions
      const result = await suggestionService.getSuggestions(testNoteId);

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0]).toMatchObject({
        id: 'sug-1',
        type: 'action',
        text: 'Add more details'
      });
      expect(result.generated_at).toBeDefined();
      expect(result.model_version).toBe('test-model');
    });

    it('should filter out dismissed suggestions', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test guidance'
      });

      const testSuggestions: NoteSuggestion[] = [
        { id: 'sug-1', type: 'action', text: 'Suggestion 1' },
        { id: 'sug-2', type: 'action', text: 'Suggestion 2' },
        { id: 'sug-3', type: 'action', text: 'Suggestion 3' }
      ];

      await suggestionService.saveSuggestions(testNoteId, testSuggestions, 'test-model');

      // Dismiss one suggestion
      await suggestionService.dismissSuggestion(testNoteId, 'sug-2');

      // Retrieve suggestions
      const result = await suggestionService.getSuggestions(testNoteId);

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions.find((s) => s.id === 'sug-2')).toBeUndefined();
      expect(result.suggestions.map((s) => s.id)).toEqual(['sug-1', 'sug-3']);
    });

    it('should return empty when suggestions are disabled', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: false,
        prompt_guidance: 'Test guidance'
      });

      const result = await suggestionService.getSuggestions(testNoteId);

      expect(result.suggestions).toEqual([]);
    });
  });

  describe('saveSuggestions', () => {
    it('should save new suggestions', async () => {
      // Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      const testSuggestions: NoteSuggestion[] = [
        {
          id: 'sug-1',
          type: 'action',
          text: 'Add more content',
          priority: 'high',
          reasoning: 'The note is too brief'
        }
      ];

      const result = await suggestionService.saveSuggestions(
        testNoteId,
        testSuggestions,
        'gpt-4'
      );

      expect(result.suggestions).toHaveLength(1);
      expect(result.model_version).toBe('gpt-4');
      expect(result.generated_at).toBeDefined();

      // Verify it was saved
      const retrieved = await suggestionService.getSuggestions(testNoteId);
      expect(retrieved.suggestions).toHaveLength(1);
    });

    it('should update existing suggestions', async () => {
      // Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      // Save initial suggestions
      await suggestionService.saveSuggestions(
        testNoteId,
        [{ id: 'sug-1', type: 'action', text: 'Original' }],
        'model-1'
      );

      // Update with new suggestions
      const newSuggestions: NoteSuggestion[] = [
        { id: 'sug-2', type: 'link', text: 'Updated suggestion' }
      ];

      await suggestionService.saveSuggestions(testNoteId, newSuggestions, 'model-2');

      // Verify update
      const result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].id).toBe('sug-2');
      expect(result.model_version).toBe('model-2');
    });

    it('should clear dismissed IDs when saving new suggestions', async () => {
      // Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      // Save and dismiss
      await suggestionService.saveSuggestions(
        testNoteId,
        [
          { id: 'sug-1', type: 'action', text: 'First' },
          { id: 'sug-2', type: 'action', text: 'Second' }
        ],
        'model-1'
      );
      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');

      // Save new suggestions
      await suggestionService.saveSuggestions(
        testNoteId,
        [{ id: 'sug-3', type: 'action', text: 'Third' }],
        'model-1'
      );

      // All new suggestions should be visible (dismissals cleared)
      const result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].id).toBe('sug-3');
    });
  });

  describe('dismissSuggestion', () => {
    it('should dismiss a single suggestion', async () => {
      // Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      await suggestionService.saveSuggestions(
        testNoteId,
        [
          { id: 'sug-1', type: 'action', text: 'First' },
          { id: 'sug-2', type: 'action', text: 'Second' }
        ],
        'hash',
        'model'
      );

      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');

      const result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].id).toBe('sug-2');
    });

    it('should handle dismissing multiple suggestions', async () => {
      // Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      await suggestionService.saveSuggestions(
        testNoteId,
        [
          { id: 'sug-1', type: 'action', text: 'First' },
          { id: 'sug-2', type: 'action', text: 'Second' },
          { id: 'sug-3', type: 'action', text: 'Third' }
        ],
        'hash',
        'model'
      );

      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');
      await suggestionService.dismissSuggestion(testNoteId, 'sug-3');

      const result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].id).toBe('sug-2');
    });

    it('should not duplicate dismissed IDs', async () => {
      await suggestionService.saveSuggestions(
        testNoteId,
        [{ id: 'sug-1', type: 'action', text: 'First' }],
        'hash',
        'model'
      );

      // Dismiss same suggestion twice
      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');
      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');

      // Check database directly
      const record = await db.get<{ dismissed_ids: string }>(
        'SELECT dismissed_ids FROM note_suggestions WHERE note_id = ?',
        [testNoteId]
      );

      const dismissedIds = JSON.parse(record!.dismissed_ids);
      expect(dismissedIds).toEqual(['sug-1']);
    });
  });

  describe('clearSuggestions', () => {
    it('should clear all suggestions for a note', async () => {
      await suggestionService.saveSuggestions(
        testNoteId,
        [{ id: 'sug-1', type: 'action', text: 'Test' }],
        'hash',
        'model'
      );

      await suggestionService.clearSuggestions(testNoteId);

      const result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toEqual([]);
    });

    it('should handle clearing when no suggestions exist', async () => {
      await expect(suggestionService.clearSuggestions(testNoteId)).resolves.not.toThrow();
    });
  });

  describe('areSuggestionsEnabled', () => {
    it('should return true when enabled at type level', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      const enabled = await suggestionService.areSuggestionsEnabled(testNoteId);
      expect(enabled).toBe(true);
    });

    it('should return false when disabled at type level', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: false,
        prompt_guidance: 'Test'
      });

      const enabled = await suggestionService.areSuggestionsEnabled(testNoteId);
      expect(enabled).toBe(false);
    });

    it('should return false when no config exists', async () => {
      const enabled = await suggestionService.areSuggestionsEnabled(testNoteId);
      expect(enabled).toBe(false);
    });

    it('should respect per-note override', async () => {
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Test'
      });

      // Add per-note override
      await db.run(
        `INSERT INTO note_metadata (note_id, key, value, value_type)
         VALUES (?, '_suggestions_disabled', 'true', 'string')`,
        [testNoteId]
      );

      const enabled = await suggestionService.areSuggestionsEnabled(testNoteId);
      expect(enabled).toBe(false);
    });
  });

  describe('shouldRegenerate', () => {
    it('should return true when no suggestions exist', async () => {
      const should = await suggestionService.shouldRegenerate(testNoteId);
      expect(should).toBe(true);
    });

    it('should return false when suggestions exist', async () => {
      await suggestionService.saveSuggestions(
        testNoteId,
        [{ id: 'sug-1', type: 'action', text: 'Test' }],
        'hash',
        'model'
      );

      const should = await suggestionService.shouldRegenerate(testNoteId);
      expect(should).toBe(false);
    });
  });

  describe('updateNoteTypeSuggestionConfig', () => {
    it('should update note type configuration', async () => {
      // Create initial config
      await createNoteTypeWithConfig('general', {
        enabled: false,
        prompt_guidance: 'Old guidance'
      });

      // Update config
      const newConfig: NoteTypeSuggestionConfig = {
        enabled: true,
        prompt_guidance: 'New guidance',
        suggestion_types: ['action', 'link']
      };

      await suggestionService.updateNoteTypeSuggestionConfig('general', newConfig);

      // Verify update
      const record = await db.get<{ suggestions_config: string }>(
        'SELECT suggestions_config FROM note_type_descriptions WHERE type_name = ?',
        ['general']
      );

      const savedConfig = JSON.parse(record!.suggestions_config);
      expect(savedConfig).toMatchObject(newConfig);
    });
  });

  describe('getNoteForSuggestions', () => {
    it('should return note data for generation', async () => {
      const result = await suggestionService.getNoteForSuggestions(testNoteId);

      expect(result).toBeDefined();
      expect(result?.content).toBe('This is a test note with some content.');
      expect(result?.type).toBe('general');
    });

    it('should return null for non-existent note', async () => {
      const result = await suggestionService.getNoteForSuggestions('n-nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete suggestion workflow', async () => {
      // 1. Enable suggestions for note type
      await createNoteTypeWithConfig('general', {
        enabled: true,
        prompt_guidance: 'Suggest improvements'
      });

      // 2. Check if enabled
      const enabled = await suggestionService.areSuggestionsEnabled(testNoteId);
      expect(enabled).toBe(true);

      // 3. Check if should generate (first time)
      const shouldGen = await suggestionService.shouldRegenerate(testNoteId);
      expect(shouldGen).toBe(true);

      // 4. Save initial suggestions
      await suggestionService.saveSuggestions(
        testNoteId,
        [
          { id: 'sug-1', type: 'action', text: 'First' },
          { id: 'sug-2', type: 'link', text: 'Second' }
        ],
        'hash-1',
        'model-1'
      );

      // 5. Retrieve and verify
      let result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(2);

      // 6. Dismiss one
      await suggestionService.dismissSuggestion(testNoteId, 'sug-1');

      // 7. Verify dismissal
      result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].id).toBe('sug-2');

      // 8. Check should not regenerate (suggestions exist)
      const shouldRegenNow = await suggestionService.shouldRegenerate(testNoteId);
      expect(shouldRegenNow).toBe(false);

      // 9. Clear suggestions
      await suggestionService.clearSuggestions(testNoteId);

      // 10. Verify cleared
      result = await suggestionService.getSuggestions(testNoteId);
      expect(result.suggestions).toEqual([]);
    });
  });
});
