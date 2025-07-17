import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class AIService {
  private model: ChatOpenAI;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
    [];

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
  }

  async sendMessage(userMessage: string): Promise<string> {
    try {
      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Prepare messages for the model
      const messages = [
        new SystemMessage(
          'You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.'
        ),
        ...this.conversationHistory.map((msg) =>
          msg.role === 'user'
            ? new HumanMessage(msg.content)
            : new SystemMessage(msg.content)
        )
      ];

      // Get response from the model
      const response = await this.model.invoke(messages);
      const assistantMessage = response.content as string;

      // Add assistant response to conversation history
      this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return assistantMessage;
    } catch (error) {
      console.error('AI Service Error:', error);

      // Fallback to mock response if AI service fails
      const fallbackResponses = [
        "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again later.",
        "It seems there's a temporary issue with my AI capabilities. Your message was received, but I can't process it at the moment.",
        "I'm experiencing some technical difficulties. Please check your API configuration and try again."
      ];

      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
  }

  clearConversation(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [...this.conversationHistory];
  }
}
