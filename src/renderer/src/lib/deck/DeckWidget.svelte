<script lang="ts">
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type {
    DeckConfig,
    DeckView,
    DeckResultNote,
    DeckFilter,
    ColumnConfig,
    FilterFieldInfo,
    PageSize
  } from './types';
  import {
    normalizeColumn,
    fieldDefToFilterInfo,
    SYSTEM_FIELDS,
    getActiveView,
    createDefaultView,
    EMPTY_FILTER_VALUE,
    DEFAULT_PAGE_SIZE
  } from './types';
  import { runDeckQuery } from './queryService.svelte';
  import PaginationControls from './PaginationControls.svelte';
  import { messageBus, type NoteEvent } from '../../services/messageBus.svelte';
  import DeckToolbar from './DeckToolbar.svelte';
  import NoteListItem from './NoteListItem.svelte';
  import PropPickerDialog from './PropPickerDialog.svelte';
  import PropFilterPopup from './PropFilterPopup.svelte';
  import ViewSwitcher from './ViewSwitcher.svelte';
  import type {
    MetadataFieldType,
    MetadataFieldDefinition,
    MetadataFieldConstraints
  } from '../../../../server/core/metadata-schema';
  import type { DeckValidationWarning } from './yaml-utils';

  // Schema field info for inline editing
  interface SchemaFieldInfo {
    name: string;
    type: MetadataFieldType;
    options?: string[];
    constraints?: MetadataFieldConstraints;
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
  // This stays in sync when CodeMirror skips re-decoration or when switching notes
  let config = $derived(initialConfig);

  // Wrapper to notify parent of config changes (derived value updates via prop)
  function updateConfig(newConfig: DeckConfig): void {
    onConfigChange(newConfig);
  }

  // State
  let results = $state<DeckResultNote[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let newlyCreatedNoteId = $state<string | null>(null);
  let suppressRefresh = $state(false);

  // Pagination state
  let currentPage = $state(0);
  let total = $state(0);

  // Schema fields for inline editing (need $state for reassignment reactivity)
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let schemaFields = $state(new SvelteMap<string, SchemaFieldInfo>());
  let schemaLoadedForTypes = $state<string | null>(null); // Serialized array of types we've loaded
  let availableSchemaFields = $state<FilterFieldInfo[]>([]);
  // Track which fields belong to which types (for muted styling on out-of-schema fields)
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let fieldsByType = $state(new SvelteMap<string, Set<string>>());

  // Note types (used for determining default type for new notes)
  let noteTypes = $state<string[]>([]);
  // Type icons map (type name -> icon)
  let typeIcons = $state<Record<string, string>>({});

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
  const activeColumns = $derived.by(() => {
    if (activeView.columns && activeView.columns.length > 0) {
      return activeView.columns.map(normalizeColumn);
    }
    return [] as ColumnConfig[];
  });

  // Derived: get types from flint_type filter in active view (supports single value or array via IN operator)
  const filteredTypes = $derived.by(() => {
    const typeFilter = activeView.filters.find((f) => f.field === 'flint_type');
    if (!typeFilter) return [];
    if (Array.isArray(typeFilter.value)) {
      return typeFilter.value;
    }
    if (typeof typeFilter.value === 'string') {
      return [typeFilter.value];
    }
    return [];
  });

  // First filtered type (for new note creation)
  const firstFilteredType = $derived(filteredTypes.length > 0 ? filteredTypes[0] : null);

  // Pagination derived values
  const pageSize = $derived(config.pageSize || DEFAULT_PAGE_SIZE);
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const offset = $derived(currentPage * pageSize);

  // Load schema fields when filtered types change (union of all types' fields)
  // If no type filter, load fields from ALL note types
  $effect(() => {
    const typesToLoad = filteredTypes.length > 0 ? filteredTypes : noteTypes;
    const typesKey = JSON.stringify([...typesToLoad].sort());

    if (typesToLoad.length > 0 && typesKey !== schemaLoadedForTypes) {
      loadSchemaFieldsForTypes(typesToLoad);
    } else if (typesToLoad.length === 0 && schemaLoadedForTypes !== null) {
      // No types available yet - clear fields
      schemaFields = new SvelteMap();
      availableSchemaFields = [];
      fieldsByType = new SvelteMap();
      schemaLoadedForTypes = null;
    }
  });

  // Load note types on mount
  $effect(() => {
    loadNoteTypes();
  });

  /**
   * Load available note types
   */
  async function loadNoteTypes(): Promise<void> {
    try {
      const types = await window.api?.listNoteTypes();
      if (types) {
        noteTypes = types.map((t: { name: string }) => t.name);
        // Build icon map
        const icons: Record<string, string> = {};
        for (const t of types) {
          if (t.icon) {
            icons[t.name] = t.icon;
          }
        }
        typeIcons = icons;
      }
    } catch (e) {
      console.error('Failed to load note types:', e);
      noteTypes = ['note'];
      typeIcons = {};
    }
  }

  /**
   * Load schema fields for multiple note types (union of all fields)
   */
  async function loadSchemaFieldsForTypes(typeNames: string[]): Promise<void> {
    try {
      const newMap = new SvelteMap<string, SchemaFieldInfo>();
      const fieldInfoMap = new SvelteMap<string, FilterFieldInfo>();
      const newFieldsByType = new SvelteMap<string, Set<string>>();

      // Load schema for each type and merge fields (union)
      await Promise.all(
        typeNames.map(async (typeName) => {
          const typeInfo = await window.api?.getNoteTypeInfo({ typeName });
          if (typeInfo?.metadata_schema?.fields) {
            const typeFields = new SvelteSet<string>();
            for (const field of typeInfo.metadata_schema
              .fields as MetadataFieldDefinition[]) {
              typeFields.add(field.name);
              // Only add if not already present (first type wins for duplicate field names)
              if (!newMap.has(field.name)) {
                newMap.set(field.name, {
                  name: field.name,
                  type: field.type,
                  options: field.constraints?.options,
                  constraints: field.constraints,
                  required: field.required
                });
                fieldInfoMap.set(field.name, fieldDefToFilterInfo(field));
              }
            }
            newFieldsByType.set(typeName, typeFields);
          }
        })
      );

      schemaFields = newMap;
      availableSchemaFields = Array.from(fieldInfoMap.values());
      fieldsByType = newFieldsByType;
      schemaLoadedForTypes = JSON.stringify([...typeNames].sort());
    } catch (e) {
      console.error('Failed to load schema fields:', e);
      schemaFields = new SvelteMap();
      availableSchemaFields = [];
      fieldsByType = new SvelteMap();
    }
  }

  // Effective config that includes pending filter edits (for live query updates)
  // Uses the active view's filters merged with pending edits
  const effectiveConfig = $derived.by(() => {
    const pending = pendingFilterEdit;
    const viewFilters = activeView.filters;

    let finalFilters: DeckFilter[];
    if (pending) {
      // Merge pending filter into view filters
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

    // Return a config-like object for the query service
    return {
      filters: finalFilters,
      sort: activeView.sort,
      columns: activeView.columns,
      pageSize: config.pageSize || DEFAULT_PAGE_SIZE
    };
  });

  // Track last query config to avoid redundant queries
  let lastQueryConfig = $state<string>('');
  let lastOffset = $state<number>(0);

  // Reset to page 0 when filters/sort/pageSize change
  $effect(() => {
    const configStr = JSON.stringify(effectiveConfig);
    // When config changes (not just offset), reset to first page
    if (configStr !== lastQueryConfig) {
      currentPage = 0;
    }
  });

  // Execute query when config or page changes
  $effect(() => {
    const configStr = JSON.stringify(effectiveConfig);
    const currentOffset = offset;

    // Skip if nothing has changed
    if (configStr === lastQueryConfig && currentOffset === lastOffset) {
      return;
    }

    lastQueryConfig = configStr;
    lastOffset = currentOffset;
    executeQuery();
  });

  // Subscribe to note events for real-time updates
  $effect(() => {
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
        if (isRelevantEvent(event)) {
          debouncedRefresh();
        }
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  });

  function isRelevantEvent(event: NoteEvent): boolean {
    // Skip all events while we're creating a note (to prevent flash)
    if (suppressRefresh) {
      return false;
    }

    if (event.type === 'notes.bulkRefresh' || event.type === 'file.sync-completed') {
      return true;
    }

    // Skip ALL events for notes we just created (already added optimistically)
    // This prevents re-sorting while the user is still editing the new note
    if (newlyCreatedNoteId) {
      // Check all possible ID fields in the event
      const eventNoteId =
        ('noteId' in event && event.noteId) ||
        ('oldId' in event && event.oldId) ||
        ('newId' in event && event.newId) ||
        (event.type === 'note.created' && event.note?.id);

      if (eventNoteId === newlyCreatedNoteId) {
        return false;
      }
    }

    // Check if event is relevant to filtered types (if any)
    if (filteredTypes.length > 0) {
      if (event.type === 'note.created' && filteredTypes.includes(event.note.type)) {
        return true;
      }
      if (event.type === 'note.moved') {
        return (
          filteredTypes.includes(event.oldType) || filteredTypes.includes(event.newType)
        );
      }
      if ('noteId' in event) {
        return results.some((r) => r.id === event.noteId);
      }
      if ('oldId' in event) {
        return results.some((r) => r.id === event.oldId);
      }
    }

    return true;
  }

  function debouncedRefresh(): void {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      executeQuery();
      refreshTimeout = null;
    }, 300);
  }

  async function executeQuery(): Promise<void> {
    // Only show loading state if we don't have results yet
    // This prevents flash when refreshing existing results
    const showLoading = results.length === 0;
    if (showLoading) {
      loading = true;
    }
    error = null;

    try {
      // Use effectiveConfig to include pending filter changes
      const queryResult = await runDeckQuery(effectiveConfig, { offset });
      results = queryResult.notes;
      total = queryResult.total;

      // If we're on an invalid page (e.g., after deletion), go back to last valid page
      if (results.length === 0 && currentPage > 0 && total > 0) {
        const lastValidPage = Math.max(0, Math.ceil(total / pageSize) - 1);
        if (currentPage > lastValidPage) {
          currentPage = lastValidPage;
          // Query will re-run due to offset change
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Query failed';
      results = [];
      total = 0;
    } finally {
      if (showLoading) {
        loading = false;
      }
    }
  }

  async function handleNewNoteClick(): Promise<void> {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }

    const vault = await window.api?.getCurrentVault();
    if (!vault?.id) {
      error = 'No vault available';
      return;
    }

    // Suppress refreshes during note creation to prevent flash
    suppressRefresh = true;

    try {
      // Use first filtered type, or default to 'note'
      const noteType = firstFilteredType || 'note';

      // Pre-fill metadata from equality filters (so note matches the deck's constraints)
      const prefillMetadata: Record<string, unknown> = {};
      for (const filter of activeView.filters) {
        // Only use simple equality filters with single string values
        const isEquality = !filter.operator || filter.operator === '=';
        const isSimpleValue = typeof filter.value === 'string';
        const isSystemField =
          filter.field === 'type' ||
          filter.field === 'flint_type' ||
          filter.field.startsWith('flint_');
        // Skip empty filter marker - it means "no value" not a literal string
        const isEmptyMarker = filter.value === EMPTY_FILTER_VALUE;

        if (isEquality && isSimpleValue && !isSystemField && !isEmptyMarker) {
          prefillMetadata[filter.field] = filter.value;
        }
      }

      // Create the note immediately with empty title
      const createdNote = await window.api?.createNote({
        type: noteType,
        identifier: '',
        content: '',
        metadata: prefillMetadata,
        vaultId: vault.id
      });

      if (createdNote) {
        // Add the new note to the top of results
        // Merge prefillMetadata with API response (API response takes precedence)
        const newNote: DeckResultNote = {
          id: createdNote.id,
          title: createdNote.title || '',
          type: createdNote.type,
          created: createdNote.created,
          updated: createdNote.updated,
          metadata: { ...prefillMetadata, ...(createdNote.metadata || {}) }
        };
        results = [newNote, ...results];
        newlyCreatedNoteId = createdNote.id;
      }
    } catch (e) {
      console.error('Failed to create note:', e);
      error = e instanceof Error ? e.message : 'Failed to create note';
    } finally {
      // Re-enable refreshes after a short delay to let any pending events pass
      setTimeout(() => {
        suppressRefresh = false;
      }, 100);
    }
  }

  // System fields that cannot be modified via updateNote
  const SYSTEM_METADATA_FIELDS = new Set([
    'flint_id',
    'flint_filename',
    'flint_type',
    'flint_kind',
    'flint_created',
    'flint_updated',
    'flint_title',
    'id',
    'type',
    'filename',
    'title',
    'created',
    'updated'
  ]);

  /**
   * Filter out system fields from metadata
   */
  function filterSystemFields(
    metadata: Record<string, unknown>
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!SYSTEM_METADATA_FIELDS.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Save a single field value directly (for inline chip editing)
   */
  async function saveFieldValue(
    noteId: string,
    field: string,
    value: unknown
  ): Promise<void> {
    try {
      const vault = await window.api?.getCurrentVault();
      if (!vault?.id) return;

      const existingNote = await window.api?.getNote({
        identifier: noteId,
        vaultId: vault.id
      });

      if (!existingNote) return;

      // Update metadata with the new field value, filtering out system fields
      const baseMetadata = filterSystemFields(existingNote.metadata || {});
      const updatedMetadata = { ...baseMetadata, [field]: value };

      await window.api?.updateNote({
        identifier: noteId,
        content: existingNote.content ?? '',
        metadata: $state.snapshot(updatedMetadata),
        vaultId: vault.id
      });

      // Optimistically update local results
      const noteIndex = results.findIndex((r) => r.id === noteId);
      if (noteIndex !== -1) {
        results[noteIndex] = {
          ...results[noteIndex],
          metadata: { ...results[noteIndex].metadata, [field]: value }
        };
        results = [...results];
      }
    } catch (e) {
      console.error('Failed to save field value:', e);
      error = e instanceof Error ? e.message : 'Failed to save';
    }
  }

  /**
   * Save a title change (rename note)
   */
  async function saveTitleValue(noteId: string, newTitle: string): Promise<void> {
    try {
      const vault = await window.api?.getCurrentVault();
      if (!vault?.id) return;

      // Get the current note to check if title actually changed
      const noteIndex = results.findIndex((r) => r.id === noteId);
      if (noteIndex === -1) return;

      const currentTitle = results[noteIndex].title || '';
      if (newTitle === currentTitle) return;

      await window.api?.renameNote({
        identifier: noteId,
        newIdentifier: newTitle,
        vaultId: vault.id
      });

      // Optimistically update local results
      results[noteIndex] = {
        ...results[noteIndex],
        title: newTitle
      };
      results = [...results];
    } catch (e) {
      console.error('Failed to rename note:', e);
      error = e instanceof Error ? e.message : 'Failed to rename';
    }
  }

  /**
   * Change a note's type (move to different type)
   */
  async function saveTypeValue(noteId: string, newType: string): Promise<void> {
    try {
      const vault = await window.api?.getCurrentVault();
      if (!vault?.id) return;

      // Get the current note
      const noteIndex = results.findIndex((r) => r.id === noteId);
      if (noteIndex === -1) return;

      const currentType = results[noteIndex].type;
      if (newType === currentType) return;

      await window.api?.moveNote({
        identifier: noteId,
        newType,
        vaultId: vault.id
      });

      // Optimistically update local results
      results[noteIndex] = {
        ...results[noteIndex],
        type: newType
      };
      results = [...results];
    } catch (e) {
      console.error('Failed to change note type:', e);
      error = e instanceof Error ? e.message : 'Failed to change type';
    }
  }

  function handleRetryClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    executeQuery();
  }

  // Get filter for the popup field (use pending edit if available)
  const filterPopupFilter = $derived.by(() => {
    if (!filterPopupField) return null;
    // Use pending edit if available
    if (pendingFilterEdit && pendingFilterEdit.field === filterPopupField) {
      return pendingFilterEdit;
    }
    const existing = activeView.filters.find((f) => f.field === filterPopupField);
    if (existing) return existing;
    // Create a default filter for new props
    return { field: filterPopupField, operator: '=' as const, value: '' };
  });

  // Get field info for the popup field
  const filterPopupFieldInfo = $derived.by(() => {
    if (!filterPopupField) return null;
    // Check schema fields first
    const schemaField = availableSchemaFields.find((f) => f.name === filterPopupField);
    if (schemaField) return schemaField;
    // Check system fields
    const systemField = SYSTEM_FIELDS.find(
      (f) =>
        f.name === filterPopupField ||
        f.name === `flint_${filterPopupField}` ||
        filterPopupField === f.name.replace('flint_', '')
    );
    if (systemField) {
      // For flint_type, add note types as options for IN operator
      if (systemField.name === 'flint_type' && noteTypes.length > 0) {
        return { ...systemField, options: noteTypes, optionIcons: typeIcons };
      }
      return systemField;
    }
    // Fallback
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
    // Store as pending edit - don't save to config yet (would destroy widget)
    pendingFilterEdit = filter;
  }

  function commitPendingFilter(): void {
    const pending = pendingFilterEdit;
    if (!pending) return;

    // Update or add the filter in the active view
    const viewFilters = activeView.filters;
    const existingIndex = viewFilters.findIndex((f) => f.field === pending.field);
    let newFilters: DeckFilter[];
    if (existingIndex >= 0) {
      newFilters = [...viewFilters];
      newFilters[existingIndex] = pending;
    } else {
      newFilters = [...viewFilters, pending];
    }

    // Clear pending edit
    pendingFilterEdit = null;

    // Defer the update to next tick to ensure Svelte effects have settled
    setTimeout(() => {
      updateActiveView({ filters: newFilters });
    }, 0);
  }

  function handleFilterRemove(): void {
    if (!filterPopupField) return;
    // Clear pending edit since we're removing this field
    pendingFilterEdit = null;
    // Remove both the column and any filter for this field from the active view
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

  // Get fields already used as columns (for exclusion)
  const usedFields = $derived(activeColumns.map((c) => c.field));

  // ========================================
  // View Management
  // ========================================

  /**
   * Update the active view with partial changes
   */
  function updateActiveView(viewUpdate: Partial<DeckView>): void {
    console.log('updateActiveView called:', { viewUpdate, configViews: config.views });
    const views = [...(config.views || [])];
    const activeIndex = config.activeView || 0;

    if (views[activeIndex]) {
      // Multi-view format: update existing view
      console.log('updateActiveView: multi-view path');
      views[activeIndex] = { ...views[activeIndex], ...viewUpdate };
      updateConfig({ ...config, views });
    } else {
      // Legacy format or empty views: create first view from current state
      console.log('updateActiveView: legacy path');
      const currentView = getActiveView(config);
      const newView: DeckView = { ...currentView, ...viewUpdate };
      updateConfig({ ...config, views: [newView], activeView: 0 });
    }
  }

  function handleViewChange(index: number): void {
    // Clear pending filter when switching views
    pendingFilterEdit = null;
    updateConfig({
      ...config,
      activeView: index
    });
  }

  function handleViewCreate(name: string): void {
    const newView: DeckView = createDefaultView(name);
    const newViews = [...(config.views || []), newView];
    updateConfig({
      ...config,
      views: newViews,
      activeView: newViews.length - 1 // Switch to new view
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
    if (views.length <= 1) return; // Can't delete last view

    const newViews = views.filter((_, i) => i !== index);
    const currentActive = config.activeView || 0;
    const newActiveView = Math.min(currentActive, newViews.length - 1);

    // Clear pending filter since we may be deleting the active view
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
    updateActiveView({
      sort: { field, order }
    });
  }

  function handleVisibilityToggle(field: string, visible: boolean): void {
    const newColumns = activeColumns.map((col) =>
      col.field === field ? { ...col, visible } : col
    );
    updateActiveView({ columns: newColumns });
  }

  // ========================================
  // Pagination Handlers
  // ========================================

  function handlePageChange(page: number): void {
    currentPage = page;
  }

  function handlePageSizeChange(size: PageSize): void {
    // Update config with new page size
    updateConfig({ ...config, pageSize: size });
    // Reset to first page when page size changes
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
    <ViewSwitcher
      views={config.views || []}
      activeViewIndex={config.activeView || 0}
      onViewChange={handleViewChange}
      onViewRename={handleViewRename}
      onViewCreate={handleViewCreate}
      onViewDelete={handleViewDelete}
      onViewDuplicate={handleViewDuplicate}
    />
    {#if !loading && total > 0}
      {@const startItem = currentPage * pageSize + 1}
      {@const endItem = Math.min((currentPage + 1) * pageSize, total)}
      <span class="deck-count">{startItem}-{endItem} of {total}</span>
    {:else if !loading}
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
  />

  <!-- Prop Picker Dialog -->
  <PropPickerDialog
    isOpen={isPropPickerOpen}
    fields={availableSchemaFields}
    excludeFields={usedFields}
    position={propPickerPosition}
    onSelect={handlePropSelect}
    onClose={() => (isPropPickerOpen = false)}
  />

  <!-- Prop Filter Popup -->
  <PropFilterPopup
    isOpen={isFilterPopupOpen}
    filter={filterPopupFilter}
    fieldInfo={filterPopupFieldInfo}
    position={filterPopupPosition}
    onUpdate={handleFilterUpdate}
    onRemove={handleFilterRemove}
    onClose={() => {
      // Commit any pending filter changes when popup closes
      commitPendingFilter();
      isFilterPopupOpen = false;
      filterPopupField = null;
    }}
  />

  <!-- Content -->
  <div class="deck-content">
    {#if loading}
      <div class="deck-loading">Loading...</div>
    {:else if error}
      <div class="deck-error">
        <span>{error}</span>
        <button onclick={handleRetryClick}>Retry</button>
      </div>
    {:else if results.length === 0 && total === 0}
      <div class="deck-empty">No notes match this query</div>
    {:else}
      <div class="note-list" role="list">
        {#each results as result (result.id)}
          <NoteListItem
            note={result}
            columns={activeColumns}
            {schemaFields}
            {fieldsByType}
            autoFocus={result.id === newlyCreatedNoteId}
            isHighlighted={result.id === newlyCreatedNoteId}
            onTitleSave={(newTitle) => saveTitleValue(result.id, newTitle)}
            onTypeChange={(newType) => saveTypeValue(result.id, newType)}
            onFieldSave={(field, value) => saveFieldValue(result.id, field, value)}
            onOpen={() => onNoteOpen?.(result.id)}
            onRowBlur={() => {
              if (result.id === newlyCreatedNoteId) {
                newlyCreatedNoteId = null;
                // Schedule a refresh to re-sort the list after a short delay
                // This gives time for any pending saves to complete
                setTimeout(() => {
                  executeQuery();
                }, 200);
              }
            }}
          />
        {/each}
      </div>

      <!-- Pagination Controls -->
      <PaginationControls
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

  .deck-loading,
  .deck-error,
  .deck-empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .deck-error {
    color: var(--accent-error, #ef4444);
  }

  .deck-error button {
    margin-top: 0.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
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

  .deck-error button:hover {
    background: var(--bg-tertiary);
  }

  .note-list {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
  }
</style>
