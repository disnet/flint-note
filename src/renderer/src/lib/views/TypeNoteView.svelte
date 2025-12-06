<script lang="ts">
  import type { NoteViewProps } from './ViewRegistry';
  import type {
    MetadataSchema,
    MetadataFieldType
  } from '../../../../server/core/metadata-schema';
  import EditorHeader from '../../components/EditorHeader.svelte';
  import EmojiPicker from '../../components/EmojiPicker.svelte';
  import { getChatService } from '../../services/chatService';
  import yaml from 'js-yaml';
  import { workspacesStore } from '../../stores/workspacesStore.svelte';
  import { notesShelfStore } from '../../stores/notesShelfStore.svelte';
  import { sidebarState } from '../../stores/sidebarState.svelte';
  import { notesStore } from '../../services/noteStore.svelte';

  let { noteContent, metadata, onContentChange, onSave }: NoteViewProps = $props();

  const noteService = getChatService();

  // Get note ID from metadata
  const noteId = $derived((metadata.flint_id as string) || (metadata.id as string) || '');

  // Check if note is archived - reactively look up from store to ensure immediate updates
  const isArchived = $derived.by(() => {
    const latestNote = notesStore.allNotes.find((n) => n.id === noteId);
    return latestNote?.archived === true;
  });

  // Type definition interface matching server's TypeNoteDefinition
  interface TypeDefinition {
    name: string;
    icon?: string;
    purpose: string;
    agent_instructions?: string[];
    metadata_schema?: MetadataSchema;
    suggestions_config?: {
      enabled: boolean;
      prompt_guidance?: string;
      suggestion_types?: string[];
    };
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
      lineWidth: -1,
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
  let editedSuggestionsEnabled = $state(false);
  let editedEditorChips = $state<string[]>([]);
  let isInitializing = $state(true);
  let lastInitializedNoteId = $state<string | null>(null);

  // Initialize edited state from definition - only when note ID changes
  // This prevents resetting state when noteContent prop updates after our own saves
  $effect(() => {
    const currentNoteId = noteId;
    if (currentNoteId === lastInitializedNoteId) {
      // Already initialized for this note, skip
      return;
    }

    const def = definition;
    isInitializing = true;
    lastInitializedNoteId = currentNoteId;
    editedPurpose = def.purpose || '';
    editedIcon = def.icon || '';
    // Ensure all instructions are strings (YAML parsing can produce non-strings)
    editedInstructions = (def.agent_instructions || [])
      .map((i) => (typeof i === 'string' ? i : String(i)))
      .filter((i) => i !== 'undefined' && i !== 'null');
    editedMetadataSchema = def.metadata_schema
      ? { fields: [...def.metadata_schema.fields] }
      : { fields: [] };
    editedDefaultReviewMode = def.default_review_mode || false;
    editedSuggestionsEnabled = def.suggestions_config?.enabled || false;
    editedEditorChips = [...(def.editor_chips || [])];
    // Use setTimeout to defer so state updates complete before allowing saves
    setTimeout(() => {
      isInitializing = false;
    }, 0);
  });

  // Note title (from frontmatter)
  let noteTitle = $derived((metadata.flint_title as string) || 'Untitled Type');

  // Debounce timer for saves
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const SAVE_DEBOUNCE_MS = 300;

  // Schedule a debounced save (unless initializing)
  function saveNow(): void {
    if (isInitializing) return;

    // Clear any pending save
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Schedule the save
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      performSave();
    }, SAVE_DEBOUNCE_MS);
  }

  // Actually perform the save
  function performSave(): void {
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
        (i) => typeof i === 'string' && i.trim() !== ''
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

    // Handle suggestions config - preserve existing config but update enabled state
    if (editedSuggestionsEnabled || definition.suggestions_config) {
      updatedDefinition.suggestions_config = {
        ...definition.suggestions_config,
        enabled: editedSuggestionsEnabled,
        prompt_guidance: definition.suggestions_config?.prompt_guidance || ''
      };
    }

    // Serialize and update content
    const newContent = serializeDefinition(updatedDefinition);
    onContentChange(newContent);

    // Trigger save
    onSave();
  }

  function addInstruction(): void {
    editedInstructions = [...editedInstructions, ''];
    saveNow();
  }

  function removeInstruction(index: number): void {
    editedInstructions = editedInstructions.filter((_, i) => i !== index);
    saveNow();
  }

  function updateInstruction(index: number, value: string): void {
    editedInstructions[index] = value;
    editedInstructions = [...editedInstructions];
    saveNow();
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
    saveNow();
  }

  function removeSchemaField(index: number): void {
    if (!editedMetadataSchema) return;
    editedMetadataSchema.fields.splice(index, 1);
    editedMetadataSchema = { ...editedMetadataSchema };
    saveNow();
  }

  function updateSchemaField(
    index: number,
    field: 'name' | 'type' | 'description',
    value: string
  ): void {
    if (!editedMetadataSchema) return;
    const oldName = editedMetadataSchema.fields[index].name;
    editedMetadataSchema.fields[index] = {
      ...editedMetadataSchema.fields[index],
      [field]: value
    };
    // Initialize constraints with empty options when switching to select type
    if (field === 'type' && value === 'select') {
      if (!editedMetadataSchema.fields[index].constraints) {
        editedMetadataSchema.fields[index].constraints = { options: [] };
      } else if (!editedMetadataSchema.fields[index].constraints!.options) {
        editedMetadataSchema.fields[index].constraints!.options = [];
      }
    }
    // Update editor_chips if field name changed
    if (field === 'name' && oldName !== value) {
      const chipIndex = editedEditorChips.indexOf(oldName);
      if (chipIndex >= 0) {
        editedEditorChips[chipIndex] = value;
        editedEditorChips = [...editedEditorChips];
      }
    }
    editedMetadataSchema = { ...editedMetadataSchema };
    saveNow();
  }

  function toggleEditorChip(fieldName: string): void {
    const index = editedEditorChips.indexOf(fieldName);
    if (index >= 0) {
      editedEditorChips = editedEditorChips.filter((_, i) => i !== index);
    } else {
      editedEditorChips = [...editedEditorChips, fieldName];
    }
    saveNow();
  }

  function isEditorChip(fieldName: string): boolean {
    return editedEditorChips.includes(fieldName);
  }

  function addSelectOption(fieldIndex: number): void {
    if (!editedMetadataSchema) return;
    const field = editedMetadataSchema.fields[fieldIndex];
    if (!field.constraints) {
      field.constraints = { options: [] };
    }
    if (!field.constraints.options) {
      field.constraints.options = [];
    }
    field.constraints.options.push('');
    editedMetadataSchema = { ...editedMetadataSchema };
    saveNow();
  }

  function removeSelectOption(fieldIndex: number, optionIndex: number): void {
    if (!editedMetadataSchema) return;
    const field = editedMetadataSchema.fields[fieldIndex];
    if (field.constraints?.options) {
      field.constraints.options.splice(optionIndex, 1);
      editedMetadataSchema = { ...editedMetadataSchema };
      saveNow();
    }
  }

  function updateSelectOption(
    fieldIndex: number,
    optionIndex: number,
    value: string
  ): void {
    if (!editedMetadataSchema) return;
    const field = editedMetadataSchema.fields[fieldIndex];
    if (field.constraints?.options) {
      field.constraints.options[optionIndex] = value;
      editedMetadataSchema = { ...editedMetadataSchema };
      saveNow();
    }
  }

  function updateConstraint(
    fieldIndex: number,
    key: 'min' | 'max' | 'pattern' | 'format',
    value: string
  ): void {
    if (!editedMetadataSchema) return;
    const field = editedMetadataSchema.fields[fieldIndex];
    if (!field.constraints) {
      field.constraints = {};
    }
    if (key === 'min' || key === 'max') {
      field.constraints[key] = value ? Number(value) : undefined;
    } else {
      field.constraints[key] = value || undefined;
    }
    editedMetadataSchema = { ...editedMetadataSchema };
    saveNow();
  }

  function handlePurposeChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    editedPurpose = target.value;
    saveNow();
  }

  function handleDefaultReviewModeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    editedDefaultReviewMode = target.checked;
    saveNow();
  }

  function handleSuggestionsEnabledChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    editedSuggestionsEnabled = target.checked;
    saveNow();
  }

  // Action menu handlers
  async function handlePinToggle(): Promise<void> {
    if (noteId) {
      await workspacesStore.togglePin(noteId);
    }
  }

  async function handleAddToShelf(): Promise<void> {
    if (noteId) {
      await notesShelfStore.addNote(noteId, noteTitle, noteContent);
      // Open the right sidebar if it's not already visible
      if (
        !sidebarState.rightSidebar.visible ||
        sidebarState.rightSidebar.mode !== 'notes'
      ) {
        if (!sidebarState.rightSidebar.visible) {
          sidebarState.toggleRightSidebar();
        }
        sidebarState.setRightSidebarMode('notes');
      }
    }
  }

  async function handleArchiveNote(): Promise<void> {
    try {
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }
      await noteService.archiveNote({
        vaultId: vault.id,
        identifier: noteId
      });
    } catch (err) {
      console.error('Error archiving note:', err);
    }
  }

  async function handleUnarchiveNote(): Promise<void> {
    try {
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }
      await noteService.unarchiveNote({
        vaultId: vault.id,
        identifier: noteId
      });
      // Note will automatically update via event system
    } catch (err) {
      console.error('Error unarchiving note:', err);
    }
  }

  const fieldTypes: MetadataFieldType[] = [
    'string',
    'number',
    'boolean',
    'date',
    'array',
    'select',
    'notelink',
    'notelinks'
  ];

  // System fields that can be shown in the editor
  const systemFields: { name: string; type: string }[] = [
    { name: 'flint_title', type: 'string' },
    { name: 'flint_type', type: 'string' },
    { name: 'flint_created', type: 'date' },
    { name: 'flint_updated', type: 'date' }
  ];

  // Note data for EditorHeader chips
  const noteData = $derived({
    id: noteId,
    type: 'type',
    created: (metadata.flint_created as string) || '',
    updated: (metadata.flint_updated as string) || '',
    metadata: metadata
  });

  // Empty schema (system fields like flint_created/flint_updated are built-in to EditorChips)
  const emptySchema: MetadataSchema = { fields: [] };

  // Default chips to show for type notes
  const typeNoteChips = ['flint_created', 'flint_updated'];
</script>

<div class="type-note-view">
  <EditorHeader
    title={noteTitle}
    noteType="type"
    noteKind="type"
    onTitleChange={async () => {}}
    onTypeChange={async () => {}}
    disableTypeChange={true}
    readOnly={true}
    note={noteData}
    metadataSchema={emptySchema}
    editorChips={typeNoteChips}
    isPinned={workspacesStore.isPinned(noteId)}
    isOnShelf={notesShelfStore.isOnShelf(noteId)}
    onPinToggle={handlePinToggle}
    onAddToShelf={handleAddToShelf}
    onArchiveNote={handleArchiveNote}
  />

  {#if isArchived}
    <div class="archived-banner">
      <span class="archived-icon">🗄️</span>
      <span class="archived-text">This type is archived (read-only)</span>
      <button class="unarchive-btn" onclick={handleUnarchiveNote} type="button">
        Unarchive Type
      </button>
    </div>
  {/if}

  <div class="type-content">
    <!-- Icon -->
    <section class="section">
      <h3 class="section-label">Icon</h3>
      <EmojiPicker
        bind:value={editedIcon}
        onselect={(emoji) => {
          editedIcon = emoji;
          saveNow();
        }}
      />
    </section>

    <!-- Purpose -->
    <section class="section">
      <h3 class="section-label">Purpose</h3>
      <textarea
        class="text-input purpose-textarea"
        value={editedPurpose}
        oninput={handlePurposeChange}
        placeholder="What is this note type used for?"
      ></textarea>
    </section>

    <!-- Agent Instructions -->
    <section class="section">
      <h3 class="section-label">Agent Instructions</h3>
      <div class="list-items">
        {#each editedInstructions as instruction, index (index)}
          <div class="list-item">
            <input
              type="text"
              class="text-input"
              value={instruction}
              oninput={(e) =>
                updateInstruction(index, (e.target as HTMLInputElement).value)}
              placeholder="Instruction for AI agent..."
            />
            <button
              class="remove-btn"
              onclick={() => removeInstruction(index)}
              title="Remove"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
        <button class="add-btn" onclick={addInstruction}>+ Add instruction</button>
      </div>
    </section>

    <!-- Metadata Schema -->
    <section class="section">
      <h3 class="section-label">Properties</h3>
      <div class="schema-list">
        <!-- System fields (read-only) -->
        {#each systemFields as sysField (sysField.name)}
          <div class="schema-field">
            <div class="schema-item system">
              <span class="schema-name-readonly">{sysField.name}</span>
              <span class="schema-type-readonly">{sysField.type}</span>
              <label class="schema-show-default">
                <input
                  type="checkbox"
                  checked={isEditorChip(sysField.name)}
                  onchange={() => toggleEditorChip(sysField.name)}
                />
                <span>show</span>
              </label>
            </div>
          </div>
        {/each}

        <!-- User-defined fields -->
        {#if editedMetadataSchema && editedMetadataSchema.fields.length > 0}
          {#each editedMetadataSchema.fields as field, index (index)}
            <div class="schema-field">
              <div class="schema-item">
                <input
                  type="text"
                  class="schema-name"
                  value={field.name}
                  oninput={(e) =>
                    updateSchemaField(
                      index,
                      'name',
                      (e.target as HTMLInputElement).value
                    )}
                  placeholder="name"
                />
                <select
                  class="schema-type"
                  value={field.type}
                  onchange={(e) =>
                    updateSchemaField(
                      index,
                      'type',
                      (e.target as HTMLSelectElement).value
                    )}
                >
                  {#each fieldTypes as ft (ft)}
                    <option value={ft}>{ft}</option>
                  {/each}
                </select>
                <label class="schema-show-default">
                  <input
                    type="checkbox"
                    checked={isEditorChip(field.name)}
                    onchange={() => toggleEditorChip(field.name)}
                  />
                  <span>show</span>
                </label>
                <button
                  class="remove-btn"
                  onclick={() => removeSchemaField(index)}
                  title="Remove"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <!-- Constraints based on type -->
              {#if field.type === 'string'}
                <div class="constraints-section">
                  <div class="constraint-row">
                    <span class="constraint-label">pattern</span>
                    <input
                      type="text"
                      class="constraint-input"
                      value={field.constraints?.pattern ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'pattern',
                          (e.target as HTMLInputElement).value
                        )}
                      placeholder="regex pattern"
                    />
                  </div>
                </div>
              {:else if field.type === 'number'}
                <div class="constraints-section">
                  <div class="constraint-row">
                    <span class="constraint-label">min</span>
                    <input
                      type="number"
                      class="constraint-input short"
                      value={field.constraints?.min ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'min',
                          (e.target as HTMLInputElement).value
                        )}
                    />
                    <span class="constraint-label">max</span>
                    <input
                      type="number"
                      class="constraint-input short"
                      value={field.constraints?.max ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'max',
                          (e.target as HTMLInputElement).value
                        )}
                    />
                  </div>
                </div>
              {:else if field.type === 'array'}
                <div class="constraints-section">
                  <div class="constraint-row">
                    <span class="constraint-label">min count</span>
                    <input
                      type="number"
                      class="constraint-input short"
                      value={field.constraints?.min ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'min',
                          (e.target as HTMLInputElement).value
                        )}
                    />
                    <span class="constraint-label">max count</span>
                    <input
                      type="number"
                      class="constraint-input short"
                      value={field.constraints?.max ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'max',
                          (e.target as HTMLInputElement).value
                        )}
                    />
                  </div>
                </div>
              {:else if field.type === 'date'}
                <div class="constraints-section">
                  <div class="constraint-row">
                    <span class="constraint-label">format</span>
                    <input
                      type="text"
                      class="constraint-input"
                      value={field.constraints?.format ?? ''}
                      oninput={(e) =>
                        updateConstraint(
                          index,
                          'format',
                          (e.target as HTMLInputElement).value
                        )}
                      placeholder="e.g. YYYY-MM-DD"
                    />
                  </div>
                </div>
              {:else if field.type === 'select'}
                <div class="constraints-section">
                  <div class="constraint-label">options</div>
                  <div class="select-options-list">
                    {#if field.constraints?.options}
                      {#each field.constraints.options as option, optionIndex (optionIndex)}
                        <div class="select-option-item">
                          <input
                            type="text"
                            class="select-option-input"
                            value={option}
                            oninput={(e) =>
                              updateSelectOption(
                                index,
                                optionIndex,
                                (e.target as HTMLInputElement).value
                              )}
                            placeholder="Option value"
                          />
                          <button
                            class="remove-btn small"
                            onclick={() => removeSelectOption(index, optionIndex)}
                            title="Remove option"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      {/each}
                    {/if}
                    <button class="add-btn small" onclick={() => addSelectOption(index)}>
                      + Add option
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
        <button class="add-btn" onclick={addSchemaField}>+ Add property</button>
      </div>
    </section>

    <!-- Options -->
    <section class="section">
      <h3 class="section-label">Options</h3>
      <label class="option-row">
        <input
          type="checkbox"
          checked={editedDefaultReviewMode}
          onchange={handleDefaultReviewModeChange}
        />
        <span>Default to review mode</span>
      </label>
      <label class="option-row">
        <input
          type="checkbox"
          checked={editedSuggestionsEnabled}
          onchange={handleSuggestionsEnabledChange}
        />
        <span>Enable AI suggestions</span>
      </label>
    </section>
  </div>
</div>

<style>
  .type-note-view {
    display: flex;
    gap: 1rem;
    flex-direction: column;
    min-width: 30ch;
    max-width: 75ch;
    width: 100%;
  }

  .type-content {
    padding: 0.5rem 0;
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.5rem 0;
  }

  .text-input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: inherit;
    resize: none;
  }

  .text-input:focus {
    outline: none;
    background: var(--bg-tertiary, var(--bg-secondary));
  }

  .text-input::placeholder {
    color: var(--text-muted);
  }

  .purpose-textarea {
    field-sizing: content;
    min-height: 2.5rem;
  }

  .list-items {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .list-item {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .list-item .text-input {
    flex: 1;
  }

  .schema-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .schema-field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .schema-item {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .schema-item.system {
    opacity: 0.7;
  }

  .schema-name-readonly {
    flex: 1;
    min-width: 100px;
    padding: 0.5rem 0.625rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-family: inherit;
  }

  .schema-type-readonly {
    padding: 0.5rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .schema-name {
    flex: 1;
    min-width: 100px;
    padding: 0.5rem 0.625rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: inherit;
  }

  .schema-name:focus {
    outline: none;
    background: var(--bg-tertiary, var(--bg-secondary));
  }

  .schema-name::placeholder {
    color: var(--text-muted);
  }

  .schema-type {
    padding: 0.5rem 0.5rem;
    font-size: 0.8125rem;
    border: none;
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
  }

  .schema-type:focus {
    outline: none;
  }

  .schema-show-default {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0 0.375rem;
    white-space: nowrap;
  }

  .schema-show-default input {
    width: 14px;
    height: 14px;
    margin: 0;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    flex-shrink: 0;
    opacity: 0.5;
    transition:
      opacity 0.15s,
      background 0.15s;
  }

  .remove-btn.small {
    width: 24px;
    height: 24px;
  }

  .remove-btn:hover {
    opacity: 1;
    background: var(--bg-secondary);
  }

  .constraints-section {
    margin-left: 1rem;
    padding-left: 0.75rem;
    border-left: 2px solid var(--bg-secondary);
  }

  .constraint-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .constraint-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .constraint-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    border: none;
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .constraint-input.short {
    flex: 0;
    width: 5rem;
  }

  .constraint-input:focus {
    outline: none;
    background: var(--bg-tertiary, var(--bg-secondary));
  }

  .constraint-input::placeholder {
    color: var(--text-muted);
  }

  .select-options-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .select-option-item {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .select-option-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    border: none;
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .select-option-input:focus {
    outline: none;
    background: var(--bg-tertiary, var(--bg-secondary));
  }

  .select-option-input::placeholder {
    color: var(--text-muted);
  }

  .add-btn {
    align-self: flex-start;
    padding: 0.375rem 0.625rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 6px;
  }

  .add-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .add-btn.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .option-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .option-row input {
    width: 16px;
    height: 16px;
    margin: 0;
  }

  .archived-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .archived-icon {
    font-size: 1.25rem;
  }

  .archived-text {
    flex: 1;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .unarchive-btn {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: opacity 0.15s ease;
  }

  .unarchive-btn:hover {
    opacity: 0.85;
  }
</style>
