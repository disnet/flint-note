<script lang="ts">
  /**
   * Automerge Routine Start Panel Component
   *
   * Quick access panel for routines in the chat panel.
   * Shows due routines and allows starting them.
   */
  import { getRoutinesDueNow, getUpcomingRoutines } from '../lib/automerge';
  import type { RoutineListItem } from '../lib/automerge/types';

  interface Props {
    onSelectRoutine?: (routineId: string) => void;
    onClose?: () => void;
  }

  let { onSelectRoutine, onClose }: Props = $props();

  const dueNow = $derived(getRoutinesDueNow());
  const upcoming = $derived(
    getUpcomingRoutines(7).filter((r) => r.dueInfo?.type === 'upcoming')
  );

  function handleSelectRoutine(routine: RoutineListItem): void {
    onSelectRoutine?.(routine.id);
  }

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
</script>

<div class="routine-start-panel">
  <div class="panel-header">
    <h3>Start a Routine</h3>
    {#if onClose}
      <button class="btn-close" onclick={onClose}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/if}
  </div>

  <div class="panel-content">
    {#if dueNow.length === 0 && upcoming.length === 0}
      <div class="empty-state">
        <p>No routines are due right now.</p>
        <p class="hint">Create routines in the Routines view to see them here.</p>
      </div>
    {:else}
      {#if dueNow.length > 0}
        <div class="section">
          <h4>
            <span class="indicator due"></span>
            Due Now ({dueNow.length})
          </h4>
          <div class="routine-list">
            {#each dueNow as routine (routine.id)}
              <button class="routine-item" onclick={() => handleSelectRoutine(routine)}>
                <div class="routine-info">
                  <span class="routine-name">{routine.name}</span>
                  <span class="routine-purpose">{routine.purpose}</span>
                </div>
                <div class="routine-meta">
                  {#if routine.dueInfo?.recurringSchedule}
                    <span class="schedule">{routine.dueInfo.recurringSchedule}</span>
                  {/if}
                  {#if routine.lastCompleted}
                    <span class="last-run"
                      >Last: {formatRelativeTime(routine.lastCompleted)}</span
                    >
                  {:else}
                    <span class="last-run">Never run</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if upcoming.length > 0}
        <div class="section">
          <h4>
            <span class="indicator upcoming"></span>
            Upcoming ({upcoming.length})
          </h4>
          <div class="routine-list">
            {#each upcoming as routine (routine.id)}
              <button class="routine-item" onclick={() => handleSelectRoutine(routine)}>
                <div class="routine-info">
                  <span class="routine-name">{routine.name}</span>
                  <span class="routine-purpose">{routine.purpose}</span>
                </div>
                <div class="routine-meta">
                  {#if routine.dueInfo?.recurringSchedule}
                    <span class="schedule">{routine.dueInfo.recurringSchedule}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .routine-start-panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-light);
    max-height: 400px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .btn-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .btn-close:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .empty-state {
    text-align: center;
    padding: 1rem;
    color: var(--text-muted);
  }

  .empty-state p {
    margin: 0;
  }

  .empty-state .hint {
    font-size: 0.8125rem;
    margin-top: 0.5rem;
  }

  .section {
    margin-bottom: 1rem;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section h4 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .indicator.due {
    background: var(--warning);
  }

  .indicator.upcoming {
    background: var(--accent-primary);
  }

  .routine-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .routine-item {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .routine-item:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .routine-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .routine-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .routine-purpose {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .routine-meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .schedule {
    color: var(--accent-primary);
    font-weight: 500;
  }
</style>
