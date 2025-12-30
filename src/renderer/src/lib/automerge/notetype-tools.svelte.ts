/**
 * AI SDK Tool Definitions for Note Type Operations
 *
 * These tools allow the AI chat agent to list, read, create, update,
 * archive, and unarchive note types stored in Automerge.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import {
  getNoteTypes,
  getAllNoteTypes,
  getNoteType,
  createNoteType,
  updateNoteType,
  archiveNoteType,
  unarchiveNoteType
} from './state.svelte';

/**
 * System note types that have protected names and cannot be archived.
 * Their purpose, icon, properties, and other fields can still be modified.
 */
const PROTECTED_TYPE_IDS = new Set(['type-default', 'type-daily']);

/**
 * Check if a note type ID is a protected system type
 */
function isProtectedType(typeId: string): boolean {
  return PROTECTED_TYPE_IDS.has(typeId);
}

/**
 * Zod schema for property constraints
 */
const propertyConstraintsSchema = z.object({
  min: z
    .number()
    .optional()
    .describe('Minimum value (for numbers) or minimum length (for arrays)'),
  max: z
    .number()
    .optional()
    .describe('Maximum value (for numbers) or maximum length (for arrays)'),
  pattern: z.string().optional().describe('Regex pattern for string validation'),
  options: z.array(z.string()).optional().describe('Valid options for select fields'),
  format: z.string().optional().describe('Date format specification')
});

/**
 * Zod schema for property definitions
 */
const propertyDefinitionSchema = z.object({
  name: z.string().describe('Property name (used as key in note.props)'),
  type: z
    .enum([
      'string',
      'number',
      'boolean',
      'date',
      'array',
      'select',
      'notelink',
      'notelinks'
    ])
    .describe('Data type of the property'),
  description: z.string().optional().describe('Human-readable description'),
  required: z.boolean().optional().describe('Whether the property is required'),
  constraints: propertyConstraintsSchema.optional().describe('Value constraints'),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional()
    .describe('Default value when creating a new note')
});

/**
 * Create all note type tools for the AI chat agent
 */
export function createNoteTypeTools(): Record<string, Tool> {
  return {
    /**
     * List all non-archived note types
     */
    list_note_types: tool({
      description:
        'List all available note types in the vault. Returns non-archived types sorted by name. ' +
        'Use this to see what note types exist and their purposes.',
      inputSchema: z.object({
        includeArchived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include archived note types in the list')
      }),
      execute: async ({ includeArchived }) => {
        try {
          const types = includeArchived ? getAllNoteTypes() : getNoteTypes();
          const noteTypes = types.map((t) => ({
            id: t.id,
            name: t.name,
            purpose: t.purpose,
            icon: t.icon,
            propertyCount: t.properties?.length ?? 0,
            archived: t.archived,
            isSystemType: isProtectedType(t.id)
          }));

          return {
            success: true,
            noteTypes,
            count: noteTypes.length
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list note types'
          };
        }
      }
    }),

    /**
     * Get a specific note type by ID
     */
    get_note_type: tool({
      description:
        'Get detailed information about a specific note type, including its property schema. ' +
        'Use this when you need to understand the structure of notes of a specific type.',
      inputSchema: z.object({
        typeId: z.string().describe('The note type ID (format: type-xxxxxxxx)')
      }),
      execute: async ({ typeId }) => {
        try {
          const noteType = getNoteType(typeId);
          if (!noteType) {
            return { success: false, error: `Note type not found: ${typeId}` };
          }

          return {
            success: true,
            noteType: {
              id: noteType.id,
              name: noteType.name,
              purpose: noteType.purpose,
              icon: noteType.icon,
              archived: noteType.archived,
              created: noteType.created,
              properties: noteType.properties ?? [],
              editorChips: noteType.editorChips ?? [],
              agentInstructions: noteType.agentInstructions,
              isSystemType: isProtectedType(noteType.id)
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get note type'
          };
        }
      }
    }),

    /**
     * Create a new note type
     */
    create_note_type: tool({
      description:
        'Create a new note type with an optional property schema. ' +
        'Use this to define new categories of notes with custom fields.',
      inputSchema: z.object({
        name: z.string().describe('Display name for the note type'),
        purpose: z
          .string()
          .optional()
          .describe("Description of this note type's purpose"),
        icon: z
          .string()
          .optional()
          .describe('Emoji icon for the note type (default: document emoji)'),
        properties: z
          .array(propertyDefinitionSchema)
          .optional()
          .describe('Property schema defining custom fields for notes of this type'),
        editorChips: z
          .array(z.string())
          .optional()
          .describe('Names of properties to display as chips in the editor'),
        agentInstructions: z
          .string()
          .optional()
          .describe('Instructions for AI agents when working with notes of this type')
      }),
      execute: async ({
        name,
        purpose,
        icon,
        properties,
        editorChips,
        agentInstructions
      }) => {
        try {
          const typeId = createNoteType({
            name,
            purpose,
            icon,
            properties,
            editorChips
          });

          // Update with agentInstructions if provided (createNoteType doesn't support it directly)
          if (agentInstructions) {
            updateNoteType(typeId, { agentInstructions } as Parameters<
              typeof updateNoteType
            >[1]);
          }

          return {
            success: true,
            typeId,
            message: `Created note type "${name}" with ID ${typeId}`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create note type'
          };
        }
      }
    }),

    /**
     * Update an existing note type
     */
    update_note_type: tool({
      description:
        'Update an existing note type. You can update the name, purpose, icon, properties, or editor chips. ' +
        'Only provide the fields you want to change. Cannot modify system note types.',
      inputSchema: z.object({
        typeId: z.string().describe('The note type ID to update'),
        name: z.string().optional().describe('New display name'),
        purpose: z.string().optional().describe('New purpose description'),
        icon: z.string().optional().describe('New emoji icon'),
        properties: z
          .array(propertyDefinitionSchema)
          .optional()
          .describe('New property schema (replaces existing)'),
        editorChips: z
          .array(z.string())
          .optional()
          .describe('New editor chips list (replaces existing)'),
        agentInstructions: z
          .string()
          .optional()
          .describe('New instructions for AI agents')
      }),
      execute: async ({
        typeId,
        name,
        purpose,
        icon,
        properties,
        editorChips,
        agentInstructions
      }) => {
        try {
          // Check if type exists
          const noteType = getNoteType(typeId);
          if (!noteType) {
            return { success: false, error: `Note type not found: ${typeId}` };
          }

          // For system types, only block name changes (purpose, icon, properties are allowed)
          if (isProtectedType(typeId) && name !== undefined) {
            return {
              success: false,
              error: `Cannot change name of system note type: ${noteType.name}`
            };
          }

          const updates: Parameters<typeof updateNoteType>[1] = {};
          const updatedFields: string[] = [];

          // Only allow name changes for non-system types
          if (name !== undefined && !isProtectedType(typeId)) {
            updates.name = name;
            updatedFields.push('name');
          }
          if (purpose !== undefined) {
            updates.purpose = purpose;
            updatedFields.push('purpose');
          }
          if (icon !== undefined) {
            updates.icon = icon;
            updatedFields.push('icon');
          }
          if (properties !== undefined) {
            updates.properties = properties;
            updatedFields.push('properties');
          }
          if (editorChips !== undefined) {
            updates.editorChips = editorChips;
            updatedFields.push('editorChips');
          }
          if (agentInstructions !== undefined) {
            (updates as Record<string, unknown>).agentInstructions = agentInstructions;
            updatedFields.push('agentInstructions');
          }

          if (updatedFields.length === 0) {
            return { success: false, error: 'No updates provided' };
          }

          updateNoteType(typeId, updates);

          return {
            success: true,
            message: `Updated note type "${noteType.name}"`,
            updatedFields
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update note type'
          };
        }
      }
    }),

    /**
     * Archive (soft delete) a note type
     */
    archive_note_type: tool({
      description:
        'Archive a note type (soft delete). The type will no longer appear in lists, ' +
        'but notes keep their type assignment. Cannot archive system note types.',
      inputSchema: z.object({
        typeId: z.string().describe('The note type ID to archive')
      }),
      execute: async ({ typeId }) => {
        try {
          const noteType = getNoteType(typeId);
          if (!noteType) {
            return { success: false, error: `Note type not found: ${typeId}` };
          }

          // Prevent archiving system types
          if (isProtectedType(typeId)) {
            return {
              success: false,
              error: `Cannot archive system note type: ${noteType.name}`
            };
          }

          if (noteType.archived) {
            return {
              success: false,
              error: `Note type "${noteType.name}" is already archived`
            };
          }

          archiveNoteType(typeId);

          return {
            success: true,
            message: `Archived note type "${noteType.name}"`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to archive note type'
          };
        }
      }
    }),

    /**
     * Unarchive (restore) a note type
     */
    unarchive_note_type: tool({
      description: 'Restore an archived note type. The type will appear in lists again.',
      inputSchema: z.object({
        typeId: z.string().describe('The note type ID to unarchive')
      }),
      execute: async ({ typeId }) => {
        try {
          const noteType = getNoteType(typeId);
          if (!noteType) {
            return { success: false, error: `Note type not found: ${typeId}` };
          }

          if (!noteType.archived) {
            return {
              success: false,
              error: `Note type "${noteType.name}" is not archived`
            };
          }

          unarchiveNoteType(typeId);

          return {
            success: true,
            message: `Restored note type "${noteType.name}"`
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Failed to unarchive note type'
          };
        }
      }
    })
  };
}
