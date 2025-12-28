<script lang="ts">
  /**
   * Compact Routine List Component
   *
   * Displays routines in a simplified single-line format for the dashboard.
   */
  import type { RoutineListItem } from '../lib/automerge/types';

  interface Props {
    routines: RoutineListItem[];
    onSelect: (id: string) => void;
    onExecute: (id: string) => void;
  }

  let { routines, onSelect, onExecute }: Props = $props();

  function handleItemClick(id: string): void {
    onSelect(id);
  }

  function handleExecuteClick(id: string, event: MouseEvent): void {
    event.stopPropagation();
    onExecute(id);
  }

  function handleKeydown(id: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  }

  function getScheduleText(routine: RoutineListItem): string {
    if (routine.isRecurring && routine.dueInfo?.recurringSchedule) {
      return routine.dueInfo.recurringSchedule;
    }
    if (routine.dueInfo?.dueDate) {
      return formatDueDate(routine.dueInfo.dueDate);
    }
    if (routine.type === 'backlog') {
      return 'Backlog';
    }
    return 'On-demand';
  }

  function formatDueDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays}d`;
    return date.toLocaleDateString();
  }

  function getDueClass(routine: RoutineListItem): string {
    if (!routine.dueInfo) return '';
    switch (routine.dueInfo.type) {
      case 'overdue':
        return 'due-overdue';
      case 'due_now':
        return 'due-now';
      case 'upcoming':
        return 'due-upcoming';
      default:
        return '';
    }
  }
</script>

<div class="compact-list">
  {#if routines.length === 0}
    <div class="empty-state">
      <p>No routines found</p>
    </div>
  {:else}
    {#each routines as routine (routine.id)}
      <div
        class="compact-item"
        role="button"
        tabindex="0"
        onclick={() => handleItemClick(routine.id)}
        onkeydown={(e) => handleKeydown(routine.id, e)}
      >
        <div class="item-content">
          <span class="item-name">{routine.name}</span>
          <span class="item-schedule {getDueClass(routine)}"
            >{getScheduleText(routine)}</span
          >
        </div>
        <button
          class="btn-execute"
          onclick={(e) => handleExecuteClick(routine.id, e)}
          title="Execute routine"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .compact-list {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .compact-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .compact-item:hover {
    background: var(--bg-tertiary);
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .item-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-schedule {
    font-size: 0.8125rem;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .item-schedule.due-overdue {
    color: var(--error, #ef4444);
    font-weight: 500;
  }

  .item-schedule.due-now {
    color: var(--warning, #f59e0b);
    font-weight: 500;
  }

  .item-schedule.due-upcoming {
    color: var(--accent-primary, #3b82f6);
  }

  .btn-execute {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: var(--accent-primary);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.2s;
  }

  .compact-item:hover .btn-execute {
    opacity: 1;
  }

  .btn-execute:hover {
    background: var(--accent-hover);
  }

  .btn-execute:focus {
    opacity: 1;
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
</style>
