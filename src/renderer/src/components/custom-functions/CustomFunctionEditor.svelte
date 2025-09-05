<script lang="ts">
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type {
    CustomFunction,
    CustomFunctionParameter,
    ValidationResult
  } from '../../stores/customFunctionsStore.svelte';

  interface Props {
    editingFunction?: CustomFunction;
    onSave?: (func: CustomFunction) => void;
    onCancel?: () => void;
  }

  let { editingFunction, onSave, onCancel }: Props = $props();

  // Form state
  let name = $state('');
  let description = $state('');
  let returnType = $state('void');
  let code = $state('');
  let tags = $state<string[]>([]);
  let parameters = $state<Record<string, CustomFunctionParameter>>({});

  // UI state
  let validation = $state<ValidationResult | null>(null);
  let isValidating = $state(false);
  let isSaving = $state(false);
  let showParameterModal = $state(false);
  let editingParameterKey = $state<string | null>(null);

  // Parameter modal state
  let parameterKey = $state('');
  let parameterType = $state('string');
  let parameterDescription = $state('');
  let parameterOptional = $state(false);
  let parameterDefault = $state('');

  // Tag input state
  let tagInput = $state('');

  // Common types for dropdown
  const COMMON_TYPES = [
    'string',
    'number',
    'boolean',
    'Date',
    'object',
    'any[]',
    'string[]',
    'number[]',
    'Note',
    'Note[]',
    'Promise<string>',
    'Promise<Note>',
    'Promise<Note[]>',
    'Promise<void>'
  ];

  // Initialize form when editingFunction changes
  $effect(() => {
    if (editingFunction) {
      name = editingFunction.name;
      description = editingFunction.description;
      returnType = editingFunction.returnType;
      code = editingFunction.code;
      tags = [...editingFunction.tags];
      parameters = { ...editingFunction.parameters };
    } else {
      resetForm();
    }
  });

  function resetForm(): void {
    name = '';
    description = '';
    returnType = 'void';
    code = '';
    tags = [];
    parameters = {};
    validation = null;
  }

  async function handleValidate(): Promise<void> {
    if (!name.trim() || !code.trim()) {
      return;
    }

    isValidating = true;
    try {
      validation = await customFunctionsStore.validateFunction($state.snapshot({
        name: name.trim(),
        description: description.trim(),
        parameters,
        returnType,
        code: code.trim(),
        tags
      }));
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      isValidating = false;
    }
  }

  async function handleSave(): Promise<void> {
    if (!name.trim() || !code.trim()) {
      return;
    }

    // Validate first
    await handleValidate();
    if (!validation?.valid) {
      return;
    }

    isSaving = true;
    try {
      let result: CustomFunction;

      if (editingFunction) {
        result = await customFunctionsStore.updateFunction($state.snapshot({
          id: editingFunction.id,
          name: name.trim(),
          description: description.trim(),
          parameters,
          returnType,
          code: code.trim(),
          tags
        }));
      } else {
        result = await customFunctionsStore.createFunction($state.snapshot({
          name: name.trim(),
          description: description.trim(),
          parameters,
          returnType,
          code: code.trim(),
          tags
        }));
      }

      onSave?.(result);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      isSaving = false;
    }
  }

  function handleCancel(): void {
    resetForm();
    onCancel?.();
  }

  // Parameter management
  function openParameterModal(key?: string): void {
    if (key && parameters[key]) {
      editingParameterKey = key;
      parameterKey = key;
      parameterType = parameters[key].type;
      parameterDescription = parameters[key].description || '';
      parameterOptional = parameters[key].optional || false;
      parameterDefault = parameters[key].default
        ? JSON.stringify(parameters[key].default)
        : '';
    } else {
      editingParameterKey = null;
      parameterKey = '';
      parameterType = 'string';
      parameterDescription = '';
      parameterOptional = false;
      parameterDefault = '';
    }
    showParameterModal = true;
  }

  function saveParameter(): void {
    if (!parameterKey.trim()) return;

    const newParam: CustomFunctionParameter = {
      type: parameterType,
      description: parameterDescription.trim() || undefined,
      optional: parameterOptional,
      default: parameterDefault.trim() ? JSON.parse(parameterDefault) : undefined
    };

    // If editing existing parameter with different key, remove old one
    if (editingParameterKey && editingParameterKey !== parameterKey) {
      delete parameters[editingParameterKey];
    }

    parameters[parameterKey.trim()] = newParam;
    showParameterModal = false;
  }

  function deleteParameter(key: string): void {
    delete parameters[key];
  }

  // Tag management
  function addTag(): void {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      tags = [...tags, tag];
      tagInput = '';
    }
  }

  function removeTag(index: number): void {
    tags = tags.filter((_, i) => i !== index);
  }

  function handleTagInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  }

  // Generate function template
  function generateTemplate(): void {
    const paramNames = Object.keys(parameters);
    const paramList = paramNames
      .map((name) => {
        const param = parameters[name];
        const optional = param.optional ? '?' : '';
        return `${name}${optional}: ${param.type}`;
      })
      .join(', ');

    const returnTypeStr = returnType === 'void' ? 'void' : returnType;
    const isAsync = returnTypeStr.includes('Promise');

    const template = `${isAsync ? 'async ' : ''}function ${name}(${paramList}): ${returnTypeStr} {
  // TODO: Implement function logic
  ${returnType === 'void' ? '// Function implementation' : 'return null; // Replace with actual return value'}
}`;

    code = template;
  }

  // Auto-validation on changes
  let validationTimeout: number | null = null;
  $effect(() => {
    if (name && code) {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
      validationTimeout = window.setTimeout(() => {
        handleValidate();
      }, 1000);
    }
  });
</script>

<div class="function-editor">
  <div class="editor-header">
    <h3>{editingFunction ? 'Edit Function' : 'Create New Function'}</h3>
    <div class="header-actions">
      <button class="btn-secondary" onclick={generateTemplate} disabled={!name}>
        Generate Template
      </button>
    </div>
  </div>

  <div class="editor-content">
    <!-- Basic Information -->
    <div class="section">
      <h4>Basic Information</h4>

      <div class="form-row">
        <div class="form-group">
          <label for="function-name">Function Name</label>
          <input
            id="function-name"
            type="text"
            bind:value={name}
            placeholder="myFunction"
            pattern="[a-zA-Z_$][a-zA-Z0-9_$]*"
            required
          />
          <small>Valid TypeScript identifier (letters, numbers, underscore, $)</small>
        </div>

        <div class="form-group">
          <label for="return-type">Return Type</label>
          <input
            id="return-type"
            type="text"
            bind:value={returnType}
            list="return-types"
            placeholder="void"
          />
          <datalist id="return-types">
            {#each COMMON_TYPES as type (type)}
              <option value={type}></option>
            {/each}
          </datalist>
        </div>
      </div>

      <div class="form-group">
        <label for="function-description">Description</label>
        <textarea
          id="function-description"
          bind:value={description}
          placeholder="Describe what this function does..."
          rows="2"
        ></textarea>
      </div>
    </div>

    <!-- Parameters -->
    <div class="section">
      <div class="section-header">
        <h4>Parameters</h4>
        <button class="btn-secondary-small" onclick={() => openParameterModal()}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Parameter
        </button>
      </div>

      {#if Object.keys(parameters).length > 0}
        <div class="parameters-list">
          {#each Object.entries(parameters) as [key, param] (key)}
            <div class="parameter-item">
              <div class="parameter-info">
                <code class="parameter-name">{key}</code>
                <span class="parameter-type">{param.type}</span>
                {#if param.optional}
                  <span class="optional-badge">optional</span>
                {/if}
                {#if param.description}
                  <span class="parameter-description">{param.description}</span>
                {/if}
              </div>
              <div class="parameter-actions">
                <button
                  class="btn-icon-small"
                  aria-label="Edit Parameter"
                  onclick={() => openParameterModal(key)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                    ></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                    ></path>
                  </svg>
                </button>
                <button
                  class="btn-icon-small danger"
                  aria-label="Delete Parameter"
                  onclick={() => deleteParameter(key)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path
                      d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-parameters">
          <span>No parameters defined</span>
        </div>
      {/if}
    </div>

    <!-- Tags -->
    <div class="section">
      <div class="section-header">
        <h4>Tags</h4>
      </div>

      <div class="tags-input">
        <div class="current-tags">
          {#each tags as tag, index (index)}
            <span class="tag">
              {tag}
              <button class="tag-remove" onclick={() => removeTag(index)}>×</button>
            </span>
          {/each}
        </div>
        <div class="add-tag">
          <input
            type="text"
            bind:value={tagInput}
            placeholder="Add tag..."
            onkeydown={handleTagInputKeydown}
          />
          <button
            class="btn-secondary-small"
            onclick={addTag}
            disabled={!tagInput.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Code Editor -->
    <div class="section code-section">
      <div class="section-header">
        <h4>Function Code</h4>
        <div class="code-actions">
          <button
            class="btn-secondary-small"
            onclick={handleValidate}
            disabled={isValidating}
          >
            {isValidating ? 'Validating...' : 'Validate'}
          </button>
        </div>
      </div>

      <div class="code-editor">
        <textarea
          bind:value={code}
          placeholder="Enter your TypeScript function code here..."
          spellcheck="false"
        ></textarea>
      </div>

      <!-- Validation Results -->
      {#if validation}
        <div class="validation-results">
          {#if validation.valid}
            <div class="validation-success">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              Function is valid
            </div>
          {:else}
            <div class="validation-errors">
              <h5>Validation Errors:</h5>
              {#each validation.errors as error, index (index)}
                <div class="error-item">
                  <span class="error-type">{error.type}</span>
                  <span class="error-message">{error.message}</span>
                  {#if error.suggestion}
                    <div class="error-suggestion">Suggestion: {error.suggestion}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if validation.warnings.length > 0}
            <div class="validation-warnings">
              <h5>Warnings:</h5>
              {#each validation.warnings as warning, index (index)}
                <div class="warning-item">
                  <span class="warning-type">{warning.type}</span>
                  <span class="warning-message">{warning.message}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Editor Actions -->
  <div class="editor-actions">
    <button class="btn-secondary" onclick={handleCancel}> Cancel </button>
    <button
      class="btn-primary"
      onclick={handleSave}
      disabled={isSaving ||
        !name.trim() ||
        !code.trim() ||
        (validation && !validation.valid)}
    >
      {isSaving ? 'Saving...' : editingFunction ? 'Update Function' : 'Create Function'}
    </button>
  </div>
</div>

<!-- Parameter Modal -->
{#if showParameterModal}
  <div
    class="modal-overlay"
    onclick={(e) => e.target === e.currentTarget && (showParameterModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showParameterModal = false)}
    role="dialog"
    tabindex="-1"
  >
    <div class="modal">
      <div class="modal-header">
        <h4>{editingParameterKey ? 'Edit Parameter' : 'Add Parameter'}</h4>
        <button class="modal-close" onclick={() => (showParameterModal = false)}>×</button
        >
      </div>

      <div class="modal-content">
        <div class="form-group">
          <label for="param-name">Parameter Name</label>
          <input
            id="param-name"
            type="text"
            bind:value={parameterKey}
            placeholder="parameterName"
            pattern="[a-zA-Z_$][a-zA-Z0-9_$]*"
          />
        </div>

        <div class="form-group">
          <label for="param-type">Type</label>
          <input
            id="param-type"
            type="text"
            bind:value={parameterType}
            list="param-types"
            placeholder="string"
          />
          <datalist id="param-types">
            {#each COMMON_TYPES as type (type)}
              <option value={type}></option>
            {/each}
          </datalist>
        </div>

        <div class="form-group">
          <label for="param-description">Description (optional)</label>
          <input
            id="param-description"
            type="text"
            bind:value={parameterDescription}
            placeholder="Describe this parameter..."
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={parameterOptional} />
              Optional parameter
            </label>
          </div>

          {#if parameterOptional}
            <div class="form-group">
              <label for="param-default">Default Value (JSON)</label>
              <input
                id="param-default"
                type="text"
                bind:value={parameterDefault}
                placeholder="null"
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => (showParameterModal = false)}>
          Cancel
        </button>
        <button
          class="btn-primary"
          onclick={saveParameter}
          disabled={!parameterKey.trim() || !parameterType.trim()}
        >
          {editingParameterKey ? 'Update' : 'Add'} Parameter
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .function-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .editor-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h4 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-group input,
  .form-group textarea {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-group small {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .checkbox-label {
    display: flex !important;
    flex-direction: row !important;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    margin: 0;
    width: auto;
  }

  /* Parameters */
  .parameters-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .parameter-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
  }

  .parameter-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .parameter-name {
    font-weight: 600;
    color: var(--accent);
  }

  .parameter-type {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .optional-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    color: var(--text-secondary);
  }

  .parameter-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .parameter-actions {
    display: flex;
    gap: 0.25rem;
  }

  .empty-parameters {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Tags */
  .tags-input {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .current-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .tag-remove {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
  }

  .add-tag {
    display: flex;
    gap: 0.5rem;
    max-width: 300px;
  }

  .add-tag input {
    flex: 1;
  }

  /* Code Editor */
  .code-section {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .code-editor {
    flex: 1;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .code-editor textarea {
    width: 100%;
    height: 300px;
    min-height: 200px;
    border: none;
    resize: vertical;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    padding: 1rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Validation */
  .validation-results {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
  }

  .validation-success {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #22c55e;
    font-weight: 500;
  }

  .validation-errors,
  .validation-warnings {
    margin-bottom: 1rem;
  }

  .validation-errors:last-child,
  .validation-warnings:last-child {
    margin-bottom: 0;
  }

  .validation-errors h5,
  .validation-warnings h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .error-item,
  .warning-item {
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }

  .error-item {
    background: #fee;
    border: 1px solid #fca5a5;
  }

  .warning-item {
    background: #fffbeb;
    border: 1px solid #fed7aa;
  }

  .error-type,
  .warning-type {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
    margin-right: 0.5rem;
  }

  .error-type {
    color: #dc2626;
  }

  .warning-type {
    color: #d97706;
  }

  .error-message,
  .warning-message {
    color: var(--text-primary);
  }

  .error-suggestion {
    margin-top: 0.25rem;
    font-style: italic;
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  /* Actions */
  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1rem 0;
    border-top: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  /* Buttons */
  .btn-secondary,
  .btn-primary,
  .btn-secondary-small,
  .btn-icon-small {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .btn-secondary-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .btn-icon-small {
    padding: 0.25rem;
  }

  .btn-secondary,
  .btn-secondary-small {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-secondary:hover,
  .btn-secondary-small:hover,
  .btn-icon-small:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, white);
  }

  .btn-icon-small.danger:hover {
    background: #fee;
    border-color: var(--danger);
    color: var(--danger);
  }

  .btn-secondary:disabled,
  .btn-primary:disabled,
  .btn-secondary-small:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Modal */
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
    border-radius: 0.75rem;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h4 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--border-light);
  }
</style>
