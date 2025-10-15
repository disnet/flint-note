<script lang="ts">
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

  let { plan }: { plan: TodoPlan | null } = $props();
  let isExpanded = $state(false);

  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  function getStatusIcon(status: TodoItem['status']): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'in_progress':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '⏳';
    }
  }

  const progress = $derived.by(() => {
    if (!plan) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const total = plan.items.length;
    const completed = plan.items.filter((item) => item.status === 'completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  });

  const currentTodo = $derived.by(() => {
    if (!plan) return null;
    return plan.items.find((item) => item.status === 'in_progress') || null;
  });

  const summaryText = $derived.by(() => {
    if (!plan) return '';
    const { completed, total } = progress;
    return `${completed}/${total} tasks completed`;
  });

  const overallStatus = $derived.by(() => {
    if (!plan) return 'pending';
    if (plan.status === 'completed') return 'completed';
    if (plan.items.some((item) => item.status === 'failed')) return 'error';
    if (currentTodo) return 'in_progress';
    return 'pending';
  });

  function getOverallIcon(): string {
    switch (overallStatus) {
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      case 'in_progress':
        return '⚙️';
      default:
        return '📋';
    }
  }
</script>

{#if plan}
  <div class="todo-plan" class:expanded={isExpanded}>
    <button class="plan-header" onclick={toggleExpanded}>
      <div class="plan-info">
        <span class="plan-icon">{getOverallIcon()}</span>
        <div class="plan-text">
          <div class="plan-title">{plan.goal}</div>
          <div class="plan-summary">{summaryText}</div>
        </div>
      </div>
      <div class="plan-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress.percentage}%"></div>
        </div>
        <span class="expand-icon" class:rotated={isExpanded}>▼</span>
      </div>
    </button>

    {#if isExpanded}
      <div class="plan-details">
        {#each plan.items as todo (todo.id)}
          <div
            class="todo-item"
            class:active={todo.status === 'in_progress'}
            class:error={todo.status === 'failed'}
          >
            <div class="todo-header">
              <span class="todo-status-icon">{getStatusIcon(todo.status)}</span>
              <span class="todo-content">
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </div>

            {#if todo.error}
              <div class="todo-error">
                <span class="error-label">Error:</span>
                <span class="error-text">{todo.error}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .todo-plan {
    background: var(--tool-call-bg, #f8f9fa);
    border: 1px solid var(--tool-call-border, #e9ecef);
    border-radius: 8px;
    margin: 0.5rem 0;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .todo-plan:hover {
    border-color: var(--tool-call-border-hover, #dee2e6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .plan-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.2s ease;
    gap: 1rem;
  }

  .plan-header:hover {
    background: var(--tool-call-header-hover, #f1f3f4);
  }

  .plan-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .plan-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .plan-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .plan-title {
    font-weight: 600;
    color: var(--tool-name-color, #495057);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .plan-summary {
    font-size: 0.75rem;
    color: var(--text-secondary, #6c757d);
    font-weight: 400;
  }

  .plan-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .progress-bar {
    width: 60px;
    height: 6px;
    background: var(--bg-tertiary, #e9ecef);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #007bff);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
    color: var(--expand-icon-color, #6c757d);
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .plan-details {
    border-top: 1px solid var(--tool-call-border, #e9ecef);
    padding: 0.75rem;
    background: var(--tool-call-details-bg, #ffffff);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .todo-item {
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary, #f8f9fa);
    border: 1px solid var(--border-light, #e9ecef);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .todo-item.active {
    border-color: var(--accent-primary, #007bff);
    background: var(--accent-bg-light, #e7f3ff);
    animation: pulse-active 2s ease-in-out infinite;
  }

  .todo-item.error {
    border-color: var(--error-border, #f5c2c7);
    background: var(--error-bg-light, #fff5f5);
  }

  @keyframes pulse-active {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.85;
    }
  }

  .todo-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .todo-status-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .todo-content {
    font-size: 0.8125rem;
    color: var(--text-primary, #212529);
    line-height: 1.4;
  }

  .todo-error {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--error-content-bg, #f8d7da);
    border: 1px solid var(--error-content-border, #f5c2c7);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .error-label {
    font-weight: 600;
    color: var(--error-content-text, #721c24);
    margin-right: 0.25rem;
  }

  .error-text {
    color: var(--error-content-text, #721c24);
  }
</style>
