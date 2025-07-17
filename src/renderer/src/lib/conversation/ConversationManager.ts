import { get } from 'svelte/store';
import { conversationStore } from './stores';
import { llmClient } from '../../services/llmClient';
import { mcpClient } from '../../services/mcpClient';
import type { Message } from '../../types/chat';
import type { LLMMessage } from '../../../../shared/types';

export class ConversationManager {
  async initialize(): Promise<void> {
    try {
      console.log('🔄 Initializing conversation manager...');

      // Try to initialize LLM client
      try {
        await llmClient.initialize();
        console.log('✅ LLM client initialized');
      } catch (error) {
        console.warn('⚠️ LLM client initialization failed:', error);
      }

      // Try to initialize MCP client
      try {
        await mcpClient.initialize();
        console.log('✅ MCP client initialized');
      } catch (error) {
        console.warn('⚠️ MCP client initialization failed:', error);
      }

      // Always set status to idle to enable the input area
      conversationStore.update((state) => ({ ...state, status: 'idle' }));
      console.log('✅ Conversation manager initialized');
    } catch (error) {
      console.error('❌ Conversation manager initialization failed:', error);
      // Still set to idle to allow user interaction
      conversationStore.update((state) => ({
        ...state,
        status: 'idle',
        error: 'Some services failed to initialize, but chat is still available'
      }));
    }
  }

  async sendMessage(userInput: string): Promise<void> {
    const newMessage: Message = {
      id: `${Date.now()}-user`,
      type: 'user',
      content: userInput,
      timestamp: new Date()
    };

    conversationStore.update((state) => ({
      ...state,
      messages: [...state.messages, newMessage],
      status: 'streaming',
      error: null,
      streamingResponse: ''
    }));

    try {
      const conversationHistory = this.createConversationHistory();
      const llmMessages = this.convertToLLMMessages(conversationHistory);

      const response = await llmClient.streamResponseWithToolCalls(llmMessages);
      conversationStore.update((state) => ({
        ...state,
        streamingResponse: state.streamingResponse + response.content
      }));

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.handleToolCalls(response.toolCalls);
      } else {
        this.addAssistantMessage(response.content || '');
        conversationStore.update((state) => ({ ...state, status: 'idle' }));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      conversationStore.update((state) => ({
        ...state,
        status: 'error',
        error: error instanceof Error ? error.message : 'An unknown error occurred.'
      }));
    }
  }

  private async handleToolCalls(toolCalls: any[]): Promise<void> {
    conversationStore.update((state) => ({
      ...state,
      status: 'awaitingToolResult',
      toolCalls
    }));

    try {
      const originalMessages = this.createConversationHistory();
      const finalResponseContent = await llmClient.getFinalResponseAfterTools(
        originalMessages,
        toolCalls
      );

      this.addAssistantMessage(finalResponseContent);
      conversationStore.update((state) => ({ ...state, status: 'idle', toolCalls: [] }));
    } catch (error) {
      console.error('Error getting final response after tools:', error);
      conversationStore.update((state) => ({
        ...state,
        status: 'error',
        error:
          'I executed the tools successfully, but encountered an error generating the final response.'
      }));
    }
  }

  private addAssistantMessage(content: string): void {
    if (!content.trim()) return;

    const newMessage: Message = {
      id: `${Date.now()}-assistant`,
      type: 'agent',
      content,
      timestamp: new Date()
    };

    conversationStore.update((state) => ({
      ...state,
      messages: [...state.messages, newMessage],
      streamingResponse: ''
    }));
  }

  private createConversationHistory(): Message[] {
    const { messages } = get(conversationStore);
    return messages.filter((msg) => msg.type !== 'system');
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

      if (msg.toolCalls) {
        // Assuming toolCalls in Message are compatible with LLMMessage tool_calls
        // You might need to adjust this mapping based on the actual types
        llmMessage.tool_calls = msg.toolCalls as any;
      }

      return llmMessage;
    });
  }
}

export const conversationManager = new ConversationManager();
