/**
 * Enhanced WebAssembly Code Evaluator with TypeScript Support
 *
 * Extends the existing WASM code evaluator to support TypeScript compilation
 * with comprehensive type checking and detailed error feedback for AI agents.
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import type { AsyncOperationRegistry } from './wasm-code-evaluator.js';
import type { FlintNoteApi } from './flint-note-api.js';
import {
  WASMCodeEvaluator,
  type WASMCodeEvaluationOptions,
  type WASMCodeEvaluationResult
} from './wasm-code-evaluator.js';
import {
  TypeScriptCompiler,
  type TypeScriptDiagnostic,
  type CompilationResult
} from './typescript-compiler.js';
import { CustomFunctionsExecutor } from './custom-functions-executor.js';
import { CustomFunctionsStore } from '../core/custom-functions-store.js';

export interface EnhancedWASMCodeEvaluationOptions
  extends Omit<WASMCodeEvaluationOptions, 'code'> {
  code: string; // TypeScript code
  typesOnly?: boolean; // Return type errors without execution (debugging)
}

export interface EnhancedWASMCodeEvaluationResult extends WASMCodeEvaluationResult {
  // Enhanced compilation results
  compilation?: {
    success: boolean;
    errors: TypeScriptDiagnostic[];
    warnings: TypeScriptDiagnostic[];
    compiledJavaScript?: string;
    sourceMap?: string;
  };

  // Enhanced error context for better debugging
  errorContext?: {
    line: number;
    column: number;
    source: string;
    suggestion?: string;
  };

  // Enhanced error details with additional stack trace info
  errorDetails?: {
    type: 'syntax' | 'runtime' | 'timeout' | 'api' | 'validation' | 'promise';
    message: string;
    suggestion?: string;
    context?: Record<string, unknown>;
    stack?: string;
    enhancedStack?: string[];
  };
}

export class EnhancedWASMCodeEvaluator extends WASMCodeEvaluator {
  private typeScriptCompiler: TypeScriptCompiler;
  private customFunctionsExecutor: CustomFunctionsExecutor | null = null;
  private customFunctionsStore: CustomFunctionsStore | null = null;

  constructor(noteApi: FlintNoteApi, workspaceRoot?: string) {
    super(noteApi);
    this.typeScriptCompiler = new TypeScriptCompiler();

    if (workspaceRoot) {
      this.customFunctionsExecutor = new CustomFunctionsExecutor(workspaceRoot);
      this.customFunctionsStore = new CustomFunctionsStore(workspaceRoot);
    }
  }

  async evaluate(
    options: EnhancedWASMCodeEvaluationOptions
  ): Promise<EnhancedWASMCodeEvaluationResult> {
    const startTime = Date.now();
    let compilationResult: CompilationResult | undefined;

    try {
      // Load custom functions for type checking
      if (this.customFunctionsStore) {
        try {
          const customFunctions = await this.customFunctionsStore.list();
          this.typeScriptCompiler.setCustomFunctions(customFunctions);
        } catch (error) {
          // Continue without custom functions if loading fails
          console.warn('Failed to load custom functions for type checking:', error);
        }
      }

      // Phase 1: TypeScript compilation with strict type checking
      compilationResult = await this.typeScriptCompiler.compile(options.code);

      // Return early if only type checking was requested
      if (options.typesOnly) {
        return {
          success: compilationResult.success,
          compilation: {
            success: compilationResult.success,
            errors: compilationResult.diagnostics.filter((d) => d.category === 'error'),
            warnings: compilationResult.diagnostics.filter(
              (d) => d.category === 'warning' || d.category === 'suggestion'
            ),
            compiledJavaScript: compilationResult.compiledJavaScript,
            sourceMap: compilationResult.sourceMap
          },
          executionTime: Date.now() - startTime
        };
      }

      // Phase 2: Check if compilation was successful
      if (!compilationResult.success) {
        const firstError = compilationResult.diagnostics.find(
          (d) => d.category === 'error'
        );

        return {
          success: false,
          error: 'TypeScript compilation failed',
          errorDetails: {
            type: 'syntax',
            message: firstError
              ? firstError.messageText
              : 'TypeScript compilation failed',
            suggestion:
              firstError &&
              (firstError as TypeScriptDiagnostic & { suggestion?: string }).suggestion
                ? (firstError as TypeScriptDiagnostic & { suggestion?: string })
                    .suggestion
                : 'Fix the TypeScript compilation errors.',
            context: {
              compilationErrors: compilationResult.diagnostics.filter(
                (d) => d.category === 'error'
              ).length,
              compilationWarnings: compilationResult.diagnostics.filter(
                (d) => d.category === 'warning'
              ).length
            }
          },
          compilation: {
            success: false,
            errors: compilationResult.diagnostics.filter((d) => d.category === 'error'),
            warnings: compilationResult.diagnostics.filter(
              (d) => d.category === 'warning' || d.category === 'suggestion'
            )
          },
          errorContext: firstError
            ? {
                line: firstError.line,
                column: firstError.column,
                source: firstError.source,
                suggestion: (firstError as TypeScriptDiagnostic & { suggestion?: string })
                  .suggestion
              }
            : undefined,
          executionTime: Date.now() - startTime
        };
      }

      // Phase 3: Execute compiled JavaScript using parent WASM evaluator with custom functions
      const codeToExecute = compilationResult.compiledJavaScript || options.code;
      const executionResult = await this.evaluateWithCustomFunctions({
        ...options,
        code: codeToExecute
      });

      // Phase 4: Combine compilation and execution results
      const enhancedResult: EnhancedWASMCodeEvaluationResult = {
        ...executionResult,
        compilation: {
          success: compilationResult.success,
          errors: compilationResult.diagnostics.filter((d) => d.category === 'error'),
          warnings: compilationResult.diagnostics.filter(
            (d) => d.category === 'warning' || d.category === 'suggestion'
          ),
          compiledJavaScript: compilationResult.compiledJavaScript,
          sourceMap: compilationResult.sourceMap
        }
      };

      // Add enhanced error context for runtime errors
      if (!executionResult.success && executionResult.errorDetails) {
        // Enhanced error context with better stack trace analysis
        const stackInfo = this.parseStackTrace(executionResult.errorDetails.stack);
        enhancedResult.errorContext = {
          line: stackInfo.line || 1,
          column: stackInfo.column || 1,
          source: stackInfo.source || 'Runtime error during execution',
          suggestion: this.getExecutionErrorSuggestion(
            executionResult.errorDetails.type,
            executionResult.errorDetails.message,
            stackInfo
          )
        };

        // Add stack trace information if available
        if (executionResult.errorDetails.stack) {
          enhancedResult.errorDetails = {
            ...executionResult.errorDetails,
            enhancedStack: this.formatStackTrace(executionResult.errorDetails.stack),
            context: {
              ...executionResult.errorDetails.context,
              parsedStack: stackInfo
            }
          };
        }
      }

      return enhancedResult;
    } catch (error) {
      return {
        success: false,
        error: `Enhanced TypeScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        errorDetails: {
          type: 'runtime',
          message: error instanceof Error ? error.message : String(error),
          suggestion:
            'Internal error during TypeScript compilation or execution. Check your code syntax and API usage.',
          context: { step: 'typescript_evaluation' },
          stack: error instanceof Error ? error.stack : undefined
        },
        compilation: compilationResult
          ? {
              success: compilationResult.success,
              errors: compilationResult.diagnostics.filter((d) => d.category === 'error'),
              warnings: compilationResult.diagnostics.filter(
                (d) => d.category === 'warning' || d.category === 'suggestion'
              )
            }
          : undefined,
        executionTime: Date.now() - startTime
      };
    }
  }

  private parseStackTrace(stack?: string): {
    line?: number;
    column?: number;
    source?: string;
    functionName?: string;
  } {
    if (!stack) return {};

    try {
      // Parse JavaScript stack trace to extract meaningful information
      const lines = stack.split('\n');
      for (const line of lines) {
        // Look for patterns like "at functionName (file:line:column)" or "at file:line:column"
        const match = line.match(/at\s+(?:(.+?)\s+\()?(?:.*?):(\d+):(\d+)/);
        if (match) {
          const [, functionName, lineStr, columnStr] = match;
          return {
            line: parseInt(lineStr, 10),
            column: parseInt(columnStr, 10),
            functionName: functionName?.trim(),
            source: `Error in ${functionName ? `function '${functionName}'` : 'code'} at line ${lineStr}`
          };
        }
      }

      // Fallback: look for just line numbers
      const lineMatch = stack.match(/(\d+):(\d+)/);
      if (lineMatch) {
        return {
          line: parseInt(lineMatch[1], 10),
          column: parseInt(lineMatch[2], 10),
          source: `Error at line ${lineMatch[1]}`
        };
      }
    } catch (error) {
      // If parsing fails, return basic info
      console.warn('Failed to parse stack trace:', error);
    }

    return { source: 'Runtime error (stack trace parsing failed)' };
  }

  private formatStackTrace(stack: string): string[] {
    try {
      return stack
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.trim())
        .slice(0, 10); // Limit to first 10 stack frames
    } catch {
      return [stack];
    }
  }

  private getExecutionErrorSuggestion(
    errorType: string,
    errorMessage: string,
    stackInfo?: { line?: number; column?: number; source?: string; functionName?: string }
  ): string {
    if (errorType === 'timeout') {
      return 'Operation took too long. Consider reducing complexity, adding pagination, or increasing timeout.';
    }

    if (errorType === 'api') {
      if (errorMessage.includes('not found')) {
        return 'The requested resource was not found. Verify IDs and check that the resource exists.';
      }
      if (errorMessage.includes('hash')) {
        return 'Content hash mismatch. Fetch the latest version of the note to get the current content_hash.';
      }
      if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
        return 'Access denied. Check API permissions and vault access rights.';
      }
      return 'API call failed. Verify parameters match the expected types and required fields are provided.';
    }

    if (errorType === 'validation') {
      return 'Parameter validation failed. Check that all required parameters are provided with correct types.';
    }

    if (errorType === 'promise') {
      const suggestion =
        'Promise was rejected. Check async operations and error handling in your code.';
      return stackInfo?.functionName
        ? `${suggestion} Error occurred in function '${stackInfo.functionName}'.`
        : suggestion;
    }

    // Custom function specific errors
    if (errorMessage.includes('customFunctions')) {
      return 'Custom function error. Check that the function exists and parameters are correct. Use list_custom_functions to see available functions.';
    }

    if (errorMessage.includes('ReferenceError')) {
      return 'Variable or function not defined. Check spelling and ensure all variables are declared before use.';
    }

    if (errorMessage.includes('TypeError') && errorMessage.includes('undefined')) {
      return 'Trying to access property of undefined. Add null checks: if (obj) { ... } or use optional chaining: obj?.property';
    }

    if (errorMessage.includes('SyntaxError')) {
      return 'Syntax error in code. Check for missing brackets, semicolons, or incorrect TypeScript syntax.';
    }

    const baseMessage =
      'Check the error message for specific details and verify your code logic.';
    return stackInfo?.line
      ? `${baseMessage} Error occurred at line ${stackInfo.line}.`
      : baseMessage;
  }

  /**
   * Evaluate code with custom functions injection
   */
  private async evaluateWithCustomFunctions(
    options: WASMCodeEvaluationOptions
  ): Promise<WASMCodeEvaluationResult> {
    if (!this.customFunctionsExecutor) {
      // No custom functions available, use parent implementation
      return await super.evaluate(options);
    }

    // Override the base evaluate method to inject custom functions
    return await this.evaluateWithCustomFunctionsInternal(options);
  }

  /**
   * Internal implementation that extends parent evaluation with custom functions
   */
  private async evaluateWithCustomFunctionsInternal(
    options: WASMCodeEvaluationOptions
  ): Promise<WASMCodeEvaluationResult> {
    if (!this.customFunctionsExecutor) {
      return await super.evaluate(options);
    }

    try {
      // Set custom functions for TypeScript type checking
      const customFunctions = await this.customFunctionsStore!.list();
      this.typeScriptCompiler.setCustomFunctions(customFunctions);

      // Compile the user code with TypeScript (this includes custom function types)
      const compilationResult = await this.typeScriptCompiler.compile(options.code);

      if (!compilationResult.success) {
        const firstError = compilationResult.diagnostics.find(
          (d) => d.category === 'error'
        );
        return {
          success: false,
          error: 'Custom function enhanced code compilation failed',
          errorDetails: {
            type: 'syntax',
            message: firstError?.messageText || 'Compilation failed',
            suggestion: 'Check custom function definitions and user code syntax'
          },
          compilation: {
            success: false,
            errors: compilationResult.diagnostics.filter((d) => d.category === 'error'),
            warnings: compilationResult.diagnostics.filter(
              (d) => d.category === 'warning' || d.category === 'suggestion'
            )
          },
          executionTime: 0
        } as EnhancedWASMCodeEvaluationResult;
      }

      // Get compiled JavaScript
      const compiledUserCode = compilationResult.compiledJavaScript || options.code;

      // Generate custom functions implementation and prepend to compiled JavaScript
      const customFunctionsCode =
        await this.customFunctionsExecutor.generateNamespaceCode();
      const finalJavaScript = customFunctionsCode + '\n\n' + compiledUserCode;

      // Debug logging can be removed in production

      // Call the base WASM evaluator with the final JavaScript
      // We need to inject the custom functions management API
      const wasmResult = await this.evaluateWithCustomFunctionsAPI({
        ...options,
        code: finalJavaScript
      });

      // Add compilation info to result
      return {
        ...wasmResult,
        compilation: {
          success: true,
          errors: [],
          warnings: compilationResult.diagnostics.filter(
            (d) => d.category === 'warning' || d.category === 'suggestion'
          ),
          compiledJavaScript: finalJavaScript,
          sourceMap: compilationResult.sourceMap
        }
      } as EnhancedWASMCodeEvaluationResult;
    } catch (error) {
      // If custom functions generation fails, fall back to regular evaluation
      console.error('Failed to generate custom functions namespace:', error);
      return await super.evaluate(options);
    }
  }

  /**
   * Get available custom functions for system prompt
   */
  async getCustomFunctionsForPrompt(): Promise<string> {
    if (!this.customFunctionsExecutor) {
      return '';
    }

    try {
      const stats = await this.customFunctionsExecutor.getExecutionStats();
      if (stats.totalFunctions === 0) {
        return '';
      }

      // This would need to be implemented to generate the prompt section
      // For Phase 1, return a placeholder
      return `\n## Available Custom Functions\n\nYou have access to ${stats.totalFunctions} custom functions via the \`customFunctions\` namespace.\nUse \`customFunctions._list()\` to see all available functions.\n`;
    } catch (error) {
      console.error('Failed to get custom functions for prompt:', error);
      return '';
    }
  }

  /**
   * Set workspace root for custom functions
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.customFunctionsExecutor = new CustomFunctionsExecutor(workspaceRoot);
    this.customFunctionsStore = new CustomFunctionsStore(workspaceRoot);
  }

  /**
   * Evaluate code with custom functions management API injected
   */
  private async evaluateWithCustomFunctionsAPI(
    options: WASMCodeEvaluationOptions
  ): Promise<WASMCodeEvaluationResult> {
    // Store the original method reference
    const originalInjectSecureAPI = this.injectSecureAPI;

    // Override injectSecureAPI to add custom functions management
    this.injectSecureAPI = (
      vm: QuickJSContext,
      registry: AsyncOperationRegistry,
      vaultId: string,
      allowedAPIs?: string[],
      customContext?: Record<string, unknown>
    ) => {
      // Call parent implementation first
      originalInjectSecureAPI.call(
        this,
        vm,
        registry,
        vaultId,
        allowedAPIs,
        customContext
      );

      // Add custom functions management API
      this.injectCustomFunctionsManagementAPI(vm, registry);
    };

    try {
      // Call parent evaluate which will use our overridden injectSecureAPI
      const result = await WASMCodeEvaluator.prototype.evaluate.call(this, options);
      return result;
    } finally {
      // Restore original method
      this.injectSecureAPI = originalInjectSecureAPI;
    }
  }

  /**
   * Inject custom functions management API into VM context
   */
  private injectCustomFunctionsManagementAPI(
    vm: QuickJSContext,
    registry: AsyncOperationRegistry
  ): void {
    if (!this.customFunctionsStore) return;

    // Create customFunctionsAPI object for management operations
    const cfApiObj = vm.newObject();
    vm.setProp(vm.global, 'customFunctionsAPI', cfApiObj);

    // _listFunctions - list all custom functions
    const listFn = vm.newFunction('_listFunctions', () => {
      const hostPromise = this.customFunctionsStore!.list();
      return this.promiseFactory.createProxy(vm, registry, hostPromise);
    });
    vm.setProp(cfApiObj, 'list', listFn);
    listFn.dispose();

    // _removeFunction - remove a custom function by name
    const removeFn = vm.newFunction('_removeFunction', (nameArg) => {
      const name = vm.getString(nameArg);
      const hostPromise = this.removeCustomFunctionByName(name);
      return this.promiseFactory.createProxy(vm, registry, hostPromise);
    });
    vm.setProp(cfApiObj, 'remove', removeFn);
    removeFn.dispose();

    cfApiObj.dispose();
  }

  /**
   * Helper method to remove a custom function by name
   */
  private async removeCustomFunctionByName(name: string): Promise<boolean> {
    if (!this.customFunctionsStore) return false;

    try {
      const functions = await this.customFunctionsStore.list();
      const functionToRemove = functions.find((f) => f.name === name);

      if (functionToRemove) {
        await this.customFunctionsStore.delete(functionToRemove.id);
        // Clear the compiled functions cache
        if (this.customFunctionsExecutor) {
          this.customFunctionsExecutor.clearCache();
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to remove custom function '${name}':`, error);
      return false;
    }
  }
}
