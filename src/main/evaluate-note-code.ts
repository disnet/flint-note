import { z } from 'zod';
import { NoteService } from './note-service';
import { logger } from './logger';
import { WASMCodeEvaluator } from '../server/api/wasm-code-evaluator.js';

interface EvaluateResult {
  success: boolean;
  data?: {
    result: unknown;
    executionTime: number;
  };
  error?: string;
  message: string;
}

export const evaluateCodeSchema = z.object({
  code: z
    .string()
    .describe(
      'JavaScript code to execute in the sandbox. Must define `async function main() { return result; }`. Has access to notes, noteTypes, vaults, links, hierarchy, relationships, and utils APIs.'
    )
});

export type EvaluateCodeInput = z.infer<typeof evaluateCodeSchema>;

export class EvaluateNoteCode {
  private wasmEvaluator: WASMCodeEvaluator | null = null;

  constructor(private noteService: NoteService | null) {
    if (noteService) {
      this.wasmEvaluator = new WASMCodeEvaluator(noteService.getFlintNoteApi());
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
    { code }: EvaluateCodeInput,
    vault_id?: string | null
  ): Promise<EvaluateResult> {
    try {
      if (!this.wasmEvaluator) {
        return {
          success: false,
          error: 'Code evaluator not available',
          message: 'WASM code evaluator not initialized'
        };
      }

      const resolvedVaultId = await this.resolveVaultId(vault_id);

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
        };
      } else {
        return {
          success: false,
          error: result.error,
          message: `Code execution failed: ${result.error}`
        };
      }
    } catch (error) {
      logger.error('Error in evaluate_note_code', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
