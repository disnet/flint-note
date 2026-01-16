<script lang="ts">
  /**
   * Editor chips component for displaying and editing note properties
   * Renders configured properties as inline chips under the note title
   */
  import type {
    NoteMetadata,
    NoteType,
    PropertyDefinition,
    PropertyType
  } from '../lib/automerge';
  import { getNote, setActiveNoteId, addNoteToWorkspace } from '../lib/automerge';
  import { formatRelativeTime } from '../lib/input-utils.svelte';
  import Tooltip from './Tooltip.svelte';
  import {
    StringInput,
    NumberInput,
    BooleanInput,
    DateInput,
    SelectInput,
    ArrayInput,
    NoteLinkInput,
    NoteLinksInput
  } from './inputs';

  interface Props {
    /** The current note */
    note: NoteMetadata;
    /** The note type with property definitions */
    noteType: NoteType | undefined;
    /** Called when a property value changes */
    onPropChange: (propName: string, value: unknown) => void;
    /** Whether editing is disabled */
    disabled?: boolean;
    /** Called when a linked note is clicked */
    onNoteClick?: (noteId: string) => void;
    /** Optional computed values that override note.props for display-only fields */
    computedValues?: Record<string, unknown>;
    /** Optional additional property definitions to merge with noteType.properties */
    additionalProperties?: PropertyDefinition[];
  }

  let {
    note,
    noteType,
    onPropChange,
    disabled = false,
    onNoteClick,
    computedValues,
    additionalProperties
  }: Props = $props();

  // Track expanded state
  let expanded = $state(false);

  // System fields (always available)
  const SYSTEM_FIELDS = ['created', 'updated'];

  // Get the chips to display (default to updated only if empty or undefined)
  const editorChips = $derived(
    noteType?.editorChips?.length ? noteType.editorChips : ['updated']
  );

  // Get property definitions from the note type
  const propertyDefs = $derived(noteType?.properties ?? []);

  // Get all available fields (system fields + custom properties + additional properties)
  const allFields = $derived.by(() => {
    const fields: string[] = [...SYSTEM_FIELDS];
    for (const prop of propertyDefs) {
      fields.push(prop.name);
    }
    // Add additional properties not already included
    for (const prop of additionalProperties ?? []) {
      if (!fields.includes(prop.name)) {
        fields.push(prop.name);
      }
    }
    return fields;
  });

  // Fields to show based on expanded state
  const displayedFields = $derived(expanded ? allFields : editorChips);

  // Check if expand button should show
  const hasMoreFields = $derived(allFields.length > editorChips.length);

  // Get property definition by name (from noteType.properties or additionalProperties)
  function getPropDef(field: string): PropertyDefinition | undefined {
    // Check noteType properties first
    const fromType = propertyDefs.find((p) => p.name === field);
    if (fromType) return fromType;
    // Check additional properties (media-specific)
    return additionalProperties?.find((p) => p.name === field);
  }

  // Check if field is a system field (read-only)
  function isSystemField(field: string): boolean {
    return SYSTEM_FIELDS.includes(field);
  }

  // Check if field is editable
  function isEditable(field: string): boolean {
    if (disabled) return false;
    if (isSystemField(field)) return false;
    // Computed values are read-only (provided from viewer state, not stored in note.props)
    if (computedValues?.[field] !== undefined) return false;
    return true;
  }

  // Media-specific label mappings for cleaner display
  const MEDIA_FIELD_LABELS: Record<string, string> = {
    epubAuthor: 'author',
    pdfAuthor: 'author',
    webpageAuthor: 'author',
    webpageSiteName: 'site',
    lastRead: 'last read'
  };

  // Get field label
  function getFieldLabel(field: string): string {
    // System fields
    if (field === 'created') return 'created';
    if (field === 'updated') return 'updated';

    // Media-specific friendly labels
    if (MEDIA_FIELD_LABELS[field]) return MEDIA_FIELD_LABELS[field];

    // Use property name, cleaning up underscores
    return field.replace(/_/g, ' ');
  }

  // Get raw value for a field
  function getRawValue(field: string): unknown {
    if (field === 'created') return note.created;
    if (field === 'updated') return note.updated;
    // Check computed values first (viewer-derived state like progress, highlights count)
    if (computedValues?.[field] !== undefined) {
      return computedValues[field];
    }
    return note.props?.[field];
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

  // Check if a field value violates its constraints
  function isFieldInvalid(field: string): boolean {
    if (isSystemField(field)) return false;

    const def = getPropDef(field);
    if (!def) return false;

    const value = getRawValue(field);
    const constraints = def.constraints;

    // Check required
    if (def.required) {
      if (value === undefined || value === null || value === '') return true;
      if (Array.isArray(value) && value.length === 0) return true;
    }

    // No value and not required = valid
    if (value === undefined || value === null || value === '') return false;

    // Check constraints based on type
    if (constraints) {
      // Number constraints
      if (def.type === 'number' && typeof value === 'number') {
        if (constraints.min !== undefined && value < constraints.min) return true;
        if (constraints.max !== undefined && value > constraints.max) return true;
      }

      // Array length constraints
      if (def.type === 'array' && Array.isArray(value)) {
        if (constraints.min !== undefined && value.length < constraints.min) return true;
        if (constraints.max !== undefined && value.length > constraints.max) return true;
      }

      // Notelinks length constraints
      if (def.type === 'notelinks' && Array.isArray(value)) {
        if (constraints.min !== undefined && value.length < constraints.min) return true;
        if (constraints.max !== undefined && value.length > constraints.max) return true;
      }

      // String pattern constraints
      if (def.type === 'string' && typeof value === 'string' && constraints.pattern) {
        try {
          const regex = new RegExp(constraints.pattern);
          if (!regex.test(value)) return true;
        } catch {
          // Invalid regex pattern, ignore
        }
      }

      // Select option constraints
      if (def.type === 'select' && constraints.options) {
        if (!constraints.options.includes(String(value))) return true;
      }
    }

    return false;
  }

  // Get constraint violation message for a field
  function getConstraintViolationMessage(field: string): string | null {
    if (isSystemField(field)) return null;

    const def = getPropDef(field);
    if (!def) return null;

    const value = getRawValue(field);
    const constraints = def.constraints;

    // Check required
    if (def.required) {
      if (value === undefined || value === null || value === '') {
        return 'This field is required';
      }
      if (Array.isArray(value) && value.length === 0) {
        return 'This field is required';
      }
    }

    // No value and not required = valid
    if (value === undefined || value === null || value === '') return null;

    // Check constraints based on type
    if (constraints) {
      // Number constraints
      if (def.type === 'number' && typeof value === 'number') {
        if (constraints.min !== undefined && value < constraints.min) {
          return `Value must be at least ${constraints.min}`;
        }
        if (constraints.max !== undefined && value > constraints.max) {
          return `Value must be at most ${constraints.max}`;
        }
      }

      // Array length constraints
      if (def.type === 'array' && Array.isArray(value)) {
        if (constraints.min !== undefined && value.length < constraints.min) {
          return `Must have at least ${constraints.min} item${constraints.min === 1 ? '' : 's'}`;
        }
        if (constraints.max !== undefined && value.length > constraints.max) {
          return `Must have at most ${constraints.max} item${constraints.max === 1 ? '' : 's'}`;
        }
      }

      // Notelinks length constraints
      if (def.type === 'notelinks' && Array.isArray(value)) {
        if (constraints.min !== undefined && value.length < constraints.min) {
          return `Must have at least ${constraints.min} link${constraints.min === 1 ? '' : 's'}`;
        }
        if (constraints.max !== undefined && value.length > constraints.max) {
          return `Must have at most ${constraints.max} link${constraints.max === 1 ? '' : 's'}`;
        }
      }

      // String pattern constraints
      if (def.type === 'string' && typeof value === 'string' && constraints.pattern) {
        try {
          const regex = new RegExp(constraints.pattern);
          if (!regex.test(value)) {
            return `Value must match pattern: ${constraints.pattern}`;
          }
        } catch {
          // Invalid regex pattern, ignore
        }
      }

      // Select option constraints
      if (def.type === 'select' && constraints.options) {
        if (!constraints.options.includes(String(value))) {
          return `Value must be one of: ${constraints.options.join(', ')}`;
        }
      }
    }

    return null;
  }
</script>

{#if displayedFields.length > 0}
  <div class="editor-chips">
    {#each displayedFields as field (field)}
      {@const rawValue = getRawValue(field)}
      {@const editable = isEditable(field)}
      {@const fieldType = getFieldType(field)}
      {@const options = getFieldOptions(field)}
      {@const invalid = isFieldInvalid(field)}
      {@const violationMessage = invalid ? getConstraintViolationMessage(field) : null}

      <div
        class="chip"
        class:chip-expandable={editable &&
          (fieldType === 'notelink' ||
            fieldType === 'notelinks' ||
            fieldType === 'array')}
        class:chip-invalid={invalid}
      >
        {#if violationMessage}
          <Tooltip text={violationMessage} position="bottom">
            <span class="chip-label">{getFieldLabel(field)}</span>
          </Tooltip>
        {:else}
          <span class="chip-label">{getFieldLabel(field)}</span>
        {/if}
        <span class="chip-divider"></span>

        {#if editable && fieldType === 'notelink'}
          <div class="chip-notelink">
            <NoteLinkInput
              value={rawValue as string | null}
              onChange={(v) => handleFieldChange(field, v)}
              onNoteClick={handleNotelinkClick}
              excludeNoteId={note.id}
            />
          </div>
        {:else if editable && fieldType === 'notelinks'}
          <div class="chip-list-trigger-wrapper">
            <NoteLinksInput
              value={Array.isArray(rawValue) ? (rawValue as string[]) : []}
              onChange={(v) => handleFieldChange(field, v)}
              onNoteClick={handleNotelinkClick}
              excludeNoteId={note.id}
            />
          </div>
        {:else if editable && fieldType === 'select' && options.length > 0}
          <SelectInput
            value={rawValue as string | null}
            {options}
            onChange={(v) => handleFieldChange(field, v)}
            class="chip-select"
          />
        {:else if editable && fieldType === 'boolean'}
          <BooleanInput
            value={Boolean(rawValue)}
            onChange={(v) => handleFieldChange(field, v)}
            class="chip-checkbox"
          />
        {:else if editable && fieldType === 'date'}
          <DateInput
            value={rawValue as string | null}
            onChange={(v) => handleFieldChange(field, v)}
            class="chip-date"
          />
        {:else if editable && fieldType === 'number'}
          <NumberInput
            value={rawValue as number | null}
            onChange={(v) => handleFieldChange(field, v)}
            class="chip-input"
          />
        {:else if editable && fieldType === 'array'}
          <div class="chip-list-trigger-wrapper">
            <ArrayInput
              value={Array.isArray(rawValue) ? (rawValue as string[]) : []}
              onChange={(v) => handleFieldChange(field, v)}
            />
          </div>
        {:else if editable}
          <StringInput
            value={rawValue as string | null}
            onChange={(v) => handleFieldChange(field, v)}
            class="chip-input"
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

  .chip.chip-expandable {
    overflow: visible;
    position: relative;
  }

  .chip.chip-invalid {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    border-color: var(--error-border, rgba(239, 68, 68, 0.3));
  }

  .chip.chip-invalid .chip-label {
    background: var(--error-bg, rgba(239, 68, 68, 0.15));
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

  /* Wrapper for complex inputs */
  .chip-notelink {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
  }

  .chip-list-trigger-wrapper {
    display: flex;
    align-items: center;
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

  /* Mobile: override global touch target min-height for compact chips */
  @media (max-width: 767px) {
    .expand-btn {
      min-height: auto;
      height: 1.375rem;
    }

    .chip {
      /* Ensure consistent chip height on mobile */
      min-height: auto;
    }
  }

  /* Global overrides for shared input components in chip context */
  :global(.chip .chip-input) {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    min-width: 3rem;
    outline: none;
  }

  :global(.chip .chip-input:focus) {
    background: var(--bg-primary);
  }

  :global(.chip .chip-select) {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    padding-right: 0.25rem;
    outline: none;
    cursor: pointer;
  }

  :global(.chip .chip-select:focus) {
    background: var(--bg-primary);
  }

  :global(.chip .chip-checkbox) {
    margin: 0 0.5rem;
    cursor: pointer;
  }

  :global(.chip .chip-date) {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    min-width: 7rem;
    outline: none;
  }

  :global(.chip .chip-date:focus) {
    background: var(--bg-primary);
  }

  /* Mobile: ensure all chip inputs remain compact */
  @media (max-width: 767px) {
    :global(.chip .chip-input),
    :global(.chip .chip-select),
    :global(.chip .chip-date) {
      min-height: auto;
      height: auto;
      padding: 0.125rem 0.5rem;
    }
  }
</style>
