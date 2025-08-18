import { safeStorage } from 'electron';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { logger } from './logger';
export class SecureStorageService {
    storageDir;
    storageFile;
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
    async storeSecureData(data) {
        try {
            // Check if safeStorage is available
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error('Encryption is not available on this system');
            }
            const jsonData = JSON.stringify(data);
            const encrypted = safeStorage.encryptString(jsonData);
            writeFileSync(this.storageFile, encrypted);
            logger.info('Secure data stored successfully', { storageFile: this.storageFile });
        }
        catch (error) {
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
    async retrieveSecureData() {
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
            return JSON.parse(decrypted);
        }
        catch (error) {
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
    async updateApiKey(provider, key, orgId) {
        try {
            const existingData = await this.retrieveSecureData();
            const updatedData = { ...existingData };
            if (provider === 'anthropic') {
                updatedData.anthropicApiKey = key || undefined;
            }
            else if (provider === 'openai') {
                updatedData.openaiApiKey = key || undefined;
                if (orgId !== undefined) {
                    updatedData.openaiOrgId = orgId || undefined;
                }
            }
            else if (provider === 'openrouter') {
                updatedData.openrouterApiKey = key || undefined;
            }
            else if (provider === 'gateway') {
                updatedData.gatewayApiKey = key || undefined;
            }
            await this.storeSecureData(updatedData);
        }
        catch (error) {
            logger.error('Failed to update API key', { provider, error });
            throw error;
        }
    }
    /**
     * Get a specific API key
     */
    async getApiKey(provider) {
        try {
            const data = await this.retrieveSecureData();
            if (provider === 'anthropic') {
                return {
                    key: data.anthropicApiKey || '',
                    orgId: undefined
                };
            }
            else if (provider === 'openai') {
                return {
                    key: data.openaiApiKey || '',
                    orgId: data.openaiOrgId || undefined
                };
            }
            else if (provider === 'openrouter') {
                return {
                    key: data.openrouterApiKey || '',
                    orgId: undefined
                };
            }
            else if (provider === 'gateway') {
                return {
                    key: data.gatewayApiKey || '',
                    orgId: undefined
                };
            }
            return { key: '' };
        }
        catch (error) {
            logger.error('Failed to get API key', { provider, error });
            return { key: '' };
        }
    }
    /**
     * Clear all stored API keys
     */
    async clearAllKeys() {
        try {
            await this.storeSecureData({});
            logger.info('All API keys cleared');
        }
        catch (error) {
            logger.error('Failed to clear API keys', { error });
            throw error;
        }
    }
    /**
     * Test if an API key is stored and valid format
     */
    async testApiKey(provider) {
        try {
            const { key } = await this.getApiKey(provider);
            if (provider === 'anthropic') {
                return key.startsWith('sk-ant-') && key.length > 20;
            }
            else if (provider === 'openai') {
                return key.startsWith('sk-') && key.length > 20;
            }
            else if (provider === 'openrouter') {
                return key.startsWith('sk-') && key.length > 20;
            }
            else if (provider === 'gateway') {
                return key.length > 10; // Gateway keys may have different formats
            }
            return false;
        }
        catch (error) {
            logger.error('Failed to test API key', { provider, error });
            return false;
        }
    }
    /**
     * Check if secure storage is available on this system
     */
    isAvailable() {
        return safeStorage.isEncryptionAvailable();
    }
}
