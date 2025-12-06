import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseStorageService } from './storage-service';
import { logger } from './logger';

/**
 * Window state for persistence across app restarts
 */
export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/**
 * Storage service for global application settings that are not vault-specific.
 * Manages files in the settings/ directory under userData.
 */
export class SettingsStorageService extends BaseStorageService {
  private readonly settingsDir: string;

  constructor() {
    super();
    this.settingsDir = this.getStoragePath('settings');
  }

  /**
   * Initialize the settings storage directory
   */
  async initialize(): Promise<void> {
    await this.ensureDirectory(this.settingsDir);
  }

  /**
   * Load app settings from file
   */
  async loadAppSettings<T>(defaultValue: T): Promise<T> {
    const filePath = this.getStoragePath('settings', 'app-settings.json');
    return await this.readJsonFile(filePath, defaultValue);
  }

  /**
   * Save app settings to file
   */
  async saveAppSettings<T>(settings: T): Promise<void> {
    const filePath = this.getStoragePath('settings', 'app-settings.json');
    await this.writeJsonFile(filePath, settings);
  }

  /**
   * Load model preference from file
   */
  async loadModelPreference(): Promise<string | null> {
    const filePath = this.getStoragePath('settings', 'model-preferences.json');
    const data = await this.readJsonFile<{ selectedModel: string | null }>(filePath, {
      selectedModel: null
    });
    return data.selectedModel;
  }

  /**
   * Save model preference to file
   */
  async saveModelPreference(modelId: string): Promise<void> {
    const filePath = this.getStoragePath('settings', 'model-preferences.json');
    await this.writeJsonFile(filePath, { selectedModel: modelId });
  }

  /**
   * Load sidebar state from file
   */
  async loadSidebarState(): Promise<boolean> {
    const filePath = this.getStoragePath('settings', 'sidebar-state.json');
    const data = await this.readJsonFile<{ collapsed: boolean }>(filePath, {
      collapsed: false
    });
    return data.collapsed;
  }

  /**
   * Save sidebar state to file
   */
  async saveSidebarState(collapsed: boolean): Promise<void> {
    const filePath = this.getStoragePath('settings', 'sidebar-state.json');
    await this.writeJsonFile(filePath, { collapsed });
  }

  /**
   * Load window state from file
   */
  async loadWindowState(): Promise<WindowState | null> {
    const filePath = this.getStoragePath('settings', 'window-state.json');
    return await this.readJsonFile<WindowState | null>(filePath, null);
  }

  /**
   * Save window state to file
   */
  async saveWindowState(state: WindowState): Promise<void> {
    const filePath = this.getStoragePath('settings', 'window-state.json');
    await this.writeJsonFile(filePath, state);
  }

  /**
   * Save window state synchronously (for use in close handlers where async may not complete)
   */
  saveWindowStateSync(state: WindowState): void {
    const filePath = this.getStoragePath('settings', 'window-state.json');
    try {
      // Ensure directory exists
      const parentDir = join(filePath, '..');
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
      logger.debug('Saved window state synchronously', { filePath });
    } catch (error) {
      logger.error('Failed to save window state synchronously', { error });
    }
  }
}
