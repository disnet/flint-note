interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created: Date;
  updated: Date;
  result?: unknown;
  error?: string;
}

interface TodoPlan {
  id: string;
  conversationId: string;
  goal: string;
  items: TodoItem[];
  status: 'active' | 'completed' | 'abandoned';
  created: Date;
  updated: Date;
}

export class TodoPlanStore {
  activePlan = $state<TodoPlan | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);

  private pollInterval: number | null = null;
  private currentConversationId: string | null = null;

  constructor(private pollIntervalMs = 1000) {}

  /**
   * Start monitoring a conversation for todo plans
   */
  startMonitoring(conversationId: string): void {
    if (this.currentConversationId === conversationId && this.pollInterval !== null) {
      return; // Already monitoring this conversation
    }

    this.stopMonitoring();
    this.currentConversationId = conversationId;
    this.fetchActivePlan();

    // Set up polling
    this.pollInterval = window.setInterval(() => {
      this.fetchActivePlan();
    }, this.pollIntervalMs);
  }

  /**
   * Stop monitoring for todo plans
   */
  stopMonitoring(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.currentConversationId = null;
    this.activePlan = null;
    this.error = null;
  }

  /**
   * Fetch the active plan for the current conversation
   */
  private async fetchActivePlan(): Promise<void> {
    if (!this.currentConversationId) {
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;

      const plan = await window.api?.todoPlan.getActive({
        conversationId: this.currentConversationId
      });

      this.activePlan = plan || null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to fetch todo plan';
      console.error('Failed to fetch todo plan:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Manually refresh the active plan
   */
  async refresh(): Promise<void> {
    await this.fetchActivePlan();
  }

  /**
   * Get the current in-progress todo
   */
  get currentTodo(): TodoItem | null {
    if (!this.activePlan) {
      return null;
    }
    return this.activePlan.items.find((item) => item.status === 'in_progress') || null;
  }

  /**
   * Get progress statistics
   */
  get progress(): { completed: number; total: number; percentage: number } {
    if (!this.activePlan) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const total = this.activePlan.items.length;
    const completed = this.activePlan.items.filter(
      (item) => item.status === 'completed'
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  /**
   * Check if there's an active plan
   */
  get hasActivePlan(): boolean {
    return this.activePlan !== null && this.activePlan.status === 'active';
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
  }
}
