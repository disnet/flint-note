import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnhancedWASMCodeEvaluator } from '../../../src/server/api/enhanced-wasm-code-evaluator.js';
import { TestApiSetup } from './test-setup.js';

describe('EnhancedWASMCodeEvaluator', () => {
  let testSetup: TestApiSetup;
  let evaluator: EnhancedWASMCodeEvaluator;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    evaluator = new EnhancedWASMCodeEvaluator(testSetup.api);
  });

  afterEach(async () => {
    if (testSetup) {
      await testSetup.cleanup();
    }
  });

  it('should compile and execute valid TypeScript code', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const validTypeScriptCode = `
async function main(): Promise<string> {
  const message: string = "Hello from TypeScript!";
  return message;
}
    `;

    const result = await evaluator.evaluate({
      code: validTypeScriptCode,
      vaultId: vaultId
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('Hello from TypeScript!');
    expect(result.compilation?.success).toBe(true);
    expect(result.compilation?.errors).toHaveLength(0);
  });

  it('should return compilation errors for invalid TypeScript', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const invalidTypeScriptCode = `
async function main(): Promise<string> {
  const message: string = 123; // Type error
  return message;
}
    `;

    const result = await evaluator.evaluate({
      code: invalidTypeScriptCode,
      vaultId: vaultId
    });

    expect(result.success).toBe(false);
    expect(result.compilation?.success).toBe(false);
    expect(result.compilation?.errors).toHaveLength(1);
    expect(result.compilation?.errors[0].code).toBe(2322);
  });

  it('should support types-only mode for debugging', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const typeScriptCode = `
async function main(): Promise<Note | null> {
  const note = await flintApi.getNote("test-id");
  return note.title; // Type error: string | undefined not assignable to Note | null
}
    `;

    const result = await evaluator.evaluate({
      code: typeScriptCode,
      vaultId: vaultId,
      typesOnly: true
    });

    expect(result.success).toBe(false);
    expect(result.compilation?.success).toBe(false);
    expect(result.compilation?.errors.length).toBeGreaterThan(0);
    expect(result.result).toBeUndefined(); // No execution in types-only mode
  });

  it('should provide enhanced error context', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const codeWithError = `
async function main(): Promise<void> {
  const note: Note = await flintApi.getNote("nonexistent"); // Type error: Note | null not assignable to Note
}
    `;

    const result = await evaluator.evaluate({
      code: codeWithError,
      vaultId: vaultId
    });

    expect(result.success).toBe(false);
    expect(result.errorContext).toBeDefined();
    expect(result.errorContext?.line).toBeGreaterThan(0);
    expect(result.errorContext?.column).toBeGreaterThan(0);
    expect(result.errorContext?.source).toBeTruthy();
  });

  it('should validate FlintNote API usage with strict types', async () => {
    // First create a test vault and note type
    const vaultId = await testSetup.createTestVault('test-vault');
    await testSetup.api.createNoteType({
      type_name: 'test-type',
      description: 'Test note type',
      vault_id: vaultId
    });

    const validApiCode = `
async function main(): Promise<CreateNoteResult> {
  const result = await flintApi.createNote({
    type: "test-type",
    title: "TypeScript Test Note",
    content: "This is a test note created with TypeScript",
    metadata: {
      created_by: "test",
      priority: 1
    }
  });
  return result;
}
    `;

    const evalResult = await evaluator.evaluate({
      code: validApiCode,
      vaultId: vaultId
    });

    expect(evalResult.success).toBe(true);
    expect(evalResult.compilation?.success).toBe(true);
    expect(evalResult.compilation?.errors).toHaveLength(0);
    expect(evalResult.result).toHaveProperty('id');
  });

  it('should catch missing required API parameters at compile time', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const invalidApiCode = `
async function main(): Promise<any> {
  const result = await flintApi.createNote({
    title: "Incomplete Note",
    content: "Missing type parameter"
    // Missing required 'type' field
  });
  return result;
}
    `;

    const result = await evaluator.evaluate({
      code: invalidApiCode,
      vaultId: vaultId
    });

    expect(result.success).toBe(false);
    expect(result.compilation?.success).toBe(false);
    expect(result.compilation?.errors.length).toBeGreaterThan(0);
  });

  it('should handle missing notes for API responses', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const nullCheckCode = `
async function main(): Promise<string> {
  try {
    const note = await flintApi.getNote("probably-nonexistent-id");
    return note.title;
  } catch (error) {
    return "Note not found";
  }
}
    `;

    const result = await evaluator.evaluate({
      code: nullCheckCode,
      vaultId: vaultId
    });

    expect(result.success).toBe(true);
    expect(result.compilation?.success).toBe(true);
    expect(result.compilation?.errors).toHaveLength(0);
    expect(result.result).toBe('Note not found');
  });

  it('should provide warnings for potential issues', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const codeWithWarnings = `
async function main(): Promise<string> {
  const unusedVariable = "This variable is never used";
  const message = "Hello, World!";
  return message;
}
    `;

    const result = await evaluator.evaluate({
      code: codeWithWarnings,
      vaultId: vaultId
    });

    expect(result.success).toBe(true);
    expect(result.compilation?.success).toBe(true);
    expect(result.compilation?.warnings.length).toBeGreaterThan(0);
  });

  it('should maintain backward compatibility with simple async functions', async () => {
    const vaultId = await testSetup.createTestVault('test-vault');

    const simpleCode = `
async function main() {
  return { message: "Simple function works" };
}
    `;

    const result = await evaluator.evaluate({
      code: simpleCode,
      vaultId: vaultId
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ message: 'Simple function works' });
  });
});
