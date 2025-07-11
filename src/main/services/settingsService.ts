import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { LLMConfig } from '../../shared/types';

export interface AppSettings {
  llm: LLMConfig;
  mcpToolsEnabled: boolean;
  maxToolsLimit: number;
  // Future settings can be added here
}

export class SettingsService {
  private settingsPath: string;
  private settings: AppSettings;

  constructor() {
    // Store settings in user data directory
    this.settingsPath = join(app.getPath('userData'), 'flint-settings.json');

    // Default settings
    this.settings = {
      llm: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: '',
        modelName: 'anthropic/claude-3.5-haiku',
        temperature: 0.7,
        maxTokens: 2048
      },
      mcpToolsEnabled: true,
      maxToolsLimit: 7
    };
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf-8');
      const loadedSettings = JSON.parse(data);

      // Merge with defaults to ensure all required fields exist
      this.settings = {
        ...this.settings,
        ...loadedSettings,
        llm: {
          ...this.settings.llm,
          ...loadedSettings.llm
        }
      };

      console.log('✅ Settings loaded from:', this.settingsPath);
      return this.settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('📝 No settings file found, using defaults');
        // Save defaults to create the file
        await this.saveSettings();
        return this.settings;
      }

      console.error('❌ Error loading settings:', error);
      // Return defaults if loading fails
      return this.settings;
    }
  }

  async saveSettings(): Promise<void> {
    try {
      // Ensure the directory exists
      await fs.mkdir(join(this.settingsPath, '..'), { recursive: true });

      await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
      console.log('✅ Settings saved to:', this.settingsPath);
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      throw error;
    }
  }

  getLLMConfig(): LLMConfig {
    return { ...this.settings.llm };
  }

  async updateLLMConfig(config: Partial<LLMConfig>): Promise<void> {
    this.settings.llm = { ...this.settings.llm, ...config };
    await this.saveSettings();
  }

  getMCPToolsEnabled(): boolean {
    return this.settings.mcpToolsEnabled;
  }

  async setMCPToolsEnabled(enabled: boolean): Promise<void> {
    this.settings.mcpToolsEnabled = enabled;
    await this.saveSettings();
  }

  getMaxToolsLimit(): number {
    return this.settings.maxToolsLimit;
  }

  async setMaxToolsLimit(limit: number): Promise<void> {
    this.settings.maxToolsLimit = limit;
    await this.saveSettings();
  }

  getAllSettings(): AppSettings {
    return { ...this.settings };
  }

  async updateAllSettings(newSettings: Partial<AppSettings>): Promise<void> {
    this.settings = {
      ...this.settings,
      ...newSettings,
      llm: {
        ...this.settings.llm,
        ...(newSettings.llm || {})
      }
    };
    await this.saveSettings();
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }
}

// Create singleton instance
export const settingsService = new SettingsService();
