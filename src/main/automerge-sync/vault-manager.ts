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
  // Clean up existing repo for this vault if any
  if (vaultRepos.has(vaultId)) {
    disposeVaultRepo(vaultId);
  }

  // Ensure the automerge storage directory exists
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

  // Create storage adapter for this vault
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

  // Set up markdown file sync
  const unsubscribeMarkdownSync = setupMarkdownSync(vaultId, repo, docUrl, baseDirectory);

  // Set up binary file sync (PDFs, EPUBs, web archives, images)
  const unsubscribeFileSync = setupFileSync(vaultId, baseDirectory, webContents);

  vaultRepos.set(vaultId, {
    repo,
    networkAdapter,
    baseDirectory,
    docUrl,
    unsubscribeMarkdownSync,
    unsubscribeFileSync
  });

  // Track which vault is active for this webContents
  activeVaultByWebContents.set(webContents.id, vaultId);

  logger.info(`[VaultManager] Initialized vault sync: ${vaultId} -> ${storageDir}`);

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
