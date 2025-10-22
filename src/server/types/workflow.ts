/**
 * Workflow Types and Interfaces
 *
 * Defines the type system for agent workflows - persistent, collaborative
 * workflow management between AI agents and users across conversation threads.
 */

// Core workflow types
export type WorkflowStatus = 'active' | 'paused' | 'completed' | 'archived';
export type WorkflowType = 'workflow' | 'backlog';

export interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6 (0=Sunday)
  dayOfMonth?: number; // 1-31
  time?: string; // "HH:MM" format
}

export interface SupplementaryMaterial {
  id: string;
  workflowId: string;
  materialType: 'text' | 'code' | 'note_reference';
  content?: string; // For text/code
  noteId?: string; // For note_reference
  metadata?: {
    language?: string; // For code
    description?: string;
    templateType?: string;
  };
  position: number;
  createdAt: string;
}

export interface WorkflowCompletion {
  id: string;
  workflowId: string;
  completedAt: string;
  conversationId?: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

// Core workflow interface
export interface Workflow {
  id: string; // w-xxxxxxxx
  name: string; // Max 20 chars
  purpose: string; // Max 100 chars
  description: string; // Markdown
  status: WorkflowStatus;
  type: WorkflowType;
  vaultId: string;

  // Scheduling
  recurringSpec?: RecurringSpec;
  dueDate?: string; // ISO datetime
  lastCompleted?: string; // ISO datetime

  // Metadata
  createdAt: string;
  updatedAt: string;

  // Lazy-loaded
  supplementaryMaterials?: SupplementaryMaterial[];
  completionHistory?: WorkflowCompletion[];
}

// Lightweight workflow list item
export interface WorkflowListItem {
  id: string;
  name: string;
  purpose: string;
  status: WorkflowStatus;
  type: WorkflowType;
  isRecurring: boolean;
  dueInfo?: {
    type: 'overdue' | 'due_now' | 'upcoming' | 'scheduled';
    dueDate?: string;
    recurringSchedule?: string; // Human-readable: "Every Sunday"
  };
  lastCompleted?: string;
}

// Tool input/output types
export interface CreateWorkflowInput {
  name: string;
  purpose: string;
  description: string;
  status?: WorkflowStatus;
  type?: WorkflowType; // Default: 'workflow'
  recurringSpec?: RecurringSpec;
  dueDate?: string;
  supplementaryMaterials?: Array<{
    type: 'text' | 'code' | 'note_reference';
    content?: string;
    noteId?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface UpdateWorkflowInput {
  workflowId: string;
  name?: string;
  purpose?: string;
  description?: string;
  status?: WorkflowStatus;
  type?: WorkflowType;
  recurringSpec?: RecurringSpec | null;
  dueDate?: string | null;
}

export interface CompleteWorkflowInput {
  workflowId: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

export interface ListWorkflowsInput {
  status?: WorkflowStatus | 'all';
  type?: WorkflowType | 'all'; // Filter by workflow type
  dueSoon?: boolean; // Workflows due in next 7 days
  recurringOnly?: boolean;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  sortBy?: 'dueDate' | 'created' | 'name' | 'lastCompleted';
  sortOrder?: 'asc' | 'desc';
}

export interface GetWorkflowInput {
  workflowId?: string; // Either workflowId or workflowName must be provided
  workflowName?: string; // Either workflowId or workflowName must be provided
  includeSupplementaryMaterials?: boolean;
  includeCompletionHistory?: boolean;
  completionHistoryLimit?: number; // Default 10
}

// Database row interfaces
export interface WorkflowRow {
  id: string;
  name: string;
  purpose: string;
  description: string;
  status: WorkflowStatus;
  type: WorkflowType;
  vault_id: string;
  recurring_spec: string | null; // JSON
  due_date: string | null; // ISO datetime
  last_completed: string | null; // ISO datetime
  created_at: string;
  updated_at: string;
}

export interface SupplementaryMaterialRow {
  id: string;
  workflow_id: string;
  material_type: 'text' | 'code' | 'note_reference';
  content: string | null;
  note_id: string | null;
  metadata: string | null; // JSON
  position: number;
  created_at: string;
}

export interface WorkflowCompletionRow {
  id: string;
  workflow_id: string;
  completed_at: string;
  conversation_id: string | null;
  notes: string | null;
  output_note_id: string | null;
  metadata: string | null; // JSON
}
