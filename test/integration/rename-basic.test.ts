/**
 * Integration tests for note rename operations through MCP protocol
 * Tests the rename_note tool functionality including validation, wikilink updates, and error handling
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

describe('Rename Operations Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('rename-operations');

    // Create test note type
    await createTestNoteType(context.tempDir, 'general', 'General purpose notes');

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

  test('should rename a note successfully', async () => {
    // Create a test note with unique title
    const uniqueTitle = `My Test Project ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: uniqueTitle,
      content: `# ${uniqueTitle}\n\nThis is a test project.`
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

    // Rename the note
    const renameResult = await client.callTool('rename_note', {
      identifier: noteId,
      new_title: 'Renamed Project',
      content_hash: contentHash
    });

    console.log('Rename result text:', renameResult.content[0].text);
    console.log('Rename result is error:', renameResult.isError || false);

    if (renameResult.isError) {
      throw new Error(`Rename failed: ${renameResult.content[0].text}`);
    }

    const renameData = JSON.parse(renameResult.content[0].text);
    assert.ok(renameData.success);
    assert.strictEqual(renameData.old_title, uniqueTitle);
    assert.strictEqual(renameData.new_title, 'Renamed Project');
    assert.strictEqual(renameData.identifier, noteId);
    assert.strictEqual(renameData.filename_unchanged, true);
    assert.strictEqual(renameData.links_preserved, true);

    // Verify the note was actually renamed
    const getRenamed = await client.callTool('get_note', {
      identifier: noteId
    });

    const getData = JSON.parse(getRenamed.content[0].text);
    assert.strictEqual(getData.title, 'Renamed Project');
    assert.strictEqual(getData.id, noteId); // ID should remain the same
    // Filename should remain unchanged from the original (contains timestamp)
    assert.ok(
      getData.filename.startsWith('my-test-project'),
      'Filename should start with my-test-project'
    );
    assert.ok(getData.filename.endsWith('.md'), 'Filename should end with .md');
  });

  test('should handle rename with wikilink updates', async () => {
    // Create target note
    const targetTitle = `Target Project ${Date.now()}`;
    const targetResult = await client.callTool('create_note', {
      type: 'general',
      title: targetTitle,
      content: 'This is the target project.'
    });

    const targetData = JSON.parse(targetResult.content[0].text);
    const targetId = targetData.id;

    // Get target note to obtain content_hash
    const getTargetResult = await client.callTool('get_note', {
      identifier: targetId
    });
    const targetNoteData = JSON.parse(getTargetResult.content[0].text);
    const targetHash = targetNoteData.content_hash;

    // Create source note with wikilink to target
    await client.callTool('create_note', {
      type: 'general',
      title: `Source Project ${Date.now()}`,
      content: `# Source Project\n\nThis references [[${targetId}|${targetTitle}]] for collaboration.`
    });

    // Rename the target note with wikilink updates
    const renameResult = await client.callTool('rename_note', {
      identifier: targetId,
      new_title: 'Renamed Target Project',
      content_hash: targetHash,
      update_wikilinks: true
    });

    const renameData = JSON.parse(renameResult.content[0].text);
    assert.ok(renameData.success);
    // Broken links resolved should be 0 since no broken links exist
    assert.strictEqual(renameData.broken_links_resolved, 0);
  });

  test('should require content_hash for rename', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: uniqueTitle,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);

    // Try to rename without content_hash - should return error
    const error = await client.expectError('rename_note', {
      identifier: createData.id,
      new_title: 'New Title'
      // Missing content_hash
    });

    assert.ok(error.includes('content_hash') || error.includes('required'));
  });

  test('should validate content_hash for rename', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: uniqueTitle,
      content: 'Test content'
    });

    const createData = JSON.parse(createResult.content[0].text);

    // Try to rename with invalid content_hash - should return error
    const error = await client.expectError('rename_note', {
      identifier: createData.id,
      new_title: 'New Title',
      content_hash: 'invalid-hash'
    });

    assert.ok(
      error.includes('content hash') ||
        error.includes('modified') ||
        error.includes('mismatch')
    );
  });

  test('should handle non-existent note rename', async () => {
    const error = await client.expectError('rename_note', {
      identifier: 'general/non-existent.md',
      new_title: 'New Title',
      content_hash: 'any-hash'
    });

    assert.ok(error.includes('not found'));
  });
});
