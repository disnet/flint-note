import { BaseStorageService } from './storage-service';

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
}
