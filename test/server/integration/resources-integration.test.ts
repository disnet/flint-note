/**
 * Integration tests for note resources through MCP protocol
 * Tests individual note access, collections, tagged notes, and incoming links
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  createTestNoteType,
  type IntegrationTestContext
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
          reject(new Error(`Request timeout after 15000ms: ${method}`));
        }
      }, 15000);

      // Listen for response on stdout
      const onData = (data: Buffer) => {
        responseData += data.toString();
        const lines = responseData.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout.off('data', onData);

                if (response.error) {
                  reject(new Error(response.error.message || 'Unknown error'));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Not JSON or different message, continue
            }
          }
        }
      };

      this.#serverProcess.stdout.on('data', onData);

      // Send request
      this.#serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }
}

/**
 * Create test dataset with various note types and content
 */
async function createTestDataset(tempDir: string, client: MCPClient): Promise<void> {
  // Create test note types
  await createTestNoteType(tempDir, 'general', 'General purpose notes');
  await createTestNoteType(tempDir, 'project', 'Project tracking notes');

  // Create test notes with various tags and content
  await client.sendRequest('tools/call', {
    name: 'create_note',
    arguments: {
      type: 'general',
      title: 'Test Note 1',
      content: 'This is a test note with [[project/sample-project]] link.',
      metadata: {
        tags: ['test', 'important'],
        priority: 'high'
      }
    }
  });

  await client.sendRequest('tools/call', {
    name: 'create_note',
    arguments: {
      type: 'general',
      title: 'Test Note 2',
      content: 'Another test note without links.',
      metadata: {
        tags: ['test'],
        priority: 'low'
      }
    }
  });

  await client.sendRequest('tools/call', {
    name: 'create_note',
    arguments: {
      type: 'project',
      title: 'Sample Project',
      content: 'This is a sample project note.\n\n## Status\nIn progress',
      metadata: {
        tags: ['project', 'important'],
        status: 'active'
      }
    }
  });

  await client.sendRequest('tools/call', {
    name: 'create_note',
    arguments: {
      type: 'project',
      title: 'Another Project',
      content: 'Different project with links to [[general/test-note-1]].',
      metadata: {
        tags: ['project'],
        status: 'planning'
      }
    }
  });
}

describe('Resources Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('resources-integration');

    // Start server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir
    });
    client = new MCPClient(context.serverProcess);

    // Create test dataset
    await createTestDataset(context.tempDir, client);
  });

  afterEach(async () => {
    if (context?.serverProcess) {
      context.serverProcess.kill();
    }
    if (context) {
      await cleanupIntegrationWorkspace(context);
    }
  });

  test('should list all available resources', async () => {
    const response = await client.sendRequest('resources/list', {});

    assert(response.resources, 'Should return resources list');
    assert(Array.isArray(response.resources), 'Resources should be an array');

    // Check for our new resource types
    const resourceUris = response.resources.map((r: any) => r.uri);

    assert(
      resourceUris.includes('flint-note://note/{type}/{filename}'),
      'Should include individual note resource'
    );
    assert(
      resourceUris.includes('flint-note://notes/{type}'),
      'Should include notes by type resource'
    );
    assert(
      resourceUris.includes('flint-note://notes/tagged/{tag}'),
      'Should include tagged notes resource'
    );
    assert(
      resourceUris.includes('flint-note://links/incoming/{type}/{filename}'),
      'Should include incoming links resource'
    );
  });

  test('should read individual note resource', async () => {
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://note/general/test-note-1'
    });

    assert(response.contents, 'Should return content');
    assert(Array.isArray(response.contents), 'Contents should be an array');
    assert.equal(response.contents.length, 1, 'Should return one content item');

    const content = response.contents[0];
    assert.equal(content.mimeType, 'application/json', 'Should be JSON content');

    const noteData = JSON.parse(content.text);
    assert(
      noteData.content.includes('This is a test note'),
      'Should contain note content'
    );
    assert(Array.isArray(noteData.metadata.tags), 'Should have tags metadata');
    assert(noteData.metadata.tags.includes('test'), 'Should include test tag');
    assert(noteData.metadata.tags.includes('important'), 'Should include important tag');
    assert(noteData.id, 'Should have note ID');
    assert(noteData.type, 'Should have note type');
    assert(noteData.title, 'Should have note title');
  });

  test('should read notes by type resource', async () => {
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://notes/general'
    });

    assert(response.contents, 'Should return content');
    const notesData = JSON.parse(response.contents[0].text);

    assert(Array.isArray(notesData), 'Should return array of notes');
    assert(notesData.length >= 2, 'Should return at least 2 general notes');

    const note = notesData[0];
    assert(note.id, 'Note should have id');
    assert(note.type, 'Note should have type');
    assert(note.title, 'Note should have title');
    assert.equal(note.type, 'general', 'All notes should be general type');
  });

  test('should read notes by tag resource', async () => {
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://notes/tagged/important'
    });

    assert(response.contents, 'Should return content');
    const taggedNotes = JSON.parse(response.contents[0].text);

    assert(Array.isArray(taggedNotes), 'Should return array of notes');
    assert(taggedNotes.length >= 2, 'Should return at least 2 notes with important tag');

    // Verify all returned notes have the 'important' tag
    for (const note of taggedNotes) {
      assert(
        note.tags.includes('important'),
        `Note ${note.title} should have important tag`
      );
    }
  });

  test('should read incoming links resource', async () => {
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://links/incoming/project/sample-project'
    });

    assert(response.contents, 'Should return content');
    const incomingLinks = JSON.parse(response.contents[0].text);

    assert(Array.isArray(incomingLinks), 'Should return array of incoming links');
    // The test note 1 links to sample-project, so we should have at least 1 incoming link
    assert(incomingLinks.length >= 1, 'Should have at least one incoming link');
  });

  test('should handle non-existent note gracefully', async () => {
    try {
      await client.sendRequest('resources/read', {
        uri: 'flint-note://note/general/non-existent-note'
      });
      assert.fail('Should have thrown an error for non-existent note');
    } catch (error: any) {
      assert(
        error.message.includes('Note not found'),
        'Should return note not found error'
      );
    }
  });

  test('should handle non-existent type gracefully', async () => {
    try {
      await client.sendRequest('resources/read', {
        uri: 'flint-note://notes/non-existent-type'
      });
      assert.fail('Should have thrown an error for non-existent type');
    } catch (error: any) {
      assert(
        error.message.includes('does not exist'),
        'Should return type not found error'
      );
    }
  });

  test('should handle empty tag results', async () => {
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://notes/tagged/non-existent-tag'
    });

    assert(response.contents, 'Should return content');
    const taggedNotes = JSON.parse(response.contents[0].text);

    assert(Array.isArray(taggedNotes), 'Should return array');
    assert.equal(taggedNotes.length, 0, 'Should return empty array for non-existent tag');
  });

  test('should handle unknown resource URI gracefully', async () => {
    try {
      await client.sendRequest('resources/read', {
        uri: 'flint-note://unknown/resource'
      });
      assert.fail('Should have thrown an error for unknown resource');
    } catch (error: any) {
      assert(
        error.message.includes('Unknown resource'),
        'Should return unknown resource error'
      );
    }
  });

  test('should maintain consistent URI format', async () => {
    // Test that the returned content includes the correct URI
    const response = await client.sendRequest('resources/read', {
      uri: 'flint-note://note/general/test-note-1'
    });

    assert.equal(
      response.contents[0].uri,
      'flint-note://note/general/test-note-1',
      'Should maintain the original URI in response'
    );
  });
});
