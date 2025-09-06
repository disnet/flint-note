import { Tool, tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';
import {
  EnhancedEvaluateNoteCode,
  enhancedEvaluateCodeSchema
} from './enhanced-evaluate-note-code';
import { CustomFunctionsApi } from '../server/api/custom-functions-api.js';

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
  compilation?: {
    success: boolean;
    errors: Array<{
      code: number;
      message: string;
      line: number;
      column: number;
      source: string;
      suggestion?: string;
    }>;
    warnings: Array<{
      code: number;
      message: string;
      line: number;
      column: number;
      source: string;
    }>;
  };
}

export class ToolService {
  private evaluateNoteCode: EnhancedEvaluateNoteCode;
  private customFunctionsApi: CustomFunctionsApi | null = null;

  constructor(
    private noteService: NoteService | null,
    workspaceRoot?: string
  ) {
    this.evaluateNoteCode = new EnhancedEvaluateNoteCode(noteService, workspaceRoot);
    if (workspaceRoot) {
      this.customFunctionsApi = new CustomFunctionsApi(workspaceRoot);
    }
  }

  getTools(): Record<string, Tool> | undefined {
    if (!this.noteService) {
      return undefined;
    }

    const tools: Record<string, Tool> = {
      evaluate_note_code: this.evaluateNoteCodeTool
    };

    // Add custom functions tools if available
    if (this.customFunctionsApi) {
      tools.register_custom_function = this.registerCustomFunctionTool;
      tools.test_custom_function = this.testCustomFunctionTool;
      tools.list_custom_functions = this.listCustomFunctionsTool;
      tools.validate_custom_function = this.validateCustomFunctionTool;
      tools.delete_custom_function = this.deleteCustomFunctionTool;
    }

    return tools;
  }

  private evaluateNoteCodeTool = tool({
    description:
      'Execute TypeScript code in secure WebAssembly sandbox with strict type checking and access to FlintNote API. ' +
      'Provides compile-time type safety and comprehensive error feedback. ' +
      'Your code must define an async function called main() that returns the result.',
    inputSchema: enhancedEvaluateCodeSchema,
    execute: async ({ code, typesOnly = false }) => {
      return (await this.evaluateNoteCode.execute({ code, typesOnly })) as ToolResponse;
    }
  });

  private registerCustomFunctionTool = tool({
    description:
      'Register a reusable custom function that can be called in future code evaluations via the customFunctions namespace. ' +
      'Functions are persisted per-vault and automatically available in the TypeScript environment.',
    inputSchema: z.object({
      name: z.string().describe('Function name (valid TypeScript identifier)'),
      description: z
        .string()
        .describe('Human-readable description of what the function does'),
      parameters: z
        .record(
          z.string(),
          z.object({
            type: z
              .string()
              .describe('TypeScript type (e.g., "string", "number", "Note[]")'),
            description: z.string().optional().describe('Parameter description'),
            optional: z.boolean().optional().describe('Whether parameter is optional'),
            default: z.unknown().optional().describe('Default value if optional')
          })
        )
        .describe('Parameter definitions'),
      returnType: z
        .string()
        .describe('Return type (e.g., "Note", "void", "Promise<Note[]>")'),
      code: z.string().describe('Complete TypeScript function implementation'),
      tags: z.array(z.string()).optional().describe('Optional organizational tags')
    }),
    execute: async ({ name, description, parameters, returnType, code, tags }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const customFunction = await this.customFunctionsApi.registerFunction({
          name,
          description,
          parameters: parameters as Record<
            string,
            {
              type: string;
              description?: string;
              optional?: boolean;
              default?: unknown;
            }
          >,
          returnType,
          code,
          tags
        });

        return {
          success: true,
          data: {
            id: customFunction.id,
            name: customFunction.name,
            description: customFunction.description,
            usageCount: customFunction.metadata.usageCount
          },
          message: `Custom function '${name}' registered successfully. It can now be called via customFunctions.${name}() in code evaluations.`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to register custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private testCustomFunctionTool = tool({
    description:
      'Test a registered custom function with provided parameters. Validates the function execution and returns results.',
    inputSchema: z.object({
      name: z.string().describe('Name of the custom function to test'),
      parameters: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Parameters to pass to the function')
    }),
    execute: async ({ name, parameters = {} }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        // Get the function definition to validate parameters
        const func = await this.customFunctionsApi.getFunction({ name });
        if (!func) {
          return {
            success: false,
            error: `Custom function '${name}' not found`,
            message: `No custom function named '${name}' is registered`
          };
        }

        // Create test code that calls the function

        const testCode = `
          async function main() {
            try {
              const result = await customFunctions.${name}(${Object.entries(parameters)
                .map(([, value]) => JSON.stringify(value))
                .join(', ')});
              return {
                success: true,
                result,
                type: typeof result
              };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
              };
            }
          }
        `;

        // Execute the test using the evaluate code tool
        const testResult = await this.evaluateNoteCode.execute({
          code: testCode,
          typesOnly: false
        });

        if (testResult.success && testResult.data?.result) {
          const functionResult = testResult.data.result as {
            success: boolean;
            result?: unknown;
            error?: string;
            stack?: string;
          };

          if (functionResult.success) {
            return {
              success: true,
              data: {
                functionResult: functionResult.result,
                executionTime: testResult.data.executionTime,
                parameters: parameters
              },
              message: `Custom function '${name}' executed successfully`
            };
          } else {
            return {
              success: false,
              error: functionResult.error,
              message: `Custom function '${name}' execution failed: ${functionResult.error}`
            };
          }
        } else {
          return {
            success: false,
            error: testResult.error,
            message: `Failed to test custom function '${name}': ${testResult.error}`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Error testing custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private listCustomFunctionsTool = tool({
    description: 'List all registered custom functions with their details.',
    inputSchema: z.object({
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      searchQuery: z.string().optional().describe('Search query to filter functions')
    }),
    execute: async ({ tags, searchQuery }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const functions = await this.customFunctionsApi.listFunctions({
          tags,
          searchQuery
        });

        return {
          success: true,
          data: {
            functions: functions.map((func) => ({
              id: func.id,
              name: func.name,
              description: func.description,
              parameters: func.parameters,
              returnType: func.returnType,
              tags: func.tags,
              usageCount: func.metadata.usageCount,
              lastUsed: func.metadata.lastUsed?.toISOString(),
              createdAt: func.metadata.createdAt.toISOString()
            })),
            count: functions.length
          },
          message: `Found ${functions.length} custom function(s)`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to list custom functions: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private validateCustomFunctionTool = tool({
    description:
      'Validate a custom function definition without registering it. Useful for checking syntax and types.',
    inputSchema: z.object({
      name: z.string().describe('Function name to validate'),
      description: z.string().describe('Function description'),
      parameters: z
        .record(
          z.string(),
          z.object({
            type: z.string(),
            description: z.string().optional(),
            optional: z.boolean().optional(),
            default: z.unknown().optional()
          })
        )
        .describe('Parameter definitions'),
      returnType: z.string().describe('Return type'),
      code: z.string().describe('Function implementation code'),
      tags: z.array(z.string()).optional().describe('Tags')
    }),
    execute: async ({ name, description, parameters, returnType, code, tags }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      try {
        const validation = await this.customFunctionsApi.validateFunction({
          name,
          description,
          parameters: parameters as Record<
            string,
            {
              type: string;
              description?: string;
              optional?: boolean;
              default?: unknown;
            }
          >,
          returnType,
          code,
          tags
        });

        if (validation.valid) {
          return {
            success: true,
            data: {
              valid: true,
              functionName: name,
              parameterCount: Object.keys(parameters).length,
              warnings: validation.warnings?.map((w) => w.message) || []
            },
            message: `Custom function '${name}' validation passed${validation.warnings?.length ? ` with ${validation.warnings.length} warning(s)` : ''}`
          };
        } else {
          return {
            success: false,
            data: {
              valid: false,
              errors: validation.errors.map((e) => ({
                type: e.type,
                message: e.message,
                line: e.line,
                column: e.column
              })),
              warnings: validation.warnings?.map((w) => w.message) || []
            },
            error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
            message: `Custom function '${name}' validation failed with ${validation.errors.length} error(s)`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to validate custom function '${name}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });

  private deleteCustomFunctionTool = tool({
    description:
      'Delete a registered custom function. This permanently removes the function and it will no longer be available for use.',
    inputSchema: z.object({
      id: z.string().optional().describe('ID of the custom function to delete'),
      name: z.string().optional().describe('Name of the custom function to delete')
    }),
    execute: async ({ id, name }) => {
      if (!this.customFunctionsApi) {
        return {
          success: false,
          error: 'Custom functions not available',
          message: 'Custom functions API not initialized'
        };
      }

      // Either id or name must be provided
      if (!id && !name) {
        return {
          success: false,
          error: 'Missing required parameter',
          message: 'Either id or name must be provided to delete a custom function'
        };
      }

      try {
        // If name is provided but not id, look up the function by name
        let functionId = id;
        if (!functionId && name) {
          const func = await this.customFunctionsApi.getFunction({ name });
          if (!func) {
            return {
              success: false,
              error: `Custom function '${name}' not found`,
              message: `No custom function named '${name}' is registered`
            };
          }
          functionId = func.id;
        }

        const result = await this.customFunctionsApi.deleteFunction({ id: functionId! });

        if (result.success) {
          return {
            success: true,
            message: `Custom function ${name ? `'${name}'` : `with ID '${functionId}'`} deleted successfully`
          };
        } else {
          return {
            success: false,
            error: 'Function not found',
            message: `Custom function ${name ? `'${name}'` : `with ID '${functionId}'`} not found`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to delete custom function: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}
