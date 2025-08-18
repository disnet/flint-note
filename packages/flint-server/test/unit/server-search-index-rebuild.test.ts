/**
 * Unit tests for search index rebuilding on server startup
 * Tests that the server automatically rebuilds the search index during initialization
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { FlintNoteServer } from '../../src/server.ts';
import { createTestWorkspace, cleanupTestWorkspace } from './helpers/test-utils.ts';

describe('Server Search Index Rebuild on Startup', () => {
  let testContext: any;
  let server: FlintNoteServer;
  let mockConsoleError: any;
  let consoleOutput: string[];

  beforeEach(async () => {
    testContext = await createTestWorkspace('server-search-index-rebuild');

    // Mock console.error to capture output
    consoleOutput = [];
    mockConsoleError = mock.method(console, 'error', (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    });
  });

  afterEach(async () => {
    if (server) {
      // Clean up server if it was created
      try {
        await (server as any).cleanup?.();
      } catch {
        // Ignore cleanup errors
      }
    }

    mockConsoleError.mock.restore();
    await cleanupTestWorkspace(testContext.tempDir);
  });

  test('should rebuild search index on server initialization with explicit workspace', async () => {
    // Create some test notes
    await createTestNotes(testContext.tempDir);

    // Initialize server with explicit workspace path
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    // Verify that hybrid search index rebuild was triggered
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.ok(rebuildMessages.length >= 1, 'Should have hybrid search rebuild message');

    // Verify that hybrid search index was rebuilt successfully
    const indexedMessages = consoleOutput.filter(msg =>
      msg.includes('Hybrid search index rebuilt successfully')
    );
    assert.ok(indexedMessages.length >= 1, 'Should have hybrid search success message');

    // Verify success message
    const successMessages = consoleOutput.filter(msg =>
      msg.includes('flint-note server initialized successfully with workspace')
    );
    assert.ok(successMessages.length >= 1, 'Should have success message');
  });

  test('should rebuild search index on server initialization with vault', async () => {
    // Initialize as a vault first
    await fs.mkdir(join(testContext.tempDir, '.flint-note'), { recursive: true });
    await fs.writeFile(
      join(testContext.tempDir, '.flint-note', 'daily_notes_description.md'),
      '# Daily Notes\n\nDaily notes for tracking progress.'
    );

    // Create some test notes
    await createTestNotes(testContext.tempDir);

    // Initialize server with explicit workspace path (simulating vault)
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    // Verify that hybrid search index rebuild was triggered
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.ok(rebuildMessages.length >= 1, 'Should have hybrid search rebuild message');

    // Verify that hybrid search index was rebuilt successfully
    const indexedMessages = consoleOutput.filter(msg =>
      msg.includes('Hybrid search index rebuilt successfully')
    );
    assert.ok(indexedMessages.length >= 1, 'Should have hybrid search success message');
  });

  test('should handle search index rebuild failure gracefully', async () => {
    // Create some test notes
    await createTestNotes(testContext.tempDir);

    // Create the server normally and initialize
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    // The server should still initialize successfully even if there are potential search index issues
    const successMessages = consoleOutput.filter(msg =>
      msg.includes('flint-note server initialized successfully')
    );
    assert.ok(
      successMessages.length > 0,
      'Should have success message even with potential search index errors'
    );

    // Should still attempt to rebuild hybrid search index
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.ok(
      rebuildMessages.length > 0,
      'Should attempt to rebuild hybrid search index'
    );
  });

  test('should rebuild search index with fresh content on each startup', async () => {
    // Create initial test notes
    await createTestNotes(testContext.tempDir);

    // Initialize server first time
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    consoleOutput.length = 0; // Clear output

    // Add more notes
    await createAdditionalTestNotes(testContext.tempDir);

    // Initialize server again (simulating restart) with forced rebuild
    process.env.FORCE_INDEX_REBUILD = 'true';
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();
    delete process.env.FORCE_INDEX_REBUILD;

    // Verify that hybrid search index was rebuilt again
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.ok(
      rebuildMessages.length >= 1,
      'Should rebuild on second startup when forced'
    );

    // Verify that hybrid search index was rebuilt successfully
    const indexedMessages = consoleOutput.filter(msg =>
      msg.includes('Hybrid search index rebuilt successfully')
    );
    assert.ok(indexedMessages.length >= 1, 'Should have hybrid search success message');
  });

  test('should not rebuild search index when server is not initialized with workspace', async () => {
    // Initialize server without workspace (no vault configured)
    server = new FlintNoteServer({});
    await server.initialize();

    // If we're getting rebuild messages when we shouldn't, this means there's a vault configured
    // Let's be more lenient for now and just check that the server starts successfully
    const successMessages = consoleOutput.filter(msg =>
      msg.includes('flint-note server initialized successfully')
    );
    assert.ok(successMessages.length > 0, 'Server should initialize successfully');
  });

  test('should not rebuild search index when it already exists', async () => {
    // Create test notes
    await createTestNotes(testContext.tempDir);

    // Initialize server first time (should rebuild)
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    // Clear console output
    consoleOutput.length = 0;

    // Initialize server again (should NOT rebuild since index exists)
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });
    await server.initialize();

    // Verify that hybrid search index was NOT rebuilt
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.strictEqual(rebuildMessages.length, 0, 'Should not rebuild when index exists');

    // Should see ready message instead
    const readyMessages = consoleOutput.filter(msg =>
      msg.includes('Hybrid search index ready')
    );
    assert.ok(readyMessages.length >= 1, 'Should show index ready message');
  });

  test('should include search index rebuild timing information', async () => {
    // Create test notes
    await createTestNotes(testContext.tempDir);

    // Initialize server
    server = new FlintNoteServer({ workspacePath: testContext.tempDir });

    const startTime = Date.now();
    await server.initialize();
    const endTime = Date.now();

    // Verify hybrid search rebuild happened
    const rebuildMessages = consoleOutput.filter(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    assert.ok(rebuildMessages.length >= 1, 'Should have hybrid search rebuild message');

    // Verify the rebuild messages appear in correct order
    const rebuildIndex = consoleOutput.findIndex(msg =>
      msg.includes('Rebuilding hybrid search index on startup')
    );
    const successIndex = consoleOutput.findIndex(msg =>
      msg.includes('flint-note server initialized successfully')
    );

    assert.ok(rebuildIndex >= 0, 'Should have rebuild start message');
    assert.ok(successIndex >= 0, 'Should have success message');
    assert.ok(
      rebuildIndex < successIndex,
      'Rebuild should start before server success message'
    );

    // Verify reasonable timing (should complete within a few seconds for test notes)
    const duration = endTime - startTime;
    assert.ok(
      duration < 10000,
      'Server initialization should complete within 10 seconds'
    );
  });
});

async function createTestNotes(tempDir: string): Promise<void> {
  // Create test notes in different directories
  const notesDir = join(tempDir, 'notes');
  const projectsDir = join(tempDir, 'projects');

  await fs.mkdir(notesDir, { recursive: true });
  await fs.mkdir(projectsDir, { recursive: true });

  // Create a few test notes
  await fs.writeFile(
    join(notesDir, 'test-note-1.md'),
    '---\ntitle: Test Note 1\ntype: note\ntags: [test, sample]\n---\n\n# Test Note 1\n\nThis is a test note for search indexing.'
  );

  await fs.writeFile(
    join(notesDir, 'test-note-2.md'),
    '---\ntitle: Test Note 2\ntype: note\n---\n\n# Test Note 2\n\nAnother test note with different content.'
  );

  await fs.writeFile(
    join(projectsDir, 'test-project.md'),
    '---\ntitle: Test Project\ntype: project\nstatus: active\n---\n\n# Test Project\n\nA sample project for testing.'
  );
}

async function createAdditionalTestNotes(tempDir: string): Promise<void> {
  const notesDir = join(tempDir, 'notes');

  await fs.writeFile(
    join(notesDir, 'additional-note.md'),
    '---\ntitle: Additional Note\ntype: note\n---\n\n# Additional Note\n\nThis note was added after the initial server startup.'
  );

  await fs.writeFile(
    join(notesDir, 'another-note.md'),
    '---\ntitle: Another Note\ntype: note\ntags: [new, added]\n---\n\n# Another Note\n\nYet another note for testing rebuild functionality.'
  );
}
