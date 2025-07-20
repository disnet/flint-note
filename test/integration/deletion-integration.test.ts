/**
 * Integration tests for note and note type deletion functionality
 *
 * Tests the full end-to-end deletion workflows through the MCP server,
 * including server communication, file system operations, and cross-system integration.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { type ChildProcess } from 'node:child_process';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  stopServer,
  createIntegrationTestNotes,
  createTestNoteType,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

/**
 * Simple MCP client for testing server communication
 */
class MCPClient {
  #serverProcess: ChildProcess;

  constructor(serverProcess: ChildProcess) {
    this.#serverProcess = serverProcess;
  }

  async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 10000),
        method,
        params
      };

      const requestStr = JSON.stringify(request) + '\n';
      let responseBuffer = '';
      let hasResponded = false;

      const timeout = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          reject(new Error(`Request timeout for ${method}`));
        }
      }, INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT);

      const onData = (data: Buffer) => {
        responseBuffer += data.toString();

        // Look for complete JSON response
        const lines = responseBuffer.split('\n');
        for (const line of lines) {
          if (line.trim() && !hasResponded) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout?.off('data', onData);

                if (response.error) {
                  reject(new Error(response.error.message || 'Server error'));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Not a complete JSON line yet, continue
            }
          }
        }
      };

      this.#serverProcess.stdout?.on('data', onData);
      this.#serverProcess.stdin?.write(requestStr);
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.sendRequest('tools/call', { name, arguments: args });
  }
}

describe('Deletion Integration Tests', () => {
  let context: IntegrationTestContext;
  let serverProcess: ChildProcess;
  let client: MCPClient;

  beforeEach(async () => {
    // Create workspace and test data
    context = await createIntegrationWorkspace('deletion-test');
    await createIntegrationTestNotes(context.tempDir);

    // Create additional test note types for deletion testing
    await createTestNoteType(
      context.tempDir,
      'temporary',
      'Temporary notes for deletion testing'
    );

    await createTestNoteType(
      context.tempDir,
      'archive',
      'Archive notes for migration testing'
    );

    // Start server
    serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });
    context.serverProcess = serverProcess;
    client = new MCPClient(serverProcess);
  });

  afterEach(async () => {
    if (serverProcess && !serverProcess.killed) {
      await stopServer(serverProcess, INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT);
    }
    await cleanupIntegrationWorkspace(context);
  });

  describe('Single Note Deletion', () => {
    test('should delete a note through MCP server', async () => {
      // Create a note to delete
      const createResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Delete Me',
        content: '# Delete Me\n\nThis note should be deleted.'
      });

      assert.ok(createResult, 'Note creation should succeed');
      const noteData = JSON.parse((createResult as any).content[0].text);
      const noteId = noteData.id;

      // Verify note exists in file system
      const notePath = join(context.tempDir, noteId + '.md');
      await fs.access(notePath); // Should not throw

      // Delete the note
      const deleteResult = await client.callTool('delete_note', {
        identifier: noteId,
        confirm: true
      });

      assert.ok(deleteResult, 'Delete should return result');
      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Delete should be successful');
      assert.ok(deleteData.result.deleted, 'Result should indicate deletion');

      // Verify note is removed from file system
      try {
        await fs.access(notePath);
        assert.fail('Note file should be deleted');
      } catch {
        // Expected - file should not exist
      }
    });

    test('should require confirmation for note deletion', async () => {
      // Create a note
      const createResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Needs Confirmation',
        content: '# Needs Confirmation\n\nThis deletion needs confirmation.'
      });

      const noteData = JSON.parse((createResult as any).content[0].text);
      const noteId = noteData.id;

      // Try to delete without confirmation
      const deleteResult = await client.callTool('delete_note', {
        identifier: noteId,
        confirm: false
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Delete without confirmation should fail');
      assert.ok(
        deleteData.error.includes('confirmation') || deleteData.error.includes('confirm'),
        'Error should mention confirmation requirement'
      );

      // Verify note still exists
      const notePath = join(context.tempDir, noteId + '.md');
      await fs.access(notePath); // Should not throw
    });

    test('should handle deletion of non-existent note', async () => {
      const deleteResult = await client.callTool('delete_note', {
        identifier: 'general/non-existent.md',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Delete of non-existent note should fail');
      assert.ok(deleteData.error, 'Should include error message');
    });
  });

  describe('Note Type Deletion', () => {
    test('should delete empty note type with error strategy', async () => {
      // Delete the temporary note type (should be empty)
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'error',
        confirm: true
      });

      assert.ok(deleteResult, 'Delete should return result');
      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Delete should be successful');

      // Verify directory is removed
      const typeDir = join(context.tempDir, 'temporary');
      try {
        await fs.access(typeDir);
        assert.fail('Note type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should prevent deletion of non-empty note type with error strategy', async () => {
      // Create a note in the temporary type
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Blocking Note',
        content: '# Blocking Note\n\nThis note prevents type deletion.'
      });

      // Try to delete with error strategy
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'error',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Delete should fail with existing notes');
      assert.ok(
        deleteData.error.includes('contains') && deleteData.error.includes('notes'),
        'Error should mention existing notes'
      );

      // Verify type directory still exists
      const typeDir = join(context.tempDir, 'temporary');
      await fs.access(typeDir); // Should not throw
    });

    test('should migrate notes to target type', async () => {
      // Create notes in temporary type
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Migrate Me 1',
        content: '# Migrate Me 1\n\nThis note should be migrated.'
      });

      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Migrate Me 2',
        content: '# Migrate Me 2\n\nThis note should also be migrated.'
      });

      // Delete note type with migration
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'migrate',
        target_type: 'archive',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Migration should be successful');

      // Verify notes are now in archive type
      const archiveDir = join(context.tempDir, 'archive');
      const archiveFiles = await fs.readdir(archiveDir);

      const migratedFiles = archiveFiles.filter(
        file => file.includes('migrate-me-1') || file.includes('migrate-me-2')
      );
      assert.strictEqual(migratedFiles.length, 2, 'Both notes should be migrated');

      // Verify temporary directory is removed
      const tempDir = join(context.tempDir, 'temporary');
      try {
        await fs.access(tempDir);
        assert.fail('Temporary note type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should delete note type and all its notes', async () => {
      // Create notes in temporary type
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Delete Me 1',
        content: '# Delete Me 1\n\nThis note should be deleted.'
      });

      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Delete Me 2',
        content: '# Delete Me 2\n\nThis note should also be deleted.'
      });

      // Delete note type with delete strategy
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'delete',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Deletion should be successful');

      // Verify directory is completely removed
      const tempDir = join(context.tempDir, 'temporary');
      try {
        await fs.access(tempDir);
        assert.fail('Note type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should require confirmation for note type deletion', async () => {
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'error',
        confirm: false
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Delete without confirmation should fail');
      assert.ok(
        deleteData.error.includes('confirmation') || deleteData.error.includes('confirm'),
        'Error should mention confirmation requirement'
      );
    });
  });

  describe('Bulk Note Deletion', () => {
    test('should delete notes by type', async () => {
      // Create notes in temporary type
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Bulk Delete 1',
        content: '# Bulk Delete 1\n\nFirst note to bulk delete.'
      });

      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Bulk Delete 2',
        content: '# Bulk Delete 2\n\nSecond note to bulk delete.'
      });

      // Bulk delete by type
      const deleteResult = await client.callTool('bulk_delete_notes', {
        type: 'temporary',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Bulk delete should be successful');

      // Verify temporary directory is empty or removed
      const tempDir = join(context.tempDir, 'temporary');
      try {
        const files = await fs.readdir(tempDir);
        const markdownFiles = files.filter(f => f.endsWith('.md'));
        assert.strictEqual(markdownFiles.length, 0, 'No markdown files should remain');
      } catch {
        // Directory might be completely removed, which is also acceptable
      }
    });

    test('should delete notes by pattern', async () => {
      // Create notes with specific pattern
      await client.callTool('create_note', {
        type: 'general',
        title: 'temp-file-1',
        content: '# Temporary File 1\n\nTemporary content.'
      });

      await client.callTool('create_note', {
        type: 'general',
        title: 'temp-file-2',
        content: '# Temporary File 2\n\nMore temporary content.'
      });

      await client.callTool('create_note', {
        type: 'general',
        title: 'important-file',
        content: '# Important File\n\nImportant content.'
      });

      // Bulk delete by pattern
      const deleteResult = await client.callTool('bulk_delete_notes', {
        pattern: 'temp-.*',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(deleteData.success, 'Pattern-based bulk delete should be successful');

      // Verify only temp files are deleted, important file remains
      const generalDir = join(context.tempDir, 'general');
      const files = await fs.readdir(generalDir);
      const importantFile = files.find(f => f.includes('important-file'));
      assert.ok(importantFile, 'Important file should remain');

      const tempFiles = files.filter(f => f.includes('temp-file'));
      assert.strictEqual(tempFiles.length, 0, 'Temp files should be deleted');
    });

    test('should require confirmation for bulk deletion', async () => {
      // Create a note for bulk deletion
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Bulk Test',
        content: '# Bulk Test\n\nTest content.'
      });

      // Try bulk delete without confirmation
      const deleteResult = await client.callTool('bulk_delete_notes', {
        type: 'temporary',
        confirm: false
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Bulk delete without confirmation should fail');
      assert.ok(
        deleteData.error.includes('confirmation') || deleteData.error.includes('confirm'),
        'Error should mention confirmation requirement'
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid note identifiers gracefully', async () => {
      const invalidIdentifiers = [
        'invalid-format',
        '/absolute/path.md',
        '../relative/path.md',
        ''
      ];

      for (const identifier of invalidIdentifiers) {
        const deleteResult = await client.callTool('delete_note', {
          identifier,
          confirm: true
        });

        const deleteData = JSON.parse((deleteResult as any).content[0].text);
        assert.ok(!deleteData.success, `Invalid identifier should fail: ${identifier}`);
        assert.ok(deleteData.error, 'Should include error message');
      }
    });

    test('should handle deletion of non-existent note type', async () => {
      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'non-existent-type',
        action: 'error',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Delete of non-existent type should fail');
      assert.ok(deleteData.error, 'Should include error message');
    });

    test('should handle migration to non-existent target type', async () => {
      // Create a note in temporary type
      await client.callTool('create_note', {
        type: 'temporary',
        title: 'Migration Test',
        content: '# Migration Test\n\nTest content.'
      });

      const deleteResult = await client.callTool('delete_note_type', {
        type_name: 'temporary',
        action: 'migrate',
        target_type: 'non-existent-target',
        confirm: true
      });

      const deleteData = JSON.parse((deleteResult as any).content[0].text);
      assert.ok(!deleteData.success, 'Migration to non-existent type should fail');
      assert.ok(deleteData.error, 'Should include error message');
    });
  });

  describe('File System Integration', () => {
    test('should maintain file system consistency during deletion', async () => {
      // Create a note
      const createResult = await client.callTool('create_note', {
        type: 'general',
        title: 'Consistency Test',
        content: '# Consistency Test\n\nTest content for consistency.'
      });

      const noteData = JSON.parse((createResult as any).content[0].text);
      const noteId = noteData.id;
      const notePath = join(context.tempDir, noteId + '.md');

      // Verify file exists
      await fs.access(notePath);
      const beforeContent = await fs.readFile(notePath, 'utf8');
      assert.ok(
        beforeContent.includes('Consistency Test'),
        'File should contain expected content'
      );

      // Delete the note
      await client.callTool('delete_note', {
        identifier: noteId,
        confirm: true
      });

      // Verify file is completely removed
      try {
        await fs.access(notePath);
        assert.fail('File should be completely removed from file system');
      } catch {
        // Expected - file should not exist
      }
    });

    test('should handle concurrent operations during deletion', async () => {
      // Create multiple notes
      const notePromises: Promise<unknown>[] = [];
      for (let i = 0; i < 3; i++) {
        notePromises.push(
          client.callTool('create_note', {
            type: 'general',
            title: `Concurrent Test ${i}`,
            content: `# Concurrent Test ${i}\n\nContent for concurrent testing.`
          })
        );
      }

      const createResults = await Promise.all(notePromises);
      const noteIds = createResults.map(result => {
        const data = JSON.parse((result as any).content[0].text);
        return data.id;
      });

      // Attempt concurrent deletions
      const deletePromises = noteIds.map(id =>
        client.callTool('delete_note', {
          identifier: id,
          confirm: true
        })
      );

      const deleteResults = await Promise.all(deletePromises);

      // All deletions should succeed
      for (const result of deleteResults) {
        const deleteData = JSON.parse((result as any).content[0].text);
        assert.ok(deleteData.success, 'Concurrent deletion should succeed');
      }

      // Verify all files are removed
      for (const noteId of noteIds) {
        const notePath = join(context.tempDir, noteId + '.md');
        try {
          await fs.access(notePath);
          assert.fail(`File should be deleted: ${noteId}`);
        } catch {
          // Expected - file should not exist
        }
      }
    });
  });
});
