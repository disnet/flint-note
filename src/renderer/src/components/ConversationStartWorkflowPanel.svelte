<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import type { WorkflowListItem } from '../../../server/types/workflow';

  interface Props {
    onExecuteWorkflow?: (workflowId: string, workflowName: string) => void;
    onViewAll?: () => void;
  }

  let { onExecuteWorkflow, onViewAll }: Props = $props();

  // Load workflows on mount
  $effect(() => {
    workflowStore.initialize().catch(console.error);
  });

  function handleExecute(workflow: WorkflowListItem): void {
    onExecuteWorkflow?.(workflow.id, workflow.name);
  }

  // Check if there are any workflows to show
  const hasWorkflows = $derived(
    workflowStore.workflowsDueNow.length > 0 ||
      workflowStore.upcomingWorkflows.length > 0 ||
      workflowStore.onDemandWorkflows.length > 0
  );
</script>

{#if hasWorkflows}
  <div class="conversation-start-workflows">
    <div class="panel-header">
      <h3>Available Workflows</h3>
      {#if onViewAll}
        <button class="btn-view-all" onclick={onViewAll}> View All → </button>
      {/if}
    </div>

    {#if workflowStore.workflowsDueNow.length > 0}
      <section class="workflow-section due-now">
        <h4>Due Now</h4>
        <div class="workflow-cards">
          {#each workflowStore.workflowsDueNow as workflow (workflow.id)}
            <button class="workflow-card" onclick={() => handleExecute(workflow)}>
              <div class="card-header">
                <span class="workflow-name">{workflow.name}</span>
                <span class="badge badge-due">Due</span>
              </div>
              <p class="workflow-purpose">{workflow.purpose}</p>
              {#if workflow.lastCompleted}
                <span class="last-completed">
                  Last: {workflowStore.formatRelativeTime(workflow.lastCompleted)}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if workflowStore.upcomingWorkflows.length > 0}
      <section class="workflow-section upcoming">
        <h4>Upcoming</h4>
        <div class="workflow-cards">
          {#each workflowStore.upcomingWorkflows.slice(0, 3) as workflow (workflow.id)}
            <button class="workflow-card" onclick={() => handleExecute(workflow)}>
              <div class="card-header">
                <span class="workflow-name">{workflow.name}</span>
                {#if workflow.dueInfo}
                  <span class="badge badge-upcoming">
                    {workflowStore.formatDueDate(workflow.dueInfo)}
                  </span>
                {/if}
              </div>
              <p class="workflow-purpose">{workflow.purpose}</p>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if workflowStore.onDemandWorkflows.length > 0}
      <section class="workflow-section on-demand">
        <h4>On-Demand</h4>
        <div class="workflow-cards">
          {#each workflowStore.onDemandWorkflows.slice(0, 3) as workflow (workflow.id)}
            <button class="workflow-card" onclick={() => handleExecute(workflow)}>
              <div class="card-header">
                <span class="workflow-name">{workflow.name}</span>
              </div>
              <p class="workflow-purpose">{workflow.purpose}</p>
            </button>
          {/each}
        </div>
        {#if workflowStore.onDemandWorkflows.length > 3}
          <p class="more-hint">
            +{workflowStore.onDemandWorkflows.length - 3} more on-demand workflow{workflowStore
              .onDemandWorkflows.length -
              3 >
            1
              ? 's'
              : ''}
          </p>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .conversation-start-workflows {
    padding: 1rem;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e2e8f0);
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary, #1a202c);
  }

  .btn-view-all {
    background: none;
    border: none;
    color: var(--primary, #3b82f6);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .btn-view-all:hover {
    background: var(--surface-hover, #f7fafc);
  }

  .workflow-section {
    margin-bottom: 1.5rem;
  }

  .workflow-section:last-child {
    margin-bottom: 0;
  }

  .workflow-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary, #4a5568);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .workflow-section.due-now h4 {
    color: var(--error, #e53e3e);
  }

  .workflow-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }

  .workflow-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.875rem;
    background: var(--surface-secondary, #f7fafc);
    border: 1px solid var(--border, #e2e8f0);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .workflow-card:hover {
    border-color: var(--primary, #3b82f6);
    background: var(--surface, #fff);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .workflow-card:active {
    transform: translateY(0);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .workflow-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary, #1a202c);
  }

  .badge {
    font-size: 0.6875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge-due {
    background: var(--error-bg, #fed7d7);
    color: var(--error-text, #c53030);
  }

  .badge-upcoming {
    background: var(--info-bg, #bfdbfe);
    color: var(--info-text, #1e40af);
  }

  .workflow-purpose {
    font-size: 0.8125rem;
    color: var(--text-secondary, #4a5568);
    line-height: 1.5;
    margin: 0 0 0.5rem 0;
    flex: 1;
  }

  .last-completed {
    font-size: 0.75rem;
    color: var(--text-tertiary, #718096);
  }

  .more-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-tertiary, #718096);
    text-align: center;
  }
</style>
