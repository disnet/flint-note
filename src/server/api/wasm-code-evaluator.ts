/**
 * WebAssembly Code Evaluator - Secure JavaScript execution for FlintNote API
 * Phase 1: Basic implementation with note retrieval functionality
 */

import { getQuickJS, QuickJSContext, QuickJSWASMModule } from 'quickjs-emscripten';
import type { QuickJSHandle } from 'quickjs-emscripten';
import type { FlintNoteApi } from './flint-note-api.js';

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
  private QuickJS: QuickJSWASMModule | null = null;
  private initialized = false;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _noteApi: FlintNoteApi
  ) {
    // noteApi parameter kept for potential future use
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
    const timeout = options.timeout || 5000; // Default 5 second timeout
    let vm: QuickJSContext | null = null;
    let interrupted = false;

    try {
      vm = this.QuickJS!.newContext();

      // Set up interrupt handler for timeout and infinite loop protection
      const interruptHandler = (): boolean => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
          interrupted = true;
          return true; // Signal interrupt
        }
        return false; // Continue execution
      };

      vm.runtime.setInterruptHandler(interruptHandler);

      // Create secure API proxy and inject into VM
      this.injectSecureAPI(vm, options.vaultId, options.allowedAPIs, options.context);

      // Execute the code
      const codeToExecute = `
        (() => {
          ${options.code}
        })()
      `;
      const evalResult = vm.evalCode(codeToExecute);

      // Check for compilation/syntax errors or interrupts
      if (evalResult.error) {
        let errorMsg: string;

        // Check if this was due to an interrupt (timeout)
        if (interrupted) {
          evalResult.error.dispose();
          return {
            success: false,
            error: `Execution timeout after ${timeout}ms`,
            executionTime: Date.now() - startTime
          };
        }

        // Try to extract a meaningful error message
        try {
          const errorObj = vm.dump(evalResult.error);
          if (
            typeof errorObj === 'object' &&
            errorObj !== null &&
            'message' in errorObj
          ) {
            errorMsg = String(errorObj.message);
          } else if (typeof errorObj === 'string') {
            errorMsg = errorObj;
          } else {
            const errorStr = vm.getString(evalResult.error);
            errorMsg = errorStr || String(errorObj);
          }
        } catch {
          errorMsg = 'Unknown execution error';
        }

        evalResult.error.dispose();
        return {
          success: false,
          error: `Execution error: ${errorMsg}`,
          executionTime: Date.now() - startTime
        };
      }

      // Handle the result - check if it's a promise or synchronous value
      let finalResult: unknown;

      // Check if the result is a promise
      const promiseState = vm.getPromiseState(evalResult.value);

      if (promiseState.type === 'fulfilled') {
        // Promise is already resolved or it's a synchronous value
        if (promiseState.notAPromise) {
          // It's a regular synchronous value, not a promise
          finalResult = vm.dump(evalResult.value);
        } else {
          // It's a resolved promise
          finalResult = vm.dump(promiseState.value);
        }
        evalResult.value.dispose();
      } else if (promiseState.type === 'rejected') {
        // Promise was rejected
        const errorMsg = vm.dump(promiseState.error);
        evalResult.value.dispose();
        return {
          success: false,
          error: `Promise rejected: ${errorMsg}`,
          executionTime: Date.now() - startTime
        };
      } else if (promiseState.type === 'pending') {
        // For pending promises, we need to execute pending jobs and then wait
        try {
          // Execute pending jobs to allow promises to resolve
          const jobsResult = vm.runtime.executePendingJobs();
          if (jobsResult.error) {
            const errorMsg = vm.dump(jobsResult.error);
            jobsResult.dispose();
            evalResult.value.dispose();
            return {
              success: false,
              error: `Promise job execution error: ${errorMsg}`,
              executionTime: Date.now() - startTime
            };
          }
          jobsResult.dispose();

          // Check promise state again after executing jobs
          const newState = vm.getPromiseState(evalResult.value);
          if (newState.type === 'fulfilled') {
            if (newState.notAPromise) {
              finalResult = vm.dump(evalResult.value);
            } else {
              finalResult = vm.dump(newState.value);
            }
          } else if (newState.type === 'rejected') {
            const errorMsg = vm.dump(newState.error);
            evalResult.value.dispose();
            return {
              success: false,
              error: `Promise rejected: ${errorMsg}`,
              executionTime: Date.now() - startTime
            };
          } else {
            // Still pending - use fallback waiting
            finalResult = await this.waitForPromise(
              vm,
              evalResult.value,
              timeout - (Date.now() - startTime)
            );
          }

          evalResult.value.dispose();
        } catch (promiseError) {
          evalResult.value.dispose();
          return {
            success: false,
            error: `Promise execution error: ${promiseError instanceof Error ? promiseError.message : String(promiseError)}`,
            executionTime: Date.now() - startTime
          };
        }
      } else {
        // Fallback for unknown state
        finalResult = vm.dump(evalResult.value);
        evalResult.value.dispose();
      }

      return {
        success: true,
        result: finalResult,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      // Check if this was due to a timeout interrupt
      if (interrupted) {
        return {
          success: false,
          error: `Execution timeout after ${timeout}ms`,
          executionTime: Date.now() - startTime
        };
      }

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

  private async waitForPromise(
    vm: QuickJSContext,
    promiseHandle: QuickJSHandle,
    remainingTimeout: number
  ): Promise<unknown> {
    const pollInterval = 10; // Check every 10ms
    const maxWaitTime = Math.max(remainingTimeout, 0);
    let waitedTime = 0;

    return new Promise((resolve, reject): void => {
      const checkPromise = (): void => {
        try {
          const state = vm.getPromiseState(promiseHandle);

          if (state.type === 'fulfilled') {
            try {
              const result = vm.dump(state.value);
              state.value.dispose();
              resolve(result);
            } catch (error) {
              reject(new Error(`Promise resolution error: ${error}`));
            }
            return;
          }

          if (state.type === 'rejected') {
            try {
              const errorMsg = vm.dump(state.error);
              state.error.dispose();
              reject(new Error(`Promise rejected: ${errorMsg}`));
            } catch (error) {
              reject(new Error(`Promise rejection handling error: ${error}`));
            }
            return;
          }

          // Still pending, check if we should timeout
          if (waitedTime >= maxWaitTime) {
            reject(new Error(`Promise timeout after ${maxWaitTime}ms`));
            return;
          }

          // Continue waiting
          waitedTime += pollInterval;
          setTimeout(checkPromise, pollInterval);
        } catch (error) {
          reject(new Error(`Promise polling error: ${error}`));
        }
      };

      // Start checking immediately
      checkPromise();
    });
  }

  private injectSecureAPI(
    vm: QuickJSContext,
    _vaultId: string,
    allowedAPIs?: string[],
    customContext?: Record<string, unknown>
  ): void {
    // Check if notes.get is allowed
    const isNotesGetAllowed = allowedAPIs && allowedAPIs.includes('notes.get');

    // Create notes API object
    const notesObj = vm.newObject();
    vm.setProp(vm.global, 'notes', notesObj);

    if (isNotesGetAllowed) {
      // Add notes.get function - for now return a mock implementation
      const notesGetFn = vm.newFunction('get', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        // Return a promise that resolves with a mock note
        // Use JSON.stringify to properly escape the noteId
        const promiseCode = `Promise.resolve({
          id: ${JSON.stringify(noteId)},
          title: "Security Test Note",
          content: "This is for security testing.",
          type: "general"
        })`;
        const promiseResult = vm.evalCode(promiseCode);
        if (promiseResult.error) {
          promiseResult.error.dispose();
          return vm.null;
        }
        return promiseResult.value;
      });
      vm.setProp(notesObj, 'get', notesGetFn);
      notesGetFn.dispose();
    } else {
      // Set notes.get to null when not allowed (so typeof will be 'object')
      vm.setProp(notesObj, 'get', vm.null);
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

    // Add promise utilities for testing
    const delayFn = vm.newFunction('delay', (msArg) => {
      const ms = vm.getNumber(msArg);
      // Create a simple resolved promise since setTimeout doesn't exist in QuickJS
      const promiseCode = `Promise.resolve('delayed for ${ms}ms')`;
      const promiseResult = vm.evalCode(promiseCode);
      if (promiseResult.error) {
        promiseResult.error.dispose();
        return vm.newString('Promise creation failed');
      }
      return promiseResult.value;
    });
    vm.setProp(utilsObj, 'delay', delayFn);
    delayFn.dispose();

    utilsObj.dispose();

    // Inject custom context variables
    if (customContext) {
      for (const [key, value] of Object.entries(customContext)) {
        let valueHandle: QuickJSHandle;

        // Handle different data types properly
        if (value === null) {
          valueHandle = vm.null;
        } else if (value === undefined) {
          valueHandle = vm.undefined;
        } else if (typeof value === 'string') {
          valueHandle = vm.newString(value);
        } else if (typeof value === 'number') {
          valueHandle = vm.newNumber(value);
        } else if (typeof value === 'boolean') {
          valueHandle = value ? vm.true : vm.false;
        } else {
          // For objects and other complex types, convert recursively
          valueHandle = this.convertValueToQuickJSHandle(vm, value);
        }

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

  private convertValueToQuickJSHandle(vm: QuickJSContext, value: unknown): QuickJSHandle {
    if (value === null) {
      return vm.null;
    } else if (value === undefined) {
      return vm.undefined;
    } else if (typeof value === 'string') {
      return vm.newString(value);
    } else if (typeof value === 'number') {
      return vm.newNumber(value);
    } else if (typeof value === 'boolean') {
      return value ? vm.true : vm.false;
    } else if (Array.isArray(value)) {
      const arrayHandle = vm.newArray();
      value.forEach((item, index) => {
        const itemHandle = this.convertValueToQuickJSHandle(vm, item);
        vm.setProp(arrayHandle, index, itemHandle);
        itemHandle.dispose();
      });
      return arrayHandle;
    } else if (typeof value === 'object') {
      const objHandle = vm.newObject();
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const valHandle = this.convertValueToQuickJSHandle(vm, val);
        vm.setProp(objHandle, key, valHandle);
        valHandle.dispose();
      }
      return objHandle;
    } else {
      // Fallback for unknown types
      return vm.newString(String(value));
    }
  }

  dispose(): void {
    if (this.QuickJS) {
      // QuickJS doesn't require explicit disposal of the main context
      this.initialized = false;
    }
  }
}
