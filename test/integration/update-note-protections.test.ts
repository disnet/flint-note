/**
 * Integration tests for update_note protections
 * Tests that update_note cannot be used to modify title or filename fields via metadata updates
 * These fields should only be modifiable through the dedicated rename_note tool
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

describe('Update Note Protections Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('update-note-protections');

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

  test('should prevent title updates via update_note metadata', async () => {
    // Create a test note
    const originalTitle = `Original Title ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nThis is a test note.`
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;

    // Try to update title via metadata - should be rejected with error
    const attemptedNewTitle = 'Attempted New Title';
    const updateResult = await client.callTool('update_note', {
      identifier: noteId,
      content_hash: contentHash,
      metadata: {
        title: attemptedNewTitle,
        custom_field: 'allowed_value'
      }
    });

    // Update should be rejected with error
    assert.ok(
      updateResult.isError,
      'Update should be rejected due to protected title field'
    );
    const errorText = updateResult.content[0].text;
    assert.ok(
      errorText.includes('title') &&
        (errorText.includes('protected') || errorText.includes('rename_note')),
      'Error should mention title protection and rename_note tool'
    );
  });

  test('should prevent filename updates via update_note metadata', async () => {
    // Create a test note
    const originalTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nThis is a test note.`
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash and original filename
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;

    // Try to update filename via metadata - should be rejected with error
    const attemptedNewFilename = 'attempted-new-filename.md';
    const updateResult = await client.callTool('update_note', {
      identifier: noteId,
      content_hash: contentHash,
      metadata: {
        filename: attemptedNewFilename,
        custom_field: 'allowed_value'
      }
    });

    // Update should be rejected with error
    assert.ok(
      updateResult.isError,
      'Update should be rejected due to protected filename field'
    );
    const errorText = updateResult.content[0].text;
    assert.ok(
      errorText.includes('filename') &&
        (errorText.includes('protected') || errorText.includes('rename_note')),
      'Error should mention filename protection and rename_note tool'
    );
  });

  test('should allow legitimate metadata updates while protecting title/filename', async () => {
    // Create a test note
    const originalTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nThis is a test note.`,
      metadata: {
        status: 'draft',
        priority: 'low'
      }
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;
    const originalFilename = noteData.filename;

    // Try to update legitimate metadata fields along with protected ones - should be rejected
    const updateResult = await client.callTool('update_note', {
      identifier: noteId,
      content_hash: contentHash,
      metadata: {
        title: 'Should Be Rejected',
        filename: 'should-be-rejected.md',
        status: 'published',
        priority: 'high',
        tags: ['test', 'protection']
      }
    });

    // Update should be rejected due to protected fields
    assert.ok(updateResult.isError, 'Update should be rejected due to protected fields');
    const errorText = updateResult.content[0].text;
    assert.ok(
      (errorText.includes('title') || errorText.includes('filename')) &&
        (errorText.includes('protected') || errorText.includes('rename_note')),
      'Error should mention protected fields and rename_note tool'
    );

    // Now test legitimate metadata update without protected fields
    const legitimateUpdateResult = await client.callTool('update_note', {
      identifier: noteId,
      content_hash: contentHash,
      metadata: {
        status: 'published',
        priority: 'high',
        tags: ['test', 'protection']
      }
    });

    // This should succeed
    assert.ok(
      !legitimateUpdateResult.isError,
      'Legitimate metadata update should succeed'
    );

    // Verify the results
    const getUpdatedResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const updatedNoteData = JSON.parse(getUpdatedResult.content[0].text);

    // Protected fields should remain unchanged
    assert.strictEqual(
      updatedNoteData.title,
      originalTitle,
      'Title should not be changed'
    );
    assert.strictEqual(
      updatedNoteData.filename,
      originalFilename,
      'Filename should not be changed'
    );

    // Legitimate metadata should be updated
    assert.strictEqual(
      updatedNoteData.metadata.status,
      'published',
      'Status should be updated'
    );
    assert.strictEqual(
      updatedNoteData.metadata.priority,
      'high',
      'Priority should be updated'
    );
    assert.deepStrictEqual(
      updatedNoteData.metadata.tags,
      ['test', 'protection'],
      'Tags should be updated'
    );
  });

  test('should prevent batch updates of title/filename via metadata', async () => {
    // Create two test notes
    const note1Title = `Test Note 1 ${Date.now()}`;
    const note2Title = `Test Note 2 ${Date.now()}`;

    const createResult1 = await client.callTool('create_note', {
      type: 'general',
      title: note1Title,
      content: `# ${note1Title}\n\nFirst test note.`
    });
    const createResult2 = await client.callTool('create_note', {
      type: 'general',
      title: note2Title,
      content: `# ${note2Title}\n\nSecond test note.`
    });

    const note1Data = JSON.parse(createResult1.content[0].text);
    const note2Data = JSON.parse(createResult2.content[0].text);

    // Get content hashes
    const getResult1 = await client.callTool('get_note', {
      identifier: note1Data.id
    });
    const getResult2 = await client.callTool('get_note', {
      identifier: note2Data.id
    });

    const note1Current = JSON.parse(getResult1.content[0].text);
    const note2Current = JSON.parse(getResult2.content[0].text);

    // Try batch update with protected fields - should be rejected
    const batchUpdateResult = await client.callTool('update_note', {
      updates: [
        {
          identifier: note1Data.id,
          content_hash: note1Current.content_hash,
          metadata: {
            title: 'New Title 1',
            filename: 'new-filename-1.md',
            status: 'published'
          }
        },
        {
          identifier: note2Data.id,
          content_hash: note2Current.content_hash,
          metadata: {
            title: 'New Title 2',
            filename: 'new-filename-2.md',
            priority: 'high'
          }
        }
      ]
    });

    // Batch update should be rejected due to protected fields
    assert.ok(!batchUpdateResult.isError, 'Batch update should return results object');
    const batchData = JSON.parse(batchUpdateResult.content[0].text);
    assert.ok(
      batchData.failed > 0,
      'Batch update should have failures due to protected fields'
    );

    // Check that error messages mention protected fields
    const hasProtectedFieldError = batchData.results.some(
      (result: any) =>
        !result.success &&
        result.error &&
        (result.error.includes('title') || result.error.includes('filename')) &&
        (result.error.includes('protected') || result.error.includes('rename_note'))
    );

    assert.ok(
      hasProtectedFieldError,
      'Batch update errors should mention protected fields and rename_note tool'
    );
  });

  test('should allow content updates while protecting metadata fields', async () => {
    // Create a test note
    const originalTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nOriginal content.`
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;
    const originalFilename = noteData.filename;

    // Update content along with attempting to change protected fields
    const newContent = `# ${originalTitle}

Updated content with more details.

This content should be updated successfully.`;

    const updateResult = await client.callTool('update_note', {
      identifier: noteId,
      content: newContent,
      content_hash: contentHash,
      metadata: {
        title: 'Should Be Rejected',
        filename: 'should-be-rejected.md',
        status: 'published'
      }
    });

    // Update should be rejected due to protected fields even with content update
    assert.ok(updateResult.isError, 'Update should be rejected due to protected fields');
    const errorText = updateResult.content[0].text;
    assert.ok(
      (errorText.includes('title') || errorText.includes('filename')) &&
        (errorText.includes('protected') || errorText.includes('rename_note')),
      'Error should mention protected fields and rename_note tool'
    );

    // Now test content update without protected metadata fields
    const contentOnlyResult = await client.callTool('update_note', {
      identifier: noteId,
      content: newContent,
      content_hash: contentHash,
      metadata: {
        status: 'published'
      }
    });

    // This should succeed
    assert.ok(
      !contentOnlyResult.isError,
      'Content update without protected fields should succeed'
    );

    const getUpdatedResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const updatedNoteData = JSON.parse(getUpdatedResult.content[0].text);

    // Content should be updated
    assert.ok(
      updatedNoteData.content.includes('Updated content with more details'),
      'Content should be updated'
    );

    // Protected fields should remain unchanged
    assert.strictEqual(
      updatedNoteData.title,
      originalTitle,
      'Title should not be changed'
    );
    assert.strictEqual(
      updatedNoteData.filename,
      originalFilename,
      'Filename should not be changed'
    );

    // Legitimate metadata should be updated
    assert.strictEqual(
      updatedNoteData.metadata.status,
      'published',
      'Status should be updated'
    );
  });

  test('should demonstrate proper way to rename using rename_note tool', async () => {
    // Create a test note
    const originalTitle = `Original Title ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nThis is a test note.`
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;
    const originalFilename = noteData.filename;

    // Use rename_note tool (the proper way)
    const newTitle = 'Properly Renamed Title';
    const renameResult = await client.callTool('rename_note', {
      identifier: noteId,
      new_title: newTitle,
      content_hash: contentHash
    });

    // Rename should succeed
    assert.ok(!renameResult.isError, 'rename_note should succeed');

    const renameData = JSON.parse(renameResult.content[0].text);
    assert.ok(renameData.success, 'Rename should be successful');
    assert.strictEqual(renameData.old_title, originalTitle, 'Should track old title');
    assert.strictEqual(renameData.new_title, newTitle, 'Should track new title');
    assert.strictEqual(
      renameData.filename_unchanged,
      true,
      'Filename should remain unchanged'
    );

    // Verify the note was actually renamed
    const getRenamed = await client.callTool('get_note', {
      identifier: noteId
    });
    const renamedData = JSON.parse(getRenamed.content[0].text);

    assert.strictEqual(renamedData.title, newTitle, 'Title should be updated');
    assert.strictEqual(
      renamedData.filename,
      originalFilename,
      'Filename should remain unchanged'
    );
    assert.strictEqual(renamedData.id, noteId, 'ID should remain unchanged');
  });

  test('should prevent type updates via update_note metadata', async () => {
    // Create a test note
    const originalTitle = `Test Note ${Date.now()}`;
    const createResult = await client.callTool('create_note', {
      type: 'general',
      title: originalTitle,
      content: `# ${originalTitle}\n\nThis is a test note.`
    });

    const createData = JSON.parse(createResult.content[0].text);
    const noteId = createData.id;

    // Get the note to obtain content_hash
    const getResult = await client.callTool('get_note', {
      identifier: noteId
    });
    const noteData = JSON.parse(getResult.content[0].text);
    const contentHash = noteData.content_hash;

    // Try to update type via metadata - should be rejected with error
    const attemptedNewType = 'projects';
    const updateResult = await client.callTool('update_note', {
      identifier: noteId,
      content_hash: contentHash,
      metadata: {
        type: attemptedNewType,
        custom_field: 'allowed_value'
      }
    });

    // Update should be rejected with error
    assert.ok(
      updateResult.isError,
      'Update should be rejected due to protected type field'
    );
    const errorText = updateResult.content[0].text;
    assert.ok(
      errorText.includes('type') &&
        (errorText.includes('protected') || errorText.includes('move_note')),
      'Error should mention type protection and move_note tool'
    );

    // Verify the note type remains unchanged
    const getAfterAttempt = await client.callTool('get_note', {
      identifier: noteId
    });
    const afterAttemptData = JSON.parse(getAfterAttempt.content[0].text);
    assert.strictEqual(
      afterAttemptData.type,
      'general',
      'Note type should remain unchanged after rejected update'
    );
  });

  test('should prevent batch type updates via update_note metadata', async () => {
    // Create two test notes
    const note1Title = `Test Note 1 ${Date.now()}`;
    const note2Title = `Test Note 2 ${Date.now()}`;

    const createResult1 = await client.callTool('create_note', {
      type: 'general',
      title: note1Title,
      content: `# ${note1Title}\n\nFirst test note.`
    });
    const createResult2 = await client.callTool('create_note', {
      type: 'general',
      title: note2Title,
      content: `# ${note2Title}\n\nSecond test note.`
    });

    const note1Data = JSON.parse(createResult1.content[0].text);
    const note2Data = JSON.parse(createResult2.content[0].text);

    // Get content hashes
    const getResult1 = await client.callTool('get_note', {
      identifier: note1Data.id
    });
    const getResult2 = await client.callTool('get_note', {
      identifier: note2Data.id
    });

    const note1Current = JSON.parse(getResult1.content[0].text);
    const note2Current = JSON.parse(getResult2.content[0].text);

    // Try batch update with type changes - should be rejected
    const batchUpdateResult = await client.callTool('update_note', {
      updates: [
        {
          identifier: note1Data.id,
          content_hash: note1Current.content_hash,
          metadata: {
            type: 'projects',
            status: 'published'
          }
        },
        {
          identifier: note2Data.id,
          content_hash: note2Current.content_hash,
          metadata: {
            type: 'daily',
            priority: 'high'
          }
        }
      ]
    });

    // Batch update should be rejected due to protected type fields
    assert.ok(!batchUpdateResult.isError, 'Batch update should return results object');
    const batchData = JSON.parse(batchUpdateResult.content[0].text);
    assert.ok(
      batchData.failed > 0,
      'Batch update should have failures due to protected type fields'
    );

    // Check that error messages mention protected type field and move_note tool
    const hasProtectedTypeError = batchData.results.some(
      (result: any) =>
        !result.success &&
        result.error &&
        result.error.includes('type') &&
        (result.error.includes('protected') || result.error.includes('move_note'))
    );

    assert.ok(
      hasProtectedTypeError,
      'Batch update errors should mention protected type field and move_note tool'
    );

    // Verify notes remain unchanged
    const getAfter1 = await client.callTool('get_note', {
      identifier: note1Data.id
    });
    const getAfter2 = await client.callTool('get_note', {
      identifier: note2Data.id
    });

    const afterData1 = JSON.parse(getAfter1.content[0].text);
    const afterData2 = JSON.parse(getAfter2.content[0].text);

    assert.strictEqual(
      afterData1.type,
      'general',
      'First note type should remain unchanged after rejected batch update'
    );
    assert.strictEqual(
      afterData2.type,
      'general',
      'Second note type should remain unchanged after rejected batch update'
    );
  });
});
