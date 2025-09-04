import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedEvaluateNoteCode } from '../../src/main/enhanced-evaluate-note-code';
import { NoteService } from '../../src/main/note-service';
import { TestApiSetup } from '../server/api/test-setup.js';

// Mock the logger to avoid console output in tests
vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn()
  }
}));

describe('EnhancedEvaluateNoteCode', () => {
  let evaluateNoteCode: EnhancedEvaluateNoteCode;
  let noteService: NoteService;
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    testVaultId = await testSetup.createTestVault('test-eval-vault');

    // Create a real note service that wraps the test API
    noteService = {
      getFlintNoteApi: () => testSetup.api,
      getCurrentVault: async () => ({ id: testVaultId, name: 'Test Vault', path: '' })
    } as any;

    evaluateNoteCode = new EnhancedEvaluateNoteCode(noteService);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with note service', () => {
      expect(evaluateNoteCode).toBeDefined();
    });

    it('should handle null note service', () => {
      const evaluator = new EnhancedEvaluateNoteCode(null);
      expect(evaluator).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return error when WASM evaluator is not available', async () => {
      const evaluator = new EnhancedEvaluateNoteCode(null);
      const result = await evaluator.execute({
        code: 'async function main() { return "test"; }'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Enhanced code evaluator not available');
      expect(result.message).toBe('Enhanced WASM code evaluator not initialized');
    });

    it('should handle vault resolution errors when no current vault', async () => {
      // Create a note service that returns null for current vault
      const noteServiceWithoutVault = {
        getFlintNoteApi: () => testSetup.api,
        getCurrentVault: async () => null
      } as any;
      const evaluatorWithoutVault = new EnhancedEvaluateNoteCode(noteServiceWithoutVault);

      const result = await evaluatorWithoutVault.execute({
        code: 'async function main() { return "test"; }'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No vault specified and no current vault available');
    });

    it('should handle unexpected errors during vault resolution', async () => {
      // Create a note service that throws an error
      const faultyNoteService = {
        getFlintNoteApi: () => testSetup.api,
        getCurrentVault: async () => {
          throw new Error('Database error');
        }
      } as any;
      const faultyEvaluator = new EnhancedEvaluateNoteCode(faultyNoteService);

      const result = await faultyEvaluator.execute({
        code: 'async function main() { return "test"; }'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.message).toBe('Failed to execute TypeScript code: Database error');
    });

    it('should use provided vault_id to skip resolution', async () => {
      // Use a custom vault ID - should work even if current vault resolution would fail
      const result = await evaluateNoteCode.execute(
        {
          code: 'async function main() { return "test"; }'
        },
        testVaultId
      );

      // Should successfully execute since we provided a valid vault ID
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe('test');
    });

    it('should handle code with invalid syntax', async () => {
      const result = await evaluateNoteCode.execute({
        code: 'invalid javascript syntax {'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toMatch(/TypeScript Error \[\d+\]:.*Unexpected/);
    });

    it('should handle code without main function', async () => {
      const result = await evaluateNoteCode.execute({
        code: 'const x = 42;'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toMatch(/Code execution failed: Runtime Error/);
    });

    it('should execute simple valid code successfully', async () => {
      const result = await evaluateNoteCode.execute({
        code: 'async function main() { return 42; }'
      });

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(42);
      expect(result.data?.executionTime).toBeGreaterThan(0);
      expect(result.message).toMatch(/Code executed successfully in \d+ms/);
    });

    it('should execute code with access to note API', async () => {
      // First create a test note in the vault
      await testSetup.api.createNote({
        type: 'general',
        vaultId: testVaultId,
        title: 'Test Note',
        content: 'This is test content'
      });

      // Now execute code that uses the notes API
      const result = await evaluateNoteCode.execute({
        code: `
          async function main() {
            const notesList = await notes.list();
            return notesList.length;
          }
        `
      });

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(1); // Should find the one note we created
      expect(result.data?.executionTime).toBeGreaterThan(0);
    });
  });
});
