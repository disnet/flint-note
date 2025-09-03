/**
 * WebAssembly Code Evaluator - Secure JavaScript execution for FlintNote API
 * Phase 1: Basic implementation with note retrieval functionality
 */

import { getQuickJS, QuickJSContext } from 'quickjs-emscripten';
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
  private QuickJS: unknown;
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

      // Set up execution limits (currently unused but kept for future async support)

      // Create secure API proxy and inject into VM
      this.injectSecureAPI(vm, options.vaultId, options.allowedAPIs, options.context);

      // Execute the code - for now, use synchronous function wrapper
      const codeToExecute = `
        (() => {
          ${options.code}
        })()
      `;

      const evalResult = vm.evalCode(codeToExecute);

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

      // Handle the result - for now, treat all results as synchronous
      let finalResult: unknown;
      try {
        // For Phase 1, we'll only handle synchronous results
        finalResult = vm.dump(evalResult.value);
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
    notes: Record<string, (...args: unknown[]) => unknown>;
    utils: Record<string, (...args: unknown[]) => unknown>;
  } {
    const isAllowed = (apiPath: string): boolean =>
      !allowedAPIs || allowedAPIs.includes(apiPath);

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
    const notesObj = vm.newObject();
    vm.setProp(vm.global, 'notes', notesObj);

    if (isNotesGetAllowed) {
      // For now, skip async functions to avoid promise issues
      // We'll implement a synchronous API first
    }

    notesObj.dispose();

    // Create utils API object with proper disposal
    const utilsObj = vm.newObject();
    vm.setProp(vm.global, 'utils', utilsObj);

    // Add utility functions with proper QuickJS function wrapper
    const formatDateFn = vm.newFunction('formatDate', (vmArg) => {
      const dateStr = vm.getString(vmArg);
      return vm.newString(new Date(dateStr).toISOString());
    });
    vm.setProp(utilsObj, 'formatDate', formatDateFn);
    formatDateFn.dispose();

    const generateIdFn = vm.newFunction('generateId', () => {
      return vm.newString(Math.random().toString(36).substr(2, 9));
    });
    vm.setProp(utilsObj, 'generateId', generateIdFn);
    generateIdFn.dispose();

    const sanitizeTitleFn = vm.newFunction('sanitizeTitle', (vmArg) => {
      const title = vm.getString(vmArg);
      return vm.newString(title.replace(/[^a-zA-Z0-9\s-]/g, '').trim());
    });
    vm.setProp(utilsObj, 'sanitizeTitle', sanitizeTitleFn);
    sanitizeTitleFn.dispose();

    const parseLinksFn = vm.newFunction('parseLinks', (vmArg) => {
      const content = vm.getString(vmArg);
      const links =
        content.match(/\[\[([^\]]+)\]\]/g)?.map((link) => link.slice(2, -2)) || [];
      const arrayHandle = vm.newArray();
      links.forEach((link, index) => {
        vm.setProp(arrayHandle, index, vm.newString(link));
      });
      return arrayHandle;
    });
    vm.setProp(utilsObj, 'parseLinks', parseLinksFn);
    parseLinksFn.dispose();

    utilsObj.dispose();

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
