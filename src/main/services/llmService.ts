import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { BaseMessage } from '@langchain/core/messages';

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

export class LLMService {
  private llm: ChatOpenAI;
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      baseURL: config.baseURL || 'http://localhost:1234/v1',
      apiKey: config.apiKey || 'lm-studio',
      modelName: config.modelName || 'local-model',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2048,
      ...config
    };

    this.llm = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL
      },
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });
  }

  async generateResponse(messages: LLMMessage[]): Promise<string> {
    try {
      const langchainMessages = this.convertToLangChainMessages(messages);
      const response = await this.llm.invoke(langchainMessages);
      return response.content as string;
    } catch (error) {
      console.error('Error generating LLM response:', error);
      throw new Error(
        `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async streamResponse(messages: LLMMessage[], onChunk: (chunk: string) => void): Promise<void> {
    try {
      const langchainMessages = this.convertToLangChainMessages(messages);
      const stream = await this.llm.stream(langchainMessages);

      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          onChunk(content);
        }
      }
    } catch (error) {
      console.error('Error streaming LLM response:', error);
      throw new Error(
        `Failed to stream response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private convertToLangChainMessages(messages: LLMMessage[]): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          throw new Error(`Unknown message role: ${msg.role}`);
      }
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const testMessages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Hello, please respond with just "OK" to confirm the connection.'
        }
      ];

      const response = await this.generateResponse(testMessages);
      return response.toLowerCase().includes('ok');
    } catch (error) {
      console.error('LLM connection test failed:', error);
      return false;
    }
  }

  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Recreate the LLM instance with new config
    this.llm = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL
      },
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

// Default system prompt for Flint
export const FLINT_SYSTEM_PROMPT = `You are Flint, an AI assistant designed to help with note-taking and knowledge management. You are integrated into a chat-first interface where users can:

1. Create and manage notes using commands like /create, /find, /update
2. Reference notes using [[Note Title]] syntax
3. Switch between different vaults/notebooks
4. Brainstorm ideas and organize thoughts

Key capabilities:
- Help users create, find, and organize notes
- Provide contextual assistance based on existing notes
- Support markdown formatting in responses
- Reference related notes using [[Note Title]] syntax
- Assist with brainstorming and idea development
- Generate templates and structured content

Be conversational, helpful, and focused on productivity. When users mention notes or want to work with their knowledge base, actively suggest using note references with [[Note Title]] syntax.`;
