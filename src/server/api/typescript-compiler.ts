/**
 * TypeScript Compiler Integration for FlintNote Code Evaluation
 *
 * Provides in-memory TypeScript compilation with comprehensive type checking
 * and detailed error reporting for AI agents using the FlintNote API.
 */

import * as ts from 'typescript';

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
  private compilerOptions: ts.CompilerOptions;
  private typeDefinitions = new Map<string, string>();
  private diagnosticSuggestions = new Map<number, string>();

  constructor() {
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      noImplicitReturns: true,
      noImplicitThis: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: false,
      sourceMap: false,
      noEmit: false
    };

    this.loadFlintNoteTypeDefinitions();
    this.initializeDiagnosticSuggestions();
  }

  async compile(sourceCode: string): Promise<CompilationResult> {
    try {
      // For Phase 1, let's use a simpler approach that works
      // First, do basic transpilation to get JavaScript output
      const transpileResult = ts.transpileModule(sourceCode, {
        compilerOptions: {
          ...this.compilerOptions,
          noEmit: false,
          declaration: false
        },
        reportDiagnostics: true
      });

      // For type checking, create a program with type definitions
      const combinedSource = this.prepareSourceWithTypeDefinitions(sourceCode);

      // Use TypeScript's createProgram for type checking
      const files = new Map([['user-code.ts', combinedSource]]);

      const compilerHost: ts.CompilerHost = {
        getSourceFile: (fileName) => {
          if (files.has(fileName)) {
            return ts.createSourceFile(
              fileName,
              files.get(fileName)!,
              this.compilerOptions.target!
            );
          }
          return undefined;
        },
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getDirectories: () => [],
        fileExists: (fileName) => files.has(fileName),
        readFile: (fileName) => files.get(fileName),
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getDefaultLibFileName: (options) => ts.getDefaultLibFileName(options)
      };

      const program = ts.createProgram(
        ['user-code.ts'],
        this.compilerOptions,
        compilerHost
      );
      const typeCheckDiagnostics = ts.getPreEmitDiagnostics(program);

      // Combine transpile diagnostics with type check diagnostics
      const allDiagnostics = [
        ...(transpileResult.diagnostics || []),
        ...typeCheckDiagnostics
      ];
      const errors = allDiagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );

      return {
        success: errors.length === 0,
        diagnostics: this.formatDiagnosticsFromTranspile(allDiagnostics, sourceCode),
        compiledJavaScript: errors.length === 0 ? transpileResult.outputText : undefined,
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

  private prepareSourceWithTypeDefinitions(sourceCode: string): string {
    // Prepend FlintNote API type definitions to the source code
    const typeDefinitions = this.typeDefinitions.get('flint-api.d.ts') || '';
    return `${typeDefinitions}\n\n${sourceCode}`;
  }

  private loadFlintNoteTypeDefinitions(): void {
    const flintApiTypeDefs = `
declare namespace FlintAPI {
  // Notes API
  interface NotesAPI {
    create(options: CreateNoteOptions): Promise<CreateNoteResult>;
    get(identifier: string): Promise<Note | null>;
    update(options: UpdateNoteOptions): Promise<UpdateNoteResult>;
    delete(options: DeleteNoteOptions): Promise<DeleteNoteResult>;
    list(options?: ListNotesOptions): Promise<NoteInfo[]>;
    rename(options: RenameNoteOptions): Promise<RenameNoteResult>;
    move(options: MoveNoteOptions): Promise<MoveNoteResult>;
    search(options: SearchNotesOptions): Promise<SearchResult[]>;
  }

  interface CreateNoteOptions {
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
  }

  interface CreateNoteResult {
    id: string;
    type: string;
    title: string;
    filename: string;
    path: string;
    created: string;
  }

  interface UpdateNoteOptions {
    identifier: string;
    content: string;
    contentHash: string;
    metadata?: Record<string, any>;
  }

  interface UpdateNoteResult {
    success: boolean;
    updated: string;
  }

  interface DeleteNoteOptions {
    identifier: string;
    confirm?: boolean;
  }

  interface DeleteNoteResult {
    success: boolean;
    deleted_id: string;
  }

  interface ListNotesOptions {
    typeName?: string;
    limit?: number;
  }

  interface Note {
    id: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
    content_hash: string;
    links: any[];
    type: string;
    created: string;
    updated: string;
    size: number;
    tags: string[];
    path: string;
  }

  interface NoteInfo {
    id: string;
    title: string;
    type: string;
    created: string;
    updated: string;
    size: number;
    tags: string[];
    path: string;
  }

  interface RenameNoteOptions {
    identifier: string;
    new_title: string;
    content_hash: string;
  }

  interface RenameNoteResult {
    success: boolean;
    new_filename: string;
    new_path: string;
  }

  interface MoveNoteOptions {
    identifier: string;
    new_type: string;
    content_hash: string;
  }

  interface MoveNoteResult {
    success: boolean;
    new_path: string;
    new_type: string;
  }

  interface SearchNotesOptions {
    query: string;
    typeFilter?: string;
    limit?: number;
  }

  interface SearchResult {
    id: string;
    title: string;
    content: string;
    type: string;
    score: number;
    highlights: string[];
  }

  // Note Types API
  interface NoteTypesAPI {
    create(options: CreateNoteTypeOptions): Promise<CreateNoteTypeResult>;
    list(): Promise<NoteTypeInfo[]>;
    get(typeName: string): Promise<NoteType>;
    update(options: UpdateNoteTypeOptions): Promise<UpdateNoteTypeResult>;
    delete(options: DeleteNoteTypeOptions): Promise<DeleteNoteTypeResult>;
  }

  interface CreateNoteTypeOptions {
    type_name: string;
    description: string;
    agent_instructions?: string[];
    metadata_schema?: MetadataSchema;
  }

  interface CreateNoteTypeResult {
    success: boolean;
    type_name: string;
  }

  interface NoteTypeInfo {
    type_name: string;
    description: string;
    note_count: number;
    created: string;
    updated: string;
  }

  interface NoteType {
    type_name: string;
    description: string;
    agent_instructions: string[];
    metadata_schema: MetadataSchema;
    note_count: number;
    created: string;
    updated: string;
  }

  interface UpdateNoteTypeOptions {
    type_name: string;
    description?: string;
    instructions?: string[];
    metadata_schema?: MetadataFieldDefinition[];
  }

  interface UpdateNoteTypeResult {
    success: boolean;
  }

  interface DeleteNoteTypeOptions {
    type_name: string;
    action: 'error' | 'migrate' | 'delete';
    target_type?: string;
    confirm?: boolean;
  }

  interface DeleteNoteTypeResult {
    success: boolean;
    migrated_notes?: number;
    deleted_notes?: number;
  }

  interface MetadataSchema {
    [fieldName: string]: MetadataFieldDefinition;
  }

  interface MetadataFieldDefinition {
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
    required?: boolean;
    default?: any;
    description?: string;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
      enum?: any[];
    };
  }

  // Vaults API
  interface VaultsAPI {
    getCurrent(): Promise<Vault | null>;
    list(): Promise<Vault[]>;
    create(options: CreateVaultOptions): Promise<Vault>;
    switch(vaultId: string): Promise<void>;
    update(options: UpdateVaultOptions): Promise<void>;
    remove(vaultId: string): Promise<void>;
  }

  interface Vault {
    id: string;
    name: string;
    path: string;
    description: string;
    created: string;
    updated: string;
    note_count: number;
    is_current: boolean;
  }

  interface CreateVaultOptions {
    id: string;
    name: string;
    path: string;
    description?: string;
    initialize?: boolean;
    switch_to?: boolean;
  }

  interface UpdateVaultOptions {
    id: string;
    name?: string;
    description?: string;
  }

  // Links API
  interface LinksAPI {
    getForNote(identifier: string): Promise<LinkInfo[]>;
    getBacklinks(identifier: string): Promise<BacklinkInfo[]>;
    findBroken(): Promise<BrokenLinkInfo[]>;
    searchBy(options: SearchByLinksOptions): Promise<NoteInfo[]>;
    migrate(force?: boolean): Promise<MigrationResult>;
  }

  interface LinkInfo {
    target: string;
    type: 'internal' | 'external';
    title?: string;
    url?: string;
  }

  interface BacklinkInfo {
    source_id: string;
    source_title: string;
    context: string;
  }

  interface BrokenLinkInfo {
    source_id: string;
    source_title: string;
    broken_link: string;
    context: string;
  }

  interface SearchByLinksOptions {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
  }

  interface MigrationResult {
    migrated_count: number;
    total_links: number;
  }

  // Hierarchy API
  interface HierarchyAPI {
    addSubnote(options: AddSubnoteOptions): Promise<HierarchyResult>;
    removeSubnote(options: RemoveSubnoteOptions): Promise<HierarchyResult>;
    reorder(options: ReorderSubnotesOptions): Promise<HierarchyResult>;
    getPath(noteId: string): Promise<HierarchyPath[]>;
    getDescendants(options: GetDescendantsOptions): Promise<NoteInfo[]>;
    getChildren(noteId: string): Promise<NoteInfo[]>;
    getParents(noteId: string): Promise<NoteInfo[]>;
  }

  interface AddSubnoteOptions {
    parent_id: string;
    child_id: string;
    position?: number;
  }

  interface RemoveSubnoteOptions {
    parent_id: string;
    child_id: string;
  }

  interface ReorderSubnotesOptions {
    parent_id: string;
    child_ids: string[];
  }

  interface GetDescendantsOptions {
    note_id: string;
    max_depth?: number;
  }

  interface HierarchyResult {
    success: boolean;
  }

  interface HierarchyPath {
    id: string;
    title: string;
    depth: number;
  }

  // Relationships API
  interface RelationshipsAPI {
    get(noteId: string): Promise<RelationshipInfo>;
    getRelated(options: GetRelatedNotesOptions): Promise<NoteInfo[]>;
    findPath(options: FindRelationshipPathOptions): Promise<RelationshipPath[]>;
    getClusteringCoefficient(noteId: string): Promise<number>;
  }

  interface RelationshipInfo {
    note_id: string;
    connections: number;
    clustering_coefficient: number;
    related_notes: NoteInfo[];
  }

  interface GetRelatedNotesOptions {
    note_id: string;
    max_results?: number;
  }

  interface FindRelationshipPathOptions {
    start_note_id: string;
    end_note_id: string;
    max_depth?: number;
  }

  interface RelationshipPath {
    path: NoteInfo[];
    distance: number;
  }

  // Utils API
  interface UtilsAPI {
    formatDate(dateStr: string): string;
    generateId(): string;
    sanitizeTitle(title: string): string;
    parseLinks(content: string): string[];
    delay(ms: number): Promise<string>;
  }
}

// Global API objects available in execution context
declare const notes: FlintAPI.NotesAPI;
declare const noteTypes: FlintAPI.NoteTypesAPI;
declare const vaults: FlintAPI.VaultsAPI;
declare const links: FlintAPI.LinksAPI;
declare const hierarchy: FlintAPI.HierarchyAPI;
declare const relationships: FlintAPI.RelationshipsAPI;
declare const utils: FlintAPI.UtilsAPI;
`;

    this.typeDefinitions.set('flint-api.d.ts', flintApiTypeDefs);

    // Add lib.es2022.d.ts reference for standard library types
    const libReference = `/// <reference lib="es2022" />`;
    this.typeDefinitions.set('lib.d.ts', libReference);
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
        const combinedLines = diagnostic.file.text.split('\n');

        // Try to map back to original source by finding the line in original code
        const diagnosticLine = combinedLines[position.line] || '';
        const matchingLineIndex = sourceLines.findIndex(
          (originalLine) => originalLine.trim() === diagnosticLine.trim()
        );

        if (matchingLineIndex >= 0) {
          line = matchingLineIndex + 1;
          column = position.character + 1;
          sourceLine = sourceLines[matchingLineIndex];
        } else {
          // Fallback: try to estimate position
          line = Math.max(1, position.line - 50); // Rough estimate accounting for type definitions
          column = position.character + 1;
          sourceLine = sourceLines[line - 1] || diagnosticLine;
        }
      }

      const category = this.mapDiagnosticCategory(diagnostic.category);
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
}
