/**
 * Integration tests for search index rebuilding on server startup
 * Tests that the actual server process rebuilds the search index during startup
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ChildProcess as _ChildProcess } from 'node:child_process';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer as _startServer,
  stopServer,
  spawnTsxCommand,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

describe('Search Index Rebuild Integration', () => {
  let context: IntegrationTestContext;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('search-index-rebuild');
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  test('should rebuild search index on server startup with fresh workspace', async () => {
    // Create some test notes
    await createTestNotes(context.tempDir);

    let rebuildMessageSeen = false;
    let indexedCount = 0;
    let serverStarted = false;

    // Start the server and capture stderr output
    const serverProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = serverProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill('SIGKILL');
        reject(new Error('Timeout waiting for server startup and search index rebuild'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      serverProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Rebuilding hybrid search index on startup')) {
          rebuildMessageSeen = true;
        }

        if (output.includes('Hybrid search index:')) {
          const match = output.match(/(\d+)\/(\d+) notes processed/);
          if (match) {
            indexedCount = parseInt(match[2]); // Use total count
          }
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          serverStarted = true;
          clearTimeout(timeout);

          // Give the server a moment to fully start, then shut it down
          setTimeout(async () => {
            await stopServer(
              serverProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              assert.ok(rebuildMessageSeen, 'Should have seen rebuild message');
              assert.ok(
                indexedCount > 0,
                `Should have indexed notes (got ${indexedCount})`
              );
              assert.ok(serverStarted, 'Server should have started successfully');
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(new Error(`Server process error: ${error.message}`));
      });

      serverProcess.on('exit', (code, signal) => {
        if (code !== 0 && code !== null && signal !== 'SIGTERM') {
          clearTimeout(timeout);
          reject(
            new Error(`Server exited unexpectedly with code ${code}, signal ${signal}`)
          );
        }
      });
    });
  });

  test('should rebuild search index with correct note count', async () => {
    // Create specific test notes and count them
    const testNotes = [
      { dir: 'notes', file: 'note1.md', content: createNoteContent('Note 1', 'note') },
      { dir: 'notes', file: 'note2.md', content: createNoteContent('Note 2', 'note') },
      {
        dir: 'projects',
        file: 'project1.md',
        content: createNoteContent('Project 1', 'project')
      },
      {
        dir: 'meetings',
        file: 'meeting1.md',
        content: createNoteContent('Meeting 1', 'meeting')
      }
    ];

    for (const note of testNotes) {
      const noteDir = join(context.tempDir, note.dir);
      await fs.mkdir(noteDir, { recursive: true });
      await fs.writeFile(join(noteDir, note.file), note.content);
    }

    let indexedCount = 0;
    let serverStarted = false;

    const serverProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = serverProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill('SIGKILL');
        reject(new Error('Timeout waiting for server startup'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      serverProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Hybrid search index:')) {
          const match = output.match(/(\d+)\/(\d+) notes processed/);
          if (match) {
            indexedCount = parseInt(match[2]); // Use total count
          }
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          serverStarted = true;
          clearTimeout(timeout);

          setTimeout(async () => {
            await stopServer(
              serverProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              // Should index our test notes plus default vault notes
              assert.ok(
                indexedCount >= testNotes.length,
                `Should index at least ${testNotes.length} notes (got ${indexedCount})`
              );
              assert.ok(serverStarted, 'Server should have started');
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('should rebuild search index on each server restart', async () => {
    // Create initial notes
    await createTestNotes(context.tempDir);

    // First server startup
    // Start first server
    const firstServerProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        firstServerProcess.kill('SIGKILL');
        reject(new Error('Timeout on first server startup'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      firstServerProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Flint Note MCP server running on stdio')) {
          clearTimeout(timeout);
          setTimeout(async () => {
            await stopServer(
              firstServerProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );
            resolve();
          }, 500);
        }
      });

      firstServerProcess.on('error', reject);
    });

    // Add more notes
    await createAdditionalTestNotes(context.tempDir);

    // Second server startup
    let secondRebuildSeen = false;

    // Start second server
    const secondServerProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = secondServerProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        secondServerProcess.kill('SIGKILL');
        reject(new Error('Timeout on second server startup'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      secondServerProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Rebuilding hybrid search index on startup')) {
          secondRebuildSeen = true;
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          clearTimeout(timeout);
          setTimeout(async () => {
            await stopServer(
              secondServerProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              assert.ok(secondRebuildSeen, 'Should rebuild index on second startup');
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      secondServerProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('should handle search index rebuild gracefully', async () => {
    // Create test workspace
    await createTestNotes(context.tempDir);

    let serverStarted = false;
    let rebuildAttempted = false;

    const serverProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = serverProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill('SIGKILL');
        reject(new Error('Timeout waiting for server startup'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      serverProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Rebuilding hybrid search index on startup')) {
          rebuildAttempted = true;
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          serverStarted = true;
          clearTimeout(timeout);

          setTimeout(async () => {
            await stopServer(
              serverProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              assert.ok(rebuildAttempted, 'Should attempt to rebuild index');
              assert.ok(serverStarted, 'Server should start successfully');
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('should rebuild search index with vault configuration', async () => {
    // Set up as a vault by creating note type descriptions
    const flintNoteDir = join(context.tempDir, '.flint-note');
    await fs.mkdir(flintNoteDir, { recursive: true });

    await fs.writeFile(
      join(flintNoteDir, 'notes_description.md'),
      '# Notes\n\nGeneral notes and observations.'
    );

    // Create test notes
    await createTestNotes(context.tempDir);

    let rebuildMessageSeen = false;
    let indexedCount = 0;
    let serverStarted = false;

    const serverProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = serverProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill('SIGKILL');
        reject(new Error('Timeout waiting for vault server startup'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      serverProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Rebuilding hybrid search index on startup')) {
          rebuildMessageSeen = true;
        }

        if (output.includes('Hybrid search index:')) {
          const match = output.match(/(\d+)\/(\d+) notes processed/);
          if (match) {
            indexedCount = parseInt(match[2]); // Use total count
          }
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          serverStarted = true;
          clearTimeout(timeout);

          setTimeout(async () => {
            await stopServer(
              serverProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              assert.ok(rebuildMessageSeen, 'Should rebuild index with vault');
              assert.ok(indexedCount > 0, 'Should index notes in vault');
              assert.ok(serverStarted, 'Vault server should start');
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  test('should rebuild search index within reasonable time', async () => {
    // Create a moderate number of test notes
    const noteCount = 10;
    for (let i = 1; i <= noteCount; i++) {
      const noteDir = join(context.tempDir, 'notes');
      await fs.mkdir(noteDir, { recursive: true });
      await fs.writeFile(
        join(noteDir, `test-note-${i}.md`),
        createNoteContent(`Test Note ${i}`, 'note', `Content for test note number ${i}`)
      );
    }

    let rebuildSeen = false;
    let serverStarted = false;
    const startTime = Date.now();

    const serverProcess = await spawnTsxCommand(
      ['src/index.ts', '--workspace', context.tempDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { FORCE_INDEX_REBUILD: 'true' }
      }
    );

    context.serverProcess = serverProcess;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill('SIGKILL');
        reject(new Error('Timeout waiting for server with many notes'));
      }, INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT);

      serverProcess.stderr?.on('data', data => {
        const output = data.toString();

        if (output.includes('Rebuilding hybrid search index on startup')) {
          rebuildSeen = true;
        }

        if (output.includes('Flint Note MCP server running on stdio')) {
          serverStarted = true;
          clearTimeout(timeout);

          setTimeout(async () => {
            await stopServer(
              serverProcess,
              INTEGRATION_CONSTANTS.SERVER_SHUTDOWN_TIMEOUT
            );

            try {
              const totalDuration = Date.now() - startTime;
              assert.ok(rebuildSeen, 'Should have seen rebuild message');
              assert.ok(serverStarted, 'Server should start');
              assert.ok(
                totalDuration < 15000,
                `Server startup should complete within 15 seconds (took ${totalDuration}ms)`
              );

              resolve();
            } catch (error) {
              reject(error);
            }
          }, 500);
        }
      });

      serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });
});

async function createTestNotes(tempDir: string): Promise<void> {
  const notesDir = join(tempDir, 'notes');
  const projectsDir = join(tempDir, 'projects');

  await fs.mkdir(notesDir, { recursive: true });
  await fs.mkdir(projectsDir, { recursive: true });

  await fs.writeFile(
    join(notesDir, 'integration-test-note-1.md'),
    createNoteContent(
      'Integration Test Note 1',
      'note',
      'Content for integration testing of search index rebuild'
    )
  );

  await fs.writeFile(
    join(notesDir, 'integration-test-note-2.md'),
    createNoteContent(
      'Integration Test Note 2',
      'note',
      'Another note for integration testing'
    )
  );

  await fs.writeFile(
    join(projectsDir, 'integration-test-project.md'),
    createNoteContent(
      'Integration Test Project',
      'project',
      'A project for integration testing'
    )
  );
}

async function createAdditionalTestNotes(tempDir: string): Promise<void> {
  const notesDir = join(tempDir, 'notes');

  await fs.writeFile(
    join(notesDir, 'additional-integration-note-1.md'),
    createNoteContent(
      'Additional Integration Note 1',
      'note',
      'Additional content for restart testing'
    )
  );

  await fs.writeFile(
    join(notesDir, 'additional-integration-note-2.md'),
    createNoteContent(
      'Additional Integration Note 2',
      'note',
      'More additional content for restart testing'
    )
  );
}

function createNoteContent(title: string, type: string, content?: string): string {
  const actualContent = content || `This is the content for ${title}.`;
  return `---
title: ${title}
type: ${type}
tags: [integration-test]
created: ${new Date().toISOString()}
---

# ${title}

${actualContent}

This note was created for integration testing of the search index rebuild functionality.
`;
}
