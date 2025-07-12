import { vi } from 'vitest';
import { FlintApiService } from '../../main/services/flintApiService';

/**
 * Mock data generators for testing
 */
export const mockData = {
  note: (overrides = {}) => ({
    id: 'mock-note-id',
    identifier: 'mock-note',
    title: 'Mock Note',
    content: '# Mock Note\n\nThis is a mock note for testing.',
    type: 'test',
    vault_id: 'mock-vault',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    metadata: {},
    ...overrides
  }),

  vault: (overrides = {}) => ({
    id: 'mock-vault',
    name: 'Mock Vault',
    path: '/mock/vault/path',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides
  }),

  searchResult: (notes = [], overrides = {}) => ({
    notes,
    total: notes.length,
    page: 1,
    per_page: 10,
    has_more: false,
    ...overrides
  }),

  noteTypes: () => ['daily', 'meeting', 'project', 'idea', 'test'],

  error: (message = 'Mock error', code = 'MOCK_ERROR') => ({
    message,
    code,
    stack: 'Mock stack trace'
  })
};

/**
 * Create a mock FlintApiService instance with all methods mocked
 */
export function createMockFlintApiService(): FlintApiService {
  const mockService = {
    // Configuration and state
    isReady: vi.fn(() => true),
    getConfig: vi.fn(() => ({
      workspacePath: '/mock/workspace',
      throwOnError: true
    })),

    // Initialization
    initialize: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true }),

    // Note operations
    getNote: vi.fn().mockResolvedValue(mockData.note()),
    createNote: vi.fn().mockResolvedValue({ success: true, note: mockData.note() }),
    createSimpleNote: vi.fn().mockResolvedValue({ success: true }),
    updateNote: vi.fn().mockResolvedValue({ success: true }),
    updateNoteContent: vi.fn().mockResolvedValue({ success: true }),
    deleteNote: vi.fn().mockResolvedValue({ success: true }),
    getNoteInfo: vi.fn().mockResolvedValue({
      id: 'mock-note',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }),

    // Search operations
    searchNotes: vi.fn().mockResolvedValue(mockData.searchResult([mockData.note()])),
    searchNotesByText: vi.fn().mockResolvedValue(mockData.searchResult([mockData.note()])),
    searchNotesAdvanced: vi.fn().mockResolvedValue(mockData.searchResult([mockData.note()])),

    // Vault operations
    getCurrentVault: vi.fn().mockResolvedValue(mockData.vault()),
    listVaults: vi.fn().mockResolvedValue({ vaults: [mockData.vault()] }),

    // Note type operations
    listNoteTypes: vi.fn().mockResolvedValue(mockData.noteTypes())
  };

  return mockService as unknown as FlintApiService;
}

/**
 * Mock scenarios for different testing situations
 */
export const mockScenarios = {
  /**
   * Service that fails initialization
   */
  failedInitialization: () => {
    const service = createMockFlintApiService();
    service.initialize.mockRejectedValue(new Error('Initialization failed'));
    service.isReady.mockReturnValue(false);
    return service;
  },

  /**
   * Service with no notes
   */
  emptyVault: () => {
    const service = createMockFlintApiService();
    service.getNote.mockResolvedValue(null);
    service.searchNotes.mockResolvedValue(mockData.searchResult([]));
    service.searchNotesByText.mockResolvedValue(mockData.searchResult([]));
    service.searchNotesAdvanced.mockResolvedValue(mockData.searchResult([]));
    return service;
  },

  /**
   * Service with network/connection errors
   */
  connectionErrors: () => {
    const service = createMockFlintApiService();
    const error = new Error('Connection failed');

    service.testConnection.mockResolvedValue({ success: false, error: 'Connection failed' });
    service.getNote.mockRejectedValue(error);
    service.createNote.mockRejectedValue(error);
    service.updateNote.mockRejectedValue(error);
    service.searchNotes.mockRejectedValue(error);
    service.getCurrentVault.mockRejectedValue(error);

    return service;
  },

  /**
   * Service with slow responses (for timeout testing)
   */
  slowResponses: (delay = 5000) => {
    const service = createMockFlintApiService();

    const createSlowMock = (returnValue: any) =>
      vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(returnValue), delay))
      );

    service.getNote = createSlowMock(mockData.note());
    service.createNote = createSlowMock({ success: true });
    service.searchNotes = createSlowMock(mockData.searchResult([]));

    return service;
  },

  /**
   * Service with large datasets
   */
  largeDataset: (noteCount = 1000) => {
    const service = createMockFlintApiService();
    const notes = Array.from({ length: noteCount }, (_, i) =>
      mockData.note({
        id: `note-${i}`,
        identifier: `note-${i}`,
        title: `Note ${i}`
      })
    );

    service.searchNotes.mockResolvedValue(mockData.searchResult(notes));
    service.searchNotesAdvanced.mockResolvedValue(mockData.searchResult(notes));

    return service;
  },

  /**
   * Service with specific note content
   */
  withNotes: (notes: any[]) => {
    const service = createMockFlintApiService();

    // Mock getNote to return specific notes by identifier
    service.getNote.mockImplementation((identifier: string) => {
      const note = notes.find(n => n.identifier === identifier);
      return Promise.resolve(note || null);
    });

    service.searchNotes.mockResolvedValue(mockData.searchResult(notes));
    service.searchNotesAdvanced.mockResolvedValue(mockData.searchResult(notes));

    return service;
  }
};

/**
 * Helper to setup mock service for specific test scenarios
 */
export class FlintApiServiceMockBuilder {
  private service: FlintApiService;

  constructor() {
    this.service = createMockFlintApiService();
  }

  /**
   * Make the service return as not ready
   */
  notReady(): this {
    this.service.isReady.mockReturnValue(false);
    return this;
  }

  /**
   * Make initialization fail
   */
  failInitialization(error = new Error('Initialization failed')): this {
    this.service.initialize.mockRejectedValue(error);
    this.service.isReady.mockReturnValue(false);
    return this;
  }

  /**
   * Set up specific notes to be returned
   */
  withNotes(notes: any[]): this {
    this.service.getNote.mockImplementation((identifier: string) => {
      const note = notes.find(n => n.identifier === identifier);
      return Promise.resolve(note || null);
    });

    this.service.searchNotes.mockResolvedValue(mockData.searchResult(notes));
    return this;
  }

  /**
   * Make note operations fail
   */
  failNoteOperations(error = new Error('Note operation failed')): this {
    this.service.getNote.mockRejectedValue(error);
    this.service.createNote.mockRejectedValue(error);
    this.service.updateNote.mockRejectedValue(error);
    this.service.deleteNote.mockRejectedValue(error);
    return this;
  }

  /**
   * Make search operations return empty results
   */
  emptySearchResults(): this {
    const emptyResult = mockData.searchResult([]);
    this.service.searchNotes.mockResolvedValue(emptyResult);
    this.service.searchNotesByText.mockResolvedValue(emptyResult);
    this.service.searchNotesAdvanced.mockResolvedValue(emptyResult);
    return this;
  }

  /**
   * Set custom vault information
   */
  withVault(vault: any): this {
    this.service.getCurrentVault.mockResolvedValue(vault);
    this.service.listVaults.mockResolvedValue({ vaults: [vault] });
    return this;
  }

  /**
   * Set connection test result
   */
  connectionTest(success: boolean, error?: string): this {
    this.service.testConnection.mockResolvedValue({
      success,
      ...(error && { error })
    });
    return this;
  }

  /**
   * Build the configured mock service
   */
  build(): FlintApiService {
    return this.service;
  }
}

/**
 * Utility functions for test assertions
 */
export const testUtils = {
  /**
   * Wait for a promise to resolve or reject
   */
  waitFor: (fn: () => Promise<any>, timeout = 5000) => {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  },

  /**
   * Create a promise that resolves after a delay
   */
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Verify that a mock was called with specific arguments
   */
  expectCalled: (mockFn: any, ...expectedArgs: any[]) => {
    expect(mockFn).toHaveBeenCalledWith(...expectedArgs);
  },

  /**
   * Verify that a mock was called a specific number of times
   */
  expectCalledTimes: (mockFn: any, times: number) => {
    expect(mockFn).toHaveBeenCalledTimes(times);
  },

  /**
   * Reset all mocks in a service
   */
  resetServiceMocks: (service: FlintApiService) => {
    Object.values(service).forEach(method => {
      if (vi.isMockFunction(method)) {
        method.mockClear();
      }
    });
  }
};

/**
 * Common test data sets
 */
export const testDataSets = {
  sampleNotes: [
    mockData.note({
      identifier: 'daily-2024-01-01',
      title: 'Daily Note - Jan 1',
      type: 'daily',
      content: '# Daily Note\n\n## Tasks\n- Review project status\n- Plan next sprint'
    }),
    mockData.note({
      identifier: 'meeting-team-sync',
      title: 'Team Sync Meeting',
      type: 'meeting',
      content: '# Team Sync\n\n## Attendees\n- Alice\n- Bob\n\n## Discussion\n- Project updates'
    }),
    mockData.note({
      identifier: 'project-alpha',
      title: 'Project Alpha',
      type: 'project',
      content: '# Project Alpha\n\n## Overview\nNew feature development\n\n## Timeline\nQ1 2024'
    })
  ],

  sampleVaults: [
    mockData.vault({
      id: 'personal',
      name: 'Personal Vault',
      path: '/vaults/personal'
    }),
    mockData.vault({
      id: 'work',
      name: 'Work Vault',
      path: '/vaults/work'
    })
  ]
};

/**
 * Export the mock builder for easy use
 */
export const mockFlintApiService = () => new FlintApiServiceMockBuilder();
