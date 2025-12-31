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
  import {
    getNote,
    getAllNotes,
    setActiveNoteId,
    addNoteToWorkspace
  } from '../lib/automerge';
  import Tooltip from './Tooltip.svelte';

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

  // Note link picker state
  let noteLinkPickerField = $state<string | null>(null);
  let noteLinkSearchQuery = $state('');
  let pickerPosition = $state<{ top: number; left: number } | null>(null);
  let selectedIndex = $state(0);

  // Array field input state (keyed by field name)
  let arrayInputValues = $state<Record<string, string>>({});

  // Track which list field is expanded (for notelinks and array)
  let expandedListField = $state<string | null>(null);
  let listDropdownPosition = $state<{ top: number; left: number } | null>(null);
  let listCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  let listItemsContainer: HTMLDivElement | null = null;

  function scrollListToBottom(): void {
    // Use tick to wait for DOM update
    setTimeout(() => {
      if (listItemsContainer) {
        listItemsContainer.scrollTop = listItemsContainer.scrollHeight;
      }
    }, 0);
  }

  function openListDropdown(field: string, el: HTMLElement): void {
    // Cancel any pending close
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
    const rect = el.getBoundingClientRect();
    const dropdownWidth = 240;
    const dropdownHeight = 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate horizontal position
    let left = rect.left;
    if (left + dropdownWidth > viewportWidth - 8) {
      // Would overflow right, align to right edge of trigger
      left = Math.max(8, rect.right - dropdownWidth);
    }

    // Calculate vertical position
    let top = rect.bottom + 4;
    if (top + dropdownHeight > viewportHeight - 8) {
      // Would overflow bottom, position above
      top = Math.max(8, rect.top - dropdownHeight - 4);
    }

    listDropdownPosition = { top, left };
    expandedListField = field;
  }

  function scheduleCloseListDropdown(): void {
    // Schedule close with delay to allow mouse to move to dropdown
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
    }
    listCloseTimeout = setTimeout(() => {
      expandedListField = null;
      listDropdownPosition = null;
      listCloseTimeout = null;
    }, 150);
  }

  function cancelCloseListDropdown(): void {
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
  }

  function closeListDropdown(): void {
    if (listCloseTimeout) {
      clearTimeout(listCloseTimeout);
      listCloseTimeout = null;
    }
    expandedListField = null;
    listDropdownPosition = null;
  }

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

  function openNoteLinkPicker(field: string, inputEl: HTMLInputElement): void {
    // Try to find parent chip, otherwise use the input's parent container
    const chip = inputEl.closest('.chip') as HTMLElement;
    const listDropdown = inputEl.closest('.list-dropdown') as HTMLElement;

    const pickerWidth = 280;
    const pickerHeight = 300;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    if (chip) {
      const rect = chip.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 4;

      // Check horizontal overflow
      if (left + pickerWidth > viewportWidth - 8) {
        left = Math.max(8, rect.right - pickerWidth);
      }

      // Check vertical overflow
      if (top + pickerHeight > viewportHeight - 8) {
        top = Math.max(8, rect.top - pickerHeight - 4);
      }
    } else if (listDropdown) {
      const rect = listDropdown.getBoundingClientRect();

      // Try to position to the right first
      if (rect.right + pickerWidth + 4 <= viewportWidth - 8) {
        left = rect.right + 4;
        top = rect.top;
      } else if (rect.left - pickerWidth - 4 >= 8) {
        // Position to the left if right doesn't fit
        left = rect.left - pickerWidth - 4;
        top = rect.top;
      } else {
        // Fall back to below
        left = Math.max(8, Math.min(rect.left, viewportWidth - pickerWidth - 8));
        top = rect.bottom + 4;
      }

      // Check vertical overflow
      if (top + pickerHeight > viewportHeight - 8) {
        top = Math.max(8, viewportHeight - pickerHeight - 8);
      }
    }

    if (top > 0 || left > 0) {
      pickerPosition = { top, left };
    }
    noteLinkPickerField = field;
    noteLinkSearchQuery = '';
    selectedIndex = 0;
  }

  function closeNoteLinkPicker(): void {
    noteLinkPickerField = null;
    noteLinkSearchQuery = '';
    pickerPosition = null;
    selectedIndex = 0;
  }

  function selectNoteForLink(selectedNoteId: string): void {
    if (!noteLinkPickerField) return;

    const def = getPropDef(noteLinkPickerField);
    if (def?.type === 'notelinks') {
      // Multi-select: add to array
      const current = (getRawValue(noteLinkPickerField) as string[]) || [];
      if (!current.includes(selectedNoteId)) {
        handleFieldChange(noteLinkPickerField, [...current, selectedNoteId]);
        scrollListToBottom();
      }
      // Clear search but keep picker open for adding more
      noteLinkSearchQuery = '';
      selectedIndex = 0;
    } else {
      // Single select
      handleFieldChange(noteLinkPickerField, selectedNoteId);
      closeNoteLinkPicker();
    }
  }

  function selectCurrentNote(): void {
    if (filteredNotes.length > 0 && selectedIndex < filteredNotes.length) {
      selectNoteForLink(filteredNotes[selectedIndex].id);
    }
  }

  function handleNoteLinkKeydown(e: KeyboardEvent, field: string): void {
    const input = e.currentTarget as HTMLInputElement;

    // Open picker on focus if not already open
    if (noteLinkPickerField !== field) {
      openNoteLinkPicker(field, input);
    }

    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredNotes.length - 1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCurrentNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNoteLinkPicker();
      input.blur();
    }
  }

  function handleNoteLinkFocus(field: string, input: HTMLInputElement): void {
    openNoteLinkPicker(field, input);
  }

  function handleNoteLinkBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      closeNoteLinkPicker();
    }, 150);
  }

  function handleNoteLinkInput(value: string): void {
    noteLinkSearchQuery = value;
    selectedIndex = 0;
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

  // Array field helpers
  function addArrayItem(field: string): void {
    const inputValue = arrayInputValues[field]?.trim();
    if (!inputValue) return;

    const current = (getRawValue(field) as string[]) || [];
    // Don't add duplicates
    if (!current.includes(inputValue)) {
      handleFieldChange(field, [...current, inputValue]);
      scrollListToBottom();
    }
    arrayInputValues[field] = '';
  }

  function removeArrayItem(field: string, item: string): void {
    const current = (getRawValue(field) as string[]) || [];
    handleFieldChange(
      field,
      current.filter((i) => i !== item)
    );
  }

  function handleArrayKeydown(e: KeyboardEvent, field: string): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      addArrayItem(field);
    }
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
              <input
                type="text"
                class="notelink-input"
                value={noteLinkPickerField === field ? noteLinkSearchQuery : ''}
                placeholder="+"
                onfocus={(e) => handleNoteLinkFocus(field, e.currentTarget)}
                onblur={handleNoteLinkBlur}
                oninput={(e) => handleNoteLinkInput(e.currentTarget.value)}
                onkeydown={(e) => handleNoteLinkKeydown(e, field)}
              />
            {/if}
          </div>
        {:else if editable && fieldType === 'notelinks'}
          <!-- Multiple note links - collapsed summary -->
          {@const notelinksArray = Array.isArray(rawValue) ? rawValue : []}
          <div
            class="chip-list-trigger"
            role="button"
            tabindex="0"
            onmouseenter={(e) => openListDropdown(field, e.currentTarget)}
            onmouseleave={scheduleCloseListDropdown}
            onfocus={(e) => openListDropdown(field, e.currentTarget)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                openListDropdown(field, e.currentTarget);
              }
            }}
          >
            {#if notelinksArray.length === 0}
              <span class="list-empty">+</span>
            {:else if notelinksArray.length === 1}
              <button
                type="button"
                class="list-preview-link"
                onclick={(e) => {
                  e.stopPropagation();
                  handleNotelinkClick(notelinksArray[0]);
                }}
              >
                {getNoteTitleById(notelinksArray[0])}
              </button>
            {:else}
              <button
                type="button"
                class="list-preview-link"
                onclick={(e) => {
                  e.stopPropagation();
                  handleNotelinkClick(notelinksArray[0]);
                }}
              >
                {getNoteTitleById(notelinksArray[0])}
              </button>
              <span class="list-count">+{notelinksArray.length - 1}</span>
            {/if}
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
          <!-- Array - collapsed summary -->
          {@const arrayItems = Array.isArray(rawValue) ? rawValue : []}
          <button
            type="button"
            class="chip-list-trigger"
            onmouseenter={(e) => openListDropdown(field, e.currentTarget)}
            onmouseleave={scheduleCloseListDropdown}
            onfocus={(e) => openListDropdown(field, e.currentTarget)}
          >
            {#if arrayItems.length === 0}
              <span class="list-empty">+</span>
            {:else if arrayItems.length === 1}
              <span class="list-preview">{arrayItems[0]}</span>
            {:else}
              <span class="list-preview">{arrayItems[0]}</span>
              <span class="list-count">+{arrayItems.length - 1}</span>
            {/if}
          </button>
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

<!-- Note Link Picker Dropdown (for single notelink) -->
{#if noteLinkPickerField && pickerPosition}
  <div
    class="picker-dropdown"
    style="top: {pickerPosition.top}px; left: {pickerPosition.left}px;"
  >
    <div class="picker-results">
      {#if filteredNotes.length > 0}
        {#each filteredNotes as n, i (n.id)}
          <button
            type="button"
            class="picker-item"
            class:selected={i === selectedIndex}
            onmousedown={() => selectNoteForLink(n.id)}
            onmouseenter={() => (selectedIndex = i)}
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

<!-- List Dropdown (for notelinks and array) -->
{#if expandedListField && listDropdownPosition}
  {@const fieldDef = getPropDef(expandedListField)}
  {@const isNotelinks = fieldDef?.type === 'notelinks'}
  {@const listValue = getRawValue(expandedListField)}
  {@const items = Array.isArray(listValue) ? listValue : []}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="list-dropdown"
    style="top: {listDropdownPosition.top}px; left: {listDropdownPosition.left}px;"
    onmouseenter={cancelCloseListDropdown}
    onmouseleave={closeListDropdown}
  >
    <div class="list-dropdown-items" bind:this={listItemsContainer}>
      {#if items.length > 0}
        {#each items as item (item)}
          <div class="list-dropdown-item">
            {#if isNotelinks}
              <button
                type="button"
                class="list-item-link"
                onclick={() => handleNotelinkClick(item)}
              >
                {getNoteTitleById(item)}
              </button>
            {:else}
              <span class="list-item-text">{item}</span>
            {/if}
            <button
              type="button"
              class="list-item-remove"
              onclick={() => {
                if (isNotelinks) {
                  removeNoteFromLinks(expandedListField!, item);
                } else {
                  removeArrayItem(expandedListField!, item);
                }
              }}
            >
              &times;
            </button>
          </div>
        {/each}
      {:else}
        <div class="list-dropdown-empty">No items</div>
      {/if}
    </div>
    <div class="list-dropdown-add">
      {#if isNotelinks}
        <input
          type="text"
          class="list-add-input"
          placeholder="Add note..."
          value={noteLinkPickerField === expandedListField ? noteLinkSearchQuery : ''}
          onfocus={(e) => handleNoteLinkFocus(expandedListField!, e.currentTarget)}
          onblur={handleNoteLinkBlur}
          oninput={(e) => handleNoteLinkInput(e.currentTarget.value)}
          onkeydown={(e) => handleNoteLinkKeydown(e, expandedListField!)}
        />
      {:else}
        <input
          type="text"
          class="list-add-input"
          placeholder="Add item..."
          bind:value={arrayInputValues[expandedListField!]}
          onkeydown={(e) => handleArrayKeydown(e, expandedListField!)}
        />
        <button
          type="button"
          class="list-add-btn"
          onclick={() => addArrayItem(expandedListField!)}
        >
          +
        </button>
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
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-input[type='text']:focus {
    max-width: none;
  }

  .chip-input[type='number'] {
    field-sizing: content;
    min-width: 3rem;
  }

  /* Note link styles */
  .chip-notelink {
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
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    vertical-align: middle;
  }

  .notelink-value:hover {
    color: var(--accent-primary-hover, var(--accent-primary));
    max-width: none;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.125rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: var(--text-primary);
  }

  .notelink-input {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.7rem;
    padding: 0;
    min-width: 1rem;
    outline: none;
    field-sizing: content;
  }

  .notelink-input::placeholder {
    color: var(--text-muted);
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
  .picker-dropdown {
    position: fixed;
    width: 280px;
    max-height: 300px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
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

  .picker-item:hover,
  .picker-item.selected {
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

  /* List trigger button (collapsed view for notelinks/array) */
  .chip-list-trigger {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  .chip-list-trigger:hover {
    background: var(--bg-tertiary);
  }

  .list-empty {
    color: var(--text-muted);
  }

  .list-preview {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-count {
    color: var(--text-muted);
    font-size: 0.6rem;
  }

  .list-preview-link {
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    text-decoration: underline;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-preview-link:hover {
    color: var(--accent-primary-hover, var(--accent-primary));
  }

  /* List dropdown */
  .list-dropdown {
    position: fixed;
    width: 240px;
    max-height: 280px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .list-dropdown-items {
    flex: 1;
    overflow-y: auto;
    max-height: 200px;
    padding: 0.25rem;
  }

  .list-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
  }

  .list-dropdown-item:hover {
    background: var(--bg-hover);
  }

  .list-item-link {
    flex: 1;
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.8rem;
    text-align: left;
    text-decoration: underline;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-link:hover {
    color: var(--accent-primary-hover, var(--accent-primary));
  }

  .list-item-text {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 0.25rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .list-item-remove:hover {
    color: var(--text-primary);
  }

  .list-dropdown-empty {
    padding: 0.75rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .list-dropdown-add {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border-top: 1px solid var(--border-light);
  }

  .list-add-input {
    flex: 1;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.8rem;
    padding: 0.375rem 0.5rem;
    outline: none;
  }

  .list-add-input:focus {
    border-color: var(--accent-primary);
  }

  .list-add-input::placeholder {
    color: var(--text-muted);
  }

  .list-add-btn {
    background: var(--accent-primary);
    border: none;
    border-radius: 0.25rem;
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0.25rem 0.5rem;
    line-height: 1;
  }

  .list-add-btn:hover {
    opacity: 0.9;
  }
</style>
