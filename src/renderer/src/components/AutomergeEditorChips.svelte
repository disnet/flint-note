<script lang="ts">
  /**
   * Editor chips component for displaying and editing note properties
   * Renders configured properties as inline chips under the note title
   */
  import type {
    Note,
    NoteType,
    PropertyDefinition,
    PropertyType
  } from '../lib/automerge';
  import {
    getNote,
    getAllNotes,
    setActiveNoteId,
    addNoteToWorkspace
  } from '../lib/automerge';

  interface Props {
    /** The current note */
    note: Note;
    /** The note type with property definitions */
    noteType: NoteType | undefined;
    /** Called when a property value changes */
    onPropChange: (propName: string, value: unknown) => void;
    /** Whether editing is disabled */
    disabled?: boolean;
    /** Called when a linked note is clicked */
    onNoteClick?: (noteId: string) => void;
  }

  let { note, noteType, onPropChange, disabled = false, onNoteClick }: Props = $props();

  // Track expanded state
  let expanded = $state(false);

  // System fields (always available)
  const SYSTEM_FIELDS = ['created', 'updated'];

  // Get the chips to display (default to system fields if empty or undefined)
  const editorChips = $derived(
    noteType?.editorChips?.length ? noteType.editorChips : ['created', 'updated']
  );

  // Get property definitions from the note type
  const propertyDefs = $derived(noteType?.properties ?? []);

  // Get all available fields (system fields + custom properties)
  const allFields = $derived.by(() => {
    const fields: string[] = [...SYSTEM_FIELDS];
    for (const prop of propertyDefs) {
      fields.push(prop.name);
    }
    return fields;
  });

  // Fields to show based on expanded state
  const displayedFields = $derived(expanded ? allFields : editorChips);

  // Check if expand button should show
  const hasMoreFields = $derived(allFields.length > editorChips.length);

  // Get property definition by name
  function getPropDef(field: string): PropertyDefinition | undefined {
    return propertyDefs.find((p) => p.name === field);
  }

  // Check if field is a system field (read-only)
  function isSystemField(field: string): boolean {
    return SYSTEM_FIELDS.includes(field);
  }

  // Check if field is editable
  function isEditable(field: string): boolean {
    if (disabled) return false;
    return !isSystemField(field);
  }

  // Get field label
  function getFieldLabel(field: string): string {
    // System fields
    if (field === 'created') return 'created';
    if (field === 'updated') return 'updated';

    // Use property name, cleaning up underscores
    return field.replace(/_/g, ' ');
  }

  // Get raw value for a field
  function getRawValue(field: string): unknown {
    if (field === 'created') return note.created;
    if (field === 'updated') return note.updated;
    return note.props?.[field];
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
    const linkedNote = getNote(noteId);
    return linkedNote?.title || noteId;
  }

  // Get display value for a field
  function getDisplayValue(field: string): string {
    const raw = getRawValue(field);
    if (raw === undefined || raw === null) return '—';

    // Date fields - format relative
    if (field === 'created' || field === 'updated') {
      return formatRelativeTime(String(raw));
    }

    // Custom property fields
    const def = getPropDef(field);
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
    const def = getPropDef(field);
    return def?.constraints?.options ?? [];
  }

  // Handle field change
  function handleFieldChange(field: string, value: unknown): void {
    onPropChange(field, value);
  }

  // Handle notelink click
  function handleNotelinkClick(noteId: string): void {
    if (onNoteClick) {
      onNoteClick(noteId);
    } else {
      setActiveNoteId(noteId);
      addNoteToWorkspace(noteId);
    }
  }

  // Toggle expanded state
  function toggleExpanded(): void {
    expanded = !expanded;
  }

  // Get the type for a field
  function getFieldType(field: string): PropertyType | 'system' {
    if (isSystemField(field)) return 'system';
    const def = getPropDef(field);
    return def?.type ?? 'string';
  }

  // Note link picker state
  let noteLinkPickerField = $state<string | null>(null);
  let noteLinkSearchQuery = $state('');

  // Notes for the picker
  const allNotes = $derived(getAllNotes().filter((n) => !n.archived && n.id !== note.id));
  const filteredNotes = $derived(
    noteLinkSearchQuery.trim()
      ? allNotes.filter(
          (n) =>
            n.title.toLowerCase().includes(noteLinkSearchQuery.toLowerCase()) ||
            n.id.toLowerCase().includes(noteLinkSearchQuery.toLowerCase())
        )
      : allNotes.slice(0, 10)
  );

  function openNoteLinkPicker(field: string): void {
    noteLinkPickerField = field;
    noteLinkSearchQuery = '';
  }

  function closeNoteLinkPicker(): void {
    noteLinkPickerField = null;
    noteLinkSearchQuery = '';
  }

  function selectNoteForLink(selectedNoteId: string): void {
    if (!noteLinkPickerField) return;

    const def = getPropDef(noteLinkPickerField);
    if (def?.type === 'notelinks') {
      // Multi-select: add to array
      const current = (getRawValue(noteLinkPickerField) as string[]) || [];
      if (!current.includes(selectedNoteId)) {
        handleFieldChange(noteLinkPickerField, [...current, selectedNoteId]);
      }
    } else {
      // Single select
      handleFieldChange(noteLinkPickerField, selectedNoteId);
      closeNoteLinkPicker();
    }
  }

  function removeNoteFromLinks(field: string, noteIdToRemove: string): void {
    const current = (getRawValue(field) as string[]) || [];
    handleFieldChange(
      field,
      current.filter((id) => id !== noteIdToRemove)
    );
  }

  function clearNoteLink(field: string): void {
    handleFieldChange(field, null);
  }
</script>

{#if displayedFields.length > 0}
  <div class="editor-chips">
    {#each displayedFields as field (field)}
      {@const rawValue = getRawValue(field)}
      {@const editable = isEditable(field)}
      {@const fieldType = getFieldType(field)}
      {@const options = getFieldOptions(field)}

      <div
        class="chip"
        class:chip-with-picker={editable &&
          (fieldType === 'notelink' || fieldType === 'notelinks')}
      >
        <span class="chip-label">{getFieldLabel(field)}</span>
        <span class="chip-divider"></span>

        {#if editable && fieldType === 'notelink'}
          <!-- Single note link -->
          <div class="chip-notelink">
            {#if rawValue}
              <button
                type="button"
                class="notelink-value"
                onclick={() => handleNotelinkClick(String(rawValue))}
              >
                {getNoteTitleById(String(rawValue))}
              </button>
              <button
                type="button"
                class="clear-btn"
                onclick={() => clearNoteLink(field)}
              >
                &times;
              </button>
            {:else}
              <button
                type="button"
                class="pick-btn"
                onclick={() => openNoteLinkPicker(field)}
              >
                Select...
              </button>
            {/if}
          </div>
        {:else if editable && fieldType === 'notelinks'}
          <!-- Multiple note links -->
          <div class="chip-notelinks">
            {#if Array.isArray(rawValue) && rawValue.length > 0}
              {#each rawValue as linkedId (linkedId)}
                <span class="notelink-tag">
                  <button
                    type="button"
                    class="tag-title"
                    onclick={() => handleNotelinkClick(linkedId)}
                  >
                    {getNoteTitleById(linkedId)}
                  </button>
                  <button
                    type="button"
                    class="tag-remove"
                    onclick={() => removeNoteFromLinks(field, linkedId)}
                  >
                    &times;
                  </button>
                </span>
              {/each}
            {/if}
            <button
              type="button"
              class="add-link-btn"
              onclick={() => openNoteLinkPicker(field)}
            >
              +
            </button>
          </div>
        {:else if editable && fieldType === 'select' && options.length > 0}
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
        {:else if editable && fieldType === 'boolean'}
          <input
            type="checkbox"
            class="chip-checkbox"
            checked={Boolean(rawValue)}
            onchange={(e) => handleFieldChange(field, e.currentTarget.checked)}
          />
        {:else if editable && fieldType === 'date'}
          <input
            type="date"
            class="chip-date"
            value={rawValue ? String(rawValue).split('T')[0] : ''}
            onchange={(e) => handleFieldChange(field, e.currentTarget.value)}
          />
        {:else if editable && fieldType === 'number'}
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
        {:else if editable && fieldType === 'array'}
          <input
            type="text"
            class="chip-input"
            value={Array.isArray(rawValue) ? rawValue.join(', ') : ''}
            placeholder="comma-separated"
            onblur={(e) => {
              const val = e.currentTarget.value;
              handleFieldChange(
                field,
                val
                  ? val
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : []
              );
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
{/if}

<!-- Note Link Picker Dropdown -->
{#if noteLinkPickerField}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="picker-overlay" onclick={closeNoteLinkPicker} onkeydown={() => {}}></div>
  <div class="picker-dropdown">
    <input
      type="text"
      class="picker-search"
      placeholder="Search notes..."
      bind:value={noteLinkSearchQuery}
      autofocus
    />
    <div class="picker-results">
      {#if filteredNotes.length > 0}
        {#each filteredNotes as n (n.id)}
          <button
            type="button"
            class="picker-item"
            onclick={() => selectNoteForLink(n.id)}
          >
            <span class="picker-item-title">{n.title || 'Untitled'}</span>
          </button>
        {/each}
      {:else}
        <div class="picker-empty">No notes found</div>
      {/if}
    </div>
  </div>
{/if}

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

  .chip-input[type='text'] {
    field-sizing: content;
    min-width: 2rem;
  }

  .chip-input[type='number'] {
    field-sizing: content;
    min-width: 3rem;
  }

  /* Note link styles */
  .chip-notelink,
  .chip-notelinks {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
  }

  .notelink-value {
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    text-decoration: underline;
  }

  .notelink-value:hover {
    color: var(--accent-primary-hover, var(--accent-primary));
  }

  .clear-btn,
  .tag-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.125rem;
    line-height: 1;
  }

  .clear-btn:hover,
  .tag-remove:hover {
    color: var(--text-primary);
  }

  .pick-btn,
  .add-link-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
  }

  .pick-btn:hover,
  .add-link-btn:hover {
    color: var(--text-secondary);
  }

  .notelink-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    padding: 0 0.25rem;
  }

  .tag-title {
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.65rem;
    padding: 0;
    text-decoration: underline;
  }

  .tag-title:hover {
    color: var(--accent-primary-hover, var(--accent-primary));
  }

  /* Expand button */
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

  /* Note Link Picker */
  .picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .picker-dropdown {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    max-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .picker-search {
    padding: 0.75rem;
    border: none;
    border-bottom: 1px solid var(--border-light);
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-primary);
    outline: none;
  }

  .picker-results {
    flex: 1;
    overflow-y: auto;
    max-height: 300px;
  }

  .picker-item {
    display: block;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .picker-item:hover {
    background: var(--bg-hover);
  }

  .picker-item-title {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .picker-empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
