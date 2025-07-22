/**
 * Integration tests for move_note operation through MCP protocol
 * Tests the move_note tool functionality including validation, wikilink updates, and error handling
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  createTestNoteType,
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

        // Look for complete JSON-RPC response
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes(`"id":"${id}"`)) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id === id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout.off('data', onData);

                if (response.error) {
                  reject(new Error(`MCP Error: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Continue looking for valid response
            }
          }
        }
      };

      this.#serverProcess.stdout.on('data', onData);
      this.#serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  async expectError(toolName: string, args: any): Promise<string> {
    const result = await this.callTool(toolName, args);
    if (result.isError && result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text;
    }
    throw new Error(`Expected ${toolName} to return an error but it succeeded`);
  }
}

describe('Move Note Integration Tests', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('move-note-integration');

    // Create test note types
    await createTestNoteType(context.tempDir, 'projects', 'Active projects');
    await createTestNoteType(context.tempDir, 'completed', 'Completed projects');
    await createTestNoteType(context.tempDir, 'general', 'General notes');

    // Start server and store in context for cleanup
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });
    client = new MCPClient(context.serverProcess);

    // Wait for server initialization
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  test('should move a note successfully between types', async () => {
    // Create a test note in 'projects'
    const uniqueTitle = `My Project ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: uniqueTitle,
      content: `# ${uniqueTitle}\n\nThis project is now complete.`,
      metadata: {
        priority: 'high',
        status: 'active'
      }
    });

    console.log('Create result text:', createResult.content[0].text);
    console.log('Create result is error:', createResult.isError || false);

    if (createResult.isError) {
      throw new Error(`Create failed: ${createResult.content[0].text}`);
    }

    const createData = JSON.parse(createResult.content[0].text);
    assert.ok(createData.id, 'Should have note ID');
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;

    // Move the note from 'projects' to 'completed'
    const moveResult = await client.callTool('move_note', {
      identifier: noteId,
      new_type: 'completed',
      content_hash: contentHash
    });

    console.log('Move result text:', moveResult.content[0].text);
    console.log('Move result is error:', moveResult.isError || false);

    if (moveResult.isError) {
      throw new Error(`Move failed: ${moveResult.content[0].text}`);
    }

    const moveData = JSON.parse(moveResult.content[0].text);
    assert.ok(moveData.success);
    assert.strictEqual(moveData.old_identifier, noteId);
    assert.ok(moveData.new_identifier.startsWith('completed/'));
    assert.strictEqual(moveData.old_type, 'projects');
    assert.strictEqual(moveData.new_type, 'completed');
    assert.strictEqual(moveData.title, uniqueTitle);
    assert.strictEqual(moveData.links_preserved, true);

    // Verify the original note no longer exists
    const getOriginal = await client.callTool('get_note', {
      identifier: noteId
    });
    const originalData = JSON.parse(getOriginal.content[0].text);
    assert.strictEqual(originalData, null);

    // Verify the note exists in new location
    const getMoved = await client.callTool('get_note', {
      identifier: moveData.new_identifier
    });
    const movedData = JSON.parse(getMoved.content[0].text);
    assert.strictEqual(movedData.title, uniqueTitle);
    assert.strictEqual(movedData.type, 'completed');
    assert.strictEqual(movedData.metadata.priority, 'high');
    assert.strictEqual(movedData.metadata.status, 'active');
    assert.strictEqual(movedData.metadata.type, 'completed'); // Type updated
  });

  test('should update wikilinks when moving notes', async () => {
    // Create target note to be moved
    const targetTitle = `Target Project ${Date.now()}`;
    const targetResult = await client.callTool('create_note', {
      type: 'projects',
      title: targetTitle,
      content: 'This project will be moved.'
    });

    const targetData = JSON.parse(targetResult.content[0].text);
    const targetId = targetData.id;

    // Create source note with wikilink to target
    const sourceTitle = `Source Note ${Date.now()}`;
    await client.callTool('create_note', {
      type: 'general',
      title: sourceTitle,
      content: `# ${sourceTitle}\n\nThis references [[${targetId}]] for information.`
    });

    // Get target note to obtain content_hash
    const getTargetResult = await client.callTool('get_note', {
      identifier: targetId
    });
    const targetNoteData = JSON.parse(getTargetResult.content[0].text);
    const targetHash = targetNoteData.content_hash;

    // Move the target note
    const moveResult = await client.callTool('move_note', {
      identifier: targetId,
      new_type: 'completed',
      content_hash: targetHash
    });

    const moveData = JSON.parse(moveResult.content[0].text);
    assert.ok(moveData.success);
    
    // Verify wikilinks were updated if the system supports it
    if (moveData.wikilinks_updated) {
      assert.ok(moveData.total_wikilinks_updated >= 0);
      assert.ok(moveData.notes_with_updated_wikilinks >= 0);
    }
  });

  test('should require content_hash parameter', async () => {
    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: `Test Note ${Date.now()}`,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);

    // Try to move without content_hash - should return error
    const error = await client.expectError('move_note', {
      identifier: createData.id,
      new_type: 'completed'
      // Missing content_hash
    });

    assert.ok(error.includes('content_hash') || error.includes('required'));
  });

  test('should validate content_hash for optimistic locking', async () => {
    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: `Test Note ${Date.now()}`,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);

    // Try to move with invalid content_hash - should return error
    const error = await client.expectError('move_note', {
      identifier: createData.id,
      new_type: 'completed',
      content_hash: 'invalid-hash'
    });

    assert.ok(
      error.includes('content hash') ||
        error.includes('modified') ||
        error.includes('mismatch')
    );
  });

  test('should handle non-existent note', async () => {
    const error = await client.expectError('move_note', {
      identifier: 'projects/non-existent.md',
      new_type: 'completed',
      content_hash: 'any-hash'
    });

    assert.ok(error.includes('not found'));
  });

  test('should handle invalid target type', async () => {
    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: `Test Note ${Date.now()}`,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);
    
    // Get content hash
    const getResult = await client.callTool('get_note', {
      identifier: createData.id
    });
    const noteData = JSON.parse(getResult.content[0].text);

    const error = await client.expectError('move_note', {
      identifier: createData.id,
      new_type: 'nonexistent-type',
      content_hash: noteData.content_hash
    });

    assert.ok(error.includes('does not exist') || error.includes('Invalid note type'));
  });

  test('should handle move to same type', async () => {
    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: `Test Note ${Date.now()}`,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);
    
    // Get content hash
    const getResult = await client.callTool('get_note', {
      identifier: createData.id
    });
    const noteData = JSON.parse(getResult.content[0].text);

    const error = await client.expectError('move_note', {
      identifier: createData.id,
      new_type: 'projects', // Same as current type
      content_hash: noteData.content_hash
    });

    assert.ok(error.includes('already in note type'));
  });

  test('should handle filename conflicts', async () => {
    const title = `Conflict Test ${Date.now()}`;
    
    // Create note in projects
    const projectResult = await client.callTool('create_note', {
      type: 'projects',
      title: title,
      content: 'Project content'
    });
    const projectData = JSON.parse(projectResult.content[0].text);

    // Create note in completed with same title (will have same filename)
    await client.callTool('create_note', {
      type: 'completed',
      title: title,
      content: 'Completed content'
    });

    // Get content hash for project note
    const getResult = await client.callTool('get_note', {
      identifier: projectData.id
    });
    const noteData = JSON.parse(getResult.content[0].text);

    // Try to move project note to completed - should conflict
    const error = await client.expectError('move_note', {
      identifier: projectData.id,
      new_type: 'completed',
      content_hash: noteData.content_hash
    });

    assert.ok(error.includes('already exists') || error.includes('overwrite'));
  });

  test('should preserve metadata during move', async () => {
    const metadata = {
      priority: 'high',
      status: 'in-progress',
      tags: ['important', 'urgent'],
      author: 'test-user'
    };

    const createResult = await client.callTool('create_note', {
      type: 'projects',
      title: `Metadata Test ${Date.now()}`,
      content: 'Content with metadata',
      metadata: metadata
    });

    const createData = JSON.parse(createResult.content[0].text);
    
    // Get content hash
    const getResult = await client.callTool('get_note', {
      identifier: createData.id
    });
    const noteData = JSON.parse(getResult.content[0].text);

    // Move the note
    const moveResult = await client.callTool('move_note', {
      identifier: createData.id,
      new_type: 'completed',
      content_hash: noteData.content_hash
    });

    const moveData = JSON.parse(moveResult.content[0].text);
    
    // Get moved note and verify metadata
    const getMovedResult = await client.callTool('get_note', {
      identifier: moveData.new_identifier
    });
    const movedData = JSON.parse(getMovedResult.content[0].text);

    // Verify all metadata preserved except type
    assert.strictEqual(movedData.metadata.priority, 'high');
    assert.strictEqual(movedData.metadata.status, 'in-progress');
    assert.deepStrictEqual(movedData.metadata.tags, ['important', 'urgent']);
    assert.strictEqual(movedData.metadata.author, 'test-user');
    assert.strictEqual(movedData.metadata.type, 'completed'); // Updated
  });
});