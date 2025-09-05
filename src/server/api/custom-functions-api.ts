/**
 * Custom Functions API
 *
 * Provides API methods for managing custom functions including registration,
 * validation, execution, and management operations. Integrates with the
 * existing FlintNote API structure.
 */

import type {
  CustomFunction,
  CreateCustomFunctionOptions,
  ValidationResult
} from '../types/custom-functions.js';
import { CustomFunctionsStore } from '../core/custom-functions-store.js';
import { CustomFunctionValidator } from './custom-functions-validator.js';
import { CustomFunctionsExecutor } from './custom-functions-executor.js';

export interface RegisterCustomFunctionArgs {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType: string;
  code: string;
  tags?: string[];
}

export interface UpdateCustomFunctionArgs {
  id: string;
  name?: string;
  description?: string;
  parameters?: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType?: string;
  code?: string;
  tags?: string[];
}

export interface ListCustomFunctionsArgs {
  tags?: string[];
  searchQuery?: string;
}

export interface DeleteCustomFunctionArgs {
  id: string;
}

export interface GetCustomFunctionArgs {
  id?: string;
  name?: string;
}

export interface ValidateCustomFunctionArgs {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType: string;
  code: string;
  tags?: string[];
}

export interface CustomFunctionExecutionStatsArgs {
  functionId?: string;
}

export class CustomFunctionsApi {
  private store: CustomFunctionsStore;
  private validator: CustomFunctionValidator;
  private executor: CustomFunctionsExecutor;

  constructor(workspaceRoot: string) {
    this.store = new CustomFunctionsStore(workspaceRoot);
    this.validator = new CustomFunctionValidator();
    this.executor = new CustomFunctionsExecutor(workspaceRoot);
  }

  /**
   * Register a new custom function
   */
  async registerFunction(args: RegisterCustomFunctionArgs): Promise<CustomFunction> {
    const options: CreateCustomFunctionOptions = {
      name: args.name,
      description: args.description,
      parameters: args.parameters,
      returnType: args.returnType,
      code: args.code,
      tags: args.tags || []
    };

    // Set existing functions in validator for cross-reference validation
    const existingFunctions = await this.store.list();
    this.validator.setExistingFunctions(existingFunctions);

    // Validate the function definition
    const validation = await this.validator.validateDefinition(options);
    if (!validation.valid) {
      const errors = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Function validation failed: ${errors}`);
    }

    // Create the function
    const customFunction = await this.store.create(options);

    // Clear executor cache to ensure the new function is available
    this.executor.clearCache();

    return customFunction;
  }

  /**
   * Get a custom function by ID or name
   */
  async getFunction(args: GetCustomFunctionArgs): Promise<CustomFunction | null> {
    if (args.id) {
      return await this.store.get(args.id);
    }

    if (args.name) {
      return await this.store.getByName(args.name);
    }

    throw new Error('Either id or name must be provided');
  }

  /**
   * List all custom functions
   */
  async listFunctions(args: ListCustomFunctionsArgs = {}): Promise<CustomFunction[]> {
    let functions: CustomFunction[];

    if (args.tags && args.tags.length > 0) {
      functions = await this.store.getByTags(args.tags);
    } else {
      functions = await this.store.list();
    }

    // Apply search filter if provided
    if (args.searchQuery) {
      const searchResults = await this.store.search(args.searchQuery);
      const searchIds = new Set(searchResults.map((f) => f.id));
      functions = functions.filter((f) => searchIds.has(f.id));
    }

    return functions;
  }

  /**
   * Update an existing custom function
   */
  async updateFunction(args: UpdateCustomFunctionArgs): Promise<CustomFunction> {
    // Validate the update if code is being changed
    if (args.code || args.name || args.parameters || args.returnType) {
      const existingFunction = await this.store.get(args.id);
      if (!existingFunction) {
        throw new Error(`Function with ID '${args.id}' not found`);
      }

      const options: CreateCustomFunctionOptions = {
        name: args.name || existingFunction.name,
        description: args.description || existingFunction.description,
        parameters: args.parameters || existingFunction.parameters,
        returnType: args.returnType || existingFunction.returnType,
        code: args.code || existingFunction.code,
        tags: args.tags || existingFunction.tags
      };

      const validation = await this.validator.validateDefinition(options);
      if (!validation.valid) {
        const errors = validation.errors.map((e) => e.message).join('; ');
        throw new Error(`Function validation failed: ${errors}`);
      }
    }

    const updatedFunction = await this.store.update(args);

    // Clear executor cache to ensure the updated function is recompiled
    this.executor.clearCache();

    return updatedFunction;
  }

  /**
   * Delete a custom function
   */
  async deleteFunction(args: DeleteCustomFunctionArgs): Promise<{ success: boolean }> {
    const success = await this.store.delete(args.id);

    if (success) {
      // Clear executor cache
      this.executor.clearCache();
    }

    return { success };
  }

  /**
   * Validate a custom function without creating it
   */
  async validateFunction(args: ValidateCustomFunctionArgs): Promise<ValidationResult> {
    const options: CreateCustomFunctionOptions = {
      name: args.name,
      description: args.description,
      parameters: args.parameters,
      returnType: args.returnType,
      code: args.code,
      tags: args.tags || []
    };

    return await this.validator.validateDefinition(options);
  }

  /**
   * Get custom function execution statistics
   */
  async getExecutionStats(args: CustomFunctionExecutionStatsArgs = {}): Promise<{
    totalFunctions: number;
    totalUsage: number;
    averageUsage: number;
    mostUsedFunction?: string;
    functionStats?: {
      id: string;
      name: string;
      usageCount: number;
      lastUsed?: string;
    };
  }> {
    const storeStats = await this.store.getStats();

    const result = {
      totalFunctions: storeStats.totalFunctions,
      totalUsage: storeStats.totalUsage,
      averageUsage: storeStats.averageUsage,
      mostUsedFunction: storeStats.mostUsedFunction
    };

    // If a specific function ID was requested, get its stats
    if (args.functionId) {
      const func = await this.store.get(args.functionId);
      if (func) {
        return {
          ...result,
          functionStats: {
            id: func.id,
            name: func.name,
            usageCount: func.metadata.usageCount,
            lastUsed: func.metadata.lastUsed?.toISOString()
          }
        };
      }
    }

    return result;
  }

  /**
   * Export all custom functions as backup
   */
  async exportFunctions(): Promise<string> {
    return await this.store.backup();
  }

  /**
   * Import custom functions from backup
   */
  async importFunctions(backupData: string): Promise<{ imported: number }> {
    const backup = JSON.parse(backupData);
    await this.store.restore(backupData);

    // Clear executor cache to ensure imported functions are available
    this.executor.clearCache();

    return { imported: backup.functions?.length || 0 };
  }

  /**
   * Get custom functions formatted for system prompt
   */
  async getSystemPromptSection(): Promise<string> {
    const functions = await this.store.list();

    if (functions.length === 0) {
      return '';
    }

    let prompt = '\n## Available Custom Functions\n\n';
    prompt += `You have access to the following custom functions via the \`customFunctions\` namespace:\n\n`;

    for (const func of functions) {
      prompt += `### customFunctions.${func.name}(`;

      const paramList = Object.entries(func.parameters)
        .map(([name, param]) => {
          const optional = param.optional ? '?' : '';
          return `${name}${optional}: ${param.type}`;
        })
        .join(', ');

      prompt += paramList;
      prompt += `): ${func.returnType}\n`;
      prompt += `${func.description}\n`;

      if (Object.keys(func.parameters).length > 0) {
        prompt += 'Parameters:\n';
        for (const [name, param] of Object.entries(func.parameters)) {
          const optionalText = param.optional ? 'optional' : 'required';
          const defaultText =
            param.default !== undefined
              ? `, defaults to ${JSON.stringify(param.default)}`
              : '';
          prompt += `- ${name} (${optionalText}): ${param.description || param.type}${defaultText}\n`;
        }
      }

      prompt += `\nUsage: const result = await customFunctions.${func.name}(`;
      const exampleParams = Object.entries(func.parameters)
        .filter(([, param]) => !param.optional)
        .map(([, param]) => {
          if (param.type === 'string') return `'example'`;
          if (param.type === 'number') return '0';
          if (param.type === 'boolean') return 'true';
          return `{/* ${param.type} */}`;
        })
        .join(', ');
      prompt += exampleParams;
      prompt += `);\n\n`;
    }

    return prompt;
  }
}
