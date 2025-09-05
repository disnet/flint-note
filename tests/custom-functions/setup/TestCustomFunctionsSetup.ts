/**
 * Test setup utilities for Custom Functions tests
 * Extends TestApiSetup to provide custom functions specific testing infrastructure
 */

import { TestApiSetup } from '../../server/api/test-setup.js';
import { CustomFunctionsApi } from '../../../src/server/api/custom-functions-api.js';
import type { CustomFunction } from '../../../src/server/types/custom-functions.js';
import { randomUUID } from 'crypto';

export class TestCustomFunctionsSetup extends TestApiSetup {
  public customFunctionsApi: CustomFunctionsApi;

  constructor() {
    super();
    this.customFunctionsApi = null!;
  }

  async setup(): Promise<void> {
    await super.setup();
    
    // Initialize custom functions API with the test workspace
    this.customFunctionsApi = new CustomFunctionsApi(this.testWorkspacePath);
  }

  /**
   * Create a sample custom function for testing
   */
  createSampleFunction(name: string = 'testFunction'): CustomFunction {
    return {
      id: randomUUID(),
      name,
      description: 'Test function for automated testing',
      parameters: {
        input: { type: 'string', description: 'Test input' }
      },
      returnType: 'string',
      code: `
        function ${name}(input: string): string {
          return 'Test result: ' + input;
        }
      `,
      tags: ['test'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'agent',
        usageCount: 0,
        version: 1
      }
    };
  }

  /**
   * Create a complex custom function for advanced testing
   */
  createComplexFunction(name: string = 'complexTestFunction'): CustomFunction {
    return {
      id: randomUUID(),
      name,
      description: 'Complex test function with multiple parameters',
      parameters: {
        text: { type: 'string', description: 'Input text' },
        count: { type: 'number', description: 'Repeat count' },
        options: { 
          type: 'object', 
          description: 'Options object',
          optional: true
        }
      },
      returnType: 'Promise<string>',
      code: `
        async function ${name}(text: string, count: number, options?: object): Promise<string> {
          const result = Array(count).fill(text).join(' ');
          return Promise.resolve(result);
        }
      `,
      tags: ['test', 'complex'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'agent',
        usageCount: 5,
        lastUsed: new Date(),
        version: 2
      }
    };
  }

  /**
   * Create an invalid custom function for error testing
   */
  createInvalidFunction(name: string = 'invalidFunction'): CustomFunction {
    return {
      id: randomUUID(),
      name,
      description: 'Invalid function for error testing',
      parameters: {
        input: { type: 'string', description: 'Test input' }
      },
      returnType: 'string',
      code: `
        function ${name}(input: string): string {
          // This contains syntax error
          return "unclosed string;
        }
      `,
      tags: ['test', 'invalid'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'agent',
        usageCount: 0,
        version: 1
      }
    };
  }

  /**
   * Create a function with security issues for security testing
   */
  createSecurityRiskFunction(name: string = 'securityRiskFunction'): CustomFunction {
    return {
      id: randomUUID(),
      name,
      description: 'Function with security risks for testing validation',
      parameters: {
        input: { type: 'string', description: 'Test input' }
      },
      returnType: 'string',
      code: `
        function ${name}(input: string): string {
          eval('console.log("This is dangerous")');
          return input;
        }
      `,
      tags: ['test', 'security'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'agent',
        usageCount: 0,
        version: 1
      }
    };
  }

  /**
   * Create multiple test functions at once
   */
  createMultipleFunctions(count: number = 3): CustomFunction[] {
    const functions: CustomFunction[] = [];
    
    for (let i = 0; i < count; i++) {
      functions.push(this.createSampleFunction(`testFunction${i + 1}`));
    }
    
    return functions;
  }

  async cleanup(): Promise<void> {
    // Custom functions cleanup is handled by the workspace cleanup
    await super.cleanup();
  }
}