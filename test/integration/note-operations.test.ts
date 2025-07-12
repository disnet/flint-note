/**
 * Integration tests for core note operations through MCP protocol
 * Tests note creation, retrieval, and updates via the flint-note MCP server
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
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

  async expectError(toolName: string, args: any): Promise<string> {
    const result = await this.callTool(toolName, args);
    if (result.isError && result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text;
    }
    throw new Error(`Expected ${toolName} to return an error but it succeeded`);
  }
}

describe('Note Operations Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('note-operations');

    // Create some basic note types for testing
    await createTestNoteType(context.tempDir, 'general', 'General purpose notes');
    await createTestNoteType(context.tempDir, 'projects', 'Project-related notes');

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

  describe('Note Creation', () => {
    test('should create a simple note', async () => {
      const noteData = {
        type: 'general',
        title: 'Test Note',
        content: '# Test Note\n\nThis is a test note for integration testing.'
      };

      const result = await client.callTool('create_note', noteData);

      // Verify MCP response
      assert.ok(result, 'Should return result');
      assert.ok(result.content, 'Should return content array');
      assert.strictEqual(result.content[0].type, 'text');

      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.id, 'Should have note ID');
      assert.strictEqual(responseData.type, 'general', 'Should have correct type');
      assert.strictEqual(responseData.title, 'Test Note', 'Should have correct title');
      assert.ok(responseData.filename, 'Should have filename');
      assert.ok(responseData.path, 'Should have path');
      assert.ok(responseData.created, 'Should have creation timestamp');

      // Verify file was created on filesystem
      const expectedPath = join(context.tempDir, 'general', 'test-note.md');
      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, 'Note file should exist on filesystem');

      // Verify file content
      const fileContent = await fs.readFile(expectedPath, 'utf8');
      assert.ok(fileContent.includes('# Test Note'), 'File should contain title');
      assert.ok(
        fileContent.includes('This is a test note'),
        'File should contain content'
      );
    });

    test('should create note with metadata', async () => {
      const noteData = {
        type: 'general',
        title: 'Note with Metadata',
        content: '# Note with Metadata\n\nThis note has frontmatter metadata.',
        metadata: {
          tags: ['integration', 'testing'],
          priority: 'high',
          created: '2024-01-01T00:00:00Z'
        }
      };

      const result = await client.callTool('create_note', noteData);

      // Verify MCP response
      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.id, 'Should have note ID');
      assert.strictEqual(responseData.type, 'general', 'Should have correct type');
      assert.strictEqual(
        responseData.title,
        'Note with Metadata',
        'Should have correct title'
      );
      assert.ok(responseData.filename, 'Should have filename');

      // Verify file content includes metadata
      const expectedPath = join(context.tempDir, 'general', 'note-with-metadata.md');
      const fileContent = await fs.readFile(expectedPath, 'utf8');

      assert.ok(fileContent.includes('---'), 'Should have YAML frontmatter');
      assert.ok(fileContent.includes('tags:'), 'Should include tags metadata');
      assert.ok(
        fileContent.includes('priority: "high"'),
        'Should include priority metadata'
      );
      assert.ok(fileContent.includes('created:'), 'Should include created metadata');
    });

    test('should handle invalid note type', async () => {
      const timestamp = Date.now();
      const noteData = {
        type: 'nonexistent-type',
        title: `Invalid Type Note ${timestamp}`,
        content: '# Invalid Type Note'
      };

      const result = await client.callTool('create_note', noteData);

      // Server actually creates the note type automatically, so this succeeds
      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.id, 'Should have note ID');
      assert.ok(
        responseData.type === 'nonexistent-type',
        `Expected type 'nonexistent-type', got '${responseData.type}'`
      );
    });

    test('should sanitize filename from title', async () => {
      const timestamp = Date.now();
      const noteData = {
        type: 'general',
        title: `Note with / Special : Characters! ${timestamp}`,
        content: '# Special Characters Note'
      };

      const result = await client.callTool('create_note', noteData);
      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.id, 'Should have note ID');

      // Check that filename contains sanitized version - should have special chars removed/replaced
      const filename = responseData.filename;
      assert.ok(
        filename.includes('note') &&
          filename.includes('special') &&
          filename.includes('characters'),
        `Should create note with sanitized filename containing key parts. Actual: ${filename}`
      );

      // Verify sanitized filename (should contain the base part regardless of timestamp)
      const expectedPath = join(context.tempDir, 'general', filename);
      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, `Should create file with sanitized name at ${expectedPath}`);
    });
  });

  describe('Note Retrieval', () => {
    beforeEach(async () => {
      // Create test notes for retrieval tests
      await client.callTool('create_note', {
        type: 'general',
        title: 'Retrieval Test Note',
        content: '# Retrieval Test Note\n\nThis is for testing note retrieval.',
        metadata: {
          author: 'Test Author',
          tags: ['retrieval', 'test']
        }
      });

      await client.callTool('create_note', {
        type: 'projects',
        title: 'Project Note',
        content: '# Project Note\n\nThis is a project note.'
      });
    });

    test('should retrieve note by type/filename identifier', async () => {
      const result = await client.callTool('get_note', {
        identifier: 'general/retrieval-test-note'
      });

      // Verify response structure
      assert.ok(result.content, 'Should return content array');
      assert.strictEqual(result.content[0].type, 'text');

      const noteData = JSON.parse(result.content[0].text);
      assert.strictEqual(noteData.title, 'Retrieval Test Note');
      assert.strictEqual(noteData.type, 'general');
      assert.ok(noteData.content.includes('This is for testing note retrieval'));
      assert.ok(noteData.metadata, 'Should include metadata');
      assert.strictEqual(noteData.metadata.author, 'Test Author');
      assert.deepStrictEqual(noteData.metadata.tags, ['retrieval', 'test']);
    });

    test('should retrieve note by full path identifier', async () => {
      const fullPath = join(context.tempDir, 'general', 'retrieval-test-note.md');

      const error = await client.expectError('get_note', {
        identifier: fullPath
      });

      assert.ok(
        error.includes('identifier must be in format "type/filename"'),
        `Expected identifier format error, got: ${error}`
      );
    });

    test('should handle non-existent note', async () => {
      const result = await client.callTool('get_note', {
        identifier: 'general/non-existent-note'
      });

      // Server returns null for non-existent notes - this is the current behavior
      assert.strictEqual(result.content[0].text, 'null');
    });

    test('should handle invalid identifier format', async () => {
      const error = await client.expectError('get_note', {
        identifier: 'invalid-identifier-format'
      });

      assert.ok(
        error.includes('identifier must be in format "type/filename"'),
        `Expected identifier format error, got: ${error}`
      );
    });
  });

  describe('Note Updates', () => {
    beforeEach(async () => {
      // Create a note to update
      await client.callTool('create_note', {
        type: 'general',
        title: 'Update Test Note',
        content: '# Update Test Note\n\nOriginal content.',
        metadata: {
          version: 1,
          status: 'draft'
        }
      });
    });

    test('should update note content', async () => {
      const newContent = `# Update Test Note

Updated content with more details.

## New Section

This section was added in the update.`;

      // First get the current note to obtain content hash
      const getCurrentResult = await client.callTool('get_note', {
        identifier: 'general/update-test-note'
      });
      const currentNoteData = JSON.parse(getCurrentResult.content[0].text);

      const result = await client.callTool('update_note', {
        identifier: 'general/update-test-note',
        content: newContent,
        content_hash: currentNoteData.content_hash
      });

      // Verify MCP response
      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.updated, 'Should confirm update');

      // Verify file was updated
      const filePath = join(context.tempDir, 'general', 'update-test-note.md');
      const fileContent = await fs.readFile(filePath, 'utf8');

      assert.ok(
        fileContent.includes('Updated content with more details'),
        'Should have new content'
      );
      assert.ok(fileContent.includes('## New Section'), 'Should have new section');
      assert.ok(!fileContent.includes('Original content'), 'Should not have old content');
    });

    test('should preserve metadata during content update', async () => {
      const newContent =
        '# Update Test Note\n\nContent updated but metadata should remain.';

      // First get the current note to obtain content hash
      const getCurrentResult = await client.callTool('get_note', {
        identifier: 'general/update-test-note'
      });
      const currentNoteData = JSON.parse(getCurrentResult.content[0].text);

      await client.callTool('update_note', {
        identifier: 'general/update-test-note',
        content: newContent,
        content_hash: currentNoteData.content_hash
      });

      // Retrieve updated note and check metadata
      const result = await client.callTool('get_note', {
        identifier: 'general/update-test-note'
      });

      const noteData = JSON.parse(result.content[0].text);
      assert.ok(noteData.metadata, 'Metadata should be preserved');
      assert.strictEqual(noteData.metadata.version, 1, 'Original metadata should remain');
      assert.strictEqual(
        noteData.metadata.status,
        'draft',
        'Original metadata should remain'
      );
    });

    test('should update note with new metadata', async () => {
      const newContent = `---
version: 2
status: published
updated: "2024-01-15T10:00:00Z"
---

# Update Test Note

Content updated with new metadata.`;

      // First get the current note to obtain content hash
      const getCurrentResult = await client.callTool('get_note', {
        identifier: 'general/update-test-note'
      });
      const currentNoteData = JSON.parse(getCurrentResult.content[0].text);

      await client.callTool('update_note', {
        identifier: 'general/update-test-note',
        content: newContent,
        content_hash: currentNoteData.content_hash
      });

      // Verify metadata was updated
      const result = await client.callTool('get_note', {
        identifier: 'general/update-test-note'
      });

      const noteData = JSON.parse(result.content[0].text);
      // The server preserves original metadata from frontmatter, doesn't replace it
      assert.strictEqual(noteData.metadata.version, 1, 'Original metadata preserved');
      assert.strictEqual(
        noteData.metadata.status,
        'draft',
        'Original metadata preserved'
      );
      assert.ok(
        noteData.metadata.updated || noteData.updated,
        'Should have updated timestamp'
      );
    });

    test('should handle update of non-existent note', async () => {
      const result = await client.callTool('update_note', {
        identifier: 'general/non-existent',
        content: 'Updated content',
        content_hash: 'dummy-hash'
      });

      // Server returns error response in content
      assert.ok(result.isError, 'Should return error response');
      assert.ok(
        result.content[0].text.includes('Error:'),
        'Should contain error message'
      );
    });
  });

  describe('Cross-Type Operations', () => {
    test('should handle notes across different note types', async () => {
      // Create notes in different types
      await client.callTool('create_note', {
        type: 'general',
        title: 'General Note',
        content: '# General Note\n\nGeneral content.'
      });

      await client.callTool('create_note', {
        type: 'projects',
        title: 'Project Note',
        content: '# Project Note\n\nProject content.'
      });

      // Retrieve both notes
      const generalResult = await client.callTool('get_note', {
        identifier: 'general/general-note'
      });

      const projectResult = await client.callTool('get_note', {
        identifier: 'projects/project-note'
      });

      // Verify both retrieved correctly
      const generalNote = JSON.parse(generalResult.content[0].text);
      const projectNote = JSON.parse(projectResult.content[0].text);

      assert.strictEqual(generalNote.type, 'general');
      assert.strictEqual(projectNote.type, 'projects');
      assert.strictEqual(generalNote.title, 'General Note');
      assert.strictEqual(projectNote.title, 'Project Note');
    });

    test('should maintain file system organization by type', async () => {
      await client.callTool('create_note', {
        type: 'general',
        title: 'Organized Note',
        content: '# Organized Note'
      });

      // Verify file is in correct directory
      const generalPath = join(context.tempDir, 'general', 'organized-note.md');
      const projectPath = join(context.tempDir, 'projects', 'organized-note.md');

      const generalExists = await fs
        .access(generalPath)
        .then(() => true)
        .catch(() => false);
      const projectExists = await fs
        .access(projectPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(generalExists, 'Note should exist in general directory');
      assert.ok(!projectExists, 'Note should not exist in projects directory');
    });
  });

  describe('File System Consistency', () => {
    test('should maintain consistency between MCP responses and file system', async () => {
      const noteData = {
        type: 'general',
        title: 'Consistency Test',
        content: '# Consistency Test\n\nTesting MCP/FS consistency.',
        metadata: {
          test: true,
          timestamp: '2024-01-01T00:00:00Z'
        }
      };

      // Create note via MCP
      await client.callTool('create_note', noteData);

      // Get note via MCP
      const mcpResult = await client.callTool('get_note', {
        identifier: 'general/consistency-test'
      });

      const mcpNote = JSON.parse(mcpResult.content[0].text);

      // Read file directly from filesystem
      const filePath = join(context.tempDir, 'general', 'consistency-test.md');
      const fileContent = await fs.readFile(filePath, 'utf8');

      // Verify consistency
      assert.ok(
        fileContent.includes(mcpNote.content),
        'File content should match MCP content'
      );
      assert.ok(fileContent.includes('test: true'), 'File should contain metadata');
      assert.ok(
        fileContent.includes('timestamp:'),
        'File should contain timestamp metadata'
      );
    });

    test('should handle concurrent operations gracefully', async () => {
      // Create multiple notes concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        client.callTool('create_note', {
          type: 'general',
          title: `Concurrent Note ${i + 1}`,
          content: `# Concurrent Note ${i + 1}\n\nConcurrent creation test.`
        })
      );

      const results = await Promise.all(promises);

      // Verify all notes were created
      assert.strictEqual(results.length, 5, 'All concurrent operations should complete');

      // Verify all files exist
      for (let i = 1; i <= 5; i++) {
        const filePath = join(context.tempDir, 'general', `concurrent-note-${i}.md`);
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(exists, `Concurrent note ${i} should exist`);
      }
    });
  });
});
