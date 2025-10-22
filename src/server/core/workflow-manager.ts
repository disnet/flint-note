/**
 * Workflow Manager
 *
 * Handles creation, management, and execution of agent workflows.
 * Workflows are persistent, collaborative task definitions that agents can execute.
 */

import crypto from 'crypto';
import type { DatabaseConnection } from '../database/schema.js';
import type {
  Workflow,
  WorkflowListItem,
  WorkflowRow,
  SupplementaryMaterial,
  SupplementaryMaterialRow,
  WorkflowCompletion,
  WorkflowCompletionRow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CompleteWorkflowInput,
  ListWorkflowsInput,
  GetWorkflowInput,
  RecurringSpec,
  WorkflowStatus
} from '../types/workflow.js';

/**
 * Generate a workflow ID in the format w-xxxxxxxx
 */
export function generateWorkflowId(): string {
  return 'w-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a completion ID in the format wc-xxxxxxxx
 */
function generateCompletionId(): string {
  return 'wc-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a material ID in the format wm-xxxxxxxx
 */
function generateMaterialId(): string {
  return 'wm-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Size limits for supplementary materials
 */
const MAX_INDIVIDUAL_MATERIAL_SIZE = 50 * 1024; // 50KB
const MAX_TOTAL_MATERIALS_SIZE = 500 * 1024; // 500KB

/**
 * Calculate the size of a material's content in bytes
 */
function calculateMaterialSize(material: {
  content?: string;
  metadata?: unknown;
}): number {
  let size = 0;

  // Count content size (UTF-8 encoding)
  if (material.content) {
    size += Buffer.byteLength(material.content, 'utf8');
  }

  // Count metadata size when serialized
  if (material.metadata) {
    size += Buffer.byteLength(JSON.stringify(material.metadata), 'utf8');
  }

  return size;
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Convert workflow row from database to domain model
 */
function workflowRowToModel(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    description: row.description,
    status: row.status,
    type: row.type,
    vaultId: row.vault_id,
    recurringSpec: row.recurring_spec ? JSON.parse(row.recurring_spec) : undefined,
    dueDate: row.due_date || undefined,
    lastCompleted: row.last_completed || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Convert supplementary material row to domain model
 */
function materialRowToModel(row: SupplementaryMaterialRow): SupplementaryMaterial {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    materialType: row.material_type,
    content: row.content || undefined,
    noteId: row.note_id || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    position: row.position,
    createdAt: row.created_at
  };
}

/**
 * Convert completion row to domain model
 */
function completionRowToModel(row: WorkflowCompletionRow): WorkflowCompletion {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    completedAt: row.completed_at,
    conversationId: row.conversation_id || undefined,
    notes: row.notes || undefined,
    outputNoteId: row.output_note_id || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

/**
 * Format recurring spec as human-readable string
 */
function formatRecurringSchedule(spec: RecurringSpec): string {
  const { frequency, dayOfWeek, dayOfMonth, time } = spec;

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
      dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
    schedule = `Every month on the ${dayOfMonth}${suffix}`;
  } else {
    schedule = `Every ${frequency}`;
  }

  if (time) {
    schedule += ` at ${time}`;
  }

  return schedule;
}

export class WorkflowManager {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new workflow
   */
  async createWorkflow(vaultId: string, input: CreateWorkflowInput): Promise<Workflow> {
    const id = generateWorkflowId();
    const now = new Date().toISOString();

    // Validate name length
    if (input.name.length < 1 || input.name.length > 20) {
      throw new Error('Workflow name must be between 1 and 20 characters');
    }

    // Validate purpose length
    if (input.purpose.length < 1 || input.purpose.length > 100) {
      throw new Error('Workflow purpose must be between 1 and 100 characters');
    }

    // Check for duplicate name (case-insensitive)
    const existing = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM workflows WHERE vault_id = ? AND LOWER(name) = LOWER(?)',
      [vaultId, input.name]
    );

    if (existing && existing.count > 0) {
      throw new Error(`A workflow named '${input.name}' already exists in this vault`);
    }

    // Insert workflow
    await this.db.run(
      `INSERT INTO workflows (
        id, name, purpose, description, status, type, vault_id,
        recurring_spec, due_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.purpose,
        input.description,
        input.status || 'active',
        input.type || 'workflow',
        vaultId,
        input.recurringSpec ? JSON.stringify(input.recurringSpec) : null,
        input.dueDate || null,
        now,
        now
      ]
    );

    // Add supplementary materials if provided
    if (input.supplementaryMaterials && input.supplementaryMaterials.length > 0) {
      // Validate individual material sizes and calculate total
      let totalSize = 0;
      for (const material of input.supplementaryMaterials) {
        const materialSize = calculateMaterialSize({
          content: material.content,
          metadata: material.metadata
        });

        // Validate individual material size
        if (materialSize > MAX_INDIVIDUAL_MATERIAL_SIZE) {
          throw new Error(
            `Material size (${formatBytes(materialSize)}) exceeds maximum allowed size of ${formatBytes(MAX_INDIVIDUAL_MATERIAL_SIZE)}`
          );
        }

        totalSize += materialSize;
      }

      // Validate total materials size
      if (totalSize > MAX_TOTAL_MATERIALS_SIZE) {
        throw new Error(
          `Total materials size (${formatBytes(totalSize)}) exceeds maximum allowed size of ${formatBytes(MAX_TOTAL_MATERIALS_SIZE)}`
        );
      }

      // Insert materials
      for (let i = 0; i < input.supplementaryMaterials.length; i++) {
        const material = input.supplementaryMaterials[i];
        const materialId = generateMaterialId();

        await this.db.run(
          `INSERT INTO workflow_supplementary_materials (
            id, workflow_id, material_type, content, note_id, metadata, position, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            materialId,
            id,
            material.type,
            material.content || null,
            material.noteId || null,
            material.metadata ? JSON.stringify(material.metadata) : null,
            i,
            now
          ]
        );
      }
    }

    // Fetch and return the created workflow
    return this.getWorkflow({ workflowId: id, includeSupplementaryMaterials: true });
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(input: UpdateWorkflowInput): Promise<Workflow> {
    const { workflowId, ...updates } = input;

    // Check if workflow exists
    const existing = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [workflowId]
    );

    if (!existing) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // If name is being changed, check for duplicates
    if (updates.name && updates.name !== existing.name) {
      if (updates.name.length < 1 || updates.name.length > 20) {
        throw new Error('Workflow name must be between 1 and 20 characters');
      }

      const duplicate = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM workflows WHERE vault_id = ? AND LOWER(name) = LOWER(?) AND id != ?',
        [existing.vault_id, updates.name, workflowId]
      );

      if (duplicate && duplicate.count > 0) {
        throw new Error(
          `A workflow named '${updates.name}' already exists in this vault`
        );
      }
    }

    // Validate purpose length if being updated
    if (updates.purpose && (updates.purpose.length < 1 || updates.purpose.length > 100)) {
      throw new Error('Workflow purpose must be between 1 and 100 characters');
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: (string | number | boolean | null)[] = [];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(updates.name);
    }

    if (updates.purpose !== undefined) {
      updateFields.push('purpose = ?');
      updateValues.push(updates.purpose);
    }

    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(updates.description);
    }

    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
    }

    if (updates.type !== undefined) {
      updateFields.push('type = ?');
      updateValues.push(updates.type);
    }

    if (updates.recurringSpec !== undefined) {
      updateFields.push('recurring_spec = ?');
      updateValues.push(
        updates.recurringSpec ? JSON.stringify(updates.recurringSpec) : null
      );
    }

    if (updates.dueDate !== undefined) {
      updateFields.push('due_date = ?');
      updateValues.push(updates.dueDate || null);
    }

    if (updateFields.length === 0) {
      // No updates, just return current workflow
      return this.getWorkflow({ workflowId });
    }

    // Add updated_at
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());

    // Add workflow ID to values
    updateValues.push(workflowId);

    await this.db.run(
      `UPDATE workflows SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    return this.getWorkflow({ workflowId });
  }

  /**
   * Delete a workflow (soft delete - mark as archived)
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [workflowId]
    );

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    await this.db.run('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?', [
      'archived',
      new Date().toISOString(),
      workflowId
    ]);
  }

  /**
   * Get a workflow by ID with optional related data
   */
  async getWorkflow(input: GetWorkflowInput): Promise<Workflow> {
    const {
      workflowId,
      includeSupplementaryMaterials,
      includeCompletionHistory,
      completionHistoryLimit
    } = input;

    const row = await this.db.get<WorkflowRow>('SELECT * FROM workflows WHERE id = ?', [
      workflowId
    ]);

    if (!row) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const workflow = workflowRowToModel(row);

    // Load supplementary materials if requested
    if (includeSupplementaryMaterials) {
      const materials = await this.db.all<SupplementaryMaterialRow>(
        'SELECT * FROM workflow_supplementary_materials WHERE workflow_id = ? ORDER BY position',
        [workflowId]
      );

      workflow.supplementaryMaterials = materials.map(materialRowToModel);
    }

    // Load completion history if requested
    if (includeCompletionHistory) {
      const limit = completionHistoryLimit || 10;
      const completions = await this.db.all<WorkflowCompletionRow>(
        'SELECT * FROM workflow_completion_history WHERE workflow_id = ? ORDER BY completed_at DESC LIMIT ?',
        [workflowId, limit]
      );

      workflow.completionHistory = completions.map(completionRowToModel);
    }

    return workflow;
  }

  /**
   * List workflows with filtering and sorting
   */
  async listWorkflows(
    vaultId: string,
    input?: ListWorkflowsInput
  ): Promise<WorkflowListItem[]> {
    const params: (string | number | boolean)[] = [vaultId];
    const conditions: string[] = ['vault_id = ?'];

    // Build WHERE clause
    if (input?.status && input.status !== 'all') {
      conditions.push('status = ?');
      params.push(input.status);
    } else if (!input?.includeArchived) {
      conditions.push("status != 'archived'");
    }

    if (input?.type && input.type !== 'all') {
      conditions.push('type = ?');
      params.push(input.type);
    }

    if (input?.recurringOnly) {
      conditions.push('recurring_spec IS NOT NULL');
    }

    // Build ORDER BY clause
    const sortBy = input?.sortBy || 'dueDate';
    const sortOrder = input?.sortOrder || 'asc';
    let orderBy = '';

    switch (sortBy) {
      case 'name':
        orderBy = `name ${sortOrder.toUpperCase()}`;
        break;
      case 'created':
        orderBy = `created_at ${sortOrder.toUpperCase()}`;
        break;
      case 'lastCompleted':
        orderBy = `last_completed ${sortOrder.toUpperCase()} NULLS LAST`;
        break;
      case 'dueDate':
      default:
        // For due date, prioritize: overdue, due now, upcoming, then scheduled
        orderBy = `
          CASE
            WHEN due_date IS NOT NULL AND due_date < datetime('now') THEN 1
            WHEN due_date IS NOT NULL AND due_date <= datetime('now', '+1 day') THEN 2
            WHEN due_date IS NOT NULL THEN 3
            ELSE 4
          END,
          due_date ${sortOrder.toUpperCase()} NULLS LAST
        `;
        break;
    }

    const query = `
      SELECT * FROM workflows
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
    `;

    const rows = await this.db.all<WorkflowRow>(query, params);

    // Convert to list items with due info
    const now = new Date();
    const items: (WorkflowListItem | null)[] = rows.map((row) => {
      const isRecurring = !!row.recurring_spec;
      let dueInfo: WorkflowListItem['dueInfo'] = undefined;

      if (isRecurring && row.recurring_spec) {
        const spec = JSON.parse(row.recurring_spec) as RecurringSpec;
        const isDue = this.isWorkflowDue(workflowRowToModel(row), now);

        dueInfo = {
          type: isDue ? 'due_now' : 'scheduled',
          recurringSchedule: formatRecurringSchedule(spec)
        };
      } else if (row.due_date) {
        const dueDate = new Date(row.due_date);
        const diffDays = Math.ceil(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        let type: 'overdue' | 'due_now' | 'upcoming' | 'scheduled';
        if (diffDays < 0) {
          type = 'overdue';
        } else if (diffDays === 0) {
          type = 'due_now';
        } else if (diffDays <= 7) {
          type = 'upcoming';
        } else {
          type = 'scheduled';
        }

        dueInfo = {
          type,
          dueDate: row.due_date
        };
      }

      // Apply filters based on due info
      if (input?.dueSoon && dueInfo) {
        if (
          dueInfo.type !== 'due_now' &&
          dueInfo.type !== 'upcoming' &&
          dueInfo.type !== 'overdue'
        ) {
          return null;
        }
      }

      if (input?.overdueOnly && (!dueInfo || dueInfo.type !== 'overdue')) {
        return null;
      }

      return {
        id: row.id,
        name: row.name,
        purpose: row.purpose,
        status: row.status,
        type: row.type,
        isRecurring,
        dueInfo,
        lastCompleted: row.last_completed || undefined
      };
    });

    // Filter out nulls from filtering
    return items.filter((item): item is WorkflowListItem => item !== null);
  }

  /**
   * Complete a workflow
   */
  async completeWorkflow(input: CompleteWorkflowInput): Promise<WorkflowCompletion> {
    const { workflowId, notes, outputNoteId, metadata } = input;

    // Get workflow
    const workflow = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [workflowId]
    );

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const completionId = generateCompletionId();
    const now = new Date().toISOString();

    // Insert completion record
    await this.db.run(
      `INSERT INTO workflow_completion_history (
        id, workflow_id, completed_at, conversation_id, notes, output_note_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        completionId,
        workflowId,
        now,
        null, // conversation_id will be set when we integrate with conversation system
        notes || null,
        outputNoteId || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    // Update workflow
    const isRecurring = !!workflow.recurring_spec;
    const newStatus: WorkflowStatus = isRecurring ? 'active' : 'completed';

    await this.db.run(
      'UPDATE workflows SET last_completed = ?, status = ?, updated_at = ? WHERE id = ?',
      [now, newStatus, now, workflowId]
    );

    // Return the completion record
    const completion = await this.db.get<WorkflowCompletionRow>(
      'SELECT * FROM workflow_completion_history WHERE id = ?',
      [completionId]
    );

    if (!completion) {
      throw new Error('Failed to create completion record');
    }

    return completionRowToModel(completion);
  }

  /**
   * Get total size of all materials for a workflow
   */
  private async getTotalMaterialsSize(workflowId: string): Promise<number> {
    const materials = await this.db.all<SupplementaryMaterialRow>(
      'SELECT content, metadata FROM workflow_supplementary_materials WHERE workflow_id = ?',
      [workflowId]
    );

    return materials.reduce((total, material) => {
      return (
        total +
        calculateMaterialSize({
          content: material.content || undefined,
          metadata: material.metadata ? JSON.parse(material.metadata) : undefined
        })
      );
    }, 0);
  }

  /**
   * Add supplementary material to a workflow
   */
  async addSupplementaryMaterial(
    workflowId: string,
    material: Omit<SupplementaryMaterial, 'id' | 'workflowId' | 'createdAt'>
  ): Promise<string> {
    // Check if workflow exists
    const workflow = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [workflowId]
    );

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Validate individual material size (for materials with content or metadata)
    if (material.content || material.metadata) {
      const materialSize = calculateMaterialSize(material);
      if (materialSize > MAX_INDIVIDUAL_MATERIAL_SIZE) {
        throw new Error(
          `Material size (${formatBytes(materialSize)}) exceeds maximum allowed size of ${formatBytes(MAX_INDIVIDUAL_MATERIAL_SIZE)}`
        );
      }
    }

    // Validate total workflow materials size
    const currentTotalSize = await this.getTotalMaterialsSize(workflowId);
    const newMaterialSize = calculateMaterialSize(material);
    const newTotalSize = currentTotalSize + newMaterialSize;

    if (newTotalSize > MAX_TOTAL_MATERIALS_SIZE) {
      throw new Error(
        `Adding this material would exceed the total materials size limit. Current: ${formatBytes(currentTotalSize)}, New material: ${formatBytes(newMaterialSize)}, Limit: ${formatBytes(MAX_TOTAL_MATERIALS_SIZE)}`
      );
    }

    // Get current max position
    const maxPos = await this.db.get<{ maxPosition: number }>(
      'SELECT COALESCE(MAX(position), -1) as maxPosition FROM workflow_supplementary_materials WHERE workflow_id = ?',
      [workflowId]
    );

    const position = (maxPos?.maxPosition ?? -1) + 1;
    const materialId = generateMaterialId();
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO workflow_supplementary_materials (
        id, workflow_id, material_type, content, note_id, metadata, position, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        materialId,
        workflowId,
        material.materialType,
        material.content || null,
        material.noteId || null,
        material.metadata ? JSON.stringify(material.metadata) : null,
        position,
        now
      ]
    );

    return materialId;
  }

  /**
   * Remove supplementary material from a workflow
   */
  async removeSupplementaryMaterial(materialId: string): Promise<void> {
    const material = await this.db.get<SupplementaryMaterialRow>(
      'SELECT * FROM workflow_supplementary_materials WHERE id = ?',
      [materialId]
    );

    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }

    await this.db.run('DELETE FROM workflow_supplementary_materials WHERE id = ?', [
      materialId
    ]);
  }

  /**
   * Get workflows that are currently due
   */
  async getWorkflowsDueNow(vaultId: string): Promise<WorkflowListItem[]> {
    const allWorkflows = await this.listWorkflows(vaultId, { status: 'active' });
    const now = new Date();

    return allWorkflows.filter((workflow) => {
      if (workflow.isRecurring) {
        // For recurring workflows, check if they're marked as due_now
        return workflow.dueInfo?.type === 'due_now';
      } else if (workflow.dueInfo?.dueDate) {
        const dueDate = new Date(workflow.dueInfo.dueDate);
        return dueDate <= now;
      }

      return false;
    });
  }

  /**
   * Get upcoming workflows (due in next N days)
   */
  async getUpcomingWorkflows(
    vaultId: string,
    daysAhead: number
  ): Promise<WorkflowListItem[]> {
    const allWorkflows = await this.listWorkflows(vaultId, { status: 'active' });
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    return allWorkflows.filter((workflow) => {
      if (workflow.dueInfo?.type === 'upcoming' || workflow.dueInfo?.type === 'due_now') {
        return true;
      }

      if (workflow.dueInfo?.dueDate) {
        const dueDate = new Date(workflow.dueInfo.dueDate);
        return dueDate > now && dueDate <= futureDate;
      }

      return false;
    });
  }

  /**
   * Check if a workflow is currently due
   */
  isWorkflowDue(workflow: Workflow, now?: Date): boolean {
    const currentTime = now || new Date();

    // One-time workflows with due date
    if (workflow.dueDate && !workflow.recurringSpec) {
      const dueDate = new Date(workflow.dueDate);
      return dueDate <= currentTime;
    }

    // Recurring workflows
    if (workflow.recurringSpec) {
      const { frequency, dayOfWeek, dayOfMonth } = workflow.recurringSpec;

      // If never completed, it's due
      if (!workflow.lastCompleted) {
        return true;
      }

      const lastCompleted = new Date(workflow.lastCompleted);
      const daysSinceCompleted = Math.floor(
        (currentTime.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24)
      );

      switch (frequency) {
        case 'daily':
          return daysSinceCompleted >= 1;

        case 'weekly':
          if (dayOfWeek === undefined) return false;
          return daysSinceCompleted >= 7 && currentTime.getDay() === dayOfWeek;

        case 'monthly':
          if (dayOfMonth === undefined) return false;
          return daysSinceCompleted >= 28 && currentTime.getDate() === dayOfMonth;

        default:
          return false;
      }
    }

    return false;
  }

  /**
   * Get workflow context for system prompt injection
   */
  async getWorkflowContextForPrompt(vaultId: string): Promise<string> {
    const dueNow = await this.getWorkflowsDueNow(vaultId);
    const upcoming = await this.getUpcomingWorkflows(vaultId, 7);
    const active = await this.listWorkflows(vaultId, {
      status: 'active',
      includeArchived: false
    });

    let context = '## Available Workflows\n\n';

    // Due now - highest priority
    if (dueNow.length > 0) {
      context += '### Due Now\n';
      for (const workflow of dueNow) {
        const schedule = workflow.dueInfo?.recurringSchedule || 'one-time workflow';
        context += `- **${workflow.name}**: ${workflow.purpose} (${schedule})\n`;
      }
      context += '\n';
    }

    // Upcoming in next 7 days
    const upcomingFiltered = upcoming.filter((u) => !dueNow.some((d) => d.id === u.id));
    if (upcomingFiltered.length > 0) {
      context += '### Upcoming (Next 7 Days)\n';
      for (const workflow of upcomingFiltered.slice(0, 5)) {
        // Max 5 to save tokens
        context += `- **${workflow.name}**: ${workflow.purpose}\n`;
      }
      context += '\n';
    }

    // Other active on-demand workflows
    const onDemand = active.filter(
      (w) =>
        !w.isRecurring &&
        !dueNow.some((d) => d.id === w.id) &&
        !upcoming.some((u) => u.id === w.id)
    );

    if (onDemand.length > 0) {
      context += '### On-Demand Workflows\n';
      for (const workflow of onDemand.slice(0, 5)) {
        // Max 5 to save tokens
        context += `- **${workflow.name}**: ${workflow.purpose}\n`;
      }
      context += '\n';
    }

    // Add tool hint
    context +=
      '*Use `get_workflow` to load full details and `complete_workflow` when finished.*\n';

    return context;
  }

  /**
   * Get completion history for a workflow
   */
  async getCompletionHistory(
    workflowId: string,
    limit?: number
  ): Promise<WorkflowCompletion[]> {
    const completionLimit = limit || 10;

    const rows = await this.db.all<WorkflowCompletionRow>(
      'SELECT * FROM workflow_completion_history WHERE workflow_id = ? ORDER BY completed_at DESC LIMIT ?',
      [workflowId, completionLimit]
    );

    return rows.map(completionRowToModel);
  }
}
