/**
 * Field Filtering Integration Tests
 *
 * Tests for field filtering functionality in the MCP server, including
 * get_note, get_notes, and all search operations.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

/**
 * MCP client simulation for sending requests to the server
 */
class MCPClient {
  #serverProcess: any;

  constructor(serverProcess: any) {
    this.#serverProcess = serverProcess;
  }

  async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2);
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      let responseData = '';
      let hasResponded = false;

      const timeout = setTimeout(() => {
        if (!hasResponded) {
          reject(new Error(`Request timeout after 5000ms: ${method}`));
        }
      }, 5000);

      // Listen for response on stdout
      const onData = (data: Buffer) => {
        responseData += data.toString();

        // Try to parse complete JSON responses
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout?.off('data', onData);

                if (response.error) {
                  reject(new Error(`MCP Error: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Continue parsing - might be partial JSON
            }
          }
        }
      };

      this.#serverProcess.stdout?.on('data', onData);

      // Send the request
      this.#serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
}

describe('Field Filtering Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;
  let testNoteId: string;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('field-filtering');

    // Start server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    client = new MCPClient(context.serverProcess);

    // Create a simple test note
    const noteResult = await client.callTool('create_note', {
      type: 'general',
      title: 'Test Note',
      content: 'This is a test note with some content.',
      metadata: {
        tags: ['test', 'example'],
        custom_field: 'custom_value'
      }
    });

    const noteData = JSON.parse(noteResult.content[0].text);
    testNoteId = noteData.id;
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  describe('get_note field filtering', () => {
    test('should return all fields when no fields parameter provided', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId
      });

      assert.ok(response, 'Should return response');
      assert.ok(response.content, 'Should return content array');
      const note = JSON.parse(response.content[0].text);

      // Should have all core fields
      assert.ok(note.id, 'Should have id');
      assert.ok(note.type, 'Should have type');
      assert.ok(note.title, 'Should have title');
      assert.ok(note.content, 'Should have content');
      assert.ok(note.content_hash, 'Should have content_hash');
      assert.ok(note.created, 'Should have created');
      assert.ok(note.updated, 'Should have updated');
      assert.ok(note.metadata, 'Should have metadata');
    });

    test('should filter to only requested fields', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: ['id', 'title', 'content_hash']
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      // Should only have requested fields
      assert.ok(note.id, 'Should have id');
      assert.ok(note.title, 'Should have title');
      assert.ok(note.content_hash, 'Should have content_hash');

      // Should not have unrequested fields
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.type, undefined, 'Should not have type');
      assert.strictEqual(note.metadata, undefined, 'Should not have metadata');
    });

    test('should handle metadata field filtering', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: ['id', 'metadata.tags', 'metadata.custom_field']
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      assert.ok(note.id, 'Should have id');
      assert.ok(note.metadata, 'Should have metadata');
      assert.deepStrictEqual(note.metadata.tags, ['test', 'example']);
      assert.strictEqual(note.metadata.custom_field, 'custom_value');

      // Should not have other fields
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.title, undefined, 'Should not have title');
    });

    test('should handle metadata wildcard filtering', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: ['id', 'metadata.*']
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      assert.ok(note.id, 'Should have id');
      assert.ok(note.metadata, 'Should have metadata');
      assert.ok(note.metadata.tags, 'Should have metadata.tags');
      assert.ok(note.metadata.custom_field, 'Should have metadata.custom_field');

      // Should not have core fields
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.title, undefined, 'Should not have title');
    });

    test('should handle empty fields array', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: []
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      // Should return all fields when fields array is empty
      assert.ok(note.id, 'Should have id');
      assert.ok(note.title, 'Should have title');
      assert.ok(note.content, 'Should have content');
      assert.ok(note.metadata, 'Should have metadata');
    });
  });

  describe('get_notes field filtering', () => {
    test('should filter fields for batch retrieval', async () => {
      // Create another note for batch testing
      const note2Result = await client.callTool('create_note', {
        type: 'general',
        title: 'Second Test Note',
        content: 'This is the second test note.',
        metadata: {
          tags: ['test', 'batch'],
          priority: 'high'
        }
      });
      const note2Data = JSON.parse(note2Result.content[0].text);

      const response = await client.callTool('get_notes', {
        identifiers: [testNoteId, note2Data.id],
        fields: ['id', 'title', 'type', 'metadata.tags']
      });

      assert.ok(response, 'Should return response');
      const result = JSON.parse(response.content[0].text);

      assert.strictEqual(result.success, true, 'Should be successful');
      assert.strictEqual(result.results.length, 2, 'Should have 2 results');

      for (const noteResult of result.results) {
        assert.strictEqual(noteResult.success, true, 'Each note should be successful');
        const note = noteResult.note;

        assert.ok(note.id, 'Should have id');
        assert.ok(note.title, 'Should have title');
        assert.ok(note.type, 'Should have type');
        assert.ok(note.metadata, 'Should have metadata');
        assert.ok(note.metadata.tags, 'Should have metadata.tags');

        // Should not have unrequested fields
        assert.strictEqual(note.content, undefined, 'Should not have content');
        assert.strictEqual(note.content_hash, undefined, 'Should not have content_hash');
        assert.strictEqual(note.created, undefined, 'Should not have created');
      }
    });

    test('should handle mixed success/failure with field filtering', async () => {
      const response = await client.callTool('get_notes', {
        identifiers: [testNoteId, 'general/nonexistent.md'],
        fields: ['id', 'title']
      });

      assert.ok(response, 'Should return response');
      const result = JSON.parse(response.content[0].text);

      assert.strictEqual(result.total_requested, 2, 'Should have 2 requested');
      assert.strictEqual(result.successful, 1, 'Should have 1 successful');
      assert.strictEqual(result.failed, 1, 'Should have 1 failed');

      // Successful note should be filtered
      const successResult = result.results.find((r: any) => r.success);
      assert.ok(successResult, 'Should have successful result');
      assert.ok(successResult.note.id, 'Should have id');
      assert.ok(successResult.note.title, 'Should have title');
      assert.strictEqual(
        successResult.note.content,
        undefined,
        'Should not have content'
      );

      // Failed note should have error
      const failureResult = result.results.find((r: any) => !r.success);
      assert.ok(failureResult, 'Should have failure result');
      assert.ok(failureResult.error, 'Should have error');
    });
  });

  describe('search_notes field filtering', () => {
    test('should filter fields in simple search results', async () => {
      const response = await client.callTool('search_notes', {
        query: 'test',
        fields: ['id', 'title', 'type']
      });

      assert.ok(response, 'Should return response');
      const results = JSON.parse(response.content[0].text);

      assert.ok(Array.isArray(results), 'Should return array');
      assert.ok(results.length > 0, 'Should have results');

      for (const result of results) {
        assert.ok(result.id, 'Should have id');
        assert.ok(result.title, 'Should have title');
        assert.ok(result.type, 'Should have type');

        // Other fields should be filtered out
        assert.strictEqual(result.content, undefined, 'Should not have content');
        assert.strictEqual(result.created, undefined, 'Should not have created');
        assert.strictEqual(result.metadata, undefined, 'Should not have metadata');
      }
    });

    test('should handle metadata filtering in search results', async () => {
      const response = await client.callTool('search_notes', {
        query: 'test',
        fields: ['id', 'metadata.tags']
      });

      assert.ok(response, 'Should return response');
      const results = JSON.parse(response.content[0].text);

      assert.ok(Array.isArray(results), 'Should return array');
      assert.ok(results.length > 0, 'Should have results');

      for (const result of results) {
        assert.ok(result.id, 'Should have id');
        assert.ok(result.metadata, 'Should have metadata');
        assert.ok(result.metadata.tags, 'Should have metadata.tags');

        // Other fields should be filtered out
        assert.strictEqual(result.title, undefined, 'Should not have title');
        assert.strictEqual(result.content, undefined, 'Should not have content');
      }
    });
  });

  describe('search_notes_advanced field filtering', () => {
    test('should filter fields in advanced search results', async () => {
      const response = await client.callTool('search_notes_advanced', {
        type: 'general',
        fields: ['id', 'title', 'metadata.tags']
      });

      assert.ok(response, 'Should return response');
      const searchResponse = JSON.parse(response.content[0].text);

      assert.ok(searchResponse.results, 'Should have results');
      assert.ok(searchResponse.total !== undefined, 'Should have total');

      for (const result of searchResponse.results) {
        assert.ok(result.id, 'Should have id');
        assert.ok(result.title, 'Should have title');
        assert.ok(result.metadata, 'Should have metadata');
        assert.ok(result.metadata.tags, 'Should have metadata.tags');

        // Other fields should be filtered
        assert.strictEqual(result.content, undefined, 'Should not have content');
        assert.strictEqual(result.type, undefined, 'Should not have type');
      }
    });
  });

  describe('Common field filtering patterns', () => {
    test('should handle listing pattern efficiently', async () => {
      // Create another note for testing
      const note2Result = await client.callTool('create_note', {
        type: 'general',
        title: 'Listing Test Note',
        content: 'This is for testing listing patterns.',
        metadata: {
          tags: ['listing', 'test'],
          status: 'active'
        }
      });
      const note2Data = JSON.parse(note2Result.content[0].text);

      const listingFields = [
        'id',
        'type',
        'title',
        'created',
        'updated',
        'metadata.tags',
        'metadata.status'
      ];

      const response = await client.callTool('get_notes', {
        identifiers: [testNoteId, note2Data.id],
        fields: listingFields
      });

      assert.ok(response, 'Should return response');
      const result = JSON.parse(response.content[0].text);

      for (const noteResult of result.results) {
        if (noteResult.success) {
          const note = noteResult.note;
          assert.ok(note.id, 'Should have id');
          assert.ok(note.type, 'Should have type');
          assert.ok(note.title, 'Should have title');
          assert.ok(note.created, 'Should have created');
          assert.ok(note.updated, 'Should have updated');
          assert.ok(note.metadata, 'Should have metadata');

          // Content should be excluded for performance
          assert.strictEqual(note.content, undefined, 'Should not have content');
          assert.strictEqual(
            note.content_hash,
            undefined,
            'Should not have content_hash'
          );
        }
      }
    });

    test('should handle validation pattern for optimistic locking', async () => {
      const validationFields = ['id', 'content_hash'];

      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: validationFields
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      assert.ok(note.id, 'Should have id');
      assert.ok(note.content_hash, 'Should have content_hash');

      // Everything else should be excluded
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.title, undefined, 'Should not have title');
      assert.strictEqual(note.metadata, undefined, 'Should not have metadata');
    });

    test('should handle content update pattern', async () => {
      const contentUpdateFields = ['content', 'content_hash'];

      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: contentUpdateFields
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      assert.ok(note.content, 'Should have content');
      assert.ok(note.content_hash, 'Should have content_hash');

      // Metadata and other fields should be excluded
      assert.strictEqual(note.id, undefined, 'Should not have id');
      assert.strictEqual(note.title, undefined, 'Should not have title');
      assert.strictEqual(note.metadata, undefined, 'Should not have metadata');
    });

    test('should handle metadata-only pattern', async () => {
      const metadataOnlyFields = ['id', 'type', 'metadata.*', 'created', 'updated'];

      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: metadataOnlyFields
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      assert.ok(note.id, 'Should have id');
      assert.ok(note.type, 'Should have type');
      assert.ok(note.created, 'Should have created');
      assert.ok(note.updated, 'Should have updated');
      assert.ok(note.metadata, 'Should have metadata');

      // Content should be excluded
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.content_hash, undefined, 'Should not have content_hash');
      assert.strictEqual(note.title, undefined, 'Should not have title');
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle invalid field specifications gracefully', async () => {
      const response = await client.callTool('get_note', {
        identifier: testNoteId,
        fields: ['id', 'nonexistent.field', 'metadata.missing', 'title']
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      // Should return valid fields and silently ignore invalid ones
      assert.ok(note.id, 'Should have id');
      assert.ok(note.title, 'Should have title');
      assert.strictEqual(note.content, undefined, 'Should not have content');
      assert.strictEqual(note.metadata, undefined, 'Should not have metadata');
    });

    test('should handle null note with field filtering', async () => {
      const response = await client.callTool('get_note', {
        identifier: 'general/nonexistent.md',
        fields: ['id', 'title']
      });

      assert.ok(response, 'Should return response');
      const note = JSON.parse(response.content[0].text);

      // Should return null when note doesn't exist
      assert.strictEqual(note, null, 'Should return null for nonexistent note');
    });
  });
});
