<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import type { Workflow } from '../../../server/types/workflow';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  interface Props {
    workflowId: string;
    onClose?: () => void;
    onEdit?: (workflow: Workflow) => void;
    onExecute?: (workflowId: string) => void;
    onDelete?: (workflowId: string) => void;
  }

  let { workflowId, onClose, onEdit, onExecute, onDelete }: Props = $props();

  let workflow = $state<Workflow | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let showConfirmDelete = $state(false);

  // Load workflow details when workflowId changes
  $effect(() => {
    loadWorkflow();
  });

  async function loadWorkflow(): Promise<void> {
    loading = true;
    error = null;
    try {
      workflow = await workflowStore.getWorkflow({
        workflowId,
        includeSupplementaryMaterials: true,
        includeCompletionHistory: true,
        completionHistoryLimit: 10
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load workflow';
      console.error('Failed to load workflow:', err);
    } finally {
      loading = false;
    }
  }

  function handleEdit(): void {
    if (workflow) {
      onEdit?.(workflow);
    }
  }

  function handleExecute(): void {
    onExecute?.(workflowId);
  }

  function handleDelete(): void {
    if (!showConfirmDelete) {
      showConfirmDelete = true;
      return;
    }

    onDelete?.(workflowId);
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
</script>

<div class="workflow-detail">
  <div class="detail-header">
    <h2>Workflow Details</h2>
    {#if onClose}
      <button class="btn-close" onclick={onClose} title="Close">
        <svg
          width="20"
          height="20"
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

  {#if loading}
    <div class="loading">Loading workflow details...</div>
  {:else if error}
    <div class="error">
      <p>Error loading workflow:</p>
      <p>{error}</p>
      <button class="btn-retry" onclick={loadWorkflow}>Retry</button>
    </div>
  {:else if workflow}
    <div class="detail-content">
      <div class="detail-section">
        <div class="title-row">
          <h3>{workflow.name}</h3>
          <div class="status-badges">
            <span class="badge badge-{workflow.status}">{workflow.status}</span>
            {#if workflow.type === 'backlog'}
              <span class="badge badge-backlog">Backlog</span>
            {/if}
          </div>
        </div>
        <p class="purpose">{workflow.purpose}</p>
      </div>

      <div class="detail-section">
        <h4>Description</h4>
        <div class="description">
          <MarkdownRenderer text={workflow.description} />
        </div>
      </div>

      {#if workflow.recurringSpec}
        <div class="detail-section">
          <h4>Schedule</h4>
          <div class="schedule-info">
            <span class="info-item">
              <strong>Frequency:</strong>
              {workflow.recurringSpec.frequency}
            </span>
            {#if workflow.recurringSpec.dayOfWeek !== undefined}
              <span class="info-item">
                <strong>Day:</strong>
                {[
                  'Sunday',
                  'Monday',
                  'Tuesday',
                  'Wednesday',
                  'Thursday',
                  'Friday',
                  'Saturday'
                ][workflow.recurringSpec.dayOfWeek]}
              </span>
            {/if}
            {#if workflow.recurringSpec.dayOfMonth}
              <span class="info-item">
                <strong>Day of Month:</strong>
                {workflow.recurringSpec.dayOfMonth}
              </span>
            {/if}
            {#if workflow.recurringSpec.time}
              <span class="info-item">
                <strong>Time:</strong>
                {workflow.recurringSpec.time}
              </span>
            {/if}
          </div>
        </div>
      {:else if workflow.dueDate}
        <div class="detail-section">
          <h4>Due Date</h4>
          <p>{formatDateTime(workflow.dueDate)}</p>
        </div>
      {/if}

      {#if workflow.lastCompleted}
        <div class="detail-section">
          <h4>Last Completed</h4>
          <p>{formatDateTime(workflow.lastCompleted)}</p>
        </div>
      {/if}

      {#if workflow.supplementaryMaterials && workflow.supplementaryMaterials.length > 0}
        <div class="detail-section">
          <h4>Supplementary Materials ({workflow.supplementaryMaterials.length})</h4>
          <div class="materials">
            {#each workflow.supplementaryMaterials as material (material.id)}
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
                {/if}
                {#if material.noteId}
                  <div class="material-note-ref">
                    Note reference: {material.noteId}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if workflow.completionHistory && workflow.completionHistory.length > 0}
        <div class="detail-section">
          <h4>Completion History ({workflow.completionHistory.length})</h4>
          <div class="completion-history">
            {#each workflow.completionHistory as completion (completion.id)}
              <div class="completion-item">
                <div class="completion-header">
                  <span class="completion-date"
                    >{formatDateTime(completion.completedAt)}</span
                  >
                  {#if completion.metadata?.durationMs}
                    <span class="completion-duration">
                      {(completion.metadata.durationMs / 1000).toFixed(1)}s
                    </span>
                  {/if}
                </div>
                {#if completion.notes}
                  <p class="completion-notes">{completion.notes}</p>
                {/if}
                {#if completion.outputNoteId}
                  <span class="completion-output">Output: {completion.outputNoteId}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="detail-section">
        <h4>Metadata</h4>
        <div class="metadata">
          <p><strong>ID:</strong> {workflow.id}</p>
          <p><strong>Created:</strong> {formatDateTime(workflow.createdAt)}</p>
          <p><strong>Updated:</strong> {formatDateTime(workflow.updatedAt)}</p>
          <p><strong>Vault:</strong> {workflow.vaultId}</p>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      {#if onExecute && workflow.status === 'active'}
        <button class="btn-primary" onclick={handleExecute}>
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
          Execute Workflow
        </button>
      {/if}

      {#if onEdit}
        <button class="btn-secondary" onclick={handleEdit}>Edit</button>
      {/if}

      {#if onDelete}
        <button
          class="btn-danger"
          onclick={handleDelete}
          class:confirming={showConfirmDelete}
        >
          {showConfirmDelete ? 'Confirm Delete?' : 'Delete'}
        </button>
        {#if showConfirmDelete}
          <button class="btn-secondary" onclick={cancelDelete}>Cancel</button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .workflow-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface, #fff);
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border, #e2e8f0);
  }

  .detail-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .btn-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #718096);
    padding: 0.25rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .btn-close:hover {
    background: var(--surface-hover, #f7fafc);
  }

  .loading,
  .error {
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

  .btn-retry {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .detail-section {
    margin-bottom: 1.5rem;
  }

  .detail-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .detail-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-secondary, #4a5568);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
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

  .purpose {
    font-size: 0.9375rem;
    color: var(--text-secondary, #4a5568);
    line-height: 1.5;
  }

  .description {
    padding: 1rem;
    background: var(--surface-secondary, #f7fafc);
    border-radius: 6px;
    border: 1px solid var(--border, #e2e8f0);
  }

  .schedule-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-item {
    font-size: 0.875rem;
  }

  .materials {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .material-item {
    padding: 0.75rem;
    background: var(--surface-secondary, #f7fafc);
    border-radius: 6px;
    border: 1px solid var(--border, #e2e8f0);
  }

  .material-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .material-type {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--primary-bg, #dbeafe);
    color: var(--primary-text, #1e40af);
    border-radius: 4px;
    font-weight: 500;
  }

  .material-description {
    font-size: 0.875rem;
    color: var(--text-secondary, #4a5568);
  }

  .material-content {
    font-size: 0.875rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .material-content pre {
    margin: 0;
    padding: 0.5rem;
    background: var(--code-bg, #1e293b);
    color: var(--code-text, #e2e8f0);
    border-radius: 4px;
    overflow-x: auto;
  }

  .material-note-ref {
    font-size: 0.75rem;
    color: var(--text-tertiary, #718096);
    margin-top: 0.5rem;
  }

  .completion-history {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .completion-item {
    padding: 0.75rem;
    background: var(--surface-secondary, #f7fafc);
    border-radius: 6px;
    border: 1px solid var(--border, #e2e8f0);
  }

  .completion-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .completion-date {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .completion-duration {
    font-size: 0.75rem;
    color: var(--text-secondary, #4a5568);
  }

  .completion-notes {
    font-size: 0.875rem;
    margin: 0.5rem 0 0 0;
    color: var(--text-secondary, #4a5568);
  }

  .completion-output {
    font-size: 0.75rem;
    color: var(--text-tertiary, #718096);
  }

  .metadata {
    font-size: 0.875rem;
    color: var(--text-secondary, #4a5568);
  }

  .metadata p {
    margin: 0.25rem 0;
  }

  .detail-actions {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--border, #e2e8f0);
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: var(--primary, #3b82f6);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-dark, #2563eb);
  }

  .btn-secondary {
    background: var(--surface-secondary, #f7fafc);
    color: var(--text-primary, #1a202c);
    border: 1px solid var(--border, #e2e8f0);
  }

  .btn-secondary:hover {
    background: var(--surface-hover, #edf2f7);
  }

  .btn-danger {
    background: var(--error, #e53e3e);
    color: white;
  }

  .btn-danger:hover {
    background: var(--error-dark, #c53030);
  }

  .btn-danger.confirming {
    background: var(--error-dark, #c53030);
    animation: pulse 0.5s ease-in-out;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
</style>
