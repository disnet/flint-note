import { DEFAULT_MODEL, getModelById } from '../config/models';
import type { ModelInfo } from '../config/models';

class ModelStore {
  private selectedModel = $state(DEFAULT_MODEL);
  private _thinkingEnabled = $state(false);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  get currentSelectedModel(): string {
    return this.selectedModel;
  }

  get currentModelInfo(): ModelInfo {
    return getModelById(this.selectedModel) || getModelById(DEFAULT_MODEL)!;
  }

  get thinkingEnabled(): boolean {
    return this._thinkingEnabled;
  }

  /**
   * Ensure initialization is complete before operations
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize the store by loading data from file system or localStorage
   */
  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      let storedModel: string | undefined | null;
      if (window.api?.loadModelPreference) {
        storedModel = await window.api.loadModelPreference();
      } else {
        // Web fallback: localStorage
        storedModel = localStorage.getItem('flint-model-preference');
      }
      if (storedModel) {
        // Validate that the stored model still exists in our config
        const modelInfo = getModelById(storedModel);
        if (modelInfo) {
          this.selectedModel = storedModel;
        }
      }

      // Load thinking preference
      const storedThinking = localStorage.getItem('flint-thinking-enabled');
      if (storedThinking !== null) {
        this._thinkingEnabled = storedThinking === 'true';
      }
    } catch (error) {
      console.warn('Failed to load model preference from storage:', error);
      // Keep default model on error
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  /**
   * Set the selected model and persist to file system
   */
  async setSelectedModel(modelId: string): Promise<void> {
    await this.ensureInitialized();

    const modelInfo = getModelById(modelId);
    if (!modelInfo) {
      console.warn(`Model ${modelId} not found, keeping current selection`);
      return;
    }

    try {
      this.selectedModel = modelId;
      if (window.api?.saveModelPreference) {
        await window.api.saveModelPreference(modelId);
      } else {
        // Web fallback: localStorage
        localStorage.setItem('flint-model-preference', modelId);
      }
    } catch (error) {
      console.error('Failed to save model preference to storage:', error);
      // Could revert the change here, but for now we'll keep the UI updated
      throw error;
    }
  }

  /**
   * Toggle or set thinking mode and persist to localStorage
   */
  setThinkingEnabled(enabled: boolean): void {
    this._thinkingEnabled = enabled;
    localStorage.setItem('flint-thinking-enabled', String(enabled));
  }
}

// Create singleton instance
const modelStoreInstance = new ModelStore();

// Export functions for backward compatibility
export function getSelectedModel(): string {
  return modelStoreInstance.currentSelectedModel;
}

export function getCurrentModelInfo(): ModelInfo {
  return modelStoreInstance.currentModelInfo;
}

export async function setSelectedModel(modelId: string): Promise<void> {
  return await modelStoreInstance.setSelectedModel(modelId);
}

// Export reactive store for components
export const modelStore = {
  get selectedModel() {
    return modelStoreInstance.currentSelectedModel;
  },
  get currentModelInfo() {
    return modelStoreInstance.currentModelInfo;
  },
  get loading() {
    return modelStoreInstance.loading;
  },
  get initialized() {
    return modelStoreInstance.initialized;
  },
  get thinkingEnabled() {
    return modelStoreInstance.thinkingEnabled;
  },
  setSelectedModel: modelStoreInstance.setSelectedModel.bind(modelStoreInstance),
  setThinkingEnabled: modelStoreInstance.setThinkingEnabled.bind(modelStoreInstance),
  ensureInitialized: modelStoreInstance.ensureInitialized.bind(modelStoreInstance)
};
