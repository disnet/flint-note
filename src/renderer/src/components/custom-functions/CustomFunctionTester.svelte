<script lang="ts">
  import { customFunctionsStore } from '../../stores/customFunctionsStore.svelte';
  import type {
    CustomFunction,
    CustomFunctionExecutionResult
  } from '../../stores/customFunctionsStore.svelte';

  interface Props {
    func: CustomFunction;
    onClose?: () => void;
  }

  let { func, onClose }: Props = $props();

  // Test state
  let parameters = $state<Record<string, unknown>>({});
  let isRunning = $state(false);
  let results = $state<CustomFunctionExecutionResult[]>([]);
  let selectedResult = $state<CustomFunctionExecutionResult | null>(null);

  // Initialize parameters with default values
  $effect(() => {
    const newParams: Record<string, unknown> = {};

    Object.entries(func.parameters).forEach(([key, param]) => {
      if (param.default !== undefined) {
        newParams[key] = param.default;
      } else {
        // Set reasonable defaults based on type
        switch (param.type) {
          case 'string':
            newParams[key] = '';
            break;
          case 'number':
            newParams[key] = 0;
            break;
          case 'boolean':
            newParams[key] = false;
            break;
          case 'Date':
            newParams[key] = new Date().toISOString();
            break;
          default:
            newParams[key] = null;
        }
      }
    });

    parameters = newParams;
  });

  async function runTest(): Promise<void> {
    isRunning = true;

    try {
      const result = await customFunctionsStore.testFunction({
        functionId: func.id,
        parameters: prepareParametersForExecution()
      });

      results = [result, ...results].slice(0, 10); // Keep last 10 results
      selectedResult = result;
    } catch (error) {
      const errorResult: CustomFunctionExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0
      };

      results = [errorResult, ...results].slice(0, 10);
      selectedResult = errorResult;
    } finally {
      isRunning = false;
    }
  }

  function prepareParametersForExecution(): Record<string, unknown> {
    const prepared: Record<string, unknown> = {};

    Object.entries(parameters).forEach(([key, value]) => {
      const paramDef = func.parameters[key];
      if (!paramDef) return;

      // Skip optional parameters that are null/empty
      if (paramDef.optional && (value === null || value === '' || value === undefined)) {
        return;
      }

      // Type conversion based on parameter type
      try {
        switch (paramDef.type) {
          case 'number':
            prepared[key] = value === '' ? 0 : Number(value);
            break;
          case 'boolean':
            prepared[key] = Boolean(value);
            break;
          case 'Date':
            prepared[key] = new Date(value as string | number | Date);
            break;
          case 'object':
          case 'any':
            // Try to parse as JSON if it's a string
            if (typeof value === 'string' && value.trim().startsWith('{')) {
              prepared[key] = JSON.parse(value);
            } else {
              prepared[key] = value;
            }
            break;
          default:
            prepared[key] = value;
        }
      } catch {
        // If conversion fails, use raw value
        prepared[key] = value;
      }
    });

    return prepared;
  }

  function updateParameter(key: string, value: unknown): void {
    parameters[key] = value;
  }

  function getInputType(paramType: string): string {
    switch (paramType) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'checkbox';
      case 'Date':
        return 'datetime-local';
      default:
        return 'text';
    }
  }

  function formatResult(result: unknown): string {
    if (result === null) return 'null';
    if (result === undefined) return 'undefined';
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  }

  function copyResult(result: unknown): void {
    const text = formatResult(result);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // Could show a toast notification here
      })
      .catch(console.error);
  }

  function clearResults(): void {
    results = [];
    selectedResult = null;
  }

  function formatExecutionTime(ms: number): string {
    if (ms < 1) return '< 1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
</script>

<div class="function-tester">
  <div class="tester-header">
    <div class="function-info">
      <h3>Test Function: <code>{func.name}</code></h3>
      <p>{func.description}</p>
      <div class="function-signature">
        <strong>Signature:</strong>
        <code>
          {func.name}({Object.entries(func.parameters)
            .map(([name, param]) => `${name}${param.optional ? '?' : ''}: ${param.type}`)
            .join(', ')}): {func.returnType}
        </code>
      </div>
    </div>

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

  <div class="tester-content">
    <!-- Parameters Input -->
    <div class="parameters-section">
      <div class="section-header">
        <h4>Parameters</h4>
        <button class="btn-primary" onclick={runTest} disabled={isRunning}>
          {#if isRunning}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="spinning"
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
            Running...
          {:else}
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
            Run Test
          {/if}
        </button>
      </div>

      {#if Object.keys(func.parameters).length > 0}
        <div class="parameters-form">
          {#each Object.entries(func.parameters) as [key, param] (key)}
            <div class="parameter-input">
              <label for="param-{key}">
                <span class="param-name">{key}</span>
                <span class="param-type">{param.type}</span>
                {#if param.optional}
                  <span class="optional-badge">optional</span>
                {/if}
              </label>

              {#if param.description}
                <div class="param-description">{param.description}</div>
              {/if}

              {#if param.type === 'boolean'}
                <label class="checkbox-input">
                  <input
                    id="param-{key}"
                    type="checkbox"
                    checked={Boolean(parameters[key])}
                    onchange={(e) =>
                      updateParameter(key, (e.target as HTMLInputElement).checked)}
                  />
                  <span>True</span>
                </label>
              {:else if param.type === 'object' || param.type.includes('[]')}
                <textarea
                  id="param-{key}"
                  bind:value={parameters[key]}
                  oninput={(e) =>
                    updateParameter(key, (e.target as HTMLTextAreaElement).value)}
                  placeholder={param.type === 'object' ? '{}' : '[]'}
                  rows="3"
                ></textarea>
              {:else}
                <input
                  id="param-{key}"
                  type={getInputType(param.type)}
                  bind:value={parameters[key]}
                  oninput={(e) =>
                    updateParameter(key, (e.target as HTMLInputElement).value)}
                  placeholder={param.default !== undefined ? String(param.default) : ''}
                />
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="no-parameters">This function takes no parameters.</div>
      {/if}
    </div>

    <!-- Test Results -->
    <div class="results-section">
      <div class="section-header">
        <h4>Test Results</h4>
        {#if results.length > 0}
          <button class="btn-secondary-small" onclick={clearResults}>
            Clear Results
          </button>
        {/if}
      </div>

      {#if results.length === 0}
        <div class="no-results">
          <div class="no-results-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </div>
          <p>No test results yet. Click "Run Test" to execute the function.</p>
        </div>
      {:else}
        <div class="results-layout">
          <!-- Results List -->
          <div class="results-list">
            {#each results as result, index (index)}
              <div
                class="result-item"
                class:selected={selectedResult === result}
                class:success={result.success}
                class:error={!result.success}
                onclick={() => (selectedResult = result)}
                onkeydown={(e) => e.key === 'Enter' && (selectedResult = result)}
                role="button"
                tabindex="0"
              >
                <div class="result-header">
                  <div class="result-status">
                    {#if result.success}
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
                      Success
                    {:else}
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
                      Error
                    {/if}
                  </div>
                  <div class="result-time">
                    {formatExecutionTime(result.executionTime)}
                  </div>
                </div>

                <div class="result-preview">
                  {#if result.success}
                    <span class="result-type">
                      {typeof result.result}
                      {result.result === null ? '(null)' : ''}
                    </span>
                    <span class="result-value">
                      {formatResult(result.result).slice(0, 50)}{formatResult(
                        result.result
                      ).length > 50
                        ? '...'
                        : ''}
                    </span>
                  {:else}
                    <span class="error-message">{result.error}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <!-- Selected Result Detail -->
          {#if selectedResult}
            <div class="result-detail">
              <div class="detail-header">
                <h5>Result Details</h5>
                <div class="detail-actions">
                  {#if selectedResult.success}
                    <button
                      class="btn-icon"
                      title="Copy Result"
                      aria-label="Copy Result"
                      onclick={() => copyResult(selectedResult?.result)}
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
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                    </button>
                  {/if}
                </div>
              </div>

              <div class="detail-content">
                <div class="detail-meta">
                  <div class="meta-item">
                    <strong>Status:</strong>
                    <span
                      class="status-badge"
                      class:success={selectedResult.success}
                      class:error={!selectedResult.success}
                    >
                      {selectedResult.success ? 'Success' : 'Error'}
                    </span>
                  </div>
                  <div class="meta-item">
                    <strong>Execution Time:</strong>
                    <span>{formatExecutionTime(selectedResult.executionTime)}</span>
                  </div>
                  {#if selectedResult.success && selectedResult.result !== undefined}
                    <div class="meta-item">
                      <strong>Return Type:</strong>
                      <span class="return-type">{typeof selectedResult.result}</span>
                    </div>
                  {/if}
                </div>

                <div class="result-output">
                  <strong>Output:</strong>
                  <div class="output-content">
                    {#if selectedResult.success}
                      <pre class="result-data">{formatResult(selectedResult.result)}</pre>
                    {:else}
                      <pre class="error-data">{selectedResult.error}</pre>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .function-tester {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tester-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .function-info {
    flex: 1;
  }

  .function-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .function-info h3 code {
    color: var(--accent);
  }

  .function-info p {
    margin: 0 0 0.75rem 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .function-signature {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .function-signature code {
    display: block;
    margin-top: 0.25rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .tester-content {
    flex: 1;
    display: flex;
    gap: 1.5rem;
    overflow: hidden;
    padding: 1rem 0;
  }

  .parameters-section,
  .results-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .section-header h4 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  /* Parameters */
  .parameters-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  .parameter-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .parameter-input label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .param-name {
    font-weight: 600;
    color: var(--accent);
  }

  .param-type {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.125rem 0.375rem;
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

  .param-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .parameter-input input,
  .parameter-input textarea {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .parameter-input textarea {
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    resize: vertical;
  }

  .checkbox-input {
    display: flex !important;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .checkbox-input input[type='checkbox'] {
    margin: 0;
    padding: 0;
  }

  .no-parameters {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Results */
  .no-results {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
  }

  .no-results-icon {
    color: var(--text-secondary);
    opacity: 0.5;
    margin-bottom: 1rem;
  }

  .no-results p {
    margin: 0;
    color: var(--text-secondary);
    font-style: italic;
  }

  .results-layout {
    flex: 1;
    display: flex;
    gap: 1rem;
    overflow: hidden;
  }

  .results-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-item {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .result-item:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .result-item.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, var(--bg-secondary));
  }

  .result-item.success {
    border-left: 3px solid #22c55e;
  }

  .result-item.error {
    border-left: 3px solid var(--danger);
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .result-status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .result-item.success .result-status {
    color: #22c55e;
  }

  .result-item.error .result-status {
    color: var(--danger);
  }

  .result-time {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .result-preview {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .result-type {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .result-value {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-message {
    font-size: 0.75rem;
    color: var(--danger);
    word-break: break-word;
  }

  /* Result Detail */
  .result-detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-light);
  }

  .detail-header h5 {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .detail-actions {
    display: flex;
    gap: 0.25rem;
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .detail-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .meta-item strong {
    color: var(--text-primary);
    min-width: 110px;
  }

  .status-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.success {
    background: #22c55e;
    color: white;
  }

  .status-badge.error {
    background: var(--danger);
    color: white;
  }

  .return-type {
    font-family: monospace;
    background: var(--bg-primary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .result-output strong {
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .output-content {
    margin-top: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    overflow: hidden;
  }

  .result-data,
  .error-data {
    margin: 0;
    padding: 0.75rem;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    background: var(--bg-primary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
  }

  .error-data {
    color: var(--danger);
    background: #fee;
  }

  /* Buttons */
  .btn-primary,
  .btn-secondary,
  .btn-secondary-small,
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

  .btn-secondary-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
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
  .btn-secondary-small,
  .btn-icon {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, white);
  }

  .btn-secondary:hover,
  .btn-secondary-small:hover,
  .btn-icon:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinning {
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
</style>
