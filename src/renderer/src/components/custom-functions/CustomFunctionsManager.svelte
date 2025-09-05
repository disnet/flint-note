<script lang="ts">
  import CustomFunctionsList from './CustomFunctionsList.svelte';
  import CustomFunctionEditor from './CustomFunctionEditor.svelte';
  import CustomFunctionTester from './CustomFunctionTester.svelte';
  import CustomFunctionDetails from './CustomFunctionDetails.svelte';
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type { CustomFunction } from '../../stores/customFunctionsStore.svelte';

  // UI State
  let currentView = $state<'list' | 'editor' | 'tester' | 'details'>('list');
  let selectedFunction = $state<CustomFunction | null>(null);
  let editingFunction = $state<CustomFunction | null>(null);

  function showList(): void {
    currentView = 'list';
    selectedFunction = null;
    editingFunction = null;
  }

  function showCreateEditor(): void {
    currentView = 'editor';
    editingFunction = null;
    selectedFunction = null;
  }

  function showEditEditor(func: CustomFunction): void {
    currentView = 'editor';
    editingFunction = func;
    selectedFunction = null;
  }

  function showTester(func: CustomFunction): void {
    currentView = 'tester';
    selectedFunction = func;
    editingFunction = null;
  }

  function showDetails(func: CustomFunction): void {
    currentView = 'details';
    selectedFunction = func;
    editingFunction = null;
  }

  function handleDuplicate(func: CustomFunction): void {
    const duplicated = customFunctionsStore.duplicateFunction(func);
    editingFunction = duplicated as CustomFunction; // Type assertion for the missing metadata
    currentView = 'editor';
  }

  function handleSave(_func: CustomFunction): void {
    showList();
    // The store will automatically update the functions list
  }

  function handleCancel(): void {
    showList();
  }
</script>

<div class="custom-functions-manager">
  <div class="manager-header">
    <div class="header-left">
      <h2>Custom Functions Manager</h2>
      <div class="breadcrumb">
        <button
          class="breadcrumb-item"
          class:active={currentView === 'list'}
          onclick={showList}
        >
          Functions
        </button>
        {#if currentView === 'editor'}
          <span class="breadcrumb-separator">›</span>
          <span class="breadcrumb-item active">
            {editingFunction ? 'Edit Function' : 'Create Function'}
          </span>
        {:else if currentView === 'tester' && selectedFunction}
          <span class="breadcrumb-separator">›</span>
          <span class="breadcrumb-item active">Test: {selectedFunction.name}</span>
        {:else if currentView === 'details' && selectedFunction}
          <span class="breadcrumb-separator">›</span>
          <span class="breadcrumb-item active">Details: {selectedFunction.name}</span>
        {/if}
      </div>
    </div>

    <div class="header-actions">
      {#if currentView === 'list'}
        <button class="btn-primary" onclick={showCreateEditor}>
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
          Create Function
        </button>
      {:else}
        <button class="btn-secondary" onclick={showList}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5m7-7l-7 7 7 7"></path>
          </svg>
          Back to List
        </button>
      {/if}
    </div>
  </div>

  <div class="manager-content">
    {#if currentView === 'list'}
      <CustomFunctionsList
        onEdit={showEditEditor}
        onTest={showTester}
        onDetails={showDetails}
        onDuplicate={handleDuplicate}
      />
    {:else if currentView === 'editor'}
      <CustomFunctionEditor
        editingFunction={editingFunction || undefined}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    {:else if currentView === 'tester' && selectedFunction}
      <CustomFunctionTester func={selectedFunction} onClose={showList} />
    {:else if currentView === 'details' && selectedFunction}
      <CustomFunctionDetails
        func={selectedFunction}
        onEdit={() => showEditEditor(selectedFunction!)}
        onTest={() => showTester(selectedFunction!)}
        onClose={showList}
      />
    {/if}
  </div>
</div>

<style>
  .custom-functions-manager {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .manager-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .manager-header h2 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .breadcrumb-item {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    transition: color 0.2s ease;
  }

  .breadcrumb-item:hover:not(.active) {
    color: var(--accent);
  }

  .breadcrumb-item.active {
    color: var(--text-primary);
    text-decoration: none;
    cursor: default;
    font-weight: 500;
  }

  .breadcrumb-separator {
    color: var(--text-secondary);
    user-select: none;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .manager-content {
    flex: 1;
    overflow: hidden;
    padding: 0 2rem 2rem 2rem;
  }

  .btn-primary,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-light);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, white);
  }

  .btn-secondary:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  /* Dark theme adjustments */
  @media (prefers-color-scheme: dark) {
    .custom-functions-manager {
      background: var(--bg-primary);
    }
  }
</style>
