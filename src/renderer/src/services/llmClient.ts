import type { Message } from '../types/chat';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface LLMConnectionTest {
  success: boolean;
  connected: boolean;
  error?: string;
}

export class LLMClient {
  private api: typeof window.api.llm;

  constructor() {
    this.api = window.api?.llm;
    if (!this.api) {
      throw new Error('LLM API not available. Make sure the preload script is loaded.');
    }
  }

  async generateResponse(messages: Message[]): Promise<string> {
    const llmMessages = this.convertToLLMMessages(messages);
    const response: LLMResponse = await this.api.generateResponse(llmMessages);

    if (!response.success) {
      throw new Error(response.error || 'Failed to generate response');
    }

    return response.data || '';
  }

  async streamResponse(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    const llmMessages = this.convertToLLMMessages(messages);

    // Set up event listeners
    this.api.onStreamChunk(onChunk);
    this.api.onStreamEnd(onComplete);
    this.api.onStreamError(onError);

    try {
      const response: LLMResponse = await this.api.streamResponse(llmMessages);

      if (!response.success) {
        onError(response.error || 'Failed to stream response');
      }
    } catch (error) {
      onError(error.message || 'Unknown streaming error');
    }
  }

  stopStreaming(): void {
    this.api.removeStreamListeners();
  }

  async testConnection(): Promise<boolean> {
    try {
      const result: LLMConnectionTest = await this.api.testConnection();
      return result.success && result.connected;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async updateConfig(config: Partial<LLMConfig>): Promise<void> {
    const response: LLMResponse = await this.api.updateConfig(config);

    if (!response.success) {
      throw new Error(response.error || 'Failed to update config');
    }
  }

  async getConfig(): Promise<LLMConfig> {
    const response: { success: boolean; config?: LLMConfig; error?: string } =
      await this.api.getConfig();

    if (!response.success) {
      throw new Error(response.error || 'Failed to get config');
    }

    return response.config!;
  }

  private convertToLLMMessages(messages: Message[]): LLMMessage[] {
    return messages.map((msg): LLMMessage => {
      let role: 'system' | 'user' | 'assistant';

      switch (msg.type) {
        case 'system':
          role = 'system';
          break;
        case 'user':
          role = 'user';
          break;
        case 'agent':
          role = 'assistant';
          break;
        default:
          role = 'user'; // fallback
      }

      return {
        role,
        content: msg.content
      };
    });
  }

  // Helper method to create conversation history for context
  createConversationHistory(messages: Message[], maxMessages: number = 10): Message[] {
    // Filter out system messages for conversation context (they're handled separately)
    const conversationMessages = messages.filter((msg) => msg.type !== 'system');

    // Take the last N messages to keep context manageable
    return conversationMessages.slice(-maxMessages);
  }

  // Helper method to check if LLM is available
  isAvailable(): boolean {
    return !!this.api;
  }
}

// Export singleton instance
export const llmClient = new LLMClient();
