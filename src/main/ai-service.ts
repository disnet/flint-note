import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config();

export class AIService {
  private model: ChatOpenAI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private modelWithTools: any = null;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
    [];
  private mcpClients: Map<string, Client> = new Map();
  private availableTools: Map<string, { serverName: string; tool: unknown }> = new Map();

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    // Initialize OpenAI client with OpenRouter configuration
    this.model = new ChatOpenAI({
      modelName,
      apiKey,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          // 'HTTP-Referer': 'https://flint-note.rocks',
          // 'X-Title': 'Flint Note App'
        }
      },
      temperature: 0.7,
      maxTokens: 1000
    });

    // Initialize MCP servers and bind tools
    this.initializeMcpServers();
  }

  private async initializeMcpServers(): Promise<void> {
    try {
      // Connect to weather MCP server
      const weatherServerPath = join(__dirname, 'weather-mcp-server.js');
      await this.connectMcpServer('weather', weatherServerPath);

      // Create and bind weather tools
      const weatherTools = this.createWeatherTools();
      this.modelWithTools = this.model.withConfig({ tools: weatherTools });

      console.log('Weather MCP server connected and tools bound successfully');
    } catch (error) {
      console.error('Failed to initialize MCP servers:', error);
      // Don't throw error - allow AI service to continue without MCP tools
    }
  }

  private createWeatherTools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }> {
    // Define weather tool as OpenAI function format
    const weatherToolDefinition = {
      type: 'function' as const,
      function: {
        name: 'get_weather',
        description: 'Get current weather information for a specific location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'The location to get weather for (e.g., "New York", "London", "Tokyo")'
            }
          },
          required: ['location']
        }
      }
    };

    // Define forecast tool as OpenAI function format
    const forecastToolDefinition = {
      type: 'function' as const,
      function: {
        name: 'get_forecast',
        description: 'Get weather forecast for a specific location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'The location to get weather forecast for (e.g., "New York", "London", "Tokyo")'
            },
            days: {
              type: 'number',
              description: 'Number of days to forecast (default: 3)',
              default: 3
            }
          },
          required: ['location']
        }
      }
    };

    return [weatherToolDefinition, forecastToolDefinition];
  }

  async sendMessage(userMessage: string): Promise<{
    text: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      result?: string;
      error?: string;
    }>;
    hasToolCalls?: boolean;
    followUpResponse?: {
      text: string;
    };
  }> {
    try {
      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Prepare messages for the model
      const systemMessage = `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to weather tools that can provide current weather information and forecasts for various locations. Use these tools when users ask weather-related questions.`;

      const messages = [
        new SystemMessage(systemMessage),
        ...this.conversationHistory.map((msg) =>
          msg.role === 'user'
            ? new HumanMessage(msg.content)
            : new SystemMessage(msg.content)
        )
      ];

      // Get response from the model (tools will be called automatically if needed)
      const modelToUse = this.modelWithTools || this.model;
      const response = await modelToUse.invoke(messages);

      // Handle tool calls if present
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Create tool messages for each tool call
        const toolMessages: ToolMessage[] = [];
        const toolCallsForUI: Array<{
          id: string;
          name: string;
          arguments: Record<string, unknown>;
          result?: string;
          error?: string;
        }> = [];

        for (const toolCall of response.tool_calls) {
          try {
            const result = await this.callMcpTool(toolCall.name, toolCall.args);
            const toolOutput =
              (result as { content: Array<{ text: string }> })?.content?.[0]?.text || '';

            // Create proper ToolMessage with tool_call_id
            const toolMessage = new ToolMessage({
              content: toolOutput,
              tool_call_id: toolCall.id
            });
            toolMessages.push(toolMessage);

            // Add tool call info for UI
            toolCallsForUI.push({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.args,
              result: toolOutput
            });
          } catch (error) {
            console.error(`Error calling tool ${toolCall.name}:`, error);

            // Create error ToolMessage
            const errorMessage = new ToolMessage({
              content: `Error calling ${toolCall.name}: ${error}`,
              tool_call_id: toolCall.id
            });
            toolMessages.push(errorMessage);

            // Add error info for UI
            toolCallsForUI.push({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.args,
              error: String(error)
            });
          }
        }

        // Add tool results to the conversation and get a final response
        const messagesWithTools = [...messages, response, ...toolMessages];

        const finalResponse = await this.model.invoke(messagesWithTools);
        const assistantMessage = finalResponse.content as string;

        // Add tool call response to conversation history
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content as string
        });
        // Add final response to conversation history
        this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

        // Return initial response with tool calls and follow-up response
        return {
          text: response.content as string,
          toolCalls: toolCallsForUI,
          hasToolCalls: true,
          followUpResponse: {
            text: assistantMessage
          }
        };
      } else {
        const assistantMessage = response.content as string;

        // Add assistant response to conversation history
        this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

        return { text: assistantMessage };
      }
    } catch (error) {
      console.error('AI Service Error:', error);

      // Fallback to mock response if AI service fails
      const fallbackResponses = [
        "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again later.",
        "It seems there's a temporary issue with my AI capabilities. Your message was received, but I can't process it at the moment.",
        "I'm experiencing some technical difficulties. Please check your API configuration and try again."
      ];

      return {
        text: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]
      };
    }
  }

  clearConversation(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [...this.conversationHistory];
  }

  async connectMcpServer(serverName: string, serverPath: string): Promise<void> {
    try {
      const client = new Client(
        {
          name: 'flint-ai-service',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath]
      });

      await client.connect(transport);

      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];

      this.mcpClients.set(serverName, client);

      tools.forEach((tool) => {
        this.availableTools.set(tool.name, {
          serverName,
          tool
        });
      });

      console.log(`Connected to MCP server: ${serverName} with ${tools.length} tools`);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverName}:`, error);
      throw error;
    }
  }

  async callMcpTool(
    toolName: string,
    arguments_: { [key: string]: unknown } = {}
  ): Promise<unknown> {
    const toolInfo = this.availableTools.get(toolName);
    if (!toolInfo) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const client = this.mcpClients.get(toolInfo.serverName);
    if (!client) {
      throw new Error(`MCP client for server ${toolInfo.serverName} not found`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: arguments_
      });
      return result;
    } catch (error) {
      console.error(`Error calling MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  getAvailableTools(): string[] {
    // Return weather tools that are bound to the model
    return ['get_weather', 'get_forecast'];
  }

  async disconnectMcpServer(serverName: string): Promise<void> {
    const client = this.mcpClients.get(serverName);
    if (client) {
      await client.close();
      this.mcpClients.delete(serverName);

      for (const [toolName, toolInfo] of this.availableTools.entries()) {
        if (toolInfo.serverName === serverName) {
          this.availableTools.delete(toolName);
        }
      }
    }
  }
}
