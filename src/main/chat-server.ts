/**
 * HTTP Chat Server - Proxy for OpenRouter API
 *
 * This server acts as a proxy that forwards requests to OpenRouter while
 * adding the API key from secure storage. This keeps the API key secure
 * in the main process while allowing the renderer to handle AI logic.
 *
 * Runs on localhost only for security.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { SecureStorageService } from './secure-storage-service';
import { logger } from './logger';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Retry configuration for network requests
 */
const RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Base delay in milliseconds (will be multiplied by attempt number) */
  baseDelayMs: 1000,
  /** Request timeout in milliseconds */
  timeoutMs: 30000
};

/**
 * Check if an error is a network error that should be retried
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network-related errors that are worth retrying
  return (
    name === 'aborterror' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('socket') ||
    message.includes('network') ||
    message.includes('failed to fetch')
  );
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

    // Handle POST /api/chat/proxy/* - forward to OpenRouter
    // The AI SDK appends /chat/completions to the baseURL
    if (req.method === 'POST' && req.url?.startsWith('/api/chat/proxy')) {
      await this.handleProxyRequest(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle proxy request - forward to OpenRouter with API key
   */
  private async handleProxyRequest(
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

    // Retry loop with exponential backoff for network errors
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        // Wait before retry (exponential backoff)
        if (attempt > 0) {
          const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
          logger.info('Retrying API request', { attempt, delayMs });
          await sleep(delayMs);
        }

        // Forward request to OpenRouter with API key and timeout
        const response = await fetchWithTimeout(
          OPENROUTER_API_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://flintnote.com',
              'X-Title': 'Flint Notes'
            },
            body: JSON.stringify(body)
          },
          RETRY_CONFIG.timeoutMs
        );

        // Copy response headers
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Forward content-type header
        const contentType = response.headers.get('content-type');
        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }

        res.writeHead(response.status);

        // Stream the response body
        if (response.body) {
          const reader = response.body.getReader();
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

        // Success - exit retry loop
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Check if headers have already been sent (streaming started)
        // If so, we can't retry - just end the response
        if (res.headersSent) {
          logger.error('Proxy request failed after streaming started', { error });
          res.end();
          return;
        }

        // Check if this is a retryable network error
        if (isRetryableError(error) && attempt < RETRY_CONFIG.maxRetries) {
          logger.warn('Retryable network error, will retry', {
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries: RETRY_CONFIG.maxRetries
          });
          continue;
        }

        // Not retryable or max retries reached - break out of loop
        break;
      }
    }

    // All retries failed - send error response
    logger.error('Proxy request failed after retries', {
      error: lastError?.message,
      attempts: RETRY_CONFIG.maxRetries + 1
    });

    const errorMessage = lastError?.message ?? 'Unknown error occurred';

    // Enhance error message for network errors
    let userMessage = errorMessage;
    if (lastError && isRetryableError(lastError)) {
      userMessage = `Network error: ${errorMessage}. Please check your internet connection.`;
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: userMessage,
        isNetworkError: lastError ? isRetryableError(lastError) : false,
        retriesAttempted: RETRY_CONFIG.maxRetries
      })
    );
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
