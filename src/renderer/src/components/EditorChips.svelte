<script lang="ts">
  import type {
    MetadataSchema,
    MetadataFieldDefinition
  } from '../../../server/core/metadata-schema';
  import NoteLinkPicker from './NoteLinkPicker.svelte';
  import { notesStore } from '../services/noteStore.svelte';

  interface NoteData {
    id: string;
    type: string;
    created: string;
    updated: string;
    metadata: Record<string, unknown>;
  }

  interface Props {
    /** The current note */
    note: NoteData;
    /** The metadata schema for this note type */
    metadataSchema: MetadataSchema;
    /** Which fields to show as chips (defaults to ['flint_created']) */
    editorChips?: string[];
    /** Called when a metadata field value changes */
    onMetadataChange?: (field: string, value: unknown) => void;
    /** Whether editing is disabled */
    disabled?: boolean;
    /** Called when a linked note is clicked */
    onNoteClick?: (noteId: string) => void;
  }

  let {
    note,
    metadataSchema,
    editorChips,
    onMetadataChange,
    disabled = false,
    onNoteClick
  }: Props = $props();

  // Track expanded state
  let expanded = $state(false);

  // Default chips if none configured
  const defaultChips = ['flint_created'];

  // Get the chips to display
  const visibleChips = $derived(editorChips?.length ? editorChips : defaultChips);

  // Get all available fields (schema fields + system fields)
  const allFields = $derived.by(() => {
    const fields: string[] = ['flint_created', 'flint_updated'];
    // Add schema fields
    for (const field of metadataSchema.fields) {
      fields.push(field.name);
    }
    return fields;
  });

  // Fields to show based on expanded state
  const displayedFields = $derived(expanded ? allFields : visibleChips);

  // Check if expand button should show
  const hasMoreFields = $derived(allFields.length > visibleChips.length);

  // Get schema field definition
  function getFieldDef(field: string): MetadataFieldDefinition | undefined {
    return metadataSchema.fields.find((f) => f.name === field);
  }

  // Check if field is a system field (read-only)
  function isSystemField(field: string): boolean {
    return (
      field === 'flint_created' ||
      field === 'flint_updated' ||
      field === 'flint_id' ||
      field === 'flint_type' ||
      field === 'flint_filename'
    );
  }

  // Check if field is editable
  function isEditable(field: string): boolean {
    if (disabled) return false;
    return !isSystemField(field);
  }

  // Get field label
  function getFieldLabel(field: string): string {
    // System fields
    if (field === 'flint_created') return 'created';
    if (field === 'flint_updated') return 'updated';
    if (field === 'flint_id') return 'id';
    if (field === 'flint_type') return 'type';
    if (field === 'flint_filename') return 'filename';

    // Use field name, cleaning up underscores
    return field.replace(/_/g, ' ');
  }

  // Get raw value for a field
  function getRawValue(field: string): unknown {
    if (field === 'flint_created') return note.created;
    if (field === 'flint_updated') return note.updated;
    if (field === 'flint_type') return note.type;
    if (field === 'flint_id') return note.id;
    return note.metadata[field];
  }

  // Format relative time
  function formatRelativeTime(dateString: string): string {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          if (diffMins <= 1) return 'just now';
          return `${diffMins}m ago`;
        }
        return `${diffHours}h ago`;
      } else if (diffDays === 1) {
        return 'yesterday';
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks}w ago`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months}mo ago`;
      } else {
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit'
        });
      }
    } catch {
      return dateString;
    }
  }

  // Get note title by ID
  function getNoteTitleById(noteId: string): string {
    const note = notesStore.notes.find((n) => n.id === noteId);
    return note?.title || noteId;
  }

  // Get display value for a field
  function getDisplayValue(field: string): string {
    const raw = getRawValue(field);
    if (raw === undefined || raw === null) return '—';

    // Date fields - format relative
    if (field === 'flint_created' || field === 'flint_updated') {
      return formatRelativeTime(String(raw));
    }

    // Schema fields with special handling
    const def = getFieldDef(field);
    if (def?.type === 'date' && raw) {
      return formatRelativeTime(String(raw));
    }

    // Notelink - show title instead of ID
    if (def?.type === 'notelink' && typeof raw === 'string') {
      return getNoteTitleById(raw);
    }

    // Notelinks - show titles instead of IDs
    if (def?.type === 'notelinks' && Array.isArray(raw)) {
      if (raw.length === 0) return '—';
      return raw.map((id) => getNoteTitleById(String(id))).join(', ');
    }

    // Arrays
    if (Array.isArray(raw)) {
      return raw.length > 0 ? raw.join(', ') : '—';
    }

    // Booleans
    if (typeof raw === 'boolean') {
      return raw ? 'yes' : 'no';
    }

    return String(raw) || '—';
  }

  // Get field options for select fields
  function getFieldOptions(field: string): string[] {
    const def = getFieldDef(field);
    return def?.constraints?.options ?? [];
  }

  // Handle field change
  function handleFieldChange(field: string, value: unknown): void {
    onMetadataChange?.(field, value);
  }

  // Toggle expanded state
  function toggleExpanded(): void {
    expanded = !expanded;
  }
</script>

<div class="editor-chips">
  {#each displayedFields as field (field)}
    {@const def = getFieldDef(field)}
    {@const rawValue = getRawValue(field)}
    {@const editable = isEditable(field)}
    {@const options = getFieldOptions(field)}
    <div
      class="chip"
      class:chip-with-picker={editable &&
        (def?.type === 'notelink' || def?.type === 'notelinks')}
    >
      <span class="chip-label">{getFieldLabel(field)}</span>
      <span class="chip-divider"></span>
      {#if editable && def?.type === 'notelink'}
        <div class="chip-notelink">
          <NoteLinkPicker
            value={rawValue as string | null}
            multiple={false}
            onSelect={(value) => handleFieldChange(field, value)}
            placeholder=""
            compact={true}
            {onNoteClick}
          />
        </div>
      {:else if editable && def?.type === 'notelinks'}
        <div class="chip-notelink">
          <NoteLinkPicker
            value={rawValue as string[] | null}
            multiple={true}
            onSelect={(value) => handleFieldChange(field, value)}
            placeholder=""
            compact={true}
            {onNoteClick}
          />
        </div>
      {:else if editable && def?.type === 'select' && options.length > 0}
        <select
          class="chip-select"
          value={String(rawValue || '')}
          onchange={(e) => handleFieldChange(field, e.currentTarget.value)}
        >
          <option value="">—</option>
          {#each options as opt (opt)}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      {:else if editable && def?.type === 'boolean'}
        <input
          type="checkbox"
          class="chip-checkbox"
          checked={Boolean(rawValue)}
          onchange={(e) => handleFieldChange(field, e.currentTarget.checked)}
        />
      {:else if editable && def?.type === 'date'}
        <input
          type="date"
          class="chip-date"
          value={rawValue ? String(rawValue).split('T')[0] : ''}
          onchange={(e) => handleFieldChange(field, e.currentTarget.value)}
        />
      {:else if editable && def?.type === 'number'}
        <input
          type="number"
          class="chip-input"
          value={rawValue ?? ''}
          onblur={(e) => {
            const val = e.currentTarget.value;
            handleFieldChange(field, val ? Number(val) : null);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      {:else if editable}
        <input
          type="text"
          class="chip-input"
          value={String(rawValue || '')}
          onblur={(e) => handleFieldChange(field, e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      {:else}
        <span class="chip-value">{getDisplayValue(field)}</span>
      {/if}
    </div>
  {/each}

  {#if hasMoreFields}
    <button
      class="expand-btn"
      class:expanded
      onclick={toggleExpanded}
      type="button"
      title={expanded ? 'Show fewer fields' : 'Show all fields'}
    >
      {expanded ? '−' : '…'}
    </button>
  {/if}
</div>

<style>
  .editor-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding-left: 0.25rem;
    margin-top: 0.25rem;
  }

  .chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    font-size: 0.7rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .chip.chip-with-picker {
    overflow: visible;
    position: relative;
  }

  .chip-label {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem 0.125rem 0.625rem;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    border-radius: 9999px 0 0 9999px;
  }

  .chip-divider {
    width: 1px;
    background: var(--border-light);
  }

  .chip-value {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.625rem 0.125rem 0.5rem;
    color: var(--text-secondary);
  }

  .chip-input,
  .chip-select,
  .chip-date {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    min-width: 3rem;
    outline: none;
  }

  .chip-input:focus,
  .chip-select:focus,
  .chip-date:focus {
    background: var(--bg-primary);
  }

  .chip-select {
    cursor: pointer;
    padding-right: 0.25rem;
  }

  .chip-checkbox {
    margin: 0 0.5rem;
    cursor: pointer;
  }

  .chip-date {
    min-width: 7rem;
  }

  .chip-notelink {
    min-width: 6rem;
    position: relative;
  }

  .chip-notelink :global(.picker-input),
  .chip-notelink :global(.single-selected),
  .chip-notelink :global(.selected-notes) {
    border-radius: 0 9999px 9999px 0;
  }

  .chip-notelink :global(.note-link-picker) {
    width: 100%;
  }

  .chip-notelink :global(.picker-input) {
    border: none;
    border-radius: 0;
    min-height: auto;
    font-size: 0.7rem;
    background: transparent;
  }

  .chip-notelink :global(.picker-input:focus-within) {
    background: transparent;
  }

  .chip-notelink :global(.search-input) {
    padding: 0.125rem 0.5rem;
    font-size: 0.7rem;
    background: transparent;
  }

  .chip-notelink :global(.search-input:focus) {
    background: transparent;
  }

  .chip-notelink :global(.selected-notes) {
    padding: 0.125rem 0.375rem;
    gap: 0.5rem;
    background: transparent;
  }

  .chip-notelink :global(.selected-tag) {
    font-size: 0.65rem;
    padding: 0 0.25rem;
  }

  .chip-notelink :global(.single-selected) {
    padding: 0.125rem 0.5rem;
    font-size: 0.7rem;
    background: transparent;
    gap: 0.25rem;
  }

  .chip-notelink :global(.selected-title) {
    color: var(--text-secondary);
    font-size: 0.7rem;
  }

  .chip-notelink :global(.clear-btn) {
    padding: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .chip-notelink :global(.selected-tag) {
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0;
    gap: 0.125rem;
  }

  .chip-notelink :global(.tag-title) {
    color: var(--text-secondary);
  }

  .chip-notelink :global(.tag-remove) {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .chip-notelink :global(.dropdown) {
    font-size: 0.8125rem;
  }

  .chip-input[type='text'] {
    field-sizing: content;
    min-width: 2rem;
  }

  .chip-input[type='number'] {
    field-sizing: content;
    min-width: 3rem;
  }

  .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.375rem;
    padding: 0 0.375rem;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .expand-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .expand-btn.expanded {
    background: var(--bg-tertiary);
  }
</style>
