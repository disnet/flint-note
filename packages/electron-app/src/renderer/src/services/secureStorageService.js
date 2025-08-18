// Service for interacting with secure storage through IPC
export class SecureStorageService {
    static instance;
    static getInstance() {
        if (!SecureStorageService.instance) {
            SecureStorageService.instance = new SecureStorageService();
        }
        return SecureStorageService.instance;
    }
    async isAvailable() {
        try {
            return await window.api.secureStorageAvailable();
        }
        catch (error) {
            console.error('Failed to check secure storage availability:', error);
            return false;
        }
    }
    async storeApiKey(provider, key, orgId) {
        try {
            await window.api.storeApiKey({ provider, key, orgId });
        }
        catch (error) {
            console.error(`Failed to store ${provider} API key:`, error);
            throw error;
        }
    }
    async getApiKey(provider) {
        try {
            return await window.api.getApiKey({ provider });
        }
        catch (error) {
            console.error(`Failed to get ${provider} API key:`, error);
            return { key: '' };
        }
    }
    async getAllApiKeys() {
        try {
            return await window.api.getAllApiKeys();
        }
        catch (error) {
            console.error('Failed to get all API keys:', error);
            return {
                anthropic: '',
                openai: '',
                openaiOrgId: '',
                gateway: ''
            };
        }
    }
    async testApiKey(provider) {
        try {
            return await window.api.testApiKey({ provider });
        }
        catch (error) {
            console.error(`Failed to test ${provider} API key:`, error);
            return false;
        }
    }
    async clearAllApiKeys() {
        try {
            await window.api.clearApiKeys();
        }
        catch (error) {
            console.error('Failed to clear API keys:', error);
            throw error;
        }
    }
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
}
export const secureStorageService = SecureStorageService.getInstance();
