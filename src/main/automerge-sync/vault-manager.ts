/**
 * Vault manager for the main process.
 * Handles Automerge repo instances and file system sync per vault.
 */

import path from 'path';
import fs from 'fs';
import type { WebContents } from 'electron';
import { Repo, type AutomergeUrl } from '@automerge/automerge-repo';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { IPCNetworkAdapterMain } from './IPCNetworkAdapterMain';
import { setupMarkdownSync } from './markdown-sync';
import { setupFileSync } from './file-sync';
import { logger } from '../logger';
import { perf } from '../perf';

interface VaultRepoEntry {
  repo: Repo;
  networkAdapter: IPCNetworkAdapterMain;
  baseDirectory: string;
  docUrl: string;
  unsubscribeMarkdownSync: () => void;
  unsubscribeFileSync: () => void;
}

// Map of vaultId -> VaultRepoEntry
const vaultRepos = new Map<string, VaultRepoEntry>();

// Track active vault per webContents
const activeVaultByWebContents = new Map<number, string>();

/**
 * Vault manifest schema for import/export
 */
interface VaultManifest {
  version: 1;
  docUrl: string;
  name: string;
  created: string;
}

/**
 * Initialize a vault's main-process repo for file system sync.
 */
export function initializeVaultRepo(
  vaultId: string,
  baseDirectory: string,
  docUrl: string,
  vaultName: string,
  webContents: WebContents
): { success: boolean } {
  perf.start(`Init Vault Repo: ${vaultName}`);

  // Clean up existing repo for this vault if any
  if (vaultRepos.has(vaultId)) {
    disposeVaultRepo(vaultId);
  }

  // Ensure the automerge storage directory exists
  perf.start('Setup storage directory');
  const storageDir = path.join(baseDirectory, '.automerge');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // Write or update manifest file for vault import/export
  const manifestPath = path.join(storageDir, 'manifest.json');
  let existingCreated: string | undefined;

  // Preserve existing created timestamp if manifest exists
  if (fs.existsSync(manifestPath)) {
    try {
      const existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      existingCreated = existingManifest.created;
    } catch {
      // Ignore parse errors, will create new manifest
    }
  }

  const manifest: VaultManifest = {
    version: 1,
    docUrl,
    name: vaultName,
    created: existingCreated || new Date().toISOString()
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logger.info(`[VaultManager] Wrote vault manifest to ${manifestPath}`);
  perf.end('Setup storage directory');

  // Create storage adapter for this vault
  perf.start('Create Automerge repo');
  const storage = new NodeFSStorageAdapter(storageDir);

  // Create network adapter to communicate with renderer
  const networkAdapter = new IPCNetworkAdapterMain(webContents);

  // Generate a unique peerId for the main process
  const mainPeerId = `main-${vaultId}` as `main-${string}` & { __peerId: true };

  // Create the repo with a unique peerId for the main process
  const repo = new Repo({
    storage,
    // The network adapter is added after repo creation since we need to call connect()
    peerId: mainPeerId
  });

  // Add the network adapter to the repo's network subsystem
  // and connect it with the main process peerId
  repo.networkSubsystem.addNetworkAdapter(
    networkAdapter as unknown as import('@automerge/automerge-repo').NetworkAdapterInterface
  );
  networkAdapter.connect(mainPeerId as unknown as string);

  // Find the document by URL to start syncing
  // The renderer will have created it, we just need to sync
  repo.find(docUrl as AutomergeUrl);
  perf.end('Create Automerge repo');

  // Set up binary file sync (PDFs, EPUBs, web archives, images)
  perf.start('Setup file sync');
  const unsubscribeFileSync = setupFileSync(vaultId, baseDirectory, webContents);
  perf.end('Setup file sync');

  // Defer markdown sync until peer connects (ensures network bridge is ready)
  // This fixes timing issues during legacy vault import where markdown sync
  // would start before the renderer's network adapter was connected
  let unsubscribeMarkdownSync: () => void = () => {};
  let markdownSyncStarted = false;
  let peerTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let syncDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const startMarkdownSync = (): void => {
    if (markdownSyncStarted) return;
    markdownSyncStarted = true;
    if (peerTimeoutId) {
      clearTimeout(peerTimeoutId);
      peerTimeoutId = null;
    }
    logger.info(`[VaultManager] Starting markdown sync for vault: ${vaultId}`);
    unsubscribeMarkdownSync = setupMarkdownSync(vaultId, repo, docUrl, baseDirectory);
  };

  const onPeerConnect = (): void => {
    networkAdapter.off('peer-candidate', onPeerConnect);
    // Add delay after peer connects to allow initial document sync
    // The peer-candidate event fires when network adapters connect, but
    // Automerge still needs time to exchange sync messages and transfer the document
    syncDelayTimeoutId = setTimeout(() => {
      syncDelayTimeoutId = null;
      startMarkdownSync();
    }, 500);
  };

  if (networkAdapter.remotePeerId) {
    // Peer already connected (unlikely but handle it)
    startMarkdownSync();
  } else {
    // Wait for peer-candidate event
    networkAdapter.on('peer-candidate', onPeerConnect);

    // Fallback timeout for backward compatibility (existing vaults may work differently)
    peerTimeoutId = setTimeout(() => {
      if (!markdownSyncStarted) {
        networkAdapter.off('peer-candidate', onPeerConnect);
        logger.info(
          `[VaultManager] Peer timeout, starting markdown sync anyway for vault: ${vaultId}`
        );
        startMarkdownSync();
      }
    }, 5000);
  }

  // Create cleanup that handles both immediate and deferred markdown sync
  const cleanupMarkdownSync = (): void => {
    if (peerTimeoutId) {
      clearTimeout(peerTimeoutId);
    }
    if (syncDelayTimeoutId) {
      clearTimeout(syncDelayTimeoutId);
    }
    networkAdapter.off('peer-candidate', onPeerConnect);
    unsubscribeMarkdownSync();
  };

  vaultRepos.set(vaultId, {
    repo,
    networkAdapter,
    baseDirectory,
    docUrl,
    unsubscribeMarkdownSync: cleanupMarkdownSync,
    unsubscribeFileSync
  });

  // Track which vault is active for this webContents
  activeVaultByWebContents.set(webContents.id, vaultId);

  logger.info(`[VaultManager] Initialized vault sync: ${vaultId} -> ${storageDir}`);

  perf.end(`Init Vault Repo: ${vaultName}`);
  return { success: true };
}

/**
 * Clean up a vault's repo.
 */
export function disposeVaultRepo(vaultId: string): void {
  const entry = vaultRepos.get(vaultId);
  if (entry) {
    logger.info(`[VaultManager] Disposing vault sync: ${vaultId}`);
    // Clean up markdown sync listener
    if (entry.unsubscribeMarkdownSync) {
      entry.unsubscribeMarkdownSync();
    }
    // Clean up file sync watcher
    if (entry.unsubscribeFileSync) {
      entry.unsubscribeFileSync();
    }
    entry.networkAdapter.disconnect();
    vaultRepos.delete(vaultId);
  }
}

/**
 * Get the network adapter for messages from a specific webContents.
 */
export function getNetworkAdapterForWebContents(
  webContentsId: number
): IPCNetworkAdapterMain | null {
  const vaultId = activeVaultByWebContents.get(webContentsId);
  if (vaultId) {
    const entry = vaultRepos.get(vaultId);
    return entry?.networkAdapter || null;
  }
  return null;
}

/**
 * Get the active vault ID for a webContents.
 */
export function getActiveVaultId(webContentsId: number): string | undefined {
  return activeVaultByWebContents.get(webContentsId);
}

/**
 * Get the base directory for the active vault of a webContents.
 */
export function getActiveVaultBaseDirectory(webContentsId: number): string | undefined {
  const vaultId = activeVaultByWebContents.get(webContentsId);
  if (vaultId) {
    const entry = vaultRepos.get(vaultId);
    return entry?.baseDirectory;
  }
  return undefined;
}

/**
 * Remove tracking for a webContents.
 */
export function removeWebContentsTracking(webContentsId: number): void {
  const vaultId = activeVaultByWebContents.get(webContentsId);
  if (vaultId) {
    disposeVaultRepo(vaultId);
  }
  activeVaultByWebContents.delete(webContentsId);
}

/**
 * Clean up all vault repos (called on app quit).
 */
export function disposeAllVaultRepos(): void {
  for (const vaultId of vaultRepos.keys()) {
    disposeVaultRepo(vaultId);
  }
  activeVaultByWebContents.clear();
}
