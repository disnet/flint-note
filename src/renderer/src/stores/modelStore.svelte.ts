import { DEFAULT_MODEL, getModelById } from '../config/models';
import type { ModelInfo } from '../config/models';

const STORAGE_KEY = 'flint-selected-model';

function getStoredModel(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Validate that the stored model still exists in our config
      const modelInfo = getModelById(stored);
      if (modelInfo) {
        return stored;
      }
    }
  }
  return DEFAULT_MODEL;
}

function setStoredModel(modelId: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, modelId);
  }
}

// Reactive model state using Svelte 5 runes
let selectedModel = $state(getStoredModel());
const currentModelInfo = $derived(
  getModelById(selectedModel) || getModelById(DEFAULT_MODEL)!
);

export function getSelectedModel(): string {
  return selectedModel;
}

export function getCurrentModelInfo(): ModelInfo {
  return currentModelInfo;
}

export function setSelectedModel(modelId: string): void {
  const modelInfo = getModelById(modelId);
  if (!modelInfo) {
    console.warn(`Model ${modelId} not found, keeping current selection`);
    return;
  }

  selectedModel = modelId;
  setStoredModel(modelId);
}

// Export reactive stores for components
export const modelStore = {
  get selectedModel() {
    return selectedModel;
  },
  get currentModelInfo() {
    return currentModelInfo;
  },
  setSelectedModel
};
