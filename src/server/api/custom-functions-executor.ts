/**
 * Custom Functions Execution Layer
 *
 * Handles compilation and execution of custom functions within the existing WASM sandbox.
 * Provides a secure execution environment with the same restrictions as regular code evaluation.
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import type { CustomFunction, CompiledFunction } from '../types/custom-functions.js';
import { CustomFunctionsStore } from '../core/custom-functions-store.js';
import { CustomFunctionValidator } from './custom-functions-validator.js';
import { TypeScriptCompiler } from './typescript-compiler.js';

export class CustomFunctionsExecutor {
  private store: CustomFunctionsStore;
  private validator: CustomFunctionValidator;
  private compiler: TypeScriptCompiler;
  private compiledFunctions: Map<string, CompiledFunction> = new Map();

  constructor(workspaceRoot: string) {
    this.store = new CustomFunctionsStore(workspaceRoot);
    this.validator = new CustomFunctionValidator();
    this.compiler = new TypeScriptCompiler();
  }

  /**
   * Create the customFunctions namespace object for injection into WASM VM
   */
  async createNamespaceObject(vm: QuickJSContext): Promise<QuickJSHandle> {
    const functions = await this.store.list();
    const customFunctionsObj = vm.newObject();

    // Add each custom function to the namespace
    for (const func of functions) {
      try {
        const compiledFunc = await this.compileFunction(func);
        const jsFunction = this.createVMFunction(vm, func, compiledFunc);
        vm.setProp(customFunctionsObj, func.name, jsFunction);
        jsFunction.dispose();
      } catch (error) {
        console.error(`Failed to compile custom function '${func.name}':`, error);
        // Skip this function but continue with others
      }
    }

    // Add management functions (prefixed with _ to avoid conflicts)
    this.addManagementFunctions(vm, customFunctionsObj);

    return customFunctionsObj;
  }

  /**
   * Compile a custom function to JavaScript
   */
  async compileFunction(func: CustomFunction): Promise<CompiledFunction> {
    // Check cache first
    const cached = this.compiledFunctions.get(func.id);
    if (cached) {
      return cached;
    }

    // Validate function before compilation
    const validation = await this.validator.validateDefinition({
      name: func.name,
      description: func.description,
      parameters: func.parameters,
      returnType: func.returnType,
      code: func.code,
      tags: func.tags
    });

    if (!validation.valid) {
      throw new Error(
        `Function validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    // Wrap function with proper context
    const wrappedCode = this.wrapFunctionForExecution(func);

    // Compile TypeScript to JavaScript
    const compilationResult = await this.compiler.compile(wrappedCode);

    if (!compilationResult.success) {
      const errors = compilationResult.diagnostics
        .filter((d) => d.category === 'error')
        .map((d) => d.messageText)
        .join(', ');
      throw new Error(`Function compilation failed: ${errors}`);
    }

    const compiled: CompiledFunction = {
      id: func.id,
      compiledCode: compilationResult.compiledJavaScript || wrappedCode,
      sourceMap: compilationResult.sourceMap,
      dependencies: this.extractDependencies(func.code)
    };

    // Cache the compiled function
    this.compiledFunctions.set(func.id, compiled);

    return compiled;
  }

  /**
   * Wrap function code for execution with proper context
   */
  private wrapFunctionForExecution(func: CustomFunction): string {
    // Wrap function to be executable in VM context
    // API types are already available from the compiler context
    // Create safe identifier from function ID (UUIDs can start with numbers)
    const safeId = `f_${func.id.replace(/-/g, '_')}`;
    return `
      // Custom function implementation
      ${func.code}
      
      // Export for VM execution
      globalThis.${safeId} = ${func.name};
    `;
  }

  /**
   * Create a VM function that wraps the custom function
   */
  private createVMFunction(
    vm: QuickJSContext,
    func: CustomFunction,
    compiled: CompiledFunction
  ): QuickJSHandle {
    return vm.newFunction(func.name, (...args) => {
      try {
        // Convert VM arguments to JavaScript values
        const jsArgs = args.map((arg) => vm.dump(arg));

        // Create parameter object
        const paramNames = Object.keys(func.parameters);
        const parameters = paramNames.reduce(
          (acc, name, index) => {
            acc[name] = jsArgs[index];
            return acc;
          },
          {} as Record<string, unknown>
        );

        // For Phase 1, skip runtime validation and direct execution
        // Execute the compiled function
        // This is a simplified implementation - in reality, we'd need to execute
        // the compiled code within the same WASM context
        const result = this.executeCompiledFunction(vm, compiled, parameters);

        // Update usage statistics
        this.store.recordUsage(func.id).catch((error) => {
          console.error('Failed to update function usage:', error);
        });

        // Return result as VM value
        return vm.newString(JSON.stringify(result));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw vm.newError(errorMessage);
      }
    });
  }

  /**
   * Execute compiled function (simplified implementation for Phase 1)
   */
  private executeCompiledFunction(
    vm: QuickJSContext,
    compiled: CompiledFunction,
    parameters: Record<string, unknown>
  ): unknown {
    // For Phase 1, this is a simplified implementation
    // In a full implementation, we'd need to properly execute the compiled code
    // within the WASM context with access to the API objects

    try {
      // Create a new context for execution
      // Create safe identifier from function ID (UUIDs can start with numbers)
      const safeId = `f_${compiled.id.replace(/-/g, '_')}`;
      const executionCode = `
        ${compiled.compiledCode}
        
        // Execute the function
        const result = globalThis.${safeId}(${Object.values(parameters)
          .map((p) => JSON.stringify(p))
          .join(', ')});
        
        result;
      `;

      const resultHandle = vm.evalCode(executionCode);
      if (resultHandle.error) {
        const error = vm.dump(resultHandle.error);
        resultHandle.error.dispose();
        throw new Error(`Function execution failed: ${error}`);
      }

      const result = vm.dump(resultHandle.value);
      resultHandle.value.dispose();

      return result;
    } catch (error) {
      throw new Error(
        `Custom function execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Add management functions to the customFunctions namespace
   */
  private addManagementFunctions(
    vm: QuickJSContext,
    customFunctionsObj: QuickJSHandle
  ): void {
    // _list function - simplified for Phase 1
    const listFn = vm.newFunction('_list', () => {
      // For Phase 1, return a placeholder - would need proper async handling
      return vm.newString(JSON.stringify([]));
    });
    vm.setProp(customFunctionsObj, '_list', listFn);
    listFn.dispose();

    // _remove function - simplified for Phase 1
    const removeFn = vm.newFunction('_remove', () => {
      // For Phase 1, return a placeholder - would need proper async handling
      return vm.newString(
        JSON.stringify({ success: false, message: 'Not implemented in Phase 1' })
      );
    });
    vm.setProp(customFunctionsObj, '_remove', removeFn);
    removeFn.dispose();

    // _update function - simplified for Phase 1
    const updateFn = vm.newFunction('_update', () => {
      // For Phase 1, return a placeholder - would need proper async handling
      return vm.newString(
        JSON.stringify({ success: false, message: 'Not implemented in Phase 1' })
      );
    });
    vm.setProp(customFunctionsObj, '_update', updateFn);
    updateFn.dispose();
  }

  /**
   * Extract dependencies from function code (basic implementation)
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];

    // Look for API object usage
    const apiObjects = [
      'notes',
      'noteTypes',
      'vaults',
      'links',
      'hierarchy',
      'relationships',
      'utils'
    ];
    for (const apiObj of apiObjects) {
      if (code.includes(apiObj + '.')) {
        dependencies.push(apiObj);
      }
    }

    return dependencies;
  }

  /**
   * Inject custom functions namespace into VM context
   */
  async injectCustomFunctionsNamespace(vm: QuickJSContext): Promise<void> {
    try {
      const customFunctionsObj = await this.createNamespaceObject(vm);
      vm.setProp(vm.global, 'customFunctions', customFunctionsObj);
      customFunctionsObj.dispose();
    } catch (error) {
      console.error('Failed to inject custom functions namespace:', error);
      throw error;
    }
  }

  /**
   * Clear compiled function cache
   */
  clearCache(): void {
    this.compiledFunctions.clear();
  }

  /**
   * Generate namespace code for prepending to user code
   */
  async generateNamespaceCode(): Promise<string> {
    const functions = await this.store.list();
    
    if (functions.length === 0) {
      // Return empty namespace for consistency
      return `
// Custom functions namespace (empty)
const customFunctions = {};
`;
    }

    const functionDefinitions: string[] = [];
    
    for (const func of functions) {
      try {
        // Compile the individual function from TypeScript to JavaScript
        const compilationResult = await this.compiler.compile(func.code);
        
        if (!compilationResult.success) {
          console.error(`Failed to compile custom function '${func.name}':`, compilationResult.diagnostics);
          continue; // Skip this function
        }
        
        // Get the compiled JavaScript and clean it up
        let compiledCode = compilationResult.compiledJavaScript || func.code;
        
        // Remove any leading/trailing whitespace and convert to function expression
        compiledCode = compiledCode.trim();
        
        // If the compiled code starts with 'function functionName', convert it to anonymous function
        const functionMatch = compiledCode.match(/^function\s+\w+/);
        if (functionMatch) {
          compiledCode = compiledCode.replace(/^function\s+\w+/, 'function');
        }
        
        functionDefinitions.push(`  ${func.name}: ${compiledCode}`);
        
        // Update usage statistics
        await this.store.recordUsage(func.id);
      } catch (error) {
        console.error(`Failed to add custom function '${func.name}' to namespace:`, error);
        // Skip this function but continue with others
      }
    }

    if (functionDefinitions.length === 0) {
      return `
// Custom functions namespace (compilation failed)
const customFunctions = {};
`;
    }

    return `
// Auto-generated custom functions namespace
const customFunctions = {
${functionDefinitions.join(',\n')}
};
`;
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(): Promise<{
    totalFunctions: number;
    compiledFunctions: number;
    cacheSize: number;
  }> {
    const functions = await this.store.list();

    return {
      totalFunctions: functions.length,
      compiledFunctions: this.compiledFunctions.size,
      cacheSize: this.compiledFunctions.size
    };
  }
}
