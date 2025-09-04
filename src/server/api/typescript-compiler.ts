/**
 * TypeScript Compiler Integration for FlintNote Code Evaluation
 *
 * Provides in-memory TypeScript compilation with comprehensive type checking
 * and detailed error reporting for AI agents using the FlintNote API.
 */

import * as ts from 'typescript';
import { FLINT_API_TYPE_DEFINITIONS } from './flint-api-types.js';

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

  constructor() {
    this.initializeDiagnosticSuggestions();
  }

  async compile(sourceCode: string): Promise<CompilationResult> {
    try {
      // Create a simple in-memory file system for TypeScript compiler
      const fileName = 'user-code.ts';

      // Combine minimal lib with FlintNote API types
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

${FLINT_API_TYPE_DEFINITIONS}
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
          noImplicitAny: true,
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
