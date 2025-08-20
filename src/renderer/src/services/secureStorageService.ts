// Service for interacting with secure storage through IPC
export class SecureStorageService {
  private static instance: SecureStorageService;

  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await window.api.secureStorageAvailable();
    } catch (error) {
      console.error('Failed to check secure storage availability:', error);
      return false;
    }
  }

  async storeApiKey(provider: 'openrouter', key: string, orgId?: string): Promise<void> {
    try {
      await window.api.storeApiKey({ provider, key, orgId });
    } catch (error) {
      console.error(`Failed to store ${provider} API key:`, error);
      throw error;
    }
  }

  async getApiKey(provider: 'openrouter'): Promise<{ key: string; orgId?: string }> {
    try {
      return await window.api.getApiKey({ provider });
    } catch (error) {
      console.error(`Failed to get ${provider} API key:`, error);
      return { key: '' };
    }
  }

  async getAllApiKeys(): Promise<{
    openrouter: string;
  }> {
    try {
      return await window.api.getAllApiKeys();
    } catch (error) {
      console.error('Failed to get all API keys:', error);
      return {
        openrouter: ''
      };
    }
  }

  async testApiKey(provider: 'openrouter'): Promise<boolean> {
    try {
      return await window.api.testApiKey({ provider });
    } catch (error) {
      console.error(`Failed to test ${provider} API key:`, error);
      return false;
    }
  }

  async clearAllApiKeys(): Promise<void> {
    try {
      await window.api.clearApiKeys();
    } catch (error) {
      console.error('Failed to clear API keys:', error);
      throw error;
    }
  }

  validateApiKey(provider: 'openrouter', key: string): boolean {
    if (provider === 'openrouter') {
      return key.startsWith('sk-') && key.length > 20; // OpenRouter keys start with sk-
    }
    return false;
  }
}

export const secureStorageService = SecureStorageService.getInstance();
