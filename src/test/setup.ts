// Test setup file for Vitest
import { vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.FLINT_WORKSPACE_PATH = '/tmp/flint-test-workspace';

// Global test utilities
global.console = {
  ...console,
  // Suppress logs during tests unless explicitly needed
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock Electron APIs that might be imported
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-app-data'),
    getName: vi.fn(() => 'flint-electron-test'),
    getVersion: vi.fn(() => '1.0.0-test')
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  },
  BrowserWindow: vi.fn()
}));

// Mock @flint-note/server by default
vi.mock('@flint-note/server', () => ({
  FlintNoteApi: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getNote: vi.fn().mockResolvedValue(null),
    createNote: vi.fn().mockResolvedValue({ success: true }),
    createSimpleNote: vi.fn().mockResolvedValue({ success: true }),
    updateNote: vi.fn().mockResolvedValue({ success: true }),
    updateNoteContent: vi.fn().mockResolvedValue({ success: true }),
    deleteNote: vi.fn().mockResolvedValue({ success: true }),
    getNoteInfo: vi.fn().mockResolvedValue({}),
    searchNotes: vi.fn().mockResolvedValue({ notes: [] }),
    searchNotesByText: vi.fn().mockResolvedValue({ notes: [] }),
    searchNotesAdvanced: vi.fn().mockResolvedValue({ notes: [] }),
    getCurrentVault: vi.fn().mockResolvedValue({ name: 'test-vault', id: 'test' }),
    listVaults: vi.fn().mockResolvedValue({ vaults: [] }),
    listNoteTypes: vi.fn().mockResolvedValue([])
  }))
}));

// Test utilities
export const createMockNote = (overrides = {}) => ({
  id: 'test-note-id',
  identifier: 'test-note',
  title: 'Test Note',
  content: '# Test Note\n\nThis is a test note.',
  type: 'test',
  vault_id: 'test-vault',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

export const createMockVault = (overrides = {}) => ({
  id: 'test-vault',
  name: 'Test Vault',
  path: '/tmp/test-vault',
  ...overrides
});

export const createMockSearchResult = (notes = []) => ({
  notes,
  total: notes.length,
  page: 1,
  per_page: 10
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
