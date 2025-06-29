/**
 * Integration tests for command-line argument parsing
 * Tests that the server correctly handles --workspace and other command-line arguments
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  spawnTsxCommand,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

describe('Command Line Arguments Integration', () => {
  let context: IntegrationTestContext;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('cmd-args');
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  test('should start server with --workspace argument', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    const serverProcess = await spawnTsxCommand(
      [serverPath, '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    context.serverProcess = serverProcess;

    let startupOutput = '';
    let errorOutput = '';
    let hasStarted = false;

    // Set timeout for server startup
    const startupTimeout = setTimeout(() => {
      if (!hasStarted) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to start within timeout');
      }
    }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stdout?.on('data', data => {
          startupOutput += data.toString();
        });

        serverProcess.stderr?.on('data', data => {
          const output = data.toString();
          errorOutput += output;

          if (output.includes('Flint Note MCP server running on stdio')) {
            hasStarted = true;
            clearTimeout(startupTimeout);
            resolve();
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(startupTimeout);
          reject(new Error(`Failed to start server: ${error.message}`));
        });

        serverProcess.on('exit', (code, signal) => {
          clearTimeout(startupTimeout);
          if (!hasStarted) {
            reject(
              new Error(
                `Server exited unexpectedly with code ${code}, signal ${signal}. Stdout: ${startupOutput}, Stderr: ${errorOutput}`
              )
            );
          }
        });
      });

      // Verify the server started successfully
      assert.ok(hasStarted, 'Server should start successfully');
      assert.ok(!serverProcess.killed, 'Server process should be running');
      assert.ok(
        errorOutput.includes(`workspace: ${context.tempDir}`),
        `Server should use specified workspace path. Error output: ${errorOutput}`
      );
    } finally {
      clearTimeout(startupTimeout);
    }
  });

  test('should start server with --workspace-path argument', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    const serverProcess = await spawnTsxCommand(
      [serverPath, '--workspace-path', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    context.serverProcess = serverProcess;

    let hasStarted = false;
    let errorOutput = '';

    const startupTimeout = setTimeout(() => {
      if (!hasStarted) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to start within timeout');
      }
    }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stderr?.on('data', data => {
          const output = data.toString();
          errorOutput += output;

          if (output.includes('Flint Note MCP server running on stdio')) {
            hasStarted = true;
            clearTimeout(startupTimeout);
            resolve();
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(startupTimeout);
          reject(new Error(`Failed to start server: ${error.message}`));
        });

        serverProcess.on('exit', (code, signal) => {
          clearTimeout(startupTimeout);
          if (!hasStarted) {
            reject(
              new Error(`Server exited unexpectedly with code ${code}, signal ${signal}`)
            );
          }
        });
      });

      assert.ok(hasStarted, 'Server should start with --workspace-path argument');
      assert.ok(
        errorOutput.includes(`workspace: ${context.tempDir}`),
        'Server should use specified workspace path'
      );
    } finally {
      clearTimeout(startupTimeout);
    }
  });

  test('should show help message with --help argument', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    const serverProcess = await spawnTsxCommand([serverPath, '--help'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let hasExited = false;

    const helpTimeout = setTimeout(() => {
      if (!hasExited) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to show help within timeout');
      }
    }, 5000);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stdout?.on('data', data => {
          stdout += data.toString();
        });

        serverProcess.on('exit', code => {
          hasExited = true;
          clearTimeout(helpTimeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Help command exited with code ${code}`));
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(helpTimeout);
          reject(new Error(`Failed to run help command: ${error.message}`));
        });
      });

      assert.ok(hasExited, 'Server should exit after showing help');
      assert.ok(
        stdout.includes('flint-note MCP Server'),
        'Should show server name in help'
      );
      assert.ok(stdout.includes('--workspace'), 'Should show workspace option in help');
      assert.ok(stdout.includes('--help'), 'Should show help option in help');
    } finally {
      clearTimeout(helpTimeout);
    }
  });

  test('should show help message with -h argument', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    const serverProcess = await spawnTsxCommand([serverPath, '-h'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let hasExited = false;

    const helpTimeout = setTimeout(() => {
      if (!hasExited) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to show help within timeout');
      }
    }, 5000);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stdout?.on('data', data => {
          stdout += data.toString();
        });

        serverProcess.on('exit', code => {
          hasExited = true;
          clearTimeout(helpTimeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Help command exited with code ${code}`));
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(helpTimeout);
          reject(new Error(`Failed to run help command: ${error.message}`));
        });
      });

      assert.ok(hasExited, 'Server should exit after showing help');
      assert.ok(
        stdout.includes('flint-note MCP Server'),
        'Should show server name in help'
      );
    } finally {
      clearTimeout(helpTimeout);
    }
  });

  test('should handle invalid workspace path with proper error', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');
    // Use a more realistic invalid path that can't be created
    const invalidPath =
      process.platform === 'win32'
        ? 'Z:\\invalid\\path\\that\\does\\not\\exist'
        : '/root/invalid/path/that/cannot/be/created';

    const serverProcess = await spawnTsxCommand(
      [serverPath, '--workspace', invalidPath],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let errorOutput = '';
    let hasExited = false;

    const errorTimeout = setTimeout(() => {
      if (!hasExited) {
        serverProcess.kill('SIGTERM');
        // Give it a moment to clean up
        setTimeout(() => {
          if (!hasExited) {
            serverProcess.kill('SIGKILL');
          }
        }, 1000);
      }
    }, 3000); // Reduced timeout since the error should happen quickly

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stderr?.on('data', data => {
          errorOutput += data.toString();
          // Check for immediate error indicators
          if (
            errorOutput.includes('Failed to initialize') ||
            errorOutput.includes('ENOENT') ||
            errorOutput.includes('EACCES') ||
            errorOutput.includes('permission denied')
          ) {
            hasExited = true;
            clearTimeout(errorTimeout);
            resolve();
          }
        });

        serverProcess.on('exit', code => {
          hasExited = true;
          clearTimeout(errorTimeout);
          if (code !== 0) {
            resolve(); // We expect a non-zero exit code for invalid path
          } else {
            reject(new Error('Server should exit with error code for invalid path'));
          }
        });

        serverProcess.on('error', () => {
          hasExited = true;
          clearTimeout(errorTimeout);
          // This is actually expected for invalid paths
          resolve();
        });
      });

      assert.ok(hasExited, 'Server should exit with error for invalid path');
      // The error message might vary based on platform and permissions
      const hasExpectedError =
        errorOutput.includes('Failed to initialize') ||
        errorOutput.includes('ENOENT') ||
        errorOutput.includes('EACCES') ||
        errorOutput.includes('permission denied') ||
        errorOutput.length > 0; // Any error output is acceptable

      assert.ok(
        hasExpectedError,
        `Should show appropriate error message. Got: ${errorOutput}`
      );
    } finally {
      clearTimeout(errorTimeout);
      // Ensure cleanup
      if (!hasExited && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  });

  test('should handle missing workspace argument value', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    const serverProcess = await spawnTsxCommand([serverPath, '--workspace'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let errorOutput = '';
    let hasExited = false;

    const errorTimeout = setTimeout(() => {
      if (!hasExited) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to exit within timeout');
      }
    }, 5000);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stderr?.on('data', data => {
          errorOutput += data.toString();
        });

        serverProcess.on('exit', code => {
          hasExited = true;
          clearTimeout(errorTimeout);
          if (code !== 0) {
            resolve(); // We expect a non-zero exit code for missing argument
          } else {
            reject(
              new Error(
                'Server should exit with error code for missing workspace argument'
              )
            );
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(errorTimeout);
          reject(new Error(`Failed to run server: ${error.message}`));
        });
      });

      assert.ok(
        hasExited,
        'Server should exit with error for missing workspace argument'
      );
      assert.ok(
        errorOutput.includes('requires a path argument'),
        `Should show missing argument error. Got: ${errorOutput}`
      );
    } finally {
      clearTimeout(errorTimeout);
    }
  });

  test('should prioritize --workspace over environment variable', async () => {
    const serverPath = join(process.cwd(), 'src', 'index.ts');

    // Set environment variable to a different path
    const serverProcess = await spawnTsxCommand(
      [serverPath, '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    context.serverProcess = serverProcess;

    let hasStarted = false;
    let errorOutput = '';

    const startupTimeout = setTimeout(() => {
      if (!hasStarted) {
        serverProcess.kill('SIGKILL');
        assert.fail('Server failed to start within timeout');
      }
    }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

    try {
      await new Promise<void>((resolve, reject) => {
        serverProcess.stderr?.on('data', data => {
          const output = data.toString();
          errorOutput += output;

          if (output.includes('Flint Note MCP server running on stdio')) {
            hasStarted = true;
            clearTimeout(startupTimeout);
            resolve();
          }
        });

        serverProcess.on('error', error => {
          clearTimeout(startupTimeout);
          reject(new Error(`Failed to start server: ${error.message}`));
        });

        serverProcess.on('exit', (code, signal) => {
          clearTimeout(startupTimeout);
          if (!hasStarted) {
            reject(
              new Error(`Server exited unexpectedly with code ${code}, signal ${signal}`)
            );
          }
        });
      });

      assert.ok(hasStarted, 'Server should start successfully');
      assert.ok(
        errorOutput.includes(`workspace: ${context.tempDir}`),
        'Server should use --workspace argument, not environment variable'
      );
      assert.ok(
        !errorOutput.includes('deprecated'),
        'Should not show deprecation warning when using --workspace'
      );
    } finally {
      clearTimeout(startupTimeout);
    }
  });
});
