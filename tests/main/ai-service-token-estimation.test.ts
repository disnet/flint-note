import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIService } from '../../src/main/ai-service';
import type { ModelMessage } from 'ai';

// Mock the logger to avoid console output in tests
vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock SecureStorageService
vi.mock('../../src/main/secure-storage-service', () => ({
  SecureStorageService: class {
    async get() {
      return 'mock-api-key';
    }
    async set() {}
    async delete() {}
  }
}));

describe('AIService - Token Estimation', () => {
  let aiService: AIService;

  beforeEach(() => {
    // Create AI service with minimal dependencies for testing
    aiService = new AIService(null, null, null);
  });

  describe('estimateTokens with string input', () => {
    it('should estimate tokens for a simple string', () => {
      const text = 'Hello, world!';
      const tokens = aiService.estimateTokens(text);

      // Expected: ceil(13 / 3.5) = ceil(3.71) = 4
      expect(tokens).toBe(Math.ceil(text.length / 3.5));
    });

    it('should handle empty string', () => {
      const tokens = aiService.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(1000);
      const tokens = aiService.estimateTokens(text);

      // Expected: ceil(1000 / 3.5) = 286
      expect(tokens).toBe(286);
    });
  });

  describe('estimateTokens with text parts', () => {
    it('should count text content in messages', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: 'Hello, how are you?'
        },
        {
          role: 'assistant',
          content: 'I am doing well, thank you!'
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const totalLength =
        'Hello, how are you?'.length + 'I am doing well, thank you!'.length;

      expect(tokens).toBe(Math.ceil(totalLength / 3.5));
    });

    it('should count text parts in array content', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const totalLength = 'First part'.length + 'Second part'.length;

      expect(tokens).toBe(Math.ceil(totalLength / 3.5));
    });

    it('should handle empty message arrays', () => {
      const messages: ModelMessage[] = [];
      const tokens = aiService.estimateTokens(messages);

      expect(tokens).toBe(0);
    });
  });

  describe('estimateTokens with reasoning parts', () => {
    it('should count reasoning text', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'Let me think about this problem...' }]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const expectedLength = 'Let me think about this problem...'.length;

      expect(tokens).toBe(Math.ceil(expectedLength / 3.5));
    });

    it('should count both text and reasoning parts', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Analyzing the question...' },
            { type: 'text', text: 'Here is my answer.' }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const totalLength =
        'Analyzing the question...'.length + 'Here is my answer.'.length;

      expect(tokens).toBe(Math.ceil(totalLength / 3.5));
    });
  });

  describe('estimateTokens with tool calls', () => {
    it('should count tool call with simple arguments', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'get_note',
              input: { id: 'note/123' }
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'get_note'.length;
      const argsLength = JSON.stringify({ id: 'note/123' }).length;

      expect(tokens).toBe(Math.ceil((toolNameLength + argsLength) / 3.5));
    });

    it('should count tool call with complex arguments', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_456',
              toolName: 'search_notes',
              input: {
                query: 'machine learning',
                limit: 10,
                filters: { tags: ['ai', 'research'] }
              }
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'search_notes'.length;
      const argsLength = JSON.stringify({
        query: 'machine learning',
        limit: 10,
        filters: { tags: ['ai', 'research'] }
      }).length;

      expect(tokens).toBe(Math.ceil((toolNameLength + argsLength) / 3.5));
    });

    it('should handle tool call with empty input', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_789',
              toolName: 'get_vault_info',
              input: {}
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'get_vault_info'.length;
      const argsLength = JSON.stringify({}).length; // '{}'

      expect(tokens).toBe(Math.ceil((toolNameLength + argsLength) / 3.5));
    });
  });

  describe('estimateTokens with tool results', () => {
    it('should count tool result with string output', () => {
      const messages: ModelMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: 'get_note',
              output: 'Note content here'
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'get_note'.length;
      const outputLength = 'Note content here'.length;

      expect(tokens).toBe(Math.ceil((toolNameLength + outputLength) / 3.5));
    });

    it('should count tool result with object output', () => {
      const messages: ModelMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_456',
              toolName: 'search_notes',
              output: {
                results: [
                  { id: 'note/1', title: 'First Note' },
                  { id: 'note/2', title: 'Second Note' }
                ],
                total: 2
              }
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'search_notes'.length;
      const outputLength = JSON.stringify({
        results: [
          { id: 'note/1', title: 'First Note' },
          { id: 'note/2', title: 'Second Note' }
        ],
        total: 2
      }).length;

      expect(tokens).toBe(Math.ceil((toolNameLength + outputLength) / 3.5));
    });

    it('should count tool result with large output', () => {
      const largeContent = 'x'.repeat(5000);
      const messages: ModelMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_789',
              toolName: 'read_file',
              output: largeContent
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const toolNameLength = 'read_file'.length;
      const outputLength = largeContent.length;

      expect(tokens).toBe(Math.ceil((toolNameLength + outputLength) / 3.5));
    });
  });

  describe('estimateTokens with images', () => {
    it('should estimate fixed token cost for images', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: 'data:image/png;base64,iVBORw0KGgoAAAANS...'
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);

      // Images cost ~1300 tokens, converted to character estimate: 1300 * 3.5 = 4550
      expect(tokens).toBe(Math.ceil(4550 / 3.5));
    });

    it('should count multiple images', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image', image: 'data:image/png;base64,abc123...' },
            { type: 'image', image: 'data:image/jpeg;base64,def456...' }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);

      // 2 images: 2 * 1300 * 3.5 = 9100 characters
      expect(tokens).toBe(Math.ceil(9100 / 3.5));
    });
  });

  describe('estimateTokens with files', () => {
    it('should count file with base64 data', () => {
      const base64Data = 'SGVsbG8gd29ybGQ='; // "Hello world" in base64
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: base64Data,
              mediaType: 'text/plain',
              filename: 'test.txt'
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const expectedLength = base64Data.length + 'test.txt'.length;

      expect(tokens).toBe(Math.ceil(expectedLength / 3.5));
    });

    it('should count file with URL', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/file.pdf'),
              mediaType: 'application/pdf',
              filename: 'document.pdf'
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const urlLength = 'https://example.com/file.pdf'.length;
      const filenameLength = 'document.pdf'.length;

      expect(tokens).toBe(Math.ceil((urlLength + filenameLength) / 3.5));
    });

    it('should handle file without filename', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64data',
              mediaType: 'text/plain'
            }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      const expectedLength = 'base64data'.length;

      expect(tokens).toBe(Math.ceil(expectedLength / 3.5));
    });
  });

  describe('estimateTokens with mixed content', () => {
    it('should count all part types in a single message', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Thinking about the request...' },
            { type: 'text', text: 'Let me search for that.' },
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'search_notes',
              input: { query: 'test' }
            }
          ]
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'search_notes',
              output: { results: [], total: 0 }
            }
          ]
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'No results found.' }]
        }
      ];

      const tokens = aiService.estimateTokens(messages);

      // Calculate expected total
      let expectedLength = 0;
      expectedLength += 'Thinking about the request...'.length;
      expectedLength += 'Let me search for that.'.length;
      expectedLength += 'search_notes'.length + JSON.stringify({ query: 'test' }).length;
      expectedLength +=
        'search_notes'.length + JSON.stringify({ results: [], total: 0 }).length;
      expectedLength += 'No results found.'.length;

      expect(tokens).toBe(Math.ceil(expectedLength / 3.5));
    });

    it('should handle conversation with multiple message types', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: 'Find notes about AI'
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Searching for AI notes...' },
            {
              type: 'tool-call',
              toolCallId: 'call_search',
              toolName: 'search_notes',
              input: { query: 'AI' }
            }
          ]
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_search',
              toolName: 'search_notes',
              output: 'Found 5 notes'
            }
          ]
        },
        {
          role: 'assistant',
          content: 'I found 5 notes about AI.'
        }
      ];

      const tokens = aiService.estimateTokens(messages);

      // Calculate total
      let expectedLength = 0;
      expectedLength += 'Find notes about AI'.length;
      expectedLength += 'Searching for AI notes...'.length;
      expectedLength += 'search_notes'.length + JSON.stringify({ query: 'AI' }).length;
      expectedLength += 'search_notes'.length + 'Found 5 notes'.length;
      expectedLength += 'I found 5 notes about AI.'.length;

      expect(tokens).toBe(Math.ceil(expectedLength / 3.5));
    });

    it('should handle multimodal message with text and image', () => {
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image', image: 'data:image/png;base64,...' }
          ]
        }
      ];

      const tokens = aiService.estimateTokens(messages);

      // Text + image cost
      const textLength = 'What is in this image?'.length;
      const imageTokens = 1300 * 3.5; // Fixed image cost

      expect(tokens).toBe(Math.ceil((textLength + imageTokens) / 3.5));
    });
  });

  describe('estimateTokens edge cases', () => {
    it('should handle messages with no content parts', () => {
      const messages: ModelMessage[] = [
        {
          role: 'assistant',
          content: []
        }
      ];

      const tokens = aiService.estimateTokens(messages);
      expect(tokens).toBe(0);
    });

    it('should handle very long conversation', () => {
      const messages: ModelMessage[] = [];

      // Create 100 messages
      for (let i = 0; i < 100; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message number ${i}`
        });
      }

      const tokens = aiService.estimateTokens(messages);

      // Should handle without crashing
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
