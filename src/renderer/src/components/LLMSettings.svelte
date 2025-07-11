<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { llmClient } from '../services/llmClient';
  import { mcpClient } from '../services/mcpClient';
  import type { LLMConfig } from '../../../shared/types';
  import type { MCPTool } from '../types/chat';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen = false, onClose }: Props = $props();

  let config: LLMConfig = $state({
    baseURL: 'http://localhost:1234/v1',
    apiKey: 'lm-studio',
    modelName: 'local-model',
    temperature: 0.7,
    maxTokens: 2048
  });

  let llmStatus = $state<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'disconnected'
  );
  let isTestingConnection = $state(false);
  let isSaving = $state(false);
  let testResult = $state('');

  // MCP settings
  let mcpEnabled = $state(false);
  let mcpTools: MCPTool[] = $state([]);
  let isLoadingMCPTools = $state(false);
  let mcpError = $state('');

  // MCP connection status
  let mcpConnectionStatus = $state<{
    connected: boolean;
    toolCount: number;
    error?: string;
  }>({ connected: false, toolCount: 0 });
  let isTestingMCPConnection = $state(false);

  // Store unsubscribe functions for cleanup
  let unsubscribeFunctions: (() => void)[] = [];

  // Computed properties
  const isConnected = $derived(llmStatus === 'connected');
  const isLoading = $derived(llmStatus === 'connecting' || isTestingConnection);

  const testConnection = async (): Promise<void> => {
    if (isTestingConnection) return;

    isTestingConnection = true;
    testResult = '';

    try {
      // Update config first
      await llmClient.updateConfig($state.snapshot(config));

      // Test connection (this will trigger events)
      await llmClient.testConnection();
    } catch (error) {
      console.error('Error testing connection:', error);
      testResult = `Connection error: ${error.message}`;
    } finally {
      isTestingConnection = false;
    }
  };

  const saveConfig = async (e: Event): Promise<void> => {
    e.preventDefault();
    isSaving = true;

    try {
      await llmClient.updateConfig(config);
      // Success message will be handled by event listener
    } catch (error) {
      testResult = `Error saving settings: ${error.message}`;
    } finally {
      isSaving = false;
    }
  };

  const resetToDefaults = (): void => {
    config = {
      baseURL: 'http://localhost:1234/v1',
      apiKey: 'lm-studio',
      modelName: 'local-model',
      temperature: 0.7,
      maxTokens: 2048
    };
    testResult = '';
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleOverlayClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const toggleMCP = async (): Promise<void> => {
    try {
      mcpError = '';
      await mcpClient.setEnabled(mcpEnabled);

      if (mcpEnabled) {
        await loadMCPTools();
      } else {
        mcpTools = [];
      }
    } catch (error) {
      console.error('Error toggling MCP:', error);
      mcpError = `Error toggling MCP: ${error.message}`;
      mcpEnabled = !mcpEnabled; // Revert the toggle
    }
  };

  const loadMCPTools = async (): Promise<void> => {
    isLoadingMCPTools = true;
    mcpError = '';

    try {
      mcpTools = await mcpClient.getTools();
    } catch (error) {
      console.error('Error loading MCP tools:', error);
      mcpError = `Error loading MCP tools: ${error.message}`;
      mcpTools = [];
    } finally {
      isLoadingMCPTools = false;
    }
  };

  const loadMCPConnectionStatus = async (): Promise<void> => {
    mcpError = '';

    try {
      const response = await mcpClient.getStatus();
      mcpConnectionStatus = response.status;
    } catch (error) {
      console.error('Error loading MCP connection status:', error);
      mcpError = `Error loading MCP connection status: ${error.message}`;
      mcpConnectionStatus = { connected: false, toolCount: 0 };
    }
  };

  const reconnectMCP = async (): Promise<void> => {
    mcpError = '';

    try {
      await mcpClient.reconnect();
      await loadMCPConnectionStatus();
      if (mcpEnabled) {
        await loadMCPTools();
      }
    } catch (error) {
      console.error('Error reconnecting MCP:', error);
      mcpError = `Error reconnecting MCP: ${error.message}`;
    }
  };

  const testMCPConnection = async (): Promise<void> => {
    isTestingMCPConnection = true;
    mcpError = '';

    try {
      const result = await mcpClient.testConnection();
      if (result.result.success) {
        mcpError = '';
        await loadMCPConnectionStatus();
      } else {
        mcpError = `Connection test failed: ${result.result.error}`;
      }
    } catch (error) {
      console.error('Error testing MCP connection:', error);
      mcpError = `Error testing MCP connection: ${error.message}`;
    } finally {
      isTestingMCPConnection = false;
    }
  };

  onMount(async () => {
    // Subscribe to LLM client events
    const unsubscribeReady = llmClient.on('ready', () => {
      console.log('✅ LLM client ready');
      llmStatus = 'connected';
      testResult = 'Connection successful!';
    });

    const unsubscribeError = llmClient.on('error', (error) => {
      console.error('❌ LLM client error:', error);
      llmStatus = 'error';
      testResult = `Connection error: ${error.message}`;
    });

    const unsubscribeStatusChanged = llmClient.on('statusChanged', (status) => {
      console.log('🔄 LLM client status changed:', status);
      llmStatus = status;

      if (status === 'connecting') {
        testResult = 'Testing connection...';
      } else if (status === 'disconnected') {
        testResult = 'Connection failed. Please check your LM Studio server.';
      }
    });

    const unsubscribeConnectionTest = llmClient.on('connectionTest', (connected) => {
      console.log(`🔍 LLM connection test: ${connected ? 'connected' : 'disconnected'}`);
      if (connected) {
        testResult = 'Connection successful!';
      } else {
        testResult = 'Connection failed. Please check your LM Studio server.';
      }
    });

    const unsubscribeConfigUpdated = llmClient.on('configUpdated', (newConfig) => {
      console.log('🔧 LLM config updated:', newConfig);
      config = newConfig;
      testResult = 'Settings saved successfully!';
    });

    // Store unsubscribe functions for cleanup
    unsubscribeFunctions = [
      unsubscribeReady,
      unsubscribeError,
      unsubscribeStatusChanged,
      unsubscribeConnectionTest,
      unsubscribeConfigUpdated
    ];

    // Load current config
    try {
      config = await llmClient.getConfig();

      // Check if already connected
      if (llmClient.isReady()) {
        llmStatus = 'connected';
        testResult = 'Connection successful!';
      } else {
        // Initialize LLM client
        await llmClient.initialize();
      }
    } catch (error) {
      console.error('Error loading LLM config:', error);
      testResult = `Error loading config: ${error.message}`;
    }

    // Load MCP status and tools
    try {
      mcpEnabled = await mcpClient.isEnabled();
      await loadMCPConnectionStatus();
      if (mcpEnabled) {
        await loadMCPTools();
      }
    } catch (error) {
      console.error('Error loading MCP status:', error);
      mcpError = 'Error loading MCP status';
    }
  });

  onDestroy(() => {
    // Clean up event subscriptions
    unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  });
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-content" role="document">
      <div class="modal-header">
        <h2>LLM Settings</h2>
        <button class="close-button" onclick={onClose} aria-label="Close settings">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="connection-status">
          <div
            class="status-indicator"
            class:connected={isConnected}
            class:disconnected={!isConnected}
            class:connecting={llmStatus === 'connecting'}
            class:error={llmStatus === 'error'}
          >
            <div class="status-dot"></div>
            <span class={llmStatus}>
              {llmStatus === 'connected'
                ? 'Connected'
                : llmStatus === 'connecting'
                  ? 'Connecting...'
                  : llmStatus === 'error'
                    ? 'Error'
                    : 'Disconnected'}
            </span>
          </div>
          {#if testResult}
            <div
              class="test-result"
              class:success={isConnected}
              class:error={!isConnected}
            >
              {testResult}
            </div>
          {/if}
        </div>

        <form class="settings-form" onsubmit={saveConfig}>
          <div class="form-group">
            <label for="baseURL">Base URL:</label>
            <input
              id="baseURL"
              type="url"
              bind:value={config.baseURL}
              placeholder="http://localhost:1234/v1"
              required
            />
            <small>The URL where your LM Studio server is running</small>
          </div>

          <div class="form-group">
            <label for="apiKey">API Key:</label>
            <input
              id="apiKey"
              type="text"
              bind:value={config.apiKey}
              placeholder="lm-studio"
              required
            />
            <small>API key for authentication (usually "lm-studio" for local)</small>
          </div>

          <div class="form-group">
            <label for="modelName">Model Name:</label>
            <input
              id="modelName"
              type="text"
              bind:value={config.modelName}
              placeholder="local-model"
              required
            />
            <small>Name of the model to use</small>
          </div>

          <div class="form-group">
            <label for="temperature">Temperature:</label>
            <input
              id="temperature"
              type="number"
              bind:value={config.temperature}
              min="0"
              max="2"
              step="0.1"
              required
            />
            <small>Controls randomness (0.0 = deterministic, 1.0 = creative)</small>
          </div>

          <div class="form-group">
            <label for="maxTokens">Max Tokens:</label>
            <input
              id="maxTokens"
              type="number"
              bind:value={config.maxTokens}
              min="1"
              max="8192"
              required
            />
            <small>Maximum number of tokens in the response</small>
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn-secondary"
              onclick={resetToDefaults}
              disabled={isSaving || isTestingConnection}
            >
              Reset to Defaults
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              onclick={testConnection}
              disabled={isTestingConnection || isSaving}
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              disabled={isSaving || isTestingConnection}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>

        <div class="instructions">
          <h3>Setup Instructions:</h3>
          <ol>
            <li>Install and start <strong>LM Studio</strong></li>
            <li>Load a model in LM Studio</li>
            <li>Start the local server (usually on port 1234)</li>
            <li>Click "Test Connection" to verify setup</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- MCP Tools Section -->
    <div class="section">
      <h3>MCP Tools</h3>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={mcpEnabled} onchange={toggleMCP} />
          Enable MCP Tools
        </label>
        <p class="help-text">
          Model Context Protocol tools provide additional capabilities like weather
          information.
        </p>
      </div>

      {#if mcpError}
        <div class="error-message">
          {mcpError}
        </div>
      {/if}

      {#if mcpEnabled}
        <div class="form-group">
          <label for="available-tools">Available Tools:</label>
          {#if isLoadingMCPTools}
            <div class="loading">Loading tools...</div>
          {:else if mcpTools.length > 0}
            <div class="tools-list" id="available-tools">
              {#each mcpTools as tool (tool.name)}
                <div class="tool-item">
                  <div class="tool-name">{tool.name}</div>
                  <div class="tool-description">{tool.description}</div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="no-tools" id="available-tools">No MCP tools available</div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- MCP Connection Status Section -->
    <div class="section">
      <div class="section-header">
        <h3>Flint Note MCP Connection</h3>
        <button class="btn btn-primary" onclick={reconnectMCP}> Reconnect </button>
      </div>

      <div class="connection-status">
        <div class="status-info">
          <div class="status-item">
            <strong>Status:</strong>
            <span class={mcpConnectionStatus.connected ? 'connected' : 'disconnected'}>
              {mcpConnectionStatus.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div class="status-item">
            <strong>Tools Available:</strong>
            <span>{mcpConnectionStatus.toolCount}</span>
          </div>
          {#if mcpConnectionStatus.error}
            <div class="status-item error">
              <strong>Error:</strong>
              <span>{mcpConnectionStatus.error}</span>
            </div>
          {/if}
        </div>

        <div class="connection-actions">
          <button
            class="btn btn-secondary"
            onclick={testMCPConnection}
            disabled={isTestingMCPConnection}
          >
            {isTestingMCPConnection ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {#if mcpError}
        <div class="error-message">
          {mcpError}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .close-button {
    background: none;
    border: none;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
  }

  .close-button:hover {
    background-color: #f3f4f6;
    color: #374151;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .connection-status {
    margin-bottom: 1.5rem;
    padding: 1rem;
    border-radius: 6px;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #dc2626;
  }

  .connected .status-dot {
    background-color: #16a34a;
  }

  .connecting .status-dot {
    background-color: #f59e0b;
    animation: pulse 1s infinite;
  }

  .error .status-dot {
    background-color: #dc2626;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .test-result {
    font-size: 0.875rem;
    padding: 0.5rem;
    border-radius: 4px;
    margin-top: 0.5rem;
  }

  .test-result.success {
    background-color: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
  }

  .test-result.error {
    background-color: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 500;
    color: #374151;
  }

  .form-group input {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .form-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .form-group small {
    color: #6b7280;
    font-size: 0.75rem;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn {
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #2563eb;
  }

  .btn-secondary {
    background-color: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: #e5e7eb;
  }

  .instructions {
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: #f0f9ff;
    border-radius: 6px;
    border: 1px solid #bae6fd;
  }

  .instructions h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #0369a1;
  }

  .instructions ol {
    margin: 0;
    padding-left: 1.25rem;
    color: #0369a1;
  }

  .instructions li {
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .modal-content {
      background-color: #1f2937;
      color: #f9fafb;
    }

    .modal-header {
      border-color: #374151;
    }

    .close-button {
      color: #9ca3af;
    }

    .close-button:hover {
      background-color: #374151;
      color: #f3f4f6;
    }

    .connection-status {
      background-color: #374151;
      border-color: #4b5563;
    }

    .form-group label {
      color: #f3f4f6;
    }

    .form-group input {
      background-color: #374151;
      border-color: #4b5563;
      color: #f9fafb;
    }

    .form-group input:focus {
      border-color: #3b82f6;
    }

    .form-group small {
      color: #9ca3af;
    }

    .checkbox-label {
      background-color: #374151;
      border-color: #4b5563;
    }

    .help-text {
      color: #9ca3af;
    }

    .error-message {
      background-color: #7f1d1d;
      border-color: #dc2626;
      color: #fca5a5;
    }

    .loading {
      color: #9ca3af;
    }

    .tools-list {
      background-color: #374151;
      border-color: #4b5563;
    }

    .tool-item {
      border-color: #4b5563;
    }

    .tool-name {
      color: #f3f4f6;
    }

    .tool-description {
      color: #9ca3af;
    }

    .no-tools {
      color: #9ca3af;
    }

    .instructions {
      background-color: #1e3a8a;
      border-color: #1d4ed8;
    }

    .instructions h3 {
      color: #93c5fd;
    }

    .instructions ol {
      color: #93c5fd;
    }

    .form-actions {
      border-color: #374151;
    }

    .btn-secondary {
      background-color: #374151;
      color: #f3f4f6;
      border-color: #4b5563;
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: #4b5563;
    }

    .instructions {
      background-color: #1e3a8a;
      border-color: #3b82f6;
    }

    .instructions h3 {
      color: #93c5fd;
    }

    .instructions ol {
      color: #93c5fd;
    }
  }

  /* MCP-specific styles */
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: auto;
    margin: 0;
  }

  .help-text {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .error-message {
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 6px;
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }

  .loading {
    color: #6b7280;
    font-style: italic;
    font-size: 0.875rem;
  }

  .tools-list {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 1rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .tool-item {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 0;
  }

  .tool-item:last-child {
    border-bottom: none;
  }

  .tool-name {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.25rem;
  }

  .tool-description {
    font-size: 0.875rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .no-tools {
    color: #6b7280;
    font-style: italic;
    text-align: center;
    padding: 1rem;
  }

  /* General Section Styles */
  .section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section h3 {
    margin: 0 0 1rem 0;
    color: #374151;
    font-size: 1.25rem;
    font-weight: 600;
  }

  /* MCP Server Management Styles */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .section-header h3 {
    margin: 0;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .section {
      background-color: #374151;
      border-color: #4b5563;
    }

    .section h3 {
      color: #f3f4f6;
    }
  }

  /* Connection Status Styles */
  .connection-status {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .status-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-item strong {
    min-width: 120px;
  }

  .status-item.error {
    color: #ef4444;
  }

  .status-item .connected {
    color: #10b981;
    font-weight: 500;
  }

  .status-item .disconnected {
    color: #ef4444;
    font-weight: 500;
  }

  .status-item .connecting {
    color: #f59e0b;
    font-weight: 500;
  }

  .status-item .error {
    color: #dc2626;
    font-weight: 500;
  }

  .connection-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Dark mode connection status */
  @media (prefers-color-scheme: dark) {
    .status-item {
      color: #d1d5db;
    }

    .status-item strong {
      color: #f3f4f6;
    }

    .status-item.error {
      color: #f87171;
    }

    .status-item .connected {
      color: #34d399;
    }

    .status-item .disconnected {
      color: #f87171;
    }

    .status-item .connecting {
      color: #fbbf24;
    }

    .status-item .error {
      color: #f87171;
    }
  }
</style>
