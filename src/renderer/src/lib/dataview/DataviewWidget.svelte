<script lang="ts">
  import type {
    FlintQueryConfig,
    QueryResultNote,
    QueryFilter,
    ColumnConfig
  } from './types';
  import { normalizeColumn } from './types';
  import { runDataviewQuery } from './queryService.svelte';
  import { messageBus, type NoteEvent } from '../../services/messageBus.svelte';
  import FilterBuilder from './FilterBuilder.svelte';
  import ColumnBuilder from './ColumnBuilder.svelte';
  import ColumnCell from './ColumnCell.svelte';
  import type { MetadataFieldType } from '../../../../server/core/metadata-schema';

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
  let isConfiguringFilters = $state(false);
  let isConfiguringColumns = $state(false);
  let pendingFilters = $state<QueryFilter[] | null>(null); // Filters being edited, not yet saved to YAML
  let pendingColumns = $state<ColumnConfig[] | null>(null); // Columns being edited
  let isEditingName = $state(false);
  let editingName = $state('');
  let nameInputRef = $state<HTMLInputElement | null>(null);
  let isExpanded = $state(config.expanded ?? false);

  // Derived: active filters (pending edits or saved config)
  const activeFilters = $derived(pendingFilters ?? config.filters);

  // Derived: active columns (pending edits or saved config)
  const activeColumns = $derived.by(() => {
    if (pendingColumns !== null) return pendingColumns;
    if (config.columns && config.columns.length > 0) {
      return config.columns.map(normalizeColumn);
    }
    return [] as ColumnConfig[];
  });

  // Derived: columns to display (always include title first)
  const displayColumns = $derived.by(() => {
    const titleColumn: ColumnConfig = { field: 'title', label: 'Title' };
    const otherColumns = activeColumns.filter((c) => c.field !== 'title');
    return [titleColumn, ...otherColumns];
  });

  // Derived: get single type if filtered by flint_type (use active filters)
  const filteredType = $derived.by(() => {
    const typeFilter = activeFilters.find((f) => f.field === 'flint_type');
    return typeof typeFilter?.value === 'string' ? typeFilter.value : null;
  });

  // Track previous type to detect changes
  let previousFilteredType = $state<string | null>(null);

  // Clear columns when note type changes (metadata fields are type-specific)
  $effect(() => {
    const currentType = filteredType;
    if (previousFilteredType !== null && currentType !== previousFilteredType) {
      // Type changed - clear columns
      pendingColumns = null;
      if (config.columns && config.columns.length > 0) {
        setTimeout(() => {
          onConfigChange({
            ...config,
            columns: []
          });
        }, 0);
      }
    }
    previousFilteredType = currentType;
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

  function getColumnLabel(column: ColumnConfig): string {
    if (column.label) return column.label;
    // Capitalize first letter
    return (
      column.field.charAt(0).toUpperCase() + column.field.slice(1).replace(/_/g, ' ')
    );
  }

  function toggleConfigureFilters(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (isConfiguringFilters && pendingFilters !== null) {
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

    isConfiguringFilters = !isConfiguringFilters;
    // Close columns panel when opening filters
    if (isConfiguringFilters) {
      isConfiguringColumns = false;
    }
  }

  function toggleConfigureColumns(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (isConfiguringColumns && pendingColumns !== null) {
      // Closing the column builder - save pending columns to YAML
      const columnsToSave = pendingColumns;
      pendingColumns = null;
      setTimeout(() => {
        onConfigChange({
          ...config,
          columns: columnsToSave
        });
      }, 0);
    }

    isConfiguringColumns = !isConfiguringColumns;
    // Close filters panel when opening columns
    if (isConfiguringColumns) {
      isConfiguringFilters = false;
    }
  }

  function handleFiltersChange(newFilters: QueryFilter[]): void {
    // Store filters locally while editing - don't update YAML until filter builder is closed
    pendingFilters = newFilters;
  }

  function handleColumnsChange(newColumns: ColumnConfig[]): void {
    // Store columns locally while editing
    pendingColumns = newColumns;
  }

  // Get field type for a column
  function getFieldType(field: string): MetadataFieldType | 'system' | 'unknown' {
    if (field === 'title' || field === 'type' || field === 'flint_title' || field === 'flint_type')
      return 'system';
    if (
      field === 'created' ||
      field === 'updated' ||
      field === 'flint_created' ||
      field === 'flint_updated'
    )
      return 'date';
    // For metadata fields, we'd ideally look up the type from the schema
    // For now, return 'unknown' and let ColumnCell infer from value
    return 'unknown';
  }

  // Get cell value for a column
  function getCellValue(result: QueryResultNote, field: string): unknown {
    if (field === 'title' || field === 'flint_title') return result.title || '(untitled)';
    if (field === 'type' || field === 'flint_type') return result.type;
    if (field === 'created' || field === 'flint_created') return result.created;
    if (field === 'updated' || field === 'flint_updated') return result.updated;
    return result.metadata[field];
  }

  function startEditingName(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    editingName = config.name || '';
    isEditingName = true;
    // Focus the input after it's rendered
    setTimeout(() => {
      nameInputRef?.focus();
      nameInputRef?.select();
    }, 0);
  }

  function saveNameEdit(): void {
    if (!isEditingName) return;
    const newName = editingName.trim();
    isEditingName = false;
    // Only update if the name actually changed
    if (newName !== (config.name || '')) {
      setTimeout(() => {
        onConfigChange({
          ...config,
          name: newName || undefined // Remove name if empty
        });
      }, 0);
    }
  }

  function cancelNameEdit(): void {
    isEditingName = false;
    editingName = '';
  }

  function handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveNameEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelNameEdit();
    }
  }

  function toggleExpanded(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    isExpanded = !isExpanded;
    const newExpanded = isExpanded;
    setTimeout(() => {
      onConfigChange({
        ...config,
        expanded: newExpanded || undefined // Remove if false (default)
      });
    }, 0);
  }
</script>

<div class="dataview-widget">
  <!-- Header -->
  <div class="dataview-header">
    {#if isEditingName}
      <input
        bind:this={nameInputRef}
        type="text"
        class="dataview-name-input"
        bind:value={editingName}
        onblur={saveNameEdit}
        onkeydown={handleNameKeydown}
        placeholder="Query Results"
      />
    {:else}
      <button
        class="dataview-name"
        onclick={startEditingName}
        type="button"
        title="Click to edit name"
      >
        {config.name || 'Query Results'}
      </button>
    {/if}
    <div class="dataview-meta">
      {#if !loading}
        <span class="dataview-count"
          >{results.length} note{results.length === 1 ? '' : 's'}</span
        >
      {/if}
      <!-- Expand/collapse button -->
      <button
        class="configure-btn"
        class:active={isExpanded}
        onclick={toggleExpanded}
        type="button"
        title={isExpanded ? 'Collapse' : 'Expand'}
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
          {#if isExpanded}
            <!-- Collapse icon (arrows pointing inward) -->
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          {:else}
            <!-- Expand icon (arrows pointing outward) -->
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          {/if}
        </svg>
      </button>
      <!-- Columns configuration button -->
      <button
        class="configure-btn"
        class:active={isConfiguringColumns}
        onclick={toggleConfigureColumns}
        type="button"
        title={isConfiguringColumns ? 'Close column editor' : 'Configure columns'}
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
          {#if isConfiguringColumns}
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          {:else}
            <!-- Grid/columns icon -->
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          {/if}
        </svg>
      </button>
      <!-- Filters configuration button -->
      <button
        class="configure-btn"
        class:active={isConfiguringFilters}
        onclick={toggleConfigureFilters}
        type="button"
        title={isConfiguringFilters ? 'Close filter editor' : 'Configure filters'}
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
          {#if isConfiguringFilters}
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          {:else}
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          {/if}
        </svg>
      </button>
    </div>
  </div>

  <!-- Column Builder (when configuring columns) -->
  {#if isConfiguringColumns}
    <div
      class="dataview-configure"
      role="presentation"
      onmousedown={(e) => e.stopPropagation()}
      onclick={(e) => e.stopPropagation()}
      onfocusin={(e) => e.stopPropagation()}
    >
      <ColumnBuilder
        columns={activeColumns}
        typeName={filteredType ?? undefined}
        onColumnsChange={handleColumnsChange}
      />
    </div>
  {/if}

  <!-- Filter Builder (when configuring filters) -->
  {#if isConfiguringFilters}
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
  <div class="dataview-content" class:expanded={isExpanded}>
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
            {#each displayColumns as column (column.field)}
              <th
                onclick={() => handleSortClick(column.field)}
                class:sorted={config.sort?.field === column.field}
              >
                {getColumnLabel(column)}
                {#if config.sort?.field === column.field}
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
              {#each displayColumns as column (column.field)}
                <td class:dataview-title-cell={column.field === 'title'}>
                  <ColumnCell
                    value={getCellValue(result, column.field)}
                    fieldType={getFieldType(column.field)}
                    format={column.format}
                    isTitle={column.field === 'title'}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Footer with new note button -->
  <div class="dataview-footer">
    <button class="dataview-new-note-btn" onclick={handleNewNoteClick}>
      + New {filteredType || 'Note'}
    </button>
  </div>
</div>
