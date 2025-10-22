<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import WorkflowList from './WorkflowList.svelte';
  import WorkflowDetail from './WorkflowDetail.svelte';
  import WorkflowForm from './WorkflowForm.svelte';
  import type {
    Workflow,
    WorkflowStatus,
    WorkflowType
  } from '../../../server/types/workflow';

  // View state
  let activeTab = $state<'workflows' | 'backlog'>('workflows');
  let selectedWorkflowId = $state<string | null>(null);
  let showCreateForm = $state(false);
  let showEditForm = $state(false);
  let editingWorkflow = $state<Workflow | null>(null);

  // Filter state
  let statusFilter = $state<WorkflowStatus | 'all'>('active');
  let searchQuery = $state('');

  // Load workflows on mount
  $effect(() => {
    workflowStore.initialize().catch(console.error);
  });

  // Derived filter for current tab
  const currentFilter = $derived({
    status: statusFilter,
    type: (activeTab === 'backlog' ? 'backlog' : 'workflow') as WorkflowType | 'all',
    search: searchQuery
  });

  function handleSelectWorkflow(workflowId: string): void {
    selectedWorkflowId = workflowId;
    showCreateForm = false;
    showEditForm = false;
  }

  function handleExecuteWorkflow(workflowId: string): void {
    // Send message to AI assistant to execute the workflow
    const workflow = workflowStore.getWorkflowById(workflowId);
    if (workflow && window.api?.sendMessage) {
      window.api
        .sendMessage({
          message: `Execute workflow: ${workflow.name}`
        })
        .catch(console.error);
    }
  }

  function handleCreateNew(): void {
    showCreateForm = true;
    showEditForm = false;
    selectedWorkflowId = null;
    editingWorkflow = null;
  }

  function handleEdit(workflow: Workflow): void {
    showEditForm = true;
    showCreateForm = false;
    editingWorkflow = workflow;
  }

  async function handleDelete(workflowId: string): Promise<void> {
    try {
      await workflowStore.deleteWorkflow(workflowId);
      selectedWorkflowId = null;
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert(
        'Failed to delete workflow: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  function handleFormSubmit(_workflow: Workflow): void {
    showCreateForm = false;
    showEditForm = false;
    editingWorkflow = null;
    // Workflow store will refresh automatically
  }

  function handleFormCancel(): void {
    showCreateForm = false;
    showEditForm = false;
    editingWorkflow = null;
  }

  function handleCloseDetail(): void {
    selectedWorkflowId = null;
  }

  function switchTab(tab: 'workflows' | 'backlog'): void {
    activeTab = tab;
    selectedWorkflowId = null;
    showCreateForm = false;
    showEditForm = false;
  }

  async function handleRefresh(): Promise<void> {
    await workflowStore.refresh({
      status: statusFilter === 'all' ? undefined : statusFilter,
      type: activeTab === 'backlog' ? 'backlog' : 'workflow'
    });
  }

  // Get backlog count for badge
  const backlogCount = $derived(workflowStore.backlogWorkflows.length);
</script>

<div class="workflow-management">
  <div class="management-header">
    <h1>Workflows</h1>
    <div class="header-actions">
      <button class="btn-refresh" onclick={handleRefresh} title="Refresh">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"
          />
        </svg>
      </button>
      <button class="btn-create" onclick={handleCreateNew}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Create Workflow
      </button>
    </div>
  </div>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'workflows'}
      onclick={() => switchTab('workflows')}
    >
      Workflows
    </button>
    <button
      class="tab"
      class:active={activeTab === 'backlog'}
      onclick={() => switchTab('backlog')}
    >
      Backlog
      {#if backlogCount > 0}
        <span class="badge">{backlogCount}</span>
      {/if}
    </button>
  </div>

  <div class="filters">
    <div class="filter-group">
      <label for="status-filter">Status:</label>
      <select id="status-filter" bind:value={statusFilter}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>
    </div>

    <div class="filter-group search">
      <input type="text" placeholder="Search workflows..." bind:value={searchQuery} />
    </div>
  </div>

  <div class="management-content">
    <div class="list-panel">
      {#if showCreateForm || showEditForm}
        <WorkflowForm
          workflow={showEditForm ? editingWorkflow : null}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      {:else}
        <WorkflowList
          selectedId={selectedWorkflowId}
          onSelect={handleSelectWorkflow}
          onExecute={handleExecuteWorkflow}
          filter={currentFilter}
        />
      {/if}
    </div>

    {#if selectedWorkflowId && !showCreateForm && !showEditForm}
      <div class="detail-panel">
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          onClose={handleCloseDetail}
          onEdit={handleEdit}
          onExecute={handleExecuteWorkflow}
          onDelete={handleDelete}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .workflow-management {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-tertiary);
  }

  .management-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
  }

  .management-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn-refresh,
  .btn-create {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    padding: 0.5rem;
  }

  .btn-refresh:hover {
    background: var(--bg-tertiary);
  }

  .btn-create {
    background: var(--accent-primary);
    color: var(--text-on-accent);
  }

  .btn-create:hover {
    background: var(--accent-hover);
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0 1.5rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--accent-light);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .tab .badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--error);
    color: white;
    border-radius: 12px;
    font-weight: 600;
  }

  .filters {
    display: flex;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group.search {
    flex: 1;
  }

  .filter-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .filter-group select,
  .filter-group input {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .filter-group input {
    width: 100%;
  }

  .filter-group select:focus,
  .filter-group input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .management-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    gap: 1rem;
    padding: 1rem;
  }

  .list-panel {
    flex: 1;
    min-width: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px var(--shadow-light);
  }

  .detail-panel {
    width: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px var(--shadow-light);
  }

  @media (max-width: 1024px) {
    .management-content {
      flex-direction: column;
    }

    .detail-panel {
      width: 100%;
      max-height: 50%;
    }
  }
</style>
