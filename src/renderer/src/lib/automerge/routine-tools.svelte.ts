/**
 * AI SDK Tool Definitions for Routine Operations
 *
 * These tools allow the AI chat agent to create, manage, and complete
 * routines (scheduled tasks) stored in Automerge. They execute directly
 * in the renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import {
  getRoutine,
  getRoutineByName,
  getRoutineListItems,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  completeRoutine,
  addRoutineMaterial,
  removeRoutineMaterial,
  getNote
} from './state.svelte';
import type { AgentRoutine, RoutineListItem, SupplementaryMaterial } from './types';

/**
 * Simplified routine result for AI context
 */
interface RoutineResult {
  id: string;
  name: string;
  purpose: string;
  description: string;
  status: string;
  type: string;
  isRecurring: boolean;
  recurringSchedule?: string;
  dueDate?: string;
  lastCompleted?: string;
  created: string;
  updated: string;
}

/**
 * Convert an AgentRoutine to a simplified result for the AI
 */
function toRoutineResult(routine: AgentRoutine): RoutineResult {
  const result: RoutineResult = {
    id: routine.id,
    name: routine.name,
    purpose: routine.purpose,
    description: routine.description,
    status: routine.status,
    type: routine.type,
    isRecurring: !!routine.recurringSpec,
    created: routine.created,
    updated: routine.updated
  };

  if (routine.recurringSpec) {
    const { frequency, dayOfWeek, dayOfMonth, time } = routine.recurringSpec;
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    let schedule = '';
    if (frequency === 'daily') {
      schedule = 'Every day';
    } else if (frequency === 'weekly' && dayOfWeek !== undefined) {
      schedule = `Every ${dayNames[dayOfWeek]}`;
    } else if (frequency === 'monthly' && dayOfMonth !== undefined) {
      const suffix =
        dayOfMonth === 1
          ? 'st'
          : dayOfMonth === 2
            ? 'nd'
            : dayOfMonth === 3
              ? 'rd'
              : 'th';
      schedule = `Every month on the ${dayOfMonth}${suffix}`;
    } else {
      schedule = `Every ${frequency}`;
    }
    if (time) schedule += ` at ${time}`;
    result.recurringSchedule = schedule;
  }

  if (routine.dueDate) {
    result.dueDate = routine.dueDate;
  }
  if (routine.lastCompleted) {
    result.lastCompleted = routine.lastCompleted;
  }

  return result;
}

/**
 * Convert a RoutineListItem to a simplified result
 */
function listItemToResult(item: RoutineListItem): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: item.id,
    name: item.name,
    purpose: item.purpose,
    status: item.status,
    type: item.type,
    isRecurring: item.isRecurring
  };

  if (item.dueInfo) {
    result.dueStatus = item.dueInfo.type;
    if (item.dueInfo.dueDate) result.dueDate = item.dueInfo.dueDate;
    if (item.dueInfo.recurringSchedule)
      result.recurringSchedule = item.dueInfo.recurringSchedule;
  }
  if (item.lastCompleted) {
    result.lastCompleted = item.lastCompleted;
  }

  return result;
}

/**
 * Format supplementary material for output
 */
function formatMaterial(material: SupplementaryMaterial): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: material.id,
    type: material.materialType,
    position: material.position,
    createdAt: material.createdAt
  };

  if (material.content) {
    result.content = material.content;
  }
  if (material.noteId) {
    result.noteId = material.noteId;
    const note = getNote(material.noteId);
    if (note) {
      result.noteTitle = note.title;
    }
  }
  if (material.metadata) {
    result.metadata = material.metadata;
  }

  return result;
}

// Zod schemas for recurring spec
const recurringSpecSchema = z.object({
  frequency: z
    .enum(['daily', 'weekly', 'monthly'])
    .describe('How often the routine repeats'),
  dayOfWeek: z
    .number()
    .min(0)
    .max(6)
    .optional()
    .describe('Day of week (0=Sunday, 6=Saturday) for weekly routines'),
  dayOfMonth: z
    .number()
    .min(1)
    .max(31)
    .optional()
    .describe('Day of month (1-31) for monthly routines'),
  time: z.string().optional().describe('Time of day in HH:MM format (24-hour)')
});

/**
 * Create all routine tools for the AI chat agent
 */
export function createRoutineTools(): Record<string, Tool> {
  return {
    /**
     * Create a new routine
     */
    create_routine: tool({
      description:
        'Create a new routine (persistent scheduled task). Routines can be one-time with a due date, or recurring (daily/weekly/monthly). Use the backlog type for issues discovered during work that should be addressed later without interrupting the current task.',
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(20)
          .describe('Short name for the routine (1-20 characters)'),
        purpose: z
          .string()
          .min(1)
          .max(100)
          .describe(
            'One-sentence description of what this routine accomplishes (1-100 characters)'
          ),
        description: z
          .string()
          .min(1)
          .describe('Detailed markdown instructions for executing this routine'),
        status: z
          .enum(['active', 'paused'])
          .optional()
          .describe('Initial status (default: active)'),
        type: z
          .enum(['routine', 'backlog'])
          .optional()
          .describe('Type: routine (default) or backlog (for issues to address later)'),
        recurringSpec: recurringSpecSchema
          .optional()
          .describe('Recurring schedule (omit for one-time routines)'),
        dueDate: z
          .string()
          .optional()
          .describe('Due date for one-time routines (ISO datetime)')
      }),
      execute: async (input) => {
        try {
          const routineId = createRoutine({
            name: input.name,
            purpose: input.purpose,
            description: input.description,
            status: input.status,
            type: input.type,
            recurringSpec: input.recurringSpec,
            dueDate: input.dueDate
          });

          return {
            success: true,
            routineId,
            message: `Created routine "${input.name}" with ID ${routineId}`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create routine'
          };
        }
      }
    }),

    /**
     * Update an existing routine
     */
    update_routine: tool({
      description:
        'Update an existing routine. Only provide the fields you want to change. Set recurringSpec or dueDate to null to remove them.',
      inputSchema: z.object({
        routineId: z.string().describe('The routine ID to update'),
        name: z.string().min(1).max(20).optional().describe('New name (if updating)'),
        purpose: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe('New purpose (if updating)'),
        description: z.string().optional().describe('New description (if updating)'),
        status: z
          .enum(['active', 'paused', 'completed', 'archived'])
          .optional()
          .describe('New status (if updating)'),
        type: z
          .enum(['routine', 'backlog'])
          .optional()
          .describe('New type (if updating)'),
        recurringSpec: recurringSpecSchema
          .nullable()
          .optional()
          .describe('New recurring spec (null to remove)'),
        dueDate: z
          .string()
          .nullable()
          .optional()
          .describe('New due date (null to remove)')
      }),
      execute: async (input) => {
        try {
          updateRoutine({
            routineId: input.routineId,
            name: input.name,
            purpose: input.purpose,
            description: input.description,
            status: input.status,
            type: input.type,
            recurringSpec: input.recurringSpec,
            dueDate: input.dueDate
          });

          return {
            success: true,
            message: `Updated routine ${input.routineId}`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update routine'
          };
        }
      }
    }),

    /**
     * Delete a routine
     */
    delete_routine: tool({
      description:
        'Delete a routine by archiving it. The routine can be recovered later if needed.',
      inputSchema: z.object({
        routineId: z.string().describe('The routine ID to delete')
      }),
      execute: async ({ routineId }) => {
        try {
          const routine = getRoutine(routineId);
          if (!routine) {
            return { success: false, error: `Routine not found: ${routineId}` };
          }

          deleteRoutine(routineId);
          return {
            success: true,
            message: `Deleted routine "${routine.name}"`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete routine'
          };
        }
      }
    }),

    /**
     * List routines
     */
    list_routines: tool({
      description:
        'List routines with optional filtering and sorting. Returns routines with due status information.',
      inputSchema: z.object({
        status: z
          .enum(['active', 'paused', 'completed', 'archived', 'all'])
          .optional()
          .describe('Filter by status (default: active)'),
        type: z.enum(['routine', 'backlog', 'all']).optional().describe('Filter by type'),
        dueSoon: z
          .boolean()
          .optional()
          .describe('Only show routines due now, overdue, or upcoming'),
        recurringOnly: z.boolean().optional().describe('Only show recurring routines'),
        overdueOnly: z.boolean().optional().describe('Only show overdue routines'),
        includeArchived: z.boolean().optional().describe('Include archived routines'),
        sortBy: z
          .enum(['dueDate', 'created', 'name', 'lastCompleted'])
          .optional()
          .describe('Sort field'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order')
      }),
      execute: async (input) => {
        try {
          const items = getRoutineListItems({
            status: input.status,
            type: input.type,
            dueSoon: input.dueSoon,
            recurringOnly: input.recurringOnly,
            overdueOnly: input.overdueOnly,
            includeArchived: input.includeArchived,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder
          });

          return {
            success: true,
            routines: items.map(listItemToResult),
            count: items.length
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list routines'
          };
        }
      }
    }),

    /**
     * Get a specific routine
     */
    get_routine: tool({
      description:
        'Get full details of a specific routine by ID or name. Optionally include supplementary materials and completion history.',
      inputSchema: z.object({
        routineId: z.string().optional().describe('Routine ID (if known)'),
        routineName: z
          .string()
          .optional()
          .describe('Routine name (case-insensitive lookup)'),
        includeSupplementaryMaterials: z
          .boolean()
          .optional()
          .describe('Include attached materials'),
        includeCompletionHistory: z
          .boolean()
          .optional()
          .describe('Include completion history'),
        completionHistoryLimit: z
          .number()
          .optional()
          .describe('Limit completion history entries')
      }),
      execute: async (input) => {
        try {
          if (!input.routineId && !input.routineName) {
            return { success: false, error: 'Must provide routineId or routineName' };
          }

          let routine: AgentRoutine | undefined;
          if (input.routineId) {
            routine = getRoutine(input.routineId);
          } else if (input.routineName) {
            routine = getRoutineByName(input.routineName);
          }

          if (!routine) {
            return {
              success: false,
              error: `Routine not found: ${input.routineId || input.routineName}`
            };
          }

          const result: Record<string, unknown> = {
            ...toRoutineResult(routine)
          };

          // Include supplementary materials if requested
          if (input.includeSupplementaryMaterials && routine.supplementaryMaterials) {
            result.supplementaryMaterials =
              routine.supplementaryMaterials.map(formatMaterial);
          }

          // Include completion history if requested
          if (input.includeCompletionHistory && routine.completionHistory) {
            const history = routine.completionHistory;
            const limit = input.completionHistoryLimit || 10;
            const recentHistory = history.slice(-limit).reverse(); // Most recent first
            result.completionHistory = recentHistory;
            result.totalCompletions = history.length;
          }

          return {
            success: true,
            routine: result
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get routine'
          };
        }
      }
    }),

    /**
     * Complete a routine
     */
    complete_routine: tool({
      description:
        'Mark a routine as completed. For recurring routines, this records the completion and resets it for the next occurrence. For one-time routines, this marks it as completed. You should call this when you finish executing a routine.',
      inputSchema: z.object({
        routineId: z.string().describe('The routine ID to complete'),
        notes: z.string().optional().describe('Notes about this completion'),
        outputNoteId: z
          .string()
          .optional()
          .describe('ID of a note created as output of this routine'),
        metadata: z
          .object({
            durationMs: z
              .number()
              .optional()
              .describe('Execution duration in milliseconds'),
            toolCallsCount: z.number().optional().describe('Number of tool calls made')
          })
          .optional()
          .describe('Execution metadata')
      }),
      execute: async (input) => {
        try {
          const routine = getRoutine(input.routineId);
          if (!routine) {
            return { success: false, error: `Routine not found: ${input.routineId}` };
          }

          const completionId = completeRoutine({
            routineId: input.routineId,
            notes: input.notes,
            outputNoteId: input.outputNoteId,
            metadata: input.metadata
          });

          const isRecurring = !!routine.recurringSpec;
          return {
            success: true,
            completionId,
            message: isRecurring
              ? `Completed recurring routine "${routine.name}". It will be due again on its next scheduled occurrence.`
              : `Completed one-time routine "${routine.name}".`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to complete routine'
          };
        }
      }
    }),

    /**
     * Add supplementary material to a routine
     */
    add_routine_material: tool({
      description:
        'Add supplementary material to a routine. Materials can be text instructions, code templates, or references to existing notes.',
      inputSchema: z.object({
        routineId: z.string().describe('The routine ID to add material to'),
        type: z.enum(['text', 'code', 'note_reference']).describe('Type of material'),
        content: z
          .string()
          .optional()
          .describe('Text or code content (for text/code types)'),
        noteId: z
          .string()
          .optional()
          .describe('Note ID to reference (for note_reference type)'),
        metadata: z
          .object({
            language: z
              .string()
              .optional()
              .describe('Programming language (for code type)'),
            description: z.string().optional().describe('Description of the material'),
            templateType: z.string().optional().describe('Template type identifier')
          })
          .optional()
          .describe('Material metadata'),
        position: z.number().optional().describe('Position in the list (default: end)')
      }),
      execute: async (input) => {
        try {
          if (input.type === 'note_reference' && !input.noteId) {
            return {
              success: false,
              error: 'noteId is required for note_reference type'
            };
          }
          if ((input.type === 'text' || input.type === 'code') && !input.content) {
            return { success: false, error: 'content is required for text/code types' };
          }

          const materialId = addRoutineMaterial(input.routineId, {
            type: input.type,
            content: input.content,
            noteId: input.noteId,
            metadata: input.metadata,
            position: input.position
          });

          return {
            success: true,
            materialId,
            message: `Added ${input.type} material to routine`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to add material'
          };
        }
      }
    }),

    /**
     * Remove supplementary material from a routine
     */
    remove_routine_material: tool({
      description: 'Remove supplementary material from a routine.',
      inputSchema: z.object({
        routineId: z.string().describe('The routine ID'),
        materialId: z.string().describe('The material ID to remove')
      }),
      execute: async ({ routineId, materialId }) => {
        try {
          removeRoutineMaterial(routineId, materialId);
          return {
            success: true,
            message: `Removed material ${materialId} from routine`
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to remove material'
          };
        }
      }
    })
  };
}
