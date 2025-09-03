/**
 * WebAssembly Code Evaluator - Secure JavaScript execution for FlintNote API
 * Phase 1: Basic implementation with note retrieval functionality
 */

import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  QuickJSContext
} from 'quickjs-emscripten';
import type { FlintNoteApi } from './flint-note-api.js';
import type { Note } from '../core/notes.js';

export interface WASMCodeEvaluationOptions {
  code: string;
  vaultId: string;
  timeout?: number; // Maximum execution time in milliseconds (default: 5000)
  memoryLimit?: number; // Memory limit in bytes (default: 128MB)
  allowedAPIs?: string[]; // Whitelisted API methods
  context?: Record<string, unknown>; // Optional initial context variables
}

export interface WASMCodeEvaluationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

export class WASMCodeEvaluator {
  private QuickJS: any;
  private noteApi: FlintNoteApi;
  private initialized = false;

  constructor(noteApi: FlintNoteApi) {
    this.noteApi = noteApi;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.QuickJS = await getQuickJS();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize WebAssembly runtime: ${error}`);
    }
  }

  async evaluate(options: WASMCodeEvaluationOptions): Promise<WASMCodeEvaluationResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    let vm: QuickJSContext | null = null;

    try {
      vm = this.QuickJS.newContext();

      // Set up execution limits
      const timeout = options.timeout || 5000;

      // Create secure API proxy and inject into VM
      this.injectSecureAPI(vm, options.vaultId, options.allowedAPIs, options.context);

      // Execute the code
      const codeToExecute = `
        (async function() {
          ${options.code}
        })()
      `;

      const evalResult = vm.evalCode(codeToExecute, {
        shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + timeout)
      });

      // Check for compilation/syntax errors
      if (evalResult.error) {
        const errorMsg = vm.dump(evalResult.error);
        evalResult.error.dispose();
        return {
          success: false,
          error: `Execution error: ${errorMsg}`,
          executionTime: Date.now() - startTime
        };
      }

      // Handle the result
      let finalResult: unknown;
      try {
        // Check if result is a promise (async function)
        if (evalResult.value && vm.typeof(evalResult.value) === 'object') {
          const promiseResult = await vm.resolvePromise(evalResult.value);

          if (promiseResult.error) {
            const errorMsg = vm.dump(promiseResult.error);
            promiseResult.error.dispose();
            evalResult.value.dispose();
            return {
              success: false,
              error: `Promise error: ${errorMsg}`,
              executionTime: Date.now() - startTime
            };
          }

          finalResult = vm.dump(promiseResult.value);
          promiseResult.value.dispose();
        } else {
          // Synchronous result
          finalResult = vm.dump(evalResult.value);
        }

        evalResult.value.dispose();

        return {
          success: true,
          result: finalResult,
          executionTime: Date.now() - startTime
        };
      } catch (promiseError) {
        evalResult.value.dispose();
        return {
          success: false,
          error: `Promise execution error: ${promiseError instanceof Error ? promiseError.message : String(promiseError)}`,
          executionTime: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime
      };
    } finally {
      // Always dispose the VM context
      if (vm) {
        vm.dispose();
      }
    }
  }

  private createSecureAPIProxy(
    vaultId: string,
    allowedAPIs?: string[]
  ): {
    notes: Record<string, Function>;
    utils: Record<string, Function>;
  } {
    const isAllowed = (apiPath: string) => !allowedAPIs || allowedAPIs.includes(apiPath);

    return {
      notes: {
        get: isAllowed('notes.get')
          ? this.wrapAsync(async (identifier: string): Promise<Note | null> => {
              return await this.noteApi.getNote(vaultId, identifier);
            })
          : null
      },
      utils: {
        formatDate: (date: string) => new Date(date).toISOString(),
        generateId: () => Math.random().toString(36).substr(2, 9),
        sanitizeTitle: (title: string) => title.replace(/[^a-zA-Z0-9\s-]/g, '').trim(),
        parseLinks: (content: string) =>
          content.match(/\[\[([^\]]+)\]\]/g)?.map((link) => link.slice(2, -2)) || []
      }
    };
  }

  private injectSecureAPI(
    vm: QuickJSContext,
    vaultId: string,
    allowedAPIs?: string[],
    customContext?: Record<string, unknown>
  ): void {
    // Check if notes.get is allowed
    const isNotesGetAllowed = !allowedAPIs || allowedAPIs.includes('notes.get');

    // Create notes API object
    vm.setProp(vm.global, 'notes', vm.newObject());
    const notesHandle = vm.getProp(vm.global, 'notes');

    if (isNotesGetAllowed) {
      // Create the notes.get function
      const noteGetFn = vm.newFunction('get', async (identifier: string) => {
        try {
          return await this.noteApi.getNote(vaultId, identifier);
        } catch (error) {
          throw new Error(
            `API Error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      });
      vm.setProp(notesHandle, 'get', noteGetFn);
      noteGetFn.dispose();
    }

    notesHandle.dispose();

    // Create utils API object
    vm.setProp(vm.global, 'utils', vm.newObject());
    const utilsHandle = vm.getProp(vm.global, 'utils');

    // Add utility functions
    const formatDateFn = vm.newFunction('formatDate', (date: string) =>
      new Date(date).toISOString()
    );
    vm.setProp(utilsHandle, 'formatDate', formatDateFn);
    formatDateFn.dispose();

    const generateIdFn = vm.newFunction('generateId', () =>
      Math.random().toString(36).substr(2, 9)
    );
    vm.setProp(utilsHandle, 'generateId', generateIdFn);
    generateIdFn.dispose();

    const sanitizeTitleFn = vm.newFunction('sanitizeTitle', (title: string) =>
      title.replace(/[^a-zA-Z0-9\s-]/g, '').trim()
    );
    vm.setProp(utilsHandle, 'sanitizeTitle', sanitizeTitleFn);
    sanitizeTitleFn.dispose();

    const parseLinksFn = vm.newFunction(
      'parseLinks',
      (content: string) =>
        content.match(/\[\[([^\]]+)\]\]/g)?.map((link) => link.slice(2, -2)) || []
    );
    vm.setProp(utilsHandle, 'parseLinks', parseLinksFn);
    parseLinksFn.dispose();

    utilsHandle.dispose();

    // Inject custom context variables
    if (customContext) {
      for (const [key, value] of Object.entries(customContext)) {
        const valueHandle = vm.newString(JSON.stringify(value));
        vm.setProp(vm.global, key, valueHandle);
        valueHandle.dispose();
      }
    }

    // Disable dangerous globals
    vm.setProp(vm.global, 'fetch', vm.undefined);
    vm.setProp(vm.global, 'require', vm.undefined);
    vm.setProp(vm.global, 'process', vm.undefined);
    vm.setProp(vm.global, 'global', vm.undefined);
    vm.setProp(vm.global, 'globalThis', vm.undefined);
  }

  private wrapAsync<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        throw new Error(
          `API Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };
  }

  dispose(): void {
    if (this.QuickJS) {
      // QuickJS doesn't require explicit disposal of the main context
      this.initialized = false;
    }
  }
}
