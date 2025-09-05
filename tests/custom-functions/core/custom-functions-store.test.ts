/**
 * Custom Functions Store Tests
 * Tests for the storage layer including CRUD operations, data persistence,
 * and error recovery scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestCustomFunctionsSetup } from '../setup/TestCustomFunctionsSetup.js';
import { CustomFunctionsStore } from '../../../src/server/core/custom-functions-store.js';
import { CustomFunctionTestHelper } from '../utils/test-helpers.js';
import { sampleFunctions } from '../fixtures/sample-functions.js';
import fs from 'fs/promises';
import path from 'path';

describe('CustomFunctionsStore', () => {
  let setup: TestCustomFunctionsSetup;
  let store: CustomFunctionsStore;
  let testVaultPath: string;

  beforeEach(async () => {
    setup = new TestCustomFunctionsSetup();
    await setup.setup();

    // Create a test vault
    const vaultId = await setup.createTestVault('test-store-vault');
    testVaultPath = path.join(setup.testWorkspacePath, vaultId);

    store = new CustomFunctionsStore(testVaultPath);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Basic Operations', () => {
    it('should initialize empty storage when no file exists', async () => {
      const functions = await store.load();
      expect(functions).toEqual([]);
    });

    it('should save and load custom functions correctly', async () => {
      const testFunc = setup.createSampleFunction('testSaveLoad');

      await store.save([testFunc]);
      const loaded = await store.load();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe(testFunc.name);
      expect(loaded[0].code).toBe(testFunc.code);
      expect(loaded[0].id).toBe(testFunc.id);
    });

    it('should handle multiple functions in a single vault', async () => {
      const functions = setup.createMultipleFunctions(5);

      await store.save(functions);
      const loaded = await store.load();

      expect(loaded).toHaveLength(5);

      const names = loaded.map((f) => f.name);
      const expectedNames = functions.map((f) => f.name);
      expect(names.sort()).toEqual(expectedNames.sort());
    });

    it('should create vault directory if it does not exist', async () => {
      const nonExistentPath = path.join(setup.testWorkspacePath, 'non-existent-vault');
      const newStore = new CustomFunctionsStore(nonExistentPath);

      const testFunc = setup.createSampleFunction('testDirCreation');
      await newStore.save([testFunc]);

      // Verify directory and file were created
      const storagePath = path.join(
        nonExistentPath,
        '.flint-note',
        'custom-functions.json'
      );
      const exists = await fs
        .access(storagePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('CRUD Operations', () => {
    it('should create new custom functions', async () => {
      const createOptions = {
        name: 'newFunction',
        description: 'A new test function',
        parameters: {
          input: { type: 'string', description: 'Input parameter' }
        },
        returnType: 'string',
        code: 'function newFunction(input: string): string { return input; }',
        tags: ['test']
      };

      const created = await store.create(createOptions);

      expect(created.name).toBe('newFunction');
      expect(created.id).toBeDefined();
      expect(created.metadata.version).toBe(1);
      expect(created.metadata.usageCount).toBe(0);
    });

    it('should get custom functions by ID', async () => {
      const testFunc = setup.createSampleFunction('getByIdTest');
      await store.save([testFunc]);

      const retrieved = await store.get(testFunc.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(testFunc.id);
      expect(retrieved!.name).toBe(testFunc.name);
    });

    it('should get custom functions by name', async () => {
      const testFunc = setup.createSampleFunction('getByNameTest');
      await store.save([testFunc]);

      const retrieved = await store.getByName(testFunc.name);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe(testFunc.name);
      expect(retrieved!.id).toBe(testFunc.id);
    });

    it('should list all custom functions', async () => {
      const functions = setup.createMultipleFunctions(3);
      await store.save(functions);

      const all = await store.list();

      expect(all).toHaveLength(3);
      expect(all.map((f) => f.name).sort()).toEqual(functions.map((f) => f.name).sort());
    });

    it('should update existing custom functions', async () => {
      const testFunc = setup.createSampleFunction('updateTest');
      const created = await store.create({
        name: testFunc.name,
        description: testFunc.description,
        parameters: testFunc.parameters,
        returnType: testFunc.returnType,
        code: testFunc.code,
        tags: testFunc.tags
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await store.update({
        id: created.id,
        description: 'Updated description',
        code: 'function updateTest(input: string): string { return "updated: " + input; }'
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.code).toContain('updated: ');
      expect(updated.metadata.version).toBe(2);
      expect(updated.metadata.updatedAt.getTime()).toBeGreaterThan(
        created.metadata.createdAt.getTime()
      );
    });

    it('should delete custom functions', async () => {
      const testFunc = setup.createSampleFunction('deleteTest');
      await store.save([testFunc]);

      const deleted = await store.delete(testFunc.id);
      expect(deleted).toBe(true);

      const retrieved = await store.get(testFunc.id);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent function', async () => {
      const deleted = await store.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Validation and Constraints', () => {
    it('should validate function uniqueness by name', async () => {
      const createOptions = {
        name: 'uniqueTest',
        description: 'Test function',
        parameters: { input: { type: 'string', description: 'Input' } },
        returnType: 'string',
        code: 'function uniqueTest(input: string): string { return input; }',
        tags: ['test']
      };

      await store.create(createOptions);

      // Attempt to create another function with the same name
      await expect(store.create(createOptions)).rejects.toThrow(
        "Function with name 'uniqueTest' already exists"
      );
    });

    it('should prevent name conflicts during updates', async () => {
      const func1 = await store.create({
        name: 'function1',
        description: 'First function',
        parameters: { input: { type: 'string', description: 'Input' } },
        returnType: 'string',
        code: 'function function1(input: string): string { return input; }',
        tags: ['test']
      });

      const func2 = await store.create({
        name: 'function2',
        description: 'Second function',
        parameters: { input: { type: 'string', description: 'Input' } },
        returnType: 'string',
        code: 'function function2(input: string): string { return input; }',
        tags: ['test']
      });

      // Try to rename func2 to the same name as func1
      await expect(
        store.update({
          id: func2.id,
          name: 'function1'
        })
      ).rejects.toThrow("Function with name 'function1' already exists");
    });

    it('should handle missing function updates gracefully', async () => {
      await expect(
        store.update({
          id: 'non-existent-id',
          description: 'Updated description'
        })
      ).rejects.toThrow("Function with ID 'non-existent-id' not found");
    });
  });

  describe('Usage Statistics', () => {
    it('should update usage statistics correctly', async () => {
      const testFunc = setup.createSampleFunction('usageTest');
      await store.save([testFunc]);

      const initialUsage = testFunc.metadata.usageCount;

      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1));
      await store.recordUsage(testFunc.id);

      const updated = await store.get(testFunc.id);
      expect(updated!.metadata.usageCount).toBe(initialUsage + 1);
      expect(updated!.metadata.lastUsed).toBeDefined();
      expect(updated!.metadata.lastUsed!.getTime()).toBeGreaterThan(
        testFunc.metadata.createdAt.getTime()
      );
    });

    it('should handle usage recording for non-existent functions', async () => {
      // Should not throw error
      await expect(store.recordUsage('non-existent-id')).resolves.toBeUndefined();
    });

    it('should provide storage statistics', async () => {
      const functions = setup.createMultipleFunctions(5);
      // Set different usage counts
      functions.forEach((func, index) => {
        func.metadata.usageCount = index * 2;
      });

      await store.save(functions);

      const stats = await store.getStats();

      expect(stats.totalFunctions).toBe(5);
      expect(stats.totalUsage).toBe(0 + 2 + 4 + 6 + 8); // 20
      expect(stats.averageUsage).toBe(4);
      expect(stats.mostUsedFunction).toBe(functions[4].name);
      expect(stats.lastUpdated).toBeDefined();
    });

    it('should handle empty storage statistics', async () => {
      const stats = await store.getStats();

      expect(stats.totalFunctions).toBe(0);
      expect(stats.totalUsage).toBe(0);
      expect(stats.averageUsage).toBe(0);
      expect(stats.mostUsedFunction).toBeUndefined();
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(async () => {
      // Set up test functions with various tags and descriptions
      const functions = [
        setup.createSampleFunction('searchTest1'),
        setup.createSampleFunction('searchTest2'),
        setup.createComplexFunction('complexSearch')
      ];

      functions[0].tags = ['search', 'test'];
      functions[0].description = 'Function for search testing';
      functions[1].tags = ['test', 'utility'];
      functions[1].description = 'Utility function for testing';
      functions[2].tags = ['complex', 'search'];
      functions[2].description = 'Complex function with search capabilities';

      await store.save(functions);
    });

    it('should get functions by tags', async () => {
      const searchTagged = await store.getByTags(['search']);
      expect(searchTagged).toHaveLength(2);
      expect(searchTagged.map((f) => f.name).sort()).toEqual([
        'complexSearch',
        'searchTest1'
      ]);

      const testTagged = await store.getByTags(['test']);
      expect(testTagged).toHaveLength(2);
      expect(testTagged.map((f) => f.name).sort()).toEqual([
        'searchTest1',
        'searchTest2'
      ]);
    });

    it('should search functions by name or description', async () => {
      const nameSearch = await store.search('searchTest');
      expect(nameSearch).toHaveLength(2);
      expect(nameSearch.map((f) => f.name).sort()).toEqual([
        'searchTest1',
        'searchTest2'
      ]);

      const descriptionSearch = await store.search('utility');
      expect(descriptionSearch).toHaveLength(1);
      expect(descriptionSearch[0].name).toBe('searchTest2');

      const tagSearch = await store.search('complex');
      expect(tagSearch).toHaveLength(1);
      expect(tagSearch[0].name).toBe('complexSearch');
    });

    it('should perform case-insensitive search', async () => {
      const upperCaseSearch = await store.search('SEARCHTEST');
      expect(upperCaseSearch).toHaveLength(2);

      const mixedCaseSearch = await store.search('CoMpLeX');
      expect(mixedCaseSearch).toHaveLength(1);
    });
  });

  describe('Backup and Restore', () => {
    it('should create backup of all custom functions', async () => {
      const functions = setup.createMultipleFunctions(3);
      await store.save(functions);

      const backupData = await store.backup();
      const backup = JSON.parse(backupData);

      expect(backup.version).toBe('1.0.0');
      expect(backup.timestamp).toBeDefined();
      expect(backup.functions).toHaveLength(3);
      expect(backup.functions.map((f: any) => f.name).sort()).toEqual(
        functions.map((f) => f.name).sort()
      );
    });

    it('should restore custom functions from backup', async () => {
      const originalFunctions = setup.createMultipleFunctions(2);
      await store.save(originalFunctions);

      const backupData = await store.backup();

      // Clear storage and add different functions
      const differentFunctions = setup.createMultipleFunctions(1);
      differentFunctions[0].name = 'differentFunction';
      await store.save(differentFunctions);

      // Restore from backup
      await store.restore(backupData);

      const restored = await store.list();
      expect(restored).toHaveLength(2);
      expect(restored.map((f) => f.name).sort()).toEqual(
        originalFunctions.map((f) => f.name).sort()
      );
    });

    it('should validate backup format during restore', async () => {
      const invalidBackup = JSON.stringify({ version: '1.0.0' }); // Missing functions

      await expect(store.restore(invalidBackup)).rejects.toThrow('Invalid backup format');
    });

    it('should validate function data in backup', async () => {
      const invalidBackup = JSON.stringify({
        version: '1.0.0',
        functions: [
          { id: 'test', name: 'test' } // Missing required fields
        ]
      });

      await expect(store.restore(invalidBackup)).rejects.toThrow(
        'Invalid function in backup data'
      );
    });
  });

  describe('Concurrent Access and Error Handling', () => {
    it('should handle concurrent read/write operations', async () => {
      const testFunc = setup.createSampleFunction('concurrentTest');

      // Simulate concurrent operations
      const operations = [
        store.save([testFunc]),
        store.load(),
        store.recordUsage(testFunc.id),
        store.getStats()
      ];

      // All operations should complete without errors
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });

    it('should handle corrupted storage files gracefully', async () => {
      const testFunc = setup.createSampleFunction('corruptionTest');
      await store.save([testFunc]);

      // Corrupt the storage file
      const storagePath = path.join(
        testVaultPath,
        '.flint-note',
        'custom-functions.json'
      );
      await fs.writeFile(storagePath, '{ invalid json', 'utf-8');

      // Should throw a descriptive error
      await expect(store.load()).rejects.toThrow('Failed to load custom functions');
    });

    it('should handle file system permission errors', async () => {
      // Create a read-only directory scenario (platform dependent)
      const restrictedPath = path.join(setup.testWorkspacePath, 'restricted');
      await fs.mkdir(restrictedPath, { mode: 0o444 }); // Read-only

      const restrictedStore = new CustomFunctionsStore(restrictedPath);
      const testFunc = setup.createSampleFunction('permissionTest');

      try {
        await expect(restrictedStore.save([testFunc])).rejects.toThrow();
      } finally {
        // Cleanup - restore permissions
        await fs.chmod(restrictedPath, 0o755);
      }
    });
  });

  describe('Data Persistence and Migration', () => {
    it('should persist data across application restarts', async () => {
      const testFunc = setup.createSampleFunction('persistenceTest');
      await store.save([testFunc]);

      // Create a new store instance (simulates restart)
      const newStore = new CustomFunctionsStore(testVaultPath);
      const loaded = await newStore.load();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe(testFunc.name);
      expect(loaded[0].id).toBe(testFunc.id);
    });

    it('should handle date serialization correctly', async () => {
      const testFunc = setup.createSampleFunction('dateSerializationTest');
      const originalDate = new Date('2024-01-15T10:30:00.000Z');
      testFunc.metadata.createdAt = originalDate;
      testFunc.metadata.updatedAt = originalDate;
      testFunc.metadata.lastUsed = originalDate;

      await store.save([testFunc]);

      const loaded = await store.load();
      expect(loaded[0].metadata.createdAt).toBeInstanceOf(Date);
      expect(loaded[0].metadata.createdAt.getTime()).toBe(originalDate.getTime());
      expect(loaded[0].metadata.updatedAt).toBeInstanceOf(Date);
      expect(loaded[0].metadata.lastUsed).toBeInstanceOf(Date);
    });

    it('should handle missing optional date fields', async () => {
      const testFunc = setup.createSampleFunction('optionalDateTest');
      delete (testFunc.metadata as any).lastUsed;

      await store.save([testFunc]);

      const loaded = await store.load();
      expect(loaded[0].metadata.lastUsed).toBeUndefined();
    });
  });
});
