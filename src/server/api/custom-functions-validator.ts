/**
 * Custom Functions Validation and Security Framework
 *
 * Provides comprehensive validation and security analysis for custom functions,
 * including TypeScript syntax validation, name conflict detection, and basic
 * security pattern analysis.
 */

import type {
  CustomFunction,
  CustomFunctionParameter,
  CreateCustomFunctionOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from '../types/custom-functions.js';
import { TypeScriptCompiler } from './typescript-compiler.js';
import { FLINT_API_TYPE_DEFINITIONS } from './flint-api-types.js';

export class CustomFunctionValidator {
  private typeScriptCompiler: TypeScriptCompiler;
  private reservedNames: Set<string>;

  constructor() {
    this.typeScriptCompiler = new TypeScriptCompiler();

    // Reserved names that cannot be used for custom functions
    this.reservedNames = new Set([
      // Built-in API objects
      'notes',
      'noteTypes',
      'vaults',
      'links',
      'hierarchy',
      'relationships',
      'utils',

      // JavaScript built-ins
      'console',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'Date',
      'Math',
      'JSON',
      'Array',
      'Object',
      'String',
      'Number',
      'Boolean',
      'Promise',
      'Error',
      'RegExp',
      'Map',
      'Set',
      'WeakMap',
      'WeakSet',

      // TypeScript/JavaScript keywords
      'async',
      'await',
      'function',
      'class',
      'interface',
      'type',
      'enum',
      'const',
      'let',
      'var',
      'if',
      'else',
      'for',
      'while',
      'do',
      'switch',
      'case',
      'default',
      'break',
      'continue',
      'return',
      'throw',
      'try',
      'catch',
      'finally',
      'new',
      'delete',
      'typeof',
      'instanceof',
      'void',
      'null',
      'undefined',
      'true',
      'false',
      'this',
      'super',
      'extends',
      'implements',
      'import',
      'export',
      'from',
      'as',
      'namespace',

      // Custom functions namespace
      'customFunctions'
    ]);
  }

  /**
   * Validate a custom function definition before creation
   */
  async validateDefinition(
    options: CreateCustomFunctionOptions
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate function name
    this.validateFunctionName(options.name, errors);

    // Validate parameters
    this.validateParameters(options.parameters, errors, warnings);

    // Validate return type
    this.validateReturnType(options.returnType, errors);

    // Validate TypeScript syntax
    await this.validateTypeScriptSyntax(options, errors, warnings);

    // Perform security analysis
    this.analyzeCodeSecurity(options.code, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate function for execution (runtime validation)
   */
  async validateExecution(
    func: CustomFunction,
    parameters: Record<string, unknown>
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate parameter values match expected types
    this.validateParameterValues(func.parameters, parameters, errors);

    // Check for potential performance issues
    this.analyzePerformanceRisks(func.code, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate function name
   */
  private validateFunctionName(name: string, errors: ValidationError[]): void {
    // Check for empty or whitespace-only names
    if (!name || !name.trim()) {
      errors.push({
        type: 'naming',
        message: 'Function name cannot be empty',
        suggestion: 'Provide a valid function name'
      });
      return;
    }

    // Check for valid JavaScript identifier
    const validIdentifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    if (!validIdentifierPattern.test(name)) {
      errors.push({
        type: 'naming',
        message: `Invalid function name: ${name}. Must be a valid JavaScript identifier`,
        suggestion:
          'Use only letters, numbers, underscore, and dollar sign. Must start with letter, underscore, or dollar sign'
      });
      return;
    }

    // Check for reserved names
    if (this.reservedNames.has(name)) {
      errors.push({
        type: 'conflict',
        message: `Function name '${name}' is reserved and cannot be used`,
        suggestion: 'Choose a different function name'
      });
      return;
    }

    // Check for common naming issues
    if (name.length < 3) {
      errors.push({
        type: 'naming',
        message: 'Function name should be at least 3 characters long',
        suggestion: 'Use a more descriptive function name'
      });
    }

    if (name.length > 50) {
      errors.push({
        type: 'naming',
        message: 'Function name is too long (max 50 characters)',
        suggestion: 'Use a shorter, more concise function name'
      });
    }
  }

  /**
   * Validate parameter definitions
   */
  private validateParameters(
    parameters: Record<string, CustomFunctionParameter>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (const [paramName, paramDef] of Object.entries(parameters)) {
      // Validate parameter name
      const validIdentifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
      if (!validIdentifierPattern.test(paramName)) {
        errors.push({
          type: 'naming',
          message: `Invalid parameter name: ${paramName}`,
          suggestion: 'Use valid JavaScript identifier for parameter names'
        });
      }

      // Validate parameter type
      if (!paramDef.type) {
        errors.push({
          type: 'type',
          message: `Parameter '${paramName}' missing type definition`,
          suggestion: 'Specify a TypeScript type for the parameter'
        });
      } else {
        // Check for valid TypeScript types
        this.validateTypeString(paramDef.type, paramName, errors);
      }

      // Check for overly complex parameter definitions
      if (Object.keys(parameters).length > 10) {
        warnings.push({
          type: 'style',
          message: 'Function has many parameters, consider using an options object',
          suggestion: 'Group related parameters into an options object'
        });
      }
    }
  }

  /**
   * Validate return type
   */
  private validateReturnType(returnType: string, errors: ValidationError[]): void {
    if (!returnType) {
      errors.push({
        type: 'type',
        message: 'Return type is required',
        suggestion: 'Specify a TypeScript return type'
      });
      return;
    }

    this.validateTypeString(returnType, 'return', errors);
  }

  /**
   * Validate TypeScript type string
   */
  private validateTypeString(
    typeStr: string,
    context: string,
    errors: ValidationError[]
  ): void {
    // Basic type validation - check for common patterns
    const validTypePattern = /^[a-zA-Z0-9_<>[\]|&\s,.:{}?"'-]+$/;
    if (!validTypePattern.test(typeStr)) {
      errors.push({
        type: 'type',
        message: `Invalid type definition for ${context}: ${typeStr}`,
        suggestion: 'Use valid TypeScript type syntax'
      });
    }
  }

  /**
   * Validate TypeScript syntax using the compiler
   */
  private async validateTypeScriptSyntax(
    options: CreateCustomFunctionOptions,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    try {
      // Wrap the function code in a complete TypeScript context
      const wrappedCode = this.wrapFunctionForValidation(options);

      const result = await this.typeScriptCompiler.compile(wrappedCode);

      if (!result.success) {
        for (const diagnostic of result.diagnostics) {
          if (diagnostic.category === 'error') {
            errors.push({
              type: 'syntax',
              message: diagnostic.messageText,
              line: diagnostic.line,
              column: diagnostic.column,
              suggestion: 'Fix TypeScript syntax errors'
            });
          } else if (diagnostic.category === 'warning') {
            warnings.push({
              type: 'style',
              message: diagnostic.messageText,
              line: diagnostic.line,
              column: diagnostic.column,
              suggestion: 'Consider addressing TypeScript warnings'
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        type: 'syntax',
        message: `TypeScript validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Check function syntax and type definitions'
      });
    }
  }

  /**
   * Wrap function code for validation with proper type definitions
   */
  private wrapFunctionForValidation(options: CreateCustomFunctionOptions): string {
    // Create parameter list with types
    const parameterList = Object.entries(options.parameters)
      .map(([name, param]) => {
        const optional = param.optional ? '?' : '';
        return `${name}${optional}: ${param.type}`;
      })
      .join(', ');

    // Wrap in validation context with API types available
    return `
      ${FLINT_API_TYPE_DEFINITIONS}
      
      // Custom function validation wrapper
      ${options.code}
      
      // Validation check - ensure function signature matches
      const validateFunction: (${parameterList}) => ${options.returnType} = ${options.name};
    `;
  }

  /**
   * Analyze code for potential security issues
   */
  private analyzeCodeSecurity(
    code: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Check for dangerous patterns
    const dangerousPatterns = [
      {
        pattern: /eval\s*\(/g,
        message: 'Use of eval() is not allowed',
        type: 'security' as const,
        severity: 'error' as const
      },
      {
        pattern: /Function\s*\(/g,
        message: 'Dynamic function creation is not allowed',
        type: 'security' as const,
        severity: 'error' as const
      },
      {
        pattern: /require\s*\(/g,
        message: 'Use of require() is not allowed in custom functions',
        type: 'security' as const,
        severity: 'error' as const
      },
      {
        pattern: /import\s+.*\s+from/g,
        message: 'Dynamic imports are not allowed in custom functions',
        type: 'security' as const,
        severity: 'error' as const
      },
      {
        pattern: /process\./g,
        message: 'Access to process object is not allowed',
        type: 'security' as const,
        severity: 'error' as const
      },
      {
        pattern: /global\./g,
        message: 'Access to global object should be avoided',
        type: 'security' as const,
        severity: 'warning' as const
      },
      {
        pattern: /while\s*\(\s*true\s*\)/g,
        message: 'Infinite loops should be avoided',
        type: 'performance' as const,
        severity: 'warning' as const
      }
    ];

    for (const { pattern, message, type, severity } of dangerousPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        if (severity === 'error') {
          errors.push({
            type,
            message,
            suggestion: 'Remove or replace the dangerous pattern'
          });
        } else {
          warnings.push({
            type,
            message,
            suggestion: 'Remove or replace the dangerous pattern'
          });
        }
      }
    }

    // Check for excessive code complexity
    const lines = code.split('\n').length;
    if (lines > 100) {
      warnings.push({
        type: 'performance',
        message: 'Function is very long (>100 lines), consider breaking it down',
        suggestion: 'Split large functions into smaller, more focused functions'
      });
    }
  }

  /**
   * Validate parameter values at runtime
   */
  private validateParameterValues(
    paramDefs: Record<string, CustomFunctionParameter>,
    values: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    for (const [paramName, paramDef] of Object.entries(paramDefs)) {
      const value = values[paramName];

      // Check required parameters
      if (!paramDef.optional && (value === undefined || value === null)) {
        errors.push({
          type: 'validation',
          message: `Required parameter '${paramName}' is missing`,
          suggestion: `Provide a value for parameter '${paramName}'`
        });
        continue;
      }

      // Skip validation for optional missing parameters
      if (value === undefined || value === null) {
        continue;
      }

      // Basic runtime type checking
      this.validateParameterType(paramName, paramDef.type, value, errors);
    }
  }

  /**
   * Basic runtime type validation
   */
  private validateParameterType(
    paramName: string,
    expectedType: string,
    value: unknown,
    errors: ValidationError[]
  ): void {
    // This is a basic implementation - could be expanded for more complex types
    const basicTypeChecks = {
      string: (v: unknown) => typeof v === 'string',
      number: (v: unknown) => typeof v === 'number' && !isNaN(v),
      boolean: (v: unknown) => typeof v === 'boolean',
      object: (v: unknown) => typeof v === 'object' && v !== null,
      any: () => true
    };

    // Handle array types
    if (expectedType.endsWith('[]')) {
      if (!Array.isArray(value)) {
        errors.push({
          type: 'validation',
          message: `Parameter '${paramName}' should be an array`,
          suggestion: `Provide an array value for parameter '${paramName}'`
        });
      }
      return;
    }

    // Handle Promise types
    if (expectedType.startsWith('Promise<')) {
      // Promises are handled at runtime, no static validation needed
      return;
    }

    // Check basic types
    const typeChecker = basicTypeChecks[expectedType as keyof typeof basicTypeChecks];
    if (typeChecker && !typeChecker(value)) {
      errors.push({
        type: 'validation',
        message: `Parameter '${paramName}' should be of type ${expectedType}`,
        suggestion: `Provide a ${expectedType} value for parameter '${paramName}'`
      });
    }
  }

  /**
   * Analyze code for performance risks
   */
  private analyzePerformanceRisks(code: string, warnings: ValidationWarning[]): void {
    const performancePatterns = [
      {
        pattern: /for\s*\(.*;\s*.*\.length\s*;.*\)/g,
        message: 'Consider caching array length in loops for better performance',
        suggestion: 'Cache array.length outside the loop'
      },
      {
        pattern: /\+\s*["']/g,
        message: 'String concatenation in loops can be slow, consider using array join',
        suggestion: 'Use array.push() and array.join() for multiple concatenations'
      },
      {
        pattern: /JSON\.parse\s*\(\s*JSON\.stringify/g,
        message: 'Deep cloning with JSON is inefficient and lossy',
        suggestion: 'Use proper deep cloning methods or restructure to avoid deep cloning'
      }
    ];

    for (const { pattern, message, suggestion } of performancePatterns) {
      if (pattern.test(code)) {
        warnings.push({
          type: 'performance',
          message,
          suggestion
        });
      }
    }
  }
}
