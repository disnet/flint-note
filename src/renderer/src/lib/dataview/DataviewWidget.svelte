<script lang="ts">
  import type { FlintQueryConfig, QueryResultNote } from './types';
  import { runDataviewQuery } from './queryService.svelte';

  interface Props {
    config: FlintQueryConfig;
    onConfigChange: (config: FlintQueryConfig) => void;
    onNewNote: () => void;
    onNoteClick: (noteId: string, shiftKey?: boolean) => void;
  }

  let { config, onConfigChange, onNewNote, onNoteClick }: Props = $props();

  // State
  let results = $state<QueryResultNote[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Derived: columns to display (always include title first)
  const displayColumns = $derived.by(() => {
    const cols =
      config.columns && config.columns.length > 0 ? config.columns : ['type', 'updated'];
    return ['title', ...cols.filter((c) => c !== 'title')];
  });

  // Derived: get single type if filtered by flint_type
  const filteredType = $derived.by(() => {
    const typeFilter = config.filters.find((f) => f.field === 'flint_type');
    return typeof typeFilter?.value === 'string' ? typeFilter.value : null;
  });

  // Execute query when config changes
  $effect(() => {
    // Track config to re-run when it changes
    void config;
    executeQuery();
  });

  async function executeQuery(): Promise<void> {
    loading = true;
    error = null;

    try {
      results = await runDataviewQuery(config);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Query failed';
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleSortClick(field: string): void {
    // Toggle sort order if already sorting by this field
    const currentOrder = config.sort?.field === field ? config.sort.order : null;
    const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';

    onConfigChange({
      ...config,
      sort: { field, order: newOrder }
    });
  }

  function getColumnValue(result: QueryResultNote, column: string): string {
    if (column === 'title') return result.title || '(untitled)';
    if (column === 'type') return result.type;
    if (column === 'created') return formatDate(result.created);
    if (column === 'updated') return formatDate(result.updated);

    // Metadata field
    const value = result.metadata[column];
    if (value === undefined || value === null) return '-';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  function formatDate(iso: string): string {
    if (!iso) return '-';
    try {
      const date = new Date(iso);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  function handleRowClick(result: QueryResultNote, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onNoteClick(result.id, event.shiftKey);
  }

  function handleNewNoteClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onNewNote();
  }

  function handleRetryClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    executeQuery();
  }

  function getColumnLabel(column: string): string {
    // Capitalize first letter
    return column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, ' ');
  }
</script>

<div class="dataview-widget">
  <!-- Header -->
  <div class="dataview-header">
    <span class="dataview-name">{config.name || 'Query Results'}</span>
    <div class="dataview-meta">
      {#if !loading}
        <span class="dataview-count"
          >{results.length} note{results.length === 1 ? '' : 's'}</span
        >
      {/if}
    </div>
  </div>

  <!-- Results -->
  {#if loading}
    <div class="dataview-loading">
      <span>Loading...</span>
    </div>
  {:else if error}
    <div class="dataview-error">
      <span>{error}</span>
      <button onclick={handleRetryClick}>Retry</button>
    </div>
  {:else if results.length === 0}
    <div class="dataview-empty">
      <span>No notes match this query</span>
    </div>
  {:else}
    <table class="dataview-table">
      <thead>
        <tr>
          {#each displayColumns as column (column)}
            <th
              onclick={() => handleSortClick(column)}
              class:sorted={config.sort?.field === column}
            >
              {getColumnLabel(column)}
              {#if config.sort?.field === column}
                <span class="sort-indicator">
                  {config.sort.order === 'asc' ? '↑' : '↓'}
                </span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each results as result (result.id)}
          <tr onclick={(e) => handleRowClick(result, e)}>
            {#each displayColumns as column (column)}
              <td class:dataview-title-cell={column === 'title'}>
                {getColumnValue(result, column)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- Footer with new note button -->
  <div class="dataview-footer">
    <button class="dataview-new-note-btn" onclick={handleNewNoteClick}>
      + New {filteredType || 'Note'}
    </button>
  </div>
</div>
