<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import type { WorkflowListItem } from '../../../server/types/workflow';

  interface Props {
    onExecuteWorkflow?: (workflowId: string, workflowName: string) => void;
    onViewAll?: () => void;
    onSendMessage?: (text: string) => void;
  }

  let { onExecuteWorkflow, onViewAll, onSendMessage }: Props = $props();

  // Load workflows on mount
  $effect(() => {
    workflowStore.initialize().catch(console.error);
  });

  function handleExecute(workflow: WorkflowListItem): void {
    onExecuteWorkflow?.(workflow.id, workflow.name);
  }

  function handleCreateExampleRoutine(): void {
    onSendMessage?.(
      "Create a weekly review routine that runs every Sunday. It should summarize the past week of notes I've worked on"
    );
  }

  // Check if there are any workflows to show
  const hasWorkflows = $derived(
    workflowStore.workflowsDueNow.length > 0 ||
      workflowStore.upcomingWorkflows.length > 0 ||
      workflowStore.scheduledWorkflows.length > 0 ||
      workflowStore.onDemandWorkflows.length > 0
  );
</script>

<div class="conversation-start-workflows">
  <div class="panel-header">
    <h3>Routines</h3>
    {#if onViewAll}
      <button class="btn-view-all" onclick={onViewAll}> View All → </button>
    {/if}
  </div>

  <p class="workflow-description">
    Routines are automated agents that help you maintain and organize your notes. Below
    you'll see routines that are due now, upcoming scheduled routines, and on-demand
    routines you can run anytime.
  </p>

  {#if !hasWorkflows}
    <div class="empty-state">
      <p class="empty-message">No routines are currently available.</p>
      <p class="empty-hint">Create routines to automate note maintenance tasks.</p>
      <button class="btn-create-example" onclick={handleCreateExampleRoutine}>
        Create Example Routine
      </button>
    </div>
  {:else}
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
              <div class="workflow-tooltip">{workflow.purpose}</div>
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
              <div class="workflow-tooltip">{workflow.purpose}</div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if workflowStore.scheduledWorkflows.length > 0}
      <section class="workflow-section scheduled">
        <h4>Scheduled</h4>
        <div class="workflow-cards">
          {#each workflowStore.scheduledWorkflows.slice(0, 3) as workflow (workflow.id)}
            <button class="workflow-card" onclick={() => handleExecute(workflow)}>
              <div class="card-header">
                <span class="workflow-name">{workflow.name}</span>
                {#if workflow.dueInfo}
                  <span class="badge badge-scheduled">
                    {workflowStore.formatDueDate(workflow.dueInfo)}
                  </span>
                {/if}
              </div>
              <div class="workflow-tooltip">{workflow.purpose}</div>
            </button>
          {/each}
        </div>
        {#if workflowStore.scheduledWorkflows.length > 3}
          <p class="more-hint">
            +{workflowStore.scheduledWorkflows.length - 3} more scheduled routine{workflowStore
              .scheduledWorkflows.length -
              3 >
            1
              ? 's'
              : ''}
          </p>
        {/if}
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
              <div class="workflow-tooltip">{workflow.purpose}</div>
            </button>
          {/each}
        </div>
        {#if workflowStore.onDemandWorkflows.length > 3}
          <p class="more-hint">
            +{workflowStore.onDemandWorkflows.length - 3} more on-demand routine{workflowStore
              .onDemandWorkflows.length -
              3 >
            1
              ? 's'
              : ''}
          </p>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .conversation-start-workflows {
    padding: 1rem 0;
    background: transparent;
    margin-bottom: 1.5rem;
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
    color: var(--text-primary);
  }

  .btn-view-all {
    background: none;
    border: none;
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .btn-view-all:hover {
    background: var(--accent-light);
    color: var(--accent-hover);
  }

  .workflow-description {
    margin: 0 0 1.25rem 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    background: transparent;
  }

  .empty-message {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .empty-hint {
    margin: 0 0 1rem 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .btn-create-example {
    padding: 0.625rem 1.25rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-create-example:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--shadow-medium);
  }

  .btn-create-example:active {
    transform: translateY(0);
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
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .workflow-section.due-now h4 {
    color: var(--error);
  }

  .workflow-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }

  .workflow-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .workflow-card:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
    box-shadow: 0 2px 8px var(--shadow-medium);
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
  }

  .workflow-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .badge {
    font-size: 0.6875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge-due {
    background: rgba(239, 68, 68, 0.15);
    color: var(--error);
    border: 1px solid var(--error);
  }

  .badge-upcoming {
    background: rgba(59, 130, 246, 0.15);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
  }

  .badge-scheduled {
    background: rgba(156, 163, 175, 0.15);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  .workflow-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    padding: 0.75rem;
    font-size: 0.8125rem;
    color: var(--text-primary);
    line-height: 1.5;
    box-shadow: 0 4px 12px var(--shadow-medium);
    z-index: 1000;
    min-width: 200px;
    max-width: 350px;
    white-space: normal;
    text-align: left;
  }

  .workflow-card:hover .workflow-tooltip {
    display: block;
  }

  .workflow-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--bg-primary);
  }

  .workflow-tooltip::before {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 7px solid transparent;
    border-top-color: var(--border-medium);
    margin-top: 1px;
  }

  .more-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }
</style>
