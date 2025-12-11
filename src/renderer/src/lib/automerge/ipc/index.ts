/**
 * IPC module for Automerge sync between renderer and main process
 */

export { IPCNetworkAdapterRenderer } from './IPCNetworkAdapterRenderer';
export type {
  IPCMessage,
  RepoMessageData,
  ElectronSyncAPI,
  InitVaultSyncParams,
  DisposeVaultSyncParams
} from './types';
export { IPC_CHANNELS } from './types';
