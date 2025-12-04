<script lang="ts">
  import type {
    DeckConfig,
    DeckResultNote,
    DeckFilter,
    ColumnConfig,
    FilterFieldInfo
  } from './types';
  import { normalizeColumn, fieldDefToFilterInfo, SYSTEM_FIELDS } from './types';
  import { runDeckQuery } from './queryService.svelte';
  import { messageBus, type NoteEvent } from '../../services/messageBus.svelte';
  import DeckToolbar from './DeckToolbar.svelte';
  import NoteListItem from './NoteListItem.svelte';
  import PropPickerDialog from './PropPickerDialog.svelte';
  import PropFilterPopup from './PropFilterPopup.svelte';
  import type {
    MetadataFieldType,
    MetadataFieldDefinition
  } from '../../../../server/core/metadata-schema';

  // Schema field info for inline editing
  interface SchemaFieldInfo {
    name: string;
    type: MetadataFieldType;
    options?: string[];
  }

  // Type for editing values
  interface EditingValues {
    title: string;
    metadata: Record<string, unknown>;
  }

  interface Props {
    config: DeckConfig;
    onConfigChange: (config: DeckConfig) => void;
    onNoteClick: (noteId: string, shiftKey?: boolean) => void;
  }

  let { config, onConfigChange, onNoteClick }: Props = $props();

  // State
  let results = $state<DeckResultNote[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let isEditingName = $state(false);
  let editingName = $state('');
  let nameInputRef = $state<HTMLInputElement | null>(null);

  // Inline editing state
  let editingNoteId = $state<string | null>(null);
  let editingValues = $state<EditingValues | null>(null);
  let editingVaultId = $state<string | null>(null);
  let editingOriginalTitle = $state<string>('');
  let isCreatingNewNote = $state(false);
  let isSavingNote = $state(false);

  // Schema fields for inline editing
  let schemaFields = $state<Map<string, SchemaFieldInfo>>(new Map());
  let schemaLoadedForType = $state<string | null>(null);
  let availableSchemaFields = $state<FilterFieldInfo[]>([]);

  // Note types for type selector
  let noteTypes = $state<string[]>([]);

  // Prop picker dialog state
  let isPropPickerOpen = $state(false);
  let propPickerPosition = $state({ top: 0, left: 0 });

  // Prop filter popup state
  let isFilterPopupOpen = $state(false);
  let filterPopupPosition = $state({ top: 0, left: 0 });
  let filterPopupField = $state<string | null>(null);
  // Pending filter edits (not yet saved to config)
  let pendingFilterEdit = $state<DeckFilter | null>(null);

  // Derived: active columns
  const activeColumns = $derived.by(() => {
    if (config.columns && config.columns.length > 0) {
      return config.columns.map(normalizeColumn);
    }
    return [] as ColumnConfig[];
  });

  // Derived: get single type if filtered by flint_type
  const filteredType = $derived.by(() => {
    const typeFilter = config.filters.find((f) => f.field === 'flint_type');
    return typeof typeFilter?.value === 'string' ? typeFilter.value : null;
  });

  // Track previous type to detect changes
  let previousFilteredType = $state<string | null>(null);

  // Clear columns when note type changes
  $effect(() => {
    const currentType = filteredType;
    if (previousFilteredType !== null && currentType !== previousFilteredType) {
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

  // Load schema fields when filtered type changes
  $effect(() => {
    if (filteredType && filteredType !== schemaLoadedForType) {
      loadSchemaFields(filteredType);
    } else if (!filteredType) {
      schemaFields = new Map();
      availableSchemaFields = [];
      schemaLoadedForType = null;
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
      }
    } catch (e) {
      console.error('Failed to load note types:', e);
      noteTypes = ['note'];
    }
  }

  /**
   * Load schema fields for a note type
   */
  async function loadSchemaFields(typeName: string): Promise<void> {
    try {
      const typeInfo = await window.api?.getNoteTypeInfo({ typeName });
      if (typeInfo?.metadata_schema?.fields) {
        const newMap = new Map<string, SchemaFieldInfo>();
        const fieldInfos: FilterFieldInfo[] = [];
        for (const field of typeInfo.metadata_schema
          .fields as MetadataFieldDefinition[]) {
          newMap.set(field.name, {
            name: field.name,
            type: field.type,
            options: field.constraints?.options
          });
          fieldInfos.push(fieldDefToFilterInfo(field));
        }
        schemaFields = newMap;
        availableSchemaFields = fieldInfos;
        schemaLoadedForType = typeName;
      }
    } catch (e) {
      console.error('Failed to load schema fields:', e);
      schemaFields = new Map();
      availableSchemaFields = [];
    }
  }

  // Effective config that includes pending filter edits (for live query updates)
  const effectiveConfig = $derived.by(() => {
    const pending = pendingFilterEdit;
    if (!pending) return config;
    // Merge pending filter into config
    const existingIndex = config.filters.findIndex((f) => f.field === pending.field);
    let newFilters: DeckFilter[];
    if (existingIndex >= 0) {
      newFilters = [...config.filters];
      newFilters[existingIndex] = pending;
    } else {
      newFilters = [...config.filters, pending];
    }
    return { ...config, filters: newFilters };
  });

  // Execute query when config or pending filter changes
  $effect(() => {
    void effectiveConfig;
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
    if (editingNoteId) {
      return false;
    }

    if (event.type === 'notes.bulkRefresh' || event.type === 'file.sync-completed') {
      return true;
    }

    if (filteredType) {
      if (event.type === 'note.created' && event.note.type === filteredType) {
        return true;
      }
      if (event.type === 'note.moved') {
        return event.oldType === filteredType || event.newType === filteredType;
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
    loading = true;
    error = null;

    try {
      // Use effectiveConfig to include pending filter changes
      results = await runDeckQuery(effectiveConfig);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Query failed';
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleNoteClick(result: DeckResultNote, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onNoteClick(result.id, event.shiftKey);
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

    const noteType = filteredType || 'note';
    const placeholderId = `__new__${Date.now()}`;
    const newNote: DeckResultNote = {
      id: placeholderId,
      title: '',
      type: noteType,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata: {}
    };

    results = [newNote, ...results];

    editingNoteId = placeholderId;
    editingVaultId = vault.id;
    isCreatingNewNote = true;
    editingValues = {
      title: '',
      metadata: {}
    };
  }

  async function startEditingNote(
    result: DeckResultNote,
    event: MouseEvent
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const vault = await window.api?.getCurrentVault();
    if (!vault?.id) {
      return;
    }

    editingNoteId = result.id;
    editingVaultId = vault.id;
    isCreatingNewNote = false;
    editingOriginalTitle = result.title || '';
    editingValues = {
      title: result.title || '',
      metadata: { ...result.metadata }
    };
  }

  function updateEditingValue(field: string, value: unknown): void {
    if (!editingValues) return;

    if (field === 'title' || field === 'flint_title') {
      editingValues = { ...editingValues, title: String(value) };
    } else {
      editingValues = {
        ...editingValues,
        metadata: { ...editingValues.metadata, [field]: value }
      };
    }
  }

  async function saveEditingNote(): Promise<void> {
    if (!editingNoteId || !editingValues || isSavingNote) return;

    isSavingNote = true;

    try {
      const newTitle = editingValues.title.trim();
      const metadataSnapshot = $state.snapshot(editingValues.metadata);

      if (isCreatingNewNote) {
        const noteType = filteredType || 'note';

        await window.api?.createNote({
          type: noteType,
          identifier: newTitle,
          content: '',
          metadata: metadataSnapshot,
          vaultId: editingVaultId ?? undefined
        });

        results = results.filter((r) => r.id !== editingNoteId);
      } else {
        const existingNote = await window.api?.getNote({
          identifier: editingNoteId,
          vaultId: editingVaultId ?? undefined
        });

        // Update metadata (excluding system fields)
        if (Object.keys(metadataSnapshot).length > 0) {
          await window.api?.updateNote({
            identifier: editingNoteId,
            content: existingNote?.content ?? '',
            metadata: metadataSnapshot,
            vaultId: editingVaultId ?? undefined
          });
        }

        // Update title via renameNote if it changed
        if (newTitle !== editingOriginalTitle) {
          await window.api?.renameNote({
            identifier: editingNoteId,
            newIdentifier: newTitle,
            vaultId: editingVaultId ?? undefined
          });
        }

        const noteIndex = results.findIndex((r) => r.id === editingNoteId);
        if (noteIndex !== -1) {
          results[noteIndex] = {
            ...results[noteIndex],
            title: newTitle || '',
            metadata: { ...results[noteIndex].metadata, ...editingValues.metadata }
          };
          results = [...results];
        }
      }

      // Only refresh for new notes (to get the real note with proper ID)
      // For edits, the optimistic update is sufficient
      const shouldRefresh = isCreatingNewNote;

      editingNoteId = null;
      editingVaultId = null;
      editingValues = null;
      editingOriginalTitle = '';
      isCreatingNewNote = false;

      if (shouldRefresh) {
        debouncedRefresh();
      }
    } catch (e) {
      console.error('Failed to save note:', e);
      error = e instanceof Error ? e.message : 'Failed to save note';
    } finally {
      isSavingNote = false;
    }
  }

  function cancelEditing(): void {
    if (!editingNoteId) return;

    if (isCreatingNewNote) {
      results = results.filter((r) => r.id !== editingNoteId);
    }

    editingNoteId = null;
    editingVaultId = null;
    editingValues = null;
    editingOriginalTitle = '';
    isCreatingNewNote = false;
  }

  function handleEditingKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      saveEditingNote();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  function handleRetryClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    executeQuery();
  }

  function handleTypeChange(newType: string): void {
    // Update or add the type filter
    const existingFilters = config.filters.filter((f) => f.field !== 'flint_type');
    const newFilters: DeckFilter[] = [
      { field: 'flint_type', value: newType },
      ...existingFilters
    ];

    setTimeout(() => {
      onConfigChange({
        ...config,
        filters: newFilters,
        columns: [] // Clear columns when type changes
      });
    }, 0);
  }

  // Get filter for the popup field (use pending edit if available)
  const filterPopupFilter = $derived.by(() => {
    if (!filterPopupField) return null;
    // Use pending edit if available
    if (pendingFilterEdit && pendingFilterEdit.field === filterPopupField) {
      return pendingFilterEdit;
    }
    const existing = config.filters.find((f) => f.field === filterPopupField);
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
    if (systemField) return systemField;
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
    pendingFilterEdit = null;
    // Update or add the filter
    const existingIndex = config.filters.findIndex((f) => f.field === pending.field);
    let newFilters: DeckFilter[];
    if (existingIndex >= 0) {
      newFilters = [...config.filters];
      newFilters[existingIndex] = pending;
    } else {
      newFilters = [...config.filters, pending];
    }
    setTimeout(() => {
      onConfigChange({
        ...config,
        filters: newFilters
      });
    }, 0);
  }

  function handleFilterRemove(): void {
    if (!filterPopupField) return;
    // Clear pending edit since we're removing this field
    pendingFilterEdit = null;
    // Remove both the column and any filter for this field
    const newColumns = activeColumns.filter((c) => c.field !== filterPopupField);
    const newFilters = config.filters.filter((f) => f.field !== filterPopupField);
    isFilterPopupOpen = false;
    filterPopupField = null;
    setTimeout(() => {
      onConfigChange({
        ...config,
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
      onConfigChange({
        ...config,
        columns: newColumns
      });
    }, 0);
  }

  // Get fields already used as columns (for exclusion)
  const usedFields = $derived(activeColumns.map((c) => c.field));

  function startEditingName(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    editingName = config.name || '';
    isEditingName = true;
    setTimeout(() => {
      nameInputRef?.focus();
      nameInputRef?.select();
    }, 0);
  }

  function saveNameEdit(): void {
    if (!isEditingName) return;
    const newName = editingName.trim();
    isEditingName = false;
    if (newName !== (config.name || '')) {
      setTimeout(() => {
        onConfigChange({
          ...config,
          name: newName || undefined
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="deck-widget"
  onmousedown={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
>
  <!-- Header -->
  <div class="deck-header">
    {#if isEditingName}
      <input
        bind:this={nameInputRef}
        type="text"
        class="deck-name-input"
        bind:value={editingName}
        onblur={saveNameEdit}
        onkeydown={handleNameKeydown}
        placeholder="New Deck"
      />
    {:else}
      <button
        class="deck-name"
        class:placeholder={!config.name}
        onclick={startEditingName}
        type="button"
        title="Click to edit name"
      >
        {config.name || 'New Deck'}
      </button>
    {/if}
    {#if !loading}
      <span class="deck-count"
        >{results.length} note{results.length === 1 ? '' : 's'}</span
      >
    {/if}
  </div>

  <!-- Toolbar -->
  <DeckToolbar
    typeName={filteredType}
    {noteTypes}
    columns={activeColumns}
    availableFields={availableSchemaFields}
    sort={config.sort}
    onNewNote={handleNewNoteClick}
    onTypeChange={handleTypeChange}
    onPropClick={handlePropClick}
    onAddProp={handleAddPropClick}
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
    {:else if results.length === 0}
      <div class="deck-empty">No notes match this query</div>
    {:else}
      <div class="note-list" role="list">
        {#each results as result (result.id)}
          <NoteListItem
            note={result}
            columns={activeColumns}
            isEditing={editingNoteId === result.id}
            editingValues={editingNoteId === result.id
              ? (editingValues ?? undefined)
              : undefined}
            {schemaFields}
            isSaving={isSavingNote}
            onTitleClick={(e) => handleNoteClick(result, e)}
            onEditClick={(e) => startEditingNote(result, e)}
            onValueChange={updateEditingValue}
            onKeyDown={handleEditingKeyDown}
            onSave={saveEditingNote}
            onCancel={cancelEditing}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .deck-widget {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .deck-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
  }

  .deck-name {
    padding: 0.125rem 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .deck-name:hover {
    background: var(--bg-tertiary);
  }

  .deck-name.placeholder {
    color: var(--text-muted);
  }

  .deck-name-input {
    padding: 0.125rem 0.25rem;
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 600;
    outline: none;
  }

  .deck-count {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .deck-content {
    padding: 0.5rem 0;
  }

  .deck-loading,
  .deck-error,
  .deck-empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-tertiary);
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

  .deck-error button:hover {
    background: var(--bg-tertiary);
  }

  .note-list {
    display: flex;
    flex-direction: column;
  }
</style>
