/**
 * Sample functions library for testing
 * Provides a comprehensive set of test functions covering various scenarios
 */

import type { CustomFunction } from '../../../src/server/types/custom-functions.js';
import { randomUUID } from 'crypto';

export const sampleFunctions = {
  /**
   * Simple string manipulation function
   */
  simpleString: {
    id: randomUUID(),
    name: 'formatGreeting',
    description: 'Format a greeting message with name and title',
    parameters: {
      name: { type: 'string', description: "The person's name" },
      title: {
        type: 'string',
        description: 'Optional title',
        optional: true
      }
    },
    returnType: 'string',
    code: `
      function formatGreeting(name: string, title?: string): string {
        if (title) {
          return \`Hello, \${title} \${name}!\`;
        }
        return \`Hello, \${name}!\`;
      }
    `,
    tags: ['string', 'formatting', 'simple'],
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      createdBy: 'agent' as const,
      usageCount: 10,
      lastUsed: new Date('2024-01-15'),
      version: 1
    }
  } as CustomFunction,

  /**
   * Async operation with Promise handling
   */
  asyncOperation: {
    id: randomUUID(),
    name: 'processDataAsync',
    description: 'Process data asynchronously with delay',
    parameters: {
      data: { type: 'object', description: 'Data to process' },
      delayMs: {
        type: 'number',
        description: 'Processing delay in milliseconds',
        optional: true,
        default: 100
      }
    },
    returnType: 'Promise<object>',
    code: `
      async function processDataAsync(data: object, delayMs?: number): Promise<object> {
        await new Promise(resolve => setTimeout(resolve, delayMs || 100));
        return {
          processed: true,
          timestamp: new Date().toISOString(),
          originalData: data,
          processingTime: delayMs || 100
        };
      }
    `,
    tags: ['async', 'processing', 'promise'],
    metadata: {
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-10'),
      createdBy: 'agent' as const,
      usageCount: 25,
      lastUsed: new Date('2024-01-20'),
      version: 2
    }
  } as CustomFunction,

  /**
   * Daily note management function
   */
  noteManagement: {
    id: randomUUID(),
    name: 'createOrUpdateDailyNote',
    description: 'Create or update a daily note with specified content',
    parameters: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format',
        optional: true
      },
      content: { type: 'string', description: 'Note content to add' },
      section: {
        type: 'string',
        description: 'Section to update',
        optional: true
      }
    },
    returnType: 'Promise<string>',
    code: `
      async function createOrUpdateDailyNote(
        content: string, 
        date?: string,
        section?: string
      ): Promise<string> {
        const noteDate = date || new Date().toISOString().split('T')[0];
        const notePath = \`daily/$\{noteDate}.md\`;
        
        // Simulate note creation/update
        const sectionHeader = section ? \`## $\{section}\\n\` : '';
        const timestamp = new Date().toISOString();
        
        return \`Updated note at $\{notePath} with content in section '$\{section || 'main'}' at $\{timestamp}\`;
      }
    `,
    tags: ['notes', 'daily', 'management'],
    metadata: {
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-18'),
      createdBy: 'agent' as const,
      usageCount: 50,
      lastUsed: new Date('2024-01-22'),
      version: 3
    }
  } as CustomFunction,

  /**
   * Function designed to test error handling
   */
  errorProne: {
    id: randomUUID(),
    name: 'errorTestFunction',
    description: 'Function that throws errors based on input for testing error handling',
    parameters: {
      input: { type: 'string', description: 'Input string' },
      shouldThrow: {
        type: 'boolean',
        description: 'Whether to throw an error',
        optional: true
      }
    },
    returnType: 'string',
    code: `
      function errorTestFunction(input: string, shouldThrow?: boolean): string {
        if (shouldThrow || input === 'ERROR') {
          throw new Error('Intentional test error: ' + input);
        }
        
        if (input === 'UNDEFINED') {
          return undefined as any;
        }
        
        if (input === 'NULL') {
          return null as any;
        }
        
        return 'Processed: ' + input;
      }
    `,
    tags: ['error', 'testing', 'validation'],
    metadata: {
      createdAt: new Date('2024-01-04'),
      updatedAt: new Date('2024-01-04'),
      createdBy: 'agent' as const,
      usageCount: 5,
      lastUsed: new Date('2024-01-10'),
      version: 1
    }
  } as CustomFunction,

  /**
   * Function with complex parameter types
   */
  complexTypes: {
    id: randomUUID(),
    name: 'processComplexData',
    description: 'Process data with complex nested types',
    parameters: {
      config: {
        type: '{ mode: "strict" | "loose"; options: { timeout: number; retries?: number } }',
        description: 'Configuration object with nested types'
      },
      items: {
        type: 'Array<{ id: string; data: Record<string, any>; tags: string[] }>',
        description: 'Array of items with complex structure'
      },
      callback: {
        type: '((item: any) => boolean) | null',
        description: 'Optional callback function',
        optional: true
      }
    },
    returnType: 'Promise<{ processed: number; failed: number; results: any[] }>',
    code: `
      async function processComplexData(
        config: { mode: "strict" | "loose"; options: { timeout: number; retries?: number } },
        items: Array<{ id: string; data: Record<string, any>; tags: string[] }>,
        callback?: ((item: any) => boolean) | null
      ): Promise<{ processed: number; failed: number; results: any[] }> {
        const results = [];
        let processed = 0;
        let failed = 0;
        
        for (const item of items) {
          try {
            if (callback && !callback(item)) {
              failed++;
              continue;
            }
            
            const result = {
              id: item.id,
              processedData: item.data,
              tags: item.tags,
              mode: config.mode,
              processedAt: new Date().toISOString()
            };
            
            results.push(result);
            processed++;
          } catch (error) {
            failed++;
          }
        }
        
        return { processed, failed, results };
      }
    `,
    tags: ['complex', 'types', 'processing'],
    metadata: {
      createdAt: new Date('2024-01-05'),
      updatedAt: new Date('2024-01-15'),
      createdBy: 'agent' as const,
      usageCount: 15,
      lastUsed: new Date('2024-01-21'),
      version: 2
    }
  } as CustomFunction,

  /**
   * Function for security testing (contains security violations)
   */
  securityTest: {
    id: randomUUID(),
    name: 'securityViolationTest',
    description: 'Function with security violations for testing validation',
    parameters: {
      input: { type: 'string', description: 'Input string' }
    },
    returnType: 'string',
    code: `
      function securityViolationTest(input: string): string {
        // Multiple security violations for testing
        eval('console.log("This should be blocked")');
        const dynamicFunc = new Function('return "Dynamic function creation"');
        require('fs');
        process.env.SECRET = 'leaked';
        global.malicious = 'data';
        
        while (true) {
          // Infinite loop
          break;
        }
        
        return input;
      }
    `,
    tags: ['security', 'violation', 'testing'],
    metadata: {
      createdAt: new Date('2024-01-06'),
      updatedAt: new Date('2024-01-06'),
      createdBy: 'agent' as const,
      usageCount: 0,
      version: 1
    }
  } as CustomFunction
};

/**
 * Get all sample functions as an array
 */
export function getAllSampleFunctions(): CustomFunction[] {
  return Object.values(sampleFunctions);
}

/**
 * Get sample functions by tag
 */
export function getSampleFunctionsByTag(tag: string): CustomFunction[] {
  return getAllSampleFunctions().filter((func) => func.tags.includes(tag));
}

/**
 * Get a sample function by name
 */
export function getSampleFunctionByName(name: string): CustomFunction | undefined {
  return getAllSampleFunctions().find((func) => func.name === name);
}
