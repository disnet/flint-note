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
    name: 'Claude 4.5 Haiku',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    recommendedMaxConversation: 140000, // 70% of 200k
    recommended: true,
    description: 'Fast and efficient - best for most tasks'
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude 4.5 Sonnet',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    recommendedMaxConversation: 140000, // 70% of 200k
    description: 'Advanced reasoning - only use when you need deeper thinking'
  },

  // OpenAI Models
  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 400000,
    recommendedMaxConversation: 280000, // 70% of 400k
    description: 'Advanced reasoning - only use when you need deeper thinking'
  },
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 400000,
    recommendedMaxConversation: 280000, // 70% of 400k
    description: 'Fast and efficient - best for most tasks'
  },
  // Google Models
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    icon: '🤖',
    contextLength: 1048576,
    recommendedMaxConversation: 7340032, // 70% of 1048576
    description: 'Advanced reasoning - only use when you need deeper thinking'
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    icon: '🤖',
    contextLength: 1048576,
    recommendedMaxConversation: 7340032, // 70% of 1048576
    description: 'Fast and efficient - best for most tasks'
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
