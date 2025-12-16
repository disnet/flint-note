<script lang="ts">
  /**
   * API Key Settings Component for Automerge UI
   *
   * Allows users to configure their OpenRouter API key for AI chat features.
   * Uses Electron's secure storage to safely store the key.
   */

  // State
  let apiKey = $state('');
  let isValid = $state(false);
  let isSaving = $state(false);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Load API key on mount
  $effect(() => {
    const loadKey = async (): Promise<void> => {
      try {
        const result = await window.api?.getApiKey({ provider: 'openrouter' });
        if (result?.key) {
          apiKey = result.key;
          validateKey(result.key);
        }
      } catch (error) {
        console.error('Failed to load API key:', error);
      }
    };
    loadKey();
  });

  // Validate API key format
  function validateKey(key: string): boolean {
    // OpenRouter keys start with "sk-or-" or just "sk-" and are > 20 chars
    const valid = key.startsWith('sk-') && key.length > 20;
    isValid = valid;
    return valid;
  }

  // Handle input change with debounced save
  function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const value = event.currentTarget.value;
    apiKey = value;
    validateKey(value);

    // Debounce save
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveKey(value);
    }, 1000);
  }

  // Save API key to secure storage
  async function saveKey(key: string): Promise<void> {
    try {
      isSaving = true;
      await window.api?.storeApiKey({ provider: 'openrouter', key });
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      isSaving = false;
    }
  }

  // Clear API key
  async function clearKey(): Promise<void> {
    try {
      isSaving = true;
      await window.api?.storeApiKey({ provider: 'openrouter', key: '' });
      apiKey = '';
      isValid = false;
    } catch (error) {
      console.error('Failed to clear API key:', error);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="api-key-settings">
  <h3>AI Configuration</h3>

  <div class="keychain-notice">
    <span class="lock-icon">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </span>
    <span>
      API keys are stored securely in your system's keychain. Your system may prompt you
      to allow access.
    </span>
  </div>

  <div class="api-key-field">
    <label for="openrouter-key">
      <span>OpenRouter API Key</span>
      <span
        class="validation-badge"
        class:valid={isValid}
        class:invalid={apiKey && !isValid}
      >
        {#if apiKey}
          {isValid ? 'Valid' : 'Invalid format'}
        {:else}
          Not set
        {/if}
      </span>
    </label>
    <div class="input-wrapper">
      <input
        id="openrouter-key"
        type="password"
        value={apiKey}
        oninput={handleInput}
        placeholder="sk-or-..."
        class:saving={isSaving}
      />
      {#if isSaving}
        <span class="saving-indicator">Saving...</span>
      {/if}
    </div>
    <p class="help-text">
      Get your API key from
      <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">
        openrouter.ai
      </a>
    </p>
  </div>

  {#if apiKey}
    <button class="clear-button" onclick={clearKey} disabled={isSaving}>
      Clear API Key
    </button>
  {/if}
</div>

<style>
  .api-key-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .keychain-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .lock-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .api-key-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .validation-badge {
    font-size: 0.75rem;
    font-weight: 400;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    background: var(--bg-tertiary, var(--bg-secondary));
    color: var(--text-muted);
  }

  .validation-badge.valid {
    background: var(--success-bg, #dcfce7);
    color: var(--success-text, #166534);
  }

  .validation-badge.invalid {
    background: var(--error-bg, #fef2f2);
    color: var(--error-text, #dc3545);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: monospace;
  }

  input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  input::placeholder {
    color: var(--text-muted);
    font-family: inherit;
  }

  input.saving {
    opacity: 0.7;
  }

  .saving-indicator {
    position: absolute;
    right: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .help-text {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .help-text a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .help-text a:hover {
    text-decoration: underline;
  }

  .clear-button {
    align-self: flex-start;
    padding: 0.5rem 1rem;
    border: 1px solid var(--error-text, #dc3545);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--error-text, #dc3545);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .clear-button:hover:not(:disabled) {
    background: var(--error-bg, #fef2f2);
  }

  .clear-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
