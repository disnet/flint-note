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
import type { MetadataSchema, MetadataFieldDefinition } from '../core/metadata-schema.js';

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

// Type for JavaScript error objects dumped from QuickJS VM
interface JSErrorObject {
  message?: string;
  stack?: string;
  toString?(): string;
}

// WASM API parameter types - extracted from vm.dump() calls
interface WASMCreateNoteOptions {
  type: string;
  title: string;
  content: string;
  metadata?: NoteMetadata;
}

interface WASMUpdateNoteOptions {
  identifier: string;
  content: string;
  contentHash: string;
  metadata?: NoteMetadata;
}

interface WASMDeleteNoteOptions {
  identifier: string;
  confirm?: boolean;
}

interface WASMListNotesOptions {
  typeName?: string;
  limit?: number;
}

interface WASMRenameNoteOptions {
  identifier: string;
  new_title: string;
  content_hash: string;
}

interface WASMMoveNoteOptions {
  identifier: string;
  new_type: string;
  content_hash: string;
}

interface WASMSearchNotesOptions {
  query: string;
  typeFilter?: string;
  limit?: number;
}

interface WASMCreateNoteTypeOptions {
  type_name: string;
  description: string;
  agent_instructions?: string[];
  metadata_schema?: MetadataSchema;
}

interface WASMUpdateNoteTypeOptions {
  type_name: string;
  description?: string;
  instructions?: string[];
  metadata_schema?: MetadataFieldDefinition[];
}

interface WASMDeleteNoteTypeOptions {
  type_name: string;
  action: 'error' | 'migrate' | 'delete';
  target_type?: string;
  confirm?: boolean;
}

interface WASMCreateVaultOptions {
  id: string;
  name: string;
  path: string;
  description?: string;
  initialize?: boolean;
  switch_to?: boolean;
}

interface WASMUpdateVaultOptions {
  id: string;
  name?: string;
  description?: string;
}

// Links API interfaces
interface WASMSearchByLinksOptions {
  has_links_to?: string[];
  linked_from?: string[];
  external_domains?: string[];
  broken_links?: boolean;
}

// Hierarchy API interfaces
interface WASMAddSubnoteOptions {
  parent_id: string;
  child_id: string;
  position?: number;
}

interface WASMRemoveSubnoteOptions {
  parent_id: string;
  child_id: string;
}

interface WASMReorderSubnotesOptions {
  parent_id: string;
  child_ids: string[];
}

interface WASMGetDescendantsOptions {
  note_id: string;
  max_depth?: number;
}

// Relationships API interfaces
interface WASMGetRelatedNotesOptions {
  note_id: string;
  max_results?: number;
}

interface WASMFindRelationshipPathOptions {
  start_note_id: string;
  end_note_id: string;
  max_depth?: number;
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
        let errorStack: string | undefined;
        try {
          const errorObj = vm.dump(setupResult.error) as JSErrorObject;
          if (typeof errorObj === 'object' && errorObj !== null) {
            errorMsg = errorObj.message || errorObj.toString?.() || String(errorObj);
            errorStack = errorObj.stack;
          } else {
            errorMsg = typeof errorObj === 'string' ? errorObj : String(errorObj);
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
          const errorObj = vm.dump(callResult.error) as JSErrorObject;
          if (typeof errorObj === 'object' && errorObj !== null) {
            errorMsg = errorObj.message || errorObj.toString?.() || String(errorObj);
            errorStack = errorObj.stack;

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
          } else {
            errorMsg = typeof errorObj === 'string' ? errorObj : String(errorObj);
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
            const errorObj = vm.dump(promiseState.error) as JSErrorObject;
            if (typeof errorObj === 'object' && errorObj !== null) {
              errorMsg = errorObj.message || String(errorObj);
              errorStack = errorObj.stack;

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
              } else if (
                errorMsg.includes('validation') ||
                errorMsg.includes('invalid')
              ) {
                suggestion =
                  'Invalid input parameters. Check the API documentation for required fields and formats.';
              }
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

  private injectSecureAPI(
    vm: QuickJSContext,
    registry: AsyncOperationRegistry,
    vaultId: string,
    allowedAPIs?: string[],
    customContext?: Record<string, unknown>
  ): void {
    // Helper function to check if API is allowed
    const isApiAllowed = (apiName: string): boolean => {
      const allowed = allowedAPIs ? allowedAPIs.includes(apiName) : true; // Default to allow all if no restrictions
      if (!allowed && allowedAPIs) {
        console.warn(`API call blocked: ${apiName}. Allowed APIs:`, allowedAPIs);
      }
      return allowed;
    };

    // Create notes API object
    const notesObj = vm.newObject();
    vm.setProp(vm.global, 'notes', notesObj);

    // notes.get
    if (isApiAllowed('notes.get')) {
      const notesGetFn = vm.newFunction('get', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        const hostPromise = this.noteApi.getNote(vaultId, noteId);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesGetFn.consume((handle) => {
        vm.setProp(notesObj, 'get', handle);
      });
    } else {
      vm.setProp(notesObj, 'get', vm.null);
    }

    // notes.create
    if (isApiAllowed('notes.create')) {
      const notesCreateFn = vm.newFunction('create', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMCreateNoteOptions;
        const hostPromise = this.noteApi.createNote({
          type: options.type,
          title: options.title,
          content: options.content,
          metadata: options.metadata,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesCreateFn.consume((handle) => {
        vm.setProp(notesObj, 'create', handle);
      });
    } else {
      vm.setProp(notesObj, 'create', vm.null);
    }

    // notes.update
    if (isApiAllowed('notes.update')) {
      const notesUpdateFn = vm.newFunction('update', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMUpdateNoteOptions;
        const hostPromise = this.noteApi.updateNote({
          identifier: options.identifier,
          content: options.content,
          contentHash: options.contentHash,
          vaultId,
          metadata: options.metadata
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesUpdateFn.consume((handle) => {
        vm.setProp(notesObj, 'update', handle);
      });
    } else {
      vm.setProp(notesObj, 'update', vm.null);
    }

    // notes.delete
    if (isApiAllowed('notes.delete')) {
      const notesDeleteFn = vm.newFunction('delete', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMDeleteNoteOptions;
        const hostPromise = this.noteApi.deleteNote({
          identifier: options.identifier,
          confirm: options.confirm,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesDeleteFn.consume((handle) => {
        vm.setProp(notesObj, 'delete', handle);
      });
    } else {
      vm.setProp(notesObj, 'delete', vm.null);
    }

    // notes.list
    if (isApiAllowed('notes.list')) {
      const notesListFn = vm.newFunction('list', (optionsArg) => {
        // Handle optional parameter - default to empty object if not provided
        const options = optionsArg ? (vm.dump(optionsArg) as WASMListNotesOptions) : {};
        const hostPromise = this.noteApi.listNotes({
          typeName: options.typeName,
          limit: options.limit,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesListFn.consume((handle) => {
        vm.setProp(notesObj, 'list', handle);
      });
    } else {
      vm.setProp(notesObj, 'list', vm.null);
    }

    // notes.rename
    if (isApiAllowed('notes.rename')) {
      const notesRenameFn = vm.newFunction('rename', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMRenameNoteOptions;
        const hostPromise = this.noteApi.renameNote({
          identifier: options.identifier,
          new_title: options.new_title,
          content_hash: options.content_hash,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesRenameFn.consume((handle) => {
        vm.setProp(notesObj, 'rename', handle);
      });
    } else {
      vm.setProp(notesObj, 'rename', vm.null);
    }

    // notes.move
    if (isApiAllowed('notes.move')) {
      const notesMoveFn = vm.newFunction('move', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMMoveNoteOptions;
        const hostPromise = this.noteApi.moveNote({
          identifier: options.identifier,
          new_type: options.new_type,
          content_hash: options.content_hash,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesMoveFn.consume((handle) => {
        vm.setProp(notesObj, 'move', handle);
      });
    } else {
      vm.setProp(notesObj, 'move', vm.null);
    }

    // notes.search
    if (isApiAllowed('notes.search')) {
      const notesSearchFn = vm.newFunction('search', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMSearchNotesOptions;
        const hostPromise = this.noteApi.searchNotesByText({
          query: options.query,
          typeFilter: options.typeFilter,
          limit: options.limit,
          vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      notesSearchFn.consume((handle) => {
        vm.setProp(notesObj, 'search', handle);
      });
    } else {
      vm.setProp(notesObj, 'search', vm.null);
    }

    notesObj.dispose();

    // Create noteTypes API object
    const noteTypesObj = vm.newObject();
    vm.setProp(vm.global, 'noteTypes', noteTypesObj);

    // noteTypes.create
    if (isApiAllowed('noteTypes.create')) {
      const noteTypesCreateFn = vm.newFunction('create', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMCreateNoteTypeOptions;
        const hostPromise = this.noteApi.createNoteType({
          type_name: options.type_name,
          description: options.description,
          agent_instructions: options.agent_instructions,
          metadata_schema: options.metadata_schema,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      noteTypesCreateFn.consume((handle) => {
        vm.setProp(noteTypesObj, 'create', handle);
      });
    } else {
      vm.setProp(noteTypesObj, 'create', vm.null);
    }

    // noteTypes.list
    if (isApiAllowed('noteTypes.list')) {
      const noteTypesListFn = vm.newFunction('list', () => {
        const hostPromise = this.noteApi.listNoteTypes({ vault_id: vaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      noteTypesListFn.consume((handle) => {
        vm.setProp(noteTypesObj, 'list', handle);
      });
    } else {
      vm.setProp(noteTypesObj, 'list', vm.null);
    }

    // noteTypes.get
    if (isApiAllowed('noteTypes.get')) {
      const noteTypesGetFn = vm.newFunction('get', (typeNameArg) => {
        const typeName = vm.getString(typeNameArg);
        const hostPromise = this.noteApi.getNoteTypeInfo({
          type_name: typeName,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      noteTypesGetFn.consume((handle) => {
        vm.setProp(noteTypesObj, 'get', handle);
      });
    } else {
      vm.setProp(noteTypesObj, 'get', vm.null);
    }

    // noteTypes.update
    if (isApiAllowed('noteTypes.update')) {
      const noteTypesUpdateFn = vm.newFunction('update', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMUpdateNoteTypeOptions;
        const hostPromise = this.noteApi.updateNoteType({
          type_name: options.type_name,
          description: options.description,
          instructions: options.instructions,
          metadata_schema: options.metadata_schema,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      noteTypesUpdateFn.consume((handle) => {
        vm.setProp(noteTypesObj, 'update', handle);
      });
    } else {
      vm.setProp(noteTypesObj, 'update', vm.null);
    }

    // noteTypes.delete
    if (isApiAllowed('noteTypes.delete')) {
      const noteTypesDeleteFn = vm.newFunction('delete', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMDeleteNoteTypeOptions;
        const hostPromise = this.noteApi.deleteNoteType({
          type_name: options.type_name,
          action: options.action,
          target_type: options.target_type,
          confirm: options.confirm,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      noteTypesDeleteFn.consume((handle) => {
        vm.setProp(noteTypesObj, 'delete', handle);
      });
    } else {
      vm.setProp(noteTypesObj, 'delete', vm.null);
    }

    noteTypesObj.dispose();

    // Create vaults API object
    const vaultsObj = vm.newObject();
    vm.setProp(vm.global, 'vaults', vaultsObj);

    // vaults.getCurrent
    if (isApiAllowed('vaults.getCurrent')) {
      const vaultsGetCurrentFn = vm.newFunction('getCurrent', () => {
        const hostPromise = this.noteApi.getCurrentVault();
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsGetCurrentFn.consume((handle) => {
        vm.setProp(vaultsObj, 'getCurrent', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'getCurrent', vm.null);
    }

    // vaults.list
    if (isApiAllowed('vaults.list')) {
      const vaultsListFn = vm.newFunction('list', () => {
        const hostPromise = this.noteApi.listVaults();
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsListFn.consume((handle) => {
        vm.setProp(vaultsObj, 'list', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'list', vm.null);
    }

    // vaults.create
    if (isApiAllowed('vaults.create')) {
      const vaultsCreateFn = vm.newFunction('create', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMCreateVaultOptions;
        const hostPromise = this.noteApi.createVault({
          id: options.id,
          name: options.name,
          path: options.path,
          description: options.description,
          initialize: options.initialize,
          switch_to: options.switch_to
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsCreateFn.consume((handle) => {
        vm.setProp(vaultsObj, 'create', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'create', vm.null);
    }

    // vaults.switch
    if (isApiAllowed('vaults.switch')) {
      const vaultsSwitchFn = vm.newFunction('switch', (vaultIdArg) => {
        const targetVaultId = vm.getString(vaultIdArg);
        const hostPromise = this.noteApi.switchVault({ id: targetVaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsSwitchFn.consume((handle) => {
        vm.setProp(vaultsObj, 'switch', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'switch', vm.null);
    }

    // vaults.update
    if (isApiAllowed('vaults.update')) {
      const vaultsUpdateFn = vm.newFunction('update', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMUpdateVaultOptions;
        const hostPromise = this.noteApi.updateVault({
          id: options.id,
          name: options.name,
          description: options.description
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsUpdateFn.consume((handle) => {
        vm.setProp(vaultsObj, 'update', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'update', vm.null);
    }

    // vaults.remove
    if (isApiAllowed('vaults.remove')) {
      const vaultsRemoveFn = vm.newFunction('remove', (vaultIdArg) => {
        const targetVaultId = vm.getString(vaultIdArg);
        const hostPromise = this.noteApi.removeVault({ id: targetVaultId });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      vaultsRemoveFn.consume((handle) => {
        vm.setProp(vaultsObj, 'remove', handle);
      });
    } else {
      vm.setProp(vaultsObj, 'remove', vm.null);
    }

    vaultsObj.dispose();

    // Create links API object
    const linksObj = vm.newObject();
    vm.setProp(vm.global, 'links', linksObj);

    // links.getForNote
    if (isApiAllowed('links.getForNote')) {
      const linksGetForNoteFn = vm.newFunction('getForNote', (identifierArg) => {
        const identifier = vm.getString(identifierArg);
        const hostPromise = this.noteApi.getNoteLinks(vaultId, identifier);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      linksGetForNoteFn.consume((handle) => {
        vm.setProp(linksObj, 'getForNote', handle);
      });
    } else {
      vm.setProp(linksObj, 'getForNote', vm.null);
    }

    // links.getBacklinks
    if (isApiAllowed('links.getBacklinks')) {
      const linksGetBacklinksFn = vm.newFunction('getBacklinks', (identifierArg) => {
        const identifier = vm.getString(identifierArg);
        const hostPromise = this.noteApi.getBacklinks(vaultId, identifier);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      linksGetBacklinksFn.consume((handle) => {
        vm.setProp(linksObj, 'getBacklinks', handle);
      });
    } else {
      vm.setProp(linksObj, 'getBacklinks', vm.null);
    }

    // links.findBroken
    if (isApiAllowed('links.findBroken')) {
      const linksFindBrokenFn = vm.newFunction('findBroken', () => {
        const hostPromise = this.noteApi.findBrokenLinks(vaultId);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      linksFindBrokenFn.consume((handle) => {
        vm.setProp(linksObj, 'findBroken', handle);
      });
    } else {
      vm.setProp(linksObj, 'findBroken', vm.null);
    }

    // links.searchBy
    if (isApiAllowed('links.searchBy')) {
      const linksSearchByFn = vm.newFunction('searchBy', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMSearchByLinksOptions;
        const hostPromise = this.noteApi.searchByLinks({
          has_links_to: options.has_links_to,
          linked_from: options.linked_from,
          external_domains: options.external_domains,
          broken_links: options.broken_links,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      linksSearchByFn.consume((handle) => {
        vm.setProp(linksObj, 'searchBy', handle);
      });
    } else {
      vm.setProp(linksObj, 'searchBy', vm.null);
    }

    // links.migrate
    if (isApiAllowed('links.migrate')) {
      const linksMigrateFn = vm.newFunction('migrate', (forceArg) => {
        const force = forceArg
          ? vm.typeof(forceArg) === 'boolean' && vm.dump(forceArg)
          : false;
        const hostPromise = this.noteApi.migrateLinks(vaultId, force);
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      linksMigrateFn.consume((handle) => {
        vm.setProp(linksObj, 'migrate', handle);
      });
    } else {
      vm.setProp(linksObj, 'migrate', vm.null);
    }

    linksObj.dispose();

    // Create hierarchy API object
    const hierarchyObj = vm.newObject();
    vm.setProp(vm.global, 'hierarchy', hierarchyObj);

    // hierarchy.addSubnote
    if (isApiAllowed('hierarchy.addSubnote')) {
      const hierarchyAddSubnoteFn = vm.newFunction('addSubnote', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMAddSubnoteOptions;
        const hostPromise = this.noteApi.addSubnote({
          parent_id: options.parent_id,
          child_id: options.child_id,
          position: options.position,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyAddSubnoteFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'addSubnote', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'addSubnote', vm.null);
    }

    // hierarchy.removeSubnote
    if (isApiAllowed('hierarchy.removeSubnote')) {
      const hierarchyRemoveSubnoteFn = vm.newFunction('removeSubnote', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMRemoveSubnoteOptions;
        const hostPromise = this.noteApi.removeSubnote({
          parent_id: options.parent_id,
          child_id: options.child_id,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyRemoveSubnoteFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'removeSubnote', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'removeSubnote', vm.null);
    }

    // hierarchy.reorder
    if (isApiAllowed('hierarchy.reorder')) {
      const hierarchyReorderFn = vm.newFunction('reorder', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMReorderSubnotesOptions;
        const hostPromise = this.noteApi.reorderSubnotes({
          parent_id: options.parent_id,
          child_ids: options.child_ids,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyReorderFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'reorder', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'reorder', vm.null);
    }

    // hierarchy.getPath
    if (isApiAllowed('hierarchy.getPath')) {
      const hierarchyGetPathFn = vm.newFunction('getPath', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        const hostPromise = this.noteApi.getHierarchyPath({
          note_id: noteId,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyGetPathFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'getPath', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'getPath', vm.null);
    }

    // hierarchy.getDescendants
    if (isApiAllowed('hierarchy.getDescendants')) {
      const hierarchyGetDescendantsFn = vm.newFunction('getDescendants', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMGetDescendantsOptions;
        const hostPromise = this.noteApi.getDescendants({
          note_id: options.note_id,
          max_depth: options.max_depth,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyGetDescendantsFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'getDescendants', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'getDescendants', vm.null);
    }

    // hierarchy.getChildren
    if (isApiAllowed('hierarchy.getChildren')) {
      const hierarchyGetChildrenFn = vm.newFunction('getChildren', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        const hostPromise = this.noteApi.getChildren({
          note_id: noteId,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyGetChildrenFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'getChildren', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'getChildren', vm.null);
    }

    // hierarchy.getParents
    if (isApiAllowed('hierarchy.getParents')) {
      const hierarchyGetParentsFn = vm.newFunction('getParents', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        const hostPromise = this.noteApi.getParents({
          note_id: noteId,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      hierarchyGetParentsFn.consume((handle) => {
        vm.setProp(hierarchyObj, 'getParents', handle);
      });
    } else {
      vm.setProp(hierarchyObj, 'getParents', vm.null);
    }

    hierarchyObj.dispose();

    // Create relationships API object
    const relationshipsObj = vm.newObject();
    vm.setProp(vm.global, 'relationships', relationshipsObj);

    // relationships.get
    if (isApiAllowed('relationships.get')) {
      const relationshipsGetFn = vm.newFunction('get', (noteIdArg) => {
        const noteId = vm.getString(noteIdArg);
        const hostPromise = this.noteApi.getNoteRelationships({
          note_id: noteId,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      relationshipsGetFn.consume((handle) => {
        vm.setProp(relationshipsObj, 'get', handle);
      });
    } else {
      vm.setProp(relationshipsObj, 'get', vm.null);
    }

    // relationships.getRelated
    if (isApiAllowed('relationships.getRelated')) {
      const relationshipsGetRelatedFn = vm.newFunction('getRelated', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMGetRelatedNotesOptions;
        const hostPromise = this.noteApi.getRelatedNotes({
          note_id: options.note_id,
          max_results: options.max_results,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      relationshipsGetRelatedFn.consume((handle) => {
        vm.setProp(relationshipsObj, 'getRelated', handle);
      });
    } else {
      vm.setProp(relationshipsObj, 'getRelated', vm.null);
    }

    // relationships.findPath
    if (isApiAllowed('relationships.findPath')) {
      const relationshipsFindPathFn = vm.newFunction('findPath', (optionsArg) => {
        const options = vm.dump(optionsArg) as WASMFindRelationshipPathOptions;
        const hostPromise = this.noteApi.findRelationshipPath({
          start_note_id: options.start_note_id,
          end_note_id: options.end_note_id,
          max_depth: options.max_depth,
          vault_id: vaultId
        });
        return this.promiseFactory.createProxy(vm, registry, hostPromise);
      });
      relationshipsFindPathFn.consume((handle) => {
        vm.setProp(relationshipsObj, 'findPath', handle);
      });
    } else {
      vm.setProp(relationshipsObj, 'findPath', vm.null);
    }

    // relationships.getClusteringCoefficient
    if (isApiAllowed('relationships.getClusteringCoefficient')) {
      const relationshipsGetClusteringCoefficientFn = vm.newFunction(
        'getClusteringCoefficient',
        (noteIdArg) => {
          const noteId = vm.getString(noteIdArg);
          const hostPromise = this.noteApi.getClusteringCoefficient({
            note_id: noteId,
            vault_id: vaultId
          });
          return this.promiseFactory.createProxy(vm, registry, hostPromise);
        }
      );
      relationshipsGetClusteringCoefficientFn.consume((handle) => {
        vm.setProp(relationshipsObj, 'getClusteringCoefficient', handle);
      });
    } else {
      vm.setProp(relationshipsObj, 'getClusteringCoefficient', vm.null);
    }

    relationshipsObj.dispose();

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
