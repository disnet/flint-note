import { describe, it, expect } from 'vitest';
import { WASMCodeEvaluator } from '../../../src/server/api/wasm-code-evaluator.js';

describe('WASMCodeEvaluator Promise Support', () => {
  it('should handle synchronous code', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: 'async function main() { return 42; }',
      vaultId: 'test'
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe(42);

    evaluator.dispose();
  });

  it('should handle resolved promises', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: 'async function main() { return Promise.resolve("Hello from promise!"); }',
      vaultId: 'test'
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('Hello from promise!');

    evaluator.dispose();
  });

  it('should handle rejected promises', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: 'async function main() { return Promise.reject("Error message"); }',
      vaultId: 'test'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Promise rejected');

    evaluator.dispose();
  });

  it('should handle async/await syntax', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: `
        async function main() {
          const asyncFunction = async () => {
            const value = await Promise.resolve('async result');
            return value;
          };
          return asyncFunction();
        }
      `,
      vaultId: 'test',
      timeout: 1000
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('async result');

    evaluator.dispose();
  });

  it('should handle promise chains', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: `
        async function main() {
          return Promise.resolve(5)
            .then(x => x * 2)
            .then(x => x + 3);
        }
      `,
      vaultId: 'test',
      timeout: 1000
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe(13);

    evaluator.dispose();
  });

  it('should handle utility delay function', async () => {
    const evaluator = new WASMCodeEvaluator(null as any);

    const result = await evaluator.evaluate({
      code: 'async function main() { return utils.delay(50); }',
      vaultId: 'test',
      timeout: 1000
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('delayed for 50ms');

    evaluator.dispose();
  });
});
