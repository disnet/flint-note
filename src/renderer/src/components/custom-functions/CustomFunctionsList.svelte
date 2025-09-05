<script lang="ts">
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type { CustomFunction } from '../../stores/customFunctionsStore.svelte';

  interface Props {
    onEdit?: (func: CustomFunction) => void;
    onTest?: (func: CustomFunction) => void;
    onDetails?: (func: CustomFunction) => void;
    onDuplicate?: (func: CustomFunction) => void;
  }

  let { onEdit, onTest, onDetails, onDuplicate }: Props = $props();

  let confirmDeleteId = $state<string | null>(null);

  // Load functions on mount
  $effect(() => {
    customFunctionsStore.loadFunctions().catch(console.error);
  });

  async function handleDelete(id: string): Promise<void> {
    if (confirmDeleteId !== id) {
      confirmDeleteId = id;
      return;
    }

    try {
      await customFunctionsStore.deleteFunction(id);
      confirmDeleteId = null;
    } catch (error) {
      console.error('Failed to delete function:', error);
    }
  }

  function cancelDelete(): void {
    confirmDeleteId = null;
  }

  function handleSort(field: 'name' | 'createdAt' | 'usageCount' | 'lastUsed'): void {
    const currentSort = customFunctionsStore.sortBy;
    const currentDirection = customFunctionsStore.sortDirection;

    if (currentSort === field) {
      // Toggle direction
      customFunctionsStore.setSorting(field, currentDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default direction for each field
      const defaultDirection = field === 'name' ? 'asc' : 'desc';
      customFunctionsStore.setSorting(field, defaultDirection);
    }
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function getSortIcon(field: string): string {
    if (customFunctionsStore.sortBy !== field) {
      return '↕️';
    }
    return customFunctionsStore.sortDirection === 'asc' ? '↑' : '↓';
  }

  async function handleExport(): Promise<void> {
    try {
      const exportResult = await customFunctionsStore.exportFunctions();
      const blob = new Blob([exportResult.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom-functions-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }

  function handleImportClick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = handleImportFile;
    input.click();
  }

  async function handleImportFile(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await customFunctionsStore.importFunctions(text);
      alert(`Successfully imported ${result.imported} functions`);
    } catch (error) {
      console.error('Import failed:', error);
      alert(
        'Import failed: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  function toggleTag(tag: string): void {
    const current = customFunctionsStore.selectedTags;
    if (current.includes(tag)) {
      customFunctionsStore.setSelectedTags(current.filter((t) => t !== tag));
    } else {
      customFunctionsStore.setSelectedTags([...current, tag]);
    }
  }
</script>

<div class="functions-list">
  <!-- Header with stats and actions -->
  <div class="header">
    <div class="stats">
      <div class="stat">
        <span class="stat-value">{customFunctionsStore.stats.totalFunctions}</span>
        <span class="stat-label">Functions</span>
      </div>
      <div class="stat">
        <span class="stat-value">{customFunctionsStore.stats.totalUsage}</span>
        <span class="stat-label">Total Usage</span>
      </div>
      <div class="stat">
        <span class="stat-value">{customFunctionsStore.stats.averageUsage}</span>
        <span class="stat-label">Avg Usage</span>
      </div>
    </div>

    <div class="actions">
      <button class="btn-secondary" onclick={handleExport}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17,8 12,3 7,8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Export
      </button>

      <button class="btn-secondary" onclick={handleImportClick}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7,10 12,15 17,10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Import
      </button>

      <button class="btn-secondary" onclick={() => customFunctionsStore.loadFunctions()}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
          <path d="M21 3v5h-5"></path>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
          <path d="M3 21v-5h5"></path>
        </svg>
        Refresh
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="filters">
    <div class="search-box">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="search-icon"
      >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="M21 21l-4.35-4.35"></path>
      </svg>
      <input
        type="text"
        placeholder="Search functions..."
        bind:value={customFunctionsStore.searchQuery}
        oninput={(e) =>
          customFunctionsStore.setSearchQuery((e.target as HTMLInputElement).value)}
      />
    </div>

    {#if customFunctionsStore.allTags.length > 0}
      <div class="tags-filter">
        <span class="filter-label">Tags:</span>
        {#each customFunctionsStore.allTags as tag (tag)}
          <button
            class="tag-filter"
            class:active={customFunctionsStore.selectedTags.includes(tag)}
            onclick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Loading state -->
  {#if customFunctionsStore.isLoading}
    <div class="loading">Loading functions...</div>
  {/if}

  <!-- Error state -->
  {#if customFunctionsStore.error}
    <div class="error">
      {customFunctionsStore.error}
      <button class="btn-secondary" onclick={() => customFunctionsStore.clearError()}
        >Dismiss</button
      >
    </div>
  {/if}

  <!-- Functions table -->
  {#if !customFunctionsStore.isLoading && customFunctionsStore.filteredFunctions.length > 0}
    <div class="table-container">
      <table class="functions-table">
        <thead>
          <tr>
            <th class="sortable" onclick={() => handleSort('name')}>
              Name {getSortIcon('name')}
            </th>
            <th>Description</th>
            <th>Tags</th>
            <th class="sortable" onclick={() => handleSort('createdAt')}>
              Created {getSortIcon('createdAt')}
            </th>
            <th class="sortable" onclick={() => handleSort('usageCount')}>
              Usage {getSortIcon('usageCount')}
            </th>
            <th class="sortable" onclick={() => handleSort('lastUsed')}>
              Last Used {getSortIcon('lastUsed')}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each customFunctionsStore.filteredFunctions as func (func.id)}
            <tr>
              <td class="function-name">
                <code>{func.name}</code>
                <span class="return-type">{func.returnType}</span>
              </td>
              <td class="description" title={func.description}>
                {func.description}
              </td>
              <td class="tags">
                {#each func.tags as tag (tag)}
                  <span class="tag">{tag}</span>
                {/each}
              </td>
              <td class="date">
                {formatDate(func.metadata.createdAt)}
                <div class="created-by">by {func.metadata.createdBy}</div>
              </td>
              <td class="usage-count">
                {func.metadata.usageCount}
              </td>
              <td class="date">
                {func.metadata.lastUsed ? formatDate(func.metadata.lastUsed) : 'Never'}
              </td>
              <td class="actions">
                <div class="action-buttons">
                  <button
                    class="btn-icon"
                    title="View Details"
                    aria-label="View Details"
                    onclick={() => onDetails?.(func)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="3"></circle>
                      <path
                        d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"
                      ></path>
                    </svg>
                  </button>

                  <button
                    class="btn-icon"
                    title="Test Function"
                    aria-label="Test Function"
                    onclick={() => onTest?.(func)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polygon points="5,3 19,12 5,21"></polygon>
                    </svg>
                  </button>

                  <button
                    class="btn-icon"
                    title="Edit Function"
                    aria-label="Edit Function"
                    onclick={() => onEdit?.(func)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      ></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      ></path>
                    </svg>
                  </button>

                  <button
                    class="btn-icon"
                    title="Duplicate Function"
                    aria-label="Duplicate Function"
                    onclick={() => onDuplicate?.(func)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      ></path>
                    </svg>
                  </button>

                  {#if confirmDeleteId === func.id}
                    <button
                      class="btn-danger-small"
                      title="Confirm Delete"
                      onclick={() => handleDelete(func.id)}
                    >
                      ✓
                    </button>
                    <button class="btn-icon" title="Cancel Delete" onclick={cancelDelete}>
                      ✕
                    </button>
                  {:else}
                    <button
                      class="btn-icon danger"
                      title="Delete Function"
                      aria-label="Delete Function"
                      onclick={() => handleDelete(func.id)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path
                          d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                        ></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !customFunctionsStore.isLoading}
    <div class="empty-state">
      <div class="empty-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14.5 4H20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-5.5"></path>
          <polyline points="14.5,1 14.5,8 21,8"></polyline>
          <path d="M10,21H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h6l4,4v7"></path>
          <line x1="7" y1="10" x2="8" y2="10"></line>
          <line x1="7" y1="14" x2="10" y2="14"></line>
        </svg>
      </div>
      <h3>No custom functions found</h3>
      <p>
        {customFunctionsStore.searchQuery || customFunctionsStore.selectedTags.length > 0
          ? 'Try adjusting your search or filters'
          : 'Create your first custom function to get started'}
      </p>
    </div>
  {/if}
</div>

<style>
  .functions-list {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
  }

  .stats {
    display: flex;
    gap: 1.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex-shrink: 0;
  }

  .search-box {
    position: relative;
    max-width: 400px;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-box input {
    width: 100%;
    padding: 0.75rem;
    padding-left: 2.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .tags-filter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .tag-filter {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tag-filter:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tag-filter.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .loading,
  .error {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-style: italic;
  }

  .error {
    color: var(--danger);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .table-container {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
  }

  .functions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .functions-table th {
    background: var(--bg-secondary);
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
  }

  .functions-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .functions-table th.sortable:hover {
    background: var(--bg-hover);
  }

  .functions-table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light);
    vertical-align: top;
  }

  .functions-table tr:hover {
    background: var(--bg-hover);
  }

  .function-name {
    min-width: 150px;
  }

  .function-name code {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--accent);
  }

  .return-type {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: monospace;
  }

  .description {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tags {
    max-width: 150px;
  }

  .tag {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    margin: 0.125rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    font-size: 0.625rem;
    color: var(--text-secondary);
  }

  .date {
    min-width: 120px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .created-by {
    font-size: 0.625rem;
    margin-top: 0.25rem;
    opacity: 0.7;
  }

  .usage-count {
    text-align: center;
    font-weight: 500;
    color: var(--accent);
  }

  .actions {
    min-width: 200px;
  }

  .action-buttons {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .btn-secondary,
  .btn-icon,
  .btn-danger-small {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
  }

  .btn-icon {
    padding: 0.375rem;
  }

  .btn-secondary:hover,
  .btn-icon:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .btn-icon.danger:hover {
    background: #fee;
    border-color: var(--danger);
    color: var(--danger);
  }

  .btn-danger-small {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
    font-weight: 600;
  }

  .btn-danger-small:hover {
    background: color-mix(in srgb, var(--danger) 90%, white);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem;
  }

  .empty-icon {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
    font-size: 1.25rem;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
