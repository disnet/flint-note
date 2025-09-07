/**
 * Tests for WASMCodeEvaluator - Phase 1: Basic note retrieval functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import { WASMCodeEvaluator } from '../../../src/server/api/wasm-code-evaluator.js';

describe('WASMCodeEvaluator - Phase 1', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let evaluator: WASMCodeEvaluator;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    testVaultId = await testSetup.createTestVault('test-wasm-vault');

    // Initialize the WASM evaluator with the API instance
    evaluator = new WASMCodeEvaluator(testSetup.api);
    await evaluator.initialize();
  });

  afterEach(async () => {
    evaluator.dispose();
    await testSetup.cleanup();
  });

  describe('Basic Code Execution', () => {
    it('should execute simple JavaScript code', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return "Hello, WASM!";
          }
        `,
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello, WASM!');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle arithmetic operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return 2 + 3 * 4;
          }
        `,
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(14);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', async () => {
      const result = await evaluator.evaluate({
        code: 'return invalid syntax here;',
        vaultId: testVaultId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Syntax Error');
      expect(result.result).toBeUndefined();
    });

    it('should handle runtime errors', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            throw new Error("Test runtime error");
          }
        `,
        vaultId: testVaultId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test runtime error');
    });

    it('should handle timeout limits', async () => {
      const result = await evaluator.evaluate({
        code: `
          while (true) {
            // Infinite loop to test timeout
          }
        `,
        vaultId: testVaultId,
        timeout: 100 // 100ms timeout
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Notes API Integration', () => {
    it('should retrieve real notes through async API calls', async () => {
      // First create a test note
      const noteOptions = {
        type: 'general',
        title: 'WASM Async Test Note',
        content: 'This note will be retrieved via async WASM calls.',
        vaultId: testVaultId
      };
      const createdNote = await testSetup.api.createNote(noteOptions);

      // Now test retrieval through WASM with async API
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            const note = await flintApi.getNote("${createdNote.id}");
            return {
              found: note !== null,
              id: note?.id,
              title: note?.title,
              content: note?.content,
              type: note?.type
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['flintApi.getNote']
      });

      if (!result.success) {
        console.log('Test failed with error:', result.error);
        console.log('Error details:', result.errorDetails);
      }
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        found: true,
        id: createdNote.id,
        title: 'WASM Async Test Note',
        content: 'This note will be retrieved via async WASM calls.',
        type: 'general'
      });
    });

    it('should handle multiple concurrent async API calls', async () => {
      // Create multiple test notes
      const noteOptions1 = {
        type: 'general',
        title: 'Async Note 1',
        content: 'Content 1',
        vaultId: testVaultId
      };
      const noteOptions2 = {
        type: 'general',
        title: 'Async Note 2',
        content: 'Content 2',
        vaultId: testVaultId
      };

      const [note1, note2] = await Promise.all([
        testSetup.api.createNote(noteOptions1),
        testSetup.api.createNote(noteOptions2)
      ]);

      // Test multiple concurrent API calls in WASM
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Make multiple concurrent API calls
            const [note1, note2] = await Promise.all([
              flintApi.getNote("${note1.id}"),
              flintApi.getNote("${note2.id}")
            ]);

            return {
              note1: {
                title: note1?.title,
                content: note1?.content
              },
              note2: {
                title: note2?.title,
                content: note2?.content
              }
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['flintApi.getNote']
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        note1: {
          title: 'Async Note 1',
          content: 'Content 1'
        },
        note2: {
          title: 'Async Note 2',
          content: 'Content 2'
        }
      });
    });
  });

  describe('Utility Functions', () => {
    it('should provide utility functions', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return {
              formattedDate: utils.formatDate("2024-01-15T10:30:00Z"),
              generatedId: typeof utils.generateId(),
              sanitizedTitle: utils.sanitizeTitle("Test Title with @#$ chars"),
              links: utils.parseLinks("Content with [[link1]] and [[link2]]")
            };
          }
        `,
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.formattedDate).toMatch(/2024-01-15T10:30:00.000Z/);
      expect(resultObj.generatedId).toBe('string');
      expect(resultObj.sanitizedTitle).toBe('Test Title with  chars');
      expect(resultObj.links).toEqual(['link1', 'link2']);
    });
  });

  describe('Security Features', () => {
    it('should block access to restricted APIs by default', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Should not have access to flintApi.getNote without explicit permission
            return typeof flintApi.getNote;
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [] // Explicitly empty allowed APIs to block access
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('object'); // null is typeof 'object'
    });

    it('should block dangerous globals', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return {
              fetch: typeof fetch,
              require: typeof require,
              process: typeof process,
              global: typeof global,
              globalThis: typeof globalThis
            };
          }
        `,
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.fetch).toBe('undefined');
      expect(resultObj.require).toBe('undefined');
      expect(resultObj.process).toBe('undefined');
      expect(resultObj.global).toBe('undefined');
      expect(resultObj.globalThis).toBe('undefined');
    });

    it('should honor API whitelisting', async () => {
      // Create a note first
      const noteOptions = {
        type: 'general',
        title: 'Security Test Note',
        content: 'This is for security testing.',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Test with whitelisted API
      const allowedResult = await evaluator.evaluate({
        code: `
          async function main() {
            const note = await flintApi.getNote("${createdNote.id}");
            return note !== null;
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['flintApi.getNote']
      });

      expect(allowedResult.success).toBe(true);
      expect(allowedResult.result).toBe(true);

      // Test without whitelisted API
      const blockedResult = await evaluator.evaluate({
        code: `
        async function main() {
          return flintApi.getNote("${createdNote.id}").then(note => note !== null);
        }
        `,
        vaultId: testVaultId,
        allowedAPIs: [] // Explicitly empty allowed APIs
      });

      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('not a function');
    });
  });

  describe('Context Variables', () => {
    it('should inject custom context variables', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return {
              hasCustomVar: typeof customVar !== 'undefined',
              customValue: customVar,
              hasAnotherVar: typeof anotherVar !== 'undefined',
              anotherValue: anotherVar
            };
          }
        `,
        vaultId: testVaultId,
        context: {
          customVar: 'test value',
          anotherVar: { nested: 'object' }
        }
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.hasCustomVar).toBe(true);
      expect(resultObj.customValue).toBe('test value');
      expect(resultObj.hasAnotherVar).toBe(true);
      expect(resultObj.anotherValue).toEqual({ nested: 'object' });
    });
  });
});
