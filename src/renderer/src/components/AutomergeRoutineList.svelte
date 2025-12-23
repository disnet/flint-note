<script lang="ts">
  /**
   * Automerge Routine List Component
   *
   * Displays a list of routines with filtering, status badges, and due indicators.
   */
  import { getRoutineListItems } from '../lib/automerge';
  import type {
    RoutineListItem,
    AgentRoutineStatus,
    AgentRoutineType
  } from '../lib/automerge/types';

  interface Props {
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onExecute?: (id: string) => void;
    filter?: {
      status?: AgentRoutineStatus | 'all';
      type?: AgentRoutineType | 'all';
      search?: string;
    };
  }

  let { selectedId = null, onSelect, onExecute, filter = {} }: Props = $props();

  // Filter routines based on props
  const filteredRoutines = $derived.by((): RoutineListItem[] => {
    let result = getRoutineListItems({
      status: filter.status === 'all' ? undefined : filter.status,
      type: filter.type === 'all' ? undefined : filter.type
    });

    // Filter by search
    if (filter.search?.trim()) {
      const searchLower = filter.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.purpose.toLowerCase().includes(searchLower)
      );
    }

    return result;
  });

  function handleSelect(routine: RoutineListItem): void {
    onSelect?.(routine.id);
  }

  function handleExecute(routine: RoutineListItem, event: Event): void {
    event.stopPropagation();
    onExecute?.(routine.id);
  }

  function handleKeydown(routine: RoutineListItem, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(routine);
    }
  }

  function getStatusBadgeClass(status: AgentRoutineStatus): string {
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

  function getDueInfoBadgeClass(dueInfo?: RoutineListItem['dueInfo']): string {
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

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function formatDueDate(dueInfo: RoutineListItem['dueInfo']): string {
    if (!dueInfo?.dueDate) return '';
    const date = new Date(dueInfo.dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays}d`;
    return date.toLocaleDateString();
  }
</script>

<div class="routine-list">
  {#if filteredRoutines.length === 0}
    <div class="empty-state">
      <p>No routines found</p>
      {#if filter.search}
        <p class="empty-hint">Try adjusting your search or filters</p>
      {:else}
        <p class="empty-hint">Create a routine to get started</p>
      {/if}
    </div>
  {:else}
    <div class="routine-items">
      {#each filteredRoutines as routine (routine.id)}
        <div
          class="routine-item"
          class:selected={routine.id === selectedId}
          role="button"
          tabindex="0"
          onclick={() => handleSelect(routine)}
          onkeydown={(e) => handleKeydown(routine, e)}
        >
          <div class="routine-header">
            <div class="routine-name-row">
              <h3 class="routine-name">{routine.name}</h3>
              <div class="badges">
                {#if routine.dueInfo}
                  <span class="badge {getDueInfoBadgeClass(routine.dueInfo)}">
                    {routine.dueInfo.type === 'overdue'
                      ? 'Overdue'
                      : routine.dueInfo.type === 'due_now'
                        ? 'Due'
                        : 'Upcoming'}
                  </span>
                {/if}
                <span class="badge {getStatusBadgeClass(routine.status)}">
                  {routine.status}
                </span>
                {#if routine.type === 'backlog'}
                  <span class="badge badge-backlog">Backlog</span>
                {/if}
              </div>
            </div>
          </div>

          <p class="routine-purpose">{routine.purpose}</p>

          <div class="routine-footer">
            <div class="routine-info">
              {#if routine.isRecurring}
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
                  {routine.dueInfo?.recurringSchedule || 'Recurring'}
                </span>
              {:else if routine.dueInfo?.dueDate}
                <span class="info-badge">
                  {formatDueDate(routine.dueInfo)}
                </span>
              {/if}

              {#if routine.lastCompleted}
                <span class="info-badge last-completed">
                  Last: {formatRelativeTime(routine.lastCompleted)}
                </span>
              {/if}
            </div>

            {#if onExecute}
              <button
                class="btn-execute"
                onclick={(e) => handleExecute(routine, e)}
                title="Execute routine"
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
  .routine-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    color: var(--text-muted);
  }

  .routine-items {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem;
  }

  .routine-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .routine-item:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 8px var(--shadow-medium);
    background: var(--bg-tertiary);
  }

  .routine-item.selected {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .routine-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .routine-name-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    flex-wrap: wrap;
  }

  .routine-name {
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

  .routine-purpose {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }

  .routine-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .routine-info {
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
