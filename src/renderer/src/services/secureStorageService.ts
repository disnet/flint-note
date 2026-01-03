import type { AIProvider } from '../config/models';
import { isElectron } from '../lib/platform.svelte';

const API_KEYS_STORAGE_KEY = 'flint-api-keys';

// Service for interacting with secure storage through IPC
// In web mode, falls back to localStorage (less secure but functional)
export class SecureStorageService {
  private static instance: SecureStorageService;

  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  private getStoredKeys(): Record<string, { key: string; orgId?: string }> {
    try {
      const stored = localStorage.getItem(API_KEYS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private saveStoredKeys(keys: Record<string, { key: string; orgId?: string }>): void {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  }

  async isAvailable(): Promise<boolean> {
    if (isElectron()) {
      try {
        return await window.api.secureStorageAvailable();
      } catch (error) {
        console.error('Failed to check secure storage availability:', error);
        return false;
      }
    }
    // In web mode, we use localStorage (less secure, but functional)
    return true;
  }

  async storeApiKey(provider: AIProvider, key: string, orgId?: string): Promise<void> {
    if (isElectron()) {
      try {
        await window.api.storeApiKey({ provider, key, orgId });
      } catch (error) {
        console.error(`Failed to store ${provider} API key:`, error);
        throw error;
      }
    } else {
      // Web fallback: localStorage
      const stored = this.getStoredKeys();
      stored[provider] = { key, orgId };
      this.saveStoredKeys(stored);
    }
  }

  async getApiKey(provider: AIProvider): Promise<{ key: string; orgId?: string }> {
    if (isElectron()) {
      try {
        return await window.api.getApiKey({ provider });
      } catch (error) {
        console.error(`Failed to get ${provider} API key:`, error);
        return { key: '' };
      }
    } else {
      const stored = this.getStoredKeys();
      return stored[provider] || { key: '' };
    }
  }

  async getAllApiKeys(): Promise<{
    openrouter: string;
    anthropic: string;
  }> {
    if (isElectron()) {
      try {
        return await window.api.getAllApiKeys();
      } catch (error) {
        console.error('Failed to get all API keys:', error);
        return {
          openrouter: '',
          anthropic: ''
        };
      }
    } else {
      const stored = this.getStoredKeys();
      return {
        openrouter: stored.openrouter?.key || '',
        anthropic: stored.anthropic?.key || ''
      };
    }
  }

  async testApiKey(provider: AIProvider): Promise<boolean> {
    if (isElectron()) {
      try {
        return await window.api.testApiKey({ provider });
      } catch (error) {
        console.error(`Failed to test ${provider} API key:`, error);
        return false;
      }
    }
    // In web mode, we can't test the API key without the server
    return false;
  }

  async clearAllApiKeys(): Promise<void> {
    if (isElectron()) {
      try {
        await window.api.clearApiKeys();
      } catch (error) {
        console.error('Failed to clear API keys:', error);
        throw error;
      }
    } else {
      localStorage.removeItem(API_KEYS_STORAGE_KEY);
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
