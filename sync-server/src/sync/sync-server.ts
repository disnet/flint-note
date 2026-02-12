import { Repo } from '@automerge/automerge-repo';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import type { Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { verifySessionTokenAsync, parseCookies } from '../auth/session.js';
import { canAccessDocument } from './vault-access.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const DOCS_DIR = path.join(DATA_DIR, 'automerge-docs');

let repo: Repo;

export function getRepo(): Repo {
  return repo;
}

export function initSyncServer(httpServer: Server): void {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const storage = new NodeFSStorageAdapter(DOCS_DIR);

  const wss = new WebSocketServer({ noServer: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NodeWSServerAdapter expects its own WebSocketServer type
  const wsAdapter = new NodeWSServerAdapter(wss as any);

  repo = new Repo({
    network: [wsAdapter],
    storage,
    peerId: 'flint-sync-server' as Repo['peerId'],
    sharePolicy: async (peerId, docId) => {
      // Authorization check: only share documents the peer has access to
      const peerDid = peerDidMap.get(peerId);
      if (!peerDid) return false;

      const docUrl = `automerge:${docId}`;
      return canAccessDocument(peerDid, docUrl);
    }
  });

  // Map peer IDs to user DIDs for authorization
  const peerDidMap = new Map<string, string>();
  // Map WebSocket instances to user DIDs (set during upgrade, used during peer-candidate)
  const socketDidMap = new Map<WsWebSocket, string>();

  // Handle WebSocket upgrade with authentication
  httpServer.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    // Only handle /sync path
    if (url.pathname !== '/sync') {
      socket.destroy();
      return;
    }

    // Parse session token from cookie header
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

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Track DID by WebSocket instance for secure peer-candidate mapping
      socketDidMap.set(ws, session.userDid);

      ws.on('close', () => {
        socketDidMap.delete(ws);
      });

      wss.emit('connection', ws, request);
    });
  });

  // Track peer DIDs when connections are established
  // The adapter stores sockets[peerId] = socket, so we can look up the
  // specific socket for this peer and match it to the authenticated DID.
  wsAdapter.on('peer-candidate', ({ peerId }: { peerId: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing adapter internals for secure peer-DID mapping
    const adapterSockets = (wsAdapter as any).sockets as Record<string, WsWebSocket>;
    const peerSocket = adapterSockets[peerId];
    if (peerSocket) {
      const did = socketDidMap.get(peerSocket);
      if (did) {
        peerDidMap.set(peerId, did);
      }
    }
  });

  wsAdapter.on('peer-disconnected', ({ peerId }: { peerId: string }) => {
    peerDidMap.delete(peerId);
  });

  console.log('Automerge sync server initialized');
}
