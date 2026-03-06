import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { createTestDb } from '../helpers/test-db.js';
import { createTmpDir, cleanupTmpDir } from '../helpers/test-fs.js';
import type { Database } from 'bun:sqlite';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import * as Automerge from '@automerge/automerge';
import { cbor } from '@automerge/automerge-repo/slim';
import type { PeerId } from '@automerge/automerge-repo';

let testDb: Database;

// Create a single tmpDir used for the entire module (DATA_DIR is captured at module load)
const moduleTmpDir = createTmpDir();
process.env.DATA_DIR = moduleTmpDir;

// Mock dependencies before importing lean-sync-server
mock.module('../../src/db.js', () => ({
  getDb: () => testDb
}));

mock.module('../../src/auth/session.js', () => ({
  verifySessionTokenAsync: async (token: string) => {
    if (token === 'valid-token') {
      return { userDid: 'did:test:user1', sessionId: 'session-1' };
    }
    if (token === 'valid-token-2') {
      return { userDid: 'did:test:user2', sessionId: 'session-2' };
    }
    return null;
  },
  parseCookies: (header: string) => {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;
    for (const pair of header.split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      cookies[pair.slice(0, eqIdx).trim()] = decodeURIComponent(
        pair.slice(eqIdx + 1).trim()
      );
    }
    return cookies;
  }
}));

const {
  initLeanSyncServer,
  getActiveUserCount,
  getActiveConnectionCount,
  resetSyncState
} = await import('../../src/sync/lean-sync-server.js');

let server: http.Server;
let serverPort: number;
const openSockets: WebSocket[] = [];

function getWsUrl(): string {
  return `ws://127.0.0.1:${serverPort}/sync`;
}

/** Creates a message queue from a WebSocket - properly handles async message delivery */
function createMessageQueue(ws: WebSocket) {
  const queue: Record<string, unknown>[] = [];
  const waiters: Array<(msg: Record<string, unknown>) => void> = [];

  ws.on('message', (data: Buffer) => {
    const msg = cbor.decode(new Uint8Array(data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      queue.push(msg);
    }
  });

  return {
    next(timeoutMs = 3000): Promise<Record<string, unknown>> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: Record<string, unknown>): void => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          // Remove the waiter so it doesn't consume future messages
          const idx = waiters.indexOf(waiter);
          if (idx !== -1) waiters.splice(idx, 1);
          reject(new Error('Message timeout'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    }
  };
}

async function connectWs(
  token = 'valid-token'
): Promise<{ ws: WebSocket; mq: ReturnType<typeof createMessageQueue> }> {
  const ws = new WebSocket(getWsUrl(), {
    headers: { cookie: `flint_session=${token}` }
  });
  const mq = createMessageQueue(ws);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  openSockets.push(ws);
  return { ws, mq };
}

function sendCbor(ws: WebSocket, msg: Record<string, unknown>): void {
  ws.send(cbor.encode(msg));
}

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for close')),
      timeoutMs
    );
    ws.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function doHandshake(
  ws: WebSocket,
  mq: ReturnType<typeof createMessageQueue>,
  peerId = 'test-peer-1'
): Promise<Record<string, unknown>> {
  sendCbor(ws, {
    type: 'join',
    senderId: peerId,
    peerMetadata: { storageId: `storage-${peerId}`, isEphemeral: false },
    supportedProtocolVersions: ['1']
  });
  return await mq.next();
}

/** Create a doc with changes so generateSyncMessage returns non-null */
function createDocWithData(): {
  doc: Automerge.Doc<{ text: string }>;
  syncState: Automerge.SyncState;
  syncMsg: Automerge.SyncMessage;
} {
  let doc = Automerge.init<{ text: string }>();
  doc = Automerge.change(doc, (d) => {
    d.text = 'hello';
  });
  const ss = Automerge.initSyncState();
  const [syncState, syncMsg] = Automerge.generateSyncMessage(doc, ss);
  return { doc, syncState, syncMsg: syncMsg! };
}

beforeEach(async () => {
  resetSyncState();
  testDb = createTestDb();
  // Clean the automerge-docs subdir between tests
  fs.rmSync(path.join(moduleTmpDir, 'automerge-docs'), { recursive: true, force: true });

  server = http.createServer();
  initLeanSyncServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  serverPort = (server.address() as { port: number }).port;
});

afterEach(async () => {
  // Force close any open WebSocket connections so server.close() doesn't hang
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  }
  openSockets.length = 0;
  // closeAllConnections() forces all HTTP connections closed so server.close() resolves
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(() => {
  cleanupTmpDir(moduleTmpDir);
});

describe('connection auth', () => {
  it('rejects upgrade on non-/sync path', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/other`, {
      headers: { cookie: 'flint_session=valid-token' }
    });
    ws.on('error', () => {});
    await waitForClose(ws);
  });

  it('rejects upgrade without session cookie', async () => {
    const ws = new WebSocket(getWsUrl());
    ws.on('error', () => {});
    await waitForClose(ws);
  });

  it('rejects upgrade with invalid session token', async () => {
    const ws = new WebSocket(getWsUrl(), {
      headers: { cookie: 'flint_session=bad-token' }
    });
    ws.on('error', () => {});
    await waitForClose(ws);
  });
});

describe('handshake', () => {
  it('accepts upgrade and completes join/peer handshake', async () => {
    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);

    expect(peerMsg.type).toBe('peer');
    expect(peerMsg.targetId).toBe('test-peer-1');
    expect(peerMsg.selectedProtocolVersion).toBe('1');
    expect(peerMsg.senderId).toBeDefined();
    expect((peerMsg.peerMetadata as Record<string, unknown>).storageId).toBeDefined();

    ws.close();
  });
});

describe('sync messages', () => {
  it('sync for inaccessible doc returns doc-unavailable', async () => {
    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);
    const { syncMsg } = createDocWithData();

    sendCbor(ws, {
      type: 'sync',
      senderId: 'test-peer-1',
      targetId: peerMsg.senderId,
      documentId: 'unregistered-doc',
      data: syncMsg
    });

    const response = await mq.next();
    expect(response.type).toBe('doc-unavailable');
    expect(response.documentId).toBe('unregistered-doc');

    ws.close();
  });

  it('sync for accessible doc returns sync response', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:testdoc1');

    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);
    const { syncMsg } = createDocWithData();

    sendCbor(ws, {
      type: 'sync',
      senderId: 'test-peer-1',
      targetId: peerMsg.senderId,
      documentId: 'testdoc1',
      data: syncMsg
    });

    const response = await mq.next();
    expect(response.type).toBe('sync');
    expect(response.documentId).toBe('testdoc1');
    expect(response.data).toBeDefined();

    ws.close();
  });

  it('full sync round-trip: doc synced to server and saved on disk', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:roundtrip1');

    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);
    const serverPeerId = peerMsg.senderId as PeerId;

    // Create a doc with data
    let clientDoc = Automerge.init<{ count: number }>();
    clientDoc = Automerge.change(clientDoc, (d) => {
      d.count = 42;
    });

    // Sync loop
    let clientSyncState = Automerge.initSyncState();
    let msg: Automerge.SyncMessage | null;

    [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);

    while (msg) {
      sendCbor(ws, {
        type: 'sync',
        senderId: 'test-peer-1',
        targetId: serverPeerId,
        documentId: 'roundtrip1',
        data: msg
      });

      let response: Record<string, unknown>;
      try {
        response = await mq.next(3000);
      } catch {
        break;
      }

      if (response.type !== 'sync') break;

      [clientDoc, clientSyncState] = Automerge.receiveSyncMessage(
        clientDoc,
        clientSyncState,
        response.data as Automerge.SyncMessage
      );

      [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);
    }

    // Wait for server to write to disk
    await new Promise((r) => setTimeout(r, 300));

    // Verify server saved the document
    const userDir = path.join(moduleTmpDir, 'automerge-docs', 'did_test_user1');
    const docPath = path.join(userDir, 'docs', 'roundtrip1.bin');
    expect(fs.existsSync(docPath)).toBe(true);

    // Load and verify content
    const savedBinary = new Uint8Array(fs.readFileSync(docPath));
    const savedDoc = Automerge.load<{ count: number }>(savedBinary);
    expect(savedDoc.count).toBe(42);

    ws.close();
  });
});

describe('bare request messages (second device scenario)', () => {
  it('bare request for inaccessible doc returns doc-unavailable', async () => {
    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);

    // Send request with no data field (like automerge-repo does for repo.find())
    sendCbor(ws, {
      type: 'request',
      senderId: 'test-peer-1',
      targetId: peerMsg.senderId,
      documentId: 'unregistered-doc'
    });

    const response = await mq.next();
    expect(response.type).toBe('doc-unavailable');
    expect(response.documentId).toBe('unregistered-doc');

    ws.close();
  });

  it('bare request for accessible doc not on disk returns sync message (empty doc)', async () => {
    // When a client announces a doc the server doesn't have yet,
    // the server should respond with a sync message from an empty doc
    // so the client can push its data.
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:nonexistent1');

    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq);

    sendCbor(ws, {
      type: 'request',
      senderId: 'test-peer-1',
      targetId: peerMsg.senderId,
      documentId: 'nonexistent1'
    });

    const response = await mq.next();
    expect(response.type).toBe('sync');
    expect(response.documentId).toBe('nonexistent1');
    expect(response.data).toBeDefined();

    ws.close();
  });

  it('bare request for accessible doc that exists on disk returns sync message', async () => {
    // First, sync a doc to the server from "device 1"
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:requestdoc1');

    const { ws: ws1, mq: mq1 } = await connectWs();
    const peerMsg1 = await doHandshake(ws1, mq1, 'device-1');
    const serverPeerId = peerMsg1.senderId as PeerId;

    // Create and sync a doc from device 1
    let clientDoc = Automerge.init<{ title: string }>();
    clientDoc = Automerge.change(clientDoc, (d) => {
      d.title = 'synced from device 1';
    });

    let clientSyncState = Automerge.initSyncState();
    let msg: Automerge.SyncMessage | null;
    [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);

    while (msg) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverPeerId,
        documentId: 'requestdoc1',
        data: msg
      });

      let response: Record<string, unknown>;
      try {
        response = await mq1.next(3000);
      } catch {
        break;
      }
      if (response.type !== 'sync') break;

      [clientDoc, clientSyncState] = Automerge.receiveSyncMessage(
        clientDoc,
        clientSyncState,
        response.data as Automerge.SyncMessage
      );
      [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);
    }

    ws1.close();
    await new Promise((r) => setTimeout(r, 300));

    // Now "device 2" connects and sends a bare request (no data)
    const { ws: ws2, mq: mq2 } = await connectWs();
    const peerMsg2 = await doHandshake(ws2, mq2, 'device-2');

    sendCbor(ws2, {
      type: 'request',
      senderId: 'device-2',
      targetId: peerMsg2.senderId,
      documentId: 'requestdoc1'
    });

    const response = await mq2.next();
    expect(response.type).toBe('sync');
    expect(response.documentId).toBe('requestdoc1');
    expect(response.data).toBeDefined();

    ws2.close();
  });

  it('second device can fully receive a doc via bare request then sync exchange', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:fullrequest1');

    // Device 1 syncs a doc to the server
    const { ws: ws1, mq: mq1 } = await connectWs();
    const peerMsg1 = await doHandshake(ws1, mq1, 'device-1');
    const serverPeerId1 = peerMsg1.senderId as PeerId;

    let device1Doc = Automerge.init<{ items: string[] }>();
    device1Doc = Automerge.change(device1Doc, (d) => {
      d.items = ['alpha', 'beta', 'gamma'];
    });

    let ss1 = Automerge.initSyncState();
    let msg1: Automerge.SyncMessage | null;
    [ss1, msg1] = Automerge.generateSyncMessage(device1Doc, ss1);

    while (msg1) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverPeerId1,
        documentId: 'fullrequest1',
        data: msg1
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq1.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [device1Doc, ss1] = Automerge.receiveSyncMessage(
        device1Doc,
        ss1,
        resp.data as Automerge.SyncMessage
      );
      [ss1, msg1] = Automerge.generateSyncMessage(device1Doc, ss1);
    }

    ws1.close();
    await new Promise((r) => setTimeout(r, 300));

    // Device 2 connects and requests the doc (bare request, no data)
    const { ws: ws2, mq: mq2 } = await connectWs();
    const peerMsg2 = await doHandshake(ws2, mq2, 'device-2');
    const serverPeerId2 = peerMsg2.senderId as PeerId;

    sendCbor(ws2, {
      type: 'request',
      senderId: 'device-2',
      targetId: serverPeerId2,
      documentId: 'fullrequest1'
    });

    // Receive the initial sync message from server and complete the sync loop
    let device2Doc = Automerge.init<{ items: string[] }>();
    let ss2 = Automerge.initSyncState();

    // Process sync messages until sync is complete
    let syncing = true;
    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq2.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [device2Doc, ss2] = Automerge.receiveSyncMessage(
        device2Doc,
        ss2,
        resp.data as Automerge.SyncMessage
      );

      let msg2: Automerge.SyncMessage | null;
      [ss2, msg2] = Automerge.generateSyncMessage(device2Doc, ss2);

      if (msg2) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverPeerId2,
          documentId: 'fullrequest1',
          data: msg2
        });
      } else {
        syncing = false;
      }
    }

    // Device 2 should now have the full document
    expect(device2Doc.items).toEqual(['alpha', 'beta', 'gamma']);

    ws2.close();
  });
});

describe('client pushes new doc to server via request', () => {
  it('client creates a doc and server pulls it after bare request', async () => {
    // Register the content doc as accessible
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:vaultroot');
    testDb
      .query(
        'INSERT INTO content_doc_access (doc_url, user_did, vault_id) VALUES (?, ?, ?)'
      )
      .run('automerge:contentdoc1', 'did:test:user1', 'vault-1');

    const { ws, mq } = await connectWs();
    const peerMsg = await doHandshake(ws, mq, 'device-1');
    const serverPeerId = peerMsg.senderId as PeerId;

    // Client has a doc with data
    let clientDoc = Automerge.init<{ body: string }>();
    clientDoc = Automerge.change(clientDoc, (d) => {
      d.body = 'note content from device 1';
    });

    // Client sends bare request (announcing the doc, like automerge-repo does)
    sendCbor(ws, {
      type: 'request',
      senderId: 'device-1',
      targetId: serverPeerId,
      documentId: 'contentdoc1'
    });

    // Server responds with sync message from empty doc ("I have nothing")
    const serverSync = await mq.next();
    expect(serverSync.type).toBe('sync');
    expect(serverSync.documentId).toBe('contentdoc1');

    // Client processes server's sync message and generates response with its data
    let clientSyncState = Automerge.initSyncState();
    [clientDoc, clientSyncState] = Automerge.receiveSyncMessage(
      clientDoc,
      clientSyncState,
      serverSync.data as Automerge.SyncMessage
    );

    let msg: Automerge.SyncMessage | null;
    [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);

    // Send sync messages until converged
    while (msg) {
      sendCbor(ws, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverPeerId,
        documentId: 'contentdoc1',
        data: msg
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [clientDoc, clientSyncState] = Automerge.receiveSyncMessage(
        clientDoc,
        clientSyncState,
        resp.data as Automerge.SyncMessage
      );
      [clientSyncState, msg] = Automerge.generateSyncMessage(clientDoc, clientSyncState);
    }

    ws.close();
    await new Promise((r) => setTimeout(r, 300));

    // Verify server saved the document
    const userDir = path.join(moduleTmpDir, 'automerge-docs', 'did_test_user1');
    const docPath = path.join(userDir, 'docs', 'contentdoc1.bin');
    expect(fs.existsSync(docPath)).toBe(true);

    const savedBinary = new Uint8Array(fs.readFileSync(docPath));
    const savedDoc = Automerge.load<{ body: string }>(savedBinary);
    expect(savedDoc.body).toBe('note content from device 1');
  });

  it('device 1 pushes doc via request, device 2 retrieves it via request', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:vaultroot2');
    testDb
      .query(
        'INSERT INTO content_doc_access (doc_url, user_did, vault_id) VALUES (?, ?, ?)'
      )
      .run('automerge:contentdoc2', 'did:test:user1', 'vault-1');

    // --- Device 1: push doc to server ---
    const { ws: ws1, mq: mq1 } = await connectWs();
    const peer1 = await doHandshake(ws1, mq1, 'device-1');
    const serverId1 = peer1.senderId as PeerId;

    let d1Doc = Automerge.init<{ content: string }>();
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.content = 'hello from device 1';
    });

    // Bare request to announce doc
    sendCbor(ws1, {
      type: 'request',
      senderId: 'device-1',
      targetId: serverId1,
      documentId: 'contentdoc2'
    });

    // Sync exchange to push data to server
    let ss1 = Automerge.initSyncState();
    let syncing = true;
    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq1.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d1Doc, ss1] = Automerge.receiveSyncMessage(
        d1Doc,
        ss1,
        resp.data as Automerge.SyncMessage
      );

      let msg: Automerge.SyncMessage | null;
      [ss1, msg] = Automerge.generateSyncMessage(d1Doc, ss1);

      if (msg) {
        sendCbor(ws1, {
          type: 'sync',
          senderId: 'device-1',
          targetId: serverId1,
          documentId: 'contentdoc2',
          data: msg
        });
      } else {
        syncing = false;
      }
    }

    ws1.close();
    await new Promise((r) => setTimeout(r, 300));

    // --- Device 2: pull doc from server ---
    const { ws: ws2, mq: mq2 } = await connectWs();
    const peer2 = await doHandshake(ws2, mq2, 'device-2');
    const serverId2 = peer2.senderId as PeerId;

    // Bare request to ask for the doc
    sendCbor(ws2, {
      type: 'request',
      senderId: 'device-2',
      targetId: serverId2,
      documentId: 'contentdoc2'
    });

    let d2Doc = Automerge.init<{ content: string }>();
    let ss2 = Automerge.initSyncState();

    syncing = true;
    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq2.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d2Doc, ss2] = Automerge.receiveSyncMessage(
        d2Doc,
        ss2,
        resp.data as Automerge.SyncMessage
      );

      let msg: Automerge.SyncMessage | null;
      [ss2, msg] = Automerge.generateSyncMessage(d2Doc, ss2);

      if (msg) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverId2,
          documentId: 'contentdoc2',
          data: msg
        });
      } else {
        syncing = false;
      }
    }

    expect(d2Doc.content).toBe('hello from device 1');

    ws2.close();
  });
});

describe('real-time fan-out to other connections', () => {
  it('changes from device 1 are pushed to device 2 without polling', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:fanout1');

    // Both devices connect and handshake
    const { ws: ws1, mq: mq1 } = await connectWs();
    const peer1 = await doHandshake(ws1, mq1, 'device-1');
    const serverId1 = peer1.senderId as PeerId;

    const { ws: ws2, mq: mq2 } = await connectWs();
    const peer2 = await doHandshake(ws2, mq2, 'device-2');
    const serverId2 = peer2.senderId as PeerId;

    // Device 1 syncs a new doc to the server
    let d1Doc = Automerge.init<{ value: number }>();
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.value = 100;
    });

    let ss1 = Automerge.initSyncState();
    let msg1: Automerge.SyncMessage | null;
    [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);

    while (msg1) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverId1,
        documentId: 'fanout1',
        data: msg1
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq1.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d1Doc, ss1] = Automerge.receiveSyncMessage(
        d1Doc,
        ss1,
        resp.data as Automerge.SyncMessage
      );
      [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);
    }

    // Device 2 should receive a sync message pushed by the server (fan-out).
    // Complete the full sync exchange (may take multiple rounds).
    let d2Doc = Automerge.init<{ value: number }>();
    let ss2 = Automerge.initSyncState();
    let syncing = true;

    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq2.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d2Doc, ss2] = Automerge.receiveSyncMessage(
        d2Doc,
        ss2,
        resp.data as Automerge.SyncMessage
      );

      let msg2: Automerge.SyncMessage | null;
      [ss2, msg2] = Automerge.generateSyncMessage(d2Doc, ss2);

      if (msg2) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverId2,
          documentId: 'fanout1',
          data: msg2
        });
      } else {
        syncing = false;
      }
    }

    expect(d2Doc.value).toBe(100);

    ws1.close();
    ws2.close();
  });

  it('subsequent edits from device 1 are pushed to device 2 in real time', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:fanout2');

    const { ws: ws1, mq: mq1 } = await connectWs();
    const peer1 = await doHandshake(ws1, mq1, 'device-1');
    const serverId1 = peer1.senderId as PeerId;

    const { ws: ws2, mq: mq2 } = await connectWs();
    const peer2 = await doHandshake(ws2, mq2, 'device-2');
    const serverId2 = peer2.senderId as PeerId;

    // Helper: run sync loop on device 2 until timeout (drains all available messages)
    let d2Doc = Automerge.init<{ counter: number }>();
    let ss2 = Automerge.initSyncState();

    async function syncDevice2(timeoutMs = 1000): Promise<void> {
      while (true) {
        let resp: Record<string, unknown>;
        try {
          resp = await mq2.next(timeoutMs);
        } catch {
          break;
        }
        if (resp.type !== 'sync' || resp.documentId !== 'fanout2') break;

        [d2Doc, ss2] = Automerge.receiveSyncMessage(
          d2Doc,
          ss2,
          resp.data as Automerge.SyncMessage
        );

        let msg2: Automerge.SyncMessage | null;
        [ss2, msg2] = Automerge.generateSyncMessage(d2Doc, ss2);

        if (msg2) {
          sendCbor(ws2, {
            type: 'sync',
            senderId: 'device-2',
            targetId: serverId2,
            documentId: 'fanout2',
            data: msg2
          });
        }
      }
    }

    // Device 1: initial sync (counter: 1)
    let d1Doc = Automerge.init<{ counter: number }>();
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.counter = 1;
    });

    let ss1 = Automerge.initSyncState();
    let msg1: Automerge.SyncMessage | null;
    [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);

    while (msg1) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverId1,
        documentId: 'fanout2',
        data: msg1
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq1.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d1Doc, ss1] = Automerge.receiveSyncMessage(
        d1Doc,
        ss1,
        resp.data as Automerge.SyncMessage
      );
      [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);
    }

    // Device 2: process fan-out and drain all messages from initial sync
    await syncDevice2();
    expect(d2Doc.counter).toBe(1);

    // Device 1: second change (counter: 2)
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.counter = 2;
    });
    [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);

    while (msg1) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverId1,
        documentId: 'fanout2',
        data: msg1
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq1.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d1Doc, ss1] = Automerge.receiveSyncMessage(
        d1Doc,
        ss1,
        resp.data as Automerge.SyncMessage
      );
      [ss1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);
    }

    // Device 2: should receive counter: 2 via fan-out
    await syncDevice2();
    expect(d2Doc.counter).toBe(2);

    ws1.close();
    ws2.close();
  });

  it('fan-out does not send to connections of a different user', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:fanout3');
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user2', 'vault-2', 'automerge:fanout3other');

    // User 1 connects
    const { ws: ws1, mq: mq1 } = await connectWs('valid-token');
    const peer1 = await doHandshake(ws1, mq1, 'user1-device');
    const serverId1 = peer1.senderId as PeerId;

    // User 2 connects
    const { ws: ws2, mq: mq2 } = await connectWs('valid-token-2');
    await doHandshake(ws2, mq2, 'user2-device');

    // User 1 syncs a doc
    let doc = Automerge.init<{ secret: string }>();
    doc = Automerge.change(doc, (d) => {
      d.secret = 'user1 only';
    });

    const ss = Automerge.initSyncState();
    const [, msg] = Automerge.generateSyncMessage(doc, ss);

    if (msg) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'user1-device',
        targetId: serverId1,
        documentId: 'fanout3',
        data: msg
      });
    }

    // Wait for user 1's sync response
    await mq1.next(3000);

    // User 2 should NOT receive anything (wait briefly to confirm)
    await expect(mq2.next(500)).rejects.toThrow('Message timeout');

    ws1.close();
    ws2.close();
  });
});

describe('concurrent same-doc sync from multiple connections', () => {
  /** Helper: run a full sync loop until converged */
  async function syncLoop(
    ws: WebSocket,
    mq: ReturnType<typeof createMessageQueue>,
    doc: Automerge.Doc<unknown>,
    syncState: Automerge.SyncState,
    serverPeerId: PeerId,
    peerId: string,
    documentId: string,
    timeoutMs = 3000
  ): Promise<{ doc: Automerge.Doc<unknown>; syncState: Automerge.SyncState }> {
    let msg: Automerge.SyncMessage | null;
    [syncState, msg] = Automerge.generateSyncMessage(doc, syncState);

    while (msg) {
      sendCbor(ws, {
        type: 'sync',
        senderId: peerId,
        targetId: serverPeerId,
        documentId,
        data: msg
      });

      let resp: Record<string, unknown>;
      try {
        resp = await mq.next(timeoutMs);
      } catch {
        break;
      }
      if (resp.type !== 'sync' || resp.documentId !== documentId) break;

      [doc, syncState] = Automerge.receiveSyncMessage(
        doc,
        syncState,
        resp.data as Automerge.SyncMessage
      );
      [syncState, msg] = Automerge.generateSyncMessage(doc, syncState);
    }

    return { doc, syncState };
  }

  it('two connections syncing different changes to the same doc preserves both', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:concurrent1');

    // Device 1 connects and syncs initial doc
    const { ws: ws1, mq: mq1 } = await connectWs();
    const peer1 = await doHandshake(ws1, mq1, 'device-1');
    const serverId1 = peer1.senderId as PeerId;

    let d1Doc = Automerge.init<{ a: number; b?: number }>();
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.a = 1;
    });

    let ss1 = Automerge.initSyncState();
    ({ doc: d1Doc, syncState: ss1 } = await syncLoop(
      ws1,
      mq1,
      d1Doc,
      ss1,
      serverId1,
      'device-1',
      'concurrent1'
    ));

    // Device 2 connects and retrieves the doc
    const { ws: ws2, mq: mq2 } = await connectWs();
    const peer2 = await doHandshake(ws2, mq2, 'device-2');
    const serverId2 = peer2.senderId as PeerId;

    sendCbor(ws2, {
      type: 'request',
      senderId: 'device-2',
      targetId: serverId2,
      documentId: 'concurrent1'
    });

    let d2Doc = Automerge.init<{ a: number; b?: number; c?: number }>();
    let ss2 = Automerge.initSyncState();

    // Drain sync messages until device 2 has the doc
    let syncing = true;
    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq2.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d2Doc, ss2] = Automerge.receiveSyncMessage(
        d2Doc,
        ss2,
        resp.data as Automerge.SyncMessage
      );

      let msg: Automerge.SyncMessage | null;
      [ss2, msg] = Automerge.generateSyncMessage(d2Doc, ss2);

      if (msg) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverId2,
          documentId: 'concurrent1',
          data: msg
        });
      } else {
        syncing = false;
      }
    }

    expect(d2Doc.a).toBe(1);

    // Both devices make independent changes
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.b = 2;
    });
    d2Doc = Automerge.change(d2Doc, (d) => {
      d.c = 3;
    });

    // Fire both sync messages concurrently (don't wait for responses)
    const [newSs1, msg1] = Automerge.generateSyncMessage(d1Doc, ss1);
    ss1 = newSs1;
    const [newSs2, msg2] = Automerge.generateSyncMessage(d2Doc, ss2);
    ss2 = newSs2;

    // Send both at once — this is the race condition scenario
    if (msg1) {
      sendCbor(ws1, {
        type: 'sync',
        senderId: 'device-1',
        targetId: serverId1,
        documentId: 'concurrent1',
        data: msg1
      });
    }
    if (msg2) {
      sendCbor(ws2, {
        type: 'sync',
        senderId: 'device-2',
        targetId: serverId2,
        documentId: 'concurrent1',
        data: msg2
      });
    }

    // Drain all sync responses on both connections until converged
    async function drainSync(
      ws: WebSocket,
      mq: ReturnType<typeof createMessageQueue>,
      doc: Automerge.Doc<Record<string, unknown>>,
      ss: Automerge.SyncState,
      peerId: string,
      serverPeerId: PeerId,
      timeoutMs = 1000
    ): Promise<Automerge.Doc<Record<string, unknown>>> {
      while (true) {
        let resp: Record<string, unknown>;
        try {
          resp = await mq.next(timeoutMs);
        } catch {
          break;
        }
        if (resp.type !== 'sync' || resp.documentId !== 'concurrent1') break;

        [doc, ss] = Automerge.receiveSyncMessage(
          doc,
          ss,
          resp.data as Automerge.SyncMessage
        );

        let msg: Automerge.SyncMessage | null;
        [ss, msg] = Automerge.generateSyncMessage(doc, ss);

        if (msg) {
          sendCbor(ws, {
            type: 'sync',
            senderId: peerId,
            targetId: serverPeerId,
            documentId: 'concurrent1',
            data: msg
          });
        }
      }
      return doc;
    }

    // Drain both in parallel
    const [finalD1, finalD2] = await Promise.all([
      drainSync(
        ws1,
        mq1,
        d1Doc as Automerge.Doc<Record<string, unknown>>,
        ss1,
        'device-1',
        serverId1
      ),
      drainSync(
        ws2,
        mq2,
        d2Doc as Automerge.Doc<Record<string, unknown>>,
        ss2,
        'device-2',
        serverId2
      )
    ]);

    // Wait for disk writes
    await new Promise((r) => setTimeout(r, 300));

    // Verify server document has BOTH changes
    const userDir = path.join(moduleTmpDir, 'automerge-docs', 'did_test_user1');
    const docPath = path.join(userDir, 'docs', 'concurrent1.bin');
    expect(fs.existsSync(docPath)).toBe(true);

    const savedBinary = new Uint8Array(fs.readFileSync(docPath));
    const savedDoc = Automerge.load<{ a: number; b: number; c: number }>(savedBinary);
    expect(savedDoc.a).toBe(1);
    expect(savedDoc.b).toBe(2);
    expect(savedDoc.c).toBe(3);

    // Both clients should also have converged (via fan-out)
    expect(finalD1.b).toBe(2);
    expect(finalD1.c).toBe(3);
    expect(finalD2.b).toBe(2);
    expect(finalD2.c).toBe(3);

    ws1.close();
    ws2.close();
  });

  it('rapid sequential edits from two connections are all preserved', async () => {
    testDb
      .query('INSERT INTO vault_access (user_did, vault_id, doc_url) VALUES (?, ?, ?)')
      .run('did:test:user1', 'vault-1', 'automerge:concurrent2');

    const { ws: ws1, mq: mq1 } = await connectWs();
    const peer1 = await doHandshake(ws1, mq1, 'device-1');
    const serverId1 = peer1.senderId as PeerId;

    const { ws: ws2, mq: mq2 } = await connectWs();
    const peer2 = await doHandshake(ws2, mq2, 'device-2');
    const serverId2 = peer2.senderId as PeerId;

    // Device 1 creates the doc
    let d1Doc = Automerge.init<{ edits: string[] }>();
    d1Doc = Automerge.change(d1Doc, (d) => {
      d.edits = ['init'];
    });

    let ss1 = Automerge.initSyncState();
    ({ doc: d1Doc, syncState: ss1 } = await syncLoop(
      ws1,
      mq1,
      d1Doc,
      ss1,
      serverId1,
      'device-1',
      'concurrent2'
    ));

    // Device 2 retrieves the doc via request + sync
    sendCbor(ws2, {
      type: 'request',
      senderId: 'device-2',
      targetId: serverId2,
      documentId: 'concurrent2'
    });

    let d2Doc = Automerge.init<{ edits: string[] }>();
    let ss2 = Automerge.initSyncState();

    let syncing = true;
    while (syncing) {
      let resp: Record<string, unknown>;
      try {
        resp = await mq2.next(3000);
      } catch {
        break;
      }
      if (resp.type !== 'sync') break;

      [d2Doc, ss2] = Automerge.receiveSyncMessage(
        d2Doc,
        ss2,
        resp.data as Automerge.SyncMessage
      );

      let msg: Automerge.SyncMessage | null;
      [ss2, msg] = Automerge.generateSyncMessage(d2Doc, ss2);

      if (msg) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverId2,
          documentId: 'concurrent2',
          data: msg
        });
      } else {
        syncing = false;
      }
    }

    // Also drain any fan-out from the initial sync that might have gone to device-2
    // (brief pause then drain)
    await new Promise((r) => setTimeout(r, 100));

    expect(d2Doc.edits).toEqual(['init']);

    // Both devices make 3 rapid edits each and fire them all without waiting
    for (let i = 1; i <= 3; i++) {
      d1Doc = Automerge.change(d1Doc, (d) => {
        d.edits.push(`d1-edit-${i}`);
      });
      let msg: Automerge.SyncMessage | null;
      [ss1, msg] = Automerge.generateSyncMessage(d1Doc, ss1);
      if (msg) {
        sendCbor(ws1, {
          type: 'sync',
          senderId: 'device-1',
          targetId: serverId1,
          documentId: 'concurrent2',
          data: msg
        });
      }

      d2Doc = Automerge.change(d2Doc, (d) => {
        d.edits.push(`d2-edit-${i}`);
      });
      [ss2, msg] = Automerge.generateSyncMessage(d2Doc, ss2);
      if (msg) {
        sendCbor(ws2, {
          type: 'sync',
          senderId: 'device-2',
          targetId: serverId2,
          documentId: 'concurrent2',
          data: msg
        });
      }
    }

    // Drain all responses on both connections
    async function drain(
      ws: WebSocket,
      mq: ReturnType<typeof createMessageQueue>,
      doc: Automerge.Doc<{ edits: string[] }>,
      ss: Automerge.SyncState,
      peerId: string,
      serverPeerId: PeerId
    ): Promise<Automerge.Doc<{ edits: string[] }>> {
      while (true) {
        let resp: Record<string, unknown>;
        try {
          resp = await mq.next(1000);
        } catch {
          break;
        }
        if (resp.type !== 'sync' || resp.documentId !== 'concurrent2') break;

        [doc, ss] = Automerge.receiveSyncMessage(
          doc,
          ss,
          resp.data as Automerge.SyncMessage
        );

        let msg: Automerge.SyncMessage | null;
        [ss, msg] = Automerge.generateSyncMessage(doc, ss);
        if (msg) {
          sendCbor(ws, {
            type: 'sync',
            senderId: peerId,
            targetId: serverPeerId,
            documentId: 'concurrent2',
            data: msg
          });
        }
      }
      return doc;
    }

    const [finalD1, finalD2] = await Promise.all([
      drain(ws1, mq1, d1Doc, ss1, 'device-1', serverId1),
      drain(ws2, mq2, d2Doc, ss2, 'device-2', serverId2)
    ]);

    await new Promise((r) => setTimeout(r, 300));

    // Verify server has all 7 entries (init + 3 from each device)
    const userDir = path.join(moduleTmpDir, 'automerge-docs', 'did_test_user1');
    const docPath = path.join(userDir, 'docs', 'concurrent2.bin');
    const savedBinary = new Uint8Array(fs.readFileSync(docPath));
    const savedDoc = Automerge.load<{ edits: string[] }>(savedBinary);

    expect(savedDoc.edits).toContain('init');
    for (let i = 1; i <= 3; i++) {
      expect(savedDoc.edits).toContain(`d1-edit-${i}`);
      expect(savedDoc.edits).toContain(`d2-edit-${i}`);
    }
    expect(savedDoc.edits.length).toBe(7);

    // Both clients should have converged to the same set
    expect(finalD1.edits.length).toBe(7);
    expect(finalD2.edits.length).toBe(7);

    ws1.close();
    ws2.close();
  });
});

describe('active counts', () => {
  it('getActiveUserCount and getActiveConnectionCount reflect connected state', async () => {
    const initialUsers = getActiveUserCount();
    const initialConns = getActiveConnectionCount();

    const { ws } = await connectWs();

    expect(getActiveUserCount()).toBeGreaterThanOrEqual(initialUsers);
    expect(getActiveConnectionCount()).toBeGreaterThanOrEqual(initialConns);

    ws.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});

describe('invalid messages', () => {
  it('invalid CBOR message closes connection', async () => {
    const { ws } = await connectWs();
    const closed = waitForClose(ws);

    ws.send(Buffer.from([0xff, 0xfe, 0xfd]));

    await closed;
  });
});
