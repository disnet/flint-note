import { Tool, tool } from 'ai';
import { NoteService } from './note-service';
import { EvaluateNoteCode, evaluateCodeSchema } from './evaluate-note-code';

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

export class ToolService {
  private evaluateNoteCode: EvaluateNoteCode;

  constructor(private noteService: NoteService | null) {
    this.evaluateNoteCode = new EvaluateNoteCode(noteService);
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
    inputSchema: evaluateCodeSchema,
    execute: async ({ code }) => {
      return (await this.evaluateNoteCode.execute({ code })) as ToolResponse;
    }
  });
}
