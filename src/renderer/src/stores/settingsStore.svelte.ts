import { DEFAULT_MODEL, getModelById, type AIProvider } from '../config/models';
import { secureStorageService } from '../services/secureStorageService';

// Settings interface
export interface AppSettings {
  aiProvider: {
    selected: AIProvider;
  };
  apiKeys: {
    openrouter: string;
    anthropic: string;
  };
  modelPreferences: {
    defaultModel: string;
    showCosts: boolean;
    costWarningThreshold: number;
  };
  appearance: {
    theme: 'light' | 'dark' | 'system';
    font: {
      preset: 'sans-serif' | 'serif' | 'monospace' | 'custom';
      customFont?: string;
    };
    fontSize: number; // in pixels
  };
  dataAndPrivacy: {
    autoSaveDelay: number;
    chatHistoryRetentionDays: number;
  };
  advanced: {
    debugMode: boolean;
    proxyUrl?: string;
    customEndpoints: Record<string, never>;
  };
  updates: {
    lastSeenVersion: string;
    lastSeenCanaryVersion: string;
  };
  reader: {
    defaultPdfZoom: number; // Scale value (e.g., 1.5 for 150%)
    defaultEpubTextSize: number; // Percentage (e.g., 100 for 100%)
    theme: 'system' | 'light' | 'dark'; // Reader-specific theme override
  };
}

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: {
    selected: 'openrouter' // Default to OpenRouter for backward compatibility
  },
  apiKeys: {
    openrouter: '',
    anthropic: ''
  },
  modelPreferences: {
    defaultModel: DEFAULT_MODEL,
    showCosts: true,
    costWarningThreshold: 10
  },
  appearance: {
    theme: 'system',
    font: {
      preset: 'sans-serif'
    },
    fontSize: 16
  },
  dataAndPrivacy: {
    autoSaveDelay: 500,
    chatHistoryRetentionDays: 30
  },
  advanced: {
    debugMode: false,
    proxyUrl: '',
    customEndpoints: {}
  },
  updates: {
    lastSeenVersion: '',
    lastSeenCanaryVersion: ''
  },
  reader: {
    defaultPdfZoom: 1.5, // 150%
    defaultEpubTextSize: 100, // 100%
    theme: 'system' // Follow app/system theme by default
  }
};

// Settings store state
let settings = $state<AppSettings>(DEFAULT_SETTINGS);
let isLoading = $state(true);
let isInitialized = $state(false);
let initializationPromise: Promise<void> | null = null;

// Load settings from file system (non-sensitive data only)
async function loadStoredSettings(): Promise<Partial<AppSettings>> {
  try {
    const stored = await window.api?.loadAppSettings();
    if (stored) {
      // Don't load API keys from file system - these should come from secure storage
      delete (stored as Partial<AppSettings>).apiKeys;
      return stored;
    }
  } catch (error) {
    console.warn('Failed to load settings from file system:', error);
  }
  return {};
}

// Save settings to file system (non-sensitive data only)
async function saveStoredSettings(settingsToSave: AppSettings): Promise<void> {
  try {
    // Load existing settings to preserve fields like sidebarState that we don't manage
    const currentSettings =
      ((await window.api?.loadAppSettings()) as Record<string, unknown>) || {};

    // Create a copy without API keys for file storage
    const safeSettings = {
      aiProvider: settingsToSave.aiProvider,
      modelPreferences: settingsToSave.modelPreferences,
      appearance: settingsToSave.appearance,
      dataAndPrivacy: settingsToSave.dataAndPrivacy,
      advanced: settingsToSave.advanced,
      updates: settingsToSave.updates,
      reader: settingsToSave.reader
    };

    // Merge with existing settings to preserve other fields (like sidebarState)
    const mergedSettings = {
      ...currentSettings,
      ...safeSettings
    };

    // Use $state.snapshot to get a serializable copy
    const serializableSettings = $state.snapshot(mergedSettings);
    await window.api?.saveAppSettings(serializableSettings);
  } catch (error) {
    console.warn('Failed to save settings to file system:', error);
  }
}

// Initialize settings with defaults and stored values
async function initializeSettings(): Promise<void> {
  isLoading = true;
  try {
    const storedSettings = await loadStoredSettings();
    settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      // Ensure API keys are always initialized as empty (will be loaded from secure storage)
      apiKeys: DEFAULT_SETTINGS.apiKeys
    };
  } catch (error) {
    console.warn('Settings initialization failed:', error);
    settings = DEFAULT_SETTINGS;
  } finally {
    isLoading = false;
    isInitialized = true;
    initializationPromise = null;
  }
}

// Start initialization
initializationPromise = initializeSettings();

const currentModelInfo = $derived(
  getModelById(settings.modelPreferences.defaultModel) || getModelById(DEFAULT_MODEL)!
);

// Initialize API keys from secure storage
async function loadApiKeysFromSecureStorage(): Promise<void> {
  try {
    const keys = await secureStorageService.getAllApiKeys();
    settings = {
      ...settings,
      apiKeys: {
        openrouter: keys.openrouter || '',
        anthropic: keys.anthropic || ''
      }
    };
  } catch (error) {
    console.warn('Failed to load API keys from secure storage:', error);
  }
}

// Note: API keys will be loaded when the settings component initializes

// Settings store interface
export const settingsStore = {
  // Reactive getters
  get settings() {
    return settings;
  },
  get currentModelInfo() {
    return currentModelInfo;
  },
  get loading() {
    return isLoading;
  },
  get initialized() {
    return isInitialized;
  },

  // Ensure initialization is complete before operations
  async ensureInitialized(): Promise<void> {
    if (initializationPromise) {
      await initializationPromise;
    }
  },

  async loadApiKeys(): Promise<void> {
    return loadApiKeysFromSecureStorage();
  },

  // Settings operations
  async updateSettings(newSettings: Partial<AppSettings>): Promise<void> {
    await this.ensureInitialized();

    const updatedSettings = {
      ...settings,
      ...newSettings
    };

    // Deep merge nested objects
    if (newSettings.aiProvider) {
      updatedSettings.aiProvider = { ...settings.aiProvider, ...newSettings.aiProvider };
    }
    if (newSettings.apiKeys) {
      updatedSettings.apiKeys = { ...settings.apiKeys, ...newSettings.apiKeys };
    }
    if (newSettings.modelPreferences) {
      updatedSettings.modelPreferences = {
        ...settings.modelPreferences,
        ...newSettings.modelPreferences
      };
    }
    if (newSettings.appearance) {
      updatedSettings.appearance = { ...settings.appearance, ...newSettings.appearance };
    }
    if (newSettings.dataAndPrivacy) {
      updatedSettings.dataAndPrivacy = {
        ...settings.dataAndPrivacy,
        ...newSettings.dataAndPrivacy
      };
    }
    if (newSettings.advanced) {
      updatedSettings.advanced = { ...settings.advanced, ...newSettings.advanced };
    }
    if (newSettings.updates) {
      updatedSettings.updates = { ...settings.updates, ...newSettings.updates };
    }
    if (newSettings.reader) {
      updatedSettings.reader = { ...settings.reader, ...newSettings.reader };
    }

    settings = updatedSettings;
    await saveStoredSettings(settings);
  },

  async updateApiKey(provider: AIProvider, key: string, _orgId?: string): Promise<void> {
    const apiKeys = { ...settings.apiKeys };

    if (provider === 'openrouter') {
      apiKeys.openrouter = key;
    } else if (provider === 'anthropic') {
      apiKeys.anthropic = key;
    }

    await this.updateSettings({ apiKeys });
  },

  async updateProvider(provider: AIProvider): Promise<void> {
    await this.updateSettings({
      aiProvider: {
        selected: provider
      }
    });
  },

  async updateDefaultModel(modelId: string): Promise<void> {
    const modelInfo = getModelById(modelId);
    if (modelInfo) {
      await this.updateSettings({
        modelPreferences: {
          ...settings.modelPreferences,
          defaultModel: modelId
        }
      });
    }
  },

  async updateTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.updateSettings({
      appearance: {
        ...settings.appearance,
        theme
      }
    });
  },

  async updateFont(fontSettings: {
    preset: 'sans-serif' | 'serif' | 'monospace' | 'custom';
    customFont?: string;
  }): Promise<void> {
    await this.updateSettings({
      appearance: {
        ...settings.appearance,
        font: fontSettings
      }
    });
  },

  async updateReaderTheme(theme: 'system' | 'light' | 'dark'): Promise<void> {
    await this.updateSettings({
      reader: {
        ...settings.reader,
        theme
      }
    });
  },

  async resetToDefaults(): Promise<void> {
    await this.ensureInitialized();
    settings = { ...DEFAULT_SETTINGS };
    await saveStoredSettings(settings);
  },

  async resetSection(section: keyof AppSettings): Promise<void> {
    await this.ensureInitialized();
    settings = {
      ...settings,
      [section]: { ...DEFAULT_SETTINGS[section] }
    };
    await saveStoredSettings(settings);
  },

  // Export/Import functionality
  exportSettings(): string {
    // Export all settings except API keys
    const exportableSettings = {
      aiProvider: settings.aiProvider,
      modelPreferences: settings.modelPreferences,
      appearance: settings.appearance,
      dataAndPrivacy: settings.dataAndPrivacy,
      advanced: settings.advanced,
      updates: settings.updates,
      reader: settings.reader
    };
    return JSON.stringify(exportableSettings, null, 2);
  },

  async importSettings(settingsJson: string): Promise<boolean> {
    try {
      const importedSettings = JSON.parse(settingsJson);
      // Don't import API keys for security
      delete importedSettings.apiKeys;

      await this.updateSettings(importedSettings);
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  },

  // Validation helpers
  validateApiKey(provider: AIProvider, key: string): boolean {
    if (!key || key.length === 0) {
      return false;
    }

    switch (provider) {
      case 'openrouter':
        // OpenRouter keys start with sk-or- or sk-
        return (key.startsWith('sk-or-') || key.startsWith('sk-')) && key.length > 20;
      case 'anthropic':
        // Anthropic keys start with sk-ant-
        return key.startsWith('sk-ant-') && key.length > 20;
      default:
        return false;
    }
  },

  // Update tracking helpers
  async updateLastSeenVersion(version: string, isCanary: boolean): Promise<void> {
    await this.updateSettings({
      updates: {
        ...settings.updates,
        ...(isCanary ? { lastSeenCanaryVersion: version } : { lastSeenVersion: version })
      }
    });
  },

  getLastSeenVersion(isCanary: boolean): string {
    return isCanary
      ? settings.updates.lastSeenCanaryVersion
      : settings.updates.lastSeenVersion;
  }
};

// Auto-save is handled manually in updateSettings method
