<script lang="ts">
  /**
   * Automerge Routine Detail Component
   *
   * Displays full details of a routine including materials and completion history.
   */
  import { getRoutine, getNote, deleteRoutine } from '../lib/automerge';
  import type { AgentRoutine, SupplementaryMaterial } from '../lib/automerge/types';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  interface Props {
    routineId: string;
    onEdit?: (routine: AgentRoutine) => void;
    onExecute?: (routineId: string) => void;
    onDelete?: (routineId: string) => void;
  }

  let { routineId, onEdit, onExecute, onDelete }: Props = $props();

  let showConfirmDelete = $state(false);

  const routine = $derived(getRoutine(routineId));

  function handleEdit(): void {
    if (routine) {
      onEdit?.(routine);
    }
  }

  function handleExecute(): void {
    onExecute?.(routineId);
  }

  function handleDelete(): void {
    if (!showConfirmDelete) {
      showConfirmDelete = true;
      return;
    }

    deleteRoutine(routineId);
    onDelete?.(routineId);
    showConfirmDelete = false;
  }

  function cancelDelete(): void {
    showConfirmDelete = false;
  }

  function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function getMaterialNoteTitle(material: SupplementaryMaterial): string | null {
    if (material.materialType === 'note_reference' && material.noteId) {
      const note = getNote(material.noteId);
      return note?.title || material.noteId;
    }
    return null;
  }

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
</script>

<div class="routine-detail">
  {#if !routine}
    <div class="error">
      <p>Routine not found: {routineId}</p>
    </div>
  {:else}
    <div class="detail-content">
      <div class="detail-section">
        <div class="title-row">
          <h3>{routine.name}</h3>
          <div class="status-badges">
            <span class="badge badge-{routine.status}">{routine.status}</span>
            {#if routine.type === 'backlog'}
              <span class="badge badge-backlog">Backlog</span>
            {/if}
          </div>
        </div>
        <p class="purpose">{routine.purpose}</p>
      </div>

      <div class="detail-section">
        <h4>Description</h4>
        <div class="description">
          <MarkdownRenderer text={routine.description} />
        </div>
      </div>

      {#if routine.recurringSpec}
        <div class="detail-section">
          <h4>Schedule</h4>
          <div class="schedule-info">
            <span class="info-item">
              <strong>Frequency:</strong>
              {routine.recurringSpec.frequency}
            </span>
            {#if routine.recurringSpec.dayOfWeek !== undefined}
              <span class="info-item">
                <strong>Day:</strong>
                {dayNames[routine.recurringSpec.dayOfWeek]}
              </span>
            {/if}
            {#if routine.recurringSpec.dayOfMonth}
              <span class="info-item">
                <strong>Day of Month:</strong>
                {routine.recurringSpec.dayOfMonth}
              </span>
            {/if}
            {#if routine.recurringSpec.time}
              <span class="info-item">
                <strong>Time:</strong>
                {routine.recurringSpec.time}
              </span>
            {/if}
          </div>
        </div>
      {:else if routine.dueDate}
        <div class="detail-section">
          <h4>Due Date</h4>
          <p>{formatDateTime(routine.dueDate)}</p>
        </div>
      {/if}

      {#if routine.lastCompleted}
        <div class="detail-section">
          <h4>Last Completed</h4>
          <p>{formatDateTime(routine.lastCompleted)}</p>
        </div>
      {/if}

      {#if routine.supplementaryMaterials && routine.supplementaryMaterials.length > 0}
        <div class="detail-section">
          <h4>Supplementary Materials ({routine.supplementaryMaterials.length})</h4>
          <div class="materials">
            {#each routine.supplementaryMaterials as material (material.id)}
              <div class="material-item">
                <div class="material-header">
                  <span class="material-type">{material.materialType}</span>
                  {#if material.metadata?.description}
                    <span class="material-description"
                      >{material.metadata.description}</span
                    >
                  {/if}
                </div>
                {#if material.content}
                  <div class="material-content">
                    {#if material.materialType === 'code'}
                      <pre><code>{material.content}</code></pre>
                    {:else}
                      <p>{material.content}</p>
                    {/if}
                  </div>
                {:else if material.materialType === 'note_reference'}
                  <div class="material-content note-ref">
                    <span class="note-icon">📝</span>
                    <span>{getMaterialNoteTitle(material)}</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if routine.completionHistory && routine.completionHistory.length > 0}
        <div class="detail-section">
          <h4>Completion History ({routine.completionHistory.length})</h4>
          <div class="history">
            {#each routine.completionHistory
              .slice()
              .reverse()
              .slice(0, 10) as completion (completion.id)}
              <div class="history-item">
                <span class="history-date">{formatDateTime(completion.completedAt)}</span>
                {#if completion.notes}
                  <p class="history-notes">{completion.notes}</p>
                {/if}
                {#if completion.metadata?.durationMs}
                  <span class="history-duration">
                    Duration: {Math.round(completion.metadata.durationMs / 1000)}s
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="detail-section timestamps">
        <span>Created: {formatDateTime(routine.created)}</span>
        <span>Updated: {formatDateTime(routine.updated)}</span>
      </div>

      <div class="detail-actions">
        {#if onExecute}
          <button class="btn btn-primary" onclick={handleExecute}>
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
        {#if onEdit}
          <button class="btn btn-secondary" onclick={handleEdit}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
        {/if}
        {#if onDelete}
          {#if showConfirmDelete}
            <button class="btn btn-danger" onclick={handleDelete}>Confirm Delete</button>
            <button class="btn btn-secondary" onclick={cancelDelete}>Cancel</button>
          {:else}
            <button class="btn btn-danger-outline" onclick={handleDelete}>Delete</button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .routine-detail {
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  .error {
    color: var(--error);
    padding: 1rem;
    text-align: center;
  }

  .detail-content {
    flex: 1;
  }

  .detail-section {
    margin-bottom: 1.5rem;
  }

  .detail-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .title-row h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .status-badges {
    display: flex;
    gap: 0.5rem;
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

  .purpose {
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .description {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    line-height: 1.6;
  }

  .schedule-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-item {
    font-size: 0.875rem;
  }

  .info-item strong {
    color: var(--text-muted);
  }

  .materials {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .material-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .material-header {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .material-type {
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--accent-primary);
    background: rgba(59, 130, 246, 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .material-description {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .material-content {
    font-size: 0.875rem;
  }

  .material-content pre {
    background: var(--bg-tertiary);
    padding: 0.75rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0;
  }

  .material-content code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .note-ref {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--accent-primary);
  }

  .history {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-item {
    background: var(--bg-secondary);
    border-radius: 6px;
    padding: 0.75rem;
    font-size: 0.875rem;
  }

  .history-date {
    font-weight: 500;
  }

  .history-notes {
    margin: 0.25rem 0 0 0;
    color: var(--text-secondary);
  }

  .history-duration {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .timestamps {
    display: flex;
    gap: 1.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .detail-actions {
    display: flex;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-on-accent);
    border: none;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-medium);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
  }

  .btn-danger {
    background: var(--error);
    color: white;
    border: none;
  }

  .btn-danger-outline {
    background: transparent;
    color: var(--error);
    border: 1px solid var(--error);
  }

  .btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.1);
  }
</style>
