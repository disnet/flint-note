/**
 * Zod Schemas for Workflow Tools
 *
 * Defines validation schemas for all workflow-related agent tools
 */

import { z } from 'zod';

export const createWorkflowSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(20)
    .describe('Short workflow name (1-20 characters, e.g., "Weekly Summary")'),

  purpose: z
    .string()
    .min(1)
    .max(100)
    .describe('One-sentence description of what this workflow accomplishes'),

  description: z
    .string()
    .min(1)
    .describe('Detailed step-by-step instructions for executing this workflow'),

  status: z
    .enum(['active', 'paused', 'completed', 'archived'])
    .optional()
    .default('active')
    .describe('Initial workflow status'),

  type: z
    .enum(['workflow', 'backlog'])
    .optional()
    .default('workflow')
    .describe(
      'Workflow type: "workflow" for intentional workflows, "backlog" for discovered items'
    ),

  recurringSpec: z
    .object({
      frequency: z
        .enum(['daily', 'weekly', 'monthly'])
        .describe('How often this workflow should recur'),
      dayOfWeek: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe('Day of week for weekly workflows (0=Sunday, 6=Saturday)'),
      dayOfMonth: z
        .number()
        .int()
        .min(1)
        .max(31)
        .optional()
        .describe('Day of month for monthly workflows (1-31)'),
      time: z
        .string()
        .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
        .describe('Time in HH:MM format (24-hour)')
    })
    .optional()
    .describe('Recurring schedule specification'),

  dueDate: z
    .string()
    .datetime()
    .optional()
    .describe('Due date for one-time workflows (ISO 8601 format)'),

  supplementaryMaterials: z
    .array(
      z.object({
        type: z
          .enum(['text', 'code', 'note_reference'])
          .describe('Type of supplementary material'),
        content: z.string().optional().describe('Material content (for text/code types)'),
        noteId: z
          .string()
          .optional()
          .describe('Note ID to reference (for note_reference type)'),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Additional metadata (language for code, description, etc.)')
      })
    )
    .optional()
    .describe('Supplementary materials to help execute workflow')
});

export const updateWorkflowSchema = z.object({
  workflowId: z.string().describe('ID of the workflow to update'),
  name: z.string().min(1).max(20).optional().describe('New workflow name (optional)'),
  purpose: z.string().min(1).max(100).optional().describe('New purpose (optional)'),
  description: z.string().optional().describe('New description (optional)'),
  status: z
    .enum(['active', 'paused', 'completed', 'archived'])
    .optional()
    .describe('New status (optional)'),
  type: z
    .enum(['workflow', 'backlog'])
    .optional()
    .describe('New workflow type (optional)'),
  recurringSpec: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
      time: z
        .string()
        .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
    })
    .nullable()
    .optional()
    .describe('New recurring schedule (optional, use null to remove)'),
  dueDate: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe('New due date (optional, use null to remove)')
});

export const deleteWorkflowSchema = z.object({
  workflowId: z.string().describe('ID of the workflow to delete (marks as archived)')
});

export const listWorkflowsSchema = z.object({
  status: z
    .enum(['active', 'paused', 'completed', 'archived', 'all'])
    .optional()
    .default('active')
    .describe('Filter by workflow status'),

  type: z
    .enum(['workflow', 'backlog', 'all'])
    .optional()
    .default('all')
    .describe('Filter by workflow type'),

  dueSoon: z.boolean().optional().describe('Only show workflows due in next 7 days'),

  recurringOnly: z.boolean().optional().describe('Only show recurring workflows'),

  overdueOnly: z.boolean().optional().describe('Only show overdue workflows'),

  sortBy: z
    .enum(['dueDate', 'created', 'name', 'lastCompleted'])
    .optional()
    .default('dueDate')
    .describe('Field to sort by'),

  sortOrder: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction')
});

export const getWorkflowSchema = z
  .object({
    workflowId: z
      .string()
      .optional()
      .describe('Workflow ID to retrieve (either workflowId or workflowName required)'),

    workflowName: z
      .string()
      .optional()
      .describe('Workflow name to retrieve (either workflowId or workflowName required)'),

    includeSupplementaryMaterials: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include supplementary materials in response'),

    includeCompletionHistory: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include completion history in response'),

    completionHistoryLimit: z
      .number()
      .int()
      .positive()
      .optional()
      .default(10)
      .describe('Maximum number of completion history entries to return')
  })
  .refine((data) => data.workflowId || data.workflowName, {
    message: 'Either workflowId or workflowName must be provided'
  });

export const completeWorkflowSchema = z.object({
  workflowId: z.string().describe('ID of workflow to mark as completed'),

  notes: z.string().optional().describe('Optional notes about this execution'),

  outputNoteId: z
    .string()
    .optional()
    .describe('ID of note created as result of workflow (if applicable)'),

  metadata: z
    .object({
      durationMs: z
        .number()
        .int()
        .optional()
        .describe('Time taken to execute workflow in milliseconds'),
      toolCallsCount: z
        .number()
        .int()
        .optional()
        .describe('Number of tool calls used during execution')
    })
    .optional()
    .describe('Execution metadata for tracking')
});

export const addWorkflowMaterialSchema = z.object({
  workflowId: z.string().describe('ID of the workflow to add material to'),
  type: z.enum(['text', 'code', 'note_reference']).describe('Type of material'),
  content: z.string().optional().describe('Material content (for text/code types)'),
  noteId: z.string().optional().describe('Note ID (for note_reference type)'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional metadata (language, description, etc.)')
});

export const removeWorkflowMaterialSchema = z.object({
  materialId: z.string().describe('ID of the material to remove')
});
