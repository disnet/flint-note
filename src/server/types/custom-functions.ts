/**
 * Custom Functions Type Definitions
 *
 * Type definitions for the custom functions feature that enables AI agents
 * to register, persist, and reuse custom TypeScript functions across sessions.
 */

export interface CustomFunctionParameter {
  type: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
}

export interface CustomFunction {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, CustomFunctionParameter>;
  returnType: string;
  code: string;
  tags: string[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: 'agent' | 'user';
    usageCount: number;
    lastUsed?: Date;
    version: number;
  };
}

export interface CreateCustomFunctionOptions {
  name: string;
  description: string;
  parameters: Record<string, CustomFunctionParameter>;
  returnType: string;
  code: string;
  tags?: string[];
}

export interface UpdateCustomFunctionOptions {
  id: string;
  name?: string;
  description?: string;
  parameters?: Record<string, CustomFunctionParameter>;
  returnType?: string;
  code?: string;
  tags?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type:
    | 'syntax'
    | 'naming'
    | 'security'
    | 'type'
    | 'conflict'
    | 'validation'
    | 'performance';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'style' | 'deprecation' | 'security';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface CompiledFunction {
  id: string;
  compiledCode: string;
  sourceMap?: string;
  dependencies: string[];
}

export interface CustomFunctionExecutionContext {
  functionId: string;
  parameters: Record<string, unknown>;
  startTime: number;
  timeout: number;
}

export interface CustomFunctionExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
  memoryUsage?: number;
}
