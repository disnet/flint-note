<script lang="ts">
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { secureStorageService } from '../services/secureStorageService';
  import { modelStore } from '../stores/modelStore.svelte';
  import { SUPPORTED_MODELS } from '../config/models';

  let errorMessage = $state('');
  let successMessage = $state('');
  let activeSection = $state('api-keys');

  // Local form state for API keys
  let anthropicKey = $state('');
  let openaiKey = $state('');
  let openaiOrgId = $state('');
  let gatewayKey = $state('');

  // Validation states
  let anthropicKeyValid = $state(false);
  let openaiKeyValid = $state(false);
  let gatewayKeyValid = $state(false);

  // Auto-save debounce timers
  let anthropicSaveTimer;
  let openaiSaveTimer;
  let gatewaySaveTimer;

  // Load API keys on component mount
  $effect(async () => {
    try {
      // Load API keys into the store first
      await settingsStore.loadApiKeys();

      // Then populate the local form state
      const keys = await secureStorageService.getAllApiKeys();
      anthropicKey = keys.anthropic;
      openaiKey = keys.openai;
      openaiOrgId = keys.openaiOrgId;
      gatewayKey = keys.gateway;

      // Update validation
      anthropicKeyValid = secureStorageService.validateApiKey('anthropic', anthropicKey);
      openaiKeyValid = secureStorageService.validateApiKey('openai', openaiKey);
      gatewayKeyValid = secureStorageService.validateApiKey('gateway', gatewayKey);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }

    // Cleanup function
    return () => {
      if (anthropicSaveTimer) {
        clearTimeout(anthropicSaveTimer);
      }
      if (openaiSaveTimer) {
        clearTimeout(openaiSaveTimer);
      }
      if (gatewaySaveTimer) {
        clearTimeout(gatewaySaveTimer);
      }
    };
  });

  const sections = [
    { id: 'api-keys', label: '🔑 API Keys', icon: '🔑' },
    { id: 'model-preferences', label: '🤖 Model Preferences', icon: '🤖' },
    { id: 'appearance', label: '🎨 Appearance', icon: '🎨' },
    { id: 'data-privacy', label: '💾 Data & Privacy', icon: '💾' },
    { id: 'advanced', label: '⚙️ Advanced', icon: '⚙️' }
  ];

  function showError(message: string): void {
    errorMessage = message;
    successMessage = '';
    setTimeout(() => {
      errorMessage = '';
    }, 5000);
  }

  function showSuccess(message: string): void {
    successMessage = message;
    errorMessage = '';
    setTimeout(() => {
      successMessage = '';
    }, 2000); // Shorter duration for auto-save messages
  }

  async function autoSaveApiKey(
    provider: 'anthropic' | 'openai' | 'gateway',
    key: string,
    orgId?: string
  ): Promise<void> {
    // Don't save empty keys
    if (!key || key.trim() === '') {
      return;
    }

    // Validate key format before saving
    if (!secureStorageService.validateApiKey(provider, key)) {
      return;
    }

    try {
      await secureStorageService.storeApiKey(provider, key, orgId);

      // Update settings store
      settingsStore.updateApiKey(provider, key, orgId);

      // Show subtle success indication
      showSuccess(`${provider} API key saved`);
    } catch (error) {
      console.error(`Failed to auto-save ${provider} API key:`, error);
      showError(`Failed to save ${provider} API key`);
    }
  }

  function debounceAnthropicSave(): void {
    if (anthropicSaveTimer) {
      clearTimeout(anthropicSaveTimer);
    }

    anthropicSaveTimer = setTimeout(() => {
      if (anthropicKey && anthropicKeyValid) {
        autoSaveApiKey('anthropic', anthropicKey);
      }
    }, 1000); // 1 second debounce
  }

  function debounceOpenaiSave(): void {
    if (openaiSaveTimer) {
      clearTimeout(openaiSaveTimer);
    }

    openaiSaveTimer = setTimeout(() => {
      if (openaiKey && openaiKeyValid) {
        autoSaveApiKey('openai', openaiKey, openaiOrgId);
      }
    }, 1000); // 1 second debounce
  }

  function debounceGatewaySave(): void {
    if (gatewaySaveTimer) {
      clearTimeout(gatewaySaveTimer);
    }

    gatewaySaveTimer = setTimeout(() => {
      if (gatewayKey && gatewayKeyValid) {
        autoSaveApiKey('gateway', gatewayKey);
      }
    }, 1000); // 1 second debounce
  }

  function handleDefaultModelChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    settingsStore.updateDefaultModel(target.value);
    modelStore.setSelectedModel(target.value);
  }

  function handleThemeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    settingsStore.updateTheme(target.value as 'light' | 'dark' | 'system');
  }

  function handleAutoSaveDelayChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    settingsStore.updateSettings({
      dataAndPrivacy: {
        ...settingsStore.settings.dataAndPrivacy,
        autoSaveDelay: parseInt(target.value)
      }
    });
  }

  async function clearAllApiKeys(): Promise<void> {
    if (
      !confirm(
        'Are you sure you want to clear all API keys? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await secureStorageService.clearAllApiKeys();
      anthropicKey = '';
      openaiKey = '';
      openaiOrgId = '';
      gatewayKey = '';
      anthropicKeyValid = false;
      openaiKeyValid = false;
      gatewayKeyValid = false;

      settingsStore.updateSettings({
        apiKeys: {
          anthropic: '',
          openai: '',
          openaiOrgId: '',
          gateway: ''
        }
      });

      showSuccess('All API keys cleared successfully');
    } catch (error) {
      showError(
        `Failed to clear API keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  function resetToDefaults(): void {
    if (
      !confirm(
        'Are you sure you want to reset all settings to defaults? This will not affect your API keys.'
      )
    ) {
      return;
    }

    settingsStore.resetToDefaults();
    showSuccess('Settings reset to defaults');
  }

  function exportSettings(): void {
    try {
      const settingsJson = settingsStore.exportSettings();
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flint-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Settings exported successfully');
    } catch {
      showError('Failed to export settings');
    }
  }

  function importSettings(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            const success = settingsStore.importSettings(content);
            if (success) {
              showSuccess('Settings imported successfully');
            } else {
              showError('Failed to import settings: Invalid file format');
            }
          } catch {
            showError('Failed to import settings: Invalid file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }
</script>

<div class="settings">
  <div class="settings-sidebar">
    <h2>Settings</h2>
    <nav class="settings-nav">
      {#each sections as section (section.id)}
        <button
          class="nav-item"
          class:active={activeSection === section.id}
          onclick={() => (activeSection = section.id)}
        >
          <span class="nav-icon">{section.icon}</span>
          <span class="nav-label">{section.label.split(' ').slice(1).join(' ')}</span>
        </button>
      {/each}
    </nav>
  </div>

  <div class="settings-content">
    {#if errorMessage}
      <div class="message error">
        {errorMessage}
      </div>
    {/if}

    {#if successMessage}
      <div class="message success">
        {successMessage}
      </div>
    {/if}

    {#if activeSection === 'api-keys'}
      <section class="settings-section">
        <h3>🔑 API Keys</h3>
        <p class="section-description">
          Configure your API keys for different AI providers. Keys are stored securely and
          encrypted on your device.
        </p>

        <div class="api-key-group">
          <label for="anthropic-key-input">
            <strong>Anthropic API Key</strong>
            <span class="validation-indicator" class:valid={anthropicKeyValid}>
              {anthropicKeyValid ? '✓' : '❌'}
            </span>
          </label>
          <div class="input-group">
            <input
              id="anthropic-key-input"
              type="password"
              bind:value={anthropicKey}
              placeholder="sk-ant-..."
              class="api-key-input"
              oninput={() => {
                anthropicKeyValid = secureStorageService.validateApiKey(
                  'anthropic',
                  anthropicKey
                );
                debounceAnthropicSave();
              }}
            />
          </div>
          <small
            >Get your API key from <a
              href="https://console.anthropic.com/"
              target="_blank">console.anthropic.com</a
            ></small
          >
        </div>

        <div class="api-key-group">
          <label for="openai-key-input">
            <strong>OpenAI API Key</strong>
            <span class="validation-indicator" class:valid={openaiKeyValid}>
              {openaiKeyValid ? '✓' : '❌'}
            </span>
          </label>
          <div class="input-group">
            <input
              id="openai-key-input"
              type="password"
              bind:value={openaiKey}
              placeholder="sk-..."
              class="api-key-input"
              oninput={() => {
                openaiKeyValid = secureStorageService.validateApiKey('openai', openaiKey);
                debounceOpenaiSave();
              }}
            />
          </div>
          <div class="input-group">
            <input
              type="text"
              bind:value={openaiOrgId}
              placeholder="Organization ID (optional)"
              class="org-id-input"
              oninput={() => debounceOpenaiSave()}
            />
          </div>
          <small
            >Get your API key from <a
              href="https://platform.openai.com/api-keys"
              target="_blank">platform.openai.com</a
            ></small
          >
        </div>

        <div class="api-key-group">
          <label for="gateway-key-input">
            <strong>AI Gateway API Key</strong>
            <span class="validation-indicator" class:valid={gatewayKeyValid}>
              {gatewayKeyValid ? '✓' : '❌'}
            </span>
          </label>
          <div class="input-group">
            <input
              id="gateway-key-input"
              type="password"
              bind:value={gatewayKey}
              placeholder="Your AI Gateway API key"
              class="api-key-input"
              oninput={() => {
                gatewayKeyValid = secureStorageService.validateApiKey(
                  'gateway',
                  gatewayKey
                );
                debounceGatewaySave();
              }}
            />
          </div>
          <small
            >Configure your AI Gateway to access multiple AI providers through a single
            interface</small
          >
        </div>

        <div class="danger-zone">
          <h4>Danger Zone</h4>
          <button class="btn-danger" onclick={clearAllApiKeys}>
            Clear All API Keys
          </button>
        </div>
      </section>
    {/if}

    {#if activeSection === 'model-preferences'}
      <section class="settings-section">
        <h3>🤖 Model Preferences</h3>
        <p class="section-description">
          Configure your preferred AI models and cost settings.
        </p>

        <div class="form-group">
          <label for="default-model">Default Model</label>
          <select
            id="default-model"
            value={settingsStore.settings.modelPreferences.defaultModel}
            onchange={handleDefaultModelChange}
          >
            {#each SUPPORTED_MODELS as model (model.id)}
              <option value={model.id}>
                {model.name} ({model.provider})
              </option>
            {/each}
          </select>
          <small>This model will be selected by default for new conversations</small>
        </div>

        <div class="form-group">
          <label>
            <input
              type="checkbox"
              checked={settingsStore.settings.modelPreferences.showCosts}
              onchange={(e) =>
                settingsStore.updateSettings({
                  modelPreferences: {
                    ...settingsStore.settings.modelPreferences,
                    showCosts: (e.target as HTMLInputElement).checked
                  }
                })}
            />
            Show cost information
          </label>
          <small>Display estimated costs per request when available</small>
        </div>

        <div class="form-group">
          <label for="cost-warning">Cost warning threshold ($/month)</label>
          <input
            id="cost-warning"
            type="number"
            min="1"
            max="1000"
            value={settingsStore.settings.modelPreferences.costWarningThreshold}
            onchange={(e) =>
              settingsStore.updateSettings({
                modelPreferences: {
                  ...settingsStore.settings.modelPreferences,
                  costWarningThreshold: parseInt((e.target as HTMLInputElement).value)
                }
              })}
          />
          <small>Show warning when monthly costs exceed this amount</small>
        </div>
      </section>
    {/if}

    {#if activeSection === 'appearance'}
      <section class="settings-section">
        <h3>🎨 Appearance</h3>
        <p class="section-description">Customize the look and feel of the application.</p>

        <div class="form-group">
          <label for="theme-group">Theme</label>
          <div class="radio-group" id="theme-group">
            <label class="radio-option">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={settingsStore.settings.appearance.theme === 'light'}
                onchange={handleThemeChange}
              />
              <span class="radio-label">☀️ Light</span>
            </label>
            <label class="radio-option">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={settingsStore.settings.appearance.theme === 'dark'}
                onchange={handleThemeChange}
              />
              <span class="radio-label">🌙 Dark</span>
            </label>
            <label class="radio-option">
              <input
                type="radio"
                name="theme"
                value="system"
                checked={settingsStore.settings.appearance.theme === 'system'}
                onchange={handleThemeChange}
              />
              <span class="radio-label">🖥️ System</span>
            </label>
          </div>
        </div>
      </section>
    {/if}

    {#if activeSection === 'data-privacy'}
      <section class="settings-section">
        <h3>💾 Data & Privacy</h3>
        <p class="section-description">Control how your data is stored and managed.</p>

        <div class="form-group">
          <label for="auto-save-delay">Auto-save delay</label>
          <select
            id="auto-save-delay"
            value={settingsStore.settings.dataAndPrivacy.autoSaveDelay}
            onchange={handleAutoSaveDelayChange}
          >
            <option value={100}>100ms (Fast)</option>
            <option value={300}>300ms</option>
            <option value={500}>500ms (Recommended)</option>
            <option value={1000}>1000ms</option>
            <option value={2000}>2000ms (Slow)</option>
          </select>
          <small>How long to wait before auto-saving note changes</small>
        </div>

        <div class="form-group">
          <label for="chat-history">Chat history retention</label>
          <select
            id="chat-history"
            value={settingsStore.settings.dataAndPrivacy.chatHistoryRetentionDays}
            onchange={(e) =>
              settingsStore.updateSettings({
                dataAndPrivacy: {
                  ...settingsStore.settings.dataAndPrivacy,
                  chatHistoryRetentionDays: parseInt(
                    (e.target as HTMLSelectElement).value
                  )
                }
              })}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
            <option value={-1}>Forever</option>
          </select>
          <small>How long to keep chat history</small>
        </div>
      </section>
    {/if}

    {#if activeSection === 'advanced'}
      <section class="settings-section">
        <h3>⚙️ Advanced</h3>
        <p class="section-description">
          Advanced settings for power users and troubleshooting.
        </p>

        <div class="form-group">
          <label>
            <input
              type="checkbox"
              checked={settingsStore.settings.advanced.debugMode}
              onchange={(e) =>
                settingsStore.updateSettings({
                  advanced: {
                    ...settingsStore.settings.advanced,
                    debugMode: (e.target as HTMLInputElement).checked
                  }
                })}
            />
            Enable debug mode
          </label>
          <small>Show additional logging and diagnostic information</small>
        </div>

        <div class="form-group">
          <label for="proxy-url">Proxy URL</label>
          <input
            id="proxy-url"
            type="text"
            placeholder="http://proxy.example.com:8080"
            value={settingsStore.settings.advanced.proxyUrl || ''}
            oninput={(e) =>
              settingsStore.updateSettings({
                advanced: {
                  ...settingsStore.settings.advanced,
                  proxyUrl: (e.target as HTMLInputElement).value
                }
              })}
          />
          <small>HTTP/HTTPS proxy for API requests (leave empty to disable)</small>
        </div>

        <div class="settings-actions">
          <h4>Settings Management</h4>
          <div class="action-group">
            <button class="btn-secondary" onclick={exportSettings}>
              Export Settings
            </button>
            <button class="btn-secondary" onclick={importSettings}>
              Import Settings
            </button>
            <button class="btn-secondary" onclick={resetToDefaults}>
              Reset to Defaults
            </button>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .settings {
    display: flex;
    height: 100%;
    max-height: 100vh;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .settings-sidebar {
    width: 250px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-light);
    padding: 1.5rem;
  }

  .settings-sidebar h2 {
    margin: 0 0 1.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-radius: 0.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    font-size: 0.875rem;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--accent-primary);
    color: white;
  }

  .nav-icon {
    font-size: 1rem;
  }

  .nav-label {
    font-weight: 500;
  }

  .settings-content {
    flex: 1;
    padding: 2rem;
    padding-bottom: 4rem;
    overflow-y: auto;
    max-height: 100%;
    min-height: 0;
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
  }

  .message.error {
    background: #fee;
    color: #c53030;
    border: 1px solid #fca5a5;
  }

  .message.success {
    background: #f0fff4;
    color: #38a169;
    border: 1px solid #9ae6b4;
  }

  .settings-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .section-description {
    margin: 0 0 2rem 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .api-key-group {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: var(--bg-secondary);
    border-radius: 0.75rem;
    border: 1px solid var(--border-light);
  }

  .api-key-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .validation-indicator {
    font-size: 0.875rem;
  }

  .validation-indicator.valid {
    color: #38a169;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .api-key-input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.875rem;
  }

  .org-id-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .btn-secondary,
  .btn-danger {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn-danger {
    background: #fed7d7;
    color: #c53030;
    border: 1px solid #fca5a5;
  }

  .btn-danger:hover:not(:disabled) {
    background: #fbb6ce;
  }

  .btn-secondary:disabled,
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger-zone {
    margin-top: 2rem;
    padding: 1.5rem;
    background: #fef5e7;
    border: 1px solid #f6ad55;
    border-radius: 0.75rem;
  }

  .danger-zone h4 {
    margin: 0 0 1rem 0;
    color: #c53030;
    font-weight: 600;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-group small {
    display: block;
    margin-top: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .radio-group {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .radio-option input[type='radio'] {
    margin: 0;
    width: auto;
  }

  .radio-label {
    font-weight: 500;
  }

  .settings-actions {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--bg-secondary);
    border-radius: 0.75rem;
    border: 1px solid var(--border-light);
  }

  .settings-actions h4 {
    margin: 0 0 1rem 0;
    font-weight: 600;
    color: var(--text-primary);
  }

  .action-group {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
