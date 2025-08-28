import { app } from 'electron';
import { join } from 'path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync
} from 'fs';
import { logger } from './logger';

/**
 * Base storage service providing common file operations for data persistence.
 * This service handles JSON serialization, directory management, and error handling.
 */
export class BaseStorageService {
  protected readonly userData: string;

  constructor() {
    this.userData = app.getPath('userData');
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  protected async ensureDirectory(dirPath: string): Promise<void> {
    try {
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        logger.debug('Created directory', { dirPath });
      }
    } catch (error) {
      logger.error('Failed to create directory', { dirPath, error });
      throw error;
    }
  }

  /**
   * Read and parse a JSON file, returning default value if file doesn't exist
   */
  protected async readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      if (!existsSync(filePath)) {
        logger.debug('File not found, using default value', { filePath });
        return defaultValue;
      }

      const fileContent = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      logger.debug('Successfully read JSON file', { filePath });
      return data as T;
    } catch (error) {
      logger.warn('Failed to read JSON file, using default value', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return defaultValue;
    }
  }

  /**
   * Write data to a JSON file with pretty formatting
   */
  protected async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    try {
      // Ensure parent directory exists
      const parentDir = join(filePath, '..');
      await this.ensureDirectory(parentDir);

      const jsonContent = JSON.stringify(data, null, 2);
      writeFileSync(filePath, jsonContent, 'utf-8');

      logger.debug('Successfully wrote JSON file', { filePath });
    } catch (error) {
      logger.error('Failed to write JSON file', { filePath, error });
      throw error;
    }
  }

  /**
   * Delete a file if it exists
   */
  protected async deleteFile(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        logger.debug('Successfully deleted file', { filePath });
      }
    } catch (error) {
      logger.error('Failed to delete file', { filePath, error });
      throw error;
    }
  }

  /**
   * List files in a directory, returning empty array if directory doesn't exist
   */
  protected async listFiles(dirPath: string): Promise<string[]> {
    try {
      if (!existsSync(dirPath)) {
        return [];
      }

      const files = readdirSync(dirPath);
      logger.debug('Listed files in directory', { dirPath, count: files.length });
      return files;
    } catch (error) {
      logger.error('Failed to list files in directory', { dirPath, error });
      return [];
    }
  }

  /**
   * Check if a file exists
   */
  protected fileExists(filePath: string): boolean {
    return existsSync(filePath);
  }

  /**
   * Get the full path for a storage directory
   */
  protected getStoragePath(...pathSegments: string[]): string {
    return join(this.userData, ...pathSegments);
  }
}
