import type { Message } from '../types/chat';
import type {
  LLMMessage,
  LLMConfig,
  LLMResponse,
  LLMConnectionTest,
  LLMResponseWithToolCalls
} from '../../../shared/types';

export interface LLMClientEvents {
  ready: () => void;
  error: (error: Error) => void;
  statusChanged: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  configUpdated: (config: LLMConfig) => void;
  connectionTest: (connected: boolean) => void;
}

export class LLMClient {
  private api: typeof window.api.llm;
  private eventListeners: Map<keyof LLMClientEvents, Set<(...args: any[]) => void>> =
    new Map();
  private status: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.api = window.api?.llm;
    if (!this.api) {
      throw new Error('LLM API not available. Make sure the preload script is loaded.');
    }
    this.initEventListeners();
  }

  private initEventListeners(): void {
    const eventTypes: (keyof LLMClientEvents)[] = [
      'ready',
      'error',
      'statusChanged',
      'configUpdated',
      'connectionTest'
    ];

    eventTypes.forEach((eventType) => {
      this.eventListeners.set(eventType, new Set());
    });
  }

  // Event system
  on<T extends keyof LLMClientEvents>(
    event: T,
    listener: LLMClientEvents[T]
  ): () => void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener);
    }

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }

  private emit<T extends keyof LLMClientEvents>(
    event: T,
    ...args: Parameters<LLMClientEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      });
    }
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChanged', status);

      if (status === 'connected') {
        this.emit('ready');
      }
    }
  }

  getStatus(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    return this.status;
  }

  // Initialize the LLM client
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.setStatus('connecting');
      console.log('🔄 Initializing LLM client...');

      // Test connection to determine if we're ready
      const isConnected = await this.testConnection();

      if (isConnected) {
        this.setStatus('connected');
        this.isInitialized = true;
        console.log('✅ LLM client initialized and connected');
      } else {
        this.setStatus('disconnected');
        this.isInitialized = true;
        console.log('⚠️ LLM client initialized but not connected');
      }
    } catch (error) {
      console.error('❌ Failed to initialize LLM client:', error);
      this.setStatus('error');
      this.isInitialized = true;
      this.emit('error', error as Error);
    }
  }

  // Wait for LLM client to be ready
  async waitForReady(): Promise<void> {
    if (this.isInitialized && this.status === 'connected') {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.status === 'connected') {
        return;
      }
    }

    return new Promise((resolve, reject) => {
      if (this.status === 'connected') {
        resolve();
        return;
      }

      const unsubscribeReady = this.on('ready', () => {
        unsubscribeReady();
        unsubscribeError();
        resolve();
      });

      const unsubscribeError = this.on('error', (error) => {
        unsubscribeReady();
        unsubscribeError();
        reject(error);
      });

      // Start initialization if not already started
      if (!this.initializationPromise) {
        this.initialize();
      }
    });
  }

  isReady(): boolean {
    return this.isInitialized && this.status === 'connected';
  }

  async generateResponse(messages: Message[]): Promise<string> {
    try {
      const llmMessages = this.convertToLLMMessages(messages);
      const response = (await this.api.generateResponse(llmMessages)) as LLMResponse;

      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to generate response');
      }

      // If generation succeeds, we're connected
      if (this.status !== 'connected') {
        this.setStatus('connected');
      }

      return response.data || '';
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  async streamResponse(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const llmMessages = this.convertToLLMMessages(messages);

      // Set up event listeners
      this.api.onStreamChunk(onChunk);
      this.api.onStreamEnd((fullResponse: string) => {
        // If streaming succeeds, we're connected
        if (this.status !== 'connected') {
          this.setStatus('connected');
        }
        onComplete(fullResponse);
      });
      this.api.onStreamError((error: string) => {
        this.setStatus('error');
        this.emit('error', new Error(error));
        onError(error);
      });

      const response = (await this.api.streamResponse(llmMessages)) as LLMResponse;

      if (!response.success) {
        this.setStatus('error');
        onError(response.error || 'Failed to stream response');
      }
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      onError(error.message || 'Unknown streaming error');
    }
  }

  async streamResponseWithToolCalls(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onComplete: (response: LLMResponseWithToolCalls) => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const llmMessages = this.convertToLLMMessages(messages);

      // Set up event listeners
      this.api.onStreamChunk(onChunk);
      this.api.onStreamEndWithTools((response: LLMResponseWithToolCalls) => {
        // If streaming succeeds, we're connected
        if (this.status !== 'connected') {
          this.setStatus('connected');
        }
        onComplete(response);
      });
      this.api.onStreamError((error: string) => {
        this.setStatus('error');
        this.emit('error', new Error(error));
        onError(error);
      });

      const response = (await this.api.streamResponseWithTools(llmMessages)) as {
        success: boolean;
        result?: LLMResponseWithToolCalls;
        error?: string;
      };

      if (!response.success) {
        this.setStatus('error');
        onError(response.error || 'Failed to stream response with tools');
      }
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      onError(error.message || 'Unknown streaming error');
    }
  }

  async getFinalResponseAfterTools(
    originalMessages: Message[],
    toolCallInfos: any[]
  ): Promise<string> {
    try {
      const llmMessages = this.convertToLLMMessages(originalMessages);
      const response = (await this.api.getFinalResponseAfterTools(llmMessages, toolCallInfos)) as {
        success: boolean;
        response?: string;
        error?: string;
      };

      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to get final response after tools');
      }

      // If generation succeeds, we're connected
      if (this.status !== 'connected') {
        this.setStatus('connected');
      }

      return response.response || '';
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  stopStreaming(): void {
    this.api.removeStreamListeners();
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('🔍 Testing LLM connection...');
      const result = (await this.api.testConnection()) as LLMConnectionTest;
      const connected = result.success && result.connected;

      console.log(
        `🔍 LLM connection test result: ${connected ? 'connected' : 'disconnected'}`
      );

      // Update status based on connection test
      if (connected) {
        this.setStatus('connected');
      } else {
        this.setStatus('disconnected');
      }

      this.emit('connectionTest', connected);
      return connected;
    } catch (error) {
      console.error('❌ LLM connection test failed:', error);
      this.setStatus('error');
      this.emit('error', error as Error);
      this.emit('connectionTest', false);
      return false;
    }
  }

  async updateConfig(config: Partial<LLMConfig>): Promise<void> {
    try {
      console.log('🔧 Updating LLM configuration...');
      const response = (await this.api.updateConfig(config)) as LLMResponse;

      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to update config');
      }

      // Get the full config after update
      const fullConfig = await this.getConfig();
      this.emit('configUpdated', fullConfig);

      console.log('✅ LLM configuration updated');

      // Test connection after config update
      setTimeout(() => {
        this.testConnection();
      }, 500);
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  async getConfig(): Promise<LLMConfig> {
    try {
      const response = (await this.api.getConfig()) as {
        success: boolean;
        config?: LLMConfig;
        error?: string;
      };

      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to get config');
      }

      return response.config!;
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  // Convenience method to refresh connection status
  async refresh(): Promise<void> {
    await this.testConnection();
  }

  private convertToLLMMessages(messages: Message[]): LLMMessage[] {
    return messages.map((msg): LLMMessage => {
      let role: 'system' | 'user' | 'assistant' | 'tool';

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
        case 'tool':
          role = 'tool';
          break;
        default:
          role = 'user'; // fallback
      }

      const llmMessage: LLMMessage = {
        role,
        content: msg.content
      };

      // Add tool calls if present
      if (msg.metadata?.toolCalls) {
        llmMessage.tool_calls = msg.metadata.toolCalls;
      }

      // Add tool call ID if present
      if (msg.metadata?.toolCallId) {
        llmMessage.tool_call_id = msg.metadata.toolCallId;
      }

      return llmMessage;
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
