<script lang="ts">
  import type {
    DeckConfig,
    DeckView,
    DeckFilter,
    ColumnConfig,
    PageSize
  } from '../lib/automerge/deck';
  import {
    normalizeColumn,
    SYSTEM_FIELDS,
    getActiveView,
    createDefaultView,
    EMPTY_FILTER_VALUE,
    DEFAULT_PAGE_SIZE,
    runDeckQuery,
    getAvailableFields
  } from '../lib/automerge/deck';
  import DeckPaginationControls from './DeckPaginationControls.svelte';
  import DeckToolbar from './DeckToolbar.svelte';
  import DeckNoteListItem from './DeckNoteListItem.svelte';
  import DeckPropPickerDialog from './DeckPropPickerDialog.svelte';
  import DeckFilterPopup from './DeckFilterPopup.svelte';
  import DeckViewSwitcher from './DeckViewSwitcher.svelte';
  import type { DeckValidationWarning } from '../../../shared/deck-yaml-utils';
  import {
    getNote,
    getNoteTypes,
    getNoteTypesDict,
    getNotesDict,
    createNote,
    updateNote,
    setNoteProps
  } from '../lib/automerge/state.svelte';

  // Schema field info for inline editing
  interface SchemaFieldInfo {
    name: string;
    type:
      | 'string'
      | 'number'
      | 'boolean'
      | 'date'
      | 'array'
      | 'select'
      | 'notelink'
      | 'notelinks';
    options?: string[];
    required?: boolean;
  }

  interface Props {
    config: DeckConfig;
    onConfigChange: (config: DeckConfig) => void;
    onNoteOpen?: (noteId: string) => void;
    /** Validation warnings from YAML parsing (e.g., duplicate filters) */
    validationWarnings?: DeckValidationWarning[];
  }

  let {
    config: initialConfig,
    onConfigChange,
    onNoteOpen,
    validationWarnings = []
  }: Props = $props();

  // Derived config that syncs with prop changes
  let config = $derived(initialConfig);

  // Wrapper to notify parent of config changes
  function updateConfig(newConfig: DeckConfig): void {
    onConfigChange(newConfig);
  }

  // State
  let newlyCreatedNoteId = $state<string | null>(null);

  // Pagination state
  let currentPage = $state(0);

  // Schema fields for inline editing (non-reactive Maps since they're rebuilt in effect)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt completely in effect, not reactive
  let schemaFields = new Map<string, SchemaFieldInfo>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt completely in effect, not reactive
  let fieldsByType = new Map<string, Set<string>>();

  // Prop picker dialog state
  let isPropPickerOpen = $state(false);
  let propPickerPosition = $state({ top: 0, left: 0 });

  // Prop filter popup state
  let isFilterPopupOpen = $state(false);
  let filterPopupPosition = $state({ top: 0, left: 0 });
  let filterPopupField = $state<string | null>(null);
  // Pending filter edits (not yet saved to config)
  let pendingFilterEdit = $state<DeckFilter | null>(null);

  // Derived: get the current active view
  const activeView = $derived.by(() => getActiveView(config));

  // Derived: active columns from the current view
  // Union of explicit columns and filter fields so users can manipulate both
  const activeColumns = $derived.by(() => {
    const seenFields = new Set<string>();
    const result: ColumnConfig[] = [];

    // First add explicit columns
    if (activeView.columns && activeView.columns.length > 0) {
      for (const col of activeView.columns) {
        const normalized = normalizeColumn(col);
        if (!seenFields.has(normalized.field)) {
          seenFields.add(normalized.field);
          result.push(normalized);
        }
      }
    }

    // Then add filter fields that aren't already in columns
    for (const filter of activeView.filters) {
      if (!seenFields.has(filter.field)) {
        seenFields.add(filter.field);
        result.push(normalizeColumn({ field: filter.field }));
      }
    }

    return result;
  });

  // Derived: get type IDs from type filter (convert names to IDs)
  const filteredTypeIds = $derived.by(() => {
    const typeFilter = activeView.filters.find(
      (f) => f.field === 'flint_type' || f.field === 'type'
    );
    if (!typeFilter) return [];

    // Get the filter values (could be type names)
    let filterValues: string[];
    if (Array.isArray(typeFilter.value)) {
      filterValues = typeFilter.value;
    } else if (typeof typeFilter.value === 'string') {
      filterValues = [typeFilter.value];
    } else {
      return [];
    }

    // Convert type names to type IDs
    const allNoteTypes = getNoteTypes();
    return filterValues
      .map((nameOrId) => {
        // First check if it's already a type ID
        const byId = allNoteTypes.find((t) => t.id === nameOrId);
        if (byId) return byId.id;
        // Otherwise, look up by name
        const byName = allNoteTypes.find((t) => t.name === nameOrId);
        return byName?.id || null;
      })
      .filter((id): id is string => id !== null);
  });

  // First filtered type (for new note creation)
  const firstFilteredTypeId = $derived(
    filteredTypeIds.length > 0 ? filteredTypeIds[0] : null
  );

  // Pagination derived values
  const pageSize = $derived(config.pageSize || DEFAULT_PAGE_SIZE);
  const offset = $derived(currentPage * pageSize);

  // Get note types from Automerge
  const noteTypes = $derived(getNoteTypes());
  const noteTypeNames = $derived(noteTypes.map((t) => t.name));
  const typeIcons = $derived.by(() => {
    const icons: Record<string, string> = {};
    for (const t of noteTypes) {
      if (t.icon) {
        icons[t.name] = t.icon;
      }
    }
    return icons;
  });

  // Load schema fields from Automerge note types
  $effect(() => {
    // Clear existing maps
    schemaFields.clear();
    fieldsByType.clear();

    const noteTypesDict = getNoteTypesDict();
    const typesToCheck =
      filteredTypeIds.length > 0 ? filteredTypeIds : Object.keys(noteTypesDict);

    for (const typeId of typesToCheck) {
      const noteType = noteTypesDict[typeId];
      if (noteType?.properties) {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation variable
        const typeFields = new Set<string>();
        for (const prop of noteType.properties) {
          typeFields.add(prop.name);
          if (!schemaFields.has(prop.name)) {
            schemaFields.set(prop.name, {
              name: prop.name,
              type: prop.type as SchemaFieldInfo['type'],
              options: prop.constraints?.options,
              required: prop.required
            });
          }
        }
        fieldsByType.set(typeId, typeFields);
      }
    }
  });

  // Available schema fields for filter/column pickers
  // When a type filter is active, only show props from notes of that type
  const availableSchemaFields = $derived.by(() => {
    const notes = Object.values(getNotesDict());
    return getAvailableFields(notes, getNoteTypesDict(), filteredTypeIds);
  });

  // Effective config that includes pending filter edits
  const effectiveConfig = $derived.by(() => {
    const pending = pendingFilterEdit;
    const viewFilters = activeView.filters;

    let finalFilters: DeckFilter[];
    if (pending) {
      const existingIndex = viewFilters.findIndex((f) => f.field === pending.field);
      if (existingIndex >= 0) {
        finalFilters = [...viewFilters];
        finalFilters[existingIndex] = pending;
      } else {
        finalFilters = [...viewFilters, pending];
      }
    } else {
      finalFilters = viewFilters;
    }

    return {
      filters: finalFilters,
      sort: activeView.sort,
      columns: activeView.columns,
      pageSize: config.pageSize || DEFAULT_PAGE_SIZE
    };
  });

  // Execute query against Automerge document
  const queryResult = $derived.by(() => {
    const allNotes = Object.values(getNotesDict());
    return runDeckQuery(effectiveConfig, allNotes, getNoteTypesDict(), {
      offset
    });
  });

  const results = $derived(queryResult.notes);
  const total = $derived(queryResult.total);
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  // Reset to page 0 when config changes
  let lastConfigStr = $state('');
  $effect(() => {
    const configStr = JSON.stringify(effectiveConfig);
    if (configStr !== lastConfigStr) {
      lastConfigStr = configStr;
      currentPage = 0;
    }
  });

  async function handleNewNoteClick(): Promise<void> {
    // Use first filtered type, or default type
    const noteTypeId = firstFilteredTypeId || 'type-note';

    // Pre-fill props from equality filters
    const prefillProps: Record<string, unknown> = {};
    for (const filter of activeView.filters) {
      const isEquality = !filter.operator || filter.operator === '=';
      const isSimpleValue = typeof filter.value === 'string';
      const isSystemField =
        filter.field === 'type' ||
        filter.field === 'flint_type' ||
        filter.field.startsWith('flint_');
      const isEmptyMarker = filter.value === EMPTY_FILTER_VALUE;

      if (isEquality && isSimpleValue && !isSystemField && !isEmptyMarker) {
        prefillProps[filter.field] = filter.value;
      }
    }

    // Create note via Automerge state (async)
    const noteId = await createNote({
      title: '',
      content: '',
      type: noteTypeId
    });

    // Set prefilled props if any
    if (Object.keys(prefillProps).length > 0) {
      setNoteProps(noteId, prefillProps);
    }

    newlyCreatedNoteId = noteId;
  }

  /**
   * Save a single field value directly (for inline chip editing)
   */
  function saveFieldValue(noteId: string, field: string, value: unknown): void {
    const note = getNote(noteId);
    if (!note) return;

    // Update note props
    const updatedProps = { ...note.props, [field]: value };
    setNoteProps(noteId, updatedProps);
  }

  /**
   * Save a title change
   */
  function saveTitleValue(noteId: string, newTitle: string): void {
    const note = getNote(noteId);
    if (!note || newTitle === note.title) return;

    updateNote(noteId, { title: newTitle });
  }

  /**
   * Change a note's type
   */
  function saveTypeValue(noteId: string, newTypeId: string): void {
    const note = getNote(noteId);
    if (!note || newTypeId === note.type) return;

    updateNote(noteId, { type: newTypeId });
  }

  // Get filter for the popup field
  const filterPopupFilter = $derived.by(() => {
    if (!filterPopupField) return null;
    if (pendingFilterEdit && pendingFilterEdit.field === filterPopupField) {
      return pendingFilterEdit;
    }
    const existing = activeView.filters.find((f) => f.field === filterPopupField);
    if (existing) return existing;
    return { field: filterPopupField, operator: '=' as const, value: '' };
  });

  // Get field info for the popup field
  const filterPopupFieldInfo = $derived.by(() => {
    if (!filterPopupField) return null;

    // Special handling for flint_type - always enrich with note type options
    if (filterPopupField === 'flint_type' || filterPopupField === 'type') {
      const baseField = SYSTEM_FIELDS.find((f) => f.name === 'flint_type');
      if (baseField && noteTypeNames.length > 0) {
        return { ...baseField, options: noteTypeNames, optionIcons: typeIcons };
      }
      return baseField || null;
    }

    const schemaField = availableSchemaFields.find((f) => f.name === filterPopupField);
    if (schemaField) return schemaField;

    const systemField = SYSTEM_FIELDS.find(
      (f) =>
        f.name === filterPopupField ||
        f.name === `flint_${filterPopupField}` ||
        filterPopupField === f.name.replace('flint_', '')
    );
    if (systemField) {
      return systemField;
    }
    return {
      name: filterPopupField,
      label: filterPopupField.replace(/^flint_/, '').replace(/_/g, ' '),
      type: 'string' as const,
      isSystem: false
    };
  });

  function handlePropClick(field: string, position: { top: number; left: number }): void {
    filterPopupField = field;
    filterPopupPosition = position;
    isFilterPopupOpen = true;
  }

  function handleFilterUpdate(filter: DeckFilter): void {
    pendingFilterEdit = filter;
  }

  function commitPendingFilter(): void {
    const pending = pendingFilterEdit;
    if (!pending) return;

    const viewFilters = activeView.filters;
    const existingIndex = viewFilters.findIndex((f) => f.field === pending.field);
    let newFilters: DeckFilter[];
    if (existingIndex >= 0) {
      newFilters = [...viewFilters];
      newFilters[existingIndex] = pending;
    } else {
      newFilters = [...viewFilters, pending];
    }

    pendingFilterEdit = null;
    setTimeout(() => {
      updateActiveView({ filters: newFilters });
    }, 0);
  }

  function handleFilterRemove(): void {
    if (!filterPopupField) return;
    pendingFilterEdit = null;
    const newColumns = activeColumns.filter((c) => c.field !== filterPopupField);
    const newFilters = activeView.filters.filter((f) => f.field !== filterPopupField);
    isFilterPopupOpen = false;
    filterPopupField = null;
    setTimeout(() => {
      updateActiveView({
        columns: newColumns,
        filters: newFilters
      });
    }, 0);
  }

  function handleAddPropClick(event: MouseEvent): void {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    propPickerPosition = {
      top: rect.bottom + 4,
      left: rect.left
    };
    isPropPickerOpen = true;
  }

  function handlePropSelect(fieldName: string): void {
    const newColumn: ColumnConfig = { field: fieldName };
    const newColumns = [...activeColumns, newColumn];
    setTimeout(() => {
      updateActiveView({ columns: newColumns });
    }, 0);
  }

  const usedFields = $derived(activeColumns.map((c) => c.field));

  // View Management
  function updateActiveView(viewUpdate: Partial<DeckView>): void {
    const views = [...(config.views || [])];
    const activeIndex = config.activeView || 0;

    if (views[activeIndex]) {
      views[activeIndex] = { ...views[activeIndex], ...viewUpdate };
      updateConfig({ ...config, views });
    } else {
      const currentView = getActiveView(config);
      const newView: DeckView = { ...currentView, ...viewUpdate };
      updateConfig({ ...config, views: [newView], activeView: 0 });
    }
  }

  function handleViewChange(index: number): void {
    pendingFilterEdit = null;
    updateConfig({ ...config, activeView: index });
  }

  function handleViewCreate(name: string): void {
    const newView: DeckView = createDefaultView(name);
    const newViews = [...(config.views || []), newView];
    updateConfig({
      ...config,
      views: newViews,
      activeView: newViews.length - 1
    });
  }

  function handleViewRename(index: number, newName: string): void {
    const views = [...(config.views || [])];
    if (views[index]) {
      views[index] = { ...views[index], name: newName };
      updateConfig({ ...config, views });
    }
  }

  function handleViewDelete(index: number): void {
    const views = config.views || [];
    if (views.length <= 1) return;

    const newViews = views.filter((_, i) => i !== index);
    const currentActive = config.activeView || 0;
    const newActiveView = Math.min(currentActive, newViews.length - 1);

    if (index === currentActive) {
      pendingFilterEdit = null;
    }

    updateConfig({
      ...config,
      views: newViews,
      activeView: newActiveView
    });
  }

  function handleViewDuplicate(index: number): void {
    const views = config.views || [];
    const viewToDuplicate = views[index];
    if (!viewToDuplicate) return;

    const newView: DeckView = {
      ...viewToDuplicate,
      name: `${viewToDuplicate.name} (Copy)`,
      filters: [...viewToDuplicate.filters],
      columns: viewToDuplicate.columns ? [...viewToDuplicate.columns] : undefined,
      sort: viewToDuplicate.sort ? { ...viewToDuplicate.sort } : undefined
    };

    const newViews = [...views, newView];
    updateConfig({
      ...config,
      views: newViews,
      activeView: newViews.length - 1
    });
  }

  function handleSort(field: string, order: 'asc' | 'desc'): void {
    updateActiveView({ sort: { field, order } });
  }

  function handleVisibilityToggle(field: string, visible: boolean): void {
    const newColumns = activeColumns.map((col) =>
      col.field === field ? { ...col, visible } : col
    );
    updateActiveView({ columns: newColumns });
  }

  function handleColumnsReorder(newColumns: ColumnConfig[]): void {
    updateActiveView({ columns: newColumns });
  }

  function handlePageChange(page: number): void {
    currentPage = page;
  }

  function handlePageSizeChange(size: PageSize): void {
    updateConfig({ ...config, pageSize: size });
    currentPage = 0;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="deck-widget"
  onmousedown={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.stopPropagation()}
>
  <!-- Header -->
  <div class="deck-header">
    <DeckViewSwitcher
      views={config.views || []}
      activeViewIndex={config.activeView || 0}
      onViewChange={handleViewChange}
      onViewRename={handleViewRename}
      onViewCreate={handleViewCreate}
      onViewDelete={handleViewDelete}
      onViewDuplicate={handleViewDuplicate}
    />
    {#if total > 0}
      {@const startItem = currentPage * pageSize + 1}
      {@const endItem = Math.min((currentPage + 1) * pageSize, total)}
      <span class="deck-count">{startItem}-{endItem} of {total}</span>
    {:else}
      <span class="deck-count">0 notes</span>
    {/if}
  </div>

  <!-- Validation warnings -->
  {#if validationWarnings.length > 0}
    <div class="validation-warning">
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
        <path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span class="warning-text">{validationWarnings[0].message}</span>
      {#if validationWarnings.length > 1}
        <span class="warning-more">+{validationWarnings.length - 1} more</span>
      {/if}
    </div>
  {/if}

  <!-- Toolbar -->
  <DeckToolbar
    columns={activeColumns}
    availableFields={availableSchemaFields}
    sort={activeView.sort}
    onNewNote={handleNewNoteClick}
    onPropClick={handlePropClick}
    onAddProp={handleAddPropClick}
    onVisibilityToggle={handleVisibilityToggle}
    onSort={handleSort}
    onReorder={handleColumnsReorder}
  />

  <!-- Prop Picker Dialog -->
  <DeckPropPickerDialog
    isOpen={isPropPickerOpen}
    fields={availableSchemaFields}
    excludeFields={usedFields}
    position={propPickerPosition}
    onSelect={handlePropSelect}
    onClose={() => (isPropPickerOpen = false)}
  />

  <!-- Prop Filter Popup -->
  <DeckFilterPopup
    isOpen={isFilterPopupOpen}
    filter={filterPopupFilter}
    fieldInfo={filterPopupFieldInfo}
    position={filterPopupPosition}
    onUpdate={handleFilterUpdate}
    onRemove={handleFilterRemove}
    onClose={() => {
      commitPendingFilter();
      isFilterPopupOpen = false;
      filterPopupField = null;
    }}
  />

  <!-- Content -->
  <div class="deck-content">
    {#if results.length === 0 && total === 0}
      <div class="deck-empty">No notes match this query</div>
    {:else}
      <div class="note-list" role="list">
        {#each results as result (result.id)}
          <DeckNoteListItem
            note={result}
            columns={activeColumns}
            {schemaFields}
            {fieldsByType}
            autoFocus={result.id === newlyCreatedNoteId}
            isHighlighted={result.id === newlyCreatedNoteId}
            onTitleSave={(newTitle) => saveTitleValue(result.id, newTitle)}
            onTypeChange={(newType) => Promise.resolve(saveTypeValue(result.id, newType))}
            onFieldSave={(field, value) => saveFieldValue(result.id, field, value)}
            onOpen={() => onNoteOpen?.(result.id)}
            onRowBlur={() => {
              if (result.id === newlyCreatedNoteId) {
                newlyCreatedNoteId = null;
              }
            }}
          />
        {/each}
      </div>

      <!-- Pagination Controls -->
      <DeckPaginationControls
        {currentPage}
        {totalPages}
        {pageSize}
        {total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    {/if}
  </div>
</div>

<style>
  .deck-widget {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: visible;
  }

  .deck-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    gap: 0.5rem;
  }

  .deck-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .deck-content {
    padding: 0.5rem 0;
  }

  .deck-empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  /* Validation warning banner */
  .validation-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-warning, rgba(245, 158, 11, 0.1));
    border: 1px solid var(--border-warning, rgba(245, 158, 11, 0.3));
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-warning, #d97706);
  }

  .validation-warning svg {
    flex-shrink: 0;
    stroke: currentColor;
  }

  .validation-warning .warning-text {
    flex: 1;
    min-width: 0;
  }

  .validation-warning .warning-more {
    flex-shrink: 0;
    opacity: 0.7;
    font-size: 0.7rem;
  }

  .note-list {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
  }
</style>
