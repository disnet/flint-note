<script lang="ts">
  import type { GetNoteTypeInfoResult } from '@flint-note/server/dist/server/types';
  import { getChatService } from '../services/chatService';

  interface Props {
    typeName: string;
    onClose: () => void;
  }

  let { typeName, onClose }: Props = $props();

  let typeInfo = $state<GetNoteTypeInfoResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isEditing = $state(false);
  let editedPurpose = $state('');
  let editedInstructions = $state<string[]>([]);
  let editedMetadataSchema = $state<{fields: Record<string, {name: string, type: string, description?: string, required?: boolean}>} | null>(null);

  async function loadTypeInfo(): Promise<void> {
    if (typeInfo || loading) return;

    try {
      loading = true;
      error = null;
      const noteService = getChatService();
      if (await noteService.isReady()) {
        typeInfo = await noteService.getNoteTypeInfo({ typeName });
        if (typeInfo) {
          editedPurpose = typeInfo.purpose || '';
          editedInstructions = [...(typeInfo.instructions || [])];
          editedMetadataSchema = typeInfo.metadata_schema ? {
            fields: { ...typeInfo.metadata_schema.fields }
          } : { fields: {} };
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note type info';
      console.error('Error loading note type info:', err);
    } finally {
      loading = false;
    }
  }

  function toggleEdit(): void {
    if (!isEditing) {
      editedPurpose = typeInfo?.purpose || '';
      editedInstructions = [...(typeInfo?.instructions || [])];
      editedMetadataSchema = typeInfo?.metadata_schema ? {
        fields: { ...typeInfo.metadata_schema.fields }
      } : { fields: {} };
    }
    isEditing = !isEditing;
  }

  function addInstruction(): void {
    editedInstructions = [...editedInstructions, ''];
  }

  function removeInstruction(index: number): void {
    editedInstructions = editedInstructions.filter((_, i) => i !== index);
  }

  function addSchemaField(): void {
    if (!editedMetadataSchema) {
      editedMetadataSchema = { fields: {} };
    }
    const fieldId = `field_${Date.now()}`;
    editedMetadataSchema.fields[fieldId] = {
      name: '',
      type: 'string',
      description: '',
      required: false
    };
    editedMetadataSchema = { ...editedMetadataSchema };
  }

  function removeSchemaField(fieldId: string): void {
    if (!editedMetadataSchema) return;
    const { [fieldId]: removed, ...remaining } = editedMetadataSchema.fields;
    editedMetadataSchema = { fields: remaining };
  }

  function updateSchemaField(fieldId: string, field: 'name' | 'type' | 'description' | 'required', value: string | boolean): void {
    if (!editedMetadataSchema) return;
    editedMetadataSchema.fields[fieldId] = {
      ...editedMetadataSchema.fields[fieldId],
      [field]: value
    };
    editedMetadataSchema = { ...editedMetadataSchema };
  }

  async function saveChanges(): Promise<void> {
    if (!typeInfo) return;

    try {
      loading = true;
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        // Convert editedMetadataSchema fields to MetadataFieldDefinition array
        const metadataSchema = editedMetadataSchema && editedMetadataSchema.fields
          ? Object.values(editedMetadataSchema.fields)
              .filter(field => field.name.trim() !== '')
              .map(field => ({
                name: field.name,
                type: field.type,
                description: field.description || undefined,
                required: field.required || false
              }))
          : undefined;

        await noteService.updateNoteType({
          typeName: typeName,
          description: editedPurpose,
          instructions: $state.snapshot(editedInstructions),
          metadataSchema: metadataSchema
        });

        // Update local state with saved changes
        typeInfo.purpose = editedPurpose;
        typeInfo.instructions = [...editedInstructions];
        if (editedMetadataSchema) {
          typeInfo.metadata_schema = editedMetadataSchema;
        }

        isEditing = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note type changes';
      console.error('Error saving note type changes:', err);
    } finally {
      loading = false;
    }
  }

  function cancelEdit(): void {
    editedPurpose = typeInfo?.purpose || '';
    editedInstructions = [...(typeInfo?.instructions || [])];
    editedMetadataSchema = typeInfo?.metadata_schema ? {
      fields: { ...typeInfo.metadata_schema.fields }
    } : { fields: {} };
    isEditing = false;
  }

  // Load type info when component mounts
  loadTypeInfo();
</script>

<div class="type-info-overlay">
  <div class="overlay-header">
    <div class="header-left">
      <h3>{typeName}</h3>
      <div class="header-actions">
        {#if !loading && !error && typeInfo}
          <button
            class="edit-btn"
            onclick={toggleEdit}
            title={isEditing ? 'Cancel editing' : 'Edit note type'}
          >
            {isEditing ? '✕' : '✏️'}
          </button>
        {/if}
      </div>
    </div>
    <button class="close-btn" onclick={onClose} title="Close overlay"> ✕ </button>
  </div>

  <div class="overlay-content">
    {#if loading}
      <div class="loading">Loading note type information...</div>
    {:else if error}
      <div class="error">Error: {error}</div>
    {:else if typeInfo}
      <div class="info-sections">
        <div class="info-section">
          <h4>Description</h4>
          {#if isEditing}
            <textarea
              bind:value={editedPurpose}
              placeholder="Enter note type description..."
              class="edit-textarea"
            ></textarea>
          {:else if typeInfo.purpose}
            <p>{typeInfo.purpose}</p>
          {:else}
            <p class="no-data">No description available</p>
          {/if}
        </div>

        <div class="info-section">
          <div class="section-header">
            <h4>Agent Instructions</h4>
            {#if isEditing}
              <button class="add-btn" onclick={addInstruction} title="Add instruction">
                +
              </button>
            {/if}
          </div>

          {#if isEditing}
            {#if editedInstructions.length > 0}
              <div class="instructions-edit">
                {#each editedInstructions as _, index (index)}
                  <div class="instruction-edit-row">
                    <input
                      type="text"
                      bind:value={editedInstructions[index]}
                      placeholder="Enter instruction..."
                      class="edit-input"
                    />
                    <button
                      class="remove-btn"
                      onclick={() => removeInstruction(index)}
                      title="Remove instruction"
                    >
                      ✕
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="no-data">No instructions. Click + to add one.</p>
            {/if}
          {:else if typeInfo.instructions && typeInfo.instructions.length > 0}
            <ul>
              {#each typeInfo.instructions as instruction, index (`${typeName}-instruction-${index}`)}
                <li>{instruction}</li>
              {/each}
            </ul>
          {:else}
            <p class="no-data">No agent instructions defined</p>
          {/if}
        </div>

        <div class="info-section">
          <div class="section-header">
            <h4>Metadata Schema</h4>
            {#if isEditing}
              <button class="add-btn" onclick={addSchemaField} title="Add schema field">
                +
              </button>
            {/if}
          </div>

          {#if isEditing}
            {#if editedMetadataSchema && editedMetadataSchema.fields && Object.keys(editedMetadataSchema.fields).length > 0}
              <div class="schema-edit">
                {#each Object.entries(editedMetadataSchema.fields) as [fieldId, fieldInfo] (fieldId)}
                  <div class="schema-field-edit">
                    <div class="field-edit-row">
                      <input
                        type="text"
                        bind:value={fieldInfo.name}
                        placeholder="Field name"
                        class="edit-input field-name-input"
                        oninput={(e) => updateSchemaField(fieldId, 'name', e.target.value)}
                      />
                      <select
                        bind:value={fieldInfo.type}
                        class="edit-select field-type-select"
                        onchange={(e) => updateSchemaField(fieldId, 'type', e.target.value)}
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                      </select>
                      <label class="required-checkbox">
                        <input
                          type="checkbox"
                          bind:checked={fieldInfo.required}
                          onchange={(e) => updateSchemaField(fieldId, 'required', e.target.checked)}
                        />
                        <span class="checkbox-label">Required</span>
                      </label>
                      <button
                        class="remove-btn"
                        onclick={() => removeSchemaField(fieldId)}
                        title="Remove field"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      bind:value={fieldInfo.description}
                      placeholder="Field description (optional)"
                      class="edit-input field-description-input"
                      oninput={(e) => updateSchemaField(fieldId, 'description', e.target.value)}
                    />
                  </div>
                {/each}
              </div>
            {:else}
              <p class="no-data">No schema fields. Click + to add one.</p>
            {/if}
          {:else if typeInfo.metadata_schema}
            <div class="schema-info">
              {#if typeInfo.metadata_schema.fields && Object.keys(typeInfo.metadata_schema.fields).length > 0}
                {#each Object.entries(typeInfo.metadata_schema.fields) as [_, fieldInfo] (`${typeName}-field-${fieldInfo.name}`)}
                  <div class="schema-field">
                    <span class="field-name">{fieldInfo.name}</span>
                    {#if fieldInfo.required}
                      <span class="field-required">*</span>
                    {/if}
                    <span class="field-type">({fieldInfo.type})</span>
                    {#if fieldInfo.description}
                      <span class="field-description">
                        {fieldInfo.description}
                      </span>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="no-data">No metadata schema fields defined</p>
              {/if}
            </div>
          {:else}
            <p class="no-data">No metadata schema defined</p>
          {/if}
        </div>
      </div>

      {#if isEditing}
        <div class="edit-actions">
          <button class="save-btn" onclick={saveChanges}> Save Changes </button>
          <button class="cancel-btn" onclick={cancelEdit}> Cancel </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .type-info-overlay {
    width: 100%;
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    overflow: hidden;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .overlay-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header-left h3 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .edit-btn,
  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .edit-btn:hover,
  .close-btn:hover {
    background: var(--bg-secondary);
    color: var(--accent-primary);
  }

  .overlay-content {
    padding: 1rem;
  }

  .loading,
  .error {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .error {
    color: var(--error-text);
  }

  .info-sections {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .info-section {
    background: var(--bg-primary);
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .info-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .section-header h4 {
    margin: 0;
  }

  .add-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 50%;
    width: 1.5rem;
    height: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  .add-btn:hover {
    background: var(--accent-primary-hover);
    transform: scale(1.1);
  }

  .info-section p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .info-section ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .info-section li {
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }

  .edit-textarea {
    width: 100%;
    min-height: 4rem;
    padding: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    resize: vertical;
    transition: border-color 0.2s ease;
  }

  .edit-textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .instructions-edit {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .instruction-edit-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .edit-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .edit-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .remove-btn {
    background: var(--error-bg);
    color: var(--error-text);
    border: none;
    border-radius: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    transition: all 0.2s ease;
  }

  .remove-btn:hover {
    background: var(--error-text);
    color: white;
  }

  .schema-info {
    font-size: 0.875rem;
  }

  .schema-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border-radius: 0.25rem;
  }

  .field-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .field-type {
    color: var(--text-muted);
    font-family: monospace;
    font-size: 0.8rem;
  }

  .field-description {
    color: var(--text-secondary);
    flex: 1;
  }

  .no-data {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.875rem;
  }

  .edit-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .save-btn,
  .cancel-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .save-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .save-btn:hover {
    background: var(--accent-primary-hover);
  }

  .cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  .cancel-btn:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .schema-edit {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .schema-field-edit {
    background: var(--bg-secondary);
    border-radius: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
  }

  .field-edit-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .field-name-input {
    flex: 2;
  }

  .field-type-select {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.25rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .field-type-select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .field-description-input {
    width: 100%;
    margin: 0;
  }

  .required-checkbox {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .required-checkbox input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }

  .checkbox-label {
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .field-required {
    color: var(--error-text);
    font-weight: 600;
    margin-left: 0.25rem;
  }
</style>
