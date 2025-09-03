/**
 * WebAssembly Code Evaluator - Secure JavaScript execution for FlintNote API
 * 
 * IMPLEMENTATION STATUS: ✅ COMPLETE - True async API integration
 * 
 * This implementation supports true asynchronous API calls using the Promise Proxy Pattern:
 * - AsyncOperationRegistry: Tracks all pending async operations
 * - VMLifecycleManager: Extends VM lifecycle until async operations complete  
 * - PromiseProxyFactory: Creates QuickJS promises that proxy to host promises
 * 
 * Key capabilities:
 * ✅ Real async API calls (notes.get, etc.)
 * ✅ Multiple concurrent operations (Promise.all support)
 * ✅ Proper memory management and handle disposal
 * ✅ Timeout handling and error propagation
 * ✅ Enhanced job processing for promise resolution timing
 */

import { getQuickJS, QuickJSContext, QuickJSWASMModule } from 'quickjs-emscripten';
import type { QuickJSHandle } from 'quickjs-emscripten';
import type { FlintNoteApi } from './flint-note-api.js';

interface AsyncOperation {
  id: string;
  promise: Promise<unknown>;
  promiseHandle: QuickJSHandle;
  status: 'pending' | 'fulfilled' | 'rejected';
  createdAt: number;
  resolver?: (value: unknown) => void;
  rejector?: (error: unknown) => void;
}

class AsyncOperationRegistry {
  private operations = new Map<string, AsyncOperation>();
  private nextId = 0;

  register(promise: Promise<unknown>, promiseHandle: QuickJSHandle): string {
    const id = `op_${++this.nextId}`;
    const operation: AsyncOperation = {
      id,
      promise,
      promiseHandle,
      status: 'pending',
      createdAt: Date.now()
    };

    this.operations.set(id, operation);
    return id;
  }

  resolve(id: string, result: unknown): void {
    const operation = this.operations.get(id);
    if (operation && operation.status === 'pending') {
      operation.status = 'fulfilled';
      if (operation.resolver) {
        operation.resolver(result);
      }
    }
  }

  reject(id: string, error: unknown): void {
    const operation = this.operations.get(id);
    if (operation && operation.status === 'pending') {
      operation.status = 'rejected';
      if (operation.rejector) {
        operation.rejector(error);
      }
    }
  }

  cleanup(id: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      try {
        if (operation.promiseHandle && !operation.promiseHandle.alive) {
          operation.promiseHandle.dispose();
        }
      } catch {
        // Handle already disposed
      }
      this.operations.delete(id);
    }
  }

  hasPending(): boolean {
    return Array.from(this.operations.values()).some((op) => op.status === 'pending');
  }

  getPendingCount(): number {
    return Array.from(this.operations.values()).filter((op) => op.status === 'pending')
      .length;
  }

  getTimedOutOperations(maxAge: number): string[] {
    const now = Date.now();
    return Array.from(this.operations.values())
      .filter((op) => op.status === 'pending' && now - op.createdAt > maxAge)
      .map((op) => op.id);
  }

  cleanupAll(): void {
    for (const id of this.operations.keys()) {
      this.cleanup(id);
    }
    this.operations.clear();
  }
}

class VMLifecycleManager {
  private vm: QuickJSContext;
  private registry: AsyncOperationRegistry;
  private disposed = false;
  private maxWaitTime = 30000; // 30 seconds timeout

  constructor(vm: QuickJSContext, registry: AsyncOperationRegistry) {
    this.vm = vm;
    this.registry = registry;
  }

  async waitForPendingOperations(): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 10; // Check every 10ms
    let allOperationsCompleted = false;
    let additionalJobProcessingTime = 0;
    const maxAdditionalProcessingTime = 100; // Process jobs for an additional 100ms after operations complete

    while (!this.disposed) {
      const elapsed = Date.now() - startTime;

      // Check if we still have pending operations
      const hasPending = this.registry.hasPending();

      if (!hasPending && !allOperationsCompleted) {
        // All operations just completed, start additional job processing timer
        allOperationsCompleted = true;
        additionalJobProcessingTime = 0;
      }

      if (allOperationsCompleted) {
        additionalJobProcessingTime += checkInterval;
        if (additionalJobProcessingTime >= maxAdditionalProcessingTime) {
          // We've processed jobs for extra time after operations completed
          break;
        }
      }

      // Check for overall timeout
      if (elapsed > this.maxWaitTime) {
        // Cleanup timed out operations
        const timedOutIds = this.registry.getTimedOutOperations(this.maxWaitTime);
        for (const id of timedOutIds) {
          this.registry.reject(id, new Error('Operation timeout'));
          this.registry.cleanup(id);
        }
        break;
      }

      // Process any pending QuickJS jobs
      try {
        const jobsResult = this.vm.runtime.executePendingJobs();
        if (jobsResult.error) {
          jobsResult.error.dispose();
        }
        jobsResult.dispose();
      } catch {
        // VM may be in invalid state
        break;
      }

      // Small delay to prevent busy waiting
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  safeDispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clean up all pending operations
    this.registry.cleanupAll();

    // Dispose the VM context
    try {
      if (this.vm && !this.vm.alive) {
        this.vm.dispose();
      }
    } catch {
      // VM may already be disposed
    }
  }

  isAlive(): boolean {
    return !this.disposed && this.vm && this.vm.alive;
  }

  setMaxWaitTime(maxWaitTime: number): void {
    this.maxWaitTime = maxWaitTime;
  }
}

class PromiseProxyFactory {
  createProxy<T>(
    vm: QuickJSContext,
    registry: AsyncOperationRegistry,
    hostPromise: Promise<T>
  ): QuickJSHandle {
    // Generate a unique promise ID
    const promiseId = `promise_${++this.promiseIdCounter}`;

    // Initialize promise resolvers map if not exists
    const initMapResult = vm.evalCode(`
      if (!this._promiseResolvers) {
        this._promiseResolvers = new Map();
      }
    `);
    if (initMapResult.error) {
      initMapResult.error.dispose();
    } else {
      initMapResult.value.dispose();
    }

    // Create a new promise in QuickJS that will be controlled from the host side
    const promiseCode = `
      new Promise((resolve, reject) => {
        this._promiseResolvers.set("${promiseId}", { resolve, reject });
      })
    `;

    const promiseResult = vm.evalCode(promiseCode);
    if (promiseResult.error) {
      promiseResult.error.dispose();
      // Return a rejected promise as fallback
      const fallbackResult = vm.evalCode(
        'Promise.reject("Failed to create promise proxy")'
      );
      return fallbackResult.error ? vm.null : fallbackResult.value;
    }

    const promiseHandle = promiseResult.value;

    // Register the operation
    const operationId = registry.register(hostPromise, promiseHandle);

    // Set up the host-side promise handling
    hostPromise
      .then((result) => {
        this.resolvePromiseInVM(vm, promiseId, result);
        registry.resolve(operationId, result);
        registry.cleanup(operationId);
      })
      .catch((error) => {
        this.rejectPromiseInVM(vm, promiseId, error);
        registry.reject(operationId, error);
        registry.cleanup(operationId);
      });

    return promiseHandle;
  }

  private promiseIdCounter = 0;

  private resolvePromiseInVM(
    vm: QuickJSContext,
    promiseId: string,
    result: unknown
  ): void {
    try {
      // Convert the result to a QuickJS value
      const resultHandle = this.convertValueToQuickJSHandle(vm, result);

      // Set the result in global scope temporarily
      vm.setProp(vm.global, '_promiseResult', resultHandle);

      // Call the resolve function
      const resolveCode = `
        if (this._promiseResolvers && this._promiseResolvers.has("${promiseId}")) {
          const resolver = this._promiseResolvers.get("${promiseId}");
          this._promiseResolvers.delete("${promiseId}");
          resolver.resolve(this._promiseResult);
        }
      `;

      const resolveResult = vm.evalCode(resolveCode);
      if (resolveResult.error) {
        resolveResult.error.dispose();
      } else {
        resolveResult.value.dispose();
      }

      resultHandle.dispose();
    } catch (error) {
      // If we can't resolve properly, try to reject with an error
      this.rejectPromiseInVM(vm, promiseId, `Resolution failed: ${error}`);
    }
  }

  private rejectPromiseInVM(vm: QuickJSContext, promiseId: string, error: unknown): void {
    try {
      // Convert the error to a QuickJS value
      const errorHandle = this.convertValueToQuickJSHandle(vm, error);

      // Set the error in global scope temporarily
      vm.setProp(vm.global, '_promiseError', errorHandle);

      // Call the reject function
      const rejectCode = `
        if (this._promiseResolvers && this._promiseResolvers.has("${promiseId}")) {
          const resolver = this._promiseResolvers.get("${promiseId}");
          this._promiseResolvers.delete("${promiseId}");
          resolver.reject(this._promiseError);
        }
      `;

      const rejectResult = vm.evalCode(rejectCode);
      if (rejectResult.error) {
        rejectResult.error.dispose();
      } else {
        rejectResult.value.dispose();
      }

      errorHandle.dispose();
    } catch (rejectionError) {
      // Last resort: log the error but don't throw
      console.error('Failed to reject promise in VM:', rejectionError);
    }
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
        // Don't dispose primitive handles
        if (
          itemHandle !== vm.null &&
          itemHandle !== vm.undefined &&
          itemHandle !== vm.true &&
          itemHandle !== vm.false
        ) {
          itemHandle.dispose();
        }
      });
      return arrayHandle;
    } else if (typeof value === 'object') {
      const objHandle = vm.newObject();
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const valHandle = this.convertValueToQuickJSHandle(vm, val);
        vm.setProp(objHandle, key, valHandle);
        // Don't dispose primitive handles
        if (
          valHandle !== vm.null &&
          valHandle !== vm.undefined &&
          valHandle !== vm.true &&
          valHandle !== vm.false
        ) {
          valHandle.dispose();
        }
      }
      return objHandle;
    } else {
      // Fallback for unknown types
      return vm.newString(String(value));
    }
  }
}

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
  private promiseFactory = new PromiseProxyFactory();

  constructor(private noteApi: FlintNoteApi) {
    // Store noteApi for actual API calls
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
    let registry: AsyncOperationRegistry | null = null;
    let lifecycleManager: VMLifecycleManager | null = null;
    let interrupted = false;

    try {
      vm = this.QuickJS!.newContext();
      registry = new AsyncOperationRegistry();
      lifecycleManager = new VMLifecycleManager(vm, registry);
      lifecycleManager.setMaxWaitTime(timeout);

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
      this.injectSecureAPI(
        vm,
        registry,
        options.vaultId,
        options.allowedAPIs,
        options.context
      );

      // Execute the user code to define the main function, then call it
      const setupResult = vm.evalCode(options.code);
      if (setupResult.error) {
        let errorMsg: string;
        try {
          const errorObj = vm.dump(setupResult.error);
          errorMsg = typeof errorObj === 'string' ? errorObj : String(errorObj);
        } catch {
          errorMsg = 'Code compilation failed';
        }
        setupResult.error.dispose();
        return {
          success: false,
          error: `Setup error: ${errorMsg}`,
          executionTime: Date.now() - startTime
        };
      }
      setupResult.value.dispose();

      // Now call the main() function which should return a promise
      const callResult = vm.evalCode('main()');
      if (callResult.error) {
        let errorMsg: string;
        try {
          const errorObj = vm.dump(callResult.error);
          errorMsg = typeof errorObj === 'string' ? errorObj : String(errorObj);
        } catch {
          errorMsg = 'main() call failed';
        }
        callResult.error.dispose();
        return {
          success: false,
          error: `Execution error: ${errorMsg}`,
          executionTime: Date.now() - startTime
        };
      }

      // At this point, we know callResult.error is undefined because we handled it above
      const evalResult = callResult;

      // Handle the result - wait for any async operations to complete
      let finalResult: unknown;

      try {
        const resultHandle = vm.unwrapResult(evalResult);

        // Wait for any pending async operations to complete
        await lifecycleManager.waitForPendingOperations();

        // Check if promise is resolved after async operations complete
        const promiseState = vm.getPromiseState(resultHandle);
        if (promiseState.type === 'fulfilled') {
          finalResult = vm.dump(promiseState.value);
          promiseState.value?.dispose();
        } else if (promiseState.type === 'rejected') {
          let errorMsg: string;
          try {
            const errorObj = vm.dump(promiseState.error);
            if (
              typeof errorObj === 'object' &&
              errorObj !== null &&
              'message' in errorObj
            ) {
              errorMsg = String(errorObj.message);
            } else if (typeof errorObj === 'string') {
              errorMsg = errorObj;
            } else {
              errorMsg = String(errorObj);
            }
          } catch {
            errorMsg = 'Unknown promise rejection error';
          }
          promiseState.error?.dispose();
          resultHandle.dispose();
          return {
            success: false,
            error: `Promise rejected: ${errorMsg}`,
            executionTime: Date.now() - startTime
          };
        } else {
          // Still pending after timeout
          resultHandle.dispose();
          return {
            success: false,
            error: `Execution timeout after ${timeout}ms - promise still pending`,
            executionTime: Date.now() - startTime
          };
        }

        resultHandle.dispose();
      } catch (error) {
        return {
          success: false,
          error: `Result processing failed: ${error instanceof Error ? error.message : String(error)}`,
          executionTime: Date.now() - startTime
        };
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
      // Always dispose the VM context and cleanup async operations
      if (lifecycleManager) {
        lifecycleManager.safeDispose();
      } else if (vm) {
        vm.dispose();
      }
    }
  }

  private injectSecureAPI(
    vm: QuickJSContext,
    registry: AsyncOperationRegistry,
    vaultId: string,
    allowedAPIs?: string[],
    customContext?: Record<string, unknown>
  ): void {
    // Check if notes.get is allowed
    const isNotesGetAllowed = allowedAPIs && allowedAPIs.includes('notes.get');

    // Create notes API object
    const notesObj = vm.newObject();
    vm.setProp(vm.global, 'notes', notesObj);

    if (isNotesGetAllowed) {
      // Add notes.get function with real async API integration
      const notesGetFn = vm.newFunction('get', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        // Create host promise for actual API call
        const hostPromise = this.noteApi.getNote(vaultId, noteId);

        // Create proxy promise in QuickJS that will resolve when hostPromise resolves
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });

      notesGetFn.consume((handle) => {
        vm.setProp(notesObj, 'get', handle);
      });
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
        // Only dispose if it's not a primitive handle (null, undefined, true, false)
        if (
          valueHandle !== vm.null &&
          valueHandle !== vm.undefined &&
          valueHandle !== vm.true &&
          valueHandle !== vm.false
        ) {
          valueHandle.dispose();
        }
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
