<script lang="ts">
  import type { DeckResultNote, ColumnConfig } from './types';
  import type { MetadataFieldType } from '../../../../server/core/metadata-schema';
  import NoteTypeDropdown from '../../components/NoteTypeDropdown.svelte';

  interface SchemaFieldInfo {
    name: string;
    type: MetadataFieldType;
    options?: string[];
  }

  interface Props {
    /** The note to display */
    note: DeckResultNote;
    /** Columns/props to show as chips */
    columns: ColumnConfig[];
    /** Schema fields for type-aware editing */
    schemaFields: Map<string, SchemaFieldInfo>;
    /** Whether to auto-focus the title input on mount */
    autoFocus?: boolean;
    /** Called when title is renamed inline */
    onTitleSave?: (newTitle: string) => void;
    /** Called when note type is changed */
    onTypeChange?: (newType: string) => Promise<void>;
    /** Called when a field value is saved inline */
    onFieldSave?: (field: string, value: unknown) => void;
    /** Called when open button is clicked */
    onOpen?: () => void;
  }

  let {
    note,
    columns,
    schemaFields,
    autoFocus = false,
    onTitleSave,
    onTypeChange,
    onFieldSave,
    onOpen
  }: Props = $props();

  // Local state for title editing (needs $state + $effect for editable prop sync)
  // eslint-disable-next-line svelte/prefer-writable-derived
  let titleValue = $state(note.title || '');
  let titleInputRef = $state<HTMLTextAreaElement | null>(null);

  // Auto-focus title input on mount if requested
  $effect(() => {
    if (autoFocus && titleInputRef) {
      titleInputRef.focus();
    }
  });

  // Handle type change
  async function handleTypeChange(newType: string): Promise<void> {
    if (onTypeChange) {
      await onTypeChange(newType);
    }
  }

  // Sync title value when note changes
  $effect(() => {
    titleValue = note.title || '';
  });

  // Handle title blur - save if changed
  function handleTitleBlur(): void {
    const newTitle = titleValue.trim();
    if (newTitle !== (note.title || '')) {
      onTitleSave?.(newTitle);
    }
  }

  // Handle title keydown
  function handleTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.target as HTMLTextAreaElement)?.blur();
    } else if (event.key === 'Escape') {
      titleValue = note.title || '';
      (event.target as HTMLTextAreaElement)?.blur();
    }
  }

  // Get display value for a field
  function getDisplayValue(field: string): string {
    if (field === 'title' || field === 'flint_title') {
      return note.title || '';
    }
    if (field === 'type' || field === 'flint_type') return note.type;
    if (field === 'created' || field === 'flint_created') {
      return formatDate(note.created);
    }
    if (field === 'updated' || field === 'flint_updated') {
      return formatDate(note.updated);
    }
    const val = note.metadata[field];
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }

  // Format date for display
  function formatDate(iso: string): string {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return iso;
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  // Get field type
  function getFieldType(field: string): MetadataFieldType | 'system' | 'unknown' {
    if (
      field === 'title' ||
      field === 'type' ||
      field === 'flint_title' ||
      field === 'flint_type'
    )
      return 'system';
    if (
      field === 'created' ||
      field === 'updated' ||
      field === 'flint_created' ||
      field === 'flint_updated'
    )
      return 'date';
    const schemaField = schemaFields.get(field);
    return schemaField?.type ?? 'unknown';
  }

  // Get field options for select fields
  function getFieldOptions(field: string): string[] {
    return schemaFields.get(field)?.options ?? [];
  }

  // Get column label
  function getColumnLabel(column: ColumnConfig): string {
    if (column.label) return column.label;
    return column.field.replace(/^flint_/, '').replace(/_/g, ' ');
  }

  // Check if field is editable
  function isEditable(field: string): boolean {
    // System fields (except title) are not editable
    if (field === 'type' || field === 'flint_type') return false;
    if (field === 'created' || field === 'updated') return false;
    if (field === 'flint_created' || field === 'flint_updated') return false;
    return true;
  }

  // Get raw value for a field (for editing)
  function getRawValue(field: string): unknown {
    if (field === 'title' || field === 'flint_title') return note.title || '';
    if (field === 'type' || field === 'flint_type') return note.type;
    if (field === 'created' || field === 'flint_created') return note.created;
    if (field === 'updated' || field === 'flint_updated') return note.updated;
    return note.metadata[field] ?? '';
  }

  // Handle inline field change (save immediately)
  function handleFieldChange(field: string, value: unknown): void {
    onFieldSave?.(field, value);
  }
</script>

<div class="note-list-item" role="listitem">
  <div class="note-display">
    <div class="note-title-row">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="type-dropdown-wrapper" onmousedown={(e) => e.stopPropagation()}>
        <NoteTypeDropdown
          currentType={note.type}
          onTypeChange={handleTypeChange}
          compact
        />
      </div>
      <textarea
        bind:this={titleInputRef}
        class="title-input"
        class:untitled={!titleValue}
        bind:value={titleValue}
        onblur={handleTitleBlur}
        onkeydown={handleTitleKeydown}
        onmousedown={(e) => e.stopPropagation()}
        placeholder="Untitled"
        rows="1"
      ></textarea>
      <button
        class="open-btn"
        onclick={() => onOpen?.()}
        onmousedown={(e) => e.stopPropagation()}
        type="button"
        title="Open note"
      >
        Open
      </button>
    </div>
    {#if columns.length > 0}
      <div class="note-props">
        {#each columns as column (column.field)}
          {@const fieldType = getFieldType(column.field)}
          {@const rawValue = getRawValue(column.field)}
          {@const options = getFieldOptions(column.field)}
          {@const editable = isEditable(column.field)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="prop-chip-inline"
            onmousedown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
          >
            <span class="prop-name">{getColumnLabel(column)}</span>
            <span class="prop-divider"></span>
            {#if editable && fieldType === 'select' && options.length > 0}
              <select
                class="prop-inline-select"
                value={String(rawValue || '')}
                onchange={(e) => handleFieldChange(column.field, e.currentTarget.value)}
              >
                <option value="">—</option>
                {#each options as opt (opt)}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            {:else if editable && fieldType === 'boolean'}
              <input
                type="checkbox"
                class="prop-inline-checkbox"
                checked={Boolean(rawValue)}
                onchange={(e) => handleFieldChange(column.field, e.currentTarget.checked)}
              />
            {:else if editable && fieldType === 'date'}
              <input
                type="date"
                class="prop-inline-date"
                value={rawValue ? String(rawValue).split('T')[0] : ''}
                onchange={(e) => handleFieldChange(column.field, e.currentTarget.value)}
              />
            {:else if editable && fieldType === 'number'}
              <input
                type="number"
                class="prop-inline-input"
                value={rawValue ?? ''}
                onblur={(e) => {
                  const val = e.currentTarget.value;
                  handleFieldChange(column.field, val ? Number(val) : null);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
              />
            {:else if editable}
              <input
                type="text"
                class="prop-inline-input"
                value={String(rawValue || '')}
                onblur={(e) => handleFieldChange(column.field, e.currentTarget.value)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
              />
            {:else}
              <span class="prop-value">{getDisplayValue(column.field) || '—'}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .note-list-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
    min-width: 0;
    width: 100%;
  }

  .note-list-item:last-child {
    border-bottom: none;
  }

  .note-display {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .note-title-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
  }

  .type-dropdown-wrapper {
    flex-shrink: 0;
  }

  .title-input {
    field-sizing: content;
    min-width: 3rem;
    max-width: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    outline: none;
    resize: none;
    overflow: hidden;
    line-height: 1.4;
    transition: background 0.15s ease;
  }

  .title-input:hover,
  .title-input:focus {
    background: var(--bg-secondary);
  }

  .title-input.untitled {
    color: var(--text-muted);
    font-weight: 400;
  }

  .title-input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
  }

  .open-btn {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.7rem;
    cursor: pointer;
    opacity: 0;
    z-index: 1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition:
      opacity 0.15s ease,
      background 0.15s ease;
  }

  .note-list-item:hover .open-btn {
    opacity: 1;
  }

  .open-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .note-props {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding-left: 0.25rem;
  }

  .prop-chip-inline {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    font-size: 0.7rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .prop-name {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem 0.125rem 0.625rem;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
  }

  .prop-divider {
    width: 1px;
    background: var(--border-light);
  }

  .prop-chip-inline .prop-value {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.625rem 0.125rem 0.5rem;
    color: var(--text-secondary);
  }

  .prop-inline-input,
  .prop-inline-select,
  .prop-inline-date {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    min-width: 3rem;
    outline: none;
  }

  .prop-inline-input:focus,
  .prop-inline-select:focus,
  .prop-inline-date:focus {
    background: var(--bg-primary);
  }

  .prop-inline-select {
    cursor: pointer;
    padding-right: 0.25rem;
  }

  .prop-inline-checkbox {
    margin: 0 0.5rem;
    cursor: pointer;
  }

  .prop-inline-date {
    min-width: 7rem;
  }

  .prop-inline-input[type='text'] {
    field-sizing: content;
    min-width: 2rem;
  }

  .prop-inline-input[type='number'] {
    min-width: 4rem;
  }
</style>
