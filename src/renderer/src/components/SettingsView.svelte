<script lang="ts">
  /**
   * Settings View component - displays application settings
   * Used when activeSystemView is 'settings'
   */
  import APIKeySettings from './APIKeySettings.svelte';
  import VaultSyncSettings from './VaultSyncSettings.svelte';
  import DebugSettings from './DebugSettings.svelte';
  import AboutSettings from './AboutSettings.svelte';
  import { settingsStore } from '../stores/settingsStore.svelte';

  interface Props {
    onClose: () => void;
    onShowLegacyMigrationModal: () => void;
    onShowChangelog: () => void;
  }

  const { onClose, onShowLegacyMigrationModal, onShowChangelog }: Props = $props();

  // Font settings state
  let systemFonts = $state<string[]>([]);
  let loadingFonts = $state(false);

  // Load system fonts when custom font option is selected
  async function loadSystemFonts(): Promise<void> {
    if (systemFonts.length > 0 || loadingFonts) return;
    loadingFonts = true;
    try {
      const fonts = await window.api?.getSystemFonts();
      if (fonts) {
        systemFonts = fonts;
      }
    } catch (error) {
      console.error('Failed to load system fonts:', error);
    } finally {
      loadingFonts = false;
    }
  }

  // Watch for custom preset selection to load fonts
  $effect(() => {
    if (settingsStore.settings.appearance.font?.preset === 'custom') {
      loadSystemFonts();
    }
  });

  // Handle font preset change
  async function handleFontPresetChange(
    preset: 'sans-serif' | 'serif' | 'monospace' | 'custom'
  ): Promise<void> {
    await settingsStore.updateFont({
      preset,
      customFont:
        preset === 'custom'
          ? settingsStore.settings.appearance.font?.customFont
          : undefined
    });
  }

  // Handle custom font selection
  async function handleCustomFontChange(fontName: string): Promise<void> {
    await settingsStore.updateFont({
      preset: 'custom',
      customFont: fontName
    });
  }

  // Handle font size change
  async function handleFontSizeChange(size: number): Promise<void> {
    await settingsStore.updateSettings({
      appearance: {
        ...settingsStore.settings.appearance,
        fontSize: size
      }
    });
  }
</script>

<div class="settings-panel">
  <h2>Settings</h2>
  <div class="settings-group">
    <label>
      <span>Theme</span>
      <select bind:value={settingsStore.settings.appearance.theme}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  </div>

  <div class="settings-group">
    <label>
      <span>Editor Font</span>
      <select
        value={settingsStore.settings.appearance.font?.preset || 'sans-serif'}
        onchange={(e) =>
          handleFontPresetChange(
            e.currentTarget.value as 'sans-serif' | 'serif' | 'monospace' | 'custom'
          )}
      >
        <option value="sans-serif">Sans-serif</option>
        <option value="serif">Serif</option>
        <option value="monospace">Monospace</option>
        <option value="custom">Custom...</option>
      </select>
    </label>
  </div>

  {#if settingsStore.settings.appearance.font?.preset === 'custom'}
    <div class="settings-group">
      <label>
        <span>Custom Font</span>
        <select
          value={settingsStore.settings.appearance.font?.customFont || ''}
          onchange={(e) => handleCustomFontChange(e.currentTarget.value)}
          disabled={loadingFonts}
        >
          <option value=""
            >{loadingFonts ? 'Loading fonts...' : 'Select a font...'}</option
          >
          {#each systemFonts as fontName (fontName)}
            <option value={fontName}>{fontName}</option>
          {/each}
        </select>
      </label>
      {#if settingsStore.settings.appearance.font?.customFont}
        <div
          class="font-preview"
          style="font-family: '{settingsStore.settings.appearance.font.customFont}'"
        >
          The quick brown fox jumps over the lazy dog.
        </div>
      {/if}
    </div>
  {/if}

  <div class="settings-group">
    <label>
      <span>Font Size</span>
      <div class="font-size-control">
        <input
          type="range"
          min="12"
          max="24"
          step="1"
          value={settingsStore.settings.appearance.fontSize ?? 16}
          oninput={(e) => handleFontSizeChange(parseInt(e.currentTarget.value))}
        />
        <span class="font-size-value"
          >{settingsStore.settings.appearance.fontSize ?? 16}px</span
        >
      </div>
    </label>
  </div>

  <div class="settings-divider"></div>

  <!-- API Key Settings -->
  <APIKeySettings />

  <div class="settings-divider"></div>

  <!-- File Sync Settings -->
  <VaultSyncSettings />

  <div class="settings-divider"></div>

  <!-- Debug / Performance Settings (dev mode only) -->
  {#if import.meta.env.DEV}
    <DebugSettings />
    <div class="settings-divider"></div>
  {/if}

  <!-- Legacy Vault Import -->
  <div class="import-section">
    <h3>Import Legacy Vault</h3>
    <p class="import-description">
      Import notes from an older Flint vault (before the Automerge update). Your original
      files will not be modified.
    </p>
    <button class="action-button primary" onclick={onShowLegacyMigrationModal}>
      Import Legacy Vault...
    </button>
  </div>

  <div class="settings-divider"></div>

  <!-- About / Version -->
  <AboutSettings {onShowChangelog} />

  <button class="close-settings" onclick={onClose}>Close</button>
</div>

<style>
  .settings-panel {
    padding: 2rem;
    max-width: 600px;
    margin: 0 auto;
  }

  .settings-panel h2 {
    margin: 0 0 1.5rem;
  }

  .settings-group {
    margin-bottom: 1rem;
  }

  .settings-group label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
  }

  .settings-group select {
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .font-preview {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.375rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .font-size-control {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .font-size-control input[type='range'] {
    width: 120px;
    accent-color: var(--accent-primary);
  }

  .font-size-value {
    min-width: 3rem;
    text-align: right;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .settings-divider {
    height: 1px;
    background: var(--border-light);
    margin: 1.5rem 0;
  }

  .close-settings {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--bg-tertiary, var(--bg-hover));
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  /* Import Section */
  .import-section {
    padding: 1rem;
  }

  .import-section h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--text-primary);
  }

  .import-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  .action-button {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s ease;
  }

  .action-button.primary {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .action-button.primary:hover {
    background: var(--accent-primary-hover);
  }
</style>
