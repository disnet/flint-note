export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  contextLength?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  // OpenAI Models
  {
    id: 'openai/gpt-4.1',
    name: 'GPT-4.1',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 1047576,
    costPer1kTokens: { input: 0.002, output: 0.008 }
  },
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 1047576,
    costPer1kTokens: { input: 0.0004, output: 0.0016 }
  },

  // Anthropic Claude Models
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude 4 Sonnet',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 }
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.0008, output: 0.004 }
  }
];

export const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

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
