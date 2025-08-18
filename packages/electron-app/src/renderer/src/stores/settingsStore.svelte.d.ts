export interface AppSettings {
    apiKeys: {
        anthropic: string;
        openai: string;
        openaiOrgId?: string;
        gateway: string;
    };
    modelPreferences: {
        defaultModel: string;
        showCosts: boolean;
        costWarningThreshold: number;
    };
    appearance: {
        theme: 'light' | 'dark' | 'system';
    };
    dataAndPrivacy: {
        autoSaveDelay: number;
        chatHistoryRetentionDays: number;
    };
    advanced: {
        debugMode: boolean;
        proxyUrl?: string;
        customEndpoints: {
            anthropic?: string;
            openai?: string;
        };
    };
}
export declare const settingsStore: {
    readonly settings: AppSettings;
    readonly isAnthropicKeyValid: boolean;
    readonly isOpenAIKeyValid: boolean;
    readonly currentModelInfo: import("../config/models").ModelInfo;
    loadApiKeys(): Promise<void>;
    updateSettings(newSettings: Partial<AppSettings>): void;
    updateApiKey(provider: "anthropic" | "openai" | "gateway", key: string, orgId?: string): void;
    updateDefaultModel(modelId: string): void;
    updateTheme(theme: "light" | "dark" | "system"): void;
    resetToDefaults(): void;
    resetSection(section: keyof AppSettings): void;
    exportSettings(): string;
    importSettings(settingsJson: string): boolean;
    validateApiKey(provider: "anthropic" | "openai" | "gateway", key: string): boolean;
};
