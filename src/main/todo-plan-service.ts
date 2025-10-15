import { randomUUID } from 'crypto';

export interface TodoItem {
  id: string;
  content: string; // Imperative: "Search for all meeting notes"
  activeForm: string; // Present continuous: "Searching for all meeting notes"
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created: Date;
  updated: Date;
  result?: unknown; // Optional result data
  error?: string; // Error message if failed
}

export interface TodoPlan {
  id: string;
  conversationId: string;
  goal: string; // High-level goal: "Reorganize Q4 meeting notes"
  items: TodoItem[];
  status: 'active' | 'completed' | 'abandoned';
  created: Date;
  updated: Date;
}

export class TodoPlanService {
  private activePlans: Map<string, TodoPlan> = new Map();

  /**
   * Create a new plan for a conversation
   */
  createPlan(conversationId: string, goal: string): TodoPlan {
    // Abandon any existing active plan for this conversation
    const existingPlan = this.getActivePlan(conversationId);
    if (existingPlan) {
      this.abandonPlan(existingPlan.id, 'New plan created');
    }

    const plan: TodoPlan = {
      id: randomUUID(),
      conversationId,
      goal,
      items: [],
      status: 'active',
      created: new Date(),
      updated: new Date()
    };

    this.activePlans.set(plan.id, plan);
    return plan;
  }

  /**
   * Add todos to an existing plan
   * Returns the added todo items with their IDs
   */
  addTodos(
    planId: string,
    items: Array<{ content: string; activeForm: string }>
  ): TodoItem[] {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Generate sequential IDs starting from the next available number
    const startIndex = plan.items.length + 1;

    const newTodos: TodoItem[] = items.map((item, index) => ({
      id: `todo-${startIndex + index}`,
      content: item.content,
      activeForm: item.activeForm,
      status: 'pending' as const,
      created: new Date(),
      updated: new Date()
    }));

    plan.items.push(...newTodos);
    plan.updated = new Date();

    return newTodos;
  }

  /**
   * Update the status of a todo item
   */
  updateTodoStatus(
    planId: string,
    todoId: string,
    status: TodoItem['status'],
    result?: unknown,
    error?: string
  ): void {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const todo = plan.items.find((t) => t.id === todoId);
    if (!todo) {
      throw new Error(`Todo ${todoId} not found in plan ${planId}`);
    }

    // Enforce single in_progress todo rule
    if (status === 'in_progress') {
      const otherInProgress = plan.items.find(
        (t) => t.id !== todoId && t.status === 'in_progress'
      );
      if (otherInProgress) {
        throw new Error(
          `Cannot set todo ${todoId} to in_progress: todo ${otherInProgress.id} is already in_progress`
        );
      }
    }

    todo.status = status;
    todo.updated = new Date();
    if (result !== undefined) {
      todo.result = result;
    }
    if (error !== undefined) {
      todo.error = error;
    }

    plan.updated = new Date();

    // Check if all todos are completed
    const allCompleted = plan.items.every((t) => t.status === 'completed');
    if (allCompleted && plan.items.length > 0) {
      plan.status = 'completed';
    }
  }

  /**
   * Get the active plan for a conversation
   */
  getActivePlan(conversationId: string): TodoPlan | null {
    for (const plan of this.activePlans.values()) {
      if (plan.conversationId === conversationId && plan.status === 'active') {
        return plan;
      }
    }
    return null;
  }

  /**
   * Get a plan by ID
   */
  getPlanById(planId: string): TodoPlan | null {
    return this.activePlans.get(planId) || null;
  }

  /**
   * Complete a plan
   */
  completePlan(planId: string): void {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    plan.status = 'completed';
    plan.updated = new Date();
  }

  /**
   * Abandon a plan with a reason
   */
  abandonPlan(planId: string, reason: string): void {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    plan.status = 'abandoned';
    plan.updated = new Date();
    console.log(`Plan ${planId} abandoned: ${reason}`);
  }

  /**
   * Get plan context for injection into AI messages
   */
  getPlanContext(conversationId: string): string | null {
    const plan = this.getActivePlan(conversationId);
    if (!plan) {
      return null;
    }

    const completedItems = plan.items.filter((t) => t.status === 'completed');
    const inProgressItems = plan.items.filter((t) => t.status === 'in_progress');
    const failedItems = plan.items.filter((t) => t.status === 'failed');
    const pendingItems = plan.items.filter((t) => t.status === 'pending');

    let context = '<active-todo-plan>\n';
    context += `Goal: ${plan.goal}\n`;
    context += `Progress: ${completedItems.length}/${plan.items.length} completed\n\n`;

    if (completedItems.length > 0) {
      context += 'Completed:\n';
      for (const item of completedItems) {
        const resultSummary = item.result ? ` (${this.formatResult(item.result)})` : '';
        context += `✅ ${item.content}${resultSummary}\n`;
      }
      context += '\n';
    }

    if (inProgressItems.length > 0) {
      context += 'In Progress:\n';
      for (const item of inProgressItems) {
        context += `⏳ ${item.activeForm}\n`;
      }
      context += '\n';
    }

    if (failedItems.length > 0) {
      context += 'Failed:\n';
      for (const item of failedItems) {
        const errorMsg = item.error ? `: ${item.error}` : '';
        context += `❌ ${item.content}${errorMsg}\n`;
      }
      context += '\n';
    }

    if (pendingItems.length > 0) {
      context += 'Pending:\n';
      for (const item of pendingItems) {
        context += `⏹ ${item.content}\n`;
      }
    }

    context += '</active-todo-plan>';

    return context;
  }

  /**
   * Format result data for compact display
   */
  private formatResult(result: unknown): string {
    if (typeof result === 'object' && result !== null) {
      // Try to extract meaningful summary from result object
      const obj = result as Record<string, unknown>;
      if ('count' in obj) return `${obj.count} items`;
      if ('notesFound' in obj) return `${obj.notesFound} notes`;
      if ('processed' in obj && 'total' in obj) return `${obj.processed}/${obj.total}`;
      // Default to JSON for other objects, truncated
      const json = JSON.stringify(result);
      return json.length > 50 ? json.substring(0, 50) + '...' : json;
    }
    return String(result);
  }

  /**
   * Clean up old completed/abandoned plans (optional housekeeping)
   */
  cleanup(olderThanHours = 24): void {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const [id, plan] of this.activePlans.entries()) {
      if (
        (plan.status === 'completed' || plan.status === 'abandoned') &&
        plan.updated < cutoff
      ) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.activePlans.delete(id);
    }
  }
}
