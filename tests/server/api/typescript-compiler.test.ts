import { describe, it, expect } from 'vitest';
import { TypeScriptCompiler } from '../../../src/server/api/typescript-compiler.js';

describe('TypeScriptCompiler', () => {
  it('should compile valid TypeScript code without errors', async () => {
    const compiler = new TypeScriptCompiler();

    const validCode = `
async function main(): Promise<string> {
  const message: string = "Hello, TypeScript!";
  return message;
}
    `.trim();

    const result = await compiler.compile(validCode);

    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => d.category === 'error')).toHaveLength(0);
  });

  it('should detect type errors in TypeScript code', async () => {
    const compiler = new TypeScriptCompiler();

    const invalidCode = `
async function main(): Promise<string> {
  const message: string = 123; // Type error: number assigned to string
  return message;
}
    `.trim();

    const result = await compiler.compile(invalidCode);

    expect(result.success).toBe(false);
    expect(result.diagnostics.filter((d) => d.category === 'error')).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe(2322); // Type '123' is not assignable to type 'string'
  });

  it('should provide detailed error information', async () => {
    const compiler = new TypeScriptCompiler();

    const invalidCode = `
async function main(): Promise<Note> {
  const note = await flintApi.getNote("test-id");
  return note.title; // Error: Object is possibly 'null' and Property 'title' does not exist on type 'string'
}
    `.trim();

    const result = await compiler.compile(invalidCode);

    expect(result.success).toBe(false);
    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);

    const firstError = errors[0];
    expect(firstError.line).toBeGreaterThan(0);
    expect(firstError.column).toBeGreaterThan(0);
    expect(firstError.source).toBeTruthy();
    expect(firstError.messageText).toBeTruthy();
  });

  it('should validate FlintNote API usage', async () => {
    const compiler = new TypeScriptCompiler();

    const validApiCode = `
async function main(): Promise<Note | null> {
  const note = await flintApi.getNote("test-id");
  if (note) {
    return note;
  }
  return null;
}
    `.trim();

    const result = await compiler.compile(validApiCode);

    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => d.category === 'error')).toHaveLength(0);
  });

  it('should catch missing required parameters in API calls', async () => {
    const compiler = new TypeScriptCompiler();

    const invalidApiCode = `
async function main(): Promise<any> {
  const result = await flintApi.createNote({
    title: "My Note",
    content: "Note content"
    // Missing required 'type' field
  });
  return result;
}
    `.trim();

    const result = await compiler.compile(invalidApiCode);

    expect(result.success).toBe(false);
    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);
    // Should detect missing 'type' property
  });

  it('should validate note metadata types', async () => {
    const compiler = new TypeScriptCompiler();

    const validMetadataCode = `
async function main(): Promise<Note | null> {
  const result = await flintApi.createNote({
    type: "meeting",
    title: "Weekly Standup",
    content: "Meeting notes",
    metadata: {
      attendees: ["Alice", "Bob"],
      duration: 30,
      important: true
    }
  });
  return await flintApi.getNote(result.id);
}
    `.trim();

    const compileResult = await compiler.compile(validMetadataCode);

    expect(compileResult.success).toBe(true);
    expect(compileResult.diagnostics.filter((d) => d.category === 'error')).toHaveLength(
      0
    );
  });

  it('should handle async/await patterns correctly', async () => {
    const compiler = new TypeScriptCompiler();

    const asyncCode = `
async function main(): Promise<NoteInfo[]> {
  const allNotes = await flintApi.listNotes();
  const filtered = allNotes.filter(note => note.type === "task");
  return filtered;
}
    `.trim();

    const result = await compiler.compile(asyncCode);

    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => d.category === 'error')).toHaveLength(0);
  });

  it('should detect incorrect return types', async () => {
    const compiler = new TypeScriptCompiler();

    const incorrectReturnCode = `
async function main(): Promise<string> {
  const note = await flintApi.getNote("test-id");
  return note; // Error: Note | null is not assignable to string
}
    `.trim();

    const result = await compiler.compile(incorrectReturnCode);

    expect(result.success).toBe(false);
    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });
});
