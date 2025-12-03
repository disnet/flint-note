<script lang="ts">
  import type { FlintQueryConfig, QueryResultNote, QueryFilter } from './types';
  import { runDataviewQuery } from './queryService.svelte';
  import { messageBus, type NoteEvent } from '../../services/messageBus.svelte';
  import FilterBuilder from './FilterBuilder.svelte';

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
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConfiguring = $state(false);
  let pendingFilters = $state<QueryFilter[] | null>(null); // Filters being edited, not yet saved to YAML

  // Derived: active filters (pending edits or saved config)
  const activeFilters = $derived(pendingFilters ?? config.filters);

  // Derived: columns to display (always include title first)
  const displayColumns = $derived.by(() => {
    const cols =
      config.columns && config.columns.length > 0 ? config.columns : ['type', 'updated'];
    return ['title', ...cols.filter((c) => c !== 'title')];
  });

  // Derived: get single type if filtered by flint_type (use active filters)
  const filteredType = $derived.by(() => {
    const typeFilter = activeFilters.find((f) => f.field === 'flint_type');
    return typeof typeFilter?.value === 'string' ? typeFilter.value : null;
  });

  // Execute query when active filters change
  $effect(() => {
    // Track activeFilters to re-run when they change (either config or pending)
    void activeFilters;
    void config;
    executeQuery();
  });

  // Subscribe to note events for real-time updates
  $effect(() => {
    // Note event types that should trigger a refresh
    const relevantEvents = [
      'note.created',
      'note.updated',
      'note.deleted',
      'note.renamed',
      'note.moved',
      'note.archived',
      'note.unarchived',
      'notes.bulkRefresh',
      'file.sync-completed'
    ];

    const unsubscribers = relevantEvents.map((eventType) =>
      messageBus.subscribe(eventType as NoteEvent['type'], (event) => {
        // Check if the event is relevant to our query
        if (isRelevantEvent(event)) {
          debouncedRefresh();
        }
      })
    );

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  });

  /**
   * Check if a note event is relevant to the current query
   */
  function isRelevantEvent(event: NoteEvent): boolean {
    // Always refresh for bulk operations
    if (event.type === 'notes.bulkRefresh' || event.type === 'file.sync-completed') {
      return true;
    }

    // For type-filtered queries, check if the note type matches
    if (filteredType) {
      if (event.type === 'note.created' && event.note.type === filteredType) {
        return true;
      }
      if (event.type === 'note.moved') {
        // Refresh if either old or new type matches
        return event.oldType === filteredType || event.newType === filteredType;
      }
      // For other events, check if the note is in our current results
      if ('noteId' in event) {
        return results.some((r) => r.id === event.noteId);
      }
      if ('oldId' in event) {
        return results.some((r) => r.id === event.oldId);
      }
    }

    // For non-type-filtered queries, refresh on any note change
    return true;
  }

  /**
   * Debounced refresh to prevent excessive re-queries
   */
  function debouncedRefresh(): void {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      executeQuery();
      refreshTimeout = null;
    }, 300); // 300ms debounce
  }

  async function executeQuery(): Promise<void> {
    loading = true;
    error = null;

    try {
      // Use activeFilters (which may include pending edits)
      const queryConfig = { ...config, filters: activeFilters };
      results = await runDataviewQuery(queryConfig);
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

  function toggleConfigure(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (isConfiguring && pendingFilters !== null) {
      // Closing the filter builder - save pending filters to YAML
      // Defer to avoid "update during update" error in CodeMirror
      const filtersToSave = pendingFilters;
      pendingFilters = null;
      setTimeout(() => {
        onConfigChange({
          ...config,
          filters: filtersToSave
        });
      }, 0);
    }

    isConfiguring = !isConfiguring;
  }

  function handleFiltersChange(newFilters: QueryFilter[]): void {
    // Store filters locally while editing - don't update YAML until filter builder is closed
    pendingFilters = newFilters;
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
      <button
        class="configure-btn"
        class:active={isConfiguring}
        onclick={toggleConfigure}
        type="button"
        title={isConfiguring ? 'Close filter editor' : 'Configure filters'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          {#if isConfiguring}
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          {:else}
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          {/if}
        </svg>
      </button>
    </div>
  </div>

  <!-- Filter Builder (when configuring) -->
  {#if isConfiguring}
    <div
      class="dataview-configure"
      role="presentation"
      onmousedown={(e) => e.stopPropagation()}
      onclick={(e) => e.stopPropagation()}
      onfocusin={(e) => e.stopPropagation()}
    >
      <FilterBuilder
        filters={activeFilters}
        typeName={filteredType ?? undefined}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  {/if}

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
