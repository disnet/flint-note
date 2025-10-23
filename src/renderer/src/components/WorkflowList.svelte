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
      <p>No routines found</p>
      {#if filter.search}
        <p class="empty-hint">Try adjusting your search or filters</p>
      {:else}
        <p class="empty-hint">Create a routine to get started</p>
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
    color: var(--text-muted);
  }

  .error {
    color: var(--error);
  }

  .empty-hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    color: var(--text-muted);
  }

  .workflow-items {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem;
  }

  .workflow-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .workflow-item:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 8px var(--shadow-medium);
    background: var(--bg-tertiary);
  }

  .workflow-item.selected {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
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
    color: var(--text-primary);
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
    border: 1px solid;
  }

  .badge-active {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border-color: #22c55e;
  }

  .badge-paused {
    background: rgba(251, 191, 36, 0.15);
    color: var(--warning);
    border-color: var(--warning);
  }

  .badge-completed {
    background: rgba(59, 130, 246, 0.15);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .badge-archived {
    background: rgba(156, 163, 175, 0.15);
    color: var(--text-muted);
    border-color: var(--border-medium);
  }

  .badge-backlog {
    background: rgba(168, 85, 247, 0.15);
    color: #a855f7;
    border-color: #a855f7;
  }

  .badge-overdue {
    background: rgba(239, 68, 68, 0.15);
    color: var(--error);
    border-color: var(--error);
  }

  .badge-due-now {
    background: rgba(251, 191, 36, 0.15);
    color: var(--warning);
    border-color: var(--warning);
  }

  .badge-upcoming {
    background: rgba(59, 130, 246, 0.15);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .workflow-purpose {
    font-size: 0.875rem;
    color: var(--text-secondary);
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
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .info-badge.recurring {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .info-badge.last-completed {
    color: var(--text-muted);
  }

  .btn-execute {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    background: var(--accent-primary);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-execute:hover {
    background: var(--accent-hover);
  }

  .btn-execute:active {
    transform: translateY(1px);
  }
</style>
