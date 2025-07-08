<script lang="ts">
  import { onMount } from 'svelte';
  import { llmClient } from '../services/llmClient';
  import type { LLMConfig } from '../services/llmClient';

  export let isOpen = false;
  export let onClose: () => void;

  let config: LLMConfig = {
    baseURL: 'http://localhost:1234/v1',
    apiKey: 'lm-studio',
    modelName: 'local-model',
    temperature: 0.7,
    maxTokens: 2048
  };

  let isConnected = false;
  let isTestingConnection = false;
  let isSaving = false;
  let testResult = '';

  const testConnection = async () => {
    isTestingConnection = true;
    testResult = '';

    try {
      // Update config first
      await llmClient.updateConfig(config);

      // Test connection
      const connected = await llmClient.testConnection();
      isConnected = connected;

      if (connected) {
        testResult = 'Connection successful!';
      } else {
        testResult = 'Connection failed. Please check your LM Studio server.';
      }
    } catch (error) {
      isConnected = false;
      testResult = `Connection error: ${error.message}`;
    } finally {
      isTestingConnection = false;
    }
  };

  const saveConfig = async () => {
    isSaving = true;

    try {
      await llmClient.updateConfig(config);
      testResult = 'Settings saved successfully!';

      // Test connection after saving
      setTimeout(() => {
        testConnection();
      }, 500);
    } catch (error) {
      testResult = `Error saving settings: ${error.message}`;
    } finally {
      isSaving = false;
    }
  };

  const resetToDefaults = () => {
    config = {
      baseURL: 'http://localhost:1234/v1',
      apiKey: 'lm-studio',
      modelName: 'local-model',
      temperature: 0.7,
      maxTokens: 2048
    };
    testResult = '';
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  onMount(async () => {
    // Load current config
    try {
      config = await llmClient.getConfig();
      await testConnection();
    } catch (error) {
      console.error('Error loading LLM config:', error);
    }
  });
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if isOpen}
  <div
    class="modal-overlay"
    on:click={onClose}
    on:keydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-content" on:click|stopPropagation role="document">
      <div class="modal-header">
        <h2>LLM Settings</h2>
        <button class="close-button" on:click={onClose} aria-label="Close settings">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
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
          >
            <div class="status-dot"></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          {#if testResult}
            <div class="test-result" class:success={isConnected} class:error={!isConnected}>
              {testResult}
            </div>
          {/if}
        </div>

        <form class="settings-form" on:submit|preventDefault={saveConfig}>
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
              on:click={resetToDefaults}
              disabled={isSaving || isTestingConnection}
            >
              Reset to Defaults
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              on:click={testConnection}
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
</style>
