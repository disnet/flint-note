/**
 * Integration Tests for Custom Function Registration
 * Tests the registration, validation, and storage of custom functions
 * (excluding execution which requires VM integration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestCustomFunctionsSetup } from '../setup/TestCustomFunctionsSetup.js';
import type { CustomFunction } from '../../../src/server/types/custom-functions.js';

describe('Custom Function Registration Integration', () => {
  let setup: TestCustomFunctionsSetup;
  let vaultId: string;

  beforeEach(async () => {
    setup = new TestCustomFunctionsSetup();
    await setup.setup();

    // Create test vault
    vaultId = await setup.createTestVault('custom-function-registration-test');
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Function Registration and Storage', () => {
    it('should register a valid custom function successfully', async () => {
      const result = await setup.customFunctionsApi.registerFunction({
        name: 'testFunction',
        description: 'A simple test function',
        parameters: {
          input: { type: 'string', description: 'Test input' }
        },
        returnType: 'string',
        code: `
          function testFunction(input: string): string {
            return 'Result: ' + input;
          }
        `,
        tags: ['test']
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('testFunction');
      expect(result.description).toBe('A simple test function');
      expect(result.metadata.createdBy).toBe('agent');
      expect(result.metadata.usageCount).toBe(0);
    });

    it('should reject functions with invalid TypeScript syntax', async () => {
      await expect(
        setup.customFunctionsApi.registerFunction({
          name: 'invalidFunction',
          description: 'Function with syntax errors',
          parameters: {
            input: { type: 'string', description: 'Test input' }
          },
          returnType: 'string',
          code: `
            function invalidFunction(input: string): string {
              return "unclosed string;
            }
          `,
          tags: ['test']
        })
      ).rejects.toThrow('Function validation failed');
    });

    it('should reject functions with security violations', async () => {
      await expect(
        setup.customFunctionsApi.registerFunction({
          name: 'securityViolation',
          description: 'Function with security issues',
          parameters: {
            input: { type: 'string', description: 'Test input' }
          },
          returnType: 'string',
          code: `
            function securityViolation(input: string): string {
              eval('console.log("dangerous")');
              return input;
            }
          `,
          tags: ['test']
        })
      ).rejects.toThrow('Function validation failed');
    });

    it('should store and retrieve custom functions', async () => {
      // Register a function
      const registered = await setup.customFunctionsApi.registerFunction({
        name: 'storageTest',
        description: 'Function to test storage',
        parameters: {
          value: { type: 'number', description: 'Input value' }
        },
        returnType: 'number',
        code: `
          function storageTest(value: number): number {
            return value * 2;
          }
        `,
        tags: ['storage', 'test']
      });

      // Retrieve by ID
      const retrieved = await setup.customFunctionsApi.getFunction({
        id: registered.id
      });

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('storageTest');
      expect(retrieved?.parameters.value.type).toBe('number');

      // Retrieve by name
      const retrievedByName = await setup.customFunctionsApi.getFunction({
        name: 'storageTest'
      });

      expect(retrievedByName).toBeDefined();
      expect(retrievedByName?.id).toBe(registered.id);
    });

    it('should list registered functions', async () => {
      // Register multiple functions
      await setup.customFunctionsApi.registerFunction({
        name: 'listTest1',
        description: 'First test function',
        parameters: {},
        returnType: 'string',
        code: `
          function listTest1(): string {
            return 'first';
          }
        `,
        tags: ['list-test']
      });

      await setup.customFunctionsApi.registerFunction({
        name: 'listTest2',
        description: 'Second test function',
        parameters: {},
        returnType: 'string',
        code: `
          function listTest2(): string {
            return 'second';
          }
        `,
        tags: ['list-test']
      });

      // List all functions
      const allFunctions = await setup.customFunctionsApi.listFunctions();
      expect(allFunctions.length).toBe(2);

      // List functions by tag
      const taggedFunctions = await setup.customFunctionsApi.listFunctions({
        tags: ['list-test']
      });
      expect(taggedFunctions.length).toBe(2);
    });
  });

  describe('Function Validation', () => {
    it('should validate function definitions without registering them', async () => {
      const validationResult = await setup.customFunctionsApi.validateFunction({
        name: 'validationTest',
        description: 'Function for validation testing',
        parameters: {
          input: { type: 'string', description: 'Test input' }
        },
        returnType: 'string',
        code: `
          function validationTest(input: string): string {
            return input.toUpperCase();
          }
        `,
        tags: ['validation']
      });

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should provide detailed validation errors', async () => {
      const validationResult = await setup.customFunctionsApi.validateFunction({
        name: 'validationErrorTest',
        description: 'Function with validation errors',
        parameters: {
          input: { type: 'string', description: 'Test input' }
        },
        returnType: 'string',
        code: `
          function validationErrorTest(input: string): string {
            return input.nonExistentMethod();
          }
        `,
        tags: ['validation']
      });

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
      expect(validationResult.errors[0].message).toContain('nonExistentMethod');
    });
  });

  describe('Function Management', () => {
    it('should update existing functions', async () => {
      // Register a function
      const original = await setup.customFunctionsApi.registerFunction({
        name: 'updateTest',
        description: 'Original description',
        parameters: {
          input: { type: 'string', description: 'Input value' }
        },
        returnType: 'string',
        code: `
          function updateTest(input: string): string {
            return 'Original: ' + input;
          }
        `,
        tags: ['update']
      });

      // Update the function
      const updated = await setup.customFunctionsApi.updateFunction({
        id: original.id,
        description: 'Updated description',
        code: `
          function updateTest(input: string): string {
            return 'Updated: ' + input;
          }
        `
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.code).toContain('Updated: ');
      expect(updated.metadata.version).toBe(2);
    });

    it('should delete functions', async () => {
      // Register a function
      const registered = await setup.customFunctionsApi.registerFunction({
        name: 'deleteTest',
        description: 'Function to be deleted',
        parameters: {},
        returnType: 'string',
        code: `
          function deleteTest(): string {
            return 'will be deleted';
          }
        `,
        tags: ['delete']
      });

      // Delete the function
      const deleteResult = await setup.customFunctionsApi.deleteFunction({
        id: registered.id
      });

      expect(deleteResult.success).toBe(true);

      // Verify it's gone
      const retrieved = await setup.customFunctionsApi.getFunction({
        id: registered.id
      });

      expect(retrieved).toBeNull();
    });
  });

  describe('Statistics and Analytics', () => {
    it('should track function usage statistics', async () => {
      // Register a function
      await setup.customFunctionsApi.registerFunction({
        name: 'statsTest',
        description: 'Function for stats testing',
        parameters: {},
        returnType: 'string',
        code: `
          function statsTest(): string {
            return 'stats';
          }
        `,
        tags: ['stats']
      });

      // Get execution stats
      const stats = await setup.customFunctionsApi.getExecutionStats();

      expect(stats.totalFunctions).toBeGreaterThan(0);
      expect(stats.totalUsage).toBe(0); // No executions yet
      expect(stats.averageUsage).toBe(0);
    });
  });

  describe('Import/Export', () => {
    it('should export and import functions', async () => {
      // Register some functions
      await setup.customFunctionsApi.registerFunction({
        name: 'exportTest1',
        description: 'First export test function',
        parameters: {},
        returnType: 'string',
        code: `
          function exportTest1(): string {
            return 'export1';
          }
        `,
        tags: ['export']
      });

      await setup.customFunctionsApi.registerFunction({
        name: 'exportTest2',
        description: 'Second export test function',
        parameters: {},
        returnType: 'string',
        code: `
          function exportTest2(): string {
            return 'export2';
          }
        `,
        tags: ['export']
      });

      // Export functions
      const exportedData = await setup.customFunctionsApi.exportFunctions();
      expect(exportedData).toBeTruthy();

      // Clear all functions (for testing import)
      const functions = await setup.customFunctionsApi.listFunctions();
      for (const func of functions) {
        await setup.customFunctionsApi.deleteFunction({ id: func.id });
      }

      // Verify functions are gone
      const emptyList = await setup.customFunctionsApi.listFunctions();
      expect(emptyList).toHaveLength(0);

      // Import functions
      const importResult = await setup.customFunctionsApi.importFunctions(exportedData);
      expect(importResult.imported).toBe(2);

      // Verify functions are back
      const importedList = await setup.customFunctionsApi.listFunctions();
      expect(importedList).toHaveLength(2);

      const names = importedList.map((f) => f.name);
      expect(names).toContain('exportTest1');
      expect(names).toContain('exportTest2');
    });
  });
});
