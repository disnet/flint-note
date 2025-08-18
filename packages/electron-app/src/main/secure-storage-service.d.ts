export interface SecureData {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openaiOrgId?: string;
    openrouterApiKey?: string;
    gatewayApiKey?: string;
}
export declare class SecureStorageService {
    private readonly storageDir;
    private readonly storageFile;
    constructor();
    /**
     * Store secure data (API keys) encrypted on disk
     */
    storeSecureData(data: SecureData): Promise<void>;
    /**
     * Retrieve and decrypt secure data from disk
     */
    retrieveSecureData(): Promise<SecureData>;
    /**
     * Update a specific API key
     */
    updateApiKey(provider: 'anthropic' | 'openai' | 'openrouter' | 'gateway', key: string, orgId?: string): Promise<void>;
    /**
     * Get a specific API key
     */
    getApiKey(provider: 'anthropic' | 'openai' | 'openrouter' | 'gateway'): Promise<{
        key: string;
        orgId?: string;
    }>;
    /**
     * Clear all stored API keys
     */
    clearAllKeys(): Promise<void>;
    /**
     * Test if an API key is stored and valid format
     */
    testApiKey(provider: 'anthropic' | 'openai' | 'openrouter' | 'gateway'): Promise<boolean>;
    /**
     * Check if secure storage is available on this system
     */
    isAvailable(): boolean;
}
