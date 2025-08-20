export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  contextLength?: number;
  costPerMTokens?: {
    input: number;
    output: number;
    cached?: number;
  };
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  // OpenAI Models
  // {
  //   id: 'openai/gpt-5',
  //   name: 'GPT-5 Chat',
  //   provider: 'OpenAI',
  //   icon: '🤖',
  //   contextLength: 400000,
  //   costPerMTokens: { input: 1.25, output: 10.0, cached: 0.13 }
  // },

  // Anthropic Claude Models
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude 4 Sonnet',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPerMTokens: { input: 3.0, output: 15.0, cached: 0.3 }
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPerMTokens: { input: 0.8, output: 4.0, cached: 0.08 }
  }
];

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';

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
