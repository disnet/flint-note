import { safeStorage } from 'electron';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export interface SecureData {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiOrgId?: string;
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
      console.log('Secure data stored successfully');
    } catch (error) {
      console.error('Failed to store secure data:', error);
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
      console.error('Failed to retrieve secure data:', error);
      // Return empty data on error rather than throwing
      return {};
    }
  }

  /**
   * Update a specific API key
   */
  async updateApiKey(
    provider: 'anthropic' | 'openai',
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
      }

      await this.storeSecureData(updatedData);
    } catch (error) {
      console.error(`Failed to update ${provider} API key:`, error);
      throw error;
    }
  }

  /**
   * Get a specific API key
   */
  async getApiKey(
    provider: 'anthropic' | 'openai'
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
      }

      return { key: '' };
    } catch (error) {
      console.error(`Failed to get ${provider} API key:`, error);
      return { key: '' };
    }
  }

  /**
   * Clear all stored API keys
   */
  async clearAllKeys(): Promise<void> {
    try {
      await this.storeSecureData({});
      console.log('All API keys cleared');
    } catch (error) {
      console.error('Failed to clear API keys:', error);
      throw error;
    }
  }

  /**
   * Test if an API key is stored and valid format
   */
  async testApiKey(provider: 'anthropic' | 'openai'): Promise<boolean> {
    try {
      const { key } = await this.getApiKey(provider);

      if (provider === 'anthropic') {
        return key.startsWith('sk-ant-') && key.length > 20;
      } else if (provider === 'openai') {
        return key.startsWith('sk-') && key.length > 20;
      }

      return false;
    } catch (error) {
      console.error(`Failed to test ${provider} API key:`, error);
      return false;
    }
  }

  /**
   * Check if secure storage is available on this system
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }
}
