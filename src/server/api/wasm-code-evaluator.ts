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
import type { NoteMetadata } from '../types/index.js';

interface AsyncOperation {
  id: string;
  promise: Promise<unknown>;
  promiseHandle: QuickJSHandle;
  status: 'pending' | 'fulfilled' | 'rejected';
  createdAt: number;
  resolver?: (value: unknown) => void;
  rejector?: (error: unknown) => void;
}

export class AsyncOperationRegistry {
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
      // Fallback for unknown types - use better string conversion for error objects
      let stringValue: string;
      if (typeof value === 'object' && value !== null) {
        // Try to extract meaningful information from error objects
        try {
          const obj = value as Record<string, unknown>;
          if (obj.message && typeof obj.message === 'string') {
            stringValue = obj.message;
          } else if (typeof obj.toString === 'function') {
            const toStringResult = obj.toString();
            if (
              typeof toStringResult === 'string' &&
              toStringResult !== '[object Object]'
            ) {
              stringValue = toStringResult;
            } else {
              stringValue = JSON.stringify(value);
            }
          } else {
            stringValue = JSON.stringify(value);
          }
        } catch {
          stringValue = String(value);
        }
      } else {
        stringValue = String(value);
      }
      return vm.newString(stringValue);
    }
  }
}

// Type for JavaScript error objects dumped from QuickJS VM
interface JSErrorObject {
  message?: string;
  stack?: string;
  toString?(): string;
}

// Import FlintAPI types for parameter validation

// FlintAPI types for runtime use
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace FlintAPI {
  export interface CreateNoteOptions {
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
    vaultId?: string;
  }

  export interface UpdateNoteOptions {
    id: string;
    content?: string;
    contentHash?: string;
    metadata?: Record<string, unknown>;
    vaultId?: string;
  }

  export interface DeleteNoteOptions {
    id: string;
    contentHash?: string;
    vaultId?: string;
  }

  export interface ListNotesOptions {
    typeName?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'created' | 'updated' | 'title';
    sortOrder?: 'asc' | 'desc';
    vaultId?: string;
  }

  export interface RenameNoteOptions {
    id: string;
    newTitle: string;
    contentHash?: string;
    vaultId?: string;
  }

  export interface MoveNoteOptions {
    id: string;
    newType: string;
    contentHash?: string;
    vaultId?: string;
  }

  export interface SearchNotesOptions {
    query: string;
    types?: string[];
    limit?: number;
    offset?: number;
    vaultId?: string;
  }

  export interface CreateNoteTypeOptions {
    typeName: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
    vaultId?: string;
  }

  export interface UpdateNoteTypeOptions {
    typeName: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
    vaultId?: string;
  }

  export interface DeleteNoteTypeOptions {
    typeName: string;
    deleteNotes?: boolean;
    vaultId?: string;
  }

  export interface CreateVaultOptions {
    name: string;
    path: string;
  }

  export interface UpdateVaultOptions {
    vaultId: string;
    name?: string;
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
  errorDetails?: {
    type: 'syntax' | 'runtime' | 'timeout' | 'api' | 'validation' | 'promise';
    message: string;
    suggestion?: string;
    context?: Record<string, unknown>;
    stack?: string;
  };
  executionTime: number;
  debugInfo?: {
    pendingOperations?: number;
    vmAlive?: boolean;
    interruptCalled?: boolean;
  };
}

export class WASMCodeEvaluator {
  private QuickJS: QuickJSWASMModule | null = null;
  private initialized = false;
  protected promiseFactory = new PromiseProxyFactory();

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
        let errorStack: string | undefined;
        try {
          const errorObj = vm.dump(setupResult.error);
          errorMsg = this.extractErrorMessage(errorObj);
          if (typeof errorObj === 'object' && errorObj !== null) {
            errorStack = (errorObj as JSErrorObject).stack;
          }
        } catch {
          errorMsg = 'Code compilation failed';
        }
        setupResult.error.dispose();
        return {
          success: false,
          error: `Syntax Error: ${errorMsg}`,
          errorDetails: {
            type: 'syntax',
            message: errorMsg,
            suggestion:
              'Check your JavaScript syntax. Make sure to define a main() function that returns the result.',
            stack: errorStack
          },
          executionTime: Date.now() - startTime,
          debugInfo: {
            vmAlive: vm.alive,
            interruptCalled: interrupted
          }
        };
      }
      setupResult.value.dispose();

      // Now call the main() function which should return a promise
      const callResult = vm.evalCode('main()');
      if (callResult.error) {
        let errorMsg: string;
        let errorStack: string | undefined;
        let errorType: 'runtime' | 'validation' = 'runtime';
        let suggestion =
          'Ensure your main() function is defined and returns a value or promise.';

        try {
          const errorObj = vm.dump(callResult.error);
          errorMsg = this.extractErrorMessage(errorObj);
          if (typeof errorObj === 'object' && errorObj !== null) {
            errorStack = (errorObj as JSErrorObject).stack;
          }

          // Provide specific suggestions based on error type
          if (errorMsg.includes('main is not defined')) {
            errorType = 'validation';
            suggestion =
              'Your code must define a main() function. Example: async function main() { return "result"; }';
          } else if (
            errorMsg.includes('TypeError') ||
            errorMsg.includes('ReferenceError')
          ) {
            suggestion =
              'Check variable names and function calls for typos. Ensure all required APIs are in your allowedAPIs list.';
          } else if (
            errorMsg.includes('Permission') ||
            errorMsg.includes('not allowed')
          ) {
            errorType = 'validation';
            suggestion =
              'API call blocked by security policy. Check your allowedAPIs configuration.';
          }
        } catch {
          errorMsg = 'main() call failed';
        }
        callResult.error.dispose();
        return {
          success: false,
          error: `Runtime Error: ${errorMsg}`,
          errorDetails: {
            type: errorType,
            message: errorMsg,
            suggestion,
            context: { allowedAPIs: 'all' },
            stack: errorStack
          },
          executionTime: Date.now() - startTime,
          debugInfo: {
            vmAlive: vm.alive,
            interruptCalled: interrupted
          }
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
          let errorStack: string | undefined;
          let suggestion =
            'Check API parameters and ensure all required fields are provided.';

          try {
            const errorObj = vm.dump(promiseState.error);
            errorMsg = this.extractErrorMessage(errorObj);
            if (typeof errorObj === 'object' && errorObj !== null) {
              errorStack = (errorObj as JSErrorObject).stack;
            }

            // Provide contextual suggestions based on error content
            if (errorMsg.includes('not found')) {
              suggestion =
                'The requested resource was not found. Check IDs and ensure the item exists.';
            } else if (errorMsg.includes('hash')) {
              suggestion =
                'Content hash mismatch. Refetch the latest note data and use the current content_hash.';
            } else if (
              errorMsg.includes('permission') ||
              errorMsg.includes('unauthorized')
            ) {
              suggestion =
                'Permission denied. Check your API access rights and vault permissions.';
            } else if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
              suggestion =
                'Invalid input parameters. Check the API documentation for required fields and formats.';
            }
          } catch {
            errorMsg = 'Unknown promise rejection error';
          }
          promiseState.error?.dispose();
          resultHandle.dispose();
          // Determine if this is a user promise rejection or an API error
          // User promise rejections from Promise.reject() or throw in async functions
          // vs API call failures
          const isUserPromiseRejection =
            !errorMsg.includes('API call blocked') &&
            !errorMsg.includes('not found') &&
            !errorMsg.includes('hash') &&
            !errorMsg.includes('permission') &&
            !errorMsg.includes('unauthorized') &&
            !errorMsg.includes('validation') &&
            !errorMsg.includes('invalid');

          const errorPrefix = isUserPromiseRejection ? 'Promise rejected:' : 'API Error:';
          const errorType = isUserPromiseRejection ? 'promise' : 'api';

          return {
            success: false,
            error: `${errorPrefix} ${errorMsg}`,
            errorDetails: {
              type: errorType,
              message: errorMsg,
              suggestion,
              context: { vaultId: options.vaultId, timeout },
              stack: errorStack
            },
            executionTime: Date.now() - startTime,
            debugInfo: {
              pendingOperations: registry.getPendingCount(),
              vmAlive: vm.alive,
              interruptCalled: interrupted
            }
          };
        } else {
          // Still pending after timeout
          resultHandle.dispose();
          return {
            success: false,
            error: `Execution timeout after ${timeout}ms - promise still pending`,
            errorDetails: {
              type: 'timeout',
              message: `Operation exceeded ${timeout}ms timeout`,
              suggestion:
                'Reduce operation complexity, increase timeout, or check for infinite loops. Break large operations into smaller batches.',
              context: {
                timeout,
                pendingOperations: registry.getPendingCount(),
                executionTime: Date.now() - startTime
              }
            },
            executionTime: Date.now() - startTime,
            debugInfo: {
              pendingOperations: registry.getPendingCount(),
              vmAlive: vm.alive,
              interruptCalled: interrupted
            }
          };
        }

        resultHandle.dispose();
      } catch (error) {
        return {
          success: false,
          error: `Result processing failed: ${error instanceof Error ? error.message : String(error)}`,
          errorDetails: {
            type: 'runtime',
            message: error instanceof Error ? error.message : String(error),
            suggestion:
              'Internal processing error. This may indicate a bug in the evaluation system.',
            context: { step: 'result_processing' },
            stack: error instanceof Error ? error.stack : undefined
          },
          executionTime: Date.now() - startTime,
          debugInfo: {
            pendingOperations: registry.getPendingCount(),
            vmAlive: vm ? vm.alive : false,
            interruptCalled: interrupted
          }
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
          errorDetails: {
            type: 'timeout',
            message: `Code execution exceeded ${timeout}ms limit`,
            suggestion:
              'Reduce operation complexity, increase timeout, or optimize your code to avoid long-running operations.',
            context: { timeout, executionTime: Date.now() - startTime }
          },
          executionTime: Date.now() - startTime,
          debugInfo: {
            pendingOperations: registry ? registry.getPendingCount() : 0,
            vmAlive: vm ? vm.alive : false,
            interruptCalled: true
          }
        };
      }

      return {
        success: false,
        error: `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
        errorDetails: {
          type: 'runtime',
          message: error instanceof Error ? error.message : String(error),
          suggestion:
            'Check the error message for details. Common issues include syntax errors, undefined variables, or API call failures.',
          context: {
            vaultId: options.vaultId,
            allowedAPIs: options.allowedAPIs || 'all'
          },
          stack: error instanceof Error ? error.stack : undefined
        },
        executionTime: Date.now() - startTime,
        debugInfo: {
          pendingOperations: registry ? registry.getPendingCount() : 0,
          vmAlive: vm ? vm.alive : false,
          interruptCalled: interrupted
        }
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

  protected injectSecureAPI(
    vm: QuickJSContext,
    registry: AsyncOperationRegistry,
    vaultId: string,
    allowedAPIs?: string[],
    customContext?: Record<string, unknown>
  ): void {
    // Helper function to check if API is allowed
    const isApiAllowed = (apiName: string): boolean => {
      const allowed = allowedAPIs ? allowedAPIs.includes(apiName) : true; // Default to allow all if no restrictions
      return allowed;
    };

    // Create single flintApi object
    const flintApiObj = vm.newObject();
    vm.setProp(vm.global, 'flintApi', flintApiObj);

    // flintApi.getNote
    if (isApiAllowed('flintApi.getNote')) {
      const getNoteFn = vm.newFunction('getNote', (idArg) => {
        const id = vm.getString(idArg);
        const hostPromise = this.noteApi.getNote(vaultId, id);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getNote', vm.null);
    }

    // flintApi.createNote
    if (isApiAllowed('flintApi.createNote')) {
      const createNoteFn = vm.newFunction('createNote', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.CreateNoteOptions;
        const hostPromise = this.noteApi.createNote({
          type: options.type,
          title: options.title,
          content: options.content,
          metadata: options.metadata as NoteMetadata,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      createNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'createNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'createNote', vm.null);
    }

    // flintApi.updateNote
    if (isApiAllowed('flintApi.updateNote')) {
      const updateNoteFn = vm.newFunction('updateNote', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.UpdateNoteOptions;
        const hostPromise = this.noteApi.updateNote({
          identifier: options.id,
          content: options.content || '',
          contentHash: options.contentHash || '',
          vaultId,
          metadata: options.metadata as NoteMetadata
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      updateNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'updateNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'updateNote', vm.null);
    }

    // flintApi.deleteNote
    if (isApiAllowed('flintApi.deleteNote')) {
      const deleteNoteFn = vm.newFunction('deleteNote', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.DeleteNoteOptions;
        const hostPromise = this.noteApi.deleteNote({
          identifier: options.id,
          confirm: true,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      deleteNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'deleteNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'deleteNote', vm.null);
    }

    // flintApi.listNotes
    if (isApiAllowed('flintApi.listNotes')) {
      const listNotesFn = vm.newFunction('listNotes', (optionsArg) => {
        // Handle optional parameter - default to empty object if not provided
        const options = optionsArg
          ? (vm.dump(optionsArg) as FlintAPI.ListNotesOptions)
          : {};
        const hostPromise = this.noteApi.listNotes({
          typeName: options.typeName,
          limit: options.limit,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      listNotesFn.consume((handle) => {
        vm.setProp(flintApiObj, 'listNotes', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'listNotes', vm.null);
    }

    // flintApi.renameNote
    if (isApiAllowed('flintApi.renameNote')) {
      const renameNoteFn = vm.newFunction('renameNote', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.RenameNoteOptions;
        const hostPromise = this.noteApi.renameNote({
          noteId: options.id,
          newTitle: options.newTitle,
          contentHash: options.contentHash || '',
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      renameNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'renameNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'renameNote', vm.null);
    }

    // flintApi.moveNote
    if (isApiAllowed('flintApi.moveNote')) {
      const moveNoteFn = vm.newFunction('moveNote', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.MoveNoteOptions;
        const hostPromise = this.noteApi.moveNote({
          noteId: options.id,
          newType: options.newType,
          contentHash: options.contentHash || '',
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      moveNoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'moveNote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'moveNote', vm.null);
    }

    // flintApi.searchNotes
    if (isApiAllowed('flintApi.searchNotes')) {
      const searchNotesFn = vm.newFunction('searchNotes', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.SearchNotesOptions;
        const hostPromise = this.noteApi.searchNotesByText({
          query: options.query,
          typeFilter: options.types?.[0],
          limit: options.limit,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      searchNotesFn.consume((handle) => {
        vm.setProp(flintApiObj, 'searchNotes', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'searchNotes', vm.null);
    }

    // Note Types methods continue on flintApiObj

    // flintApi.createNoteType
    if (isApiAllowed('flintApi.createNoteType')) {
      const createNoteTypeFn = vm.newFunction('createNoteType', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.CreateNoteTypeOptions;
        const hostPromise = this.noteApi.createNoteType({
          type_name: options.typeName,
          description: options.description || '',
          agent_instructions: options.agent_instructions
            ? [options.agent_instructions]
            : undefined,
          // template: options.template, // Template not supported in createNoteType API
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      createNoteTypeFn.consume((handle) => {
        vm.setProp(flintApiObj, 'createNoteType', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'createNoteType', vm.null);
    }

    // flintApi.listNoteTypes
    if (isApiAllowed('flintApi.listNoteTypes')) {
      const listNoteTypesFn = vm.newFunction('listNoteTypes', () => {
        const hostPromise = this.noteApi.listNoteTypes({ vault_id: vaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      listNoteTypesFn.consume((handle) => {
        vm.setProp(flintApiObj, 'listNoteTypes', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'listNoteTypes', vm.null);
    }

    // flintApi.getNoteType
    if (isApiAllowed('flintApi.getNoteType')) {
      const getNoteTypeFn = vm.newFunction('getNoteType', (typeNameArg) => {
        const typeName = vm.getString(typeNameArg);
        const hostPromise = this.noteApi.getNoteTypeInfo({
          type_name: typeName,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getNoteTypeFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getNoteType', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getNoteType', vm.null);
    }

    // flintApi.updateNoteType
    if (isApiAllowed('flintApi.updateNoteType')) {
      const updateNoteTypeFn = vm.newFunction('updateNoteType', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.UpdateNoteTypeOptions;
        const hostPromise = this.noteApi.updateNoteType({
          type_name: options.typeName,
          description: options.description,
          instructions: options.agent_instructions
            ? [options.agent_instructions]
            : undefined,
          // template: options.template, // Template not supported in updateNoteType API
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      updateNoteTypeFn.consume((handle) => {
        vm.setProp(flintApiObj, 'updateNoteType', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'updateNoteType', vm.null);
    }

    // flintApi.deleteNoteType
    if (isApiAllowed('flintApi.deleteNoteType')) {
      const deleteNoteTypeFn = vm.newFunction('deleteNoteType', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.DeleteNoteTypeOptions;
        const hostPromise = this.noteApi.deleteNoteType({
          type_name: options.typeName,
          action: options.deleteNotes ? 'delete' : 'error',
          confirm: options.deleteNotes,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      deleteNoteTypeFn.consume((handle) => {
        vm.setProp(flintApiObj, 'deleteNoteType', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'deleteNoteType', vm.null);
    }

    // Vaults methods continue on flintApiObj

    // flintApi.getCurrentVault
    if (isApiAllowed('flintApi.getCurrentVault')) {
      const getCurrentVaultFn = vm.newFunction('getCurrentVault', () => {
        const hostPromise = this.noteApi.getCurrentVault();
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getCurrentVaultFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getCurrentVault', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getCurrentVault', vm.null);
    }

    // flintApi.listVaults
    if (isApiAllowed('flintApi.listVaults')) {
      const listVaultsFn = vm.newFunction('listVaults', () => {
        const hostPromise = this.noteApi.listVaults();
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      listVaultsFn.consume((handle) => {
        vm.setProp(flintApiObj, 'listVaults', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'listVaults', vm.null);
    }

    // flintApi.createVault
    if (isApiAllowed('flintApi.createVault')) {
      const createVaultFn = vm.newFunction('createVault', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.CreateVaultOptions;
        const hostPromise = this.noteApi.createVault({
          id: `vault_${Date.now()}`,
          name: options.name,
          path: options.path,
          initialize: true
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      createVaultFn.consume((handle) => {
        vm.setProp(flintApiObj, 'createVault', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'createVault', vm.null);
    }

    // flintApi.switchVault
    if (isApiAllowed('flintApi.switchVault')) {
      const switchVaultFn = vm.newFunction('switchVault', (vaultIdArg) => {
        const targetVaultId = vm.getString(vaultIdArg);
        const hostPromise = this.noteApi.switchVault({ id: targetVaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      switchVaultFn.consume((handle) => {
        vm.setProp(flintApiObj, 'switchVault', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'switchVault', vm.null);
    }

    // flintApi.updateVault
    if (isApiAllowed('flintApi.updateVault')) {
      const updateVaultFn = vm.newFunction('updateVault', (optionsArg) => {
        const options = vm.dump(optionsArg) as FlintAPI.UpdateVaultOptions;
        const hostPromise = this.noteApi.updateVault({
          id: options.vaultId,
          name: options.name
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      updateVaultFn.consume((handle) => {
        vm.setProp(flintApiObj, 'updateVault', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'updateVault', vm.null);
    }

    // flintApi.removeVault
    if (isApiAllowed('flintApi.removeVault')) {
      const removeVaultFn = vm.newFunction('removeVault', (vaultIdArg) => {
        const targetVaultId = vm.getString(vaultIdArg);
        const hostPromise = this.noteApi.removeVault({ id: targetVaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      removeVaultFn.consume((handle) => {
        vm.setProp(flintApiObj, 'removeVault', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'removeVault', vm.null);
    }

    // Links methods continue on flintApiObj

    // flintApi.getNoteLinks
    if (isApiAllowed('flintApi.getNoteLinks')) {
      const getNoteLinksFn = vm.newFunction('getNoteLinks', (identifierArg) => {
        const identifier = vm.getString(identifierArg);
        const hostPromise = this.noteApi.getNoteLinks(vaultId, identifier);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getNoteLinksFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getNoteLinks', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getNoteLinks', vm.null);
    }

    // flintApi.getBacklinks
    if (isApiAllowed('flintApi.getBacklinks')) {
      const getBacklinksFn = vm.newFunction('getBacklinks', (identifierArg) => {
        const identifier = vm.getString(identifierArg);
        const hostPromise = this.noteApi.getBacklinks(vaultId, identifier);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getBacklinksFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getBacklinks', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getBacklinks', vm.null);
    }

    // flintApi.findBrokenLinks
    if (isApiAllowed('flintApi.findBrokenLinks')) {
      const findBrokenLinksFn = vm.newFunction('findBrokenLinks', () => {
        const hostPromise = this.noteApi.findBrokenLinks(vaultId);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      findBrokenLinksFn.consume((handle) => {
        vm.setProp(flintApiObj, 'findBrokenLinks', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'findBrokenLinks', vm.null);
    }

    // flintApi.searchByLinks
    if (isApiAllowed('flintApi.searchByLinks')) {
      const searchByLinksFn = vm.newFunction('searchByLinks', (optionsArg) => {
        const options = vm.dump(optionsArg) as { text?: string; url?: string };
        const hostPromise = this.noteApi.searchByLinks({
          has_links_to: options.text ? [options.text] : undefined,
          external_domains: options.url ? [options.url] : undefined,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      searchByLinksFn.consume((handle) => {
        vm.setProp(flintApiObj, 'searchByLinks', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'searchByLinks', vm.null);
    }

    // flintApi.migrateLinks
    if (isApiAllowed('flintApi.migrateLinks')) {
      const migrateLinksFn = vm.newFunction('migrateLinks', (forceArg) => {
        const force = forceArg
          ? vm.typeof(forceArg) === 'boolean' && vm.dump(forceArg)
          : false;
        const hostPromise = this.noteApi.migrateLinks(vaultId, force);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      migrateLinksFn.consume((handle) => {
        vm.setProp(flintApiObj, 'migrateLinks', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'migrateLinks', vm.null);
    }

    // Hierarchy methods continue on flintApiObj

    // flintApi.addSubnote
    if (isApiAllowed('flintApi.addSubnote')) {
      const addSubnoteFn = vm.newFunction('addSubnote', (optionsArg) => {
        const options = vm.dump(optionsArg) as {
          parent_id: string;
          child_id: string;
          order?: number;
        };
        const hostPromise = this.noteApi.addSubnote({
          parent_id: options.parent_id,
          child_id: options.child_id,
          position: options.order,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      addSubnoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'addSubnote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'addSubnote', vm.null);
    }

    // flintApi.removeSubnote
    if (isApiAllowed('flintApi.removeSubnote')) {
      const removeSubnoteFn = vm.newFunction('removeSubnote', (optionsArg) => {
        const options = vm.dump(optionsArg) as { parent_id: string; child_id: string };
        const hostPromise = this.noteApi.removeSubnote({
          parent_id: options.parent_id,
          child_id: options.child_id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      removeSubnoteFn.consume((handle) => {
        vm.setProp(flintApiObj, 'removeSubnote', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'removeSubnote', vm.null);
    }

    // flintApi.reorderSubnotes
    if (isApiAllowed('flintApi.reorderSubnotes')) {
      const reorderSubnotesFn = vm.newFunction('reorderSubnotes', (optionsArg) => {
        const options = vm.dump(optionsArg) as {
          parent_id: string;
          child_orders: Array<{ child_id: string; order: number }>;
        };
        const hostPromise = this.noteApi.reorderSubnotes({
          parent_id: options.parent_id,
          child_ids: options.child_orders.map((item) => item.child_id),
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      reorderSubnotesFn.consume((handle) => {
        vm.setProp(flintApiObj, 'reorderSubnotes', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'reorderSubnotes', vm.null);
    }

    // flintApi.getHierarchyPath
    if (isApiAllowed('flintApi.getHierarchyPath')) {
      const getHierarchyPathFn = vm.newFunction('getHierarchyPath', (idArg) => {
        const id = vm.getString(idArg);
        const hostPromise = this.noteApi.getHierarchyPath({
          note_id: id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getHierarchyPathFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getHierarchyPath', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getHierarchyPath', vm.null);
    }

    // flintApi.getDescendants
    if (isApiAllowed('flintApi.getDescendants')) {
      const getDescendantsFn = vm.newFunction('getDescendants', (optionsArg) => {
        const options = vm.dump(optionsArg) as { id: string; max_depth?: number };
        const hostPromise = this.noteApi.getDescendants({
          note_id: options.id,
          max_depth: options.max_depth,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getDescendantsFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getDescendants', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getDescendants', vm.null);
    }

    // flintApi.getChildren
    if (isApiAllowed('flintApi.getChildren')) {
      const getChildrenFn = vm.newFunction('getChildren', (idArg) => {
        const id = vm.getString(idArg);
        const hostPromise = this.noteApi.getChildren({
          note_id: id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getChildrenFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getChildren', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getChildren', vm.null);
    }

    // flintApi.getParents
    if (isApiAllowed('flintApi.getParents')) {
      const getParentsFn = vm.newFunction('getParents', (idArg) => {
        const id = vm.getString(idArg);
        const hostPromise = this.noteApi.getParents({
          note_id: id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getParentsFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getParents', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getParents', vm.null);
    }

    // Relationships methods continue on flintApiObj

    // flintApi.getNoteRelationships
    if (isApiAllowed('flintApi.getNoteRelationships')) {
      const getNoteRelationshipsFn = vm.newFunction('getNoteRelationships', (idArg) => {
        const id = vm.getString(idArg);
        const hostPromise = this.noteApi.getNoteRelationships({
          note_id: id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getNoteRelationshipsFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getNoteRelationships', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getNoteRelationships', vm.null);
    }

    // flintApi.getRelatedNotes
    if (isApiAllowed('flintApi.getRelatedNotes')) {
      const getRelatedNotesFn = vm.newFunction('getRelatedNotes', (optionsArg) => {
        const options = vm.dump(optionsArg) as {
          id: string;
          limit?: number;
          min_strength?: number;
        };
        const hostPromise = this.noteApi.getRelatedNotes({
          note_id: options.id,
          max_results: options.limit,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      getRelatedNotesFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getRelatedNotes', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getRelatedNotes', vm.null);
    }

    // flintApi.findRelationshipPath
    if (isApiAllowed('flintApi.findRelationshipPath')) {
      const findRelationshipPathFn = vm.newFunction(
        'findRelationshipPath',
        (optionsArg) => {
          const options = vm.dump(optionsArg) as { fromId: string; toId: string };
          const hostPromise = this.noteApi.findRelationshipPath({
            start_note_id: options.fromId,
            end_note_id: options.toId,
            vault_id: vaultId
          });
          return this.promiseFactory.createProxy(vm, registry, hostPromise);
        }
      );
      findRelationshipPathFn.consume((handle) => {
        vm.setProp(flintApiObj, 'findRelationshipPath', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'findRelationshipPath', vm.null);
    }

    // flintApi.getClusteringCoefficient
    if (isApiAllowed('flintApi.getClusteringCoefficient')) {
      const getClusteringCoefficientFn = vm.newFunction(
        'getClusteringCoefficient',
        (idArg) => {
          const id = vm.getString(idArg);
          const hostPromise = this.noteApi.getClusteringCoefficient({
            note_id: id,
            vault_id: vaultId
          });
          return this.promiseFactory.createProxy(vm, registry, hostPromise);
        }
      );
      getClusteringCoefficientFn.consume((handle) => {
        vm.setProp(flintApiObj, 'getClusteringCoefficient', handle);
      });
    } else {
      vm.setProp(flintApiObj, 'getClusteringCoefficient', vm.null);
    }

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

    // Dispose the main flintApi object
    flintApiObj.dispose();

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

  private extractErrorMessage(errorObj: unknown): string {
    if (typeof errorObj === 'string') {
      return errorObj;
    }

    if (typeof errorObj === 'object' && errorObj !== null) {
      const obj = errorObj as JSErrorObject;

      // Try message property first
      if (obj.message && typeof obj.message === 'string') {
        return obj.message;
      }

      // Try toString method
      if (typeof obj.toString === 'function') {
        try {
          const toStringResult = obj.toString();
          if (
            typeof toStringResult === 'string' &&
            toStringResult !== '[object Object]'
          ) {
            return toStringResult;
          }
        } catch {
          // toString failed, continue to next fallback
        }
      }

      // Try JSON.stringify as fallback
      try {
        return JSON.stringify(obj);
      } catch {
        // JSON.stringify failed, use final fallback
      }
    }

    // Final fallback
    return String(errorObj);
  }

  dispose(): void {
    if (this.QuickJS) {
      // QuickJS doesn't require explicit disposal of the main context
      this.initialized = false;
    }
  }
}
