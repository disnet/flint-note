<script lang="ts">
  /**
   * Routines View Component - Dashboard Layout
   *
   * Single-column dashboard with due/upcoming sections and modal for detail/edit/create.
   */
  import {
    getRoutineListItems,
    getRoutine,
    getRoutinesDueNow,
    getUpcomingRoutines
  } from '../lib/automerge';
  import RoutineModal from './RoutineModal.svelte';
  import RoutineDashboardCard from './RoutineDashboardCard.svelte';
  import RoutineListCompact from './RoutineListCompact.svelte';
  import RoutineDetail from './RoutineDetail.svelte';
  import RoutineForm from './RoutineForm.svelte';
  import type {
    AgentRoutine,
    AgentRoutineStatus,
    RoutineListItem
  } from '../lib/automerge/types';

  interface Props {
    onExecuteRoutine?: (routineId: string) => void;
  }

  let { onExecuteRoutine }: Props = $props();

  // Modal state
  type ModalMode = 'closed' | 'detail' | 'create' | 'edit';
  let modalMode = $state<ModalMode>('closed');
  let selectedRoutineId = $state<string | null>(null);
  let editingRoutine = $state<AgentRoutine | null>(null);

  // Filter state
  let activeTab = $state<'routines' | 'backlog'>('routines');
  let statusFilter = $state<AgentRoutineStatus | 'all'>('active');
  let searchQuery = $state('');

  // Dashboard data
  const dueRoutines = $derived(getRoutinesDueNow());

  const upcomingRoutines = $derived.by((): RoutineListItem[] => {
    const dueIds = new Set(dueRoutines.map((r) => r.id));
    return getUpcomingRoutines(7).filter(
      (r) => !dueIds.has(r.id) && r.dueInfo?.type === 'upcoming'
    );
  });

  // All routines list
  const filteredRoutines = $derived.by((): RoutineListItem[] => {
    let result = getRoutineListItems({
      status: statusFilter === 'all' ? undefined : statusFilter,
      type: activeTab === 'backlog' ? 'backlog' : 'routine'
    });

    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.purpose.toLowerCase().includes(searchLower)
      );
    }

    return result;
  });

  // Counts for tabs
  const routinesCount = $derived(
    getRoutineListItems({ type: 'routine', status: 'active' }).length
  );
  const backlogCount = $derived(
    getRoutineListItems({ type: 'backlog', status: 'active' }).length
  );

  // Modal helpers
  const modalOpen = $derived(modalMode !== 'closed');
  const modalTitle = $derived.by(() => {
    switch (modalMode) {
      case 'create':
        return 'New Routine';
      case 'edit':
        return 'Edit Routine';
      case 'detail':
        return 'Routine Details';
      default:
        return '';
    }
  });

  const selectedRoutine = $derived(
    selectedRoutineId ? getRoutine(selectedRoutineId) : null
  );

  // Handlers
  function handleCreateNew(): void {
    modalMode = 'create';
    selectedRoutineId = null;
    editingRoutine = null;
  }

  function handleSelectRoutine(id: string): void {
    selectedRoutineId = id;
    modalMode = 'detail';
    editingRoutine = null;
  }

  function handleExecute(id: string): void {
    onExecuteRoutine?.(id);
  }

  function handleEditFromCard(id: string): void {
    const routine = getRoutine(id);
    if (routine) {
      editingRoutine = routine;
      selectedRoutineId = id;
      modalMode = 'edit';
    }
  }

  function handleEditFromDetail(routine: AgentRoutine): void {
    editingRoutine = routine;
    modalMode = 'edit';
  }

  function handleDelete(_id: string): void {
    closeModal();
  }

  function handleFormSubmit(routineId: string): void {
    selectedRoutineId = routineId;
    modalMode = 'detail';
    editingRoutine = null;
  }

  function closeModal(): void {
    modalMode = 'closed';
    selectedRoutineId = null;
    editingRoutine = null;
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

  <div class="dashboard-content">
    <!-- Due Now Section -->
    {#if dueRoutines.length > 0}
      <section class="dashboard-section">
        <h2 class="section-title section-title-due">Due Now</h2>
        <div class="dashboard-cards">
          {#each dueRoutines as routine (routine.id)}
            <RoutineDashboardCard
              {routine}
              variant="due"
              onStart={handleExecute}
              onEdit={handleEditFromCard}
              onClick={handleSelectRoutine}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Upcoming Section -->
    {#if upcomingRoutines.length > 0}
      <section class="dashboard-section">
        <h2 class="section-title section-title-upcoming">Upcoming</h2>
        <div class="dashboard-cards">
          {#each upcomingRoutines as routine (routine.id)}
            <RoutineDashboardCard
              {routine}
              variant="upcoming"
              onStart={handleExecute}
              onEdit={handleEditFromCard}
              onClick={handleSelectRoutine}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- All Routines Section -->
    <section class="all-routines-section">
      <div class="section-header">
        <h2 class="section-title">All Routines</h2>
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
        <RoutineListCompact
          routines={filteredRoutines}
          onSelect={handleSelectRoutine}
          onExecute={handleExecute}
        />
      </div>
    </section>
  </div>

  <!-- Modal for Detail/Edit/Create -->
  <RoutineModal isOpen={modalOpen} title={modalTitle} onClose={closeModal}>
    {#if modalMode === 'create'}
      <RoutineForm onSubmit={handleFormSubmit} onCancel={closeModal} />
    {:else if modalMode === 'edit' && editingRoutine}
      <RoutineForm
        routine={editingRoutine}
        onSubmit={handleFormSubmit}
        onCancel={closeModal}
      />
    {:else if modalMode === 'detail' && selectedRoutine}
      <RoutineDetail
        routineId={selectedRoutine.id}
        onEdit={handleEditFromDetail}
        onExecute={handleExecute}
        onDelete={handleDelete}
      />
    {/if}
  </RoutineModal>
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
    flex-shrink: 0;
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

  .dashboard-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .dashboard-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section-title-due::before {
    content: '';
    width: 8px;
    height: 8px;
    background: var(--error, #ef4444);
    border-radius: 50%;
  }

  .section-title-upcoming::before {
    content: '';
    width: 8px;
    height: 8px;
    background: var(--accent-primary, #3b82f6);
    border-radius: 50%;
  }

  .dashboard-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .all-routines-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .tab.active {
    color: var(--accent-primary);
    background: rgba(59, 130, 246, 0.1);
    border-color: var(--accent-primary);
  }

  .count {
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 10px;
    min-width: 1.25rem;
    text-align: center;
  }

  .tab.active .count {
    background: rgba(59, 130, 246, 0.2);
  }

  .count.backlog {
    background: rgba(168, 85, 247, 0.15);
    color: #a855f7;
  }

  .list-controls {
    display: flex;
    gap: 0.5rem;
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
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

  .search-box input::placeholder {
    color: var(--text-muted);
  }

  .list-controls select {
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .list-content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-light);
  }
</style>
