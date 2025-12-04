<script lang="ts">
  import type { DeckResultNote, ColumnConfig } from './types';
  import type { MetadataFieldType } from '../../../../server/core/metadata-schema';
  import EditableCell from './EditableCell.svelte';
  import { notesStore } from '../../services/noteStore.svelte';

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
    /** Whether this note is being edited (full row editing mode) */
    isEditing: boolean;
    /** Current editing values (when in full row editing mode) */
    editingValues?: { title: string; metadata: Record<string, unknown> };
    /** Schema fields for type-aware editing */
    schemaFields: Map<string, SchemaFieldInfo>;
    /** Whether currently saving */
    isSaving: boolean;
    /** Called when note title is clicked */
    onTitleClick: (event: MouseEvent) => void;
    /** Called when edit button is clicked */
    onEditClick: (event: MouseEvent) => void;
    /** Called when a field value is saved inline (for chip editing) */
    onFieldSave?: (field: string, value: unknown) => void;
    /** Called when editing value changes (for full row editing) */
    onValueChange?: (field: string, value: unknown) => void;
    /** Called on keydown during editing */
    onKeyDown?: (event: KeyboardEvent) => void;
    /** Called when save button is clicked */
    onSave?: () => void;
    /** Called when cancel button is clicked */
    onCancel?: () => void;
  }

  let {
    note,
    columns,
    isEditing,
    editingValues,
    schemaFields,
    isSaving,
    onTitleClick,
    onEditClick,
    onFieldSave,
    onValueChange,
    onKeyDown,
    onSave,
    onCancel
  }: Props = $props();

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

  // Get editing value for a field
  function getEditingValue(field: string): unknown {
    if (!editingValues) return '';
    if (field === 'title' || field === 'flint_title') return editingValues.title;
    return editingValues.metadata[field] ?? '';
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

  // Get note type icon
  function getTypeIcon(typeName: string): string | undefined {
    const noteType = notesStore.noteTypes.find((t) => t.name === typeName);
    return noteType?.icon;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="note-list-item"
  class:editing={isEditing}
  role="listitem"
  onmousedown={isEditing ? (e) => e.stopPropagation() : undefined}
  onclick={isEditing ? (e) => e.stopPropagation() : undefined}
>
  {#if isEditing && editingValues}
    <!-- Editing mode -->
    <div class="note-editing">
      <div class="note-title-row">
        <EditableCell
          value={editingValues.title}
          fieldType="system"
          field="title"
          onChange={(v) => onValueChange?.('title', v)}
          {onKeyDown}
          autoFocus={true}
        />
        <div class="editing-actions">
          <button
            class="save-btn"
            onclick={onSave}
            disabled={isSaving}
            type="button"
            title="Save (Enter)"
          >
            {#if isSaving}...{:else}✓{/if}
          </button>
          <button
            class="cancel-btn"
            onclick={onCancel}
            disabled={isSaving}
            type="button"
            title="Cancel (Escape)"
          >
            ✕
          </button>
        </div>
      </div>
      {#if columns.length > 0}
        <div class="note-props editing-props">
          {#each columns as column (column.field)}
            <div class="prop-edit-chip">
              <span class="prop-edit-label">{getColumnLabel(column)}</span>
              {#if isEditable(column.field)}
                <EditableCell
                  value={getEditingValue(column.field)}
                  fieldType={getFieldType(column.field)}
                  field={column.field}
                  onChange={(v) => onValueChange?.(column.field, v)}
                  {onKeyDown}
                  options={getFieldOptions(column.field)}
                />
              {:else}
                <span class="prop-value">{getDisplayValue(column.field)}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Display mode with inline editable chips -->
    <div class="note-display">
      <div class="note-title-row">
        <button
          class="note-title"
          class:untitled={!note.title}
          onclick={onTitleClick}
          type="button"
        >
          {#if getTypeIcon(note.type)}
            <span class="type-icon">{getTypeIcon(note.type)}</span>
          {/if}
          <span class="title-text">{note.title || 'Untitled'}</span>
        </button>
        <button class="edit-btn" onclick={onEditClick} type="button"> Edit </button>
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
                  {#each options as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
              {:else if editable && fieldType === 'boolean'}
                <input
                  type="checkbox"
                  class="prop-inline-checkbox"
                  checked={Boolean(rawValue)}
                  onchange={(e) =>
                    handleFieldChange(column.field, e.currentTarget.checked)}
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
  {/if}
</div>

<style>
  .note-list-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
  }

  .note-list-item:last-child {
    border-bottom: none;
  }

  .note-list-item:hover .edit-btn {
    opacity: 1;
  }

  .note-display,
  .note-editing {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .note-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .note-title {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .note-title:hover {
    background: var(--bg-secondary);
  }

  .note-title:hover .title-text {
    text-decoration: underline;
  }

  .type-icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  .note-title.untitled .title-text {
    color: var(--text-tertiary);
    font-style: italic;
    font-weight: 400;
  }

  .edit-btn {
    margin-left: auto;
    padding: 0.25rem 0.375rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
  }

  .edit-btn:hover {
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

  .prop-inline-input[type='number'] {
    min-width: 4rem;
  }

  .editing-props {
    gap: 0.375rem;
  }

  .prop-edit-chip {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    font-size: 0.75rem;
    overflow: hidden;
  }

  .prop-edit-label {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem 0.125rem 0.625rem;
    font-size: 0.65rem;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
    border-right: 1px solid var(--border-light);
  }

  .prop-edit-chip .prop-value {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.625rem 0.125rem 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .editing-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }

  .save-btn,
  .cancel-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .save-btn {
    background: var(--accent-success, #22c55e);
    color: white;
  }

  .save-btn:hover:not(:disabled) {
    background: #16a34a;
  }

  .cancel-btn {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
  }

  .save-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .note-list-item.editing {
    background: var(--bg-secondary);
    border-radius: 0.375rem;
    padding: 0.5rem;
    margin: 0.25rem 0;
  }
</style>
