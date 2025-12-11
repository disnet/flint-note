/**
 * Network adapter for the renderer process that communicates with
 * the main process via Electron IPC.
 */

import { NetworkAdapter } from '@automerge/automerge-repo';
import type { Message, PeerMetadata, PeerId } from '@automerge/automerge-repo';
import type { IPCMessage, RepoMessageData, ElectronSyncAPI } from './types';

export class IPCNetworkAdapterRenderer extends NetworkAdapter {
  private ready = false;
  private readyResolve?: () => void;
  private readyPromise: Promise<void>;
  private remotePeerId?: PeerId;
  private electronSync: ElectronSyncAPI;

  constructor(electronSync: ElectronSyncAPI) {
    super();
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.electronSync = electronSync;
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;

    // Listen for messages from main process
    this.electronSync.onRepoMessage((message: IPCMessage) => {
      this.handleMessage(message);
    });

    // Announce arrival to main process
    this.electronSync.sendRepoMessage({
      type: 'arrive',
      peerId: peerId as string,
      peerMetadata
    });
  }

  private handleMessage(message: IPCMessage): void {
    switch (message.type) {
      case 'welcome':
        this.remotePeerId = message.peerId as PeerId;
        if (!this.ready) {
          this.ready = true;
          this.readyResolve?.();
        }
        this.emit('peer-candidate', {
          peerId: message.peerId as PeerId,
          peerMetadata: message.peerMetadata || {}
        });
        break;

      case 'arrive':
        this.remotePeerId = message.peerId as PeerId;
        // Respond with welcome
        this.electronSync.sendRepoMessage({
          type: 'welcome',
          peerId: this.peerId as string,
          peerMetadata: this.peerMetadata
        });
        if (!this.ready) {
          this.ready = true;
          this.readyResolve?.();
        }
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
    this.electronSync.sendRepoMessage({
      type: 'message',
      data: this.serializeMessage(message)
    });
  }

  disconnect(): void {
    this.electronSync.sendRepoMessage({
      type: 'leave',
      peerId: this.peerId as string
    });
    if (this.remotePeerId) {
      this.emit('peer-disconnected', { peerId: this.remotePeerId });
    }
    this.electronSync.removeRepoMessageListener();
  }

  isReady(): boolean {
    return this.ready;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private serializeMessage(message: Message): RepoMessageData {
    // Convert Uint8Array to number array for IPC serialization
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
