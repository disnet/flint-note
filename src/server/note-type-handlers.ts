/**
 * Note type-related handlers for the FlintNote MCP Server
 */

import {
  generateContentHash,
  createNoteTypeHashableContent
} from '../utils/content-hash.js';
import { MetadataSchemaParser } from '../core/metadata-schema.js';
import type { MetadataFieldDefinition } from '../core/metadata-schema.js';
import type {
  CreateNoteTypeArgs,
  ListNoteTypesArgs,
  UpdateNoteTypeArgs,
  GetNoteTypeInfoArgs,
  DeleteNoteTypeArgs,
  VaultContext
} from './types.js';
import fs from 'fs/promises';
import path from 'path';

export class NoteTypeHandlers {
  /**
   * Resolve vault context helper
   */
  private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>;
  private requireWorkspace: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private noteTypeManager: any;

  constructor(
    resolveVaultContext: (vaultId?: string) => Promise<VaultContext>,
    requireWorkspace: () => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    noteTypeManager: any
  ) {
    this.resolveVaultContext = resolveVaultContext;
    this.requireWorkspace = requireWorkspace;
    this.noteTypeManager = noteTypeManager;
  }

  handleCreateNoteType = async (args: CreateNoteTypeArgs) => {
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);

    await noteTypeManager.createNoteType(
      args.type_name,
      args.description,
      args.agent_instructions,
      args.metadata_schema
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Created note type '${args.type_name}' successfully`,
              type_name: args.type_name
            },
            null,
            2
          )
        }
      ]
    };
  };

  handleListNoteTypes = async (args: ListNoteTypesArgs) => {
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);

    const types = await noteTypeManager.listNoteTypes();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(types, null, 2)
        }
      ]
    };
  };

  handleUpdateNoteType = async (args: UpdateNoteTypeArgs) => {
    const { noteTypeManager, workspace } = await this.resolveVaultContext(args.vault_id);

    try {
      if (!args.content_hash) {
        throw new Error('content_hash is required for all note type update operations');
      }

      // Validate that at least one field is provided
      if (
        args.instructions === undefined &&
        args.description === undefined &&
        args.metadata_schema === undefined
      ) {
        throw new Error(
          'At least one field must be provided: instructions, description, or metadata_schema'
        );
      }

      // Get current note type info
      const currentInfo = await noteTypeManager.getNoteTypeDescription(args.type_name);

      // Validate content hash to prevent conflicts
      const currentHashableContent = createNoteTypeHashableContent({
        description: currentInfo.description,
        agent_instructions: currentInfo.parsed.agentInstructions.join('\n'),
        metadata_schema: currentInfo.metadataSchema
      });
      const currentHash = generateContentHash(currentHashableContent);

      if (currentHash !== args.content_hash) {
        const error = new Error(
          'Note type definition has been modified since last read. Please fetch the latest version.'
        ) as Error & {
          code: string;
          current_hash: string;
          provided_hash: string;
        };
        error.code = 'content_hash_mismatch';
        error.current_hash = currentHash;
        error.provided_hash = args.content_hash;
        throw error;
      }

      // Start with current description
      let updatedDescription = currentInfo.description;
      const fieldsUpdated: string[] = [];

      // Update instructions if provided
      if (args.instructions) {
        // Parse instructions from value (can be newline-separated or bullet points)
        const instructions = args.instructions
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => (line.startsWith('-') ? line.substring(1).trim() : line))
          .map(line => `- ${line}`)
          .join('\n');

        // Use the current description and replace the agent instructions section
        updatedDescription = updatedDescription.replace(
          /## Agent Instructions\n[\s\S]*?(?=\n## |$)/,
          `## Agent Instructions\n${instructions}\n`
        );
        fieldsUpdated.push('instructions');
      }

      // Update description if provided
      if (args.description) {
        updatedDescription = noteTypeManager.formatNoteTypeDescription(
          args.type_name,
          args.description
        );
        fieldsUpdated.push('description');
      }

      // Update metadata schema if provided
      if (args.metadata_schema) {
        const fields = args.metadata_schema;

        // Validate each field definition
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          if (!field || typeof field !== 'object') {
            throw new Error(`Field at index ${i} must be an object`);
          }

          if (!field.name || typeof field.name !== 'string') {
            throw new Error(`Field at index ${i} must have a valid "name" string`);
          }

          if (!field.type || typeof field.type !== 'string') {
            throw new Error(`Field at index ${i} must have a valid "type" string`);
          }

          // Check for protected fields
          const protectedFields = new Set(['title', 'filename', 'created', 'updated']);
          if (protectedFields.has(field.name)) {
            throw new Error(
              `Cannot define protected field "${field.name}" in metadata schema. ` +
                `These fields are automatically managed by the system and cannot be redefined.`
            );
          }

          const validTypes = ['string', 'number', 'boolean', 'date', 'array', 'select'];
          if (!validTypes.includes(field.type)) {
            throw new Error(
              `Field "${field.name}" has invalid type "${field.type}". Valid types: ${validTypes.join(', ')}`
            );
          }

          // Validate constraints if present
          if (field.constraints) {
            if (typeof field.constraints !== 'object') {
              throw new Error(`Field "${field.name}" constraints must be an object`);
            }

            // Validate select field options
            if (field.type === 'select') {
              if (
                !field.constraints.options ||
                !Array.isArray(field.constraints.options)
              ) {
                throw new Error(
                  `Select field "${field.name}" must have constraints.options array`
                );
              }
              if (field.constraints.options.length === 0) {
                throw new Error(
                  `Select field "${field.name}" must have at least one option`
                );
              }
            }

            // Validate numeric constraints
            if (
              field.constraints.min !== undefined &&
              typeof field.constraints.min !== 'number'
            ) {
              throw new Error(`Field "${field.name}" min constraint must be a number`);
            }
            if (
              field.constraints.max !== undefined &&
              typeof field.constraints.max !== 'number'
            ) {
              throw new Error(`Field "${field.name}" max constraint must be a number`);
            }
            if (
              field.constraints.min !== undefined &&
              field.constraints.max !== undefined &&
              field.constraints.min > field.constraints.max
            ) {
              throw new Error(
                `Field "${field.name}" min constraint cannot be greater than max`
              );
            }

            // Validate pattern constraint
            if (field.constraints.pattern !== undefined) {
              if (typeof field.constraints.pattern !== 'string') {
                throw new Error(
                  `Field "${field.name}" pattern constraint must be a string`
                );
              }
              try {
                new RegExp(field.constraints.pattern);
              } catch (regexError) {
                throw new Error(
                  `Field "${field.name}" pattern constraint is not a valid regex: ${regexError instanceof Error ? regexError.message : 'Unknown regex error'}`
                );
              }
            }
          }

          // Validate default values if present
          if (field.default !== undefined) {
            const validationError = this.validateDefaultValue(
              field.name,
              field.default,
              field
            );
            if (validationError) {
              throw new Error(validationError);
            }
          }
        }

        // Check for duplicate field names
        const fieldNames = fields.map(f => f.name);
        const duplicates = fieldNames.filter(
          (name, index) => fieldNames.indexOf(name) !== index
        );
        if (duplicates.length > 0) {
          throw new Error(`Duplicate field names found: ${duplicates.join(', ')}`);
        }

        // Create MetadataSchema object and generate the schema section
        const parsedSchema = { fields };
        const schemaSection = MetadataSchemaParser.generateSchemaSection(parsedSchema);

        updatedDescription = updatedDescription.replace(
          /## Metadata Schema\n[\s\S]*$/,
          schemaSection
        );
        fieldsUpdated.push('metadata_schema');
      }

      // Write the updated description to the file in note type directory
      const descriptionPath = path.join(
        workspace.getNoteTypePath(args.type_name),
        '_description.md'
      );
      await fs.writeFile(descriptionPath, updatedDescription, 'utf-8');

      // Get the updated note type info
      const result = await noteTypeManager.getNoteTypeDescription(args.type_name);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                type_name: args.type_name,
                fields_updated: fieldsUpdated,
                updated_info: {
                  name: result.name,
                  purpose: result.parsed.purpose,
                  agent_instructions: result.parsed.agentInstructions
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  };

  handleGetNoteTypeInfo = async (args: GetNoteTypeInfoArgs) => {
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);

    const info = await noteTypeManager.getNoteTypeDescription(args.type_name);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              type_name: info.name,
              description: info.parsed.purpose,
              agent_instructions: info.parsed.agentInstructions,
              metadata_schema: info.parsed.parsedMetadataSchema,
              content_hash: info.content_hash,
              path: info.path
            },
            null,
            2
          )
        }
      ]
    };
  };

  handleDeleteNoteType = async (args: DeleteNoteTypeArgs) => {
    this.requireWorkspace();

    try {
      const result = await this.noteTypeManager.deleteNoteType(
        args.type_name,
        args.action,
        args.target_type,
        args.confirm
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note type '${args.type_name}' deleted successfully`,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  handleTypesResource = async () => {
    this.requireWorkspace();
    if (!this.noteTypeManager) {
      throw new Error('Server not initialized');
    }

    const types = await this.noteTypeManager.listNoteTypes();
    return {
      contents: [
        {
          uri: 'flint-note://types',
          mimeType: 'application/json',
          text: JSON.stringify(types, null, 2)
        }
      ]
    };
  };

  /**
   * Helper method to validate default values against field definitions
   */
  private validateDefaultValue(
    fieldName: string,
    defaultValue: unknown,
    fieldDef: MetadataFieldDefinition
  ): string | null {
    switch (fieldDef.type) {
      case 'string':
        if (typeof defaultValue !== 'string') {
          return `Field "${fieldName}" default value must be a string`;
        }
        break;

      case 'number':
        if (typeof defaultValue !== 'number' || isNaN(defaultValue)) {
          return `Field "${fieldName}" default value must be a number`;
        }
        if (
          fieldDef.constraints?.min !== undefined &&
          defaultValue < fieldDef.constraints.min
        ) {
          return `Field "${fieldName}" default value must be at least ${fieldDef.constraints.min}`;
        }
        if (
          fieldDef.constraints?.max !== undefined &&
          defaultValue > fieldDef.constraints.max
        ) {
          return `Field "${fieldName}" default value must be at most ${fieldDef.constraints.max}`;
        }
        break;

      case 'boolean':
        if (typeof defaultValue !== 'boolean') {
          return `Field "${fieldName}" default value must be a boolean`;
        }
        break;

      case 'date':
        if (typeof defaultValue !== 'string' || isNaN(Date.parse(defaultValue))) {
          return `Field "${fieldName}" default value must be a valid date string`;
        }
        break;

      case 'array':
        if (!Array.isArray(defaultValue)) {
          return `Field "${fieldName}" default value must be an array`;
        }
        if (
          fieldDef.constraints?.min !== undefined &&
          defaultValue.length < fieldDef.constraints.min
        ) {
          return `Field "${fieldName}" default value array must have at least ${fieldDef.constraints.min} items`;
        }
        if (
          fieldDef.constraints?.max !== undefined &&
          defaultValue.length > fieldDef.constraints.max
        ) {
          return `Field "${fieldName}" default value array must have at most ${fieldDef.constraints.max} items`;
        }
        break;

      case 'select':
        if (!fieldDef.constraints?.options?.includes(String(defaultValue))) {
          return `Field "${fieldName}" default value must be one of: ${fieldDef.constraints?.options?.join(', ')}`;
        }
        break;
    }

    return null;
  }
}
