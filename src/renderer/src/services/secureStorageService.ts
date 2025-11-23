import type { AIProvider } from '../config/models';

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

  async storeApiKey(provider: AIProvider, key: string, orgId?: string): Promise<void> {
    try {
      await window.api.storeApiKey({ provider, key, orgId });
    } catch (error) {
      console.error(`Failed to store ${provider} API key:`, error);
      throw error;
    }
  }

  async getApiKey(provider: AIProvider): Promise<{ key: string; orgId?: string }> {
    try {
      return await window.api.getApiKey({ provider });
    } catch (error) {
      console.error(`Failed to get ${provider} API key:`, error);
      return { key: '' };
    }
  }

  async getAllApiKeys(): Promise<{
    openrouter: string;
    anthropic: string;
  }> {
    try {
      return await window.api.getAllApiKeys();
    } catch (error) {
      console.error('Failed to get all API keys:', error);
      return {
        openrouter: '',
        anthropic: ''
      };
    }
  }

  async testApiKey(provider: AIProvider): Promise<boolean> {
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
  }
}

export const secureStorageService = SecureStorageService.getInstance();
