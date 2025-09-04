/**
 * Custom Functions Storage Layer
 *
 * Handles persistence of custom functions within the existing vault settings structure.
 * Integrates with the workspace configuration system to provide vault-scoped storage.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  CustomFunction,
  CreateCustomFunctionOptions,
  UpdateCustomFunctionOptions
} from '../types/custom-functions.js';

interface CustomFunctionsStorage {
  version: string;
  lastUpdated: string;
  functions: Record<string, CustomFunction>;
}

export class CustomFunctionsStore {
  private storagePath: string;
  private cache: CustomFunctionsStorage | null = null;

  constructor(workspaceRoot: string) {
    this.storagePath = path.join(workspaceRoot, '.flint-note', 'custom-functions.json');
  }

  /**
   * Load custom functions from storage
   */
  async load(): Promise<CustomFunction[]> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const storage: CustomFunctionsStorage = JSON.parse(data);

      // Convert date strings back to Date objects
      const functions = Object.values(storage.functions).map((func) => ({
        ...func,
        metadata: {
          ...func.metadata,
          createdAt: new Date(func.metadata.createdAt),
          updatedAt: new Date(func.metadata.updatedAt),
          lastUsed: func.metadata.lastUsed ? new Date(func.metadata.lastUsed) : undefined
        }
      }));

      this.cache = storage;
      return functions;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Initialize empty storage if file doesn't exist
        return await this.initialize();
      }
      throw new Error(
        `Failed to load custom functions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Save custom functions to storage
   */
  async save(functions: CustomFunction[]): Promise<void> {
    const storage: CustomFunctionsStorage = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      functions: functions.reduce(
        (acc, func) => {
          acc[func.id] = func;
          return acc;
        },
        {} as Record<string, CustomFunction>
      )
    };

    try {
      // Ensure directory exists
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.storagePath, JSON.stringify(storage, null, 2), 'utf-8');
      this.cache = storage;
    } catch (error) {
      throw new Error(
        `Failed to save custom functions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Initialize empty storage
   */
  private async initialize(): Promise<CustomFunction[]> {
    const emptyStorage: CustomFunctionsStorage = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      functions: {}
    };

    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(
        this.storagePath,
        JSON.stringify(emptyStorage, null, 2),
        'utf-8'
      );
      this.cache = emptyStorage;
      return [];
    } catch (error) {
      throw new Error(
        `Failed to initialize custom functions storage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a new custom function
   */
  async create(options: CreateCustomFunctionOptions): Promise<CustomFunction> {
    const functions = await this.load();

    // Check for name conflicts
    if (functions.some((func) => func.name === options.name)) {
      throw new Error(`Function with name '${options.name}' already exists`);
    }

    const newFunction: CustomFunction = {
      id: randomUUID(),
      name: options.name,
      description: options.description,
      parameters: options.parameters,
      returnType: options.returnType,
      code: options.code,
      tags: options.tags || [],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'agent',
        usageCount: 0,
        version: 1
      }
    };

    functions.push(newFunction);
    await this.save(functions);

    return newFunction;
  }

  /**
   * Get a custom function by ID
   */
  async get(id: string): Promise<CustomFunction | null> {
    const functions = await this.load();
    return functions.find((func) => func.id === id) || null;
  }

  /**
   * Get a custom function by name
   */
  async getByName(name: string): Promise<CustomFunction | null> {
    const functions = await this.load();
    return functions.find((func) => func.name === name) || null;
  }

  /**
   * List all custom functions
   */
  async list(): Promise<CustomFunction[]> {
    return await this.load();
  }

  /**
   * Update a custom function
   */
  async update(options: UpdateCustomFunctionOptions): Promise<CustomFunction> {
    const functions = await this.load();
    const functionIndex = functions.findIndex((func) => func.id === options.id);

    if (functionIndex === -1) {
      throw new Error(`Function with ID '${options.id}' not found`);
    }

    const existingFunction = functions[functionIndex];

    // Check for name conflicts if name is being changed
    if (options.name && options.name !== existingFunction.name) {
      if (
        functions.some((func) => func.name === options.name && func.id !== options.id)
      ) {
        throw new Error(`Function with name '${options.name}' already exists`);
      }
    }

    const updatedFunction: CustomFunction = {
      ...existingFunction,
      name: options.name || existingFunction.name,
      description: options.description || existingFunction.description,
      parameters: options.parameters || existingFunction.parameters,
      returnType: options.returnType || existingFunction.returnType,
      code: options.code || existingFunction.code,
      tags: options.tags || existingFunction.tags,
      metadata: {
        ...existingFunction.metadata,
        updatedAt: new Date(),
        version: existingFunction.metadata.version + 1
      }
    };

    functions[functionIndex] = updatedFunction;
    await this.save(functions);

    return updatedFunction;
  }

  /**
   * Delete a custom function
   */
  async delete(id: string): Promise<boolean> {
    const functions = await this.load();
    const functionIndex = functions.findIndex((func) => func.id === id);

    if (functionIndex === -1) {
      return false;
    }

    functions.splice(functionIndex, 1);
    await this.save(functions);

    return true;
  }

  /**
   * Update function usage statistics
   */
  async recordUsage(id: string): Promise<void> {
    const functions = await this.load();
    const functionIndex = functions.findIndex((func) => func.id === id);

    if (functionIndex === -1) {
      return;
    }

    const func = functions[functionIndex];
    func.metadata.usageCount += 1;
    func.metadata.lastUsed = new Date();

    await this.save(functions);
  }

  /**
   * Get functions by tags
   */
  async getByTags(tags: string[]): Promise<CustomFunction[]> {
    const functions = await this.load();
    return functions.filter((func) => tags.some((tag) => func.tags.includes(tag)));
  }

  /**
   * Search functions by name or description
   */
  async search(query: string): Promise<CustomFunction[]> {
    const functions = await this.load();
    const lowerQuery = query.toLowerCase();

    return functions.filter(
      (func) =>
        func.name.toLowerCase().includes(lowerQuery) ||
        func.description.toLowerCase().includes(lowerQuery) ||
        func.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Create backup of all custom functions
   */
  async backup(): Promise<string> {
    const functions = await this.load();
    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      functions
    };

    return JSON.stringify(backup, null, 2);
  }

  /**
   * Restore custom functions from backup
   */
  async restore(backupData: string): Promise<void> {
    try {
      const backup = JSON.parse(backupData);

      if (!backup.functions || !Array.isArray(backup.functions)) {
        throw new Error('Invalid backup format');
      }

      // Validate each function has required fields
      for (const func of backup.functions) {
        if (!func.id || !func.name || !func.code) {
          throw new Error('Invalid function in backup data');
        }
      }

      await this.save(backup.functions);
    } catch (error) {
      throw new Error(
        `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalFunctions: number;
    totalUsage: number;
    averageUsage: number;
    mostUsedFunction?: string;
    lastUpdated: string;
  }> {
    const functions = await this.load();

    if (functions.length === 0) {
      return {
        totalFunctions: 0,
        totalUsage: 0,
        averageUsage: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    const totalUsage = functions.reduce((sum, func) => sum + func.metadata.usageCount, 0);
    const mostUsed = functions.reduce((prev, current) =>
      prev.metadata.usageCount > current.metadata.usageCount ? prev : current
    );

    return {
      totalFunctions: functions.length,
      totalUsage,
      averageUsage: totalUsage / functions.length,
      mostUsedFunction: mostUsed.name,
      lastUpdated: this.cache?.lastUpdated || new Date().toISOString()
    };
  }
}
