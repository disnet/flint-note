/**
 * IPC types for Automerge sync between renderer and main process
 */

import type { PeerMetadata } from '@automerge/automerge-repo';

/**
 * IPC message types for Automerge repo sync
 */
export type IPCMessage =
  | { type: 'arrive'; peerId: string; peerMetadata?: PeerMetadata }
  | { type: 'welcome'; peerId: string; peerMetadata?: PeerMetadata }
  | { type: 'leave'; peerId: string }
  | { type: 'message'; data: RepoMessageData };

/**
 * Serializable version of Automerge Message
 * Uint8Array is converted to number[] for IPC structured cloning
 */
export interface RepoMessageData {
  senderId: string;
  targetId: string;
  type: string;
  documentId?: string;
  /** Uint8Array serialized as number array for IPC */
  data?: number[];
}

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  REPO_MESSAGE: 'automerge-repo-message',
  INIT_VAULT_SYNC: 'init-vault-sync',
  DISPOSE_VAULT_SYNC: 'dispose-vault-sync'
} as const;

/**
 * Parameters for initializing vault sync
 */
export interface InitVaultSyncParams {
  vaultId: string;
  baseDirectory: string;
  docUrl: string;
}

/**
 * Parameters for disposing vault sync
 */
export interface DisposeVaultSyncParams {
  vaultId: string;
}

/**
 * Electron API interface exposed via preload
 */
export interface ElectronSyncAPI {
  sendRepoMessage: (message: IPCMessage) => Promise<void>;
  onRepoMessage: (callback: (message: IPCMessage) => void) => void;
  removeRepoMessageListener: () => void;
  initVaultSync: (params: InitVaultSyncParams) => Promise<{ success: boolean }>;
  disposeVaultSync: (params: DisposeVaultSyncParams) => Promise<void>;
  selectSyncDirectory: () => Promise<string | null>;
}
