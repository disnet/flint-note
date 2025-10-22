<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import type { WorkflowListItem, WorkflowStatus } from '../../../server/types/workflow';

  interface Props {
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onExecute?: (id: string) => void;
    filter?: {
      status?: WorkflowStatus | 'all';
      type?: 'workflow' | 'backlog' | 'all';
      search?: string;
    };
  }

  let { selectedId = null, onSelect, onExecute, filter = {} }: Props = $props();

  // Filter workflows based on props
  const filteredWorkflows = $derived.by((): WorkflowListItem[] => {
    let result = workflowStore.workflows;

    // Filter by status
    if (filter.status && filter.status !== 'all') {
      result = result.filter((w) => w.status === filter.status);
    }

    // Filter by type
    if (filter.type && filter.type !== 'all') {
      result = result.filter((w) => w.type === filter.type);
    }

    // Filter by search
    if (filter.search && filter.search.trim()) {
      const searchLower = filter.search.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(searchLower) ||
          w.purpose.toLowerCase().includes(searchLower)
      );
    }

    return result;
  });

  function handleSelect(workflow: WorkflowListItem): void {
    onSelect?.(workflow.id);
  }

  function handleExecute(workflow: WorkflowListItem, event: Event): void {
    event.stopPropagation();
    onExecute?.(workflow.id);
  }

  function getStatusBadgeClass(status: WorkflowStatus): string {
    switch (status) {
      case 'active':
        return 'badge-active';
      case 'paused':
        return 'badge-paused';
      case 'completed':
        return 'badge-completed';
      case 'archived':
        return 'badge-archived';
      default:
        return '';
    }
  }

  function getDueInfoBadgeClass(dueInfo?: WorkflowListItem['dueInfo']): string {
    if (!dueInfo) return '';
    switch (dueInfo.type) {
      case 'overdue':
        return 'badge-overdue';
      case 'due_now':
        return 'badge-due-now';
      case 'upcoming':
        return 'badge-upcoming';
      default:
        return '';
    }
  }
</script>

<div class="workflow-list">
  {#if workflowStore.loading}
    <div class="loading">Loading workflows...</div>
  {:else if workflowStore.error}
    <div class="error">
      <p>Error loading workflows:</p>
      <p>{workflowStore.error}</p>
    </div>
  {:else if filteredWorkflows.length === 0}
    <div class="empty-state">
      <p>No workflows found</p>
      {#if filter.search}
        <p class="empty-hint">Try adjusting your search or filters</p>
      {:else}
        <p class="empty-hint">Create a workflow to get started</p>
      {/if}
    </div>
  {:else}
    <div class="workflow-items">
      {#each filteredWorkflows as workflow (workflow.id)}
        <div
          class="workflow-item"
          class:selected={workflow.id === selectedId}
          onclick={() => handleSelect(workflow)}
        >
          <div class="workflow-header">
            <div class="workflow-name-row">
              <h3 class="workflow-name">{workflow.name}</h3>
              <div class="badges">
                {#if workflow.dueInfo}
                  <span class="badge {getDueInfoBadgeClass(workflow.dueInfo)}">
                    {workflow.dueInfo.type === 'overdue'
                      ? 'Overdue'
                      : workflow.dueInfo.type === 'due_now'
                        ? 'Due'
                        : 'Upcoming'}
                  </span>
                {/if}
                <span class="badge {getStatusBadgeClass(workflow.status)}">
                  {workflow.status}
                </span>
                {#if workflow.type === 'backlog'}
                  <span class="badge badge-backlog">Backlog</span>
                {/if}
              </div>
            </div>
          </div>

          <p class="workflow-purpose">{workflow.purpose}</p>

          <div class="workflow-footer">
            <div class="workflow-info">
              {#if workflow.isRecurring}
                <span class="info-badge recurring">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"
                    />
                  </svg>
                  {workflow.dueInfo?.recurringSchedule || 'Recurring'}
                </span>
              {:else if workflow.dueInfo?.dueDate}
                <span class="info-badge">
                  {workflowStore.formatDueDate(workflow.dueInfo)}
                </span>
              {/if}

              {#if workflow.lastCompleted}
                <span class="info-badge last-completed">
                  Last: {workflowStore.formatRelativeTime(workflow.lastCompleted)}
                </span>
              {/if}
            </div>

            {#if onExecute}
              <button
                class="btn-execute"
                onclick={(e) => handleExecute(workflow, e)}
                title="Execute workflow"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Execute
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .workflow-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .loading,
  .error,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary, #666);
  }

  .error {
    color: var(--error, #e53e3e);
  }

  .empty-hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .workflow-items {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem;
  }

  .workflow-item {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e2e8f0);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .workflow-item:hover {
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .workflow-item.selected {
    border-color: var(--primary, #3b82f6);
    background: var(--surface-hover, #f7fafc);
  }

  .workflow-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .workflow-name-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .workflow-name {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary, #1a202c);
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .badge-active {
    background: var(--success-bg, #d4edda);
    color: var(--success-text, #155724);
  }

  .badge-paused {
    background: var(--warning-bg, #fff3cd);
    color: var(--warning-text, #856404);
  }

  .badge-completed {
    background: var(--info-bg, #d1ecf1);
    color: var(--info-text, #0c5460);
  }

  .badge-archived {
    background: var(--muted-bg, #e2e8f0);
    color: var(--muted-text, #718096);
  }

  .badge-backlog {
    background: var(--purple-bg, #e9d8fd);
    color: var(--purple-text, #553c9a);
  }

  .badge-overdue {
    background: var(--error-bg, #fed7d7);
    color: var(--error-text, #c53030);
  }

  .badge-due-now {
    background: var(--warning-bg, #fef3c7);
    color: var(--warning-text, #92400e);
  }

  .badge-upcoming {
    background: var(--info-bg, #bfdbfe);
    color: var(--info-text, #1e40af);
  }

  .workflow-purpose {
    font-size: 0.875rem;
    color: var(--text-secondary, #4a5568);
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }

  .workflow-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .workflow-info {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .info-badge {
    font-size: 0.75rem;
    color: var(--text-tertiary, #718096);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .info-badge.recurring {
    color: var(--primary, #3b82f6);
    font-weight: 500;
  }

  .info-badge.last-completed {
    color: var(--text-tertiary, #718096);
  }

  .btn-execute {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    background: var(--primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-execute:hover {
    background: var(--primary-dark, #2563eb);
  }

  .btn-execute:active {
    transform: translateY(1px);
  }
</style>
