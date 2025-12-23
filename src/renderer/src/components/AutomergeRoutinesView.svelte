<script lang="ts">
  /**
   * Automerge Routines View Component
   *
   * Main management interface for routines with tabs, search, and CRUD.
   */
  import { getRoutineListItems, getRoutine } from '../lib/automerge';
  import AutomergeRoutineList from './AutomergeRoutineList.svelte';
  import AutomergeRoutineDetail from './AutomergeRoutineDetail.svelte';
  import AutomergeRoutineForm from './AutomergeRoutineForm.svelte';
  import type { AgentRoutine, AgentRoutineStatus } from '../lib/automerge/types';

  interface Props {
    onExecuteRoutine?: (routineId: string) => void;
  }

  let { onExecuteRoutine }: Props = $props();

  // View state
  let activeTab = $state<'routines' | 'backlog'>('routines');
  let selectedRoutineId = $state<string | null>(null);
  let showCreateForm = $state(false);
  let showEditForm = $state(false);
  let editingRoutine = $state<AgentRoutine | null>(null);

  // Filter state
  let statusFilter = $state<AgentRoutineStatus | 'all'>('active');
  let searchQuery = $state('');

  // Get counts for tabs
  const routinesCount = $derived(
    getRoutineListItems({ type: 'routine', status: 'active' }).length
  );
  const backlogCount = $derived(
    getRoutineListItems({ type: 'backlog', status: 'active' }).length
  );

  const selectedRoutine = $derived(
    selectedRoutineId ? getRoutine(selectedRoutineId) : null
  );

  function handleSelect(id: string): void {
    selectedRoutineId = id;
    showCreateForm = false;
    showEditForm = false;
  }

  function handleExecute(id: string): void {
    onExecuteRoutine?.(id);
  }

  function handleEdit(routine: AgentRoutine): void {
    editingRoutine = routine;
    showEditForm = true;
    showCreateForm = false;
  }

  function handleDelete(id: string): void {
    if (selectedRoutineId === id) {
      selectedRoutineId = null;
    }
  }

  function handleFormSubmit(routineId: string): void {
    showCreateForm = false;
    showEditForm = false;
    editingRoutine = null;
    selectedRoutineId = routineId;
  }

  function handleFormCancel(): void {
    showCreateForm = false;
    showEditForm = false;
    editingRoutine = null;
  }

  function handleCreateNew(): void {
    showCreateForm = true;
    showEditForm = false;
    editingRoutine = null;
    selectedRoutineId = null;
  }
</script>

<div class="routines-view">
  <div class="view-header">
    <h1>Routines</h1>
    <button class="btn btn-primary" onclick={handleCreateNew}>
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
      New Routine
    </button>
  </div>

  <div class="view-content">
    <div class="list-panel">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'routines'}
          onclick={() => (activeTab = 'routines')}
        >
          Routines
          {#if routinesCount > 0}
            <span class="count">{routinesCount}</span>
          {/if}
        </button>
        <button
          class="tab"
          class:active={activeTab === 'backlog'}
          onclick={() => (activeTab = 'backlog')}
        >
          Backlog
          {#if backlogCount > 0}
            <span class="count backlog">{backlogCount}</span>
          {/if}
        </button>
      </div>

      <div class="list-controls">
        <div class="search-box">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" placeholder="Search routines..." bind:value={searchQuery} />
        </div>

        <select bind:value={statusFilter}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div class="list-content">
        <AutomergeRoutineList
          selectedId={selectedRoutineId}
          onSelect={handleSelect}
          onExecute={handleExecute}
          filter={{
            status: statusFilter,
            type: activeTab === 'backlog' ? 'backlog' : 'routine',
            search: searchQuery
          }}
        />
      </div>
    </div>

    <div class="detail-panel">
      {#if showCreateForm}
        <AutomergeRoutineForm onSubmit={handleFormSubmit} onCancel={handleFormCancel} />
      {:else if showEditForm && editingRoutine}
        <AutomergeRoutineForm
          routine={editingRoutine}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      {:else if selectedRoutine}
        <AutomergeRoutineDetail
          routineId={selectedRoutine.id}
          onClose={() => (selectedRoutineId = null)}
          onEdit={handleEdit}
          onExecute={handleExecute}
          onDelete={handleDelete}
        />
      {:else}
        <div class="empty-detail">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"
            />
          </svg>
          <h3>No Routine Selected</h3>
          <p>Select a routine from the list to view details, or create a new one.</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .routines-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .view-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
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

  .view-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .list-panel {
    width: 400px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-light);
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .count {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 10px;
    min-width: 1.25rem;
    text-align: center;
  }

  .count.backlog {
    background: rgba(168, 85, 247, 0.15);
    color: #a855f7;
  }

  .list-controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light);
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 6px;
  }

  .search-box svg {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .search-box input:focus {
    outline: none;
  }

  .list-controls select {
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .list-content {
    flex: 1;
    overflow-y: auto;
  }

  .detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .empty-detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-detail svg {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-detail h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: var(--text-secondary);
  }

  .empty-detail p {
    margin: 0;
    font-size: 0.875rem;
  }
</style>
