/**
 * HTTP Chat Server for AI SDK useChat integration
 *
 * This server provides HTTP endpoints that the @ai-sdk/svelte useChat hook
 * can communicate with. It runs on localhost only for security.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { SecureStorageService } from './secure-storage-service';
import { logger } from './logger';

interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// UIMessage format from @ai-sdk/svelte Chat class
interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: UIMessagePart[];
}

interface ChatRequestBody {
  messages: UIMessage[];
  model?: string;
}

/**
 * Convert UIMessage to ModelMessage format
 * UIMessage uses parts array, ModelMessage uses content string
 */
function convertToModelMessage(msg: UIMessage): ModelMessage {
  // If it already has content string, use it
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: msg.content };
  }

  // Convert parts array to content string
  if (Array.isArray(msg.parts)) {
    const textContent = msg.parts
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('');
    return { role: msg.role, content: textContent };
  }

  return { role: msg.role, content: '' };
}

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Flint, a note-taking application. You help users with:
- Answering questions about their notes and knowledge
- Brainstorming and generating ideas
- Writing assistance and editing
- General questions and problem-solving

Be concise, helpful, and friendly. When relevant, suggest how users might organize their thoughts into notes.`;

export class ChatServer {
  private server: Server | null = null;
  private port: number = 0;

  constructor(private secureStorage: SecureStorageService) {}

  /**
   * Start the HTTP server on an available port
   * Returns the port number the server is listening on
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((error) => {
          logger.error('Chat server request error', { error });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });

      // Listen on localhost only (127.0.0.1) for security
      // Port 0 lets the OS assign an available port
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          logger.info('Chat server started', { port: this.port });
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', (error) => {
        logger.error('Chat server error', { error });
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Chat server stopped');
          this.server = null;
          this.port = 0;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set CORS headers for Electron renderer
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only handle POST /api/chat
    if (req.method !== 'POST' || req.url !== '/api/chat') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    await this.handleChatRequest(req, res);
  }

  /**
   * Handle chat request - stream response using AI SDK
   */
  private async handleChatRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Parse request body
    const body = await this.parseBody(req);
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    const { messages, model } = body as ChatRequestBody;

    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Messages array required' }));
      return;
    }

    // Get API key from secure storage
    const { key: apiKey } = await this.secureStorage.getApiKey('openrouter');
    if (!apiKey || apiKey.trim() === '') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'API key not configured. Please add your OpenRouter API key in Settings.'
        })
      );
      return;
    }

    try {
      // Create OpenRouter provider with API key
      const openrouter = createOpenRouter({
        apiKey
      });

      // Convert UIMessages to ModelMessages and add system prompt
      const convertedMessages = messages.map(convertToModelMessage);
      const messagesWithSystem: ModelMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...convertedMessages
      ];

      // Stream the response
      const result = streamText({
        model: openrouter(model || DEFAULT_MODEL),
        messages: messagesWithSystem
      });

      // Convert to text stream response and pipe to response
      const dataStreamResponse = result.toTextStreamResponse();

      // Copy headers from the data stream response
      const headers = dataStreamResponse.headers;
      headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Add CORS header
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.writeHead(dataStreamResponse.status);

      // Stream the body
      if (dataStreamResponse.body) {
        const reader = dataStreamResponse.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
          await pump();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (error) {
      logger.error('Chat request failed', { error });

      // Check if headers have already been sent (streaming started)
      if (res.headersSent) {
        res.end();
        return;
      }

      // Handle specific error types
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  /**
   * Parse JSON body from request
   */
  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => {
        resolve(null);
      });
    });
  }
}
