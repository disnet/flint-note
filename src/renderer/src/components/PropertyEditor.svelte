<script lang="ts">
  /**
   * Property editor component for defining properties in note types
   * Inline editing with auto-save like the legacy implementation
   */
  import type {
    PropertyDefinition,
    PropertyType,
    PropertyConstraints
  } from '../lib/automerge';

  interface Props {
    /** Current property definitions */
    properties: PropertyDefinition[];
    /** Called when properties are updated */
    onUpdate: (properties: PropertyDefinition[]) => void;
    /** Current editor chips configuration */
    editorChips?: string[];
    /** Called when editor chips are updated */
    onEditorChipsUpdate?: (chips: string[]) => void;
  }

  let { properties, onUpdate, editorChips = [], onEditorChipsUpdate }: Props = $props();

  // System fields that are always available
  const SYSTEM_FIELDS = [
    { name: 'created', label: 'Created', description: 'When the note was created' },
    { name: 'updated', label: 'Updated', description: 'When the note was last modified' }
  ];

  // Available property types
  const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'array', label: 'Array' },
    { value: 'select', label: 'Select' },
    { value: 'notelink', label: 'Note Link' },
    { value: 'notelinks', label: 'Note Links' }
  ];

  // Auto-save timeout
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function scheduleAutoSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      // Clean up empty property names and trigger save
      const cleanedProperties = properties.filter((p) => p.name.trim() !== '');
      onUpdate(cleanedProperties);
    }, 500);
  }

  function addProperty(): void {
    const newProp: PropertyDefinition = {
      name: '',
      type: 'string',
      description: '',
      required: false
    };
    onUpdate([...properties, newProp]);
  }

  function updateField(
    index: number,
    field: keyof PropertyDefinition,
    value: string | boolean | PropertyType
  ): void {
    const updated = [...properties];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
    scheduleAutoSave();
  }

  function updateConstraint(
    index: number,
    constraintKey: keyof PropertyConstraints,
    value: string
  ): void {
    const updated = [...properties];
    const prop = { ...updated[index] };

    if (!prop.constraints) {
      prop.constraints = {};
    }

    // Handle different value types
    if (constraintKey === 'min' || constraintKey === 'max') {
      prop.constraints[constraintKey] = value ? Number(value) : undefined;
    } else if (constraintKey === 'pattern') {
      prop.constraints.pattern = value || undefined;
    } else if (constraintKey === 'format') {
      prop.constraints.format = value || undefined;
    }

    updated[index] = prop;
    onUpdate(updated);
    scheduleAutoSave();
  }

  function updateDefault(index: number, value: string): void {
    const updated = [...properties];
    const prop = { ...updated[index] };

    if (!value) {
      prop.default = undefined;
    } else if (prop.type === 'number') {
      prop.default = Number(value);
    } else if (prop.type === 'boolean') {
      prop.default = value === 'true';
    } else if (prop.type === 'array') {
      prop.default = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      prop.default = value;
    }

    updated[index] = prop;
    onUpdate(updated);
    scheduleAutoSave();
  }

  // Select option management
  function addSelectOption(propIndex: number): void {
    const updated = [...properties];
    const prop = { ...updated[propIndex] };
    if (!prop.constraints) {
      prop.constraints = {};
    }
    if (!prop.constraints.options) {
      prop.constraints.options = [];
    }
    prop.constraints.options = [...prop.constraints.options, ''];
    updated[propIndex] = prop;
    onUpdate(updated);
  }

  function removeSelectOption(propIndex: number, optionIndex: number): void {
    const updated = [...properties];
    const prop = { ...updated[propIndex] };
    if (prop.constraints?.options) {
      prop.constraints.options = prop.constraints.options.filter(
        (_, i) => i !== optionIndex
      );
      updated[propIndex] = prop;
      onUpdate(updated);
      scheduleAutoSave();
    }
  }

  function updateSelectOption(
    propIndex: number,
    optionIndex: number,
    value: string
  ): void {
    const updated = [...properties];
    const prop = { ...updated[propIndex] };
    if (prop.constraints?.options) {
      prop.constraints.options = [...prop.constraints.options];
      prop.constraints.options[optionIndex] = value;
      updated[propIndex] = prop;
      onUpdate(updated);
      scheduleAutoSave();
    }
  }

  function removeProperty(index: number): void {
    const propName = properties[index].name;
    const newProperties = properties.filter((_, i) => i !== index);
    onUpdate(newProperties);

    // Also remove from editor chips if present
    if (editorChips.includes(propName) && onEditorChipsUpdate) {
      onEditorChipsUpdate(editorChips.filter((c) => c !== propName));
    }
  }

  function toggleEditorChip(propName: string): void {
    if (!onEditorChipsUpdate) return;

    if (editorChips.includes(propName)) {
      onEditorChipsUpdate(editorChips.filter((c) => c !== propName));
    } else {
      onEditorChipsUpdate([...editorChips, propName]);
    }
  }
</script>

<div class="property-editor">
  <!-- System Fields Section -->
  {#if onEditorChipsUpdate}
    <div class="system-fields-section">
      <h3>Display Settings</h3>
      <p class="section-description">
        Choose which fields are always visible in the note editor.
      </p>
      <div class="system-fields-list">
        {#each SYSTEM_FIELDS as field (field.name)}
          <label class="system-field-item">
            <input
              type="checkbox"
              checked={editorChips.includes(field.name)}
              onchange={() => toggleEditorChip(field.name)}
            />
            <span class="system-field-info">
              <span class="system-field-label">{field.label}</span>
              <span class="system-field-description">{field.description}</span>
            </span>
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <div class="section-header">
    <h3>Properties</h3>
    <button class="add-btn" onclick={addProperty}>+ Add Field</button>
  </div>

  {#if properties.length > 0}
    <div class="schema-list">
      {#each properties as prop, index (index)}
        <div class="schema-field">
          <div class="field-row">
            <input
              type="text"
              class="form-input field-name"
              value={prop.name}
              oninput={(e) => updateField(index, 'name', e.currentTarget.value)}
              placeholder="Field name"
            />
            <select
              class="form-select"
              value={prop.type}
              onchange={(e) =>
                updateField(index, 'type', e.currentTarget.value as PropertyType)}
            >
              {#each PROPERTY_TYPES as propType (propType.value)}
                <option value={propType.value}>{propType.label}</option>
              {/each}
            </select>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={prop.required || false}
                onchange={(e) => updateField(index, 'required', e.currentTarget.checked)}
              />
              Required
            </label>
            {#if onEditorChipsUpdate && prop.name.trim()}
              <label class="checkbox-label always-display-label">
                <input
                  type="checkbox"
                  checked={editorChips.includes(prop.name)}
                  onchange={() => toggleEditorChip(prop.name)}
                />
                Always display
              </label>
            {/if}
            <button
              class="remove-btn"
              onclick={() => removeProperty(index)}
              title="Remove field"
            >
              ✕
            </button>
          </div>

          <input
            type="text"
            class="form-input field-description"
            value={prop.description || ''}
            oninput={(e) => updateField(index, 'description', e.currentTarget.value)}
            placeholder="Field description (optional)"
          />

          <!-- Constraints based on type -->
          {#if prop.type === 'number' || prop.type === 'array'}
            <div class="constraints-row">
              <input
                type="number"
                class="form-input constraint-input"
                value={prop.constraints?.min ?? ''}
                oninput={(e) => updateConstraint(index, 'min', e.currentTarget.value)}
                placeholder={prop.type === 'array' ? 'Min items' : 'Min'}
              />
              <input
                type="number"
                class="form-input constraint-input"
                value={prop.constraints?.max ?? ''}
                oninput={(e) => updateConstraint(index, 'max', e.currentTarget.value)}
                placeholder={prop.type === 'array' ? 'Max items' : 'Max'}
              />
            </div>
          {/if}

          {#if prop.type === 'string'}
            <input
              type="text"
              class="form-input"
              value={prop.constraints?.pattern ?? ''}
              oninput={(e) => updateConstraint(index, 'pattern', e.currentTarget.value)}
              placeholder="Regex pattern (optional)"
            />
          {/if}

          {#if prop.type === 'select'}
            <div class="select-options-editor">
              <div class="select-options-header">
                <span class="options-label">Options</span>
                <button
                  class="add-option-btn"
                  onclick={() => addSelectOption(index)}
                  type="button"
                >
                  + Add Option
                </button>
              </div>
              {#if prop.constraints?.options && prop.constraints.options.length > 0}
                <div class="options-list">
                  {#each prop.constraints.options as option, optionIndex (optionIndex)}
                    <div class="option-item">
                      <input
                        type="text"
                        class="form-input"
                        value={option}
                        oninput={(e) =>
                          updateSelectOption(index, optionIndex, e.currentTarget.value)}
                        placeholder="Option value"
                      />
                      <button
                        class="remove-option-btn"
                        onclick={() => removeSelectOption(index, optionIndex)}
                        title="Remove option"
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="empty-options-text">
                  No options defined. Click "Add Option" to get started.
                </p>
              {/if}
            </div>
          {/if}

          {#if prop.type === 'date'}
            <input
              type="text"
              class="form-input"
              value={prop.constraints?.format ?? ''}
              oninput={(e) => updateConstraint(index, 'format', e.currentTarget.value)}
              placeholder="Date format (e.g., YYYY-MM-DD)"
            />
          {/if}

          <!-- Default value -->
          {#if prop.type === 'boolean'}
            <label class="checkbox-label default-label">
              <input
                type="checkbox"
                checked={prop.default === true}
                onchange={(e) =>
                  updateDefault(index, e.currentTarget.checked ? 'true' : 'false')}
              />
              Default value
            </label>
          {:else if prop.type === 'array'}
            <input
              type="text"
              class="form-input"
              value={Array.isArray(prop.default) ? prop.default.join(', ') : ''}
              oninput={(e) => updateDefault(index, e.currentTarget.value)}
              placeholder="Default values (comma-separated)"
            />
          {:else}
            <input
              type="text"
              class="form-input"
              value={prop.default?.toString() ?? ''}
              oninput={(e) => updateDefault(index, e.currentTarget.value)}
              placeholder="Default value (optional)"
            />
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty-text">No properties defined</p>
  {/if}
</div>

<style>
  .property-editor {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* System Fields Section */
  .system-fields-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .system-fields-section h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .section-description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .system-fields-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .system-field-item {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .system-field-item:hover {
    border-color: var(--border-medium);
  }

  .system-field-item input[type='checkbox'] {
    margin-top: 0.125rem;
    cursor: pointer;
  }

  .system-field-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .system-field-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .system-field-description {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-header h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .add-btn {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: var(--accent-text, white);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .add-btn:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .schema-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .schema-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
  }

  .field-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .field-name {
    flex: 1;
    min-width: 0;
  }

  .form-input,
  .form-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-select {
    min-width: 120px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .checkbox-label input[type='checkbox'] {
    cursor: pointer;
  }

  .always-display-label {
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .remove-btn {
    padding: 0.375rem 0.5rem;
    background: transparent;
    color: var(--error-text);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 2rem;
  }

  .remove-btn:hover {
    background: var(--error-bg);
    border-color: var(--error-border, #ef4444);
  }

  .field-description {
    width: 100%;
  }

  .constraints-row {
    display: flex;
    gap: 0.5rem;
  }

  .constraint-input {
    flex: 1;
  }

  .default-label {
    margin-top: 0.25rem;
  }

  .select-options-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
  }

  .select-options-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .options-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .add-option-btn {
    padding: 0.25rem 0.5rem;
    background: var(--accent-primary);
    color: var(--accent-text, white);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .add-option-btn:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .option-item {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .option-item .form-input {
    flex: 1;
  }

  .remove-option-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .remove-option-btn:hover {
    background: var(--error-bg);
    color: var(--error-text);
    border-color: var(--error-border, #ef4444);
  }

  .empty-options-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
    text-align: center;
    padding: 0.5rem 0;
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
  }
</style>
