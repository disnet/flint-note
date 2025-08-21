<script lang="ts">
  import type { Note } from '@/server/core/notes';
  import { notesStore } from '../services/noteStore.svelte';
  import { getChatService } from '../services/chatService';
  import type { GetNoteTypeInfoResult } from '@/server/server/types';
  import type { MetadataFieldDefinition } from '@/server/core/metadata-schema';

  interface Props {
    note: Note | null;
    expanded: boolean;
    onToggle: () => void;
    onMetadataUpdate?: (metadata: Record<string, unknown>) => Promise<void>;
    onTypeChange?: (newType: string) => Promise<void>;
  }

  let { note, expanded, onToggle, onMetadataUpdate, onTypeChange }: Props = $props();

  let isEditing = $state(false);
  let editedMetadata = $state<Record<string, unknown>>({});
  let editedType = $state('');
  let isSaving = $state(false);
  let noteTypeInfo = $state<GetNoteTypeInfoResult | null>(null);
  let loadingSchema = $state(false);

  // Get available note types from the notes store
  let availableTypes = $derived(notesStore.noteTypes);

  let formattedMetadata = $derived.by(() => {
    if (!note) return [];

    const metadata = note.metadata || {};
    const result: Array<{ key: string; value: string; type: string }> = [];

    // Add standard metadata fields
    if (note.type) {
      result.push({ key: 'Type', value: note.type, type: 'text' });
    }

    if (note.created) {
      const date = new Date(note.created);
      result.push({
        key: 'Created',
        value:
          date.toLocaleDateString() +
          ' ' +
          date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'date'
      });
    }

    if (note.modified) {
      const date = new Date(note.modified);
      result.push({
        key: 'Modified',
        value:
          date.toLocaleDateString() +
          ' ' +
          date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'date'
      });
    }

    if (note.filename) {
      result.push({ key: 'Filename', value: note.filename, type: 'text' });
    }

    if (note.path) {
      result.push({ key: 'Path', value: note.path, type: 'path' });
    }

    if (metadata.tags && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      result.push({
        key: 'Tags',
        value: metadata.tags.join(', '),
        type: 'tags'
      });
    }

    // Add custom metadata fields (excluding standard ones)
    const standardFields = new Set([
      'title',
      'type',
      'created',
      'updated',
      'modified',
      'tags',
      'filename',
      'links'
    ]);

    Object.entries(metadata).forEach(([key, value]) => {
      if (
        !standardFields.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        let displayValue: string;
        let valueType = 'text';

        if (Array.isArray(value)) {
          if (value.length > 0) {
            displayValue = value.join(', ');
            valueType = 'array';
          } else {
            return; // Skip empty arrays
          }
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2);
          valueType = 'object';
        } else {
          displayValue = String(value);
        }

        result.push({
          key: key.charAt(0).toUpperCase() + key.slice(1),
          value: displayValue,
          type: valueType
        });
      }
    });

    return result;
  });

  let hasMetadata = $derived(formattedMetadata.length > 0);

  // Merge schema fields with existing metadata for editing
  let allEditableFields = $derived.by(() => {
    if (!note || !isEditing) return [];

    const result: Array<{
      key: string;
      value: unknown;
      type: string;
      fieldDef?: MetadataFieldDefinition;
      isSchemaField: boolean;
    }> = [];

    // Add standard metadata fields first
    result.push({
      key: 'Type',
      value: editedType,
      type: 'type',
      isSchemaField: false
    });

    result.push({
      key: 'Tags',
      value: editedMetadata.tags || [],
      type: 'tags',
      isSchemaField: false
    });

    // Add schema-defined fields
    if (noteTypeInfo?.metadata_schema?.fields) {
      for (const fieldDef of noteTypeInfo.metadata_schema.fields) {
        const currentValue = editedMetadata[fieldDef.name];
        result.push({
          key: fieldDef.name,
          value: currentValue !== undefined ? currentValue : fieldDef.default || '',
          type: fieldDef.type,
          fieldDef,
          isSchemaField: true
        });
      }
    }

    // Add custom fields that aren't in schema (excluding standard fields)
    const standardFields = new Set([
      'type',
      'created',
      'modified',
      'filename',
      'path',
      'tags'
    ]);
    const schemaFieldNames = new Set(
      noteTypeInfo?.metadata_schema?.fields?.map((f) => f.name) || []
    );

    Object.entries(editedMetadata).forEach(([key, value]) => {
      if (
        !standardFields.has(key) &&
        !schemaFieldNames.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        result.push({
          key,
          value,
          type: 'text',
          isSchemaField: false
        });
      }
    });

    return result;
  });

  async function loadNoteTypeSchema(typeName: string): Promise<void> {
    if (loadingSchema || !typeName) return;

    try {
      loadingSchema = true;
      const noteService = getChatService();
      if (await noteService.isReady()) {
        noteTypeInfo = await noteService.getNoteTypeInfo({ typeName });
      }
    } catch (err) {
      console.error('Error loading note type schema:', err);
      noteTypeInfo = null;
    } finally {
      loadingSchema = false;
    }
  }

  async function startEditing(): Promise<void> {
    if (!note) return;

    // Initialize edited metadata with current values
    editedMetadata = {
      type: note.type,
      tags: note.metadata?.tags ? [...(note.metadata.tags as string[])] : [],
      ...note.metadata
    };
    editedType = note.type;

    // Load the note type schema to show all possible fields
    await loadNoteTypeSchema(note.type);

    // Initialize schema fields that don't exist in the note yet
    if (noteTypeInfo?.metadata_schema?.fields) {
      for (const fieldDef of noteTypeInfo.metadata_schema.fields) {
        if (editedMetadata[fieldDef.name] === undefined) {
          editedMetadata[fieldDef.name] = fieldDef.default || '';
        }
      }
    }

    isEditing = true;
  }

  function cancelEditing(): void {
    isEditing = false;
    editedMetadata = {};
    editedType = '';
    noteTypeInfo = null;
  }

  async function handleTypeChange(newType: string): Promise<void> {
    editedType = newType;
    // Load the schema for the new type
    await loadNoteTypeSchema(newType);

    // Initialize schema fields for the new type that don't exist yet
    if (noteTypeInfo?.metadata_schema?.fields) {
      for (const fieldDef of noteTypeInfo.metadata_schema.fields) {
        if (editedMetadata[fieldDef.name] === undefined) {
          editedMetadata[fieldDef.name] = fieldDef.default || '';
        }
      }
    }
  }

  async function saveChanges(): Promise<void> {
    if (!note || isSaving) return;

    try {
      isSaving = true;

      // Handle type change if needed
      if (editedType !== note.type && onTypeChange) {
        await onTypeChange(editedType);
      }

      // Handle metadata update if needed
      if (onMetadataUpdate) {
        // Prepare metadata update - only include editable fields
        const updatedMetadata = {
          ...note.metadata,
          tags: editedMetadata.tags,
          // Add other custom metadata fields
          ...Object.fromEntries(
            Object.entries(editedMetadata).filter(
              ([key]) =>
                !['type', 'created', 'modified', 'filename', 'path'].includes(key)
            )
          )
        };

        await onMetadataUpdate(updatedMetadata);
      }

      isEditing = false;
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      isSaving = false;
    }
  }

  function updateField(key: string, value: unknown): void {
    editedMetadata[key] = value;
  }

  function addTag(): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags.push('');
    editedMetadata.tags = [...tags];
  }

  function removeTag(index: number): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags.splice(index, 1);
    editedMetadata.tags = [...tags];
  }

  function updateTag(index: number, value: string): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags[index] = value.trim();
    editedMetadata.tags = [...tags];
  }
</script>

<div class="metadata-section">
  <div class="metadata-header-container">
    <button
      class="metadata-header"
      class:expanded
      onclick={onToggle}
      type="button"
      aria-expanded={expanded}
      aria-controls="metadata-content"
    >
      <span class="metadata-icon">
        {expanded ? '▼' : '▶'}
      </span>
      <span class="metadata-title">Metadata</span>
    </button>
    {#if expanded && hasMetadata && onMetadataUpdate && !isEditing}
      <button
        class="edit-button"
        onclick={startEditing}
        type="button"
        title="Edit metadata"
      >
        ✏️
      </button>
    {/if}
  </div>

  {#if expanded && hasMetadata}
    <div id="metadata-content" class="metadata-content">
      {#if isEditing}
        <!-- Edit Mode -->
        <div class="metadata-edit-controls">
          <button
            class="save-button"
            onclick={saveChanges}
            type="button"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            class="cancel-button"
            onclick={cancelEditing}
            type="button"
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>

        <div class="metadata-grid">
          {#each allEditableFields as field (field.key)}
            <div class="metadata-item">
              <div class="metadata-key">
                {field.key}
                {#if field.fieldDef?.required}
                  <span class="required-indicator">*</span>
                {/if}
                {#if field.fieldDef?.description}
                  <span class="field-description" title={field.fieldDef.description}
                    >?</span
                  >
                {/if}
              </div>
              <div class="metadata-value">
                {#if field.key === 'Type'}
                  <!-- Type selector -->
                  <select
                    class="type-selector"
                    value={editedType}
                    onchange={(e) =>
                      handleTypeChange((e.target as HTMLSelectElement).value)}
                  >
                    {#each availableTypes as noteType (noteType.name)}
                      <option value={noteType.name}>{noteType.name}</option>
                    {/each}
                  </select>
                {:else if field.key === 'Tags'}
                  <div class="tags-edit-container">
                    {#each (editedMetadata.tags as string[]) || [] as tag, index (index)}
                      <div class="tag-edit-item">
                        <input
                          type="text"
                          class="tag-input"
                          value={tag}
                          onchange={(e) =>
                            updateTag(index, (e.target as HTMLInputElement).value)}
                          placeholder="Tag name"
                        />
                        <button
                          class="remove-tag-button"
                          onclick={() => removeTag(index)}
                          type="button"
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </div>
                    {/each}
                    <button class="add-tag-button" onclick={addTag} type="button">
                      + Add Tag
                    </button>
                  </div>
                {:else if field.type === 'boolean'}
                  <!-- Boolean checkbox -->
                  <label class="checkbox-field">
                    <input
                      type="checkbox"
                      checked={Boolean(field.value)}
                      onchange={(e) =>
                        updateField(field.key, (e.target as HTMLInputElement).checked)}
                    />
                    <span class="checkbox-label">
                      {field.value ? 'True' : 'False'}
                    </span>
                  </label>
                {:else if field.type === 'number'}
                  <!-- Number input -->
                  <input
                    type="number"
                    class="metadata-input"
                    value={field.value || ''}
                    onchange={(e) =>
                      updateField(
                        field.key,
                        Number((e.target as HTMLInputElement).value)
                      )}
                    placeholder={field.fieldDef?.description || 'Enter number'}
                    min={field.fieldDef?.constraints?.min}
                    max={field.fieldDef?.constraints?.max}
                  />
                {:else if field.type === 'date'}
                  <!-- Date input -->
                  <input
                    type="date"
                    class="metadata-input"
                    value={field.value ? String(field.value) : ''}
                    onchange={(e) =>
                      updateField(field.key, (e.target as HTMLInputElement).value)}
                    placeholder={field.fieldDef?.description || 'Select date'}
                  />
                {:else if field.type === 'select' && field.fieldDef?.constraints?.options}
                  <!-- Select dropdown -->
                  <select
                    class="metadata-input"
                    value={field.value || ''}
                    onchange={(e) =>
                      updateField(field.key, (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">-- Select an option --</option>
                    {#each field.fieldDef.constraints.options as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else}
                  <!-- Text input (default) -->
                  <input
                    type="text"
                    class="metadata-input"
                    value={String(field.value || '')}
                    onchange={(e) =>
                      updateField(field.key, (e.target as HTMLInputElement).value)}
                    placeholder={field.fieldDef?.description || 'Enter value'}
                    pattern={field.fieldDef?.constraints?.pattern}
                  />
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Read-only Mode -->
        <div class="metadata-grid">
          {#each formattedMetadata as item (item.key)}
            <div class="metadata-item">
              <div class="metadata-key">{item.key}</div>
              <div class="metadata-value" data-type={item.type}>
                {#if item.type === 'tags'}
                  <div class="tags-container">
                    {#each item.value.split(', ') as tag, index (index)}
                      <span class="tag">{tag}</span>
                    {/each}
                  </div>
                {:else if item.type === 'path'}
                  <code class="path-value">{item.value}</code>
                {:else if item.type === 'object'}
                  <pre class="object-value">{item.value}</pre>
                {:else}
                  {item.value}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if expanded && !hasMetadata}
    <div id="metadata-content" class="metadata-content">
      <div class="no-metadata">No metadata available</div>
    </div>
  {/if}
</div>

<style>
  .metadata-section {
    width: 100%;
  }

  .metadata-header-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .metadata-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    padding: 0.5rem 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    text-align: left;
  }

  .metadata-header:hover {
    color: var(--text-primary);
  }

  .metadata-header.expanded {
    color: var(--text-primary);
  }

  .metadata-icon {
    font-size: 0.75rem;
    width: 1rem;
    text-align: center;
    transition: transform 0.2s ease;
  }

  .metadata-title {
    flex: 1;
  }

  .edit-button {
    padding: 0.25rem 0.5rem;
    background: none;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }

  .edit-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .metadata-content {
    padding: 0.75rem 0 1rem 0;
    border-bottom: 1px solid var(--border-light);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .metadata-grid {
    display: grid;
    gap: 0.75rem;
  }

  .metadata-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2fr;
    gap: 1rem;
    align-items: start;
  }

  .metadata-key {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metadata-value {
    font-size: 0.875rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .metadata-value[data-type='date'] {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8rem;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .tag {
    display: inline-block;
    background: var(--bg-secondary);
    color: var(--text-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--border-light);
  }

  .path-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8rem;
    background: var(--bg-secondary);
    padding: 0.25rem 0.375rem;
    border-radius: 0.25rem;
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .object-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    padding: 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid var(--border-light);
    margin: 0;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  .no-metadata {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    text-align: center;
    padding: 1rem 0;
  }

  /* Edit Mode Styles */
  .metadata-edit-controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    justify-content: flex-end;
  }

  .save-button {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: background 0.2s ease;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cancel-button {
    padding: 0.375rem 0.75rem;
    background: none;
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s ease;
  }

  .cancel-button:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .cancel-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .metadata-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  .metadata-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .type-selector {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
    cursor: pointer;
  }

  .type-selector:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .type-selector:hover {
    border-color: var(--border-medium);
  }

  /* Tag editing styles */
  .tags-edit-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tag-edit-item {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .tag-input {
    flex: 1;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8rem;
  }

  .tag-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .remove-tag-button {
    padding: 0.25rem 0.5rem;
    background: var(--bg-danger);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    transition: background 0.2s ease;
  }

  .remove-tag-button:hover {
    background: var(--bg-danger-hover);
  }

  .add-tag-button {
    padding: 0.375rem 0.5rem;
    background: none;
    color: var(--accent-primary);
    border: 1px dashed var(--accent-primary);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s ease;
    align-self: flex-start;
  }

  .add-tag-button:hover {
    background: var(--accent-primary);
    color: white;
  }

  /* Schema field styling */
  .required-indicator {
    color: var(--error-text);
    font-weight: 600;
    margin-left: 0.25rem;
  }

  .field-description {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--text-secondary);
    color: white;
    text-align: center;
    font-size: 0.7rem;
    line-height: 1rem;
    margin-left: 0.25rem;
    cursor: help;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-field input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .checkbox-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .metadata-item {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    .metadata-key {
      font-size: 0.75rem;
    }

    .metadata-value {
      font-size: 0.8rem;
    }
  }
</style>
