export type AIProvider = 'openrouter' | 'anthropic';

export interface ModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  icon: string;
  contextLength: number;
  recommendedMaxConversation: number; // 70% of context length
  recommended?: boolean;
  description?: string;
  mode?: 'normal' | 'plus-ultra'; // Abstract mode for provider-agnostic selection
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  // OpenRouter - Anthropic Claude Models (via OpenRouter)
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Normal',
    provider: 'openrouter',
    icon: '⚡',
    contextLength: 200000,
    recommendedMaxConversation: 140000,
    recommended: true,
    mode: 'normal',
    description: 'What you should use most of the time - fast and capable'
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Plus Ultra',
    provider: 'openrouter',
    icon: '🧠',
    contextLength: 200000,
    recommendedMaxConversation: 140000,
    mode: 'plus-ultra',
    description: 'When you need Flint to think really hard - slow and expensive'
  },

  // Anthropic Direct - Claude Models
  {
    id: 'claude-haiku-4-5-latest',
    name: 'Normal',
    provider: 'anthropic',
    icon: '⚡',
    contextLength: 200000,
    recommendedMaxConversation: 140000,
    recommended: true,
    mode: 'normal',
    description: 'What you should use most of the time - fast and capable'
  },
  {
    id: 'claude-sonnet-4-5-latest',
    name: 'Plus Ultra',
    provider: 'anthropic',
    icon: '🧠',
    contextLength: 200000,
    recommendedMaxConversation: 140000,
    mode: 'plus-ultra',
    description: 'When you need Flint to think really hard - slow and expensive'
  }
];

export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

export function getModelById(id: string): ModelInfo | undefined {
  return SUPPORTED_MODELS.find((model) => model.id === id);
}

export function getModelsByProvider(provider?: AIProvider): ModelInfo[] {
  if (!provider) {
    return SUPPORTED_MODELS;
  }
  return SUPPORTED_MODELS.filter((model) => model.provider === provider);
}

export function getModelsByMode(mode: 'normal' | 'plus-ultra'): ModelInfo[] {
  return SUPPORTED_MODELS.filter((model) => model.mode === mode);
}

/**
 * Get the default model for a specific provider and mode
 */
export function getDefaultModelForProvider(
  provider: AIProvider,
  mode: 'normal' | 'plus-ultra' = 'normal'
): ModelInfo | undefined {
  const providerModels = getModelsByProvider(provider);
  return providerModels.find((m) => m.mode === mode && m.recommended);
}

/**
 * When switching providers, map the current model to the equivalent model
 * on the new provider (preserving the normal/plus-ultra mode)
 */
export function mapModelToProvider(
  currentModelId: string,
  targetProvider: AIProvider
): ModelInfo | undefined {
  const currentModel = getModelById(currentModelId);
  if (!currentModel) {
    // If current model not found, return default for target provider
    return getDefaultModelForProvider(targetProvider, 'normal');
  }

  // If already on the target provider, return current model
  if (currentModel.provider === targetProvider) {
    return currentModel;
  }

  // Find equivalent model on target provider with same mode
  const mode = currentModel.mode || 'normal';
  return getDefaultModelForProvider(targetProvider, mode);
}
