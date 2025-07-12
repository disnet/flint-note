/**
 * Argument validation utilities for FlintNote MCP Server tools
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  arrayItemType?: 'string' | 'number' | 'boolean' | 'object';
  minLength?: number;
  maxLength?: number;
  allowEmpty?: boolean;
  customValidator?: (value: any) => string | null;
}

/**
 * Validates arguments against a set of validation rules
 */
export function validateArgs(args: any, rules: ValidationRule[]): ValidationResult {
  const errors: string[] = [];

  // Check if args is null or undefined
  if (args === null || args === undefined) {
    return {
      isValid: false,
      errors: ['Arguments object is required but was not provided']
    };
  }

  // Check if args is an object
  if (typeof args !== 'object' || Array.isArray(args)) {
    return {
      isValid: false,
      errors: ['Arguments must be an object']
    };
  }

  for (const rule of rules) {
    const value = args?.[rule.field];
    const fieldErrors = validateField(rule.field, value, rule);
    errors.push(...fieldErrors);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates a single field against its rule
 */
function validateField(fieldName: string, value: any, rule: ValidationRule): string[] {
  const errors: string[] = [];

  // Check if required field is missing
  if (rule.required && (value === undefined || value === null)) {
    errors.push(`Required field '${fieldName}' is missing`);
    return errors;
  }

  // If field is not required and is missing, skip further validation
  if (!rule.required && (value === undefined || value === null)) {
    return errors;
  }

  // Check type
  if (rule.type && !validateType(value, rule.type, rule.arrayItemType)) {
    if (rule.type === 'array' && rule.arrayItemType) {
      errors.push(
        `Field '${fieldName}' must be an array of ${rule.arrayItemType} values`
      );
    } else {
      errors.push(`Field '${fieldName}' must be of type ${rule.type}`);
    }
  }

  // Check string-specific validations
  if (rule.type === 'string' && typeof value === 'string') {
    if (!rule.allowEmpty && value.trim() === '') {
      errors.push(`Field '${fieldName}' cannot be empty`);
    }
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(
        `Field '${fieldName}' must be at least ${rule.minLength} characters long`
      );
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(
        `Field '${fieldName}' must be no more than ${rule.maxLength} characters long`
      );
    }
  }

  // Check array-specific validations
  if (rule.type === 'array' && Array.isArray(value)) {
    if (!rule.allowEmpty && value.length === 0) {
      errors.push(`Field '${fieldName}' cannot be an empty array`);
    }
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`Field '${fieldName}' must contain at least ${rule.minLength} items`);
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(
        `Field '${fieldName}' must contain no more than ${rule.maxLength} items`
      );
    }
  }

  // Run custom validator if provided
  if (rule.customValidator) {
    const customError = rule.customValidator(value);
    if (customError) {
      errors.push(`Field '${fieldName}': ${customError}`);
    }
  }

  return errors;
}

/**
 * Validates the type of a value
 */
function validateType(value: any, expectedType: string, arrayItemType?: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      if (!Array.isArray(value)) return false;
      if (arrayItemType) {
        return value.every(item => validateType(item, arrayItemType));
      }
      return true;
    default:
      return false;
  }
}

/**
 * Creates a validation error with a helpful message
 */
export function createValidationError(toolName: string, errors: string[]): Error {
  // For compatibility with existing tests, return simpler error messages
  if (errors.length === 1) {
    return new Error(errors[0]);
  }

  const errorMessage = [
    `Invalid arguments for tool '${toolName}':`,
    ...errors.map(error => `  - ${error}`),
    '',
    'Please check the tool documentation for correct usage.'
  ].join('\n');

  return new Error(errorMessage);
}

/**
 * Predefined validation rules for each tool
 */
export const TOOL_VALIDATION_RULES: Record<string, ValidationRule[]> = {
  get_note: [
    {
      field: 'identifier',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        const parts = value.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          return 'identifier must be in format "type/filename" with both parts non-empty';
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'fields',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    }
  ],

  get_notes: [
    {
      field: 'identifiers',
      required: true,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: false,
      minLength: 1,
      customValidator: (value: any) => {
        for (const identifier of value) {
          if (!identifier.includes('/')) {
            return `identifier "${identifier}" must be in format "type/filename"`;
          }
          const parts = identifier.split('/');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return `identifier "${identifier}" must be in format "type/filename" with both parts non-empty`;
          }
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'fields',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    }
  ],

  create_note_type: [
    {
      field: 'type_name',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        // Check for filesystem-safe characters
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return 'Invalid note type name';
        }
        return null;
      }
    },
    {
      field: 'description',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'agent_instructions',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    },
    {
      field: 'metadata_schema',
      required: false,
      type: 'object'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  create_note: [
    {
      field: 'type',
      required: false, // Not required when using batch creation
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'title',
      required: false, // Not required when using batch creation
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'content',
      required: false, // Not required when using batch creation
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'metadata',
      required: false,
      type: 'object'
    },
    {
      field: 'notes',
      required: false,
      type: 'array',
      allowEmpty: true,
      customValidator: (value: any) => {
        if (!Array.isArray(value)) return null;
        for (let i = 0; i < value.length; i++) {
          const note = value[i];
          if (typeof note !== 'object' || note === null) {
            return `notes[${i}] must be an object`;
          }
          if (note.type !== undefined && typeof note.type !== 'string') {
            return `notes[${i}].type must be a string`;
          }
          if (note.title !== undefined && typeof note.title !== 'string') {
            return `notes[${i}].title must be a string`;
          }
          if (note.content !== undefined && typeof note.content !== 'string') {
            return `notes[${i}].content must be a string`;
          }
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  update_note: [
    {
      field: 'identifier',
      required: false, // Not required when using batch updates
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!value || !value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        return null;
      }
    },
    {
      field: 'content',
      required: false,
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'metadata',
      required: false,
      type: 'object'
    },
    {
      field: 'content_hash',
      required: false, // Required for single updates, checked in handler
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'updates',
      required: false,
      type: 'array',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!Array.isArray(value)) return null;
        for (let i = 0; i < value.length; i++) {
          const update = value[i];
          if (typeof update !== 'object' || update === null) {
            return `updates[${i}] must be an object`;
          }
          if (!update.identifier || typeof update.identifier !== 'string') {
            return `updates[${i}].identifier is required and must be a string`;
          }
          if (!update.content_hash || typeof update.content_hash !== 'string') {
            return `updates[${i}].content_hash is required and must be a string`;
          }
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  delete_note: [
    {
      field: 'identifier',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        return null;
      }
    },
    {
      field: 'confirm',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  rename_note: [
    {
      field: 'identifier',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        return null;
      }
    },
    {
      field: 'new_title',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'content_hash',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  search_notes: [
    {
      field: 'query',
      required: false,
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'type_filter',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'limit',
      required: false,
      type: 'number'
    },
    {
      field: 'use_regex',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'fields',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    }
  ],

  search_notes_sql: [
    {
      field: 'query',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'params',
      required: false,
      type: 'array',
      allowEmpty: true
    },
    {
      field: 'limit',
      required: false,
      type: 'number'
    },
    {
      field: 'timeout',
      required: false,
      type: 'number'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'fields',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    }
  ],

  get_note_info: [
    {
      field: 'title_or_filename',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'type',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  list_notes_by_type: [
    {
      field: 'type',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'limit',
      required: false,
      type: 'number'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  list_note_types: [
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  update_note_type: [
    {
      field: 'type_name',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'instructions',
      required: false,
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'description',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'metadata_schema',
      required: false,
      type: 'array',
      allowEmpty: true
    },
    {
      field: 'content_hash',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  get_note_type_info: [
    {
      field: 'type_name',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  create_vault: [
    {
      field: 'id',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return 'id must contain only letters, numbers, underscores, and hyphens';
        }
        return null;
      }
    },
    {
      field: 'name',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'path',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'description',
      required: false,
      type: 'string',
      allowEmpty: true
    },
    {
      field: 'initialize',
      required: false,
      type: 'boolean'
    },
    {
      field: 'switch_to',
      required: false,
      type: 'boolean'
    }
  ],

  switch_vault: [
    {
      field: 'id',
      required: true,
      type: 'string',
      allowEmpty: false
    }
  ],

  remove_vault: [
    {
      field: 'id',
      required: true,
      type: 'string',
      allowEmpty: false
    }
  ],

  update_vault: [
    {
      field: 'id',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'name',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'description',
      required: false,
      type: 'string',
      allowEmpty: true
    }
  ],

  search_notes_advanced: [
    {
      field: 'type',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'metadata_filters',
      required: false,
      type: 'array',
      allowEmpty: true
    },
    {
      field: 'updated_within',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'updated_before',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'created_within',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'created_before',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'content_contains',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'sort',
      required: false,
      type: 'array',
      allowEmpty: true
    },
    {
      field: 'limit',
      required: false,
      type: 'number'
    },
    {
      field: 'offset',
      required: false,
      type: 'number'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'fields',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    }
  ],

  get_note_links: [
    {
      field: 'identifier',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: any) => {
        if (!value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        const parts = value.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          return 'identifier must be in format "type/filename" with both parts non-empty';
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  get_backlinks: [
    {
      field: 'identifier',
      required: true,
      type: 'string',
      allowEmpty: false,
      customValidator: (value: string) => {
        if (!value.includes('/')) {
          return 'identifier must be in format "type/filename"';
        }
        const parts = value.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          return 'identifier must be in format "type/filename" with both parts non-empty';
        }
        return null;
      }
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  find_broken_links: [
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  search_by_links: [
    {
      field: 'has_links_to',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true,
      customValidator: (value: any) => {
        if (!Array.isArray(value)) return null;
        for (const identifier of value) {
          if (!identifier.includes('/')) {
            return `identifier "${identifier}" must be in format "type/filename"`;
          }
          const parts = identifier.split('/');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return `identifier "${identifier}" must be in format "type/filename" with both parts non-empty`;
          }
        }
        return null;
      }
    },
    {
      field: 'linked_from',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true,
      customValidator: (value: any) => {
        if (!Array.isArray(value)) return null;
        for (const identifier of value) {
          if (!identifier.includes('/')) {
            return `identifier "${identifier}" must be in format "type/filename"`;
          }
          const parts = identifier.split('/');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return `identifier "${identifier}" must be in format "type/filename" with both parts non-empty`;
          }
        }
        return null;
      }
    },
    {
      field: 'external_domains',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    },
    {
      field: 'broken_links',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  migrate_links: [
    {
      field: 'force',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  delete_note_type: [
    {
      field: 'type_name',
      required: true,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'action',
      required: true,
      type: 'string',
      customValidator: (value: any) => {
        if (!['error', 'migrate', 'delete'].includes(value)) {
          return 'action must be one of: error, migrate, delete';
        }
        return null;
      }
    },
    {
      field: 'target_type',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'confirm',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ],

  bulk_delete_notes: [
    {
      field: 'type',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'tags',
      required: false,
      type: 'array',
      arrayItemType: 'string',
      allowEmpty: true
    },
    {
      field: 'pattern',
      required: false,
      type: 'string',
      allowEmpty: false
    },
    {
      field: 'confirm',
      required: false,
      type: 'boolean'
    },
    {
      field: 'vault_id',
      required: false,
      type: 'string',
      allowEmpty: false
    }
  ]
};

/**
 * Validates arguments for a specific tool
 */
export function validateToolArgs(toolName: string, args: any): void {
  const rules = TOOL_VALIDATION_RULES[toolName];
  if (!rules) {
    throw new Error(`No validation rules defined for tool: ${toolName}`);
  }

  const result = validateArgs(args, rules);
  if (!result.isValid) {
    throw createValidationError(toolName, result.errors);
  }

  // Additional tool-specific validations
  switch (toolName) {
    case 'create_note':
      validateCreateNoteArgs(args);
      break;
    case 'update_note':
      validateUpdateNoteArgs(args);
      break;
    case 'search_notes_advanced':
      validateSearchNotesAdvancedArgs(args);
      break;
    case 'bulk_delete_notes':
      validateBulkDeleteNotesArgs(args);
      break;
  }
}

/**
 * Additional validation for create_note tool
 */
function validateCreateNoteArgs(args: any): void {
  const hasNotesArray = args.notes && Array.isArray(args.notes);
  const hasValidNotes = hasNotesArray && args.notes.length > 0;
  const hasSingleNote = args.type !== undefined && args.title !== undefined;

  // If notes array is provided but empty, let business logic handle it
  if (hasNotesArray && !hasValidNotes) {
    throw createValidationError('create_note', [
      'Multiple note creation requires at least one note to create'
    ]);
  }

  if (!hasValidNotes && !hasSingleNote) {
    throw createValidationError('create_note', [
      'Single note creation requires type, title, and content'
    ]);
  }

  if (
    hasValidNotes &&
    (args.type !== undefined || args.title !== undefined || args.content !== undefined)
  ) {
    throw createValidationError('create_note', [
      'Cannot provide both single note fields and batch notes array'
    ]);
  }
}

/**
 * Additional validation for update_note tool
 */
function validateUpdateNoteArgs(args: any): void {
  const hasUpdates =
    args.updates && Array.isArray(args.updates) && args.updates.length > 0;
  const hasSingleUpdate = args.identifier;

  if (!hasUpdates && !hasSingleUpdate) {
    throw createValidationError('update_note', [
      'Single note update requires identifier'
    ]);
  }

  if (hasUpdates && hasSingleUpdate) {
    throw createValidationError('update_note', [
      'Cannot provide both single update fields and batch updates array'
    ]);
  }

  if (hasSingleUpdate) {
    if (!args.content_hash) {
      throw createValidationError('update_note', ['content_hash is required']);
    }
    if (!args.content && !args.metadata) {
      throw createValidationError('update_note', [
        'Either content or metadata must be provided for update'
      ]);
    }
  }
}

/**
 * Additional validation for search_notes_advanced tool
 */
function validateSearchNotesAdvancedArgs(args: any): void {
  if (args.metadata_filters && Array.isArray(args.metadata_filters)) {
    for (let i = 0; i < args.metadata_filters.length; i++) {
      const filter = args.metadata_filters[i];
      if (typeof filter !== 'object' || filter === null) {
        throw createValidationError('search_notes_advanced', [
          `metadata_filters[${i}] must be an object`
        ]);
      }
      if (!filter.key || typeof filter.key !== 'string') {
        throw createValidationError('search_notes_advanced', [
          `metadata_filters[${i}].key is required and must be a string`
        ]);
      }
      if (filter.value === undefined || filter.value === null) {
        throw createValidationError('search_notes_advanced', [
          `metadata_filters[${i}].value is required`
        ]);
      }
      if (
        filter.operator &&
        !['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'].includes(filter.operator)
      ) {
        throw createValidationError('search_notes_advanced', [
          `metadata_filters[${i}].operator must be one of: =, !=, >, <, >=, <=, LIKE, IN`
        ]);
      }
    }
  }

  if (args.sort && Array.isArray(args.sort)) {
    for (let i = 0; i < args.sort.length; i++) {
      const sortRule = args.sort[i];
      if (typeof sortRule !== 'object' || sortRule === null) {
        throw createValidationError('search_notes_advanced', [
          `sort[${i}] must be an object`
        ]);
      }
      if (
        !sortRule.field ||
        !['title', 'type', 'created', 'updated', 'size'].includes(sortRule.field)
      ) {
        throw createValidationError('search_notes_advanced', [
          `sort[${i}].field must be one of: title, type, created, updated, size`
        ]);
      }
      if (!sortRule.order || !['asc', 'desc'].includes(sortRule.order)) {
        throw createValidationError('search_notes_advanced', [
          `sort[${i}].order must be either 'asc' or 'desc'`
        ]);
      }
    }
  }
}

/**
 * Additional validation for bulk_delete_notes tool
 */
function validateBulkDeleteNotesArgs(args: any): void {
  const hasType = args.type && typeof args.type === 'string';
  const hasTags = args.tags && Array.isArray(args.tags) && args.tags.length > 0;
  const hasPattern = args.pattern && typeof args.pattern === 'string';

  if (!hasType && !hasTags && !hasPattern) {
    throw createValidationError('bulk_delete_notes', [
      'At least one filter must be provided: type, tags, or pattern'
    ]);
  }
}
