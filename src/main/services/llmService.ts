import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage
} from '@langchain/core/messages';
import { BaseMessage } from '@langchain/core/messages';
import { mcpService } from './mcpService';
import { settingsService } from './settingsService';
import type {
  LLMMessage,
  LLMConfig,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  LLMResponseWithToolCalls,
  ToolCallInfo,
  MCPResource,
  MCPResourceContent
} from '../../shared/types';
import { BaseLanguageModelInput } from '@langchain/core/language_models/base';

export class LLMService {
  private llm: ChatOpenAI | any;
  private config: LLMConfig;
  private mcpToolsEnabled: boolean;
  private maxToolsLimit: number;

  constructor(config: Partial<LLMConfig> = {}) {
    // Load config from settings service, with provided config taking precedence
    const savedConfig = settingsService.getLLMConfig();
    this.config = {
      ...savedConfig,
      ...config
    };

    console.log('🔧 LLM Service configuration:', {
      baseURL: this.config.baseURL,
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      apiKey: this.config.apiKey ? `${this.config.apiKey.slice(0, 10)}...` : 'not set',
      provider: this.config.baseURL.includes('openrouter') ? 'OpenRouter' : 'Custom'
    });

    const baseLLM = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL
      },
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });

    console.log('✅ Base LLM created');

    this.llm = baseLLM;

    // Load MCP settings from persistent storage
    this.mcpToolsEnabled = settingsService.getMCPToolsEnabled();
    this.maxToolsLimit = settingsService.getMaxToolsLimit();

    // Initialize MCP service
    this.initializeMCP();
  }

  async initialize(): Promise<void> {
    // Load settings from persistent storage
    await settingsService.loadSettings();

    // Update configuration with loaded settings
    const savedConfig = settingsService.getLLMConfig();
    this.config = { ...this.config, ...savedConfig };

    // Update MCP settings
    this.mcpToolsEnabled = settingsService.getMCPToolsEnabled();
    this.maxToolsLimit = settingsService.getMaxToolsLimit();

    // Recreate LLM with loaded config
    const baseLLM = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL
      },
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });

    this.llm = baseLLM;

    // Initialize MCP with loaded settings
    await this.initializeMCP();
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

      // Limit tools to prevent overwhelming the LLM
      const maxTools = this.maxToolsLimit; // Configurable limit for LLM servers
      const prioritizedTools = this.prioritizeTools(mcpTools);
      const limitedMcpTools = prioritizedTools.slice(0, maxTools); // -1 for test_tool

      console.log(
        `🔧 Limiting tools: ${mcpTools.length} available, using ${limitedMcpTools.length + 1} (including test_tool)`
      );
      console.log(
        '🔧 Selected tools:',
        limitedMcpTools.map((t) => t.name)
      );

      const tools = [...limitedMcpTools.map(this.convertMCPToolToLangChain)];

      // Recreate LLM with tools
      console.log('🔧 Creating LLM with tools:', tools.length);
      console.log(
        '🔧 Tools being bound:',
        tools.map((t) => t.function.name)
      );

      const baseLLM = new ChatOpenAI({
        openAIApiKey: this.config.apiKey,
        configuration: {
          baseURL: this.config.baseURL,
          defaultHeaders: this.config.baseURL.includes('openrouter')
            ? {
                'HTTP-Referer': 'https://flint-ai.com',
                'X-Title': 'Flint AI'
              }
            : undefined
        },
        modelName: this.config.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      console.log('✅ Base LLM created for tools');

      this.llm = baseLLM.bindTools(tools);
      console.log('✅ Tools bound to LLM');
    } catch (error) {
      console.error('Failed to update LLM with tools:', error);
    }
  }

  private prioritizeTools(tools: MCPTool[]): MCPTool[] {
    // Prioritize commonly used tools
    const priorityOrder = [
      'get_current_vault',
      'search_notes',
      'create_note',
      'get_note',
      'update_note',
      'list_note_types',
      'search_notes_advanced',
      'get_note_info',
      'list_notes_by_type'
    ];

    const prioritized: MCPTool[] = [];
    const remaining: MCPTool[] = [];

    // Add priority tools first
    for (const priorityName of priorityOrder) {
      const tool = tools.find((t) => t.name === priorityName);
      if (tool) {
        prioritized.push(tool);
      }
    }

    // Add remaining tools
    for (const tool of tools) {
      if (!prioritized.find((p) => p.name === tool.name)) {
        remaining.push(tool);
      }
    }

    return [...prioritized, ...remaining];
  }

  private convertMCPToolToLangChain(mcpTool: MCPTool): any {
    const langchainTool = {
      type: 'function',
      function: {
        name: mcpTool.name,
        description: mcpTool.description,
        parameters: mcpTool.inputSchema
      }
    };

    return langchainTool;
  }

  async generateResponse(messages: LLMMessage[]): Promise<string> {
    try {
      const langchainMessages = this.convertToLangChainMessages(messages);
      const response = await this.llm.invoke(langchainMessages);

      // Handle tool calls if present (both valid and invalid)
      if (
        (response.tool_calls && response.tool_calls.length > 0) ||
        (response.invalid_tool_calls && response.invalid_tool_calls.length > 0)
      ) {
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

  async streamResponseWithToolCalls(
    messages: LLMMessage[],
    onChunk: (chunk: any) => void
  ): Promise<LLMResponseWithToolCalls> {
    try {
      console.log('🚀 Starting LLM stream response with tool call tracking');
      const langchainMessages = this.convertToLangChainMessages(messages);
      const stream = await this.llm.stream(langchainMessages);

      let toolCalls: any[] = [];
      let content = '';

      for await (const chunk of stream) {
        if (chunk.content) {
          content += chunk.content;
          onChunk({ content: chunk.content });
        }
        if (chunk.tool_calls) {
          toolCalls = chunk.tool_calls;
        }
      }

      return {
        success: true,
        content,
        toolCalls
      };
    } catch (error) {
      console.error('❌ Error in streamResponseWithToolCalls:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  

  private convertToLangChainMessages(messages: LLMMessage[]): BaseMessage[] {
    console.log('🔄 Converting messages to LangChain format:', messages.length);
    return messages.map((msg, index) => {
      console.log(`🔍 Converting message ${index}:`, {
        role: msg.role,
        hasContent: !!msg.content,
        contentType: typeof msg.content,
        contentLength: msg.content?.length || 0,
        isArray: Array.isArray(msg.content),
        hasToolCalls: !!(msg.tool_calls && msg.tool_calls.length > 0)
      });

      // Ensure content is always a string
      const ensureStringContent = (content: any): string => {
        if (typeof content === 'string') return content || '';
        if (Array.isArray(content)) {
          // Handle array content properly
          if (content.length === 0) return '';
          return content
            .map((c) => {
              if (typeof c === 'string') return c;
              if (c && typeof c === 'object' && c.text) return c.text;
              if (c && typeof c === 'object' && c.content) return c.content;
              return JSON.stringify(c);
            })
            .join('');
        }
        if (content && typeof content === 'object') {
          if (content.text) return content.text;
          if (content.content) return content.content;
          return JSON.stringify(content);
        }
        return String(content || '');
      };

      switch (msg.role) {
        case 'system':
          return new SystemMessage(
            ensureStringContent(msg.content) || 'You are a helpful assistant.'
          );
        case 'user':
          return new HumanMessage(ensureStringContent(msg.content) || 'Hello');
        case 'assistant':
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            return new AIMessage({
              content:
                ensureStringContent(msg.content) ||
                'I need to use some tools to help you.',
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
          return new AIMessage(ensureStringContent(msg.content) || 'I understand.');
        case 'tool':
          return new ToolMessage({
            content: ensureStringContent(msg.content) || 'Tool execution completed.',
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

      // Provide better error messages for OpenRouter
      if (this.config.baseURL.includes('openrouter')) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
          console.error('OpenRouter authentication failed. Please check your API key.');
        } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          console.error('OpenRouter model not found. Please check your model name.');
        } else if (errorMessage.includes('rate limit')) {
          console.error('OpenRouter rate limit exceeded. Please try again later.');
        } else {
          console.error('OpenRouter connection failed:', errorMessage);
        }
      }

      return false;
    }
  }

  async updateConfig(config: Partial<LLMConfig>): Promise<void> {
    console.log('🔧 Updating LLM config:', config);
    this.config = { ...this.config, ...config };

    // Save to persistent storage
    await settingsService.updateLLMConfig(this.config);

    console.log('🔧 New LLM configuration:', {
      baseURL: this.config.baseURL,
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      apiKey: this.config.apiKey ? `${this.config.apiKey.slice(0, 10)}...` : 'not set',
      provider: this.config.baseURL.includes('openrouter') ? 'OpenRouter' : 'Custom'
    });

    // Recreate LLM with new config
    const baseLLM = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL
      },
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });

    console.log('✅ Base LLM recreated with new config');

    this.llm = baseLLM;

    // Update with tools if enabled
    if (this.mcpToolsEnabled) {
      console.log('🔧 Updating LLM with tools after config change');
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

  async setMCPToolsEnabled(enabled: boolean): Promise<void> {
    this.mcpToolsEnabled = enabled;
    await settingsService.setMCPToolsEnabled(enabled);
    if (enabled) {
      this.initializeMCP();
    }
  }

  isMCPEnabled(): boolean {
    return this.mcpToolsEnabled && mcpService.isReady();
  }

  async setMaxToolsLimit(limit: number): Promise<void> {
    this.maxToolsLimit = Math.max(1, Math.min(limit, 50)); // Clamp between 1 and 50
    console.log(`🔧 Tool limit set to: ${this.maxToolsLimit}`);

    // Save to persistent storage
    await settingsService.setMaxToolsLimit(this.maxToolsLimit);

    // Update LLM with new tool limit if MCP is enabled
    if (this.mcpToolsEnabled) {
      this.updateLLMWithTools();
    }
  }

  getMaxToolsLimit(): number {
    return this.maxToolsLimit;
  }

  // MCP Connection management methods
  async getMCPConnectionStatus(): Promise<{
    connected: boolean;
    toolCount: number;
    error?: string;
  }> {
    return mcpService.getConnectionStatus();
  }

  async reconnectMCP(): Promise<void> {
    await mcpService.reconnect();

    // Update LLM with tools after reconnection
    if (this.mcpToolsEnabled) {
      await this.updateLLMWithTools();
    }
  }

  async testMCPConnection(): Promise<{ success: boolean; error?: string }> {
    return mcpService.testConnection();
  }

  async callMCPTool(
    toolCall: MCPToolCall
  ): Promise<{ success: boolean; result?: MCPToolResult; error?: string }> {
    try {
      console.log('🔧 LLM Service callMCPTool called with:', toolCall);

      if (!this.mcpToolsEnabled) {
        throw new Error('MCP tools are disabled');
      }

      const result = await mcpService.callTool(toolCall);
      console.log('📋 MCP tool result:', result);

      if (result.isError) {
        throw new Error(result.content[0]?.text || 'Tool call failed');
      }

      return { success: true, result };
    } catch (error) {
      console.error('❌ Error calling MCP tool:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // MCP Resource methods
  async getMCPResources(): Promise<MCPResource[]> {
    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      return [];
    }

    try {
      return await mcpService.listResources();
    } catch (error) {
      console.error('Error getting MCP resources:', error);
      return [];
    }
  }

  async readMCPResource(uri: string): Promise<MCPResourceContent> {
    if (!this.mcpToolsEnabled) {
      throw new Error('MCP tools are disabled');
    }

    if (!mcpService.isReady()) {
      throw new Error('MCP service is not ready');
    }

    try {
      return await mcpService.readResource(uri);
    } catch (error) {
      console.error('Error reading MCP resource:', error);
      throw error;
    }
  }
}

// Export types for use in other modules
export type { LLMMessage, LLMConfig };

// Default system prompt for Flint
export const FLINT_SYSTEM_PROMPT = `You are Flint, an AI assistant designed to help with note-taking and knowledge management. You are integrated into a chat-first interface where users can:

1. Reference notes using [[Note Title]] or [[Note Title|display text]]
2. Switch between different vaults/notebooks
3. Brainstorm ideas and organize thoughts

Key capabilities:
- Help users create, find, and organize notes
- Provide contextual assistance based on existing notes
- Support markdown formatting in responses
- Reference related notes using [[Note Title]] or [[Note Title|display text]] syntax
- Assist with brainstorming and idea development

Be conversational, helpful, and focused on productivity.`;
