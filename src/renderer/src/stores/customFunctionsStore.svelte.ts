/**
 * Custom Functions Store
 *
 * Manages state for custom functions including CRUD operations,
 * validation, testing, and analytics. Provides reactive state
 * for UI components.
 */

// Custom functions types (matching server types)
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

export interface CustomFunctionExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

export interface CustomFunctionStats {
  totalFunctions: number;
  totalUsage: number;
  averageUsage: number;
  mostUsedFunction?: string;
  functionStats?: {
    id: string;
    name: string;
    usageCount: number;
    lastUsed?: string;
  };
}

// Store state
let functions = $state<CustomFunction[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);
let searchQuery = $state('');
let selectedTags = $state<string[]>([]);
let sortBy = $state<'name' | 'createdAt' | 'usageCount' | 'lastUsed'>('name');
let sortDirection = $state<'asc' | 'desc'>('asc');

// Derived state
const filteredFunctions = $derived((): CustomFunction[] => {
  let filtered = functions;

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (func) =>
        func.name.toLowerCase().includes(query) ||
        func.description.toLowerCase().includes(query) ||
        func.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // Apply tag filter
  if (selectedTags.length > 0) {
    filtered = filtered.filter((func) =>
      selectedTags.some((tag) => func.tags.includes(tag))
    );
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let aValue: unknown;
    let bValue: unknown;

    switch (sortBy) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'createdAt':
        aValue = new Date(a.metadata.createdAt).getTime();
        bValue = new Date(b.metadata.createdAt).getTime();
        break;
      case 'usageCount':
        aValue = a.metadata.usageCount;
        bValue = b.metadata.usageCount;
        break;
      case 'lastUsed':
        aValue = a.metadata.lastUsed ? new Date(a.metadata.lastUsed).getTime() : 0;
        bValue = b.metadata.lastUsed ? new Date(b.metadata.lastUsed).getTime() : 0;
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
});

const allTags = $derived(() => {
  const tagSet = new Set<string>();
  functions.forEach((func) => {
    func.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
});

const stats = $derived(() => {
  const totalFunctions = functions.length;
  const totalUsage = functions.reduce((sum, func) => sum + func.metadata.usageCount, 0);
  const averageUsage = totalFunctions > 0 ? totalUsage / totalFunctions : 0;

  const mostUsed = functions.reduce(
    (most, func) =>
      !most || func.metadata.usageCount > most.metadata.usageCount ? func : most,
    null as CustomFunction | null
  );

  return {
    totalFunctions,
    totalUsage,
    averageUsage: Math.round(averageUsage * 100) / 100,
    mostUsedFunction: mostUsed?.name
  };
});

// API operations
async function loadFunctions(): Promise<void> {
  if (!window.api) {
    throw new Error('API not available');
  }

  isLoading = true;
  error = null;

  try {
    const result = await window.api.listCustomFunctions({
      searchQuery: searchQuery || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined
    });

    // Convert date strings to Date objects
    functions = result.map((func) => ({
      ...func,
      metadata: {
        ...func.metadata,
        createdAt: new Date(func.metadata.createdAt),
        updatedAt: new Date(func.metadata.updatedAt),
        lastUsed: func.metadata.lastUsed ? new Date(func.metadata.lastUsed) : undefined
      }
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load functions';
    console.error('Failed to load custom functions:', err);
  } finally {
    isLoading = false;
  }
}

// Custom functions store interface
export const customFunctionsStore = {
  // Reactive getters
  get functions() {
    return functions;
  },
  get filteredFunctions(): CustomFunction[] {
    return filteredFunctions();
  },
  get isLoading() {
    return isLoading;
  },
  get error() {
    return error;
  },
  get searchQuery() {
    return searchQuery;
  },
  get selectedTags() {
    return selectedTags;
  },
  get allTags(): string[] {
    return allTags();
  },
  get sortBy() {
    return sortBy;
  },
  get sortDirection() {
    return sortDirection;
  },
  get stats() {
    return stats();
  },

  // Actions
  setSearchQuery(query: string) {
    searchQuery = query;
  },

  setSelectedTags(tags: string[]) {
    selectedTags = tags;
  },

  setSorting(by: typeof sortBy, direction: typeof sortDirection) {
    sortBy = by;
    sortDirection = direction;
  },

  clearError() {
    error = null;
  },

  // CRUD operations
  async loadFunctions() {
    return loadFunctions();
  },

  async createFunction(params: {
    name: string;
    description: string;
    parameters: Record<string, CustomFunctionParameter>;
    returnType: string;
    code: string;
    tags?: string[];
  }): Promise<CustomFunction> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      const result = await window.api.createCustomFunction(params);

      // Convert dates
      const newFunc = {
        ...result,
        metadata: {
          ...result.metadata,
          createdAt: new Date(result.metadata.createdAt),
          updatedAt: new Date(result.metadata.updatedAt),
          lastUsed: result.metadata.lastUsed
            ? new Date(result.metadata.lastUsed)
            : undefined
        }
      };

      functions = [...functions, newFunc];
      return newFunc;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create function';
      error = errorMessage;
      throw err;
    }
  },

  async getFunction(params: {
    id?: string;
    name?: string;
  }): Promise<CustomFunction | null> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      const result = await window.api.getCustomFunction(params);
      if (!result) return null;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          createdAt: new Date(result.metadata.createdAt),
          updatedAt: new Date(result.metadata.updatedAt),
          lastUsed: result.metadata.lastUsed
            ? new Date(result.metadata.lastUsed)
            : undefined
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get function';
      error = errorMessage;
      throw err;
    }
  },

  async updateFunction(params: {
    id: string;
    name?: string;
    description?: string;
    parameters?: Record<string, CustomFunctionParameter>;
    returnType?: string;
    code?: string;
    tags?: string[];
  }): Promise<CustomFunction> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      const result = await window.api.updateCustomFunction(params);

      // Convert dates
      const updatedFunc = {
        ...result,
        metadata: {
          ...result.metadata,
          createdAt: new Date(result.metadata.createdAt),
          updatedAt: new Date(result.metadata.updatedAt),
          lastUsed: result.metadata.lastUsed
            ? new Date(result.metadata.lastUsed)
            : undefined
        }
      };

      functions = functions.map((func) => (func.id === params.id ? updatedFunc : func));

      return updatedFunc;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update function';
      error = errorMessage;
      throw err;
    }
  },

  async deleteFunction(id: string): Promise<void> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      await window.api.deleteCustomFunction({ id });
      functions = functions.filter((func) => func.id !== id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete function';
      error = errorMessage;
      throw err;
    }
  },

  async validateFunction(params: {
    name: string;
    description: string;
    parameters: Record<string, CustomFunctionParameter>;
    returnType: string;
    code: string;
    tags?: string[];
  }): Promise<ValidationResult> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      return await window.api.validateCustomFunction(params);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to validate function';
      error = errorMessage;
      throw err;
    }
  },

  async testFunction(params: {
    functionId: string;
    parameters: Record<string, unknown>;
  }): Promise<CustomFunctionExecutionResult> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      return await window.api.testCustomFunction(params);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test function';
      error = errorMessage;
      throw err;
    }
  },

  async getFunctionStats(functionId?: string): Promise<CustomFunctionStats> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      return await window.api.getCustomFunctionStats(
        functionId ? { functionId } : undefined
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get function stats';
      error = errorMessage;
      throw err;
    }
  },

  async exportFunctions(): Promise<{ data: string; filename: string }> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      return await window.api.exportCustomFunctions();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to export functions';
      error = errorMessage;
      throw err;
    }
  },

  async importFunctions(backupData: string): Promise<{ imported: number }> {
    if (!window.api) {
      throw new Error('API not available');
    }

    try {
      const result = await window.api.importCustomFunctions({ backupData });
      // Reload functions after import
      await loadFunctions();
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to import functions';
      error = errorMessage;
      throw err;
    }
  },

  // Helper methods
  findFunctionById(id: string): CustomFunction | undefined {
    return functions.find((func) => func.id === id);
  },

  findFunctionByName(name: string): CustomFunction | undefined {
    return functions.find((func) => func.name === name);
  },

  getFunctionsByTag(tag: string): CustomFunction[] {
    return functions.filter((func) => func.tags.includes(tag));
  },

  // Duplicate function for editing
  duplicateFunction(
    func: CustomFunction
  ): Omit<CustomFunction, 'id' | 'metadata'> & { name: string } {
    return {
      name: `${func.name}_copy`,
      description: func.description,
      parameters: { ...func.parameters },
      returnType: func.returnType,
      code: func.code,
      tags: [...func.tags]
    };
  }
};

// Auto-load functions on store creation
loadFunctions().catch(console.error);
