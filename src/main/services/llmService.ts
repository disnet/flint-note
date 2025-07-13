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
  ToolCallInfo
} from '../../shared/types';

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

  async streamResponse(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      console.log('🚀 Starting LLM stream response');
      console.log('MCP Tools Enabled:', this.mcpToolsEnabled);
      console.log('MCP Service Ready:', mcpService.isReady());

      const langchainMessages = this.convertToLangChainMessages(messages);
      console.log('📝 Converted messages:', langchainMessages.length);

      // Log available tools
      if (this.mcpToolsEnabled && mcpService.isReady()) {
        const availableTools = await mcpService.listTools();
        console.log(
          '🔧 Available MCP tools:',
          availableTools.map((t) => t.name)
        );
      }

      console.log('📡 Starting LLM stream...');

      // Add timeout to the stream call
      const streamPromise = this.llm.stream(langchainMessages);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Stream request timed out after 30 seconds')),
          30000
        );
      });

      const stream = await Promise.race([streamPromise, timeoutPromise]);

      let hasToolCalls = false;
      let toolCalls: any[] = [];
      let responseMessage: any = null;
      const toolCallsAccumulator: any = {};

      for await (const chunk of stream) {
        console.log('📦 Stream chunk received:', {
          hasContent: !!chunk.content,
          hasToolCalls: !!(chunk.tool_calls && chunk.tool_calls.length > 0),
          hasToolCallChunks: !!(
            chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0
          ),
          chunkKeys: Object.keys(chunk)
        });

        // Check if this chunk contains tool calls
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          console.log('🔧 Tool calls detected in chunk:', chunk.tool_calls);
          hasToolCalls = true;
          toolCalls = chunk.tool_calls;
          responseMessage = chunk;
        }

        // Check for tool call chunks (streaming arguments)
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          console.log('🔧 Tool call chunks detected:', chunk.tool_call_chunks);
          for (const toolChunk of chunk.tool_call_chunks) {
            const chunkIndex = toolChunk.index?.toString() || '0';

            if (!toolCallsAccumulator[chunkIndex]) {
              toolCallsAccumulator[chunkIndex] = {
                id: toolChunk.id || chunkIndex,
                name: toolChunk.name || '',
                args: ''
              };
            }

            if (toolChunk.name && !toolCallsAccumulator[chunkIndex].name) {
              toolCallsAccumulator[chunkIndex].name = toolChunk.name;
            }

            if (toolChunk.id && !toolCallsAccumulator[chunkIndex].id) {
              toolCallsAccumulator[chunkIndex].id = toolChunk.id;
            }

            if (toolChunk.args) {
              toolCallsAccumulator[chunkIndex].args += toolChunk.args;
            }
          }
        }

        const content = chunk.content as string;
        if (content) {
          onChunk(content);
        }
      }

      console.log('📦 Stream iteration completed successfully');

      console.log('📦 Stream complete. Tool calls accumulator:', toolCallsAccumulator);
      console.log('🔧 Has tool calls:', hasToolCalls);

      // If we have accumulated tool call chunks, use those instead
      if (Object.keys(toolCallsAccumulator).length > 0) {
        console.log('🔧 Processing accumulated tool calls...');

        // Filter out incomplete tool calls and parse JSON args
        const validToolCalls = Object.values(toolCallsAccumulator)
          .filter((call: any) => call.name)
          .map((call: any) => {
            let parsedArgs = {};
            try {
              // Handle empty args or parse JSON
              if (call.args === '' || call.args === null || call.args === undefined) {
                parsedArgs = {};
              } else if (typeof call.args === 'string') {
                parsedArgs = JSON.parse(call.args);
              } else {
                parsedArgs = call.args;
              }
            } catch (error) {
              console.log('❌ Error parsing tool args:', call.args, error);
              parsedArgs = {};
            }

            return {
              id: call.id,
              name: call.name,
              args: parsedArgs,
              type: 'tool_call'
            };
          });

        console.log('✅ Valid tool calls:', validToolCalls);

        if (validToolCalls.length > 0) {
          toolCalls = validToolCalls;
          hasToolCalls = true;

          // Create a synthetic response message
          if (!responseMessage) {
            responseMessage = {
              tool_calls: toolCalls,
              content: ''
            };
          } else {
            responseMessage.tool_calls = toolCalls;
          }
        }
      }

      // Handle tool calls after streaming is complete
      if (hasToolCalls && toolCalls.length > 0) {
        console.log('🔧 Handling tool calls:', toolCalls);
        const toolResponse = await this.handleToolCalls(
          responseMessage,
          langchainMessages
        );
        console.log('🔧 Sending tool response to chat:', toolResponse);
        onChunk(toolResponse);
      } else {
        console.log('ℹ️ No tool calls to handle');
      }
    } catch (error) {
      console.error('❌ Error streaming LLM response:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');

      // Check if this is a timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(
          'Stream request timed out - check if LLM server is running and responsive'
        );
      }

      // Check if this is a connection error
      if (
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))
      ) {
        throw new Error(
          'Cannot connect to LLM server - check if server is running on the configured port'
        );
      }

      throw new Error(
        `Failed to stream response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async streamResponseWithToolCalls(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void
  ): Promise<LLMResponseWithToolCalls> {
    try {
      console.log('🚀 Starting LLM stream response with tool call tracking');
      console.log('MCP Tools Enabled:', this.mcpToolsEnabled);
      console.log('MCP Service Ready:', mcpService.isReady());

      const langchainMessages = this.convertToLangChainMessages(messages);
      console.log('📝 Converted messages:', langchainMessages.length);

      // Log available tools
      if (this.mcpToolsEnabled && mcpService.isReady()) {
        const availableTools = await mcpService.listTools();
        console.log(
          '🔧 Available MCP tools:',
          availableTools.map((t) => t.name)
        );
      }

      console.log('📡 Starting LLM stream...');

      // Add timeout to the stream call
      const streamPromise = this.llm.stream(langchainMessages);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Stream request timed out after 30 seconds')),
          30000
        );
      });

      const stream = await Promise.race([streamPromise, timeoutPromise]);

      let hasToolCalls = false;
      let toolCalls: any[] = [];
      let responseMessage: any = null;
      const toolCallsAccumulator: any = {};
      let toolCallInfos: ToolCallInfo[] = [];

      for await (const chunk of stream) {
        console.log('📦 Stream chunk received:', {
          hasContent: !!chunk.content,
          hasToolCalls: !!(chunk.tool_calls && chunk.tool_calls.length > 0),
          hasToolCallChunks: !!(
            chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0
          ),
          chunkKeys: Object.keys(chunk)
        });

        // Check if this chunk contains tool calls
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          console.log('🔧 Tool calls detected in chunk:', chunk.tool_calls);
          hasToolCalls = true;
          toolCalls = chunk.tool_calls;
          responseMessage = chunk;
        }

        // Check for tool call chunks (streaming arguments)
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          console.log('🔧 Tool call chunks detected:', chunk.tool_call_chunks);
          for (const toolChunk of chunk.tool_call_chunks) {
            const chunkIndex = toolChunk.index?.toString() || '0';

            if (!toolCallsAccumulator[chunkIndex]) {
              toolCallsAccumulator[chunkIndex] = {
                id: toolChunk.id || chunkIndex,
                name: toolChunk.name || '',
                args: ''
              };
            }

            if (toolChunk.name && !toolCallsAccumulator[chunkIndex].name) {
              toolCallsAccumulator[chunkIndex].name = toolChunk.name;
            }

            if (toolChunk.id && !toolCallsAccumulator[chunkIndex].id) {
              toolCallsAccumulator[chunkIndex].id = toolChunk.id;
            }

            if (toolChunk.args) {
              toolCallsAccumulator[chunkIndex].args += toolChunk.args;
            }
          }

          hasToolCalls = true;
        }

        // Send content chunks to UI
        if (chunk.content && typeof chunk.content === 'string') {
          onChunk(chunk.content);
        }
      }

      console.log('📦 Stream iteration completed successfully');
      console.log('📦 Stream complete. Tool calls accumulator:', toolCallsAccumulator);
      console.log('🔧 Has tool calls:', hasToolCalls);

      // Process tool calls if present
      if (hasToolCalls) {
        // If we have accumulated tool call chunks, use those instead
        if (Object.keys(toolCallsAccumulator).length > 0) {
          console.log('🔧 Processing accumulated tool calls...');

          const validToolCalls = Object.values(toolCallsAccumulator)
            .filter((call: any) => call.name)
            .map((call: any) => {
              let parsedArgs = {};
              try {
                if (call.args === '' || call.args === null || call.args === undefined) {
                  parsedArgs = {};
                } else {
                  parsedArgs = JSON.parse(call.args);
                }
              } catch (error) {
                console.log('❌ Error parsing tool args:', call.args, error);
                parsedArgs = {};
              }

              return {
                id: call.id,
                name: call.name,
                args: parsedArgs,
                type: 'tool_call'
              };
            });

          console.log('✅ Valid tool calls:', validToolCalls);

          if (validToolCalls.length > 0) {
            toolCalls = validToolCalls;

            if (!responseMessage) {
              responseMessage = {
                tool_calls: toolCalls,
                content: ''
              };
            } else {
              responseMessage.tool_calls = toolCalls;
            }
          }
        }

        if (toolCalls.length > 0) {
          console.log('🔧 Handling tool calls:', toolCalls);
          toolCallInfos = await this.handleToolCallsWithInfo(
            responseMessage,
            langchainMessages
          );

          // Get final response from LLM after tool execution
          const finalResponse = await this.getFinalResponseAfterTools(
            responseMessage,
            langchainMessages,
            toolCallInfos
          );

          return {
            success: true,
            content: finalResponse,
            toolCalls: toolCallInfos
          };
        }
      }

      return {
        success: true,
        content: '',
        toolCalls: toolCallInfos
      };
    } catch (error) {
      console.error('❌ Error in streamResponseWithToolCalls:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async handleToolCalls(
    response: any,
    previousMessages: BaseMessage[]
  ): Promise<string> {
    console.log('🔧 handleToolCalls called with response:', {
      hasContent: !!response.content,
      hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0),
      toolCallsCount: response.tool_calls?.length || 0,
      hasInvalidToolCalls: !!(
        response.invalid_tool_calls && response.invalid_tool_calls.length > 0
      ),
      invalidToolCallsCount: response.invalid_tool_calls?.length || 0
    });

    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      console.log('⚠️ MCP tools not enabled or service not ready');
      return response.content as string;
    }

    try {
      const toolResults: string[] = [];
      const debugInfo: string[] = [];

      // Combine valid and invalid tool calls
      const allToolCalls = [
        ...(response.tool_calls || []),
        ...(response.invalid_tool_calls || [])
      ];

      console.log('🔧 Processing tool calls:', JSON.stringify(allToolCalls, null, 2));

      // Generate proper IDs for tool calls that don't have them
      const toolCallsWithIds = allToolCalls.map((tc: any, index: number) => {
        const toolCallId = tc.id || `tool_call_${Date.now()}_${index}`;
        console.log('🔧 Processing tool call:', JSON.stringify(tc, null, 2));
        console.log('🔧 Tool call name:', tc.name, 'Type:', typeof tc.name);
        console.log('🔧 Tool call args:', tc.args, 'Type:', typeof tc.args);
        console.log('🔧 Tool call keys:', Object.keys(tc));
        console.log('🔧 Full tool call structure:', tc);

        // Handle different tool call formats
        let toolName = tc.name || tc.function?.name || 'unknown_tool';
        let toolArgs = tc.args || tc.function?.arguments || {};

        // Handle invalid tool calls with string args
        if (typeof toolArgs === 'string') {
          try {
            toolArgs = toolArgs === '' ? {} : JSON.parse(toolArgs);
          } catch (error) {
            console.log('❌ Error parsing tool args:', toolArgs, error);
            toolArgs = {};
          }
        }

        console.log('🔧 Extracted tool name:', toolName);
        console.log('🔧 Extracted tool args:', toolArgs);

        return {
          ...tc,
          id: toolCallId,
          type: tc.type || 'function',
          name: toolName,
          args: toolArgs
        };
      });

      // Add the assistant's message with tool calls to the conversation
      const assistantMessage = new AIMessage({
        content: 'I need to use some tools to help you.',
        tool_calls: toolCallsWithIds.map((tc: any) => ({
          name: tc.name || 'unknown_tool',
          args: typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args,
          id: tc.id,
          type: tc.type
        }))
      });

      const conversationWithToolCall = [...previousMessages, assistantMessage];

      // Execute each tool call (using the ones with IDs)
      for (const toolCall of toolCallsWithIds) {
        console.log('🔧 Executing tool call:', JSON.stringify(toolCall, null, 2));
        console.log(
          '🔧 Tool name check:',
          toolCall.name,
          'Length:',
          toolCall.name?.length
        );

        try {
          // Skip if tool name is empty or invalid
          if (
            !toolCall.name ||
            toolCall.name.trim() === '' ||
            toolCall.name === 'unknown_tool'
          ) {
            console.log('❌ Skipping tool call with empty name:', toolCall.name);
            console.log('❌ Full tool call object:', JSON.stringify(toolCall, null, 2));
            const errorMessage = new ToolMessage({
              content: `Error: Tool name is empty or invalid (${toolCall.name})`,
              tool_call_id: toolCall.id
            });
            conversationWithToolCall.push(errorMessage);
            continue;
          }

          // Handle test tool directly
          if (toolCall.name === 'test_tool') {
            console.log('🧪 Handling test tool');
            const args =
              typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args;
            const testResult = `Hello! Test tool called with message: "${args.message || 'No message provided'}"`;

            // Add debug info for test tool
            debugInfo.push(`**🔧 Test Tool Call:**
\`\`\`json
{
  "tool": "test_tool",
  "arguments": ${JSON.stringify(args, null, 2)}
}
\`\`\``);

            debugInfo.push(`**📋 Test Tool Result:**
\`\`\`
${testResult}
\`\`\``);

            const toolMessage = new ToolMessage({
              content: testResult,
              tool_call_id: toolCall.id
            });

            conversationWithToolCall.push(toolMessage);
            toolResults.push(testResult);
            continue;
          }

          console.log('🔧 Handling MCP tool:', toolCall.name);
          const mcpToolCall: MCPToolCall = {
            name: toolCall.name,
            arguments:
              typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args || {}
          };

          // Add debug info for tool call
          debugInfo.push(`**🔧 Tool Call Debug:**
\`\`\`json
{
  "tool": "${mcpToolCall.name}",
  "arguments": ${JSON.stringify(mcpToolCall.arguments, null, 2)}
}
\`\`\``);

          console.log('📞 Calling MCP service with:', mcpToolCall);
          const toolResult = await mcpService.callTool(mcpToolCall);
          console.log('📋 MCP tool result:', toolResult);

          const toolResultText = toolResult.content.map((c) => c.text).join('\n');

          // Add debug info for tool result
          debugInfo.push(`**📋 Tool Result:**
\`\`\`
${toolResultText}
\`\`\``);

          // Add tool result to conversation
          const toolMessage = new ToolMessage({
            content: toolResultText,
            tool_call_id: toolCall.id
          });

          conversationWithToolCall.push(toolMessage);
          toolResults.push(toolResultText);
        } catch (error) {
          console.error('❌ Error executing tool call:', error);
          console.error(
            'Error stack:',
            error instanceof Error ? error.stack : 'No stack'
          );

          const errorMessage = new ToolMessage({
            content: `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            tool_call_id: toolCall.id
          });
          conversationWithToolCall.push(errorMessage);

          // Add debug info for error
          debugInfo.push(`**❌ Tool Error:**
\`\`\`
Tool: ${toolCall.name}
Error: ${error instanceof Error ? error.message : 'Unknown error'}
Stack: ${error instanceof Error ? error.stack : 'No stack'}
\`\`\``);
        }
      }

      console.log('🔄 Getting final response from LLM with tool results...');
      console.log('💬 Conversation length:', conversationWithToolCall.length);

      // Create a fresh conversation for Bedrock compatibility
      const toolResultsText = toolResults.join('\n\n');
      const summaryMessage = toolResultsText
        ? `Here are the results from the tools I used:\n\n${toolResultsText}`
        : 'I attempted to use tools to help you, but encountered some issues.';

      console.log('🔄 Creating fresh conversation for Bedrock compatibility');

      // Create a completely new conversation without tool calls
      const freshConversation = [
        previousMessages[0], // Keep the original system message
        new HumanMessage(
          String(
            previousMessages[previousMessages.length - 1].content || 'Please help me'
          )
        ), // Keep the user's question
        new AIMessage(summaryMessage) // Add our summary
      ];

      console.log('🔄 Getting final response from LLM with fresh conversation...');

      // Create a new LLM instance without tools to prevent additional tool calls
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

      // Get final response from LLM with clean conversation (no tools)
      const finalResponse = await baseLLM.invoke(freshConversation);
      console.log('✅ Final response received:', finalResponse);

      // Include debug info in response
      const debugSection =
        debugInfo.length > 0 ? `\n\n---\n\n${debugInfo.join('\n\n')}` : '';

      const finalContent = ((finalResponse.content as string) || '').trim();
      const fullResponse = finalContent + debugSection;

      console.log('🔧 Final response content:', finalContent);
      console.log('🔧 Full response with debug:', fullResponse);

      return fullResponse;
    } catch (error) {
      console.error('❌ Error handling tool calls:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      return response.content as string;
    }
  }

  private async handleToolCallsWithInfo(
    response: any,
    _previousMessages: BaseMessage[]
  ): Promise<ToolCallInfo[]> {
    console.log('🔧 handleToolCallsWithInfo called');

    if (!this.mcpToolsEnabled || !mcpService.isReady()) {
      console.log('⚠️ MCP tools not enabled or service not ready');
      return [];
    }

    try {
      const toolCallInfos: ToolCallInfo[] = [];

      // Combine valid and invalid tool calls
      const allToolCalls = [
        ...(response.tool_calls || []),
        ...(response.invalid_tool_calls || [])
      ];

      console.log('🔧 Processing tool calls:', JSON.stringify(allToolCalls, null, 2));

      // Generate proper IDs for tool calls that don't have them
      const toolCallsWithIds = allToolCalls.map((tc: any, index: number) => {
        const toolCallId = tc.id || `tool_call_${Date.now()}_${index}`;

        let toolName = tc.name || tc.function?.name || 'unknown_tool';
        let toolArgs = tc.args || tc.function?.arguments || {};

        // Handle invalid tool calls with string args
        if (typeof toolArgs === 'string') {
          try {
            toolArgs = JSON.parse(toolArgs);
          } catch (error) {
            console.log('❌ Error parsing tool args as JSON:', toolArgs, error);
            toolArgs = { raw: toolArgs };
          }
        }

        return {
          ...tc,
          id: toolCallId,
          type: tc.type || 'function',
          name: toolName,
          args: toolArgs
        };
      });

      // Execute each tool call
      for (const toolCall of toolCallsWithIds) {
        const startTime = Date.now();
        const toolCallInfo: ToolCallInfo = {
          name: toolCall.name,
          arguments: toolCall.args,
          timestamp: new Date()
        };

        console.log('🔧 Executing tool call:', JSON.stringify(toolCall, null, 2));

        try {
          if (
            !toolCall.name ||
            toolCall.name.trim() === '' ||
            toolCall.name === 'unknown_tool'
          ) {
            console.log('❌ Skipping tool call with empty name:', toolCall.name);
            toolCallInfo.error = `Tool name is empty or invalid (${toolCall.name})`;
            toolCallInfos.push(toolCallInfo);
            continue;
          }

          if (toolCall.name === 'test_tool') {
            console.log('🧪 Handling test tool');
            const args =
              typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args;
            const testResult = `Hello! Test tool called with message: "${args.message || 'No message provided'}"`;

            toolCallInfo.result = testResult;
            toolCallInfo.duration = Date.now() - startTime;
            toolCallInfos.push(toolCallInfo);
            continue;
          }

          // Check if this is a valid MCP tool
          const availableTools = await mcpService.listTools();
          const mcpTool = availableTools.find((tool) => tool.name === toolCall.name);

          if (!mcpTool) {
            console.log('❌ Tool not found in MCP service:', toolCall.name);
            toolCallInfo.error = `Tool '${toolCall.name}' not found in available MCP tools`;
            toolCallInfos.push(toolCallInfo);
            continue;
          }

          console.log('🔧 Calling MCP tool:', toolCall.name, 'with args:', toolCall.args);

          const toolResult = await mcpService.callTool({
            name: toolCall.name,
            arguments: toolCall.args
          });

          console.log('🔧 Tool result received:', toolResult);

          const toolResultText = toolResult.content.map((c) => c.text).join('\n');
          toolCallInfo.result = toolResultText;
          toolCallInfo.duration = Date.now() - startTime;
        } catch (error) {
          console.error('❌ Error executing tool:', toolCall.name, error);
          toolCallInfo.error = error instanceof Error ? error.message : 'Unknown error';
          toolCallInfo.duration = Date.now() - startTime;
        }

        toolCallInfos.push(toolCallInfo);
      }

      return toolCallInfos;
    } catch (error) {
      console.error('❌ Error handling tool calls with info:', error);
      return [];
    }
  }

  private async getFinalResponseAfterTools(
    response: any,
    previousMessages: BaseMessage[],
    toolCallInfos: ToolCallInfo[]
  ): Promise<string> {
    try {
      // Combine valid and invalid tool calls
      const allToolCalls = [
        ...(response.tool_calls || []),
        ...(response.invalid_tool_calls || [])
      ];

      // Generate proper IDs for tool calls that don't have them
      const toolCallsWithIds = allToolCalls.map((tc: any, index: number) => {
        const toolCallId = tc.id || `tool_call_${Date.now()}_${index}`;
        let toolName = tc.name || tc.function?.name || 'unknown_tool';
        let toolArgs = tc.args || tc.function?.arguments || {};

        if (typeof toolArgs === 'string') {
          try {
            toolArgs = JSON.parse(toolArgs);
          } catch (error) {
            toolArgs = { raw: toolArgs };
          }
        }

        return {
          ...tc,
          id: toolCallId,
          type: tc.type || 'function',
          name: toolName,
          args: toolArgs
        };
      });

      // Add the assistant's message with tool calls to the conversation
      const assistantMessage = new AIMessage({
        content: 'I need to use some tools to help you.',
        tool_calls: toolCallsWithIds.map((tc: any) => ({
          name: tc.name || 'unknown_tool',
          args: typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args,
          id: tc.id,
          type: tc.type
        }))
      });

      const conversationWithToolCall = [...previousMessages, assistantMessage];

      // Add tool results to conversation
      for (let i = 0; i < toolCallsWithIds.length; i++) {
        const toolCall = toolCallsWithIds[i];
        const toolInfo = toolCallInfos[i];

        if (toolInfo) {
          const toolResult = toolInfo.result || toolInfo.error || 'No result';
          const toolMessage = new ToolMessage({
            content: toolResult,
            tool_call_id: toolCall.id
          });
          conversationWithToolCall.push(toolMessage);
        }
      }

      console.log('🔄 Getting final response from LLM with tool results...');
      console.log('💬 Conversation length:', conversationWithToolCall.length);

      // Create a fresh conversation for better compatibility
      const toolResultsText = toolCallInfos
        .map(info => info.result || `Error: ${info.error}`)
        .join('\n\n');

      const summaryMessage = toolResultsText
        ? `Here are the results from the tools I used:\n\n${toolResultsText}`
        : 'I attempted to use tools to help you, but encountered some issues.';

      // Create a completely new conversation without tool calls
      const freshConversation = [
        previousMessages[0], // Keep the original system message
        new HumanMessage(
          String(
            previousMessages[previousMessages.length - 1].content || 'Please help me'
          )
        ), // Keep the user's question
        new AIMessage(summaryMessage) // Add our summary
      ];

      console.log('🔄 Getting final response from LLM with fresh conversation...');

      // Create a new LLM instance without tools to prevent additional tool calls
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

      // Get final response from LLM with clean conversation (no tools)
      const finalResponse = await baseLLM.invoke(freshConversation);
      console.log('✅ Final response received:', finalResponse);

      const finalContent = ((finalResponse.content as string) || '').trim();
      console.log('🔧 Final response content:', finalContent);

      return finalContent;
    } catch (error) {
      console.error('❌ Error getting final response after tools:', error);
      return 'I used some tools to help you, but encountered an error generating the final response.';
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
