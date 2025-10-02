<script lang="ts">
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { secureStorageService } from '../services/secureStorageService';
  import { modelStore } from '../stores/modelStore.svelte';
  import { SUPPORTED_MODELS } from '../config/models';
  import { ElectronChatService } from '../services/electronChatService';

  let errorMessage = $state('');
  let successMessage = $state('');

  // Local form state for API keys
  let openrouterKey = $state('');

  // Validation states
  let openrouterKeyValid = $state(false);

  // Auto-save debounce timers
  let openrouterSaveTimer;

  // Cache monitoring state
  let cacheMetrics = $state<CacheMetrics | null>(null);
  let cachePerformance = $state<CachePerformanceSnapshot | null>(null);
  let cacheConfig = $state<CacheConfig | null>(null);
  let cacheHealthCheck = $state<CacheHealthCheck | null>(null);
  let cacheReport = $state('');
  let performanceMonitoringActive = $state(false);
  let loadingCache = $state(false);
  let cacheDataLoaded = $state(false);

  // Initialize chat service for cache monitoring
  const chatService = new ElectronChatService();

  // App version state
  let appVersion = $state('');
  let checkingForUpdates = $state(false);

  // Cache monitoring types
  interface CacheConfig {
    enableSystemMessageCaching: boolean;
    enableHistoryCaching: boolean;
    minimumCacheTokens: number;
    historySegmentSize: number;
  }

  interface CacheMetrics {
    totalRequests: number;
    systemMessageCacheHits: number;
    systemMessageCacheMisses: number;
    historyCacheHits: number;
    historyCacheMisses: number;
    totalTokensSaved: number;
    totalCacheableTokens: number;
    averageConversationLength: number;
    lastResetTime: Date;
  }

  interface CachePerformanceSnapshot {
    systemMessageCacheHitRate: number;
    historyCacheHitRate: number;
    overallCacheEfficiency: number;
    tokenSavingsRate: number;
    recommendedOptimizations: string[];
  }

  interface CacheHealthCheck {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    score: number;
  }

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

  async function handleDefaultModelChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    await settingsStore.updateDefaultModel(target.value);
    await modelStore.setSelectedModel(target.value);
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

  // Cache monitoring functions
  async function loadCacheData(): Promise<void> {
    if (loadingCache) return;

    try {
      loadingCache = true;

      const [metrics, performance, config, health] = await Promise.all([
        chatService.getCacheMetrics(),
        chatService.getCachePerformanceSnapshot(),
        chatService.getCacheConfig(),
        chatService.getCacheHealthCheck()
      ]);

      cacheMetrics = metrics;
      cachePerformance = performance;
      cacheConfig = config;
      cacheHealthCheck = health;

      cacheDataLoaded = true;
    } catch (error) {
      cacheDataLoaded = false;
      showError(
        'Failed to load cache data: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      loadingCache = false;
    }
  }

  async function generateCacheReport(): Promise<void> {
    try {
      cacheReport = await chatService.getCachePerformanceReport();
    } catch (error) {
      showError(
        'Failed to generate cache report: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async function optimizeCache(): Promise<void> {
    try {
      const optimizedConfig = await chatService.optimizeCacheConfig();
      cacheConfig = optimizedConfig;
      showSuccess('Cache configuration optimized successfully');
      await loadCacheData(); // Refresh data
    } catch (error) {
      showError(
        'Failed to optimize cache: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async function resetCacheMetrics(): Promise<void> {
    try {
      await chatService.resetCacheMetrics();
      showSuccess('Cache metrics reset successfully');
      await loadCacheData(); // Refresh data
    } catch (error) {
      showError(
        'Failed to reset cache metrics: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async function togglePerformanceMonitoring(): Promise<void> {
    try {
      if (performanceMonitoringActive) {
        await chatService.stopPerformanceMonitoring();
        performanceMonitoringActive = false;
        showSuccess('Performance monitoring stopped');
      } else {
        await chatService.startPerformanceMonitoring(30);
        performanceMonitoringActive = true;
        showSuccess('Performance monitoring started (30-minute intervals)');
      }
    } catch (error) {
      showError(
        'Failed to toggle performance monitoring: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async function warmupCache(): Promise<void> {
    try {
      await chatService.warmupSystemCache();
      showSuccess('System cache warmed up successfully');
      await loadCacheData(); // Refresh data
    } catch (error) {
      showError(
        'Failed to warmup cache: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async function updateCacheConfig(updates: Partial<CacheConfig>): Promise<void> {
    try {
      const updatedConfig = await chatService.setCacheConfig(updates);
      cacheConfig = updatedConfig;
      showSuccess('Cache configuration updated');
    } catch (error) {
      showError(
        'Failed to update cache configuration: ' +
          (error instanceof Error ? error.message : 'Unknown error')
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

  // Load cache data on component mount
  $effect(() => {
    if (!cacheDataLoaded && !loadingCache) {
      loadCacheData().catch((error) => {
        console.error('Failed to load cache data in effect:', error);
        showError(
          'Failed to load cache data: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        );
        loadingCache = false;
      });
    }
  });
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
            d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a3 3 0 0 1 3 3 3 3 0 0 1-3 3v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a3 3 0 0 1-3-3 3 3 0 0 1 3-3h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"
          ></path>
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
        </svg>
        Model Preferences
      </h3>
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
            onchange={async (e) =>
              await settingsStore.updateSettings({
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
          onchange={async (e) =>
            await settingsStore.updateSettings({
              modelPreferences: {
                ...settingsStore.settings.modelPreferences,
                costWarningThreshold: parseInt((e.target as HTMLInputElement).value)
              }
            })}
        />
        <small>Show warning when monthly costs exceed this amount</small>
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
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
        </svg>
        Cache Performance
      </h3>
      <p class="section-description">
        Monitor and optimize AI model caching for better performance and cost efficiency.
      </p>

      {#if loadingCache}
        <div class="loading-indicator">Loading cache data...</div>
      {:else}
        <!-- Cache Health Status -->
        {#if cacheHealthCheck}
          <div
            class="cache-health"
            class:healthy={cacheHealthCheck.status === 'healthy'}
            class:warning={cacheHealthCheck.status === 'warning'}
            class:critical={cacheHealthCheck.status === 'critical'}
          >
            <h4>
              {#if cacheHealthCheck.status === 'healthy'}✅{:else if cacheHealthCheck.status === 'warning'}⚠️{:else}❌{/if}
              Cache Health: {cacheHealthCheck.status.toUpperCase()} ({cacheHealthCheck.score}/100)
            </h4>
            {#if cacheHealthCheck.issues.length > 0}
              <div class="health-issues">
                <strong>Issues:</strong>
                <ul>
                  {#each cacheHealthCheck.issues as issue, index (index)}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if cacheHealthCheck.recommendations.length > 0}
              <div class="health-recommendations">
                <strong>Recommendations:</strong>
                <ul>
                  {#each cacheHealthCheck.recommendations as rec, index (index)}
                    <li>{rec}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Cache Configuration -->
        {#if cacheConfig}
          <div class="cache-config">
            <h4>Configuration</h4>
            <div class="config-grid">
              <label class="checkbox-option">
                <input
                  type="checkbox"
                  checked={cacheConfig.enableSystemMessageCaching}
                  onchange={async (e) =>
                    await updateCacheConfig({
                      enableSystemMessageCaching: (e.target as HTMLInputElement).checked
                    })}
                />
                <span>System Message Caching</span>
              </label>

              <label class="checkbox-option">
                <input
                  type="checkbox"
                  checked={cacheConfig.enableHistoryCaching}
                  onchange={async (e) =>
                    await updateCacheConfig({
                      enableHistoryCaching: (e.target as HTMLInputElement).checked
                    })}
                />
                <span>History Caching</span>
              </label>

              <div class="form-group">
                <label for="min-cache-tokens">Minimum Cache Tokens</label>
                <input
                  id="min-cache-tokens"
                  type="number"
                  min="256"
                  max="4096"
                  step="256"
                  value={cacheConfig.minimumCacheTokens}
                  onchange={async (e) =>
                    await updateCacheConfig({
                      minimumCacheTokens: parseInt((e.target as HTMLInputElement).value)
                    })}
                />
                <small>Minimum tokens required to cache a segment</small>
              </div>

              <div class="form-group">
                <label for="history-segment-size">History Segment Size</label>
                <input
                  id="history-segment-size"
                  type="number"
                  min="2"
                  max="8"
                  value={cacheConfig.historySegmentSize}
                  onchange={async (e) =>
                    await updateCacheConfig({
                      historySegmentSize: parseInt((e.target as HTMLInputElement).value)
                    })}
                />
                <small>Number of recent messages to keep uncached</small>
              </div>
            </div>
          </div>
        {/if}

        <!-- Performance Metrics -->
        {#if cacheMetrics && cachePerformance}
          <div class="cache-metrics">
            <h4>Performance Metrics</h4>
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-value">{cacheMetrics.totalRequests}</div>
                <div class="metric-label">Total Requests</div>
              </div>

              <div class="metric-card">
                <div class="metric-value">
                  {(cachePerformance.systemMessageCacheHitRate * 100).toFixed(1)}%
                </div>
                <div class="metric-label">System Cache Hit Rate</div>
              </div>

              <div class="metric-card">
                <div class="metric-value">
                  {(cachePerformance.historyCacheHitRate * 100).toFixed(1)}%
                </div>
                <div class="metric-label">History Cache Hit Rate</div>
              </div>

              <div class="metric-card">
                <div class="metric-value">
                  {(cachePerformance.overallCacheEfficiency * 100).toFixed(1)}%
                </div>
                <div class="metric-label">Overall Efficiency</div>
              </div>

              <div class="metric-card">
                <div class="metric-value">
                  {cacheMetrics.totalTokensSaved.toLocaleString()}
                </div>
                <div class="metric-label">Tokens Saved</div>
              </div>

              <div class="metric-card">
                <div class="metric-value">
                  {cacheMetrics.averageConversationLength.toFixed(1)}
                </div>
                <div class="metric-label">Avg Conversation Length</div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Actions -->
        <div class="cache-actions">
          <h4>Actions</h4>
          <div class="action-group">
            <button
              class="btn-secondary"
              onclick={() => {
                cacheDataLoaded = false;
                loadCacheData();
              }}
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
              Refresh Data
            </button>

            <button class="btn-secondary" onclick={optimizeCache}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                <path d="M2 2l7.586 7.586"></path>
                <circle cx="11" cy="11" r="2"></circle>
              </svg>
              Optimize Configuration
            </button>

            <button class="btn-secondary" onclick={warmupCache}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
                ></path>
              </svg>
              Warmup Cache
            </button>

            <button
              class="btn-secondary"
              class:active={performanceMonitoringActive}
              onclick={togglePerformanceMonitoring}
            >
              {#if performanceMonitoringActive}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Stop
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
                Start
              {/if}
              Monitoring
            </button>

            <button class="btn-secondary" onclick={generateCacheReport}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M3 3v18h18"></path>
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
              </svg>
              Generate Report
            </button>

            <button class="btn-danger" onclick={resetCacheMetrics}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="3,6 5,6 21,6"></polyline>
                <path
                  d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                ></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Reset Metrics
            </button>
          </div>
        </div>

        <!-- Performance Report -->
        {#if cacheReport}
          <div class="cache-report">
            <h4>Performance Report</h4>
            <pre>{cacheReport}</pre>
          </div>
        {/if}
      {/if}
    </section>
  </div>
</div>

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

  .btn-secondary svg,
  .btn-danger svg {
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

  .action-group {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Cache Performance Styles */
  .loading-indicator {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }

  .cache-health {
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    border: 2px solid;
  }

  .cache-health.healthy {
    border-color: #22c55e;
    background-color: rgba(34, 197, 94, 0.1);
  }

  .cache-health.warning {
    border-color: #f59e0b;
    background-color: rgba(245, 158, 11, 0.1);
  }

  .cache-health.critical {
    border-color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }

  .cache-health h4 {
    margin: 0 0 12px 0;
    font-size: 1.1em;
  }

  .health-issues,
  .health-recommendations {
    margin-top: 12px;
  }

  .health-issues ul,
  .health-recommendations ul {
    margin: 8px 0 0 20px;
    padding: 0;
  }

  .health-issues li,
  .health-recommendations li {
    margin-bottom: 4px;
    font-size: 0.9em;
  }

  .cache-config,
  .cache-metrics,
  .cache-actions,
  .cache-report {
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background-color: var(--bg-secondary);
  }

  .cache-config h4,
  .cache-metrics h4,
  .cache-actions h4,
  .cache-report h4 {
    margin: 0 0 16px 0;
    font-size: 1.1em;
    color: var(--text-primary);
  }

  .config-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-option input[type='checkbox'] {
    margin: 0;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
  }

  .metric-card {
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    text-align: center;
    background-color: var(--bg-primary);
  }

  .metric-value {
    font-size: 1.5em;
    font-weight: bold;
    color: var(--primary-color);
    margin-bottom: 4px;
  }

  .metric-label {
    font-size: 0.9em;
    color: var(--text-muted);
  }

  .action-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .btn-secondary.active {
    background-color: var(--primary-color);
    color: white;
  }

  .cache-report pre {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 16px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    font-size: 0.85em;
    line-height: 1.4;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  }
</style>
