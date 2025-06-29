/**
 * Basic integration tests for flint-note MCP server
 * Tests that the server can start and stop correctly
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  stopServer,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

describe('MCP Server Integration', () => {
  let context: IntegrationTestContext;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('server-basic');
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  test('should start server and receive startup message', async () => {
    // Start the server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    // Verify the server process is running
    assert.ok(context.serverProcess, 'Server process should be created');
    assert.ok(!context.serverProcess.killed, 'Server process should be running');
    assert.ok(context.serverProcess.pid, 'Server process should have a PID');
  });

  test('should gracefully shutdown server', async () => {
    // Start the server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir
    });

    // Stop the server gracefully
    await stopServer(
      context.serverProcess,
      INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
    );

    // Verify server has stopped
    assert.ok(
      context.serverProcess.killed,
      'Server should be stopped after graceful shutdown'
    );
  });

  test('should handle invalid workspace path gracefully', async () => {
    // Create a file, then try to use it as a workspace directory
    // This should fail since you can't create .flint-note directory inside a file
    const tempFile = join(context.tempDir, 'not-a-directory');
    await fs.writeFile(tempFile, 'This is a file, not a directory', 'utf8');

    try {
      context.serverProcess = await startServer({
        workspacePath: tempFile, // Try to use the file as a workspace
        timeout: 2000
      });
      assert.fail('Server should not start when workspace path is a file');
    } catch (error) {
      // Expected to fail - server should detect it can't create .flint-note in a file
      assert.ok(error instanceof Error, 'Should throw an error for invalid workspace');
      assert.ok(
        error.message.includes('exited unexpectedly') ||
          error.message.includes('ENOTDIR') ||
          error.message.includes('not a directory'),
        `Error message should indicate directory access failure. Got: ${error.message}`
      );
    }
  });
});
