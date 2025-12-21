<script lang="ts">
  import type { DeckFilter } from '../lib/automerge/deck';
  import { getAvailableFields } from '../lib/automerge/deck';
  import AutomergeDeckFilterRow from './AutomergeDeckFilterRow.svelte';
  import {
    getNoteTypes,
    getNoteTypesDict,
    getNotesDict
  } from '../lib/automerge/state.svelte';

  interface Props {
    filters: DeckFilter[];
    /** Type ID to load schema fields from (e.g., 'type-xxxxxxxx') */
    typeId?: string;
    onFiltersChange: (filters: DeckFilter[]) => void;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API compatibility
  let { filters, typeId: _typeId, onFiltersChange }: Props = $props();

  // Local editing state - includes incomplete filters
  let editingFilters = $state<DeckFilter[]>([...filters]);

  // Track previous props to detect external changes
  let prevFiltersJson = $state(JSON.stringify(filters));

  // Sync from props only when props actually change (not on local edits)
  $effect(() => {
    const newFiltersJson = JSON.stringify(filters);
    if (newFiltersJson !== prevFiltersJson) {
      prevFiltersJson = newFiltersJson;
      // Props changed externally - merge with local incomplete filters
      const incomplete = editingFilters.filter((f) => !isFilterComplete(f));
      editingFilters = [...filters, ...incomplete];
    }
  });

  // Check if a filter is complete (has field and value)
  function isFilterComplete(filter: DeckFilter): boolean {
    if (!filter.field || !filter.field.trim()) return false;
    if (filter.value === undefined || filter.value === null) return false;
    if (typeof filter.value === 'string' && !filter.value.trim()) return false;
    if (Array.isArray(filter.value) && filter.value.length === 0) return false;
    return true;
  }

  // Get only complete filters
  function getCompleteFilters(allFilters: DeckFilter[]): DeckFilter[] {
    return allFilters.filter(isFilterComplete);
  }

  // Propagate complete filters to parent
  function syncToParent(): void {
    const complete = getCompleteFilters(editingFilters);
    onFiltersChange(complete);
  }

  // Get available fields from Automerge document
  const schemaFields = $derived.by(() => {
    const notes = Object.values(getNotesDict());
    return getAvailableFields(notes, getNoteTypesDict());
  });

  // Value suggestions for fields (type names for flint_type)
  const valueSuggestions = $derived.by(() => {
    const suggestions: Record<string, string[]> = {};

    // Add note type names as suggestions for flint_type field
    const noteTypes = getNoteTypes();
    suggestions['flint_type'] = noteTypes.map((t) => t.name);

    // Note: Field options would need to come from note type schema properties
    // For now, we only provide suggestions for flint_type

    return suggestions;
  });

  function handleFilterChange(index: number, newFilter: DeckFilter): void {
    editingFilters[index] = newFilter;
    editingFilters = [...editingFilters]; // Trigger reactivity
    syncToParent();
  }

  function handleRemoveFilter(index: number): void {
    editingFilters = editingFilters.filter((_, i) => i !== index);
    syncToParent();
  }

  function handleAddFilter(): void {
    const newFilter: DeckFilter = {
      field: '',
      operator: '=',
      value: ''
    };
    editingFilters = [...editingFilters, newFilter];
    // Don't sync to parent - incomplete filter
  }

  function getValueSuggestionsForField(fieldName: string): string[] {
    return valueSuggestions[fieldName] || [];
  }

  // Track fields already used in filters (to prevent duplicates)
  const usedFields = $derived(
    new Set(editingFilters.map((f) => f.field).filter((f) => f && f.trim()))
  );
</script>

<div class="filter-builder">
  <div class="filter-builder-header">
    <span class="header-title">Filters</span>
  </div>

  <div class="filter-list">
    {#if editingFilters.length === 0}
      <div class="empty-state">
        <span>No filters configured</span>
        <span class="empty-hint">Add filters to narrow down results</span>
      </div>
    {:else}
      {#each editingFilters as filter, index (index)}
        <AutomergeDeckFilterRow
          {filter}
          fields={schemaFields}
          valueSuggestions={getValueSuggestionsForField(filter.field)}
          disabledFields={usedFields}
          onChange={(newFilter) => handleFilterChange(index, newFilter)}
          onRemove={() => handleRemoveFilter(index)}
        />
      {/each}
    {/if}
  </div>

  <button class="add-filter-btn" onclick={handleAddFilter} type="button">
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
    Add Filter
  </button>
</div>

<style>
  .filter-builder {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    border: 1px solid var(--border-light);
  }

  .filter-builder-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .header-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .filter-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
    text-align: center;
  }

  .empty-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .add-filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px dashed var(--border-medium);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-filter-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .add-filter-btn svg {
    stroke: currentColor;
  }
</style>
