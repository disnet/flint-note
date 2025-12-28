<script lang="ts">
  /**
   * Dashboard Card for Due/Upcoming Routines
   *
   * Displays a prominent card for routines that need attention with inline actions.
   */
  import type { RoutineListItem } from '../lib/automerge/types';

  interface Props {
    routine: RoutineListItem;
    variant: 'due' | 'upcoming';
    onStart: (id: string) => void;
    onEdit: (id: string) => void;
    onClick: (id: string) => void;
  }

  let { routine, variant, onStart, onEdit, onClick }: Props = $props();

  function handleCardClick(): void {
    onClick(routine.id);
  }

  function handleStartClick(event: MouseEvent): void {
    event.stopPropagation();
    onStart(routine.id);
  }

  function handleEditClick(event: MouseEvent): void {
    event.stopPropagation();
    onEdit(routine.id);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(routine.id);
    }
  }

  function formatDueInfo(): string {
    if (!routine.dueInfo?.dueDate) {
      return routine.dueInfo?.recurringSchedule || '';
    }

    const date = new Date(routine.dueInfo.dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 0) {
      const overdueDays = Math.abs(diffDays);
      const overdueHours = Math.abs(diffHours);
      if (overdueDays >= 1) return `${overdueDays}d overdue`;
      return `${overdueHours}h overdue`;
    }
    if (diffHours === 0) return 'Due now';
    if (diffHours < 24) return `In ${diffHours}h`;
    if (diffDays === 1) return 'Tomorrow';
    return `In ${diffDays} days`;
  }

  function getScheduleInfo(): string {
    if (routine.isRecurring && routine.dueInfo?.recurringSchedule) {
      return routine.dueInfo.recurringSchedule;
    }
    return '';
  }
</script>

<div
  class="dashboard-card"
  class:variant-due={variant === 'due'}
  class:variant-upcoming={variant === 'upcoming'}
  role="button"
  tabindex="0"
  onclick={handleCardClick}
  onkeydown={handleKeydown}
>
  <div class="card-main">
    <div class="card-info">
      <h4 class="routine-name">{routine.name}</h4>
      <div class="routine-meta">
        <span class="due-text">{formatDueInfo()}</span>
        {#if getScheduleInfo()}
          <span class="schedule-text">{getScheduleInfo()}</span>
        {/if}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn-start" onclick={handleStartClick} title="Start routine">
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
        Start
      </button>
      <button class="btn-edit" onclick={handleEditClick} title="Edit routine">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .dashboard-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    cursor: pointer;
    transition: all 0.2s;
    border-left: 3px solid transparent;
  }

  .dashboard-card:hover {
    background: var(--bg-tertiary);
    box-shadow: 0 2px 8px var(--shadow-medium);
  }

  .dashboard-card.variant-due {
    border-left-color: var(--error, #ef4444);
  }

  .dashboard-card.variant-upcoming {
    border-left-color: var(--accent-primary, #3b82f6);
  }

  .card-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .card-info {
    flex: 1;
    min-width: 0;
  }

  .routine-name {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0 0 0.25rem 0;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .routine-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8125rem;
  }

  .due-text {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .variant-due .due-text {
    color: var(--error, #ef4444);
  }

  .schedule-text {
    color: var(--text-muted);
  }

  .schedule-text::before {
    content: '\2022';
    margin-right: 0.75rem;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn-start {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    background: var(--accent-primary);
    color: var(--text-on-accent);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-start:hover {
    background: var(--accent-hover);
  }

  .btn-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-edit:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }
</style>
