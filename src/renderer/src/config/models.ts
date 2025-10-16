export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  contextLength: number;
  recommendedMaxConversation: number; // 70% of context length
  recommended?: boolean;
  description?: string;
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  // Anthropic Claude Models
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Normal',
    provider: 'Anthropic',
    icon: '⚡',
    contextLength: 200000,
    recommendedMaxConversation: 140000, // 70% of 200k
    recommended: true,
    description: 'What you should use most of the time - fast and capable'
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Plus Ultra',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    recommendedMaxConversation: 140000, // 70% of 200k
    description: 'When you need Flint to think really hard - slow and expensive'
  }
];

export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

export function getModelById(id: string): ModelInfo | undefined {
  return SUPPORTED_MODELS.find((model) => model.id === id);
}

export function getModelsByProvider(): Record<string, ModelInfo[]> {
  return SUPPORTED_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, ModelInfo[]>
  );
}
