/**
 * Automerge sync module for the main process
 */

export { IPCNetworkAdapterMain } from './IPCNetworkAdapterMain';
export {
  initializeVaultRepo,
  disposeVaultRepo,
  getNetworkAdapterForWebContents,
  getActiveVaultId,
  getActiveVaultBaseDirectory,
  disposeAllVaultRepos
} from './vault-manager';
export { setupMarkdownSync } from './markdown-sync';
export { setupFileSync, cleanupFileSync, cleanupAllFileSync } from './file-sync';
