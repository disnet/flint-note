/**
 * TypeScript Compiler Integration for FlintNote Code Evaluation
 *
 * Provides in-memory TypeScript compilation with comprehensive type checking
 * and detailed error reporting for AI agents using the FlintNote API.
 */

import * as ts from 'typescript';
import { FLINT_API_TYPE_DEFINITIONS } from './flint-api-types.js';
import type { CustomFunction } from '../types/custom-functions.js';

export interface TypeScriptDiagnostic {
  code: number;
  category: 'error' | 'warning' | 'suggestion';
  messageText: string;
  file?: string;
  line: number;
  column: number;
  length: number;
  source: string;
  relatedInformation?: {
    line: number;
    column: number;
    messageText: string;
  }[];
}

export interface CompilationResult {
  success: boolean;
  diagnostics: TypeScriptDiagnostic[];
  compiledJavaScript?: string;
  sourceMap?: string;
}

export class TypeScriptCompiler {
  private diagnosticSuggestions = new Map<number, string>();
  private customFunctions: CustomFunction[] = [];

  constructor() {
    this.initializeDiagnosticSuggestions();
  }

  /**
   * Set custom functions for type declaration generation
   */
  setCustomFunctions(customFunctions: CustomFunction[]): void {
    this.customFunctions = customFunctions;
  }

  /**
   * Generate TypeScript declarations for custom functions
   */
  private generateCustomFunctionDeclarations(): string {
    if (this.customFunctions.length === 0) {
      return '';
    }

    let declarations =
      '\n// Custom Functions Namespace\ndeclare namespace customFunctions {\n';

    // Add individual function declarations
    for (const func of this.customFunctions) {
      const paramList = Object.entries(func.parameters)
        .map(([name, param]) => {
          const optional = param.optional ? '?' : '';
          return `${name}${optional}: ${param.type}`;
        })
        .join(', ');

      declarations += `  function ${func.name}(${paramList}): ${func.returnType};\n`;
    }

    // Add management functions
    declarations += '\n  // Management functions\n';
    declarations += `  function _list(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
    returnType: string;
    tags: string[];
    usageCount: number;
  }>>;\n`;
    declarations += '  function _remove(name: string): Promise<{ success: boolean }>;\n';
    declarations += `  function _update(name: string, changes: {
    description?: string;
    parameters?: Record<string, any>;
    returnType?: string;
    code?: string;
    tags?: string[];
  }): Promise<{
    id: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
    returnType: string;
    tags: string[];
  }>;\n`;

    declarations += '}\n';
    return declarations;
  }

  async compile(sourceCode: string): Promise<CompilationResult> {
    try {
      // Create a simple in-memory file system for TypeScript compiler
      const fileName = 'user-code.ts';

      // Combine minimal lib with FlintNote API types and custom functions
      const customFunctionDeclarations = this.generateCustomFunctionDeclarations();
      const minimalLibContent = `
interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult>;
}
interface PromiseConstructor {
  new <T>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;
}
declare var Promise: PromiseConstructor;
interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2>;
}

interface Array<T> {
  filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
  filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
  length: number;
  [n: number]: T;
}

interface Error {
  name: string;
  message: string;
  stack?: string;
}
interface ErrorConstructor {
  new(message?: string): Error;
  (message?: string): Error;
  readonly prototype: Error;
}
declare var Error: ErrorConstructor;

declare function String(value?: any): string;

// Built-in utility types
type Record<K extends keyof any, T> = {
  [P in K]: T;
};

// Date interface
interface DateConstructor {
  new(): Date;
  new(value: number | string): Date;
  new(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
}
declare var Date: DateConstructor;

interface Date {
  toString(): string;
  toISOString(): string;
  getTime(): number;
  valueOf(): number;
}

// JSON interface
interface JSON {
  stringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string;
  stringify(value: any, replacer?: (number | string)[] | null, space?: string | number): string;
  parse(text: string, reviver?: (key: string, value: any) => any): any;
}
declare var JSON: JSON;

// Math interface
interface Math {
  abs(x: number): number;
  max(...values: number[]): number;
  min(...values: number[]): number;
  random(): number;
  round(x: number): number;
  floor(x: number): number;
  ceil(x: number): number;
}
declare var Math: Math;

// Number interface
interface NumberConstructor {
  (value?: any): number;
  new(value?: any): Number;
}
declare var Number: NumberConstructor;

interface Number {
  toString(radix?: number): string;
  valueOf(): number;
}

// String interface
interface String {
  length: number;
  charAt(pos: number): string;
  substring(start: number, end?: number): string;
  indexOf(searchString: string, position?: number): number;
  replace(searchValue: string | RegExp, replaceValue: string): string;
  split(separator?: string | RegExp, limit?: number): string[];
  toLowerCase(): string;
  toUpperCase(): string;
  trim(): string;
}
interface StringConstructor {
  new(value?: any): String;
  (value?: any): string;
}
declare var String: StringConstructor;

// Object interface
interface Object {
  toString(): string;
  valueOf(): any;
}
interface ObjectConstructor {
  keys(o: any): string[];
  values(o: any): any[];
  entries(o: any): [string, any][];
  assign<T, U>(target: T, source: U): T & U;
  assign<T, U, V>(target: T, source1: U, source2: V): T & U & V;
  assign(target: any, ...sources: any[]): any;
}
declare var Object: ObjectConstructor;

// Console interface
interface Console {
  log(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
  info(...data: any[]): void;
}
declare var console: Console;

// GlobalThis interface
interface GlobalThis {
  [key: string]: any;
}
declare var globalThis: GlobalThis;

${FLINT_API_TYPE_DEFINITIONS}
${customFunctionDeclarations}
`;

      // Create a minimal compiler host
      const compilerHost: ts.CompilerHost = {
        getSourceFile: (name: string, languageVersion: ts.ScriptTarget) => {
          if (name === fileName) {
            return ts.createSourceFile(name, sourceCode, languageVersion, true);
          }
          if (name === 'lib.d.ts') {
            return ts.createSourceFile(name, minimalLibContent, languageVersion, true);
          }
          // Return undefined for other lib files
          return undefined;
        },
        writeFile: () => {},
        getCurrentDirectory: () => '',
        getDirectories: () => [],
        fileExists: (name: string) => name === fileName || name === 'lib.d.ts',
        readFile: (name: string) => {
          if (name === fileName) return sourceCode;
          if (name === 'lib.d.ts') return minimalLibContent;
          return undefined;
        },
        getCanonicalFileName: (fileName: string) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getDefaultLibFileName: () => 'lib.d.ts'
      };

      // Create TypeScript program for type checking
      const program = ts.createProgram(
        [fileName],
        {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          strict: true,
          noImplicitAny: false, // Allow implicit any for globalThis access
          strictNullChecks: true,
          noImplicitReturns: true,
          noUnusedLocals: true, // Enable unused variable warnings
          noUnusedParameters: true,
          skipLibCheck: true, // Skip lib files since we don't provide them
          noLib: false, // Use our minimal lib files
          lib: ['lib.d.ts'] // Use our custom lib
        },
        compilerHost
      );

      // Get semantic diagnostics (type errors)
      const sourceFile = program.getSourceFile(fileName);
      const semanticDiagnostics = sourceFile
        ? program.getSemanticDiagnostics(sourceFile)
        : [];

      // Get syntactic diagnostics (syntax errors)
      const syntacticDiagnostics = sourceFile
        ? program.getSyntacticDiagnostics(sourceFile)
        : [];

      // Combine all diagnostics
      const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics];

      // Generate JavaScript output using transpileModule
      const transpileResult = ts.transpileModule(sourceCode, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true
        }
      });

      // Filter errors, treating certain diagnostics as warnings instead of errors
      const errors = allDiagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error && !this.shouldTreatAsWarning(d)
      );

      return {
        success: errors.length === 0,
        diagnostics: this.formatDiagnosticsFromTranspile(allDiagnostics, sourceCode),
        compiledJavaScript: transpileResult.outputText,
        sourceMap: transpileResult.sourceMapText
      };
    } catch (error) {
      return {
        success: false,
        diagnostics: [
          {
            code: 9999,
            category: 'error',
            messageText: `Compilation failed: ${error instanceof Error ? error.message : String(error)}`,
            file: 'user-code.ts',
            line: 1,
            column: 1,
            length: 0,
            source: sourceCode.split('\n')[0] || ''
          }
        ],
        compiledJavaScript: undefined
      };
    }
  }

  private initializeDiagnosticSuggestions(): void {
    // Common TypeScript error codes and their suggestions
    this.diagnosticSuggestions.set(
      2322,
      'Check that the assigned value matches the expected type. Add type annotations if needed.'
    );
    this.diagnosticSuggestions.set(
      2531,
      'Add null check before accessing properties: if (value) { ... }'
    );
    this.diagnosticSuggestions.set(
      2339,
      'Check property name spelling and ensure the property exists on the type.'
    );
    this.diagnosticSuggestions.set(
      2345,
      'Check function parameters - ensure all required arguments are provided.'
    );
    this.diagnosticSuggestions.set(
      2304,
      'Import or define the missing identifier, or check for typos.'
    );
    this.diagnosticSuggestions.set(
      2307,
      'Check the module path and ensure the module is available.'
    );
    this.diagnosticSuggestions.set(
      7006,
      'Add explicit type annotations to parameters and variables.'
    );
    this.diagnosticSuggestions.set(
      2740,
      'Add missing properties or make them optional in the interface.'
    );
    this.diagnosticSuggestions.set(
      2741,
      'Remove extra properties or extend the interface to allow them.'
    );
    this.diagnosticSuggestions.set(
      2532,
      'Initialize the variable before use or mark as optional with ?.'
    );

    // Additional custom functions and API specific errors
    this.diagnosticSuggestions.set(
      2503,
      'Ensure your main() function has a return type annotation: async function main(): Promise<YourType>'
    );
    this.diagnosticSuggestions.set(
      2663,
      'Cannot redeclare variable. Use different variable names or proper scoping.'
    );
    this.diagnosticSuggestions.set(
      2774,
      'This condition will always return true. Check your type guards and conditions.'
    );
    this.diagnosticSuggestions.set(
      2794,
      'Expected arguments but got none. Check the function signature and provide required parameters.'
    );
    this.diagnosticSuggestions.set(
      2740,
      'Type has no properties in common. Check that object structure matches the expected interface.'
    );
    this.diagnosticSuggestions.set(
      2769,
      'No overload matches this call. Check function signature and parameter types. Available APIs: notes, noteTypes, vaults, links, hierarchy, relationships, utils, customFunctions.'
    );
    this.diagnosticSuggestions.set(
      18048,
      'Add await keyword for Promise-returning functions or handle the Promise properly.'
    );
    this.diagnosticSuggestions.set(
      2554,
      'Add await keyword for async function calls: await someAsyncFunction()'
    );
  }

  private formatDiagnosticsFromTranspile(
    diagnostics: ts.Diagnostic[],
    originalSourceCode: string
  ): TypeScriptDiagnostic[] {
    const sourceLines = originalSourceCode.split('\n');

    return diagnostics.map((diagnostic) => {
      let line = 1;
      let column = 1;
      let sourceLine = '';

      if (diagnostic.file && typeof diagnostic.start === 'number') {
        const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        line = position.line + 1;
        column = position.character + 1;

        // Get the source line from the original code
        if (line > 0 && line <= sourceLines.length) {
          sourceLine = sourceLines[line - 1];
        }
      }

      let category = this.mapDiagnosticCategory(diagnostic.category);
      // Override category for specific diagnostics that should be warnings
      if (this.shouldTreatAsWarning(diagnostic)) {
        category = 'warning';
      }

      const code = diagnostic.code;
      const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

      const formattedDiagnostic: TypeScriptDiagnostic = {
        code,
        category,
        messageText,
        file: 'user-code.ts',
        line,
        column,
        length: diagnostic.length || 0,
        source: sourceLine.trim(),
        relatedInformation: diagnostic.relatedInformation?.map((info) => ({
          line: info.file
            ? (info.file.getLineAndCharacterOfPosition(info.start || 0).line || 0) + 1
            : line,
          column: info.file
            ? (info.file.getLineAndCharacterOfPosition(info.start || 0).character || 0) +
              1
            : column,
          messageText: ts.flattenDiagnosticMessageText(info.messageText, '\n')
        }))
      };

      // Add suggestion if available
      const suggestion = this.diagnosticSuggestions.get(code);
      if (suggestion) {
        (
          formattedDiagnostic as TypeScriptDiagnostic & { suggestion: string }
        ).suggestion = suggestion;
      }

      return formattedDiagnostic;
    });
  }

  private mapDiagnosticCategory(
    category: ts.DiagnosticCategory
  ): 'error' | 'warning' | 'suggestion' {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return 'error';
      case ts.DiagnosticCategory.Warning:
        return 'warning';
      case ts.DiagnosticCategory.Suggestion:
        return 'suggestion';
      case ts.DiagnosticCategory.Message:
        return 'suggestion';
      default:
        return 'error';
    }
  }

  private shouldTreatAsWarning(diagnostic: ts.Diagnostic): boolean {
    // Treat unused local variables as warnings instead of errors
    return diagnostic.code === 6133 || diagnostic.code === 6196;
  }
}
