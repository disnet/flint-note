import { DEFAULT_MODEL, getModelById } from '../config/models';
import { secureStorageService } from '../services/secureStorageService';
// Default settings
const DEFAULT_SETTINGS = {
    apiKeys: {
        anthropic: '',
        openai: '',
        openaiOrgId: '',
        gateway: ''
    },
    modelPreferences: {
        defaultModel: DEFAULT_MODEL,
        showCosts: true,
        costWarningThreshold: 10
    },
    appearance: {
        theme: 'system'
    },
    dataAndPrivacy: {
        autoSaveDelay: 500,
        chatHistoryRetentionDays: 30
    },
    advanced: {
        debugMode: false,
        proxyUrl: '',
        customEndpoints: {}
    }
};
const STORAGE_KEY = 'flint-settings';
// Load settings from localStorage (non-sensitive data only)
function loadStoredSettings() {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Don't load API keys from localStorage - these should come from secure storage
                delete parsed.apiKeys;
                return parsed;
            }
        }
        catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
        }
    }
    return {};
}
// Save settings to localStorage (non-sensitive data only)
function saveStoredSettings(settings) {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            // Create a copy without API keys for localStorage
            const safeSettings = {
                modelPreferences: settings.modelPreferences,
                appearance: settings.appearance,
                dataAndPrivacy: settings.dataAndPrivacy,
                advanced: settings.advanced
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings));
        }
        catch (error) {
            console.warn('Failed to save settings to localStorage:', error);
        }
    }
}
// Initialize settings with defaults and stored values
const storedSettings = loadStoredSettings();
let settings = $state({
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    // Ensure API keys are always initialized as empty (will be loaded from secure storage)
    apiKeys: DEFAULT_SETTINGS.apiKeys
});
// Derived state for validation
const isAnthropicKeyValid = $derived(settings.apiKeys.anthropic.startsWith('sk-ant-') &&
    settings.apiKeys.anthropic.length > 20);
const isOpenAIKeyValid = $derived(settings.apiKeys.openai.startsWith('sk-') && settings.apiKeys.openai.length > 20);
const currentModelInfo = $derived(getModelById(settings.modelPreferences.defaultModel) || getModelById(DEFAULT_MODEL));
// Initialize API keys from secure storage
async function loadApiKeysFromSecureStorage() {
    try {
        const keys = await secureStorageService.getAllApiKeys();
        settings = {
            ...settings,
            apiKeys: {
                anthropic: keys.anthropic,
                openai: keys.openai,
                openaiOrgId: keys.openaiOrgId,
                gateway: keys.gateway
            }
        };
    }
    catch (error) {
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
    get isAnthropicKeyValid() {
        return isAnthropicKeyValid;
    },
    get isOpenAIKeyValid() {
        return isOpenAIKeyValid;
    },
    get currentModelInfo() {
        return currentModelInfo;
    },
    async loadApiKeys() {
        return loadApiKeysFromSecureStorage();
    },
    // Settings operations
    updateSettings(newSettings) {
        const updatedSettings = {
            ...settings,
            ...newSettings
        };
        // Deep merge nested objects
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
        settings = updatedSettings;
        saveStoredSettings(settings);
    },
    updateApiKey(provider, key, orgId) {
        const apiKeys = { ...settings.apiKeys };
        if (provider === 'anthropic') {
            apiKeys.anthropic = key;
        }
        else if (provider === 'openai') {
            apiKeys.openai = key;
            if (orgId !== undefined) {
                apiKeys.openaiOrgId = orgId;
            }
        }
        else if (provider === 'gateway') {
            apiKeys.gateway = key;
        }
        this.updateSettings({ apiKeys });
    },
    updateDefaultModel(modelId) {
        const modelInfo = getModelById(modelId);
        if (modelInfo) {
            this.updateSettings({
                modelPreferences: {
                    ...settings.modelPreferences,
                    defaultModel: modelId
                }
            });
        }
    },
    updateTheme(theme) {
        this.updateSettings({
            appearance: {
                ...settings.appearance,
                theme
            }
        });
    },
    resetToDefaults() {
        settings = { ...DEFAULT_SETTINGS };
        saveStoredSettings(settings);
    },
    resetSection(section) {
        settings = {
            ...settings,
            [section]: { ...DEFAULT_SETTINGS[section] }
        };
        saveStoredSettings(settings);
    },
    // Export/Import functionality
    exportSettings() {
        // Export all settings except API keys
        const exportableSettings = {
            modelPreferences: settings.modelPreferences,
            appearance: settings.appearance,
            dataAndPrivacy: settings.dataAndPrivacy,
            advanced: settings.advanced
        };
        return JSON.stringify(exportableSettings, null, 2);
    },
    importSettings(settingsJson) {
        try {
            const importedSettings = JSON.parse(settingsJson);
            // Don't import API keys for security
            delete importedSettings.apiKeys;
            this.updateSettings(importedSettings);
            return true;
        }
        catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    },
    // Validation helpers
    validateApiKey(provider, key) {
        if (provider === 'anthropic') {
            return key.startsWith('sk-ant-') && key.length > 20;
        }
        else if (provider === 'openai') {
            return key.startsWith('sk-') && key.length > 20;
        }
        else if (provider === 'gateway') {
            return key.length > 10; // Gateway keys may have different formats
        }
        return false;
    }
};
// Auto-save is handled manually in updateSettings method
