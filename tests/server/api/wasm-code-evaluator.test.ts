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
        code: 'return "Hello, WASM!";',
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello, WASM!');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle arithmetic operations', async () => {
      const result = await evaluator.evaluate({
        code: 'return 2 + 3 * 4;',
        vaultId: testVaultId
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(14);
    });

    // it('should support async code execution', async () => {
    //   const result = await evaluator.evaluate({
    //     code: `
    //       await new Promise(resolve => setTimeout(resolve, 10));
    //       return "async result";
    //     `,
    //     vaultId: testVaultId
    //   });

    //   expect(result.success).toBe(true);
    //   expect(result.result).toBe('async result');
    // });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', async () => {
      const result = await evaluator.evaluate({
        code: 'return invalid syntax here;',
        vaultId: testVaultId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('error');
      expect(result.result).toBeUndefined();
    });

    it('should handle runtime errors', async () => {
      const result = await evaluator.evaluate({
        code: 'throw new Error("Test runtime error");',
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

  // describe('Notes API Integration', () => {
  //   it('should allow note retrieval through notes.get', async () => {
  //     // First create a test note
  //     const noteOptions = {
  //       type: 'general',
  //       title: 'WASM Test Note',
  //       content: 'This note will be retrieved via WASM.',
  //       vaultId: testVaultId
  //     };

  //     const createdNote = await testSetup.api.createNote(noteOptions);

  //     // Now test retrieval through WASM
  //     const result = await evaluator.evaluate({
  //       code: `
  //         const note = await notes.get("${createdNote.id}");
  //         return {
  //           found: note !== null,
  //           title: note?.title,
  //           content: note?.content,
  //           type: note?.type
  //         };
  //       `,
  //       vaultId: testVaultId,
  //       allowedAPIs: ['notes.get']
  //     });

  //     expect(result.success).toBe(true);
  //     expect(result.result).toEqual({
  //       found: true,
  //       title: 'WASM Test Note',
  //       content: 'This note will be retrieved via WASM.',
  //       type: 'general'
  //     });
  //   });

  //   it('should return null for non-existent notes', async () => {
  //     const result = await evaluator.evaluate({
  //       code: `
  //         const note = await notes.get("non-existent-note-id");
  //         return { found: note !== null, note: note };
  //       `,
  //       vaultId: testVaultId,
  //       allowedAPIs: ['notes.get']
  //     });

  //     expect(result.success).toBe(true);
  //     expect(result.result).toEqual({
  //       found: false,
  //       note: null
  //     });
  //   });

  //   it('should handle note retrieval errors gracefully', async () => {
  //     const result = await evaluator.evaluate({
  //       code: `
  //         try {
  //           const note = await notes.get("");
  //           return { success: true, note };
  //         } catch (error) {
  //           return { success: false, error: error.message };
  //         }
  //       `,
  //       vaultId: testVaultId,
  //       allowedAPIs: ['notes.get']
  //     });

  //     expect(result.success).toBe(true);
  //     expect(result.result).toHaveProperty('success', false);
  //     expect(result.result).toHaveProperty('error');
  //   });
  // });

  describe('Utility Functions', () => {
    it('should provide utility functions', async () => {
      const result = await evaluator.evaluate({
        code: `return {
          formattedDate: utils.formatDate("2024-01-15T10:30:00Z"),
          generatedId: typeof utils.generateId(),
          sanitizedTitle: utils.sanitizeTitle("Test Title with @#$ chars"),
          links: utils.parseLinks("Content with [[link1]] and [[link2]]")
        };`,
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


  // describe('Security Features', () => {
  //   it('should block access to restricted APIs by default', async () => {
  //     const result = await evaluator.evaluate({
  //       code: `
  //         // Should not have access to notes.get without explicit permission
  //         return typeof notes.get;
  //       `,
  //       vaultId: testVaultId
  //       // No allowedAPIs specified, so notes.get should be null
  //     });

  //     expect(result.success).toBe(true);
  //     expect(result.result).toBe('object'); // null is typeof 'object'
  //   });

  //   it('should block dangerous globals', async () => {
  //     const result = await evaluator.evaluate({
  //       code: `
  //         return {
  //           fetch: typeof fetch,
  //           require: typeof require,
  //           process: typeof process,
  //           global: typeof global,
  //           globalThis: typeof globalThis
  //         };
  //       `,
  //       vaultId: testVaultId
  //     });

  //     expect(result.success).toBe(true);
  //     const resultObj = result.result as any;
  //     expect(resultObj.fetch).toBe('undefined');
  //     expect(resultObj.require).toBe('undefined');
  //     expect(resultObj.process).toBe('undefined');
  //     expect(resultObj.global).toBe('undefined');
  //     expect(resultObj.globalThis).toBe('undefined');
  //   });

  //   it('should honor API whitelisting', async () => {
  //     // Create a note first
  //     const noteOptions = {
  //       type: 'general',
  //       title: 'Security Test Note',
  //       content: 'This is for security testing.',
  //       vaultId: testVaultId
  //     };

  //     const createdNote = await testSetup.api.createNote(noteOptions);

  //     // Test with whitelisted API
  //     const allowedResult = await evaluator.evaluate({
  //       code: `
  //         const note = await notes.get("${createdNote.id}");
  //         return note !== null;
  //       `,
  //       vaultId: testVaultId,
  //       allowedAPIs: ['notes.get']
  //     });

  //     expect(allowedResult.success).toBe(true);
  //     expect(allowedResult.result).toBe(true);

  //     // Test without whitelisted API
  //     const blockedResult = await evaluator.evaluate({
  //       code: `
  //         const note = await notes.get("${createdNote.id}");
  //         return note !== null;
  //       `,
  //       vaultId: testVaultId,
  //       allowedAPIs: [] // Explicitly empty allowed APIs
  //     });

  //     expect(blockedResult.success).toBe(false);
  //     expect(blockedResult.error).toContain('error');
  //   });
  // });

  // describe('Context Variables', () => {
  //   it('should inject custom context variables', async () => {
  //     const result = await evaluator.evaluate({
  //       code: `
  //         return {
  //           hasCustomVar: typeof customVar !== 'undefined',
  //           customValue: customVar,
  //           hasAnotherVar: typeof anotherVar !== 'undefined',
  //           anotherValue: anotherVar
  //         };
  //       `,
  //       vaultId: testVaultId,
  //       context: {
  //         customVar: 'test value',
  //         anotherVar: { nested: 'object' }
  //       }
  //     });

  //     expect(result.success).toBe(true);
  //     const resultObj = result.result as any;
  //     expect(resultObj.hasCustomVar).toBe(true);
  //     expect(resultObj.customValue).toBe('test value');
  //     expect(resultObj.hasAnotherVar).toBe(true);
  //     expect(resultObj.anotherValue).toEqual({ nested: 'object' });
  //   });
  // });
});
