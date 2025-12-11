/**
 * Automerge sync module for the main process
 */

export { IPCNetworkAdapterMain } from './IPCNetworkAdapterMain';
export {
  initializeVaultRepo,
  disposeVaultRepo,
  getNetworkAdapterForWebContents,
  getActiveVaultId,
  disposeAllVaultRepos
} from './vault-manager';
export { setupMarkdownSync } from './markdown-sync';
