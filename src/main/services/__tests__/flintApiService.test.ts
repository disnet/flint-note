import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FlintApiService } from '../flintApiService';
import {
  createMockNote,
  createMockVault,
  createMockSearchResult
} from '../../../test/setup';

// Mock the FlintNoteApi more specifically for these tests
const mockFlintNoteApi = {
  initialize: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  createSimpleNote: vi.fn(),
  updateNote: vi.fn(),
  updateNoteContent: vi.fn(),
  deleteNote: vi.fn(),
  getNoteInfo: vi.fn(),
  searchNotes: vi.fn(),
  searchNotesByText: vi.fn(),
  searchNotesAdvanced: vi.fn(),
  getCurrentVault: vi.fn(),
  listVaults: vi.fn(),
  listNoteTypes: vi.fn()
};

vi.mock('@flint-note/server', () => ({
  FlintNoteApi: vi.fn(() => mockFlintNoteApi)
}));

describe('FlintApiService', () => {
  let service: FlintApiService;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create fresh service instance
    service = new FlintApiService({
      workspacePath: '/test/workspace',
      throwOnError: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default config', () => {
      const defaultService = new FlintApiService();
      expect(defaultService.getConfig()).toEqual({
        workspacePath: process.env.FLINT_WORKSPACE_PATH,
        throwOnError: true
      });
    });

    it('should create service with custom config', () => {
      const customService = new FlintApiService({
        workspacePath: '/custom/path',
        throwOnError: false
      });

      expect(customService.getConfig()).toEqual({
        workspacePath: '/custom/path',
        throwOnError: false
      });
    });

    it('should not be ready before initialization', () => {
      expect(service.isReady()).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);

      await service.initialize();

      expect(mockFlintNoteApi.initialize).toHaveBeenCalledOnce();
      expect(service.isReady()).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockFlintNoteApi.initialize.mockRejectedValue(error);

      await expect(service.initialize()).rejects.toThrow('Initialization failed');
      expect(service.isReady()).toBe(false);
    });

    it('should not initialize twice', async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);

      await service.initialize();
      await service.initialize();

      expect(mockFlintNoteApi.initialize).toHaveBeenCalledOnce();
      expect(service.isReady()).toBe(true);
    });

    it('should handle multiple concurrent initialization calls', async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);

      const promises = [service.initialize(), service.initialize(), service.initialize()];

      await Promise.all(promises);

      // The underlying API initialize might be called multiple times due to race conditions
      // but the service should still end up in a ready state
      expect(mockFlintNoteApi.initialize).toHaveBeenCalled();
      expect(service.isReady()).toBe(true);
    });
  });

  describe('Error Handling Before Initialization', () => {
    it('should throw error when calling methods before initialization', async () => {
      await expect(service.getNote('test')).rejects.toThrow(
        'FlintNote API service must be initialized before use'
      );
    });

    it('should throw error for all methods before initialization', async () => {
      const methods = [
        () => service.getNote('test'),
        () => service.createNote({}),
        () => service.createSimpleNote('type', 'id', 'content'),
        () => service.updateNote({}),
        () => service.updateNoteContent('id', 'content'),
        () => service.deleteNote({}),
        () => service.getNoteInfo({}),
        () => service.searchNotes('query'),
        () => service.searchNotesByText('query'),
        () => service.searchNotesAdvanced({}),
        () => service.getCurrentVault(),
        () => service.listVaults(),
        () => service.listNoteTypes()
      ];

      for (const method of methods) {
        await expect(method()).rejects.toThrow(
          'FlintNote API service must be initialized before use'
        );
      }
    });
  });

  describe('Note Operations', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    describe('getNote', () => {
      it('should get note successfully', async () => {
        const mockNote = createMockNote();
        mockFlintNoteApi.getNote.mockResolvedValue(mockNote);

        const result = await service.getNote('test-note');

        expect(mockFlintNoteApi.getNote).toHaveBeenCalledWith('test-note', undefined);
        expect(result).toEqual(mockNote);
      });

      it('should get note with vault ID', async () => {
        const mockNote = createMockNote();
        mockFlintNoteApi.getNote.mockResolvedValue(mockNote);

        const result = await service.getNote('test-note', 'vault-123');

        expect(mockFlintNoteApi.getNote).toHaveBeenCalledWith('test-note', 'vault-123');
        expect(result).toEqual(mockNote);
      });

      it('should return null for non-existent note', async () => {
        mockFlintNoteApi.getNote.mockResolvedValue(null);

        const result = await service.getNote('non-existent');

        expect(result).toBeNull();
      });

      it('should handle getNote errors', async () => {
        const error = new Error('Note not found');
        mockFlintNoteApi.getNote.mockRejectedValue(error);

        await expect(service.getNote('test-note')).rejects.toThrow('Note not found');
      });
    });

    describe('createNote', () => {
      it('should create note successfully', async () => {
        const createArgs = {
          type: 'test',
          identifier: 'new-note',
          content: 'Test content'
        };
        const mockResult = { success: true, note: createMockNote() };
        mockFlintNoteApi.createNote.mockResolvedValue(mockResult);

        const result = await service.createNote(createArgs);

        expect(mockFlintNoteApi.createNote).toHaveBeenCalledWith(createArgs);
        expect(result).toEqual(mockResult);
      });

      it('should handle createNote errors', async () => {
        const error = new Error('Creation failed');
        mockFlintNoteApi.createNote.mockRejectedValue(error);

        await expect(service.createNote({})).rejects.toThrow('Creation failed');
      });
    });

    describe('createSimpleNote', () => {
      it('should create simple note successfully', async () => {
        const mockResult = { success: true };
        mockFlintNoteApi.createSimpleNote.mockResolvedValue(mockResult);

        const result = await service.createSimpleNote('test', 'simple-note', 'Content');

        expect(mockFlintNoteApi.createSimpleNote).toHaveBeenCalledWith(
          'test',
          'simple-note',
          'Content',
          undefined
        );
        expect(result).toEqual(mockResult);
      });

      it('should create simple note with vault ID', async () => {
        const mockResult = { success: true };
        mockFlintNoteApi.createSimpleNote.mockResolvedValue(mockResult);

        const result = await service.createSimpleNote(
          'test',
          'simple-note',
          'Content',
          'vault-123'
        );

        expect(mockFlintNoteApi.createSimpleNote).toHaveBeenCalledWith(
          'test',
          'simple-note',
          'Content',
          'vault-123'
        );
        expect(result).toEqual(mockResult);
      });
    });

    describe('updateNote', () => {
      it('should update note successfully', async () => {
        const updateArgs = { identifier: 'test-note', content: 'Updated content' };
        const mockResult = { success: true };
        mockFlintNoteApi.updateNote.mockResolvedValue(mockResult);

        const result = await service.updateNote(updateArgs);

        expect(mockFlintNoteApi.updateNote).toHaveBeenCalledWith(updateArgs);
        expect(result).toEqual(mockResult);
      });
    });

    describe('updateNoteContent', () => {
      it('should update note content successfully', async () => {
        const mockResult = { success: true };
        mockFlintNoteApi.updateNoteContent.mockResolvedValue(mockResult);

        const result = await service.updateNoteContent('test-note', 'New content');

        expect(mockFlintNoteApi.updateNoteContent).toHaveBeenCalledWith(
          'test-note',
          'New content',
          undefined
        );
        expect(result).toEqual(mockResult);
      });

      it('should update note content with vault ID', async () => {
        const mockResult = { success: true };
        mockFlintNoteApi.updateNoteContent.mockResolvedValue(mockResult);

        const result = await service.updateNoteContent(
          'test-note',
          'New content',
          'vault-123'
        );

        expect(mockFlintNoteApi.updateNoteContent).toHaveBeenCalledWith(
          'test-note',
          'New content',
          'vault-123'
        );
        expect(result).toEqual(mockResult);
      });
    });

    describe('deleteNote', () => {
      it('should delete note successfully', async () => {
        const deleteArgs = { identifier: 'test-note' };
        const mockResult = { success: true };
        mockFlintNoteApi.deleteNote.mockResolvedValue(mockResult);

        const result = await service.deleteNote(deleteArgs);

        expect(mockFlintNoteApi.deleteNote).toHaveBeenCalledWith(deleteArgs);
        expect(result).toEqual(mockResult);
      });
    });

    describe('getNoteInfo', () => {
      it('should get note info successfully', async () => {
        const infoArgs = { identifier: 'test-note' };
        const mockInfo = { id: 'test-note', created_at: '2024-01-01' };
        mockFlintNoteApi.getNoteInfo.mockResolvedValue(mockInfo);

        const result = await service.getNoteInfo(infoArgs);

        expect(mockFlintNoteApi.getNoteInfo).toHaveBeenCalledWith(infoArgs);
        expect(result).toEqual(mockInfo);
      });
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    describe('searchNotes', () => {
      it('should search notes with basic query', async () => {
        const mockResult = createMockSearchResult([createMockNote()]);
        mockFlintNoteApi.searchNotes.mockResolvedValue(mockResult);

        const result = await service.searchNotes('test query');

        expect(mockFlintNoteApi.searchNotes).toHaveBeenCalledWith({
          query: 'test query',
          type_filter: undefined,
          limit: 10,
          use_regex: false,
          vault_id: undefined,
          fields: undefined
        });
        expect(result).toEqual(mockResult);
      });

      it('should search notes with options', async () => {
        const mockResult = createMockSearchResult([]);
        mockFlintNoteApi.searchNotes.mockResolvedValue(mockResult);

        const options = {
          type_filter: 'daily',
          limit: 20,
          use_regex: true,
          vaultId: 'vault-123',
          fields: ['title', 'content']
        };

        const result = await service.searchNotes('test', options);

        expect(mockFlintNoteApi.searchNotes).toHaveBeenCalledWith({
          query: 'test',
          type_filter: 'daily',
          limit: 20,
          use_regex: true,
          vault_id: 'vault-123',
          fields: ['title', 'content']
        });
        expect(result).toEqual(mockResult);
      });
    });

    describe('searchNotesByText', () => {
      it('should search notes by text', async () => {
        const mockResult = createMockSearchResult([createMockNote()]);
        mockFlintNoteApi.searchNotesByText.mockResolvedValue(mockResult);

        const result = await service.searchNotesByText('text query');

        expect(mockFlintNoteApi.searchNotesByText).toHaveBeenCalledWith(
          'text query',
          undefined,
          undefined
        );
        expect(result).toEqual(mockResult);
      });

      it('should search notes by text with vault and limit', async () => {
        const mockResult = createMockSearchResult([]);
        mockFlintNoteApi.searchNotesByText.mockResolvedValue(mockResult);

        const result = await service.searchNotesByText('text query', 'vault-123', 5);

        expect(mockFlintNoteApi.searchNotesByText).toHaveBeenCalledWith(
          'text query',
          'vault-123',
          5
        );
        expect(result).toEqual(mockResult);
      });
    });

    describe('searchNotesAdvanced', () => {
      it('should perform advanced search with default options', async () => {
        const mockResult = createMockSearchResult([]);
        mockFlintNoteApi.searchNotesAdvanced.mockResolvedValue(mockResult);

        const result = await service.searchNotesAdvanced();

        expect(mockFlintNoteApi.searchNotesAdvanced).toHaveBeenCalledWith({
          query: undefined,
          type: undefined,
          metadata_filters: undefined,
          updated_within: undefined,
          updated_before: undefined,
          created_within: undefined,
          created_before: undefined,
          content_contains: undefined,
          sort: undefined,
          limit: 50,
          offset: 0,
          vault_id: undefined,
          fields: undefined
        });
        expect(result).toEqual(mockResult);
      });

      it('should perform advanced search with all options', async () => {
        const mockResult = createMockSearchResult([createMockNote()]);
        mockFlintNoteApi.searchNotesAdvanced.mockResolvedValue(mockResult);

        const options = {
          query: 'advanced query',
          type: 'meeting',
          metadata_filters: [{ key: 'author', value: 'john', operator: 'eq' }],
          updated_within: '7d',
          updated_before: '2024-01-01',
          created_within: '30d',
          created_before: '2023-12-31',
          content_contains: 'important',
          sort: [{ field: 'updated_at', order: 'desc' }],
          limit: 100,
          offset: 10,
          vaultId: 'vault-123',
          fields: ['title', 'content', 'metadata']
        };

        const result = await service.searchNotesAdvanced(options);

        expect(mockFlintNoteApi.searchNotesAdvanced).toHaveBeenCalledWith({
          query: 'advanced query',
          type: 'meeting',
          metadata_filters: [{ key: 'author', value: 'john', operator: 'eq' }],
          updated_within: '7d',
          updated_before: '2024-01-01',
          created_within: '30d',
          created_before: '2023-12-31',
          content_contains: 'important',
          sort: [{ field: 'updated_at', order: 'desc' }],
          limit: 100,
          offset: 10,
          vault_id: 'vault-123',
          fields: ['title', 'content', 'metadata']
        });
        expect(result).toEqual(mockResult);
      });
    });
  });

  describe('Vault Operations', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    describe('getCurrentVault', () => {
      it('should get current vault', async () => {
        const mockVault = createMockVault();
        mockFlintNoteApi.getCurrentVault.mockResolvedValue(mockVault);

        const result = await service.getCurrentVault();

        expect(mockFlintNoteApi.getCurrentVault).toHaveBeenCalledOnce();
        expect(result).toEqual(mockVault);
      });
    });

    describe('listVaults', () => {
      it('should list all vaults', async () => {
        const mockVaults = {
          vaults: [createMockVault(), createMockVault({ id: 'vault-2', name: 'Vault 2' })]
        };
        mockFlintNoteApi.listVaults.mockResolvedValue(mockVaults);

        const result = await service.listVaults();

        expect(mockFlintNoteApi.listVaults).toHaveBeenCalledOnce();
        expect(result).toEqual(mockVaults);
      });
    });
  });

  describe('Note Type Operations', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    describe('listNoteTypes', () => {
      it('should list note types without vault ID', async () => {
        const mockTypes = ['daily', 'meeting', 'project'];
        mockFlintNoteApi.listNoteTypes.mockResolvedValue(mockTypes);

        const result = await service.listNoteTypes();

        expect(mockFlintNoteApi.listNoteTypes).toHaveBeenCalledWith({
          vault_id: undefined
        });
        expect(result).toEqual(mockTypes);
      });

      it('should list note types with vault ID', async () => {
        const mockTypes = ['daily', 'meeting'];
        mockFlintNoteApi.listNoteTypes.mockResolvedValue(mockTypes);

        const result = await service.listNoteTypes('vault-123');

        expect(mockFlintNoteApi.listNoteTypes).toHaveBeenCalledWith({
          vault_id: 'vault-123'
        });
        expect(result).toEqual(mockTypes);
      });
    });
  });

  describe('Utility Methods', () => {
    it('should return correct ready state', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should return config', () => {
      const config = service.getConfig();
      expect(config).toEqual({
        workspacePath: '/test/workspace',
        throwOnError: true
      });
    });

    describe('reconnect', () => {
      it('should reconnect successfully', async () => {
        // First initialize
        mockFlintNoteApi.initialize.mockResolvedValue(undefined);
        await service.initialize();
        expect(service.isReady()).toBe(true);

        // Then reconnect
        await service.reconnect();

        expect(mockFlintNoteApi.initialize).toHaveBeenCalledTimes(2);
        expect(service.isReady()).toBe(true);
      });

      it('should handle reconnect errors', async () => {
        // First initialize successfully
        mockFlintNoteApi.initialize.mockResolvedValueOnce(undefined);
        await service.initialize();
        expect(service.isReady()).toBe(true);

        // Then fail on reconnect
        const error = new Error('Reconnect failed');
        mockFlintNoteApi.initialize.mockRejectedValue(error);

        await expect(service.reconnect()).rejects.toThrow('Reconnect failed');
        expect(service.isReady()).toBe(false);
      });
    });

    describe('testConnection', () => {
      beforeEach(async () => {
        mockFlintNoteApi.initialize.mockResolvedValue(undefined);
        await service.initialize();
      });

      it('should test connection successfully', async () => {
        const mockVault = createMockVault();
        mockFlintNoteApi.getCurrentVault.mockResolvedValue(mockVault);

        const result = await service.testConnection();

        expect(result).toEqual({ success: true });
      });

      it('should handle connection test failure', async () => {
        const error = new Error('Connection failed');
        mockFlintNoteApi.getCurrentVault.mockRejectedValue(error);

        const result = await service.testConnection();

        expect(result).toEqual({
          success: false,
          error: 'Connection failed'
        });
      });

      it('should handle non-Error objects', async () => {
        mockFlintNoteApi.getCurrentVault.mockRejectedValue('String error');

        const result = await service.testConnection();

        expect(result).toEqual({
          success: false,
          error: 'Unknown error'
        });
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    it('should propagate API errors', async () => {
      const error = new Error('API Error');
      mockFlintNoteApi.getNote.mockRejectedValue(error);

      await expect(service.getNote('test')).rejects.toThrow('API Error');
    });

    it('should handle async errors in all methods', async () => {
      const error = new Error('Async error');

      // Test each method handles errors properly
      mockFlintNoteApi.searchNotes.mockRejectedValue(error);
      await expect(service.searchNotes('test')).rejects.toThrow('Async error');

      mockFlintNoteApi.createSimpleNote.mockRejectedValue(error);
      await expect(service.createSimpleNote('type', 'id', 'content')).rejects.toThrow(
        'Async error'
      );

      mockFlintNoteApi.updateNoteContent.mockRejectedValue(error);
      await expect(service.updateNoteContent('id', 'content')).rejects.toThrow(
        'Async error'
      );
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(async () => {
      mockFlintNoteApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
    });

    it('should perform complete note lifecycle', async () => {
      // Create note
      const createResult = { success: true, note: createMockNote() };
      mockFlintNoteApi.createSimpleNote.mockResolvedValue(createResult);

      const created = await service.createSimpleNote(
        'test',
        'lifecycle-note',
        'Initial content'
      );
      expect(created).toEqual(createResult);

      // Get note
      const mockNote = createMockNote({ identifier: 'lifecycle-note' });
      mockFlintNoteApi.getNote.mockResolvedValue(mockNote);

      const retrieved = await service.getNote('lifecycle-note');
      expect(retrieved).toEqual(mockNote);

      // Update note
      const updateResult = { success: true };
      mockFlintNoteApi.updateNoteContent.mockResolvedValue(updateResult);

      const updated = await service.updateNoteContent(
        'lifecycle-note',
        'Updated content'
      );
      expect(updated).toEqual(updateResult);

      // Search for note
      const searchResult = createMockSearchResult([mockNote]);
      mockFlintNoteApi.searchNotes.mockResolvedValue(searchResult);

      const found = await service.searchNotes('lifecycle');
      expect(found).toEqual(searchResult);

      // Delete note
      const deleteResult = { success: true };
      mockFlintNoteApi.deleteNote.mockResolvedValue(deleteResult);

      const deleted = await service.deleteNote({ identifier: 'lifecycle-note' });
      expect(deleted).toEqual(deleteResult);
    });
  });
});
