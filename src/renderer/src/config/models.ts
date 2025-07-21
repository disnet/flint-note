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
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 16385,
    costPer1kTokens: { input: 0.0015, output: 0.002 }
  },
  {
    id: 'openai/gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 8192,
    costPer1kTokens: { input: 0.03, output: 0.06 }
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 }
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    icon: '🤖',
    contextLength: 128000,
    costPer1kTokens: { input: 0.005, output: 0.015 }
  },

  // Anthropic Claude Models
  {
    id: 'anthropic/claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.00025, output: 0.00125 }
  },
  {
    id: 'anthropic/claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 }
  },
  {
    id: 'anthropic/claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.015, output: 0.075 }
  },
  {
    id: 'anthropic/claude-3.5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    icon: '🧠',
    contextLength: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 }
  },

  // Google Gemini Models
  {
    id: 'google/gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    icon: '💎',
    contextLength: 32768,
    costPer1kTokens: { input: 0.0005, output: 0.0015 }
  },
  {
    id: 'google/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    icon: '💎',
    contextLength: 1000000,
    costPer1kTokens: { input: 0.0035, output: 0.0105 }
  },

  // Meta Llama Models
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    icon: '🦙',
    contextLength: 131072,
    costPer1kTokens: { input: 0.00018, output: 0.00018 }
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    icon: '🦙',
    contextLength: 131072,
    costPer1kTokens: { input: 0.00088, output: 0.00088 }
  },
  {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'Meta',
    icon: '🦙',
    contextLength: 131072,
    costPer1kTokens: { input: 0.0054, output: 0.016 }
  },

  // Mistral Models
  {
    id: 'mistralai/mistral-7b-instruct',
    name: 'Mistral 7B',
    provider: 'Mistral',
    icon: '🌪️',
    contextLength: 32768,
    costPer1kTokens: { input: 0.00015, output: 0.00015 }
  },
  {
    id: 'mistralai/mixtral-8x7b-instruct',
    name: 'Mixtral 8x7B',
    provider: 'Mistral',
    icon: '🌪️',
    contextLength: 32768,
    costPer1kTokens: { input: 0.00024, output: 0.00024 }
  },
  {
    id: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mixtral 8x22B',
    provider: 'Mistral',
    icon: '🌪️',
    contextLength: 65536,
    costPer1kTokens: { input: 0.00065, output: 0.00065 }
  }
];

export const DEFAULT_MODEL = 'openai/gpt-4';

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
