export declare class SecureStorageService {
    private static instance;
    static getInstance(): SecureStorageService;
    isAvailable(): Promise<boolean>;
    storeApiKey(provider: 'anthropic' | 'openai' | 'gateway', key: string, orgId?: string): Promise<void>;
    getApiKey(provider: 'anthropic' | 'openai' | 'gateway'): Promise<{
        key: string;
        orgId?: string;
    }>;
    getAllApiKeys(): Promise<{
        anthropic: string;
        openai: string;
        openaiOrgId: string;
        gateway: string;
    }>;
    testApiKey(provider: 'anthropic' | 'openai' | 'gateway'): Promise<boolean>;
    clearAllApiKeys(): Promise<void>;
    validateApiKey(provider: 'anthropic' | 'openai' | 'gateway', key: string): boolean;
}
export declare const secureStorageService: SecureStorageService;
