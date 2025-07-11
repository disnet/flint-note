<script lang="ts">
  import { onMount } from 'svelte';
  import { mcpClient } from '../services/mcpClient';

  let tools = $state<any[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let testResults = $state<string[]>([]);

  onMount(async () => {
    await loadTools();
  });

  async function loadTools() {
    try {
      isLoading = true;
      error = null;

      addTestResult('🔍 Fetching available tools...');
      const response = await mcpClient.getTools();

      if (response.success) {
        tools = response.tools || [];
        addTestResult(`✅ Found ${tools.length} tools`);
        tools.forEach((tool) => {
          addTestResult(
            `📋 Tool: ${tool.name} - ${tool.description || 'No description'}`
          );
        });
      } else {
        throw new Error(response.error || 'Failed to get tools');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      addTestResult(`❌ Error: ${error}`);
    } finally {
      isLoading = false;
    }
  }

  async function testTool(toolName: string) {
    try {
      addTestResult(`🔧 Testing tool: ${toolName}`);

      const response = await mcpClient.callTool({
        name: toolName,
        arguments: {}
      });

      if (response.success) {
        addTestResult(`✅ Tool ${toolName} executed successfully`);
        addTestResult(`📋 Response: ${JSON.stringify(response.result, null, 2)}`);
      } else {
        addTestResult(`❌ Tool ${toolName} failed: ${response.error}`);
      }
    } catch (err) {
      addTestResult(
        `❌ Tool ${toolName} error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  async function testVaultTools() {
    const vaultTools = [
      'list_vaults',
      'get_current_vault',
      'switch_vault',
      'create_vault'
    ];

    addTestResult('🔍 Testing common vault tools...');

    for (const toolName of vaultTools) {
      try {
        addTestResult(`🔧 Testing vault tool: ${toolName}`);

        const response = await mcpClient.callTool({
          name: toolName,
          arguments: {}
        });

        if (response.success) {
          addTestResult(`✅ Vault tool ${toolName} executed successfully`);
          addTestResult(`📋 Response: ${JSON.stringify(response.result, null, 2)}`);
        } else {
          addTestResult(`❌ Vault tool ${toolName} failed: ${response.error}`);
        }
      } catch (err) {
        addTestResult(
          `❌ Vault tool ${toolName} error: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }
  }

  function addTestResult(message: string) {
    testResults = [...testResults, `${new Date().toLocaleTimeString()}: ${message}`];
  }

  function clearResults() {
    testResults = [];
  }
</script>

<div class="tool-inspector">
  <h2>MCP Tool Inspector</h2>

  <div class="controls">
    <button class="btn" onclick={loadTools} disabled={isLoading}>
      {isLoading ? 'Loading...' : 'Refresh Tools'}
    </button>
    <button class="btn" onclick={testVaultTools} disabled={isLoading}>
      Test Vault Tools
    </button>
    <button class="btn secondary" onclick={clearResults}> Clear Results </button>
  </div>

  {#if error}
    <div class="error">
      <strong>Error:</strong>
      {error}
    </div>
  {/if}

  <div class="tools-section">
    <h3>Available Tools ({tools.length})</h3>
    {#if tools.length > 0}
      <div class="tools-grid">
        {#each tools as tool}
          <div class="tool-card">
            <div class="tool-header">
              <h4>{tool.name}</h4>
              <button
                class="test-btn"
                onclick={() => testTool(tool.name)}
                disabled={isLoading}
              >
                Test
              </button>
            </div>
            <p class="tool-description">
              {tool.description || 'No description available'}
            </p>
            {#if tool.inputSchema}
              <details class="schema-details">
                <summary>Input Schema</summary>
                <pre class="schema-code">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
              </details>
            {/if}
          </div>
        {/each}
      </div>
    {:else if !isLoading}
      <p class="no-tools">No tools available</p>
    {/if}
  </div>

  <div class="results-section">
    <h3>Test Results</h3>
    <div class="results-container">
      {#if testResults.length > 0}
        <div class="results">
          {#each testResults as result}
            <div class="result-item">{result}</div>
          {/each}
        </div>
      {:else}
        <p class="no-results">No test results yet</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .tool-inspector {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  }

  .tool-inspector h2 {
    color: #007bff;
    margin-bottom: 2rem;
  }

  .tool-inspector h3 {
    color: #495057;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .controls {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .btn {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }

  .btn:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  .btn.secondary {
    background-color: #6c757d;
  }

  .btn.secondary:hover:not(:disabled) {
    background-color: #5a6268;
  }

  .error {
    background-color: #f8d7da;
    color: #721c24;
    padding: 1rem;
    border-radius: 0.375rem;
    margin-bottom: 2rem;
    border: 1px solid #f5c6cb;
  }

  .tools-section {
    margin-bottom: 2rem;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1rem;
  }

  .tool-card {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .tool-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .tool-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .tool-header h4 {
    margin: 0;
    color: #495057;
    font-size: 1.1rem;
  }

  .test-btn {
    background-color: #28a745;
    color: white;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background-color 0.2s;
  }

  .test-btn:hover:not(:disabled) {
    background-color: #218838;
  }

  .test-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  .tool-description {
    color: #6c757d;
    margin-bottom: 1rem;
    line-height: 1.4;
  }

  .schema-details {
    margin-top: 1rem;
  }

  .schema-details summary {
    cursor: pointer;
    color: #007bff;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .schema-details summary:hover {
    color: #0056b3;
  }

  .schema-code {
    background-color: #f1f3f4;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    padding: 0.75rem;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
    overflow-x: auto;
    margin-top: 0.5rem;
  }

  .no-tools {
    color: #6c757d;
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }

  .results-section {
    margin-top: 2rem;
  }

  .results-container {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #dee2e6;
    border-radius: 0.375rem;
    background-color: white;
  }

  .results {
    padding: 1rem;
  }

  .result-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid #f8f9fa;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .no-results {
    color: #6c757d;
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .tool-inspector {
      color: #f8f9fa;
    }

    .tool-inspector h3 {
      color: #dee2e6;
    }

    .tool-card {
      background-color: #343a40;
      border-color: #495057;
    }

    .tool-header h4 {
      color: #f8f9fa;
    }

    .tool-description {
      color: #adb5bd;
    }

    .schema-code {
      background-color: #495057;
      border-color: #6c757d;
      color: #f8f9fa;
    }

    .results-container {
      background-color: #495057;
      border-color: #6c757d;
    }

    .result-item {
      border-color: #6c757d;
      color: #f8f9fa;
    }

    .error {
      background-color: #721c24;
      color: #f8d7da;
      border-color: #f5c6cb;
    }
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .tool-inspector {
      padding: 1rem;
    }

    .tools-grid {
      grid-template-columns: 1fr;
    }

    .tool-card {
      padding: 1rem;
    }

    .controls {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>
