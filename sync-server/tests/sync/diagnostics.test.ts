import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { createTestDb } from '../helpers/test-db.js';
import { createTmpDir, cleanupTmpDir } from '../helpers/test-fs.js';
import type { Database } from 'bun:sqlite';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

let testDb: Database;

// Create a single tmpDir (DATA_DIR is captured at module load time in diagnostics.ts)
const moduleTmpDir = createTmpDir();
process.env.DATA_DIR = moduleTmpDir;

mock.module('../../src/db.js', () => ({
  getDb: () => testDb
}));

const { createDiagnosticsRoutes } = await import('../../src/sync/diagnostics.js');

function createTestApp(activeUsers = 0, activeConnections = 0): express.Express {
  const app = express();
  const router = createDiagnosticsRoutes(
    () => activeUsers,
    () => activeConnections
  );
  app.use('/diagnostics', router);
  return app;
}

async function request(
  app: express.Express,
  urlPath: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = app.listen(0, '127.0.0.1');
  const addr = server.address() as { port: number };
  try {
    const url = `http://127.0.0.1:${addr.port}${urlPath}`;
    const res = await fetch(url);
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  testDb = createTestDb();

  // Clean the automerge-docs subdir between tests
  const docsDir = path.join(moduleTmpDir, 'automerge-docs');
  fs.rmSync(docsDir, { recursive: true, force: true });
});

afterAll(() => {
  cleanupTmpDir(moduleTmpDir);
});

describe('GET /diagnostics/server', () => {
  it('returns memory, activeUsers, activeConnections fields', async () => {
    const app = createTestApp(3, 5);
    const { status, body } = await request(app, '/diagnostics/server');

    expect(status).toBe(200);
    expect(body.memory).toBeDefined();
    expect((body.memory as Record<string, string>).rss).toBeDefined();
    expect((body.memory as Record<string, string>).heapUsed).toBeDefined();
    expect(body.activeUsers).toBe(3);
    expect(body.activeConnections).toBe(5);
    expect(body.uptime).toBeDefined();
  });
});

describe('GET /diagnostics/user', () => {
  it('returns doc counts and disk sizes for authenticated user', async () => {
    const userDid = 'did:test:user1';

    // Register a vault and content doc
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run(userDid, 'vault-1', 'automerge:doc1');
    testDb
      .query(
        'INSERT INTO content_doc_access (doc_url, user_did, vault_id) VALUES (?, ?, ?)'
      )
      .run('automerge:content1', userDid, 'vault-1');

    // Create docs on disk using the module-level tmpDir
    const sanitizedDid = userDid.replace(/[^a-zA-Z0-9]/g, '_');
    const docsDir = path.join(moduleTmpDir, 'automerge-docs', sanitizedDid, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'doc1.bin'), new Uint8Array([1, 2, 3]));

    // App with auth middleware
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { userDid: string }).userDid = userDid;
      next();
    });
    const router = createDiagnosticsRoutes(
      () => 0,
      () => 0
    );
    app.use('/diagnostics', router);

    const { status, body } = await request(app, '/diagnostics/user');
    expect(status).toBe(200);
    expect(body.docCount).toBe(1);
    expect(body.totalDiskSizeBytes).toBe(3);
    expect(body.registeredVaults).toBe(1);
    expect(body.registeredContentDocs).toBe(1);
  });

  it('returns zeros for user with no data', async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { userDid: string }).userDid = 'did:test:empty';
      next();
    });
    const router = createDiagnosticsRoutes(
      () => 0,
      () => 0
    );
    app.use('/diagnostics', router);

    const { status, body } = await request(app, '/diagnostics/user');
    expect(status).toBe(200);
    expect(body.docCount).toBe(0);
    expect(body.totalDiskSizeBytes).toBe(0);
    expect(body.registeredVaults).toBe(0);
    expect(body.registeredContentDocs).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    const app = createTestApp();

    const { status, body } = await request(app, '/diagnostics/user');
    expect(status).toBe(401);
    expect(body.error).toBe('Not authenticated');
  });
});
