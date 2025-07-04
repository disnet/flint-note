/**
 * Get Notes Integration Tests
 *
 * Tests for the get_notes MCP tool functionality through the server
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
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

      const requestLine = JSON.stringify(request) + '\n';
      this.#serverProcess.stdin.write(requestLine);

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, INTEGRATION_CONSTANTS.REQUEST_TIMEOUT);

      const onData = (data: Buffer) => {
        const lines = data
          .toString()
          .split('\n')
          .filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              clearTimeout(timeout);
              this.#serverProcess.stdout.off('data', onData);
              if (response.error) {
                reject(new Error(`MCP Error: ${response.error.message}`));
              } else if (response.result && response.result.isError) {
                // Handle server-side errors returned as successful responses
                const errorText = response.result.content?.[0]?.text || 'Unknown error';
                reject(new Error(errorText));
              } else {
                resolve(response.result);
              }
              return;
            }
          } catch {
            // Ignore parsing errors for non-JSON lines
          }
        }
      };

      this.#serverProcess.stdout.on('data', onData);
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
}

describe('Get Notes Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('get-notes-integration');

    // Create basic note type structure
    await fs.mkdir(join(context.tempDir, 'general'), { recursive: true });
    await fs.mkdir(join(context.tempDir, 'project'), { recursive: true });
    await fs.mkdir(join(context.tempDir, 'daily'), { recursive: true });

    // Start server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    client = new MCPClient(context.serverProcess);
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  describe('Basic Batch Retrieval', () => {
    test('should retrieve multiple notes successfully', async () => {
      // Create multiple notes
      const note1Result = await client.callTool('create_note', {
        type: 'general',
        title: 'First Note',
        content: 'Content of first note'
      });
      const note1 = JSON.parse(note1Result.content[0].text);

      const note2Result = await client.callTool('create_note', {
        type: 'general',
        title: 'Second Note',
        content: 'Content of second note'
      });
      const note2 = JSON.parse(note2Result.content[0].text);

      const note3Result = await client.callTool('create_note', {
        type: 'project',
        title: 'Project Note',
        content: 'Content of project note'
      });
      const note3 = JSON.parse(note3Result.content[0].text);

      // Use get_notes to retrieve all notes
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note1.id, note2.id, note3.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.success, true, 'Should be successful');
      assert.strictEqual(
        responseData.total_requested,
        3,
        'Should have requested 3 notes'
      );
      assert.strictEqual(
        responseData.successful,
        3,
        'Should have 3 successful retrievals'
      );
      assert.strictEqual(responseData.failed, 0, 'Should have 0 failed retrievals');
      assert.strictEqual(responseData.results.length, 3, 'Should have 3 results');

      // Check all results are successful
      responseData.results.forEach((result: any, index: number) => {
        assert.strictEqual(result.success, true, `Result ${index} should be successful`);
        assert.ok(result.note, `Result ${index} should have a note`);
        assert.ok(result.note.content_hash, `Result ${index} should have content hash`);
      });

      // Check specific note content
      const firstResult = responseData.results.find((r: any) => r.note?.id === note1.id);
      assert.ok(firstResult, 'Should find first note in results');
      assert.strictEqual(firstResult.note.title, 'First Note');
      assert.strictEqual(firstResult.note.content, 'Content of first note');

      const projectResult = responseData.results.find(
        (r: any) => r.note?.id === note3.id
      );
      assert.ok(projectResult, 'Should find project note in results');
      assert.strictEqual(projectResult.note.type, 'project');
    });

    test('should handle empty identifiers array', async () => {
      const result = await client.callTool('get_notes', {
        identifiers: []
      });

      const responseData = JSON.parse(result.content[0].text);

      assert.strictEqual(responseData.success, true, 'Should be successful');
      assert.strictEqual(
        responseData.total_requested,
        0,
        'Should have requested 0 notes'
      );
      assert.strictEqual(
        responseData.successful,
        0,
        'Should have 0 successful retrievals'
      );
      assert.strictEqual(responseData.failed, 0, 'Should have 0 failed retrievals');
      assert.strictEqual(responseData.results.length, 0, 'Should have 0 results');
    });

    test('should handle single note retrieval', async () => {
      // Create a single note
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Single Note',
        content: 'Content of single note'
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Use get_notes to retrieve it
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.success, true, 'Should be successful');
      assert.strictEqual(responseData.total_requested, 1, 'Should have requested 1 note');
      assert.strictEqual(
        responseData.successful,
        1,
        'Should have 1 successful retrieval'
      );
      assert.strictEqual(responseData.failed, 0, 'Should have 0 failed retrievals');
      assert.strictEqual(responseData.results.length, 1, 'Should have 1 result');
      assert.strictEqual(
        responseData.results[0].success,
        true,
        'Result should be successful'
      );
      assert.strictEqual(
        responseData.results[0].note.id,
        note.id,
        'Should have correct note ID'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent notes gracefully', async () => {
      // Create one valid note
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Existing Note',
        content: 'Content of existing note'
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Request mix of valid and invalid notes
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note.id, 'non-existent/note.md', 'another/missing.md']
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.success, true, 'Should be successful overall');
      assert.strictEqual(
        responseData.total_requested,
        3,
        'Should have requested 3 notes'
      );
      assert.strictEqual(
        responseData.successful,
        1,
        'Should have 1 successful retrieval'
      );
      assert.strictEqual(responseData.failed, 2, 'Should have 2 failed retrievals');
      assert.strictEqual(responseData.results.length, 3, 'Should have 3 results');

      // First should be successful
      assert.strictEqual(
        responseData.results[0].success,
        true,
        'First result should be successful'
      );
      assert.ok(responseData.results[0].note, 'First result should have a note');

      // Others should fail
      assert.strictEqual(
        responseData.results[1].success,
        false,
        'Second result should fail'
      );
      assert.ok(responseData.results[1].error, 'Second result should have error message');
      assert.ok(
        responseData.results[1].error.includes('Note not found'),
        'Should have appropriate error message'
      );

      assert.strictEqual(
        responseData.results[2].success,
        false,
        'Third result should fail'
      );
      assert.ok(responseData.results[2].error, 'Third result should have error message');
    });

    test('should handle invalid identifiers', async () => {
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [
          '',
          'invalid-format',
          '../../../etc/passwd',
          'general/nonexistent.md'
        ]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.success, true, 'Should be successful overall');
      assert.strictEqual(
        responseData.total_requested,
        4,
        'Should have requested 4 notes'
      );
      assert.strictEqual(
        responseData.successful,
        0,
        'Should have 0 successful retrievals'
      );
      assert.strictEqual(responseData.failed, 4, 'Should have 4 failed retrievals');
      assert.strictEqual(responseData.results.length, 4, 'Should have 4 results');

      // All should fail
      responseData.results.forEach((result: any, index: number) => {
        assert.strictEqual(result.success, false, `Result ${index} should fail`);
        assert.ok(result.error, `Result ${index} should have error message`);
      });
    });
  });

  describe('Content and Metadata Handling', () => {
    test('should preserve all metadata in batch retrieval', async () => {
      // Create note with metadata
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Rich Metadata Note',
        content: '# Rich Metadata Note\n\nThis note has metadata.',
        metadata: {
          tags: ['test', 'metadata'],
          priority: 'high',
          custom_field: 'custom_value'
        }
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Retrieve with get_notes
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.results.length, 1, 'Should return one result');
      assert.strictEqual(responseData.results[0].success, true, 'Should be successful');

      const retrievedNote = responseData.results[0].note;
      assert.strictEqual(retrievedNote.title, 'Rich Metadata Note');
      assert.deepStrictEqual(retrievedNote.metadata.tags, ['test', 'metadata']);
      assert.strictEqual(retrievedNote.metadata.priority, 'high');
      assert.strictEqual(retrievedNote.metadata.custom_field, 'custom_value');
    });

    test('should include content hash for optimistic locking', async () => {
      // Create note
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Hash Test Note',
        content: 'Content for hash testing'
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Retrieve with get_notes
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.results[0].success, true, 'Should be successful');
      assert.ok(responseData.results[0].note.content_hash, 'Should have content hash');
      assert.ok(
        responseData.results[0].note.content_hash.startsWith('sha256:'),
        'Should be SHA256 hash'
      );
    });

    test('should handle notes from different types', async () => {
      // Create notes of different types
      const generalResult = await client.callTool('create_note', {
        type: 'general',
        title: 'General Note',
        content: 'General content'
      });
      const general = JSON.parse(generalResult.content[0].text);

      const projectResult = await client.callTool('create_note', {
        type: 'project',
        title: 'Project Note',
        content: 'Project content'
      });
      const project = JSON.parse(projectResult.content[0].text);

      const dailyResult = await client.callTool('create_note', {
        type: 'daily',
        title: 'Daily Note',
        content: 'Daily content',
        metadata: {
          date: '2024-01-01'
        }
      });
      const daily = JSON.parse(dailyResult.content[0].text);

      // Retrieve all with get_notes
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [general.id, project.id, daily.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(responseData.results.length, 3, 'Should return all notes');
      assert.strictEqual(responseData.successful, 3, 'All should be successful');

      // Check types are preserved
      const types = responseData.results.map((r: any) => r.note.type);
      assert.ok(types.includes('general'), 'Should include general note');
      assert.ok(types.includes('project'), 'Should include project note');
      assert.ok(types.includes('daily'), 'Should include daily note');
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle duplicate identifiers', async () => {
      // Create a note
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Duplicate Test',
        content: 'Content'
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Request the same note multiple times
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: [note.id, note.id, note.id]
      });

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(
        responseData.total_requested,
        3,
        'Should have requested 3 notes'
      );
      assert.strictEqual(responseData.successful, 3, 'All should be successful');
      assert.strictEqual(
        responseData.results.length,
        3,
        'Should return result for each request'
      );

      responseData.results.forEach((result: any, index: number) => {
        assert.strictEqual(result.success, true, `Result ${index} should be successful`);
        assert.strictEqual(
          result.note.id,
          note.id,
          `Result ${index} should have correct ID`
        );
      });
    });

    test('should handle large batch retrieval', async () => {
      // Create 3 notes
      const noteIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const noteResult = await client.callTool('create_note', {
          type: 'general',
          title: `Batch Note ${i}`,
          content: `Content for note ${i}`
        });
        const note = JSON.parse(noteResult.content[0].text);
        noteIds.push(note.id);
      }

      // Retrieve all notes
      const startTime = Date.now();
      const getNotesResult = await client.callTool('get_notes', {
        identifiers: noteIds
      });
      const endTime = Date.now();

      const responseData = JSON.parse(getNotesResult.content[0].text);

      assert.strictEqual(
        responseData.total_requested,
        3,
        'Should have requested 3 notes'
      );
      assert.strictEqual(responseData.successful, 3, 'All should be successful');
      assert.strictEqual(responseData.results.length, 3, 'Should return all 3 notes');

      // Performance check - should complete in reasonable time
      const duration = endTime - startTime;
      assert.ok(
        duration < 2000,
        `Should complete in under 2 seconds (took ${duration}ms)`
      );
    });
  });

  describe('Comparison with Single get_note', () => {
    test('should return same data as individual get_note calls', async () => {
      // Create a note
      const noteResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Comparison Test',
        content: 'Content for comparison testing'
      });
      const note = JSON.parse(noteResult.content[0].text);

      // Get note individually
      const singleResult = await client.callTool('get_note', {
        identifier: note.id
      });
      const singleNote = JSON.parse(singleResult.content[0].text);

      // Get note with batch
      const batchResult = await client.callTool('get_notes', {
        identifiers: [note.id]
      });
      const batchData = JSON.parse(batchResult.content[0].text);
      const batchNote = batchData.results[0].note;

      // Compare key properties
      assert.strictEqual(batchNote.id, singleNote.id, 'IDs should match');
      assert.strictEqual(batchNote.title, singleNote.title, 'Titles should match');
      assert.strictEqual(batchNote.content, singleNote.content, 'Content should match');
      assert.strictEqual(
        batchNote.content_hash,
        singleNote.content_hash,
        'Content hashes should match'
      );
      assert.strictEqual(batchNote.type, singleNote.type, 'Types should match');
      assert.deepStrictEqual(
        batchNote.metadata,
        singleNote.metadata,
        'Metadata should match'
      );
    });
  });

  describe('Tool Schema Validation', () => {
    test('should reject missing identifiers parameter', async () => {
      try {
        await client.callTool('get_notes', {});
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw an error');
        assert.ok(
          error.message.includes('identifiers'),
          'Error should mention identifiers'
        );
      }
    });

    test('should reject invalid identifiers parameter type', async () => {
      try {
        await client.callTool('get_notes', {
          identifiers: 'not-an-array'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw an error');
      }
    });
  });
});
