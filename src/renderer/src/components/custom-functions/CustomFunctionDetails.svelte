<script lang="ts">
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type {
    CustomFunction,
    CustomFunctionStats
  } from '../../stores/customFunctionsStore.svelte';

  interface Props {
    func: CustomFunction;
    onEdit?: () => void;
    onTest?: () => void;
    onClose?: () => void;
  }

  let { func, onEdit, onTest, onClose }: Props = $props();

  let functionStats = $state<CustomFunctionStats | null>(null);
  let isLoadingStats = $state(false);

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
    const paramList = Object.entries(func.parameters)
      .map(([name, param]) => `${name}${param.optional ? '?' : ''}: ${param.type}`)
      .join(', ');

    const signature = `${func.name}(${paramList}): ${func.returnType}`;

    navigator.clipboard
      .writeText(signature)
      .then(() => {
        // Could show toast notification
      })
      .catch(console.error);
  }

  function copyFunctionCode(): void {
    navigator.clipboard
      .writeText(func.code)
      .then(() => {
        // Could show toast notification
      })
      .catch(console.error);
  }
</script>

<div class="function-details">
  <div class="details-header">
    <div class="function-title">
      <h3><code>{func.name}</code></h3>
      <div class="function-meta">
        <span class="creation-info">
          Created by {func.metadata.createdBy} on {formatDate(func.metadata.createdAt)}
        </span>
        {#if func.metadata.updatedAt.getTime() !== func.metadata.createdAt.getTime()}
          <span class="update-info">
            Last updated {formatDate(func.metadata.updatedAt)}
          </span>
        {/if}
      </div>
    </div>

    <div class="header-actions">
      {#if onEdit}
        <button class="btn-secondary" onclick={onEdit}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Edit
        </button>
      {/if}

      {#if onTest}
        <button class="btn-primary" onclick={onTest}>
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
    <!-- Basic Information -->
    <section class="details-section">
      <h4>Basic Information</h4>
      <div class="info-grid">
        <div class="info-item">
          <strong>Description:</strong>
          <span>{func.description || 'No description provided'}</span>
        </div>

        <div class="info-item">
          <strong>Return Type:</strong>
          <code class="return-type">{func.returnType}</code>
        </div>

        <div class="info-item">
          <strong>Version:</strong>
          <span>v{func.metadata.version}</span>
        </div>

        {#if func.tags.length > 0}
          <div class="info-item">
            <strong>Tags:</strong>
            <div class="tags-display">
              {#each func.tags as tag (tag)}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          </div>
        {/if}
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
          {func.name}({Object.entries(func.parameters)
            .map(([name, param]) => `${name}${param.optional ? '?' : ''}: ${param.type}`)
            .join(', ')}): {func.returnType}
        </code>
      </div>
    </section>

    <!-- Parameters -->
    <section class="details-section">
      <h4>Parameters ({getParameterCount()})</h4>

      {#if Object.keys(func.parameters).length > 0}
        <div class="parameters-list">
          {#each Object.entries(func.parameters) as [name, param] (name)}
            <div class="parameter-detail">
              <div class="parameter-header">
                <code class="parameter-name">{name}</code>
                <code class="parameter-type">{param.type}</code>
                {#if param.optional}
                  <span class="optional-badge">optional</span>
                {/if}
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
        <div class="empty-state">This function takes no parameters.</div>
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
        <pre class="source-code">{func.code}</pre>
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

  .function-title h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .function-title h3 code {
    color: var(--accent);
  }

  .function-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
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

  .return-type {
    background: var(--bg-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem !important;
  }

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

  .code-display {
    flex: 1;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .source-code {
    margin: 0;
    padding: 1rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
    max-height: 400px;
  }

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
</style>
