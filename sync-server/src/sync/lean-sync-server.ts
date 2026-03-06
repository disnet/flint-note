/**
 * Lean sync server - replaces automerge-repo's Repo with a custom implementation
 * that loads documents one-at-a-time during sync, dramatically reducing memory usage.
 *
 * Instead of loading all documents into memory when a user connects, this server:
 * 1. Speaks the automerge-repo wire protocol (CBOR join/peer handshake + sync messages)
 * 2. Loads individual documents from disk only when a sync message arrives for them
 * 3. Processes the sync message using Automerge's low-level sync API
 * 4. Saves the updated document back to disk and frees it from memory
 *
 * Memory profile:
 * - Idle: ~0 per user (no documents loaded)
 * - During sync: ~size of 1 document at a time
 * - Peak: size of largest single document
 */

import * as Automerge from '@automerge/automerge';
import type { Doc, SyncState } from '@automerge/automerge';
import { cbor } from '@automerge/automerge-repo/slim';
import type { PeerId, PeerMetadata } from '@automerge/automerge-repo';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { verifySessionTokenAsync, parseCookies } from '../auth/session.js';
import { canAccessDocument, resetAccessStatements } from './vault-access.js';
import { loadDocBinary, saveDocBinary, docExists } from './doc-storage.js';
import { getDb } from '../db.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const DOCS_DIR = path.join(DATA_DIR, 'automerge-docs');

const WS_GUID = '258EAFA5-E914-47DA-95CA-5AB5DC65C5B3';
const KEEP_ALIVE_INTERVAL_MS = 15000;
const MAX_MISSED_PONGS = 2;
const CONNECTION_SHUTDOWN_DELAY_MS = 30_000;

// Generate a unique server peer ID
const SERVER_PEER_ID = `flint-lean-${Date.now()}` as PeerId;

interface ConnectionState {
  ws: WsWebSocket;
  userDid: string;
  remotePeerId: PeerId | undefined;
  remoteStorageId: string | undefined;
  /** Document IDs we've seen sync messages for from this client */
  seenDocIds: Set<string>;
  pingInterval: ReturnType<typeof setInterval> | undefined;
  missedPongs: number;
  /** Whether the server has started its server-initiated sync pass */
  serverSyncStarted: boolean;
  /** Timer for server-initiated sync delay */
  serverSyncTimer: ReturnType<typeof setTimeout> | undefined;
}

// Track active connections per user for shutdown delay
interface UserConnectionState {
  connections: Set<ConnectionState>;
  shutdownTimer?: ReturnType<typeof setTimeout>;
}

const userConnections = new Map<string, UserConnectionState>();

// --- CBOR message types (compatible with automerge-repo wire protocol) ---

interface JoinMessage {
  type: 'join';
  senderId: PeerId;
  peerMetadata: PeerMetadata;
  supportedProtocolVersions: string[];
}

interface PeerMessage {
  type: 'peer';
  senderId: PeerId;
  peerMetadata: PeerMetadata;
  selectedProtocolVersion: string;
  targetId: PeerId;
}

interface SyncMessageWire {
  type: 'sync';
  senderId: PeerId;
  targetId: PeerId;
  documentId: string;
  data: Uint8Array;
}

interface RequestMessageWire {
  type: 'request';
  senderId: PeerId;
  targetId: PeerId;
  documentId: string;
  data: Uint8Array;
}

interface DocUnavailableMessage {
  type: 'doc-unavailable';
  senderId: PeerId;
  targetId: PeerId;
  documentId: string;
}

type IncomingMessage =
  | JoinMessage
  | SyncMessageWire
  | RequestMessageWire
  | DocUnavailableMessage;

// --- Utility ---

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

function getUserDir(userDid: string): string {
  return path.join(DOCS_DIR, userDid.replace(/[^a-zA-Z0-9]/g, '_'));
}

function docUrlToId(docUrl: string): string {
  // docUrl is "automerge:XXXX", documentId is "XXXX"
  return docUrl.replace(/^automerge:/, '');
}

// --- Sync state persistence (with prepared statement caching) ---

let cachedLoadStmt: ReturnType<ReturnType<typeof getDb>['query']> | undefined;
let cachedSaveStmt: ReturnType<ReturnType<typeof getDb>['query']> | undefined;

function getLoadSyncStateStmt(): ReturnType<ReturnType<typeof getDb>['query']> {
  if (!cachedLoadStmt) {
    cachedLoadStmt = getDb().query(
      'SELECT sync_state FROM sync_states WHERE user_did = ? AND doc_id = ? AND peer_storage_id = ?'
    );
  }
  return cachedLoadStmt;
}

function getSaveSyncStateStmt(): ReturnType<ReturnType<typeof getDb>['query']> {
  if (!cachedSaveStmt) {
    cachedSaveStmt = getDb().query(
      `INSERT INTO sync_states (user_did, doc_id, peer_storage_id, sync_state, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_did, doc_id, peer_storage_id) DO UPDATE SET
         sync_state = excluded.sync_state,
         updated_at = excluded.updated_at`
    );
  }
  return cachedSaveStmt;
}

function loadSyncState(userDid: string, docId: string, peerStorageId: string): SyncState {
  // Check memory cache first
  const cacheKey = syncStateCacheKey(userDid, docId, peerStorageId);
  const cached = syncStateMemCache.get(cacheKey);
  if (cached) return cached;

  // Try SQLite
  const row = getLoadSyncStateStmt().get(userDid, docId, peerStorageId) as {
    sync_state: Buffer;
  } | null;

  if (row) {
    try {
      const state = Automerge.decodeSyncState(new Uint8Array(row.sync_state));
      syncStateMemCache.set(cacheKey, state);
      return state;
    } catch {
      // Corrupted sync state, start fresh
    }
  }

  const state = Automerge.initSyncState();
  syncStateMemCache.set(cacheKey, state);
  return state;
}

function saveSyncState(
  userDid: string,
  docId: string,
  peerStorageId: string,
  syncState: SyncState
): void {
  // Update memory cache
  syncStateMemCache.set(syncStateCacheKey(userDid, docId, peerStorageId), syncState);
  // Write through to SQLite
  const encoded = Automerge.encodeSyncState(syncState);
  getSaveSyncStateStmt().run(userDid, docId, peerStorageId, Buffer.from(encoded));
}

// --- Document access cache ---
// Per-connection cache of document access checks to avoid repeated SQL queries.

function cachedCanAccessDocument(conn: ConnectionState, docUrl: string): boolean {
  if (conn.seenDocIds.has(docUrl.replace(/^automerge:/, ''))) return true;
  return canAccessDocument(conn.userDid, docUrl);
}

// --- Per-user, per-document lock ---
// Global lock that serializes all access to a given document for a given user,
// across all connections. Prevents data loss when two connections for the same
// user sync the same document concurrently.

const globalDocLocks = new Map<string, Promise<void>>();

// --- Document cache ---
// Keeps recently-used docs in WASM memory to avoid repeated Automerge.load/free
// cycles during active editing. Entries are evicted after inactivity.

const DOC_CACHE_TTL_MS = 30_000;

interface CachedDocEntry {
  doc: Doc<unknown>;
  evictionTimer: ReturnType<typeof setTimeout>;
}

const docCache = new Map<string, CachedDocEntry>();

function docCacheKey(userDid: string, docId: string): string {
  return `${userDid}\0${docId}`;
}

function scheduleDocEviction(
  userDid: string,
  docId: string,
  key: string
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    withDocLock(userDid, docId, async () => {
      const entry = docCache.get(key);
      if (entry) {
        try {
          Automerge.free(entry.doc);
        } catch {
          // Handle already-freed doc
        }
        docCache.delete(key);
        // Also evict sync states for this doc
        const ssPrefix = key + '\0';
        for (const skey of syncStateMemCache.keys()) {
          if (skey.startsWith(ssPrefix)) syncStateMemCache.delete(skey);
        }
      }
    });
  }, DOC_CACHE_TTL_MS);
}

/** Get a doc from cache or load from disk. Must be called within a doc lock. */
function acquireDoc(userDid: string, docId: string, userDir: string): Doc<unknown> {
  const key = docCacheKey(userDid, docId);
  const cached = docCache.get(key);
  if (cached) {
    clearTimeout(cached.evictionTimer);
    cached.evictionTimer = scheduleDocEviction(userDid, docId, key);
    return cached.doc;
  }
  const binary = loadDocBinary(userDir, docId);
  const doc = binary ? Automerge.load(binary) : Automerge.init();
  docCache.set(key, {
    doc,
    evictionTimer: scheduleDocEviction(userDid, docId, key)
  });
  return doc;
}

/** Update the cached doc after mutation (e.g., receiveSyncMessage).
 *  Note: receiveSyncMessage consumes the old doc handle internally,
 *  so we just replace the reference — do NOT free the old one. */
function updateCachedDoc(userDid: string, docId: string, doc: Doc<unknown>): void {
  const key = docCacheKey(userDid, docId);
  const cached = docCache.get(key);
  if (cached) {
    cached.doc = doc;
    clearTimeout(cached.evictionTimer);
    cached.evictionTimer = scheduleDocEviction(userDid, docId, key);
  } else {
    docCache.set(key, {
      doc,
      evictionTimer: scheduleDocEviction(userDid, docId, key)
    });
  }
}

/** Evict a single doc from cache and free its WASM memory.
 *  Safe to call even if the doc handle was already consumed. */
function evictDocFromCache(userDid: string, docId: string): void {
  const key = docCacheKey(userDid, docId);
  const cached = docCache.get(key);
  if (cached) {
    clearTimeout(cached.evictionTimer);
    try {
      Automerge.free(cached.doc);
    } catch {
      // Doc handle may have been consumed by receiveSyncMessage
    }
    docCache.delete(key);
  }
}

/** Evict all cached docs and sync states for a user. */
function evictUserCache(userDid: string): void {
  const prefix = `${userDid}\0`;
  for (const [key, entry] of docCache) {
    if (key.startsWith(prefix)) {
      clearTimeout(entry.evictionTimer);
      try {
        Automerge.free(entry.doc);
      } catch {
        // Handle already-freed doc
      }
      docCache.delete(key);
    }
  }
  for (const key of syncStateMemCache.keys()) {
    if (key.startsWith(prefix)) syncStateMemCache.delete(key);
  }
}

// --- Sync state memory cache ---
// Avoids repeated SQLite reads + Automerge.decodeSyncState WASM work.
// Write-through: always persisted to SQLite, but reads hit memory first.

const syncStateMemCache = new Map<string, SyncState>();

function syncStateCacheKey(
  userDid: string,
  docId: string,
  peerStorageId: string
): string {
  return `${userDid}\0${docId}\0${peerStorageId}`;
}

// --- Periodic GC ---
let gcInterval: ReturnType<typeof setInterval> | undefined;

function startPeriodicGC(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => {
    if (typeof Bun !== 'undefined') Bun.gc(false);
  }, 60_000);
}

function withDocLock(
  userDid: string,
  docId: string,
  fn: () => Promise<void>
): Promise<void> {
  const key = `${userDid}:${docId}`;
  const prev = globalDocLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  globalDocLocks.set(key, next);
  next.then(() => {
    if (globalDocLocks.get(key) === next) globalDocLocks.delete(key);
  });
  return next;
}

// --- Message sending ---

function sendMessage(
  conn: ConnectionState,
  message: PeerMessage | SyncMessageWire | DocUnavailableMessage
): void {
  if (conn.ws.readyState !== conn.ws.OPEN) return;
  const encoded = cbor.encode(message);
  conn.ws.send(toArrayBuffer(encoded));
}

// --- Sync message handling ---

function handleSyncMessage(
  conn: ConnectionState,
  documentId: string,
  data: Uint8Array
): void {
  withDocLock(conn.userDid, documentId, async () => {
    const userDir = getUserDir(conn.userDid);
    const docUrl = `automerge:${documentId}`;

    // Check document access (uses cache after first check)
    if (!cachedCanAccessDocument(conn, docUrl)) {
      sendMessage(conn, {
        type: 'doc-unavailable',
        senderId: SERVER_PEER_ID,
        targetId: conn.remotePeerId!,
        documentId
      });
      return;
    }

    conn.seenDocIds.add(documentId);

    // Get document from cache or load from disk
    let doc = acquireDoc(conn.userDid, documentId, userDir);

    try {
      const peerStorageId = conn.remoteStorageId || conn.remotePeerId || 'unknown';
      let syncState = loadSyncState(conn.userDid, documentId, peerStorageId);

      // Capture heads before sync to detect actual changes
      const headsBefore = Automerge.getHeads(doc).toString();

      // Apply the incoming sync message
      const [newDoc, newSyncState] = Automerge.receiveSyncMessage(
        doc,
        syncState,
        data as Automerge.SyncMessage
      );
      doc = newDoc;
      syncState = newSyncState;

      // Update cache immediately (receiveSyncMessage may return a new object)
      updateCachedDoc(conn.userDid, documentId, doc);

      // Check if the document actually changed
      const docChanged = Automerge.getHeads(doc).toString() !== headsBefore;

      // Generate response message
      const [finalSyncState, responseMsg] = Automerge.generateSyncMessage(doc, syncState);
      syncState = finalSyncState;

      // Only save document if it actually changed
      if (docChanged) {
        const savedBinary = Automerge.save(doc);
        saveDocBinary(userDir, documentId, savedBinary);
      }

      // Save sync state (tracks protocol progress even without doc changes)
      saveSyncState(conn.userDid, documentId, peerStorageId, syncState);

      // Send response if there is one
      if (responseMsg) {
        sendMessage(conn, {
          type: 'sync',
          senderId: SERVER_PEER_ID,
          targetId: conn.remotePeerId!,
          documentId,
          data: responseMsg
        });
      }

      // Fan out using the cached doc (no re-load needed)
      if (docChanged) {
        fanOutToOtherConnections(conn, documentId, doc);
      }
    } catch (err) {
      // On error, evict potentially-corrupt doc from cache
      evictDocFromCache(conn.userDid, documentId);
      console.error(`[LeanSync] Error processing sync for doc ${documentId}:`, err);
    }
  });
}

// --- Fan-out to other connections ---
// When one client syncs changes, push them to all other connected clients
// for the same user so they get real-time updates without polling.
// Called inside the global doc lock, so we have exclusive access.
// The doc is from the cache — caller is responsible for cache management.

function fanOutToOtherConnections(
  sourceConn: ConnectionState,
  documentId: string,
  doc: Doc<unknown>
): void {
  const userState = userConnections.get(sourceConn.userDid);
  if (!userState) return;

  for (const otherConn of userState.connections) {
    if (otherConn === sourceConn) continue;
    if (!otherConn.remotePeerId) continue;
    if (otherConn.ws.readyState !== otherConn.ws.OPEN) continue;

    try {
      const peerStorageId =
        otherConn.remoteStorageId || otherConn.remotePeerId || 'unknown';
      const prevSyncState = loadSyncState(otherConn.userDid, documentId, peerStorageId);

      const [syncState, msg] = Automerge.generateSyncMessage(doc, prevSyncState);

      if (msg) {
        saveSyncState(otherConn.userDid, documentId, peerStorageId, syncState);

        sendMessage(otherConn, {
          type: 'sync',
          senderId: SERVER_PEER_ID,
          targetId: otherConn.remotePeerId!,
          documentId,
          data: msg
        });
      }
    } catch (err) {
      console.error(`[LeanSync] Error fanning out doc ${documentId}:`, err);
    }
  }
}

// --- Handle bare document request (no sync data) ---
// automerge-repo sends 'request' messages without sync data in two cases:
// 1. A new device calling repo.find() for a doc it doesn't have yet
// 2. A device announcing a doc it created (so the server can pull it)
//
// In both cases we respond with a sync message. If we have the doc, the
// message contains our data. If we don't, it's an empty-doc sync message
// that tells the client "I have nothing, send me everything".

function handleDocumentRequest(conn: ConnectionState, documentId: string): void {
  withDocLock(conn.userDid, documentId, async () => {
    const userDir = getUserDir(conn.userDid);
    const docUrl = `automerge:${documentId}`;

    // Check document access
    if (!cachedCanAccessDocument(conn, docUrl)) {
      sendMessage(conn, {
        type: 'doc-unavailable',
        senderId: SERVER_PEER_ID,
        targetId: conn.remotePeerId!,
        documentId
      });
      return;
    }

    conn.seenDocIds.add(documentId);

    // Get from cache or load from disk (empty doc if not on disk yet)
    const doc = acquireDoc(conn.userDid, documentId, userDir);

    try {
      const peerStorageId = conn.remoteStorageId || conn.remotePeerId || 'unknown';
      const prevSyncState = loadSyncState(conn.userDid, documentId, peerStorageId);

      // Generate initial sync message
      const [syncState, msg] = Automerge.generateSyncMessage(doc, prevSyncState);

      if (msg) {
        saveSyncState(conn.userDid, documentId, peerStorageId, syncState);

        sendMessage(conn, {
          type: 'sync',
          senderId: SERVER_PEER_ID,
          targetId: conn.remotePeerId!,
          documentId,
          data: msg
        });
      }
    } catch (err) {
      evictDocFromCache(conn.userDid, documentId);
      console.error(`[LeanSync] Error handling document request for ${documentId}:`, err);
    }
  });
}

// --- Server-initiated sync ---
// After the client has sent its initial burst of sync messages,
// the server checks if there are any registered docs that the client
// hasn't synced yet, and initiates sync for them.

function startServerInitiatedSync(conn: ConnectionState): void {
  if (conn.serverSyncStarted) return;
  conn.serverSyncStarted = true;

  const userDir = getUserDir(conn.userDid);
  const db = getDb();

  // Get all registered doc URLs for this user
  const vaultDocs = db
    .query('SELECT doc_url FROM vault_access WHERE user_did = ?')
    .all(conn.userDid) as Array<{ doc_url: string }>;
  const contentDocs = db
    .query('SELECT doc_url FROM content_doc_access WHERE user_did = ?')
    .all(conn.userDid) as Array<{ doc_url: string }>;

  const allDocUrls = [
    ...vaultDocs.map((r) => r.doc_url),
    ...contentDocs.map((r) => r.doc_url)
  ];

  // Filter to docs we haven't seen from the client and that exist on disk
  const unsyncedDocIds: string[] = [];
  for (const docUrl of allDocUrls) {
    const docId = docUrlToId(docUrl);
    if (!conn.seenDocIds.has(docId) && docExists(userDir, docId)) {
      unsyncedDocIds.push(docId);
    }
  }

  if (unsyncedDocIds.length === 0) return;

  console.log(
    `[LeanSync] Server-initiated sync for ${unsyncedDocIds.length} docs for user ${conn.userDid}`
  );

  // Process unsynced docs one at a time with small delays to avoid blocking
  let index = 0;
  const processNext = (): void => {
    if (index >= unsyncedDocIds.length) return;
    if (conn.ws.readyState !== conn.ws.OPEN) return;

    const docId = unsyncedDocIds[index++];

    withDocLock(conn.userDid, docId, async () => {
      if (conn.ws.readyState !== conn.ws.OPEN) return;

      // Use cache — doc will stay cached for subsequent sync responses
      const doc = acquireDoc(conn.userDid, docId, userDir);

      try {
        const peerStorageId = conn.remoteStorageId || conn.remotePeerId || 'unknown';
        const prevSyncState = loadSyncState(conn.userDid, docId, peerStorageId);

        // Generate initial sync message for this doc
        const [syncState, msg] = Automerge.generateSyncMessage(doc, prevSyncState);

        if (msg) {
          saveSyncState(conn.userDid, docId, peerStorageId, syncState);

          sendMessage(conn, {
            type: 'sync',
            senderId: SERVER_PEER_ID,
            targetId: conn.remotePeerId!,
            documentId: docId,
            data: msg
          });
        }
      } catch (err) {
        evictDocFromCache(conn.userDid, docId);
        console.error(`[LeanSync] Error in server-initiated sync for doc ${docId}:`, err);
      }
    }).then(() => {
      if (index >= unsyncedDocIds.length) {
        console.log(
          `[LeanSync] Server-initiated sync complete for user ${conn.userDid} (${unsyncedDocIds.length} docs)`
        );
      }
      // Small delay between docs to keep event loop responsive
      setTimeout(processNext, 5);
    });
  };

  processNext();
}

// --- Connection handling ---

function handleNewConnection(ws: WsWebSocket, userDid: string): void {
  fs.mkdirSync(getUserDir(userDid), { recursive: true });

  const conn: ConnectionState = {
    ws,
    userDid,
    remotePeerId: undefined,
    remoteStorageId: undefined,
    seenDocIds: new Set(),
    pingInterval: undefined,
    missedPongs: 0,
    serverSyncStarted: false,
    serverSyncTimer: undefined
  };

  // Track connection
  let userState = userConnections.get(userDid);
  if (!userState) {
    userState = { connections: new Set() };
    userConnections.set(userDid, userState);
  }
  // Cancel any pending shutdown timer
  if (userState.shutdownTimer) {
    clearTimeout(userState.shutdownTimer);
    userState.shutdownTimer = undefined;
  }
  userState.connections.add(conn);

  // Keep-alive pings
  conn.pingInterval = setInterval(() => {
    if (conn.missedPongs >= MAX_MISSED_PONGS) {
      console.warn('[LeanSync] Pong not received, terminating connection');
      ws.terminate();
      return;
    }
    conn.missedPongs++;
    ws.ping();
  }, KEEP_ALIVE_INTERVAL_MS);

  ws.on('pong', () => {
    conn.missedPongs = 0;
  });

  ws.on('message', (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    const bytes =
      rawData instanceof Buffer ? rawData : new Uint8Array(rawData as ArrayBuffer);

    let message: IncomingMessage;
    try {
      message = cbor.decode(bytes);
    } catch {
      console.error('[LeanSync] Invalid CBOR message, closing');
      ws.close();
      return;
    }

    if ((message as JoinMessage).type === 'join') {
      handleJoinMessage(conn, message as JoinMessage);
    } else if (message.type === 'sync' || message.type === 'request') {
      const syncMsg = message as SyncMessageWire | RequestMessageWire;
      if (syncMsg.documentId && conn.remotePeerId) {
        if (syncMsg.data) {
          // Normal sync exchange — client sent sync data
          handleSyncMessage(conn, syncMsg.documentId, syncMsg.data);
        } else {
          // Bare request (no data) — client is asking for a doc it doesn't have.
          // Respond with an initial sync message so the client can receive the doc.
          handleDocumentRequest(conn, syncMsg.documentId);
        }
      }
    } else if (message.type === 'doc-unavailable') {
      // Client doesn't have a doc we asked about - nothing to do
    }
    // Ignore other message types (ephemeral, remote-subscription-change, etc.)
  });

  ws.on('close', () => {
    handleDisconnection(conn);
  });

  ws.on('error', (err) => {
    console.error(`[LeanSync] WebSocket error for user ${userDid}:`, err);
  });
}

function handleJoinMessage(conn: ConnectionState, joinMsg: JoinMessage): void {
  conn.remotePeerId = joinMsg.senderId;

  // Extract storageId from peer metadata
  if (joinMsg.peerMetadata && typeof joinMsg.peerMetadata === 'object') {
    const meta = joinMsg.peerMetadata as Record<string, unknown>;
    if (typeof meta.storageId === 'string') {
      conn.remoteStorageId = meta.storageId;
    }
  }

  // Send peer response
  const peerMsg: PeerMessage = {
    type: 'peer',
    senderId: SERVER_PEER_ID,
    peerMetadata: {
      storageId: `lean-server-${conn.userDid.slice(-8)}`,
      isEphemeral: false
    } as PeerMetadata,
    selectedProtocolVersion: '1',
    targetId: joinMsg.senderId
  };

  sendMessage(conn, peerMsg);
  console.log(`[LeanSync] Peer connected: ${joinMsg.senderId} for user ${conn.userDid}`);

  // Schedule server-initiated sync after a delay
  // (wait for client's initial burst of sync messages)
  conn.serverSyncTimer = setTimeout(() => {
    startServerInitiatedSync(conn);
  }, 3000);
}

function handleDisconnection(conn: ConnectionState): void {
  // Clean up timers
  if (conn.pingInterval) {
    clearInterval(conn.pingInterval);
    conn.pingInterval = undefined;
  }
  if (conn.serverSyncTimer) {
    clearTimeout(conn.serverSyncTimer);
    conn.serverSyncTimer = undefined;
  }

  // Remove from user connections
  const userState = userConnections.get(conn.userDid);
  if (userState) {
    userState.connections.delete(conn);

    if (userState.connections.size === 0) {
      // Schedule cleanup after grace period
      userState.shutdownTimer = setTimeout(() => {
        if (userState.connections.size === 0) {
          userConnections.delete(conn.userDid);
          evictUserCache(conn.userDid);
          console.log(
            `[LeanSync] Cleaned up user state for ${conn.userDid} (active users: ${userConnections.size})`
          );
        }
      }, CONNECTION_SHUTDOWN_DELAY_MS);
    }
  }

  console.log(
    `[LeanSync] Peer disconnected for user ${conn.userDid} (active users: ${userConnections.size})`
  );
}

// --- Public API ---

/** Reset all module-level state (for testing) */
export function resetSyncState(): void {
  globalDocLocks.clear();
  userConnections.clear();
  // Free all cached docs
  for (const entry of docCache.values()) {
    clearTimeout(entry.evictionTimer);
    try {
      Automerge.free(entry.doc);
    } catch {
      // Handle already-freed doc
    }
  }
  docCache.clear();
  syncStateMemCache.clear();
  cachedLoadStmt = undefined;
  cachedSaveStmt = undefined;
  resetAccessStatements();
}

export function getActiveUserCount(): number {
  return userConnections.size;
}

export function getActiveConnectionCount(): number {
  let count = 0;
  for (const userState of userConnections.values()) {
    count += userState.connections.size;
  }
  return count;
}

// --- Manual WebSocket upgrade ---
// Bun's built-in ws polyfill has a bug where handleUpgrade() calls
// server.upgrade(req) with a Node.js IncomingMessage instead of a Bun Request,
// causing "TypeError: upgrade requires a Request object". This manual fallback
// performs the HTTP 101 handshake and creates a WebSocket from the raw socket,
// bypassing the buggy polyfill code path.

function manualWebSocketUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  cb: (ws: WsWebSocket) => void
): void {
  const key = request.headers['sec-websocket-key'];
  if (!key || typeof key !== 'string') {
    socket.destroy();
    return;
  }

  const accept = createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  // Use ws's internal API to wrap the raw socket in a WebSocket.
  // This is the same pattern ws uses inside handleUpgrade/completeUpgrade.
  const ws = new WsWebSocket(null as unknown as string);
  (
    ws as unknown as {
      setSocket(s: Duplex, h: Buffer, opts: Record<string, unknown>): void;
    }
  ).setSocket(socket, head, {
    maxPayload: 100 * 1024 * 1024,
    skipUTF8Validation: false,
    allowSynchronousEvents: true
  });

  cb(ws);
}

export function initLeanSyncServer(httpServer: Server): void {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    if (url.pathname !== '/sync') {
      socket.destroy();
      return;
    }

    const cookies = parseCookies(request.headers.cookie || '');
    const token = cookies['flint_session'];
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const session = await verifySessionTokenAsync(token);
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const userDid = session.userDid;

    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleNewConnection(ws, userDid);
      });
    } catch {
      // Bun's ws polyfill may fail with "upgrade requires a Request object".
      // Fall back to manual WebSocket handshake.
      try {
        manualWebSocketUpgrade(request, socket, head, (ws) => {
          handleNewConnection(ws, userDid);
        });
      } catch (fallbackErr) {
        console.error('[LeanSync] WebSocket upgrade failed:', fallbackErr);
        socket.destroy();
      }
    }
  });

  startPeriodicGC();
  console.log('Lean sync server initialized (one-doc-at-a-time sync)');
}
