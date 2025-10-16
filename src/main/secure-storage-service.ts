import { safeStorage } from 'electron';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { logger } from './logger';

export interface SecureData {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiOrgId?: string;
  openrouterApiKey?: string;
}

export class SecureStorageService {
  private readonly storageDir: string;
  private readonly storageFile: string;

  constructor() {
    this.storageDir = join(app.getPath('userData'), 'secure');
    this.storageFile = join(this.storageDir, 'encrypted-data.bin');

    // Ensure storage directory exists
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Store secure data (API keys) encrypted on disk
   */
  async storeSecureData(data: SecureData): Promise<void> {
    try {
      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      const jsonData = JSON.stringify(data);
      const encrypted = safeStorage.encryptString(jsonData);

      writeFileSync(this.storageFile, encrypted);
      logger.info('Secure data stored successfully', { storageFile: this.storageFile });
    } catch (error) {
      logger.error('Failed to store secure data', {
        error,
        storageFile: this.storageFile
      });
      throw error;
    }
  }

  /**
   * Retrieve and decrypt secure data from disk
   */
  async retrieveSecureData(): Promise<SecureData> {
    try {
      if (!existsSync(this.storageFile)) {
        // Return empty data if no storage file exists
        return {};
      }

      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }

      const encrypted = readFileSync(this.storageFile);
      const decrypted = safeStorage.decryptString(encrypted);

      return JSON.parse(decrypted) as SecureData;
    } catch (error) {
      logger.error('Failed to retrieve secure data', {
        error,
        storageFile: this.storageFile
      });
      // Return empty data on error rather than throwing
      return {};
    }
  }

  /**
   * Update a specific API key
   */
  async updateApiKey(
    provider: 'anthropic' | 'openai' | 'openrouter',
    key: string,
    orgId?: string
  ): Promise<void> {
    try {
      const existingData = await this.retrieveSecureData();
      const updatedData = { ...existingData };

      if (provider === 'anthropic') {
        updatedData.anthropicApiKey = key || undefined;
      } else if (provider === 'openai') {
        updatedData.openaiApiKey = key || undefined;
        if (orgId !== undefined) {
          updatedData.openaiOrgId = orgId || undefined;
        }
      } else if (provider === 'openrouter') {
        updatedData.openrouterApiKey = key || undefined;
      }

      await this.storeSecureData(updatedData);
    } catch (error) {
      logger.error('Failed to update API key', { provider, error });
      throw error;
    }
  }

  /**
   * Get a specific API key
   */
  async getApiKey(
    provider: 'anthropic' | 'openai' | 'openrouter' | 'gateway'
  ): Promise<{ key: string; orgId?: string }> {
    try {
      const data = await this.retrieveSecureData();

      if (provider === 'anthropic') {
        return {
          key: data.anthropicApiKey || '',
          orgId: undefined
        };
      } else if (provider === 'openai') {
        return {
          key: data.openaiApiKey || '',
          orgId: data.openaiOrgId || undefined
        };
      } else if (provider === 'openrouter') {
        return {
          key: data.openrouterApiKey || '',
          orgId: undefined
        };
      }

      return { key: '' };
    } catch (error) {
      logger.error('Failed to get API key', { provider, error });
      return { key: '' };
    }
  }

  /**
   * Clear all stored API keys
   */
  async clearAllKeys(): Promise<void> {
    try {
      await this.storeSecureData({});
      logger.info('All API keys cleared');
    } catch (error) {
      logger.error('Failed to clear API keys', { error });
      throw error;
    }
  }

  /**
   * Test if an API key is stored and valid format
   */
  async testApiKey(
    provider: 'anthropic' | 'openai' | 'openrouter' | 'gateway'
  ): Promise<boolean> {
    try {
      const { key } = await this.getApiKey(provider);

      if (provider === 'anthropic') {
        return key.startsWith('sk-ant-') && key.length > 20;
      } else if (provider === 'openai') {
        return key.startsWith('sk-') && key.length > 20;
      } else if (provider === 'openrouter') {
        return key.startsWith('sk-') && key.length > 20;
      }

      return false;
    } catch (error) {
      logger.error('Failed to test API key', { provider, error });
      return false;
    }
  }

  /**
   * Check if secure storage is available on this system
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Fetch OpenRouter credits information
   */
  async getOpenRouterCredits(): Promise<{
    total_credits: number;
    used_credits: number;
    remaining_credits: number;
  } | null> {
    try {
      const { key } = await this.getApiKey('openrouter');

      if (!key || key.trim() === '') {
        logger.warn('No OpenRouter API key available for credits check');
        return null;
      }

      const response = await fetch('https://openrouter.ai/api/v1/credits', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://www.flintnote.com',
          'X-Title': 'Flint'
        }
      });

      if (!response.ok) {
        logger.error('Failed to fetch OpenRouter credits', {
          status: response.status,
          statusText: response.statusText
        });
        return null;
      }

      const data = (await response.json()) as {
        data?: {
          total_credits?: number;
          usage?: number;
          limit?: number | null;
        };
      };

      // OpenRouter returns: { data: { total_credits, usage, limit } }
      // We need to calculate remaining from total - usage
      if (!data.data) {
        logger.warn('Unexpected OpenRouter credits response format', { data });
        return null;
      }

      const totalCredits = data.data.total_credits || 0;
      const usedCredits = data.data.usage || 0;
      const remainingCredits = totalCredits - usedCredits;

      return {
        total_credits: totalCredits,
        used_credits: usedCredits,
        remaining_credits: remainingCredits
      };
    } catch (error) {
      logger.error('Failed to fetch OpenRouter credits', { error });
      return null;
    }
  }
}
