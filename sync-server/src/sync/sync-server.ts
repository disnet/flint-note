import { Repo } from '@automerge/automerge-repo';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import type { Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { verifySessionTokenAsync, parseCookies } from '../auth/session.js';
import { canAccessDocument } from './vault-access.js';
import { SingleWebSocketAdapter } from './SingleWebSocketAdapter.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const DOCS_DIR = path.join(DATA_DIR, 'automerge-docs');

const REPO_SHUTDOWN_DELAY_MS = 30_000; // 30s grace period before shutting down idle repos

interface UserRepoEntry {
  repo: Repo;
  adapters: Map<WsWebSocket, SingleWebSocketAdapter>;
  shuttingDown?: boolean;
  shutdownTimer?: ReturnType<typeof setTimeout>;
}

const userRepos = new Map<string, UserRepoEntry>();
// Per-user mutex to prevent concurrent repo creation races
const userLocks = new Map<string, Promise<void>>();

function withUserLock(userDid: string, fn: () => Promise<void>): Promise<void> {
  const prev = userLocks.get(userDid) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  userLocks.set(userDid, next);
  // Clean up lock entry when chain settles
  next.then(() => {
    if (userLocks.get(userDid) === next) userLocks.delete(userDid);
  });
  return next;
}

export function getActiveUserCount(): number {
  return userRepos.size;
}

export function initSyncServer(httpServer: Server): void {
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

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleNewConnection(ws, userDid);
    });
  });

  console.log('Automerge sync server initialized (per-user repos)');
}

function handleNewConnection(ws: WsWebSocket, userDid: string): void {
  const adapter = new SingleWebSocketAdapter(ws);

  withUserLock(userDid, async () => {
    let entry = userRepos.get(userDid);

    // If repo was shut down (by a prior lock holder), clear it
    if (entry?.shuttingDown) {
      entry = undefined;
    }

    // Cancel any pending grace-period shutdown timer
    if (entry?.shutdownTimer) {
      clearTimeout(entry.shutdownTimer);
      entry.shutdownTimer = undefined;
    }

    if (!entry) {
      // Create a new Repo for this user with isolated storage
      const userDir = path.join(DOCS_DIR, userDid.replace(/[^a-zA-Z0-9]/g, '_'));
      fs.mkdirSync(userDir, { recursive: true });
      const storage = new NodeFSStorageAdapter(userDir);

      const repo = new Repo({
        network: [adapter],
        storage,
        peerId: `flint-sync-${userDid.slice(-8)}-${Date.now()}` as Repo['peerId'],
        sharePolicy: async (_peerId, docId) => {
          const docUrl = `automerge:${docId}`;
          return canAccessDocument(userDid, docUrl);
        }
      });

      entry = { repo, adapters: new Map() };
      userRepos.set(userDid, entry);
      console.log(`Created repo for user ${userDid} (active users: ${userRepos.size})`);
    } else {
      // Add adapter to existing Repo
      entry.repo.networkSubsystem.addNetworkAdapter(adapter);
    }

    entry.adapters.set(ws, adapter);

    ws.on('close', () => {
      handleDisconnection(ws, userDid);
    });
  });
}

function handleDisconnection(ws: WsWebSocket, userDid: string): void {
  // Remove the adapter immediately under the lock, then schedule
  // deferred shutdown outside the lock so it doesn't block new connections.
  withUserLock(userDid, async () => {
    const entry = userRepos.get(userDid);
    if (!entry) return;

    const adapter = entry.adapters.get(ws);
    if (adapter) {
      entry.repo.networkSubsystem.removeNetworkAdapter(adapter);
      entry.adapters.delete(ws);
    }

    if (entry.adapters.size === 0) {
      // Schedule a deferred shutdown (outside the lock)
      scheduleRepoShutdown(entry, userDid);
    }
  });
}

function scheduleRepoShutdown(entry: UserRepoEntry, userDid: string): void {
  // Clear any existing timer
  if (entry.shutdownTimer) {
    clearTimeout(entry.shutdownTimer);
  }

  entry.shutdownTimer = setTimeout(() => {
    entry.shutdownTimer = undefined;
    // Acquire lock to safely check state and shut down
    withUserLock(userDid, async () => {
      // A new connection arrived during grace period — abort shutdown
      if (entry.adapters.size > 0 || entry.shuttingDown) return;
      // Entry was replaced by a new repo — abort
      if (userRepos.get(userDid) !== entry) return;

      entry.shuttingDown = true;
      try {
        await entry.repo.shutdown();
        if (userRepos.get(userDid) === entry) {
          userRepos.delete(userDid);
        }
        console.log(
          `Shut down repo for user ${userDid} (active users: ${userRepos.size})`
        );
      } catch (err) {
        if (userRepos.get(userDid) === entry) {
          userRepos.delete(userDid);
        }
        console.error(`Error shutting down repo for user ${userDid}:`, err);
      }
    });
  }, REPO_SHUTDOWN_DELAY_MS);
}
