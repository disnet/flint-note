import { z } from 'zod';
import { NoteService } from './note-service';
import { logger } from './logger';
import { EnhancedWASMCodeEvaluator } from '../server/api/enhanced-wasm-code-evaluator.js';
import type { TypeScriptDiagnostic } from '../server/api/typescript-compiler.js';

interface EnhancedEvaluateResult {
  success: boolean;
  data?: {
    result: unknown;
    executionTime: number;
  };
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

export const enhancedEvaluateCodeSchema = z.object({
  code: z
    .string()
    .describe(
      'TypeScript code to execute in the sandbox with strict type checking. Must define `async function main() { return result; }`. Has access to typed APIs: notes, noteTypes, vaults, links, hierarchy, relationships, and utils.'
    ),
  typesOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe('Return type checking results without executing code (debugging only)')
});

export type EnhancedEvaluateCodeInput = z.infer<typeof enhancedEvaluateCodeSchema>;

export class EnhancedEvaluateNoteCode {
  private wasmEvaluator: EnhancedWASMCodeEvaluator | null = null;

  constructor(
    private noteService: NoteService | null,
    workspaceRoot?: string
  ) {
    if (noteService) {
      this.wasmEvaluator = new EnhancedWASMCodeEvaluator(
        noteService.getFlintNoteApi(),
        workspaceRoot
      );
    }
  }

  private async resolveVaultId(vault_id?: string | null): Promise<string> {
    if (vault_id) {
      return vault_id;
    }

    if (!this.noteService) {
      throw new Error('Note service not available');
    }

    const currentVault = await this.noteService.getCurrentVault();
    if (!currentVault) {
      throw new Error('No vault specified and no current vault available');
    }

    return currentVault.id;
  }

  async execute(
    { code, typesOnly = false }: EnhancedEvaluateCodeInput,
    vault_id?: string | null
  ): Promise<EnhancedEvaluateResult> {
    try {
      if (!this.wasmEvaluator) {
        return {
          success: false,
          error: 'Enhanced code evaluator not available',
          message: 'Enhanced WASM code evaluator not initialized'
        };
      }

      const resolvedVaultId = await this.resolveVaultId(vault_id);

      const result = await this.wasmEvaluator.evaluate({
        code,
        vaultId: resolvedVaultId,
        typesOnly,
        timeout: 10000
      });

      // Handle type-check-only requests
      if (typesOnly) {
        return {
          success: result.success,
          compilation: result.compilation
            ? {
                success: result.compilation.success,
                errors: this.formatDiagnostics(result.compilation.errors),
                warnings: this.formatDiagnostics(result.compilation.warnings)
              }
            : undefined,
          message: result.compilation?.errors.length
            ? `Found ${result.compilation.errors.length} type error(s)`
            : 'Type checking passed successfully'
        };
      }

      // Handle successful execution
      if (result.success) {
        const response: EnhancedEvaluateResult = {
          success: true,
          data: {
            result: result.result,
            executionTime: result.executionTime
          },
          message: `Code executed successfully in ${result.executionTime}ms`
        };

        // Include compilation info if TypeScript was used
        if (result.compilation) {
          response.compilation = {
            success: result.compilation.success,
            errors: this.formatDiagnostics(result.compilation.errors),
            warnings: this.formatDiagnostics(result.compilation.warnings)
          };

          if (result.compilation.warnings.length > 0) {
            response.message += ` (${result.compilation.warnings.length} warning(s))`;
          }
        }

        return response;
      } else {
        const response: EnhancedEvaluateResult = {
          success: false,
          error: result.error,
          message: `Code execution failed: ${result.error}`
        };

        // Include compilation errors for better debugging
        if (result.compilation) {
          response.compilation = {
            success: result.compilation.success,
            errors: this.formatDiagnostics(result.compilation.errors),
            warnings: this.formatDiagnostics(result.compilation.warnings)
          };

          // Enhance error message with compilation context
          if (result.compilation.errors.length > 0) {
            const firstError = result.compilation.errors[0];
            response.message =
              `TypeScript Error [${firstError.code}]: ${firstError.messageText}\n` +
              `  At line ${firstError.line}, column ${firstError.column}\n` +
              `  Source: ${firstError.source}` +
              ((firstError as TypeScriptDiagnostic & { suggestion?: string }).suggestion
                ? `\n  Suggestion: ${(firstError as TypeScriptDiagnostic & { suggestion?: string }).suggestion}`
                : '');
          }
        }

        return response;
      }
    } catch (error) {
      logger.error('Error in enhanced evaluate_note_code', { error, typesOnly });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: `Failed to execute TypeScript code: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private formatDiagnostics(diagnostics: TypeScriptDiagnostic[]): Array<{
    code: number;
    message: string;
    line: number;
    column: number;
    source: string;
    suggestion?: string;
  }> {
    return diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.messageText,
      line: diagnostic.line,
      column: diagnostic.column,
      source: diagnostic.source,
      suggestion: (diagnostic as TypeScriptDiagnostic & { suggestion?: string })
        .suggestion
    }));
  }
}
