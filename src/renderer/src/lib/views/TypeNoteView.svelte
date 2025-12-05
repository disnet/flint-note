<script lang="ts">
  import type { NoteViewProps } from './ViewRegistry';
  import type {
    MetadataSchema,
    MetadataFieldType
  } from '../../../../server/core/metadata-schema';
  import EditorHeader from '../../components/EditorHeader.svelte';
  import yaml from 'js-yaml';

  let { noteContent, metadata, onContentChange, onSave }: NoteViewProps = $props();

  // Type definition interface matching server's TypeNoteDefinition
  interface TypeDefinition {
    name: string;
    icon?: string;
    purpose: string;
    agent_instructions?: string[];
    metadata_schema?: MetadataSchema;
    suggestions_config?: Record<string, unknown>;
    default_review_mode?: boolean;
    editor_chips?: string[];
  }

  // Parse the YAML body from note content
  let definition = $derived.by(() => {
    if (!noteContent) {
      return createEmptyDefinition();
    }
    return parseDefinition(noteContent);
  });

  function createEmptyDefinition(): TypeDefinition {
    return {
      name: (metadata.flint_title as string) || 'untitled',
      purpose: '',
      agent_instructions: [],
      metadata_schema: { fields: [] }
    };
  }

  function parseDefinition(content: string): TypeDefinition {
    try {
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        return parsed as TypeDefinition;
      }
    } catch {
      // Fall back to empty definition
    }
    return createEmptyDefinition();
  }

  function serializeDefinition(def: TypeDefinition): string {
    return yaml.dump(def, {
      lineWidth: 80,
      noRefs: true,
      sortKeys: false
    });
  }

  // Editable state
  let editedPurpose = $state('');
  let editedIcon = $state('');
  let editedInstructions = $state<string[]>([]);
  let editedMetadataSchema = $state<MetadataSchema | null>(null);
  let editedDefaultReviewMode = $state(false);
  let editedEditorChips = $state<string[]>([]);
  let hasUnsavedChanges = $state(false);

  // Initialize edited state from definition
  $effect(() => {
    const def = definition;
    editedPurpose = def.purpose || '';
    editedIcon = def.icon || '';
    editedInstructions = [...(def.agent_instructions || [])];
    editedMetadataSchema = def.metadata_schema
      ? { fields: [...def.metadata_schema.fields] }
      : { fields: [] };
    editedDefaultReviewMode = def.default_review_mode || false;
    editedEditorChips = [...(def.editor_chips || [])];
    hasUnsavedChanges = false;
  });

  // Note title (from frontmatter)
  let noteTitle = $derived((metadata.flint_title as string) || 'Untitled Type');

  function markDirty(): void {
    hasUnsavedChanges = true;
  }

  function addInstruction(): void {
    editedInstructions = [...editedInstructions, ''];
    markDirty();
  }

  function removeInstruction(index: number): void {
    editedInstructions = editedInstructions.filter((_, i) => i !== index);
    markDirty();
  }

  function updateInstruction(index: number, value: string): void {
    editedInstructions[index] = value;
    editedInstructions = [...editedInstructions];
    markDirty();
  }

  function addSchemaField(): void {
    if (!editedMetadataSchema) {
      editedMetadataSchema = { fields: [] };
    }
    editedMetadataSchema.fields.push({
      name: '',
      type: 'string',
      description: '',
      required: false
    });
    editedMetadataSchema = { ...editedMetadataSchema };
    markDirty();
  }

  function removeSchemaField(index: number): void {
    if (!editedMetadataSchema) return;
    editedMetadataSchema.fields.splice(index, 1);
    editedMetadataSchema = { ...editedMetadataSchema };
    markDirty();
  }

  function updateSchemaField(
    index: number,
    field: 'name' | 'type' | 'description' | 'required',
    value: string | boolean
  ): void {
    if (!editedMetadataSchema) return;
    editedMetadataSchema.fields[index] = {
      ...editedMetadataSchema.fields[index],
      [field]: value
    };
    editedMetadataSchema = { ...editedMetadataSchema };
    markDirty();
  }

  function handlePurposeChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    editedPurpose = target.value;
    markDirty();
  }

  function handleIconChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    editedIcon = target.value;
    markDirty();
  }

  function handleDefaultReviewModeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    editedDefaultReviewMode = target.checked;
    markDirty();
  }

  function saveChanges(): void {
    // Build the updated definition
    const updatedDefinition: TypeDefinition = {
      name: noteTitle,
      purpose: editedPurpose
    };

    if (editedIcon) {
      updatedDefinition.icon = editedIcon;
    }

    if (editedInstructions.length > 0) {
      updatedDefinition.agent_instructions = editedInstructions.filter(
        (i) => i.trim() !== ''
      );
    }

    if (editedMetadataSchema && editedMetadataSchema.fields.length > 0) {
      updatedDefinition.metadata_schema = {
        fields: editedMetadataSchema.fields.filter((f) => f.name.trim() !== '')
      };
    }

    if (editedDefaultReviewMode) {
      updatedDefinition.default_review_mode = true;
    }

    if (editedEditorChips.length > 0) {
      updatedDefinition.editor_chips = editedEditorChips;
    }

    // Preserve other fields from original definition
    if (definition.suggestions_config) {
      updatedDefinition.suggestions_config = definition.suggestions_config;
    }

    // Serialize and update content
    const newContent = serializeDefinition(updatedDefinition);
    onContentChange(newContent);
    hasUnsavedChanges = false;

    // Trigger save
    onSave();
  }

  const fieldTypes: MetadataFieldType[] = [
    'string',
    'number',
    'boolean',
    'date',
    'array',
    'select'
  ];
</script>

<div class="type-note-view">
  <EditorHeader
    title={noteTitle}
    noteType="type"
    noteKind="type"
    onTitleChange={async () => {}}
    onTypeChange={async () => {}}
    disableTypeChange={true}
  />

  <div class="type-content">
    <div class="type-header">
      <h2>Type Definition: {noteTitle}</h2>
      {#if hasUnsavedChanges}
        <span class="unsaved-indicator">Unsaved changes</span>
      {/if}
    </div>

    <!-- Icon -->
    <div class="field-group">
      <label class="field-label">Icon</label>
      <input
        type="text"
        class="icon-input"
        value={editedIcon}
        oninput={handleIconChange}
        placeholder="Emoji icon (e.g., 📝)"
      />
    </div>

    <!-- Purpose -->
    <div class="field-group">
      <label class="field-label">Purpose</label>
      <textarea
        class="purpose-input"
        value={editedPurpose}
        oninput={handlePurposeChange}
        placeholder="Describe what this note type is used for..."
        rows="3"
      ></textarea>
    </div>

    <!-- Agent Instructions -->
    <div class="field-group">
      <label class="field-label">Agent Instructions</label>
      <div class="instructions-list">
        {#each editedInstructions as instruction, index (index)}
          <div class="instruction-row">
            <input
              type="text"
              class="instruction-input"
              value={instruction}
              oninput={(e) =>
                updateInstruction(index, (e.target as HTMLInputElement).value)}
              placeholder="Enter an instruction..."
            />
            <button
              class="remove-btn"
              onclick={() => removeInstruction(index)}
              title="Remove instruction"
            >
              ×
            </button>
          </div>
        {/each}
        <button class="add-btn" onclick={addInstruction}>+ Add Instruction</button>
      </div>
    </div>

    <!-- Metadata Schema -->
    <div class="field-group">
      <label class="field-label">Metadata Schema</label>
      <div class="schema-fields">
        {#if editedMetadataSchema && editedMetadataSchema.fields.length > 0}
          <div class="schema-header">
            <span class="schema-col name-col">Name</span>
            <span class="schema-col type-col">Type</span>
            <span class="schema-col desc-col">Description</span>
            <span class="schema-col req-col">Required</span>
            <span class="schema-col action-col"></span>
          </div>
          {#each editedMetadataSchema.fields as field, index (index)}
            <div class="schema-row">
              <input
                type="text"
                class="schema-input name-col"
                value={field.name}
                oninput={(e) =>
                  updateSchemaField(index, 'name', (e.target as HTMLInputElement).value)}
                placeholder="field_name"
              />
              <select
                class="schema-select type-col"
                value={field.type}
                onchange={(e) =>
                  updateSchemaField(index, 'type', (e.target as HTMLSelectElement).value)}
              >
                {#each fieldTypes as ft (ft)}
                  <option value={ft}>{ft}</option>
                {/each}
              </select>
              <input
                type="text"
                class="schema-input desc-col"
                value={field.description || ''}
                oninput={(e) =>
                  updateSchemaField(
                    index,
                    'description',
                    (e.target as HTMLInputElement).value
                  )}
                placeholder="Description"
              />
              <input
                type="checkbox"
                class="schema-checkbox req-col"
                checked={field.required || false}
                onchange={(e) =>
                  updateSchemaField(
                    index,
                    'required',
                    (e.target as HTMLInputElement).checked
                  )}
              />
              <button
                class="remove-btn action-col"
                onclick={() => removeSchemaField(index)}
                title="Remove field"
              >
                ×
              </button>
            </div>
          {/each}
        {/if}
        <button class="add-btn" onclick={addSchemaField}>+ Add Field</button>
      </div>
    </div>

    <!-- Default Review Mode -->
    <div class="field-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={editedDefaultReviewMode}
          onchange={handleDefaultReviewModeChange}
        />
        Default to review mode when opening notes of this type
      </label>
    </div>

    <!-- Save Button -->
    <div class="actions">
      <button class="save-btn" onclick={saveChanges} disabled={!hasUnsavedChanges}>
        Save Changes
      </button>
    </div>
  </div>
</div>

<style>
  .type-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .type-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .type-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .type-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--fg-primary);
  }

  .unsaved-indicator {
    font-size: 0.75rem;
    color: var(--fg-warning);
    background: var(--bg-warning);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .field-group {
    margin-bottom: 1.5rem;
  }

  .field-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fg-secondary);
    margin-bottom: 0.5rem;
  }

  .icon-input {
    width: 100px;
    padding: 0.5rem;
    font-size: 1.5rem;
    text-align: center;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--fg-primary);
  }

  .purpose-input {
    width: 100%;
    padding: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--fg-primary);
    resize: vertical;
    font-family: inherit;
  }

  .instructions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .instruction-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .instruction-input {
    flex: 1;
    padding: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--fg-primary);
  }

  .schema-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .schema-header,
  .schema-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .schema-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fg-muted);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border-color);
  }

  .schema-col {
    flex-shrink: 0;
  }

  .name-col {
    width: 150px;
  }

  .type-col {
    width: 100px;
  }

  .desc-col {
    flex: 1;
    min-width: 150px;
  }

  .req-col {
    width: 60px;
    text-align: center;
  }

  .action-col {
    width: 30px;
  }

  .schema-input,
  .schema-select {
    padding: 0.375rem;
    font-size: 0.8125rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--fg-primary);
  }

  .schema-checkbox {
    width: 16px;
    height: 16px;
    margin: 0 auto;
  }

  .remove-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .remove-btn:hover {
    background: var(--bg-error);
    color: var(--fg-error);
  }

  .add-btn {
    align-self: flex-start;
    padding: 0.5rem 1rem;
    border: 1px dashed var(--border-color);
    background: transparent;
    color: var(--fg-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    border-radius: 4px;
  }

  .add-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--fg-secondary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--fg-secondary);
    cursor: pointer;
  }

  .checkbox-label input {
    width: 16px;
    height: 16px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .save-btn {
    padding: 0.5rem 1.5rem;
    background: var(--bg-accent);
    color: var(--fg-on-accent);
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .save-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
