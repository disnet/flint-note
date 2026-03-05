import { NetworkAdapter } from '@automerge/automerge-repo';
import { cbor } from '@automerge/automerge-repo/slim';
import type { PeerId, PeerMetadata, Message } from '@automerge/automerge-repo';
import type { WebSocket as WsWebSocket } from 'ws';

const ProtocolV1 = '1';
const KEEP_ALIVE_INTERVAL_MS = 5000;

interface JoinMessage {
  type: 'join';
  senderId: PeerId;
  peerMetadata: PeerMetadata;
  supportedProtocolVersions: string[];
}

interface FromServerMessage extends Message {
  targetId: PeerId;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

/**
 * A NetworkAdapter wrapping a single WebSocket connection.
 * Each instance handles one client connection, unlike WebSocketServerAdapter
 * which manages all connections on a WebSocketServer.
 */
export class SingleWebSocketAdapter extends NetworkAdapter {
  #socket: WsWebSocket;
  #remotePeerId: PeerId | undefined;
  #ready = false;
  #readyResolve: (() => void) | undefined;
  #readyPromise: Promise<void>;
  #pingInterval: ReturnType<typeof setInterval> | undefined;
  #pongReceived = true;

  constructor(socket: WsWebSocket) {
    super();
    this.#socket = socket;
    this.#readyPromise = new Promise<void>((resolve) => {
      this.#readyResolve = resolve;
    });

    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const bytes = data instanceof Buffer ? data : new Uint8Array(data as ArrayBuffer);
      this.#receiveMessage(bytes);
    });

    socket.on('close', () => {
      this.#clearKeepAlive();
      if (this.#remotePeerId) {
        this.emit('peer-disconnected', { peerId: this.#remotePeerId });
      }
      this.emit('close');
    });

    socket.on('pong', () => {
      this.#pongReceived = true;
    });

    // Keep-alive: ping every 5s, terminate if no pong within 10s
    this.#pingInterval = setInterval(() => {
      if (!this.#pongReceived) {
        console.warn('SingleWebSocketAdapter: pong not received, terminating connection');
        this.#socket.terminate();
        return;
      }
      this.#pongReceived = false;
      this.#socket.ping();
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  #clearKeepAlive(): void {
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
      this.#pingInterval = undefined;
    }
  }

  #receiveMessage(messageBytes: Uint8Array): void {
    let message: JoinMessage | Message;
    try {
      message = cbor.decode(messageBytes);
    } catch {
      console.error('SingleWebSocketAdapter: invalid CBOR message, closing');
      this.#socket.close();
      return;
    }

    if ((message as JoinMessage).type === 'join') {
      const joinMsg = message as JoinMessage;
      this.#remotePeerId = joinMsg.senderId;

      // Wait until connect() has been called so this.peerId is set
      this.whenReady().then(() => {
        if (this.#socket.readyState !== this.#socket.OPEN) return;

        const peerMsg = {
          type: 'peer',
          senderId: this.peerId,
          peerMetadata: this.peerMetadata,
          selectedProtocolVersion: ProtocolV1,
          targetId: joinMsg.senderId
        };
        const encoded = cbor.encode(peerMsg);
        this.#socket.send(toArrayBuffer(encoded));

        this.emit('peer-candidate', {
          peerId: joinMsg.senderId,
          peerMetadata: joinMsg.peerMetadata
        });
      });
    } else {
      this.emit('message', message as Message);
    }
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#ready = true;
    this.#readyResolve?.();
  }

  send(message: FromServerMessage): void {
    if (this.#socket.readyState !== this.#socket.OPEN) {
      return;
    }
    const encoded = cbor.encode(message);
    this.#socket.send(toArrayBuffer(encoded));
  }

  disconnect(): void {
    this.#clearKeepAlive();
    this.#socket.close();
  }

  isReady(): boolean {
    return this.#ready;
  }

  whenReady(): Promise<void> {
    return this.#readyPromise;
  }
}
