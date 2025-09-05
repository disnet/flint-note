/**
 * Test utilities and helpers for Custom Functions testing
 */

import type {
  CustomFunction,
  CreateCustomFunctionOptions,
  ValidationResult
} from '../../../src/server/types/custom-functions.js';
import type { TestCustomFunctionsSetup } from '../setup/TestCustomFunctionsSetup.js';
import { randomUUID } from 'crypto';

export class CustomFunctionTestHelper {
  /**
   * Register a function and test its basic functionality
   */
  static async registerAndTest(
    setup: TestCustomFunctionsSetup,
    func: CustomFunction
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Register the function
      const createOptions: CreateCustomFunctionOptions = {
        name: func.name,
        description: func.description,
        parameters: func.parameters,
        returnType: func.returnType,
        code: func.code,
        tags: func.tags
      };

      const registeredFunc = await setup.customFunctionsApi.create(createOptions);

      // Verify it was registered correctly
      const retrievedFunc = await setup.customFunctionsApi.get(registeredFunc.id);

      if (!retrievedFunc) {
        return { success: false, error: 'Function was not properly registered' };
      }

      if (retrievedFunc.name !== func.name) {
        return { success: false, error: 'Function name mismatch' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a function with the given context and parameters
   */
  static async executeWithContext(
    setup: TestCustomFunctionsSetup,
    functionName: string,
    parameters: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const func = await setup.customFunctionsApi.getByName(functionName);
      if (!func) {
        return { success: false, error: 'Function not found' };
      }

      const result = await setup.customFunctionsApi.execute(func.id, parameters);

      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate a random function for testing
   */
  static generateRandomFunction(
    complexity: 'simple' | 'complex' = 'simple'
  ): CustomFunction {
    const id = randomUUID();
    const name = `randomFunction_${Math.random().toString(36).substr(2, 8)}`;

    if (complexity === 'simple') {
      return {
        id,
        name,
        description: `Random simple function: ${name}`,
        parameters: {
          value: { type: 'string', description: 'Input value' }
        },
        returnType: 'string',
        code: `
          function ${name}(value: string): string {
            return 'Processed: ' + value;
          }
        `,
        tags: ['random', 'simple'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'agent',
          usageCount: 0,
          version: 1
        }
      };
    } else {
      return {
        id,
        name,
        description: `Random complex function: ${name}`,
        parameters: {
          data: { type: 'object', description: 'Input data' },
          transform: { type: 'string', description: 'Transform type' },
          options: {
            type: 'object',
            description: 'Processing options',
            optional: true
          }
        },
        returnType: 'Promise<object>',
        code: `
          async function ${name}(data: object, transform: string, options?: object): Promise<object> {
            const processed = { 
              original: data, 
              transform, 
              options: options || {}, 
              timestamp: Date.now() 
            };
            return Promise.resolve(processed);
          }
        `,
        tags: ['random', 'complex', 'async'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'agent',
          usageCount: Math.floor(Math.random() * 10),
          lastUsed: new Date(),
          version: Math.floor(Math.random() * 5) + 1
        }
      };
    }
  }

  /**
   * Validate function execution result
   */
  static validateFunctionExecution(
    result: unknown,
    expected: unknown
  ): { valid: boolean; error?: string } {
    try {
      if (typeof expected === 'object' && expected !== null) {
        return {
          valid: JSON.stringify(result) === JSON.stringify(expected)
        };
      } else {
        return {
          valid: result === expected
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Assert validation result has expected errors/warnings
   */
  static assertValidationResult(
    result: ValidationResult,
    expectedErrors?: number,
    expectedWarnings?: number
  ): { valid: boolean; message?: string } {
    const messages: string[] = [];

    if (expectedErrors !== undefined && result.errors.length !== expectedErrors) {
      messages.push(`Expected ${expectedErrors} errors, got ${result.errors.length}`);
    }

    if (expectedWarnings !== undefined && result.warnings.length !== expectedWarnings) {
      messages.push(
        `Expected ${expectedWarnings} warnings, got ${result.warnings.length}`
      );
    }

    return {
      valid: messages.length === 0,
      message: messages.length > 0 ? messages.join('; ') : undefined
    };
  }

  /**
   * Create a function with specific validation issues
   */
  static createFunctionWithValidationIssues(
    issueType: 'syntax' | 'naming' | 'security' | 'type'
  ): CustomFunction {
    const id = randomUUID();
    const baseFunction = this.generateRandomFunction();

    switch (issueType) {
      case 'syntax':
        return {
          ...baseFunction,
          code: `
            function ${baseFunction.name}(value: string): string {
              return "unclosed string;
            }
          `
        };

      case 'naming':
        return {
          ...baseFunction,
          name: 'if' // Reserved keyword
        };

      case 'security':
        return {
          ...baseFunction,
          code: `
            function ${baseFunction.name}(value: string): string {
              eval('console.log("dangerous")');
              return value;
            }
          `
        };

      case 'type':
        return {
          ...baseFunction,
          parameters: {
            value: { type: '', description: 'Missing type' } // Invalid type
          }
        };

      default:
        return baseFunction;
    }
  }

  /**
   * Wait for a specified amount of time (for async testing)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate test data for performance testing
   */
  static generateLargeDataSet(size: number): object {
    const data: Record<string, unknown> = {};

    for (let i = 0; i < size; i++) {
      data[`item_${i}`] = {
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000,
        timestamp: new Date().toISOString(),
        metadata: {
          processed: false,
          tags: [`tag_${i % 10}`]
        }
      };
    }

    return data;
  }
}
