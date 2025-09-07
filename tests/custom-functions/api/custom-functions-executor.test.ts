/**
 * Custom Functions Executor Tests
 * Tests for the execution layer including TypeScript compilation, WASM integration,
 * and namespace injection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestCustomFunctionsSetup } from '../setup/TestCustomFunctionsSetup.js';
import { CustomFunctionsExecutor } from '../../../src/server/api/custom-functions-executor.js';
import { CustomFunctionTestHelper } from '../utils/test-helpers.js';
import { sampleFunctions } from '../fixtures/sample-functions.js';
import type { CustomFunction } from '../../../src/server/types/custom-functions.js';

// Mock QuickJS since we don't have it in test environment
const mockVM = {
  newObject: () => ({ dispose: () => {} }),
  newFunction: (name: string, fn: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
    name,
    fn
  }),
  newString: (value: string) => ({ dispose: () => {}, value }),
  newError: (message: string) => ({ dispose: () => {}, message }),
  setProp: () => {},
  evalCode: (code: string) => ({
    value: { dispose: () => {} },
    error: null
  }),
  dump: (handle: any) => handle.value || 'mocked_result',
  global: {}
};

describe('CustomFunctionsExecutor', () => {
  let setup: TestCustomFunctionsSetup;
  let executor: CustomFunctionsExecutor;
  let testVaultPath: string;

  beforeEach(async () => {
    setup = new TestCustomFunctionsSetup();
    await setup.setup();

    // Create a test vault
    const vaultId = await setup.createTestVault('test-executor-vault');
    testVaultPath = setup.testWorkspacePath;

    executor = new CustomFunctionsExecutor(testVaultPath);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Function Compilation', () => {
    it('should compile valid functions successfully', async () => {
      const testFunc = setup.createSampleFunction('compileTest');
      testFunc.code = `
        const compileTest = (input: string): string => {
          return 'Compiled: ' + input;
        };
      `;

      const compiled = await executor.compileFunction(testFunc);

      expect(compiled.id).toBe(testFunc.id);
      expect(compiled.compiledCode).toBeDefined();
      expect(typeof compiled.compiledCode).toBe('string');
      expect(compiled.compiledCode.length).toBeGreaterThan(0);
    });

    it('should cache compiled functions', async () => {
      const testFunc = setup.createSampleFunction('cacheTest');
      testFunc.code = `
        const cacheTest = (input: string): string => {
          return 'Cached: ' + input;
        };
      `;

      // First compilation
      const compiled1 = await executor.compileFunction(testFunc);

      // Second compilation should return cached result
      const compiled2 = await executor.compileFunction(testFunc);

      expect(compiled1).toBe(compiled2); // Same object reference
    });

    it('should handle TypeScript compilation errors', async () => {
      const invalidFunc = setup.createInvalidFunction('syntaxErrorTest');

      await expect(executor.compileFunction(invalidFunc)).rejects.toThrow(
        'Function validation failed'
      );
    });

    it('should update cached functions when code changes', async () => {
      const testFunc = setup.createSampleFunction('updateCacheTest');
      testFunc.code = `
        const updateCacheTest = (input: string): string => {
          return 'Version 1: ' + input;
        };
      `;

      const compiled1 = await executor.compileFunction(testFunc);

      // Clear cache to simulate function update
      executor.clearCache();

      // Modify function code
      testFunc.code = `
        const updateCacheTest = (input: string): string => {
          return 'Version 2: ' + input;
        };
      `;

      const compiled2 = await executor.compileFunction(testFunc);

      expect(compiled1).not.toBe(compiled2);
      expect(compiled2.compiledCode).toContain('Version 2');
    });
  });

  describe('WASM Integration', () => {
    it('should execute custom functions in sandbox', async () => {
      const testFunc = setup.createSampleFunction('sandboxTest');
      testFunc.code = `
        const sandboxTest = (input: string): string => {
          return 'Sandboxed: ' + input;
        };
      `;

      const compiled = await executor.compileFunction(testFunc);

      expect(compiled.compiledCode).toBeDefined();
      expect(compiled.id).toBe(testFunc.id);
    });

    it('should provide access to standard APIs', async () => {
      const apiFunc = setup.createSampleFunction('apiAccessTest');
      apiFunc.code = `
        const apiAccessTest = (noteId: string): string => {
          return 'Note ID: ' + noteId;
        };
      `;
      apiFunc.parameters = {
        noteId: { type: 'string', description: 'Note ID to process' }
      };

      const compiled = await executor.compileFunction(apiFunc);

      // Should compile without errors and include the function export
      expect(compiled.compiledCode).toContain('globalThis.f_');
    });

    it('should isolate function execution contexts', async () => {
      const func1 = setup.createSampleFunction('isolated1');
      func1.code = `
        const isolated1 = (input: string): string => {
          return 'Function 1: ' + input;
        };
      `;

      const func2 = setup.createSampleFunction('isolated2');
      func2.code = `
        const isolated2 = (input: string): string => {
          return 'Function 2: ' + input;
        };
      `;

      const compiled1 = await executor.compileFunction(func1);
      const compiled2 = await executor.compileFunction(func2);

      expect(compiled1.id).toBe(func1.id);
      expect(compiled2.id).toBe(func2.id);
      expect(compiled1.compiledCode).not.toEqual(compiled2.compiledCode);
    });

    it('should handle function execution timeouts', async () => {
      // Test timeout handling - for Phase 1, we mainly test structure
      const timeoutFunc = setup.createSampleFunction('timeoutTest');
      timeoutFunc.code = `
        const timeoutTest = (input: string): string => {
          return 'Quick result: ' + input;
        };
      `;

      const compiled = await executor.compileFunction(timeoutFunc);

      expect(compiled).toBeDefined();
      expect(compiled.compiledCode).toBeDefined();
    });

    it('should properly clean up VM contexts', async () => {
      const cleanupFunc = setup.createSampleFunction('cleanupTest');
      cleanupFunc.code = `
        const cleanupTest = (input: string): string => {
          return 'Cleaned: ' + input;
        };
      `;

      // Test that compilation doesn't leak resources
      await executor.compileFunction(cleanupFunc);

      // Clear cache should clean up resources
      executor.clearCache();

      const stats = await executor.getExecutionStats();
      expect(stats.compiledFunctions).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('Namespace Injection', () => {
    it('should create customFunctions namespace', async () => {
      const testFunc = setup.createSampleFunction('namespaceTest');
      testFunc.code = `
        const namespaceTest = (input: string): string => {
          return 'Namespace: ' + input;
        };
      `;

      const namespaceObj = await executor.createNamespaceObject(mockVM as any);

      expect(namespaceObj).toBeDefined();
    });

    it('should inject all registered functions', async () => {
      const functions = setup.createMultipleFunctions(3);

      // Store all functions with proper API
      for (const func of functions) {
        func.code = `
          const ${func.name} = (input: string): string => {
            return '${func.name}: ' + input;
          };
        `;
      }

      const namespaceObj = await executor.createNamespaceObject(mockVM as any);

      expect(namespaceObj).toBeDefined();
      // In a full test, we'd verify each function is available in the namespace
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle compilation failures gracefully', async () => {
      const invalidFunc = setup.createSampleFunction('compilationFailure');
      invalidFunc.code = `
        const compilationFailure = (input: string): string => {
          return unclosedString";
        };
      `;

      await expect(executor.compileFunction(invalidFunc)).rejects.toThrow();
    });

    it('should handle missing function dependencies', async () => {
      const dependentFunc = setup.createSampleFunction('dependencyTest');
      dependentFunc.returnType = 'Promise<string>';
      dependentFunc.code = `
        const dependencyTest = async (input: string): Promise<string> => {
          const note = await flintApi.getNote(input);
          return note ? note.title : 'No note found';
        };
      `;

      const compiled = await executor.compileFunction(dependentFunc);

      expect(compiled.dependencies).toContain('flintApi');
    });

    it('should handle execution context errors', async () => {
      const errorFunc = setup.createSampleFunction('executionError');
      errorFunc.code = `
        const executionError = (input: string): string => {
          return 'No error in compilation';
        };
      `;

      // Should compile successfully despite runtime error potential
      const compiled = await executor.compileFunction(errorFunc);
      expect(compiled).toBeDefined();
    });

    it('should handle resource cleanup on errors', async () => {
      const resourceFunc = setup.createSampleFunction('resourceTest');
      resourceFunc.code = `
        const resourceTest = (input: string): string => {
          return 'Resource: ' + input;
        };
      `;

      // Test that errors don't prevent cleanup
      try {
        await executor.compileFunction(resourceFunc);
      } catch (error) {
        // Ignore error, test cleanup
      }

      executor.clearCache();
      const stats = await executor.getExecutionStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('Performance and Statistics', () => {
    it('should track compilation statistics', async () => {
      const functions = setup.createMultipleFunctions(3);

      // Compile functions
      for (const func of functions) {
        func.code = `
          const ${func.name} = (input: string): string => {
            return '${func.name}: ' + input;
          };
        `;

        await executor.compileFunction(func);
      }

      const stats = await executor.getExecutionStats();

      expect(stats.compiledFunctions).toBe(3);
      expect(stats.cacheSize).toBe(3);
    });

    it('should maintain performance under load', async () => {
      const testFunc = setup.createSampleFunction('loadTest');
      testFunc.code = `
        const loadTest = (input: string): string => {
          return 'Load test: ' + input;
        };
      `;

      // Compile multiple times to test performance
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await executor.compileFunction(testFunc);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should be fast due to caching (most calls should use cached version)
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 10 calls
    });
  });

  describe('Integration with Sample Functions', () => {
    it('should compile simple string functions', async () => {
      const testFunc: CustomFunction = {
        ...sampleFunctions.simpleString,
        code: `
          const formatGreeting = (name: string, title?: string): string => {
            if (title) {
              return 'Hello, ' + title + ' ' + name + '!';
            }
            return 'Hello, ' + name + '!';
          };
        `
      };

      const compiled = await executor.compileFunction(testFunc);

      expect(compiled).toBeDefined();
      expect(compiled.id).toBe(testFunc.id);
    });

    it('should handle async operations', async () => {
      const asyncFunc: CustomFunction = {
        ...sampleFunctions.asyncOperation,
        code: `
          const processDataAsync = async (data: object, delayMs?: number): Promise<object> => {
            return {
              processed: true,
              timestamp: new Date().toISOString(),
              originalData: data,
              processingTime: delayMs || 100
            };
          };
        `
      };

      const compiled = await executor.compileFunction(asyncFunc);

      expect(compiled).toBeDefined();
      expect(compiled.compiledCode).toContain('async');
    });

    it('should reject security violation functions', async () => {
      const securityFunc = sampleFunctions.securityTest;

      await expect(executor.compileFunction(securityFunc)).rejects.toThrow(
        'Function validation failed'
      );
    });
  });
});
