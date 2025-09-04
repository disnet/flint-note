import { Tool, tool } from 'ai';
import { z } from 'zod';
import { NoteService } from './note-service';
import { logger } from './logger';
import { WASMCodeEvaluator } from '../server/api/wasm-code-evaluator.js';

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

export class ToolService {
  private wasmEvaluator: WASMCodeEvaluator | null = null;

  constructor(private noteService: NoteService | null) {
    if (noteService) {
      this.wasmEvaluator = new WASMCodeEvaluator(noteService.getFlintNoteApi());
    }
  }

  /**
   * Resolve vault ID - use provided vault_id or get current vault as fallback
   */
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

  getTools(): Record<string, Tool> | undefined {
    if (!this.noteService) {
      return undefined;
    }

    return {
      evaluate_note_code: this.evaluateNoteCodeTool
    };
  }

  private evaluateNoteCodeTool = tool({
    description:
      'Execute JavaScript code in secure WebAssembly sandbox with access to FlintNote API. This replaces 32+ discrete tools with a single programmable interface allowing complex operations, data analysis, and custom workflows. Your code must define an async function called main() that returns the result.',
    inputSchema: z.object({
      code: z
        .string()
        .describe(
          'JavaScript code to execute in the sandbox. Must define `async function main() { return result; }`. Has access to notes, noteTypes, vaults, links, hierarchy, relationships, and utils APIs.'
        )
    }),
    execute: async ({ code }) => {
      try {
        if (!this.wasmEvaluator) {
          return {
            success: false,
            error: 'Code evaluator not available',
            message: 'WASM code evaluator not initialized'
          } as ToolResponse;
        }

        const resolvedVaultId = await this.resolveVaultId();

        const result = await this.wasmEvaluator.evaluate({
          code,
          vaultId: resolvedVaultId,
          timeout: 10000
        });

        if (result.success) {
          return {
            success: true,
            data: {
              result: result.result,
              executionTime: result.executionTime
            },
            message: `Code executed successfully in ${result.executionTime}ms`
          } as ToolResponse;
        } else {
          return {
            success: false,
            error: result.error,
            message: `Code execution failed: ${result.error}`
          } as ToolResponse;
        }
      } catch (error) {
        logger.error('Error in evaluate_note_code tool', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`
        } as ToolResponse;
      }
    }
  });
}
