<script lang="ts">
  import { onMount } from 'svelte';
  import { vaultService, type VaultInfo } from '../services/vaultService';
  import { mcpClient } from '../services/mcpClient';

  let currentVault = $state('Not loaded');
  let availableVaults = $state<VaultInfo[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let testResults = $state<string[]>([]);

  onMount(async () => {
    await loadVaultInfo();
  });

  async function loadVaultInfo() {
    try {
      isLoading = true;
      error = null;

      addTestResult('🔄 Initializing vault service...');
      await vaultService.initialize();

      currentVault = vaultService.getCurrentVault() || 'No vault';
      addTestResult(`✅ Current vault: ${currentVault}`);

      availableVaults = vaultService.getAvailableVaults();
      addTestResult(`📋 Available vaults: ${availableVaults.length}`);

      // Log detailed vault information
      availableVaults.forEach((vault) => {
        addTestResult(`📁 Vault: ${vault.name} (ID: ${vault.id})`);
        if (vault.description) {
          addTestResult(`   Description: ${vault.description}`);
        }
        if (vault.path) {
          addTestResult(`   Path: ${vault.path}`);
        }
        addTestResult(`   Active: ${vault.isActive ? 'Yes' : 'No'}`);
      });

      // Try to list more vaults
      const vaults = await vaultService.listVaults();
      availableVaults = vaults;
      addTestResult(`📋 Listed vaults: ${vaults.length}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      addTestResult(`❌ Error: ${error}`);
    } finally {
      isLoading = false;
    }
  }

  async function testDirectToolCall() {
    try {
      addTestResult('🔧 Testing direct tool call...');

      const response = await mcpClient.callTool({
        name: 'get_current_vault',
        arguments: {}
      });

      if (response.success) {
        addTestResult('✅ Direct tool call successful');
        addTestResult(`📋 Response: ${JSON.stringify(response.result, null, 2)}`);
      } else {
        addTestResult(`❌ Direct tool call failed: ${response.error}`);
      }
    } catch (err) {
      addTestResult(
        `❌ Direct tool call error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  async function testSwitchVault(vaultName: string) {
    try {
      addTestResult(`🔄 Testing vault switch to: ${vaultName}`);

      await vaultService.switchVault(vaultName);
      currentVault = vaultService.getCurrentVault() || 'No vault';
      availableVaults = vaultService.getAvailableVaults();

      addTestResult(`✅ Switched to vault: ${currentVault}`);
    } catch (err) {
      addTestResult(
        `❌ Vault switch failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  function addTestResult(message: string) {
    testResults = [...testResults, `${new Date().toLocaleTimeString()}: ${message}`];
  }

  function clearResults() {
    testResults = [];
  }
</script>

<div class="vault-demo">
  <h2>Vault Service Demo</h2>

  <div class="status-section">
    <h3>Current Status</h3>
    <p><strong>Current Vault:</strong> {currentVault}</p>
    <p><strong>Loading:</strong> {isLoading ? 'Yes' : 'No'}</p>
    {#if error}
      <p class="error"><strong>Error:</strong> {error}</p>
    {/if}
  </div>

  <div class="vaults-section">
    <h3>Available Vaults</h3>
    {#if availableVaults.length > 0}
      <ul class="vault-list">
        {#each availableVaults as vault}
          <li class="vault-item" class:active={vault.isActive}>
            <div class="vault-main-info">
              <span class="vault-icon">📁</span>
              <div class="vault-details">
                <span class="vault-name">{vault.name}</span>
                <span class="vault-id">ID: {vault.id}</span>
                {#if vault.description}
                  <span class="vault-description">{vault.description}</span>
                {/if}
                {#if vault.path}
                  <span class="vault-path">Path: {vault.path}</span>
                {/if}
                {#if vault.created}
                  <span class="vault-created">Created: {vault.created}</span>
                {/if}
                {#if vault.lastAccessed}
                  <span class="vault-accessed">Last accessed: {vault.lastAccessed}</span>
                {/if}
              </div>
            </div>
            {#if vault.isActive}
              <span class="active-badge">Active</span>
            {:else}
              <button
                class="switch-btn"
                onclick={() => testSwitchVault(vault.name)}
                disabled={isLoading}
              >
                Switch
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="no-vaults">No vaults available</p>
    {/if}
  </div>

  <div class="actions-section">
    <h3>Test Actions</h3>
    <div class="actions">
      <button class="action-btn" onclick={loadVaultInfo} disabled={isLoading}>
        Reload Vault Info
      </button>
      <button class="action-btn" onclick={testDirectToolCall} disabled={isLoading}>
        Test Direct Tool Call
      </button>
      <button class="action-btn secondary" onclick={clearResults}> Clear Results </button>
    </div>
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
  .vault-demo {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  }

  .vault-demo h2 {
    color: #007bff;
    margin-bottom: 2rem;
  }

  .vault-demo h3 {
    color: #495057;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .status-section,
  .vaults-section,
  .actions-section,
  .results-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    background-color: #f8f9fa;
  }

  .error {
    color: #dc3545;
    font-weight: 500;
  }

  .vault-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .vault-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1rem;
    margin-bottom: 0.5rem;
    background-color: white;
    border: 1px solid #dee2e6;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .vault-item.active {
    background-color: #e3f2fd;
    border-color: #007bff;
  }

  .vault-main-info {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    flex-grow: 1;
  }

  .vault-icon {
    font-size: 1.2rem;
    margin-top: 0.1rem;
  }

  .vault-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vault-name {
    font-weight: 500;
    font-size: 1rem;
  }

  .vault-id {
    color: #007bff;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .vault-description {
    color: #495057;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .vault-path {
    color: #6c757d;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .vault-created,
  .vault-accessed {
    color: #6c757d;
    font-size: 0.8rem;
  }

  .active-badge {
    background-color: #007bff;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .switch-btn {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }

  .switch-btn:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .switch-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  .no-vaults {
    color: #6c757d;
    font-style: italic;
  }

  .actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .action-btn {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .action-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  .action-btn.secondary {
    background-color: #6c757d;
  }

  .action-btn.secondary:hover:not(:disabled) {
    background-color: #5a6268;
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
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .no-results {
    color: #6c757d;
    font-style: italic;
    padding: 1rem;
    text-align: center;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .vault-demo {
      color: #f8f9fa;
    }

    .vault-demo h3 {
      color: #dee2e6;
    }

    .status-section,
    .vaults-section,
    .actions-section,
    .results-section {
      background-color: #343a40;
      border-color: #495057;
    }

    .vault-item {
      background-color: #495057;
      border-color: #6c757d;
      color: #f8f9fa;
    }

    .vault-item.active {
      background-color: #1a365d;
      border-color: #66b2ff;
    }

    .vault-description {
      color: #dee2e6;
    }

    .vault-path,
    .vault-created,
    .vault-accessed {
      color: #adb5bd;
    }

    .vault-id {
      color: #66b2ff;
    }

    .results-container {
      background-color: #495057;
      border-color: #6c757d;
    }

    .result-item {
      border-color: #6c757d;
      color: #f8f9fa;
    }
  }
</style>
