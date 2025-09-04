/**
 * Enhanced WebAssembly Code Evaluator with TypeScript Support
 *
 * Extends the existing WASM code evaluator to support TypeScript compilation
 * with comprehensive type checking and detailed error feedback for AI agents.
 */

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
}

export class EnhancedWASMCodeEvaluator extends WASMCodeEvaluator {
  private typeScriptCompiler: TypeScriptCompiler;

  constructor(noteApi: FlintNoteApi) {
    super(noteApi);
    this.typeScriptCompiler = new TypeScriptCompiler();
  }

  async evaluate(
    options: EnhancedWASMCodeEvaluationOptions
  ): Promise<EnhancedWASMCodeEvaluationResult> {
    const startTime = Date.now();
    let compilationResult: CompilationResult | undefined;

    try {
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

      // Phase 3: Execute compiled JavaScript using parent WASM evaluator
      const codeToExecute = compilationResult.compiledJavaScript || options.code;
      const executionResult = await super.evaluate({
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
        // Try to map runtime error back to TypeScript source using source maps
        // For now, we'll provide basic context enhancement
        enhancedResult.errorContext = {
          line: 1, // Would need source map parsing for accurate line mapping
          column: 1,
          source: 'Runtime error during execution',
          suggestion: this.getExecutionErrorSuggestion(
            executionResult.errorDetails.type,
            executionResult.errorDetails.message
          )
        };
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

  private getExecutionErrorSuggestion(errorType: string, errorMessage: string): string {
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
      return 'Promise was rejected. Check async operations and error handling in your code.';
    }

    return 'Check the error message for specific details and verify your code logic.';
  }
}
