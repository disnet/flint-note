import { DEFAULT_MODEL, getModelById } from '../config/models';
import type { ModelInfo } from '../config/models';

class ModelStore {
  private selectedModel = $state(DEFAULT_MODEL);
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

  /**
   * Ensure initialization is complete before operations
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize the store by loading data from file system
   */
  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      const storedModel = await window.api?.loadModelPreference();
      if (storedModel) {
        // Validate that the stored model still exists in our config
        const modelInfo = getModelById(storedModel);
        if (modelInfo) {
          this.selectedModel = storedModel;
        }
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
      await window.api?.saveModelPreference(modelId);
    } catch (error) {
      console.error('Failed to save model preference to storage:', error);
      // Could revert the change here, but for now we'll keep the UI updated
      throw error;
    }
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
  setSelectedModel: modelStoreInstance.setSelectedModel.bind(modelStoreInstance),
  ensureInitialized: modelStoreInstance.ensureInitialized.bind(modelStoreInstance)
};
