/**
 * Network adapter for the main process that communicates with
 * the renderer process via Electron IPC.
 */

import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import type { PeerMetadata, PeerId, Message } from '@automerge/automerge-repo';

// IPC message types (duplicated from renderer to avoid import issues)
interface RepoMessageData {
  senderId: string;
  targetId: string;
  type: string;
  documentId?: string;
  data?: number[];
}

type IPCMessage =
  | { type: 'arrive'; peerId: string; peerMetadata?: PeerMetadata }
  | { type: 'welcome'; peerId: string; peerMetadata?: PeerMetadata }
  | { type: 'leave'; peerId: string }
  | { type: 'message'; data: RepoMessageData };

const IPC_CHANNEL = 'automerge-repo-message';

export class IPCNetworkAdapterMain extends EventEmitter {
  private webContents: WebContents;
  private ready = false;
  private readyResolve?: () => void;
  private readyPromise: Promise<void>;
  private _peerId: string | null = null;
  private _peerMetadata: PeerMetadata | undefined;
  private _remotePeerId: string | null = null;

  constructor(webContents: WebContents) {
    super();
    this.webContents = webContents;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  get peerId(): string | null {
    return this._peerId;
  }

  get peerMetadata(): PeerMetadata | undefined {
    return this._peerMetadata;
  }

  get remotePeerId(): string | null {
    return this._remotePeerId;
  }

  connect(peerId: string, peerMetadata?: PeerMetadata): void {
    this._peerId = peerId;
    this._peerMetadata = peerMetadata;

    // Mark as ready and announce to renderer
    this.ready = true;
    this.readyResolve?.();

    if (this.webContents.isDestroyed()) return;
    this.webContents.send(IPC_CHANNEL, {
      type: 'arrive',
      peerId: peerId,
      peerMetadata: peerMetadata
    } as IPCMessage);
  }

  handleMessage(message: IPCMessage): void {
    switch (message.type) {
      case 'arrive':
        this._remotePeerId = message.peerId;
        if (!this.webContents.isDestroyed()) {
          this.webContents.send(IPC_CHANNEL, {
            type: 'welcome',
            peerId: this._peerId,
            peerMetadata: this._peerMetadata
          } as IPCMessage);
        }
        this.emit('peer-candidate', {
          peerId: message.peerId as PeerId,
          peerMetadata: message.peerMetadata || {}
        });
        break;

      case 'welcome':
        this._remotePeerId = message.peerId;
        this.emit('peer-candidate', {
          peerId: message.peerId as PeerId,
          peerMetadata: message.peerMetadata || {}
        });
        break;

      case 'leave':
        this.emit('peer-disconnected', { peerId: message.peerId as PeerId });
        break;

      case 'message': {
        const repoMessage = this.deserializeMessage(message.data);
        this.emit('message', repoMessage);
        break;
      }
    }
  }

  send(message: Message): void {
    if (this.webContents.isDestroyed()) return;
    this.webContents.send(IPC_CHANNEL, {
      type: 'message',
      data: this.serializeMessage(message)
    } as IPCMessage);
  }

  disconnect(): void {
    // Only try to send if webContents is still valid
    if (!this.webContents.isDestroyed()) {
      this.webContents.send(IPC_CHANNEL, {
        type: 'leave',
        peerId: this._peerId
      } as IPCMessage);
    }
    this.emit('close');
  }

  isReady(): boolean {
    return this.ready;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private serializeMessage(message: Message): RepoMessageData {
    const data: RepoMessageData = {
      senderId: message.senderId as string,
      targetId: message.targetId as string,
      type: message.type
    };

    if ('documentId' in message && message.documentId) {
      data.documentId = message.documentId as string;
    }

    if ('data' in message && message.data) {
      data.data = Array.from(message.data as Uint8Array);
    }

    return data;
  }

  private deserializeMessage(data: RepoMessageData): Message {
    const message: Record<string, unknown> = {
      senderId: data.senderId as PeerId,
      targetId: data.targetId as PeerId,
      type: data.type
    };

    if (data.documentId) {
      message.documentId = data.documentId;
    }

    if (data.data) {
      message.data = new Uint8Array(data.data);
    }

    return message as Message;
  }
}
