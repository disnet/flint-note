<script lang="ts">
  import { notesStore, type NoteMetadata } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { getChatService } from '../services/chatService';
  import type { GetNoteTypeInfoResult } from '@/server/api/types';
  import type {
    MetadataSchema,
    MetadataFieldType,
    MetadataFieldDefinition,
    MetadataFieldConstraints
  } from '@/server/core/metadata-schema';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    typeName: string;
    onBack: () => void;
    onNoteSelect?: (note: NoteMetadata) => void;
    onCreateNote?: (noteType?: string) => void;
  }

  let { typeName, onBack, onNoteSelect, onCreateNote }: Props = $props();

  let activeTab = $state<'details' | 'notes' | 'settings'>('details');
  let showDeleteConfirm = $state(false);
  let deleteAction = $state<'error' | 'delete'>('error');
  let isDeleting = $state(false);
  let deleteError = $state<string | null>(null);

  // Details tab state
  let typeInfo = $state<GetNoteTypeInfoResult | null>(null);
  let loadingDetails = $state(false);
  let detailsError = $state<string | null>(null);
  let purpose = $state('');
  let icon = $state('');
  let instructions = $state<string[]>([]);
  let metadataSchema = $state<MetadataSchema>({ fields: [] });
  let suggestionsEnabled = $state(false);
  let suggestionsPromptGuidance = $state('');
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let showArchived = $state(false);

  const notes = $derived.by(() => {
    // Get all notes of this type
    const allNotes = notesStore.allNotes.filter((n) => n.type === typeName);

    if (showArchived) {
      // Show only archived notes
      return allNotes.filter((n) => n.archived);
    } else {
      // Show only active notes (exclude archived)
      return allNotes.filter((n) => !n.archived);
    }
  });

  function handleNoteClick(note: NoteMetadata): void {
    onNoteSelect?.(note);
  }

  function handleNoteKeyDown(event: KeyboardEvent, note: NoteMetadata): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNoteClick(note);
    }
  }

  function handleCreateNote(): void {
    onCreateNote?.(typeName);
  }

  function handleDeleteClick(): void {
    showDeleteConfirm = true;
    deleteError = null;
  }

  function handleCancelDelete(): void {
    showDeleteConfirm = false;
    deleteAction = 'error';
  }

  async function handleConfirmDelete(): Promise<void> {
    try {
      isDeleting = true;
      deleteError = null;

      const noteService = getChatService();
      if (await noteService.isReady()) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          deleteError = 'No vault selected';
          return;
        }

        await noteService.deleteNoteType({
          typeName,
          action: deleteAction,
          vaultId: currentVault.id
        });

        // Refresh the note types list
        await notesStore.initialize();

        // Navigate back
        onBack();
      }
    } catch (err) {
      deleteError = err instanceof Error ? err.message : 'Failed to delete note type';
      console.error('Error deleting note type:', err);
    } finally {
      isDeleting = false;
    }
  }

  // Details tab functions
  async function loadTypeInfo(): Promise<void> {
    if (typeInfo || loadingDetails) return;

    try {
      loadingDetails = true;
      detailsError = null;
      const noteService = getChatService();
      if (await noteService.isReady()) {
        typeInfo = await noteService.getNoteTypeInfo({ typeName });
        if (typeInfo) {
          purpose = typeInfo.purpose || '';
          icon = typeInfo.icon || '';
          instructions = [...(typeInfo.instructions || [])];
          metadataSchema = typeInfo.metadata_schema
            ? { fields: [...typeInfo.metadata_schema.fields] }
            : { fields: [] };
          suggestionsEnabled = typeInfo.suggestions_config?.enabled || false;
          suggestionsPromptGuidance = typeInfo.suggestions_config?.prompt_guidance || '';
        }
      }
    } catch (err) {
      detailsError = err instanceof Error ? err.message : 'Failed to load note type info';
      console.error('Error loading note type info:', err);
    } finally {
      loadingDetails = false;
    }
  }

  async function saveTypeInfo(): Promise<void> {
    try {
      const noteService = getChatService();
      if (await noteService.isReady()) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          detailsError = 'No vault selected';
          return;
        }

        // System fields that cannot be redefined in metadata schema
        const systemFields = new Set([
          'id',
          'type',
          'title',
          'filename',
          'created',
          'modified',
          'tags',
          'path',
          'size'
        ]);

        const cleanMetadataSchema =
          metadataSchema && metadataSchema.fields
            ? metadataSchema.fields
                .filter(
                  (field) => field.name.trim() !== '' && !systemFields.has(field.name)
                )
                .map((field) => {
                  const cleanField: MetadataFieldDefinition = {
                    name: field.name,
                    type: field.type as MetadataFieldType,
                    description: field.description || undefined,
                    required: field.required || false
                  };

                  // Include constraints if they exist
                  if (field.constraints) {
                    const cleanConstraints: Partial<MetadataFieldConstraints> = {};
                    if (field.constraints.min !== undefined)
                      cleanConstraints.min = field.constraints.min;
                    if (field.constraints.max !== undefined)
                      cleanConstraints.max = field.constraints.max;
                    if (field.constraints.pattern)
                      cleanConstraints.pattern = field.constraints.pattern;
                    if (field.constraints.options)
                      cleanConstraints.options = field.constraints.options;
                    if (field.constraints.format)
                      cleanConstraints.format = field.constraints.format;

                    if (Object.keys(cleanConstraints).length > 0) {
                      cleanField.constraints = cleanConstraints;
                    }
                  }

                  // Include default value if it exists
                  if (field.default !== undefined) {
                    cleanField.default = field.default;
                  }

                  return cleanField;
                })
            : undefined;

        const params = {
          typeName: typeName,
          description: purpose,
          icon: icon || undefined,
          instructions: $state.snapshot(instructions),
          metadataSchema: cleanMetadataSchema,
          vaultId: currentVault.id
        };

        await noteService.updateNoteType($state.snapshot(params));

        // Refresh the note types store to update the icon in the UI
        await notesStore.initialize();
      }
    } catch (err) {
      detailsError = err instanceof Error ? err.message : 'Failed to save changes';
      console.error('Error saving note type changes:', err);
    }
  }

  async function saveSuggestionsConfig(): Promise<void> {
    try {
      const currentVault = await getChatService().getCurrentVault();
      if (!currentVault) {
        detailsError = 'No vault selected';
        return;
      }

      await window.api?.updateNoteSuggestionConfig({
        noteType: typeName,
        config: {
          enabled: suggestionsEnabled,
          prompt_guidance: suggestionsPromptGuidance
        },
        vaultId: currentVault.id
      });
    } catch (err) {
      detailsError =
        err instanceof Error ? err.message : 'Failed to save suggestions config';
      console.error('Error saving suggestions config:', err);
    }
  }

  function scheduleAutoSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveTypeInfo();
    }, 1000);
  }

  function scheduleSuggestionsAutoSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveSuggestionsConfig();
    }, 1000);
  }

  function addInstruction(): void {
    instructions = [...instructions, ''];
  }

  function removeInstruction(index: number): void {
    instructions = instructions.filter((_, i) => i !== index);
    scheduleAutoSave();
  }

  function updateInstruction(index: number, value: string): void {
    instructions[index] = value;
    instructions = [...instructions];
    scheduleAutoSave();
  }

  function addSchemaField(): void {
    metadataSchema.fields.push({
      name: '',
      type: 'string',
      description: '',
      required: false,
      constraints: undefined,
      default: undefined
    });
    metadataSchema = { ...metadataSchema };
  }

  function removeSchemaField(index: number): void {
    metadataSchema.fields.splice(index, 1);
    metadataSchema = { ...metadataSchema };
    scheduleAutoSave();
  }

  function updateSchemaField(
    index: number,
    field: 'name' | 'type' | 'description' | 'required',
    value: string | boolean
  ): void {
    metadataSchema.fields[index] = {
      ...metadataSchema.fields[index],
      [field]: value
    };
    metadataSchema = { ...metadataSchema };
    scheduleAutoSave();
  }

  function updateSchemaConstraint(
    index: number,
    constraintKey: string,
    value: string
  ): void {
    const field = metadataSchema.fields[index];
    if (!field.constraints) {
      field.constraints = {};
    }

    // Handle different value types
    if (constraintKey === 'min' || constraintKey === 'max') {
      field.constraints[constraintKey] = value ? Number(value) : undefined;
    } else if (constraintKey === 'options') {
      // Parse comma-separated string into array
      field.constraints.options = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (constraintKey === 'pattern') {
      field.constraints.pattern = value || undefined;
    } else if (constraintKey === 'format') {
      field.constraints.format = value || undefined;
    }

    metadataSchema = { ...metadataSchema };
    scheduleAutoSave();
  }

  function updateSchemaDefault(index: number, value: string): void {
    const field = metadataSchema.fields[index];

    // Convert default value based on type
    if (!value) {
      field.default = undefined;
    } else if (field.type === 'number') {
      field.default = Number(value);
    } else if (field.type === 'boolean') {
      field.default = value === 'true';
    } else if (field.type === 'array') {
      field.default = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      field.default = value;
    }

    metadataSchema = { ...metadataSchema };
    scheduleAutoSave();
  }

  function addSelectOption(fieldIndex: number): void {
    const field = metadataSchema.fields[fieldIndex];
    if (!field.constraints) {
      field.constraints = {};
    }
    if (!field.constraints.options) {
      field.constraints.options = [];
    }
    field.constraints.options.push('');
    metadataSchema = { ...metadataSchema };
  }

  function removeSelectOption(fieldIndex: number, optionIndex: number): void {
    const field = metadataSchema.fields[fieldIndex];
    if (field.constraints?.options) {
      field.constraints.options.splice(optionIndex, 1);
      metadataSchema = { ...metadataSchema };
      scheduleAutoSave();
    }
  }

  function updateSelectOption(
    fieldIndex: number,
    optionIndex: number,
    value: string
  ): void {
    const field = metadataSchema.fields[fieldIndex];
    if (field.constraints?.options) {
      field.constraints.options[optionIndex] = value;
      metadataSchema = { ...metadataSchema };
      scheduleAutoSave();
    }
  }

  // Load type info when switching to details tab
  $effect(() => {
    if (activeTab === 'details') {
      loadTypeInfo();
    }
  });
</script>

<div class="note-type-detail">
  <div class="detail-header">
    <button class="back-button" onclick={onBack}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Note Types
    </button>
  </div>

  <div class="type-title-section">
    <h1 class="type-title">{typeName}</h1>
    <button
      class="create-note-btn"
      onclick={handleCreateNote}
      title="Create new note of this type"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      New Note
    </button>
  </div>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'details'}
      onclick={() => (activeTab = 'details')}
    >
      Details
    </button>
    <button
      class="tab"
      class:active={activeTab === 'notes'}
      onclick={() => (activeTab = 'notes')}
    >
      Notes ({notes.length})
    </button>
    <button
      class="tab"
      class:active={activeTab === 'settings'}
      onclick={() => (activeTab = 'settings')}
    >
      Settings
    </button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'details'}
      <div class="details-tab">
        {#if loadingDetails}
          <p class="loading-text">Loading...</p>
        {:else if detailsError}
          <div class="error-banner">
            <p>{detailsError}</p>
          </div>
        {:else if typeInfo}
          <div class="details-form">
            <div class="form-section">
              <label for="purpose" class="form-label">Purpose</label>
              <textarea
                id="purpose"
                class="form-textarea"
                bind:value={purpose}
                onblur={scheduleAutoSave}
                placeholder="Brief description of what this note type is for..."
                rows="3"
              ></textarea>
            </div>

            <div class="form-section">
              <div class="form-label" role="heading" aria-level="3">Icon (Optional)</div>
              <EmojiPicker
                bind:value={icon}
                onselect={(emoji) => {
                  icon = emoji;
                  scheduleAutoSave();
                }}
              />
            </div>

            <div class="form-section">
              <h3 class="section-title">AI Suggestions</h3>
              <p class="section-description">
                Configure whether AI-powered suggestions are enabled for notes of this
                type.
              </p>

              <label class="checkbox-label suggestions-enable-label">
                <input
                  type="checkbox"
                  bind:checked={suggestionsEnabled}
                  onchange={() => scheduleSuggestionsAutoSave()}
                />
                Enable AI suggestions for this note type
              </label>

              {#if suggestionsEnabled}
                <div class="suggestions-config">
                  <label for="suggestions-guidance" class="form-label">
                    Suggestion Guidance
                  </label>
                  <textarea
                    id="suggestions-guidance"
                    class="form-textarea"
                    bind:value={suggestionsPromptGuidance}
                    onblur={scheduleSuggestionsAutoSave}
                    placeholder="Instructions for how the AI should analyze notes and make suggestions...&#10;&#10;Example: Analyze this note and suggest:&#10;1. Action items that need tracking&#10;2. People to follow up with&#10;3. Related notes to link&#10;4. Key decisions to document"
                    rows="6"
                  ></textarea>
                  <p class="help-text">
                    Provide specific instructions for the types of suggestions you want
                    the AI to generate for notes of this type.
                  </p>
                </div>
              {/if}
            </div>

            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Agent Instructions</h3>
                <button class="add-btn" onclick={addInstruction}>+ Add</button>
              </div>
              {#if instructions.length > 0}
                <div class="instructions-list">
                  {#each instructions as instruction, index (index)}
                    <div class="instruction-item">
                      <input
                        type="text"
                        class="form-input"
                        value={instruction}
                        oninput={(e) => updateInstruction(index, e.currentTarget.value)}
                        placeholder="Enter instruction..."
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
                <p class="empty-text">No instructions defined</p>
              {/if}
            </div>

            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Metadata Schema</h3>
                <button class="add-btn" onclick={addSchemaField}>+ Add Field</button>
              </div>
              {#if metadataSchema.fields.length > 0}
                <div class="schema-list">
                  {#each metadataSchema.fields as field, index (index)}
                    <div class="schema-field">
                      <div class="field-row">
                        <input
                          type="text"
                          class="form-input field-name"
                          value={field.name}
                          oninput={(e) =>
                            updateSchemaField(index, 'name', e.currentTarget.value)}
                          placeholder="Field name"
                        />
                        <select
                          class="form-select"
                          value={field.type}
                          onchange={(e) =>
                            updateSchemaField(index, 'type', e.currentTarget.value)}
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="date">Date</option>
                          <option value="array">Array</option>
                          <option value="select">Select</option>
                        </select>
                        <label class="checkbox-label">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onchange={(e) =>
                              updateSchemaField(
                                index,
                                'required',
                                e.currentTarget.checked
                              )}
                          />
                          Required
                        </label>
                        <button
                          class="remove-btn"
                          onclick={() => removeSchemaField(index)}
                          title="Remove field"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        type="text"
                        class="form-input field-description"
                        value={field.description || ''}
                        oninput={(e) =>
                          updateSchemaField(index, 'description', e.currentTarget.value)}
                        placeholder="Field description (optional)"
                      />

                      <!-- Constraints based on type -->
                      {#if field.type === 'number' || field.type === 'array'}
                        <div class="constraints-row">
                          <input
                            type="number"
                            class="form-input constraint-input"
                            value={field.constraints?.min ?? ''}
                            oninput={(e) =>
                              updateSchemaConstraint(index, 'min', e.currentTarget.value)}
                            placeholder="Min"
                          />
                          <input
                            type="number"
                            class="form-input constraint-input"
                            value={field.constraints?.max ?? ''}
                            oninput={(e) =>
                              updateSchemaConstraint(index, 'max', e.currentTarget.value)}
                            placeholder="Max"
                          />
                        </div>
                      {/if}

                      {#if field.type === 'string'}
                        <input
                          type="text"
                          class="form-input"
                          value={field.constraints?.pattern ?? ''}
                          oninput={(e) =>
                            updateSchemaConstraint(
                              index,
                              'pattern',
                              e.currentTarget.value
                            )}
                          placeholder="Regex pattern (optional)"
                        />
                      {/if}

                      {#if field.type === 'select'}
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
                          {#if field.constraints?.options && field.constraints.options.length > 0}
                            <div class="options-list">
                              {#each field.constraints.options as option, optionIndex (optionIndex)}
                                <div class="option-item">
                                  <input
                                    type="text"
                                    class="form-input"
                                    value={option}
                                    oninput={(e) =>
                                      updateSelectOption(
                                        index,
                                        optionIndex,
                                        e.currentTarget.value
                                      )}
                                    placeholder="Option value"
                                  />
                                  <button
                                    class="remove-btn"
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

                      {#if field.type === 'date'}
                        <input
                          type="text"
                          class="form-input"
                          value={field.constraints?.format ?? ''}
                          oninput={(e) =>
                            updateSchemaConstraint(
                              index,
                              'format',
                              e.currentTarget.value
                            )}
                          placeholder="Date format (e.g., YYYY-MM-DD)"
                        />
                      {/if}

                      <!-- Default value -->
                      {#if field.type === 'boolean'}
                        <label class="checkbox-label default-label">
                          <input
                            type="checkbox"
                            checked={field.default === true}
                            onchange={(e) =>
                              updateSchemaDefault(
                                index,
                                e.currentTarget.checked ? 'true' : 'false'
                              )}
                          />
                          Default value
                        </label>
                      {:else if field.type === 'array'}
                        <input
                          type="text"
                          class="form-input"
                          value={Array.isArray(field.default)
                            ? field.default.join(', ')
                            : ''}
                          oninput={(e) =>
                            updateSchemaDefault(index, e.currentTarget.value)}
                          placeholder="Default values (comma-separated)"
                        />
                      {:else}
                        <input
                          type="text"
                          class="form-input"
                          value={field.default?.toString() ?? ''}
                          oninput={(e) =>
                            updateSchemaDefault(index, e.currentTarget.value)}
                          placeholder="Default value (optional)"
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="empty-text">No metadata fields defined</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'notes'}
      <div class="notes-tab">
        <div class="notes-tab-header">
          <label class="checkbox-label archive-filter-label">
            <input type="checkbox" bind:checked={showArchived} />
            Show archived notes
          </label>
        </div>
        {#if notes.length > 0}
          <div class="notes-list">
            {#each notes as note, index (note.id || `${typeName}-${index}`)}
              <div
                class="note-item"
                class:archived={note.archived}
                role="button"
                tabindex="0"
                onclick={() => handleNoteClick(note)}
                onkeydown={(e) => handleNoteKeyDown(e, note)}
              >
                <div class="note-title">
                  {#if pinnedNotesStore.isPinned(note.id)}
                    <span class="pin-indicator" title="Pinned note">📌</span>
                  {/if}
                  {#if note.title}
                    {note.title}
                  {:else}
                    <span class="untitled-text">Untitled</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-message">
            <p>No notes of this type yet.</p>
            <button class="create-first-note-btn" onclick={handleCreateNote}>
              Create first note
            </button>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'settings'}
      <div class="settings-tab">
        <div class="danger-zone">
          <h2 class="danger-zone-title">Danger Zone</h2>
          <div class="danger-zone-content">
            <div class="danger-zone-info">
              <h3>Delete Note Type</h3>
              <p>
                Once you delete a note type, there is no going back. Please be certain.
              </p>
              {#if notes.length > 0}
                <p class="warning-text">
                  This note type has {notes.length}
                  {notes.length === 1 ? 'note' : 'notes'}. You must choose what to do with
                  them.
                </p>
              {/if}
            </div>
            <button class="delete-btn" onclick={handleDeleteClick}>
              Delete Note Type
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if showDeleteConfirm}
    <div
      class="modal-overlay"
      onclick={handleCancelDelete}
      onkeydown={(e) => e.key === 'Escape' && handleCancelDelete()}
      role="presentation"
    >
      <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && handleCancelDelete()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
      >
        <h2 class="modal-title" id="modal-title">Delete Note Type</h2>

        {#if deleteError}
          <div class="error-banner">
            <p>{deleteError}</p>
          </div>
        {/if}

        <div class="modal-content">
          <p>
            Are you sure you want to delete the <strong>{typeName}</strong> note type?
          </p>

          {#if notes.length > 0}
            <div class="action-selector">
              <p class="action-label">
                This type has {notes.length}
                {notes.length === 1 ? 'note' : 'notes'}. What should happen to them?
              </p>
              <label class="radio-option">
                <input
                  type="radio"
                  name="delete-action"
                  value="error"
                  bind:group={deleteAction}
                />
                <div>
                  <strong>Error if notes exist</strong>
                  <p class="option-description">
                    Prevent deletion if there are any notes
                  </p>
                </div>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="delete-action"
                  value="delete"
                  bind:group={deleteAction}
                />
                <div>
                  <strong>Delete all notes</strong>
                  <p class="option-description danger">
                    Permanently delete all {notes.length}
                    {notes.length === 1 ? 'note' : 'notes'}
                  </p>
                </div>
              </label>
            </div>
          {:else}
            <p class="info-text">
              This note type has no notes and can be safely deleted.
            </p>
          {/if}
        </div>

        <div class="modal-actions">
          <button
            class="confirm-delete-btn"
            onclick={handleConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Note Type'}
          </button>
          <button class="cancel-btn" onclick={handleCancelDelete} disabled={isDeleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .note-type-detail {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .detail-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .back-button:hover {
    color: var(--accent-primary);
  }

  .type-title-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1rem 1rem 1rem;
  }

  .type-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .create-note-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .create-note-btn:hover {
    background: var(--accent-primary-hover);
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .tab {
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .tab-content {
    flex: 1;
    overflow: auto;
    padding: 1.5rem 1rem;
  }

  .details-tab {
    max-width: 800px;
  }

  .loading-text {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .details-form {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-textarea,
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

  .form-textarea:focus,
  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .add-btn {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .add-btn:hover {
    background: var(--accent-primary-hover);
  }

  .instructions-list,
  .schema-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .instruction-item {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .instruction-item .form-input {
    flex: 1;
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

  .empty-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
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
    color: var(--accent-text);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .add-option-btn:hover {
    background: var(--accent-primary-hover);
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

  .empty-options-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
    text-align: center;
    padding: 0.5rem 0;
  }

  .notes-tab {
    max-width: 800px;
  }

  .notes-tab-header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-light);
  }

  .archive-filter-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-item {
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background 0.2s ease;
    border-radius: 0.375rem;
    border: 1px solid transparent;
  }

  .note-item:hover {
    background: var(--bg-secondary);
    border-color: var(--border-light);
  }

  .note-item:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .note-item.archived {
    opacity: 0.6;
  }

  .note-item.archived:hover {
    opacity: 0.8;
  }

  .note-item.archived .note-title {
    font-style: italic;
  }

  .note-title {
    font-weight: 500;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .untitled-text {
    color: var(--text-tertiary);
    opacity: 0.6;
    font-style: italic;
  }

  .pin-indicator {
    font-size: 0.875rem;
    opacity: 0.8;
    color: var(--accent-primary);
  }

  .empty-message {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-secondary);
  }

  .empty-message p {
    margin: 0 0 1rem 0;
    font-size: 0.9375rem;
  }

  .create-first-note-btn {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .create-first-note-btn:hover {
    background: var(--accent-primary-hover);
  }

  .settings-tab {
    max-width: 800px;
  }

  .danger-zone {
    border: 1px solid var(--error-border, #ef4444);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .danger-zone-title {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--error-text);
  }

  .danger-zone-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
  }

  .danger-zone-info {
    flex: 1;
  }

  .danger-zone-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .danger-zone-info p {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .warning-text {
    color: var(--error-text) !important;
    font-weight: 500;
  }

  .delete-btn {
    padding: 0.5rem 1rem;
    background: var(--error-bg, #fee);
    color: var(--error-text, #c00);
    border: 1px solid var(--error-border, #ef4444);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .delete-btn:hover {
    background: var(--error-text, #c00);
    color: white;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    padding: 1.5rem;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-title {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-content {
    margin-bottom: 1.5rem;
  }

  .modal-content p {
    margin: 0 0 1rem 0;
    font-size: 0.9375rem;
    color: var(--text-primary);
    line-height: 1.5;
  }

  .error-banner {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.75rem;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
    border-left: 3px solid var(--error-border, #ef4444);
  }

  .error-banner p {
    margin: 0;
    font-size: 0.875rem;
  }

  .action-selector {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .action-label {
    font-weight: 500;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .radio-option:hover {
    background: var(--bg-secondary);
    border-color: var(--accent-primary);
  }

  .radio-option input[type='radio'] {
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .radio-option div {
    flex: 1;
  }

  .radio-option strong {
    display: block;
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .option-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .option-description.danger {
    color: var(--error-text);
    font-weight: 500;
  }

  .info-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .confirm-delete-btn {
    padding: 0.75rem 1.5rem;
    background: var(--error-text, #c00);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .confirm-delete-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .confirm-delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    padding: 0.75rem 1.5rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .section-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }

  .suggestions-enable-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.5rem 0;
    font-weight: 500;
  }

  .suggestions-enable-label input[type='checkbox'] {
    cursor: pointer;
    width: 1rem;
    height: 1rem;
  }

  .suggestions-config {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 0.25rem 0 0 0;
    line-height: 1.4;
  }
</style>
