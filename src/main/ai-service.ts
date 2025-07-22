import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openai } from '@ai-sdk/openai';
import {
  generateText,
  streamText,
  tool,
  LanguageModel,
  ModelMessage,
  stepCountIs
} from 'ai';
import { EventEmitter } from 'events';
import * as dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

export class AIService extends EventEmitter {
  private model: LanguageModel;
  private currentModelName: string;
  private conversationHistory: ModelMessage[] = [];
  private mcpClients: Map<string, Client> = new Map();
  private availableTools: Map<string, { serverName: string; tool: unknown }> = new Map();

  constructor() {
    super();
    const apiKey = process.env.OPENROUTER_API_KEY;
    this.currentModelName = process.env.OPENAI_MODEL_NAME || 'gpt-4.1-mini';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    this.model = this.createModelInstance(this.currentModelName);
  }

  private createModelInstance(modelName: string): LanguageModel {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    return openai(modelName);
  }

  private switchModel(modelName: string): void {
    if (modelName !== this.currentModelName) {
      console.log(`Switching model from ${this.currentModelName} to ${modelName}`);
      this.currentModelName = modelName;
      this.model = this.createModelInstance(modelName);
    }
  }

  async sendMessage(
    userMessage: string,
    modelName?: string
  ): Promise<{
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
      // Switch model if specified
      console.log(`would switch to ${modelName}`);
      // if (modelName) {
      //   this.switchModel(modelName);
      // }

      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Prepare messages for the model
      const systemMessage = `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to comprehensive note management tools including:
- Creating, reading, updating, and deleting notes
- Searching through note content and metadata
- Managing note types and vaults
- Handling note links and relationships
- Advanced search capabilities with SQL queries

When responding be sure to format references to notes in wikilinks syntax. For example, [[Note Title]] or [[daily/2023-09-25|September 25th, 2023]]


Use these tools to help users manage their notes effectively and answer their questions.`;

      const messages: ModelMessage[] = [{ role: 'system', content: systemMessage }];

      const result = await generateText({
        model: this.model,
        messages,
        onStepFinish: (step) => {
          console.log(step);
        }
      });
      this.conversationHistory.push(...result.response.messages);
      return { text: result.text };
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

  getConversationHistory(): Array<ModelMessage> {
    return [...this.conversationHistory];
  }

  async connectMcpServerNpx(serverName: string, packageName: string): Promise<void> {
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
        command: 'npx',
        args: [packageName]
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

      console.log(
        `Connected to MCP server: ${serverName} (${packageName}) with ${tools.length} tools`
      );
    } catch (error) {
      console.error(
        `Failed to connect to MCP server ${serverName} (${packageName}):`,
        error
      );
      throw error;
    }
  }

  async sendMessageStream(
    userMessage: string,
    requestId: string,
    modelName?: string
  ): Promise<void> {
    try {
      // Switch model if specified
      if (modelName) {
        this.switchModel(modelName);
      }

      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Prepare messages for the model
      const systemMessage = `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to comprehensive note management tools including:
- Creating, reading, updating, and deleting notes
- Searching through note content and metadata
- Managing note types and vaults
- Handling note links and relationships
- Advanced search capabilities with SQL queries
- Weather information (for demonstration purposes)

When responding be sure to format references to notes in wikilinks syntax. For example, [[Note Title]] or [[daily/2023-09-25|September 25th, 2023]]

When using tools, always provide helpful explanatory text before and after tool calls to give context and summarize results for the user.

Use these tools to help users manage their notes effectively and answer their questions.`;

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.conversationHistory
      ];

      this.emit('stream-start', { requestId });

      const weatherTool = (tool as any)({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for')
        }),
        execute: async ({ location }: { location: string }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10
        })
      });

      const result = streamText({
        model: this.model,
        messages,
        tools: {
          weather: weatherTool
        },
        stopWhen: stepCountIs(5), // Allow up to 5 steps for multi-turn tool calling
        onStepFinish: (step) => {
          // Handle tool calls from step content (AI SDK might put them in different places)
          const toolCalls =
            step.toolCalls ||
            (step.content
              ? step.content.filter((item) => item.type === 'tool-call')
              : []);

          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((toolCall) => {
              const toolCallData = {
                id: toolCall.toolCallId,
                name: toolCall.toolName,
                // Try both 'args' and 'input' properties, as AI SDK might use different names
                arguments: toolCall.args || toolCall.input || {},
                result: step.toolResults?.find(
                  (r) => r.toolCallId === toolCall.toolCallId
                )?.output,
                error: undefined
              };
              this.emit('stream-tool-call', { requestId, toolCall: toolCallData });
            });
          }

          // Handle text content from each step
          if (step.text) {
            console.log('Step text:', step.text);
            // Note: step text is already included in the main textStream
          }
        }
      });

      let fullText = '';

      // Handle text streaming
      for await (const textChunk of result.textStream) {
        fullText += textChunk;
        this.emit('stream-chunk', { requestId, chunk: textChunk });
      }

      // Add assistant response to conversation history
      this.conversationHistory.push({ role: 'assistant', content: fullText });

      this.emit('stream-end', { requestId, fullText });
    } catch (error) {
      console.error('AI Service Streaming Error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.emit('stream-error', { requestId, error: errorMessage });
    }
  }
}
