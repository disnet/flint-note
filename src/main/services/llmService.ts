import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage
} from '@langchain/core/messages';
import { BaseMessage } from '@langchain/core/messages';
import { mcpService } from './mcpService';
import type { LLMMessage, LLMConfig, MCPTool, MCPToolCall } from '../../shared/types';

export class LLMService {
  private llm: ChatOpenAI;
  private config: LLMConfig;
  private mcpToolsEnabled: boolean = true;

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

    // Initialize MCP service
    this.initializeMCP();
  }

  private async initializeMCP(): Promise<void> {
    try {
      if (this.mcpToolsEnabled) {
        await mcpService.connect();
        await this.updateLLMWithTools();
      }
    } catch (error) {
      console.error('Failed to initialize MCP service:', error);
      this.mcpToolsEnabled = false;
    }
  }

  private async updateLLMWithTools(): Promise<void> {
    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      return;
    }

    try {
      const mcpTools = await mcpService.listTools();
      const tools = mcpTools.map(this.convertMCPToolToLangChain);

      // Recreate LLM with tools
      const baseLLM = new ChatOpenAI({
        openAIApiKey: this.config.apiKey,
        configuration: {
          baseURL: this.config.baseURL
        },
        modelName: this.config.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      this.llm = baseLLM.withConfig({
        tools: tools
      }) as ChatOpenAI;
    } catch (error) {
      console.error('Failed to update LLM with tools:', error);
    }
  }

  private convertMCPToolToLangChain(mcpTool: MCPTool): any {
    return {
      type: 'function',
      function: {
        name: mcpTool.name,
        description: mcpTool.description,
        parameters: mcpTool.inputSchema
      }
    };
  }

  async generateResponse(messages: LLMMessage[]): Promise<string> {
    try {
      const langchainMessages = this.convertToLangChainMessages(messages);
      const response = await this.llm.invoke(langchainMessages);

      // Handle tool calls if present
      if (response.tool_calls && response.tool_calls.length > 0) {
        return await this.handleToolCalls(response, langchainMessages);
      }

      return response.content as string;
    } catch (error) {
      console.error('Error generating LLM response:', error);
      throw new Error(
        `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async streamResponse(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      const langchainMessages = this.convertToLangChainMessages(messages);
      const stream = await this.llm.stream(langchainMessages);

      let hasToolCalls = false;
      let toolCalls: any[] = [];
      let responseMessage: any = null;

      for await (const chunk of stream) {
        // Check if this chunk contains tool calls
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          hasToolCalls = true;
          toolCalls = chunk.tool_calls;
          responseMessage = chunk;
        }

        const content = chunk.content as string;
        if (content) {
          onChunk(content);
        }
      }

      // Handle tool calls after streaming is complete
      if (hasToolCalls && toolCalls.length > 0) {
        console.log(responseMessage);
        console.log(langchainMessages);
        const toolResponse = await this.handleToolCalls(
          responseMessage,
          langchainMessages
        );
        onChunk('\n\n' + toolResponse);
      }
    } catch (error) {
      console.error('Error streaming LLM response:', error);
      throw new Error(
        `Failed to stream response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleToolCalls(
    response: any,
    previousMessages: BaseMessage[]
  ): Promise<string> {
    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      return response.content as string;
    }

    try {
      const toolResults: string[] = [];

      // Add the assistant's message with tool calls to the conversation
      const assistantMessage = new AIMessage({
        content: response.content || '',
        tool_calls: response.tool_calls
      });

      const conversationWithToolCall = [...previousMessages, assistantMessage];

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        try {
          const mcpToolCall: MCPToolCall = {
            name: toolCall.name,
            arguments:
              typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args
          };

          const toolResult = await mcpService.callTool(mcpToolCall);
          const toolResultText = toolResult.content.map((c) => c.text).join('\n');

          // Add tool result to conversation
          const toolMessage = new ToolMessage({
            content: toolResultText,
            tool_call_id: toolCall.id
          });

          conversationWithToolCall.push(toolMessage);
          toolResults.push(toolResultText);
        } catch (error) {
          console.error('Error executing tool call:', error);
          const errorMessage = new ToolMessage({
            content: `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            tool_call_id: toolCall.id
          });
          conversationWithToolCall.push(errorMessage);
        }
      }

      // Get final response from LLM with tool results
      const finalResponse = await this.llm.invoke(conversationWithToolCall);
      return finalResponse.content as string;
    } catch (error) {
      console.error('Error handling tool calls:', error);
      return response.content as string;
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
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            return new AIMessage({
              content: msg.content,
              tool_calls: msg.tool_calls.map((tc) => ({
                name: tc.function.name,
                args:
                  typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments,
                id: tc.id
              }))
            });
          }
          return new AIMessage(msg.content);
        case 'tool':
          return new ToolMessage({
            content: msg.content,
            tool_call_id: msg.tool_call_id || 'unknown'
          });
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

    // Update tools if MCP is enabled
    if (this.mcpToolsEnabled) {
      this.updateLLMWithTools();
    }
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      return [];
    }

    try {
      return await mcpService.listTools();
    } catch (error) {
      console.error('Error getting available tools:', error);
      return [];
    }
  }

  setMCPToolsEnabled(enabled: boolean): void {
    this.mcpToolsEnabled = enabled;
    if (enabled) {
      this.initializeMCP();
    }
  }

  isMCPEnabled(): boolean {
    return this.mcpToolsEnabled && mcpService.isReady();
  }
}

// Export types for use in other modules
export type { LLMMessage, LLMConfig };

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

You also have access to various tools through the MCP (Model Context Protocol) system, including:
- Weather tools: get_weather and get_forecast for current weather and forecasts
- Additional tools may be available depending on configuration

When users ask about weather or need weather information, use the appropriate weather tools to provide accurate, real-time information. Always use tools when available rather than providing generic responses.

Be conversational, helpful, and focused on productivity. When users mention notes or want to work with their knowledge base, actively suggest using note references with [[Note Title]] syntax.`;
