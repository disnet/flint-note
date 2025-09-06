<script lang="ts">
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type {
    CustomFunction,
    CustomFunctionStats,
    CustomFunctionParameter,
    ValidationResult
  } from '../../stores/customFunctionsStore.svelte';
  import CodeEditor from '../CodeEditor.svelte';

  interface Props {
    func: CustomFunction;
    onTest?: () => void;
    onClose?: () => void;
  }

  let { func, onTest, onClose }: Props = $props();

  // Editable state - these will be the live values
  let name = $state('');
  let description = $state('');
  let returnType = $state('');
  let code = $state('');
  let tags = $state<string[]>([]);
  let parameters = $state<Record<string, CustomFunctionParameter>>({});

  // UI state
  let functionStats = $state<CustomFunctionStats | null>(null);
  let isLoadingStats = $state(false);
  let isSaving = $state(false);
  let hasUnsavedChanges = $state(false);
  let validation = $state<ValidationResult | null>(null);
  let isValidating = $state(false);
  let showParameterModal = $state(false);
  let editingParameterKey = $state<string | null>(null);
  let tagInput = $state('');

  // Parameter modal state
  let parameterKey = $state('');
  let parameterType = $state('string');
  let parameterDescription = $state('');
  let parameterOptional = $state(false);
  let parameterDefault = $state('');

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

  // Initialize editable fields from the function prop
  $effect(() => {
    if (func) {
      name = func.name;
      description = func.description;
      returnType = func.returnType;
      code = func.code;
      tags = [...func.tags];
      parameters = { ...func.parameters };
      hasUnsavedChanges = false;
    }
  });

  // Track changes to detect unsaved modifications
  $effect(() => {
    if (!func) return;

    const changed =
      name !== func.name ||
      description !== func.description ||
      returnType !== func.returnType ||
      code !== func.code ||
      JSON.stringify(tags) !== JSON.stringify(func.tags) ||
      JSON.stringify(parameters) !== JSON.stringify(func.parameters);

    hasUnsavedChanges = changed;
  });

  // Load function-specific stats
  $effect(() => {
    loadFunctionStats();
  });

  async function loadFunctionStats(): Promise<void> {
    isLoadingStats = true;
    try {
      functionStats = await customFunctionsStore.getFunctionStats(func.id);
    } catch (error) {
      console.error('Failed to load function stats:', error);
    } finally {
      isLoadingStats = false;
    }
  }

  async function saveFunction(): Promise<void> {
    if (!hasUnsavedChanges) return;

    isSaving = true;
    try {
      await customFunctionsStore.updateFunction(
        $state.snapshot({
          id: func.id,
          name: name.trim(),
          description: description.trim(),
          returnType,
          code: code.trim(),
          tags,
          parameters
        })
      );
      hasUnsavedChanges = false;
    } catch (error) {
      console.error('Failed to save function:', error);
    } finally {
      isSaving = false;
    }
  }

  async function handleValidate(): Promise<void> {
    if (!name.trim() || !code.trim()) {
      return;
    }

    isValidating = true;
    try {
      validation = await customFunctionsStore.validateFunction(
        $state.snapshot({
          name: name.trim(),
          description: description.trim(),
          parameters,
          returnType,
          code: code.trim(),
          tags
        })
      );
    } catch (error) {
      console.error('Validation failed:', error);
      validation = {
        valid: false,
        errors: [{ type: 'validation', message: 'Validation failed' }],
        warnings: []
      };
    } finally {
      isValidating = false;
    }
  }

  // Parameter management
  function openParameterModal(paramKey?: string): void {
    editingParameterKey = paramKey || null;

    if (paramKey && parameters[paramKey]) {
      const param = parameters[paramKey];
      parameterKey = paramKey;
      parameterType = param.type;
      parameterDescription = param.description || '';
      parameterOptional = param.optional || false;
      parameterDefault = param.default ? JSON.stringify(param.default) : '';
    } else {
      parameterKey = '';
      parameterType = 'string';
      parameterDescription = '';
      parameterOptional = false;
      parameterDefault = '';
    }

    showParameterModal = true;
  }

  function saveParameter(): void {
    const trimmedKey = parameterKey.trim();
    if (!trimmedKey) return;

    const newParam: CustomFunctionParameter = {
      type: parameterType,
      description: parameterDescription.trim() || undefined,
      optional: parameterOptional
    };

    if (parameterDefault.trim()) {
      try {
        newParam.default = JSON.parse(parameterDefault);
      } catch {
        // Invalid JSON, keep as string
        newParam.default = parameterDefault;
      }
    }

    // Remove old parameter if key changed
    if (editingParameterKey && editingParameterKey !== trimmedKey) {
      const newParams = { ...parameters };
      delete newParams[editingParameterKey];
      parameters = newParams;
    }

    parameters = { ...parameters, [trimmedKey]: newParam };
    closeParameterModal();
  }

  function deleteParameter(paramKey: string): void {
    const newParams = { ...parameters };
    delete newParams[paramKey];
    parameters = newParams;
  }

  function closeParameterModal(): void {
    showParameterModal = false;
    editingParameterKey = null;
  }

  // Tag management
  function addTag(): void {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      tags = [...tags, trimmedTag];
      tagInput = '';
    }
  }

  function removeTag(tagToRemove: string): void {
    tags = tags.filter((tag) => tag !== tagToRemove);
  }

  function handleTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function getParameterCount(): number {
    return Object.keys(func.parameters).length;
  }

  function getOptionalParameterCount(): number {
    return Object.values(func.parameters).filter((p) => p.optional).length;
  }

  function getRequiredParameterCount(): number {
    return Object.values(func.parameters).filter((p) => !p.optional).length;
  }

  function getCodeLineCount(): number {
    return func.code.split('\n').length;
  }

  function getCodeCharacterCount(): number {
    return func.code.length;
  }

  function isAsyncFunction(): boolean {
    return func.returnType.includes('Promise') || func.code.includes('async ');
  }

  function hasDefaultParameters(): boolean {
    return Object.values(func.parameters).some((p) => p.default !== undefined);
  }

  async function exportFunction(): Promise<void> {
    const exportData = {
      function: func,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-function-${func.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyFunctionSignature(): void {
    const paramList = Object.entries(parameters)
      .map(([pName, param]) => `${pName}${param.optional ? '?' : ''}: ${param.type}`)
      .join(', ');

    const signature = `${name}(${paramList}): ${returnType}`;

    navigator.clipboard
      .writeText(signature)
      .then(() => {
        // Could show toast notification
      })
      .catch(console.error);
  }

  function copyFunctionCode(): void {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        // Could show toast notification
      })
      .catch(console.error);
  }
</script>

<div class="function-details">
  <div class="details-header">
    <div class="function-title">
      <div class="title-input-group">
        <label for="function-name">Function Name</label>
        <input
          id="function-name"
          type="text"
          bind:value={name}
          class="title-input"
          placeholder="Function name"
        />
      </div>
      <div class="function-meta">
        <span class="creation-info">
          Created by {func.metadata.createdBy} on {formatDate(func.metadata.createdAt)}
        </span>
        {#if func.metadata.updatedAt.getTime() !== func.metadata.createdAt.getTime()}
          <span class="update-info">
            Last updated {formatDate(func.metadata.updatedAt)}
          </span>
        {/if}
        {#if hasUnsavedChanges}
          <span class="unsaved-indicator">• Unsaved changes</span>
        {/if}
      </div>
    </div>

    <div class="header-actions">
      <button
        class="btn-secondary"
        onclick={handleValidate}
        disabled={isValidating || !name.trim() || !code.trim()}
      >
        {#if isValidating}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="spinner"
          >
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        {:else}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9,11 12,14 22,4"></polyline>
            <path d="M21,12v7a2,2 0 0,1 -2,2H5a2,2 0 0,1 -2,-2V5a2,2 0 0,1 2,-2h11"
            ></path>
          </svg>
        {/if}
        Validate
      </button>

      <button
        class="btn-primary"
        onclick={saveFunction}
        disabled={isSaving || !hasUnsavedChanges}
      >
        {#if isSaving}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="spinner"
          >
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        {:else}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
            ></path>
            <polyline points="17,21 17,13 7,13 7,21"></polyline>
            <polyline points="7,3 7,8 15,8"></polyline>
          </svg>
        {/if}
        Save
      </button>

      {#if onTest}
        <button class="btn-secondary" onclick={onTest}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5,3 19,12 5,21"></polygon>
          </svg>
          Test
        </button>
      {/if}

      {#if onClose}
        <button class="btn-secondary" onclick={onClose}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Close
        </button>
      {/if}
    </div>
  </div>

  <div class="details-content">
    <!-- Validation Results -->
    {#if validation}
      <section class="details-section">
        <h4>Validation Results</h4>
        <div
          class="validation-results"
          class:valid={validation.valid}
          class:invalid={!validation.valid}
        >
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
              Function is valid and ready to use
            </div>
          {:else}
            <div class="validation-errors">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <div class="error-list">
                {#each validation.errors as error (error)}
                  <div class="error-item">{error}</div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Basic Information -->
    <section class="details-section">
      <h4>Basic Information</h4>
      <div class="info-grid">
        <div class="info-item">
          <label for="function-description"><strong>Description:</strong></label>
          <textarea
            id="function-description"
            bind:value={description}
            class="description-input"
            placeholder="Describe what this function does..."
            rows="3"
          ></textarea>
        </div>

        <div class="info-item">
          <label for="return-type"><strong>Return Type:</strong></label>
          <select id="return-type" bind:value={returnType} class="return-type-select">
            {#each COMMON_TYPES as type (type)}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

        <div class="info-item">
          <strong>Version:</strong>
          <span>v{func.metadata.version}</span>
        </div>

        <div class="info-item">
          <label for="tags"><strong>Tags:</strong></label>
          <div class="tags-editor">
            <div class="tags-display">
              {#each tags as tag (tag)}
                <span class="tag">
                  {tag}
                  <button
                    type="button"
                    class="tag-remove"
                    onclick={() => removeTag(tag)}
                    aria-label="Remove tag {tag}"
                  >
                    ×
                  </button>
                </span>
              {/each}
            </div>
            <div class="tag-input-group">
              <input
                type="text"
                bind:value={tagInput}
                onkeydown={handleTagKeydown}
                placeholder="Add tag..."
                class="tag-input"
              />
              <button type="button" onclick={addTag} class="btn-secondary btn-small"
                >Add</button
              >
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Function Signature -->
    <section class="details-section">
      <div class="section-header">
        <h4>Function Signature</h4>
        <button
          class="btn-icon"
          title="Copy Signature"
          aria-label="Copy Signature"
          onclick={copyFunctionSignature}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>

      <div class="signature-display">
        <code class="function-signature">
          {name}({Object.entries(parameters)
            .map(
              ([pName, param]) => `${pName}${param.optional ? '?' : ''}: ${param.type}`
            )
            .join(', ')}): {returnType}
        </code>
      </div>
    </section>

    <!-- Parameters -->
    <section class="details-section">
      <div class="section-header">
        <h4>Parameters ({Object.keys(parameters).length})</h4>
        <button class="btn-secondary btn-small" onclick={() => openParameterModal()}>
          <svg
            width="16"
            height="16"
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
          {#each Object.entries(parameters) as [pName, param] (pName)}
            <div class="parameter-detail">
              <div class="parameter-header">
                <code class="parameter-name">{pName}</code>
                <code class="parameter-type">{param.type}</code>
                {#if param.optional}
                  <span class="optional-badge">optional</span>
                {/if}
                <div class="parameter-actions">
                  <button
                    class="btn-icon btn-small"
                    title="Edit Parameter"
                    aria-label="Edit parameter {pName}"
                    onclick={() => openParameterModal(pName)}
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
                    class="btn-icon btn-small btn-danger"
                    title="Delete Parameter"
                    aria-label="Delete parameter {pName}"
                    onclick={() => deleteParameter(pName)}
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
                        d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
                      ></path>
                    </svg>
                  </button>
                </div>
              </div>

              {#if param.description}
                <div class="parameter-description">
                  {param.description}
                </div>
              {/if}

              {#if param.default !== undefined}
                <div class="parameter-default">
                  <strong>Default:</strong>
                  <code>{JSON.stringify(param.default)}</code>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>This function takes no parameters.</p>
          <button class="btn-secondary" onclick={() => openParameterModal()}>
            Add First Parameter
          </button>
        </div>
      {/if}
    </section>

    <!-- Usage Statistics -->
    <section class="details-section">
      <div class="section-header">
        <h4>Usage Statistics</h4>
        {#if isLoadingStats}
          <span class="loading-text">Loading...</span>
        {:else}
          <button
            class="btn-icon"
            title="Refresh Stats"
            aria-label="Refresh Stats"
            onclick={loadFunctionStats}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
          </button>
        {/if}
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{func.metadata.usageCount}</div>
          <div class="stat-label">Total Calls</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">
            {func.metadata.lastUsed ? formatDate(func.metadata.lastUsed) : 'Never'}
          </div>
          <div class="stat-label">Last Used</div>
        </div>

        {#if functionStats?.functionStats}
          <div class="stat-card">
            <div class="stat-value">{functionStats.averageUsage.toFixed(1)}</div>
            <div class="stat-label">Average Usage</div>
          </div>
        {/if}
      </div>
    </section>

    <!-- Code Analysis -->
    <section class="details-section">
      <h4>Code Analysis</h4>

      <div class="analysis-grid">
        <div class="analysis-item">
          <strong>Lines of Code:</strong>
          <span>{getCodeLineCount()}</span>
        </div>

        <div class="analysis-item">
          <strong>Characters:</strong>
          <span>{getCodeCharacterCount().toLocaleString()}</span>
        </div>

        <div class="analysis-item">
          <strong>Parameter Count:</strong>
          <span
            >{getParameterCount()} ({getRequiredParameterCount()} required, {getOptionalParameterCount()}
            optional)</span
          >
        </div>

        <div class="analysis-item">
          <strong>Async Function:</strong>
          <span class="boolean-value" class:true={isAsyncFunction()}>
            {isAsyncFunction() ? 'Yes' : 'No'}
          </span>
        </div>

        <div class="analysis-item">
          <strong>Has Defaults:</strong>
          <span class="boolean-value" class:true={hasDefaultParameters()}>
            {hasDefaultParameters() ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
    </section>

    <!-- Source Code -->
    <section class="details-section code-section">
      <div class="section-header">
        <h4>Source Code</h4>
        <button
          class="btn-icon"
          title="Copy Code"
          aria-label="Copy Code"
          onclick={copyFunctionCode}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>

      <div class="code-display">
        <CodeEditor
          value={code}
          language="typescript"
          height="400px"
          placeholder="Enter your TypeScript function implementation..."
          onUpdate={(newValue) => {
            code = newValue;
          }}
        />
      </div>
    </section>

    <!-- Actions -->
    <section class="details-section">
      <h4>Actions</h4>

      <div class="action-buttons">
        <button class="btn-secondary" onclick={exportFunction}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17,8 12,3 7,8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Export Function
        </button>

        <button
          class="btn-secondary"
          onclick={() => customFunctionsStore.loadFunctions()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
            <path d="M3 21v-5h5"></path>
          </svg>
          Refresh Data
        </button>
      </div>
    </section>
  </div>
</div>

<!-- Parameter Modal -->
{#if showParameterModal}
  <div
    class="modal-overlay"
    role="dialog"
    tabindex="-1"
    onclick={closeParameterModal}
    onkeydown={(e) => e.key === 'Escape' && closeParameterModal()}
  >
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="modal-header">
        <h3>{editingParameterKey ? 'Edit Parameter' : 'Add Parameter'}</h3>
        <button class="btn-icon" aria-label="Close modal" onclick={closeParameterModal}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="param-key">Parameter Name</label>
          <input
            id="param-key"
            type="text"
            bind:value={parameterKey}
            placeholder="parameterName"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label for="param-type">Type</label>
          <select id="param-type" bind:value={parameterType} class="form-select">
            {#each COMMON_TYPES as type (type)}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="param-description">Description (optional)</label>
          <textarea
            id="param-description"
            bind:value={parameterDescription}
            placeholder="Describe this parameter..."
            class="form-textarea"
            rows="3"
          ></textarea>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={parameterOptional} />
            Optional parameter
          </label>
        </div>

        {#if parameterOptional}
          <div class="form-group">
            <label for="param-default">Default Value (JSON format)</label>
            <input
              id="param-default"
              type="text"
              bind:value={parameterDefault}
              placeholder="default value"
              class="form-input"
            />
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={closeParameterModal}>Cancel</button>
        <button
          class="btn-primary"
          onclick={saveParameter}
          disabled={!parameterKey.trim()}
        >
          {editingParameterKey ? 'Update' : 'Add'} Parameter
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .function-details {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .function-title {
    flex: 1;
  }

  .title-input-group {
    margin-bottom: 0.5rem;
  }

  .title-input-group label {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .title-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .title-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .function-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .unsaved-indicator {
    color: var(--accent);
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .details-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
  }

  .details-section {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .details-section:last-child {
    margin-bottom: 0;
    border-bottom: none;
  }

  .details-section h4 {
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

  .section-header h4 {
    margin: 0;
  }

  .loading-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Info Grid */
  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item strong {
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .info-item span {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  /* Removed unused .return-type class */

  .tags-display {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    padding: 0.125rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  /* Function Signature */
  .signature-display {
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
  }

  .function-signature {
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.875rem;
    color: var(--text-primary);
    word-break: break-all;
  }

  /* Parameters */
  .parameters-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .parameter-detail {
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
  }

  .parameter-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .parameter-name {
    font-weight: 600;
    color: var(--accent);
    font-size: 0.875rem;
  }

  .parameter-type {
    background: var(--bg-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
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
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .parameter-default {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .parameter-default code {
    background: var(--bg-primary);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    margin-left: 0.5rem;
  }

  /* Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    text-align: center;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  /* Analysis */
  .analysis-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .analysis-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
  }

  .analysis-item strong {
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .analysis-item span {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .boolean-value {
    padding: 0.25rem 0.75rem;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
  }

  .boolean-value.true {
    background: #22c55e;
    color: white;
    border-color: #22c55e;
  }

  /* Source Code */
  .code-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Removed old code-display styles - now handled by CodeEditor component */

  /* Removed unused .source-code class */

  /* Actions */
  .action-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Buttons */
  .btn-primary,
  .btn-secondary,
  .btn-icon {
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

  .btn-icon {
    padding: 0.375rem;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-secondary,
  .btn-icon {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, white);
  }

  .btn-secondary:hover,
  .btn-icon:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Form Elements */
  .description-input,
  .return-type-select,
  .tag-input,
  .form-input,
  .form-select,
  .form-textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  .description-input:focus,
  .return-type-select:focus,
  .tag-input:focus,
  .form-input:focus,
  .form-select:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .description-input {
    resize: vertical;
    font-family: inherit;
    min-height: 4rem;
  }

  /* Tags Editor */
  .tags-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tag-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .tag-input {
    flex: 1;
  }

  .tag {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    padding-right: 1.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .tag-remove {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.25rem;
    height: 1.25rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 50%;
    font-size: 1rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s ease;
  }

  .tag-remove:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  /* Code Display */
  .code-display {
    flex: 1;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  /* Parameter Actions */
  .parameter-actions {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .btn-danger {
    color: #ef4444;
    border-color: #ef4444;
  }

  .btn-danger:hover {
    background: #ef4444;
    color: white;
  }

  /* Validation Results */
  .validation-results {
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }

  .validation-results.valid {
    background: color-mix(in srgb, #22c55e 10%, transparent);
    border-color: #22c55e;
    color: #22c55e;
  }

  .validation-results.invalid {
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border-color: #ef4444;
    color: #ef4444;
  }

  .validation-success,
  .validation-errors {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .error-list {
    flex: 1;
  }

  .error-item {
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  /* Spinner Animation */
  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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

  .modal-content {
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    width: 90vw;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }

  .modal-body {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .modal-footer {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid var(--border-light);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: auto;
    margin: 0;
  }
</style>
