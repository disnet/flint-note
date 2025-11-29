<script lang="ts">
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { secureStorageService } from '../services/secureStorageService';
  import ChangelogViewer from './ChangelogViewer.svelte';

  let errorMessage = $state('');
  let successMessage = $state('');

  // Local form state for API keys
  let openrouterKey = $state('');
  let anthropicKey = $state('');

  // Validation states
  let openrouterKeyValid = $state(false);
  let anthropicKeyValid = $state(false);

  // Auto-save debounce timers
  let openrouterSaveTimer;
  let anthropicSaveTimer;

  // App version state
  let appVersion = $state('');
  let checkingForUpdates = $state(false);
  let showChangelog = $state(false);
  let isCanary = $state(false);

  // Database rebuild state
  let rebuildingDatabase = $state(false);

  // Load API keys and app version on component mount
  $effect(() => {
    (async () => {
      try {
        // Load API keys into the store first
        await settingsStore.loadApiKeys();

        // Then populate the local form state
        const keys = await secureStorageService.getAllApiKeys();
        openrouterKey = keys.openrouter || '';
        anthropicKey = keys.anthropic || '';

        // Update validation
        openrouterKeyValid = secureStorageService.validateApiKey(
          'openrouter',
          openrouterKey
        );
        anthropicKeyValid = secureStorageService.validateApiKey(
          'anthropic',
          anthropicKey
        );

        // Load app version
        const versionInfo = await window.api?.getAppVersion();
        if (versionInfo) {
          appVersion = versionInfo.version;
          isCanary = versionInfo.channel === 'canary';
        }
      } catch (error) {
        console.error('Failed to load API keys:', error);
      }
    })();

    // Cleanup function
    return () => {
      if (openrouterSaveTimer) clearTimeout(openrouterSaveTimer);
      if (anthropicSaveTimer) clearTimeout(anthropicSaveTimer);
    };
  });

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
    provider: 'openrouter' | 'anthropic',
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
      await settingsStore.updateApiKey(provider, key, orgId);

      // Show subtle success indication
      const providerNames = {
        openrouter: 'OpenRouter',
        anthropic: 'Anthropic'
      };
      showSuccess(`${providerNames[provider]} API key saved`);
    } catch (error) {
      console.error(`Failed to auto-save ${provider} API key:`, error);
      showError(`Failed to save ${provider} API key`);
    }
  }

  function debounceOpenrouterSave(): void {
    if (openrouterSaveTimer) {
      clearTimeout(openrouterSaveTimer);
    }

    openrouterSaveTimer = setTimeout(() => {
      if (openrouterKey && openrouterKeyValid) {
        autoSaveApiKey('openrouter', openrouterKey);
      }
    }, 1000); // 1 second debounce
  }

  function debounceAnthropicSave(): void {
    if (anthropicSaveTimer) {
      clearTimeout(anthropicSaveTimer);
    }

    anthropicSaveTimer = setTimeout(() => {
      if (anthropicKey && anthropicKeyValid) {
        autoSaveApiKey('anthropic', anthropicKey);
      }
    }, 1000);
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
      openrouterKey = '';
      anthropicKey = '';
      openrouterKeyValid = false;
      anthropicKeyValid = false;

      await settingsStore.updateSettings({
        apiKeys: {
          openrouter: '',
          anthropic: ''
        }
      });

      showSuccess('All API keys cleared successfully');
    } catch (error) {
      showError(
        `Failed to clear API keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async function handleProviderChange(
    newProvider: 'openrouter' | 'anthropic'
  ): Promise<void> {
    try {
      // Update the settings store
      await settingsStore.updateProvider(newProvider);

      // Get the current model and map it to the new provider
      const { mapModelToProvider } = await import('../config/models');
      const { modelStore } = await import('../stores/modelStore.svelte');
      const currentModelId = settingsStore.settings.modelPreferences.defaultModel;
      const mappedModel = mapModelToProvider(currentModelId, newProvider);

      if (mappedModel) {
        // Update the default model in settings
        await settingsStore.updateDefaultModel(mappedModel.id);

        // Update the active model in the model store (updates UI immediately)
        await modelStore.setSelectedModel(mappedModel.id);

        // Notify the backend to switch provider
        await window.api?.switchAiProvider({
          provider: newProvider,
          modelName: mappedModel.id
        });

        showSuccess(`Switched to ${newProvider}`);
      } else {
        showError('Failed to map model to new provider');
      }
    } catch (error) {
      console.error('Failed to switch provider:', error);
      showError('Failed to switch provider');
    }
  }

  async function checkForUpdatesNow(): Promise<void> {
    try {
      checkingForUpdates = true;
      const result = await window.api?.checkForUpdates();
      if (result?.success) {
        showSuccess('Update check complete');
      } else {
        showError(`Update check failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      showError(
        'Failed to check for updates: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      checkingForUpdates = false;
    }
  }

  function openChangelog(): void {
    showChangelog = true;
  }

  async function rebuildDatabaseNow(): Promise<void> {
    if (
      !confirm(
        'This will rebuild the database from your markdown notes on disk. This may take a few moments. Continue?'
      )
    ) {
      return;
    }

    try {
      rebuildingDatabase = true;
      const currentVault = await window.api?.getCurrentVault();
      if (!currentVault) {
        showError('No vault selected');
        return;
      }

      const result = await window.api?.rebuildDatabase({ vaultId: currentVault.id });
      if (result?.success) {
        showSuccess(`Database rebuilt successfully (${result.noteCount} notes indexed)`);
      } else {
        showError('Failed to rebuild database');
      }
    } catch (error) {
      showError(
        'Failed to rebuild database: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      rebuildingDatabase = false;
    }
  }
</script>

<div class="settings">
  <div class="settings-content">
    <h2>Settings</h2>

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

    <!-- Appearance Section -->
    <section class="settings-section">
      <h3>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="section-icon"
        >
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        Appearance
      </h3>
      <p class="section-description">
        Customize the visual appearance of Flint. Choose between light mode, dark mode, or
        automatically follow your system settings.
      </p>

      <div class="theme-selector">
        <label class="theme-option">
          <input
            type="radio"
            name="theme"
            value="light"
            checked={settingsStore.settings.appearance.theme === 'light'}
            onchange={async () => {
              await settingsStore.updateTheme('light');
            }}
          />
          <div class="theme-option-content">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            <div class="theme-option-text">
              <strong>Light</strong>
              <span>Always use light mode</span>
            </div>
          </div>
        </label>

        <label class="theme-option">
          <input
            type="radio"
            name="theme"
            value="dark"
            checked={settingsStore.settings.appearance.theme === 'dark'}
            onchange={async () => {
              await settingsStore.updateTheme('dark');
            }}
          />
          <div class="theme-option-content">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <div class="theme-option-text">
              <strong>Dark</strong>
              <span>Always use dark mode</span>
            </div>
          </div>
        </label>

        <label class="theme-option">
          <input
            type="radio"
            name="theme"
            value="system"
            checked={settingsStore.settings.appearance.theme === 'system'}
            onchange={async () => {
              await settingsStore.updateTheme('system');
            }}
          />
          <div class="theme-option-content">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <div class="theme-option-text">
              <strong>Auto</strong>
              <span>Follow system settings</span>
            </div>
          </div>
        </label>
      </div>
    </section>

    <!-- Reader Section -->
    <section class="settings-section">
      <h3>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="section-icon"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        Reader
      </h3>
      <p class="section-description">
        Configure default settings for reading PDFs and EPUBs. These defaults apply when
        opening a document for the first time.
      </p>

      <div class="reader-settings">
        <div class="setting-row">
          <div class="setting-info">
            <label for="pdf-zoom">Default PDF Zoom</label>
            <small>Initial zoom level for PDF documents</small>
          </div>
          <select
            id="pdf-zoom"
            class="setting-select"
            value={String(settingsStore.settings.reader.defaultPdfZoom)}
            onchange={async (e) => {
              const value = parseFloat((e.target as HTMLSelectElement).value);
              await settingsStore.updateSettings({
                reader: { ...settingsStore.settings.reader, defaultPdfZoom: value }
              });
            }}
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="1.75">175%</option>
            <option value="2">200%</option>
            <option value="2.5">250%</option>
            <option value="3">300%</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="epub-text-size">Default EPUB Text Size</label>
            <small>Initial text size for EPUB documents</small>
          </div>
          <select
            id="epub-text-size"
            class="setting-select"
            value={String(settingsStore.settings.reader.defaultEpubTextSize)}
            onchange={async (e) => {
              const value = parseInt((e.target as HTMLSelectElement).value, 10);
              await settingsStore.updateSettings({
                reader: { ...settingsStore.settings.reader, defaultEpubTextSize: value }
              });
            }}
          >
            <option value="75">75%</option>
            <option value="90">90%</option>
            <option value="100">100%</option>
            <option value="110">110%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
            <option value="175">175%</option>
            <option value="200">200%</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Auto-Updater Section -->
    <section class="settings-section">
      <h3>📦 Application Updates</h3>
      <p class="settings-description">
        Updates are downloaded automatically in the background. When an update is ready,
        you'll see an indicator in the title bar.
      </p>

      <div class="version-info">
        <div class="info-row">
          <span class="info-label">Current Version:</span>
          <span class="info-value">{appVersion || 'Loading...'}</span>
        </div>
      </div>

      <div class="update-actions">
        <button
          class="btn-secondary"
          onclick={checkForUpdatesNow}
          disabled={checkingForUpdates}
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
          {checkingForUpdates ? 'Checking...' : 'Check Now'}
        </button>
        <button class="btn-secondary" onclick={openChangelog}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          View Changelog
        </button>
      </div>
    </section>

    <section class="settings-section">
      <h3>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="section-icon"
        >
          <path
            d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
          ></path>
        </svg>
        API Keys
      </h3>
      <p class="section-description">
        Configure your API keys for different AI providers. Keys are stored securely and
        encrypted on your device.
      </p>

      <div class="keychain-info">
        <div class="info-icon">🔐</div>
        <div class="info-content">
          <strong>Secure Storage Notice:</strong>
          <p>
            When you save API keys, your system may prompt you to allow "Flint" access to
            your keychain. This is normal and secure - we use your system's built-in
            encryption to protect your API keys. You can choose "Always Allow" to avoid
            repeated prompts.
          </p>
        </div>
      </div>

      <div class="provider-selection">
        <div class="provider-label"><strong>AI Provider</strong></div>
        <div class="provider-options">
          <label class="provider-option">
            <input
              type="radio"
              name="provider"
              value="openrouter"
              checked={settingsStore.settings.aiProvider.selected === 'openrouter'}
              onchange={() => handleProviderChange('openrouter')}
            />
            <span>OpenRouter</span>
          </label>
          <label class="provider-option">
            <input
              type="radio"
              name="provider"
              value="anthropic"
              checked={settingsStore.settings.aiProvider.selected === 'anthropic'}
              onchange={() => handleProviderChange('anthropic')}
            />
            <span>Anthropic</span>
          </label>
        </div>
        <small>The selected provider will be used for all AI operations.</small>
      </div>

      <div class="api-key-group">
        <label for="openrouter-key-input">
          <strong>OpenRouter API Key</strong>
          <span class="validation-indicator" class:valid={openrouterKeyValid}>
            {openrouterKeyValid ? '✓' : '❌'}
          </span>
        </label>
        <div class="input-group">
          <input
            id="openrouter-key-input"
            type="password"
            bind:value={openrouterKey}
            placeholder="Your OpenRouter API key"
            class="api-key-input"
            oninput={() => {
              openrouterKeyValid = secureStorageService.validateApiKey(
                'openrouter',
                openrouterKey
              );
              debounceOpenrouterSave();
            }}
          />
        </div>
        <small
          >Get your OpenRouter API key from <a
            target="_blank"
            href="https://openrouter.ai/settings/keys">openrouter.ai</a
          >.</small
        >
      </div>

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
            placeholder="Your Anthropic API key"
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
          >Get your Anthropic API key from <a
            target="_blank"
            href="https://console.anthropic.com/settings/keys">console.anthropic.com</a
          >.</small
        >
      </div>

      <div class="danger-zone">
        <h4>Danger Zone</h4>
        <button class="btn-danger" onclick={clearAllApiKeys}> Clear All API Keys </button>
      </div>
    </section>

    <!-- Database Section -->
    <section class="settings-section">
      <h3>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="section-icon"
        >
          <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
        </svg>
        Database
      </h3>
      <p class="section-description">
        Manage your vault's database. The database indexes all your markdown notes for
        fast search and retrieval.
      </p>

      <div class="database-actions">
        <button
          class="btn-secondary"
          onclick={rebuildDatabaseNow}
          disabled={rebuildingDatabase}
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
          {rebuildingDatabase ? 'Rebuilding...' : 'Rebuild Database'}
        </button>
      </div>
      <p class="help-text">
        Use this to rebuild the database from your markdown files on disk. This can help
        fix search issues or sync problems.
      </p>
    </section>
  </div>
</div>

{#if showChangelog}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => (showChangelog = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <ChangelogViewer
        version={appVersion}
        {isCanary}
        onClose={() => (showChangelog = false)}
      />
    </div>
  </div>
{/if}

<style>
  .settings {
    height: 100%;
    background: var(--bg-primary);
    overflow: visible;
  }

  .settings-content {
    padding: 2rem;
    padding-bottom: 4rem;
    overflow: visible;
    min-height: 0;
  }

  .settings-content h2 {
    margin: 0 0 2rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
  }

  .message.error {
    background: var(--settings-message-error-bg);
    color: var(--settings-message-error-text);
    border: 1px solid var(--settings-message-error-border);
  }

  .message.success {
    background: var(--settings-message-success-bg);
    color: var(--settings-message-success-text);
    border: 1px solid var(--settings-message-success-border);
  }

  .settings-section {
    margin-bottom: 3rem;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .settings-section h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--border-light);
  }

  .version-info {
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    border: 1px solid var(--border-light);
    margin-bottom: 1rem;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .info-label {
    font-weight: 500;
    color: var(--text-secondary);
  }

  .info-value {
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    color: var(--text-primary);
    font-weight: 600;
  }

  .update-actions {
    display: flex;
    gap: 0.75rem;
  }

  .database-actions {
    margin-bottom: 1rem;
  }

  .help-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .section-icon {
    flex-shrink: 0;
    color: var(--accent);
  }

  .section-description {
    margin: 0 0 2rem 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .keychain-info {
    display: flex;
    gap: 1rem;
    padding: 1.25rem;
    margin-bottom: 2rem;
    background: var(--settings-info-bg);
    border: 1px solid var(--settings-info-border);
    border-radius: 0.75rem;
    align-items: flex-start;
  }

  .info-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .info-content {
    flex: 1;
  }

  .info-content strong {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .info-content p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
    font-size: 0.875rem;
  }

  .provider-selection {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: var(--bg-secondary);
    border-radius: 0.75rem;
    border: 1px solid var(--border-light);
  }

  .provider-label {
    display: block;
    margin-bottom: 1rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .provider-options {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .provider-option {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid var(--border-light);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-primary);
  }

  .provider-option:hover {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .provider-option input[type='radio'] {
    cursor: pointer;
    margin: 0;
  }

  .provider-option input[type='radio']:checked + span {
    font-weight: 600;
    color: var(--accent-primary);
  }

  .provider-option span {
    font-weight: 500;
    color: var(--text-primary);
  }

  .provider-selection small {
    display: block;
    color: var(--text-secondary);
    font-size: 0.875rem;
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

  .btn-secondary,
  .btn-danger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary svg {
    flex-shrink: 0;
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
    background: var(--settings-btn-danger-bg);
    color: var(--settings-btn-danger-text);
    border: 1px solid var(--settings-btn-danger-border);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--settings-btn-danger-hover-bg);
  }

  .btn-secondary:disabled,
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger-zone {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--settings-danger-bg);
    border: 1px solid var(--settings-danger-border);
    border-radius: 0.75rem;
  }

  .danger-zone h4 {
    margin: 0 0 1rem 0;
    color: var(--settings-danger-text);
    font-weight: 600;
  }

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
    width: 90%;
    max-width: 800px;
    height: 80vh;
    background: var(--bg-primary);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  /* Theme selector styles */
  .theme-selector {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .theme-option {
    position: relative;
    display: block;
    cursor: pointer;
  }

  .theme-option input[type='radio'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .theme-option-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-light);
    border-radius: 0.75rem;
    transition: all 0.2s ease;
  }

  .theme-option:hover .theme-option-content {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .theme-option input[type='radio']:checked + .theme-option-content {
    border-color: var(--accent-primary);
    background: var(--accent-light);
  }

  .theme-option-content svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .theme-option input[type='radio']:checked + .theme-option-content svg {
    color: var(--accent-primary);
  }

  .theme-option-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .theme-option-text strong {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .theme-option-text span {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  /* Reader settings */
  .reader-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-info label {
    font-weight: 500;
    color: var(--text-primary);
  }

  .setting-info small {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  .setting-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    min-width: 100px;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    padding-right: 2rem;
  }

  .setting-select option {
    background: var(--bg-primary);
    color: var(--text-primary);
    padding: 0.5rem;
  }

  .setting-select:hover {
    border-color: var(--accent-primary);
  }

  .setting-select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-light);
  }
</style>
