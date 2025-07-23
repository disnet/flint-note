import { openai } from '@ai-sdk/openai';
import { generateText, streamText, LanguageModel, ModelMessage, stepCountIs } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from 'ai/mcp-stdio';
import { EventEmitter } from 'events';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class AIService extends EventEmitter {
  private model: LanguageModel;
  private currentModelName: string;
  private conversationHistory: ModelMessage[] = [];
  private mcpClient: unknown;

  constructor() {
    super();
    const apiKey = process.env.OPENROUTER_API_KEY;
    this.currentModelName = process.env.OPENAI_MODEL_NAME || 'gpt-4.1-mini';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    this.model = this.createModelInstance(this.currentModelName);
    this.initializeFlintMcpServer();
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

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.conversationHistory
      ];

      // @ts-ignore: mcpClient types not exported yet
      const mcpTools = this.mcpClient ? await this.mcpClient.tools() : {};
      const result = await generateText({
        model: this.model,
        messages,
        tools: mcpTools as any, // eslint-disable-line @typescript-eslint/no-explicit-any
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

  private async initializeFlintMcpServer(): Promise<void> {
    try {
      this.mcpClient = await createMCPClient({
        transport: new StdioMCPTransport({
          command: 'npx',
          args: ['@flint-note/server']
        })
      });
      console.log('Flint MCP server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Flint MCP server:', error);
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

When responding be sure to format references to notes in wikilinks syntax. For example, [[daily/2023-09-25]] or [[daily/2023-09-25|September 25th, 2023]]

When using tools, always provide helpful explanatory text before and after tool calls to give context and summarize results for the user.

Use these tools to help users manage their notes effectively and answer their questions.`;

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.conversationHistory
      ];

      this.emit('stream-start', { requestId });

      // @ts-ignore: mcpClient types not exported yet
      const mcpTools = this.mcpClient ? await this.mcpClient.tools() : {};

      const result = streamText({
        model: this.model,
        messages,
        tools: mcpTools as any, // eslint-disable-line @typescript-eslint/no-explicit-any
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
                arguments: toolCall.input || {},
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
