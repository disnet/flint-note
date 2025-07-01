/**
 * Metadata Schema System
 *
 * Provides structured metadata schema definition, parsing, and validation
 * for note types in flint-note.
 */

export type MetadataFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'select';

export interface MetadataFieldConstraints {
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
  format?: string;
}

export interface MetadataFieldDefinition {
  name: string;
  type: MetadataFieldType;
  description?: string;
  required?: boolean;
  constraints?: MetadataFieldConstraints;
  default?: string | number | boolean | string[];
}

export interface MetadataSchema {
  fields: MetadataFieldDefinition[];
  version?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class MetadataSchemaParser {
  /**
   * Parse metadata schema from the description markdown format
   */
  static parseFromDescription(content: string): MetadataSchema {
    const fields: MetadataFieldDefinition[] = [];

    // Find the Metadata Schema section
    const schemaMatch = content.match(/## Metadata Schema\n([\s\S]*?)(?=\n## |$)/);
    if (!schemaMatch) {
      return { fields: [] };
    }

    const schemaContent = schemaMatch[1];
    const lines = schemaContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed.startsWith('-')) {
        continue;
      }

      const fieldMatch = trimmed.match(/^-\s+([^:]+):\s*(.*)/);
      if (fieldMatch) {
        const name = fieldMatch[1].trim();
        const description = fieldMatch[2].trim();
        const field: Partial<MetadataFieldDefinition> = { name, description };

        this.parseFieldDetails(field, description);
        fields.push(field as MetadataFieldDefinition);
      }
    }

    return { fields };
  }

  /**
   * Parse field details from description text
   */
  private static parseFieldDetails(
    field: Partial<MetadataFieldDefinition>,
    description: string
  ): void {
    // Check if required
    if (description.includes('(required)') || description.includes('required')) {
      field.required = true;
    } else {
      field.required = false;
    }

    // Extract type information
    const typeMatch = description.match(/\(([^)]+)\)/);
    if (typeMatch) {
      const typeInfo = typeMatch[1].toLowerCase();

      if (typeInfo.includes('string')) field.type = 'string';
      else if (typeInfo.includes('number')) field.type = 'number';
      else if (typeInfo.includes('boolean')) field.type = 'boolean';
      else if (typeInfo.includes('date')) field.type = 'date';
      else if (typeInfo.includes('array')) field.type = 'array';
      else if (typeInfo.includes('select')) field.type = 'select';
      else field.type = 'string';
    } else {
      field.type = 'string';
    }

    // Extract constraints
    const constraints: MetadataFieldConstraints = {};

    // Extract min/max for numbers
    const minMatch = description.match(/min:\s*(\d+)/i);
    if (minMatch) constraints.min = parseInt(minMatch[1]);

    const maxMatch = description.match(/max:\s*(\d+)/i);
    if (maxMatch) constraints.max = parseInt(maxMatch[1]);

    // Extract pattern for strings
    const patternMatch = description.match(/pattern:\s*"([^"]+)"/i);
    if (patternMatch) constraints.pattern = patternMatch[1];

    // Extract options for select fields
    const optionsMatch = description.match(/options:\s*\[([^\]]+)\]/i);
    if (optionsMatch) {
      constraints.options = optionsMatch[1]
        .split(',')
        .map(opt => opt.trim().replace(/['|"]/g, ''));
    }

    if (Object.keys(constraints).length > 0) {
      field.constraints = constraints;
    }

    // Clean description by removing type and constraint info
    field.description = description
      .replace(/\([^)]+\)/g, '')
      .replace(/min:\s*\d+/gi, '')
      .replace(/max:\s*\d+/gi, '')
      .replace(/pattern:\s*"[^"]+"/gi, '')
      .replace(/options:\s*\[[^\]]+\]/gi, '')
      .trim();
  }

  /**
   * Generate metadata schema section for _description.md
   */
  static generateSchemaSection(schema: MetadataSchema): string {
    if (!schema || !schema.fields || schema.fields.length === 0) {
      return `## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- type: Note type (auto-set)
- created: Creation timestamp (auto-set)
- updated: Last modification timestamp (auto-set)
- tags: Relevant tags for categorization (array, optional)`;
    }

    let content = `## Metadata Schema\nExpected frontmatter or metadata fields for this note type:\n`;

    for (const field of schema.fields) {
      const requiredText = field.required ? 'required' : 'optional';
      const typeText = field.type && field.type !== 'string' ? `, ${field.type}` : '';
      const constraintTexts: string[] = [];

      if (field.constraints) {
        if (field.constraints.min !== undefined)
          constraintTexts.push(`min: ${field.constraints.min}`);
        if (field.constraints.max !== undefined)
          constraintTexts.push(`max: ${field.constraints.max}`);
        if (field.constraints.pattern)
          constraintTexts.push(`pattern: "${field.constraints.pattern}"`);
        if (field.constraints.options)
          constraintTexts.push(
            `options: [${field.constraints.options.map(o => `"${o}"`).join(', ')}]`
          );
      }

      const constraintText =
        constraintTexts.length > 0 ? `, ${constraintTexts.join(', ')}` : '';
      const fullTypeInfo = `(${requiredText}${typeText}${constraintText})`;

      content += `- ${field.name}: ${field.description || 'Field description'} ${fullTypeInfo}\n`;
    }

    return content;
  }
}

export class MetadataValidator {
  /**
   * Validate note metadata against schema
   */
  static validate(
    metadata: Record<string, unknown>,
    schema: MetadataSchema
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check required fields
    for (const field of schema.fields) {
      if (
        field.required &&
        (metadata[field.name] === undefined || metadata[field.name] === null)
      ) {
        errors.push({
          field: field.name,
          message: `Required field '${field.name}' is missing`,
          value: metadata[field.name]
        });
      }
    }

    // Validate field types and constraints
    for (const [fieldName, value] of Object.entries(metadata)) {
      const fieldDef = schema.fields.find(f => f.name === fieldName);
      if (!fieldDef) {
        // Unknown field - just warn
        warnings.push({
          field: fieldName,
          message: `Unknown field '${fieldName}' not defined in schema`,
          value
        });
        continue;
      }

      if (value === undefined || value === null) {
        continue; // Already handled required check above
      }

      const validationError = this.validateFieldValue(fieldName, value, fieldDef);
      if (validationError) {
        errors.push(validationError);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a single field value against its definition
   */
  private static validateFieldValue(
    fieldName: string,
    value: unknown,
    fieldDef: MetadataFieldDefinition
  ): ValidationError | null {
    // Type validation
    switch (fieldDef.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be a string`,
            value
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be a number`,
            value
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be a boolean`,
            value
          };
        }
        break;

      case 'date':
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be a valid date string`,
            value
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be an array`,
            value
          };
        }
        break;

      case 'select':
        if (!fieldDef.constraints?.options?.includes(String(value))) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be one of: ${fieldDef.constraints?.options?.join(', ')}`,
            value
          };
        }
        break;
    }

    // Constraint validation
    if (fieldDef.constraints) {
      const constraints = fieldDef.constraints;

      // Min/max for numbers
      if (fieldDef.type === 'number' && typeof value === 'number') {
        if (constraints.min !== undefined && value < constraints.min) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be at least ${constraints.min}`,
            value
          };
        }
        if (constraints.max !== undefined && value > constraints.max) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must be at most ${constraints.max}`,
            value
          };
        }
      }

      // Pattern for strings
      if (
        fieldDef.type === 'string' &&
        typeof value === 'string' &&
        constraints.pattern
      ) {
        const regex = new RegExp(constraints.pattern);
        if (!regex.test(value)) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' does not match required pattern: ${constraints.pattern}`,
            value
          };
        }
      }

      // Length constraints for arrays
      if (fieldDef.type === 'array' && Array.isArray(value)) {
        if (constraints.min !== undefined && value.length < constraints.min) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must have at least ${constraints.min} items`,
            value
          };
        }
        if (constraints.max !== undefined && value.length > constraints.max) {
          return {
            field: fieldName,
            message: `Field '${fieldName}' must have at most ${constraints.max} items`,
            value
          };
        }
      }
    }

    return null;
  }

  /**
   * Validate the structure and rules of a metadata schema definition.
   *
   * @param schema - The metadata schema to validate.
   * @returns An object containing lists of errors and warnings.
   */
  static validateSchema(schema: MetadataSchema): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldNames = new Set<string>();

    if (!schema || !Array.isArray(schema.fields)) {
      errors.push("Schema must have a 'fields' array.");
      return { errors, warnings };
    }

    for (const field of schema.fields) {
      if (!field.name || !field.type) {
        errors.push(
          `Field missing required properties 'name' or 'type': ${JSON.stringify(field)}`
        );
        continue;
      }

      if (fieldNames.has(field.name)) {
        errors.push(`Duplicate field name '${field.name}' found in schema.`);
      }
      fieldNames.add(field.name);

      const validTypes: MetadataFieldType[] = [
        'string',
        'number',
        'boolean',
        'date',
        'array',
        'select'
      ];
      if (!validTypes.includes(field.type)) {
        errors.push(
          `Invalid type '${field.type}' for field '${field.name}'. Valid types are: ${validTypes.join(', ')}`
        );
      }

      if (
        field.type === 'select' &&
        (!field.constraints?.options || field.constraints.options.length === 0)
      ) {
        warnings.push(
          `Field '${field.name}' is of type 'select' but has no options defined in constraints.`
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Get suggested default values for a schema
   */
  static getDefaults(schema: MetadataSchema): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    for (const field of schema.fields) {
      if (field.default !== undefined) {
        defaults[field.name] = field.default;
      } else if (field.required) {
        // Provide sensible defaults for required fields
        switch (field.type) {
          case 'string':
            defaults[field.name] = '';
            break;
          case 'number':
            defaults[field.name] = field.constraints?.min ?? 0;
            break;
          case 'boolean':
            defaults[field.name] = false;
            break;
          case 'array':
            defaults[field.name] = [];
            break;
          case 'date':
            defaults[field.name] = new Date().toISOString();
            break;
          case 'select':
            defaults[field.name] = field.constraints?.options?.[0] ?? '';
            break;
        }
      }
    }

    return defaults;
  }
}
