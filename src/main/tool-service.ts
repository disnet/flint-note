import { Tool, tool } from 'ai';
import { NoteService } from './note-service';
import {
  EnhancedEvaluateNoteCode,
  enhancedEvaluateCodeSchema
} from './enhanced-evaluate-note-code';

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

  constructor(private noteService: NoteService | null) {
    this.evaluateNoteCode = new EnhancedEvaluateNoteCode(noteService);
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
      'Execute TypeScript code in secure WebAssembly sandbox with strict type checking and access to FlintNote API. ' +
      'Provides compile-time type safety and comprehensive error feedback. ' +
      'Your code must define an async function called main() that returns the result.',
    inputSchema: enhancedEvaluateCodeSchema,
    execute: async ({ code, typesOnly = false }) => {
      return (await this.evaluateNoteCode.execute({ code, typesOnly })) as ToolResponse;
    }
  });
}
