<script lang="ts">
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { secureStorageService } from '../services/secureStorageService';
  import SlashCommands from './SlashCommands.svelte';
  import CustomFunctionsManager from './custom-functions/CustomFunctionsManager.svelte';
  import ChangelogViewer from './ChangelogViewer.svelte';

  let errorMessage = $state('');
  let successMessage = $state('');

  // Local form state for API keys
  let openrouterKey = $state('');

  // Validation states
  let openrouterKeyValid = $state(false);

  // Auto-save debounce timers
  let openrouterSaveTimer;

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
        openrouterKey = keys.openrouter;

        // Update validation
        openrouterKeyValid = secureStorageService.validateApiKey(
          'openrouter',
          openrouterKey
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
      if (openrouterSaveTimer) {
        clearTimeout(openrouterSaveTimer);
      }
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
    provider: 'openrouter',
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
      showSuccess(`${provider} API key saved`);
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
      openrouterKeyValid = false;

      await settingsStore.updateSettings({
        apiKeys: {
          openrouter: ''
        }
      });

      showSuccess('All API keys cleared successfully');
    } catch (error) {
      showError(
        `Failed to clear API keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
            href="https://openrouter.ai">openrouter.ai</a
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
          <path d="M10 3l-7 7 7 7"></path>
          <path d="M21 3l-7 7 7 7"></path>
        </svg>
        Slash Commands
      </h3>
      <p class="section-description">
        Create custom slash commands to quickly insert templated prompts into your AI
        conversations.
      </p>

      <SlashCommands />
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
          <path d="M14.5 4H20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-5.5"></path>
          <polyline points="14.5,1 14.5,8 21,8"></polyline>
          <path d="M10,21H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h6l4,4v7"></path>
          <line x1="7" y1="10" x2="8" y2="10"></line>
          <line x1="7" y1="14" x2="10" y2="14"></line>
        </svg>
        Custom Functions
      </h3>
      <p class="section-description">
        Create and manage custom TypeScript functions that can be called by AI during
        conversations.
      </p>

      <CustomFunctionsManager embedded={true} />
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
    background: #fee;
    color: #c53030;
    border: 1px solid #fca5a5;
  }

  .message.success {
    background: #f0fff4;
    color: #38a169;
    border: 1px solid #9ae6b4;
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
    background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
    border: 1px solid #bbdefb;
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
</style>
