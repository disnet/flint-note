/**
 * Automerge repository management
 */

import { Repo, type DocHandle, type AutomergeUrl } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import type { NotesDocument, Vault } from './types';
import { generateVaultId, nowISO } from './utils';
import { IPCNetworkAdapterRenderer } from './ipc';
import type { ElectronSyncAPI } from './ipc';
// Note: generateWorkspaceId and generateNoteTypeId are used in state.svelte.ts for runtime creation

// Check if running in Electron
const isElectron =
  typeof window !== 'undefined' &&
  !!(window as { api?: { automergeSync?: ElectronSyncAPI } }).api?.automergeSync;

// Get the automergeSync API from window.api
function getAutomergeSyncAPI(): ElectronSyncAPI | null {
  if (!isElectron) return null;
  return (
    (window as { api?: { automergeSync?: ElectronSyncAPI } }).api?.automergeSync || null
  );
}

// Singleton repo instance
let repo: Repo | null = null;

// Store active network adapters per vault
const vaultNetworkAdapters = new Map<string, IPCNetworkAdapterRenderer>();

// Track the currently synced vault
let currentSyncedVaultId: string | null = null;

// localStorage keys for vault metadata
const VAULTS_KEY = 'flint-vaults';
const ACTIVE_VAULT_KEY = 'flint-active-vault-id';

// Default IDs for initial workspace and note type
const DEFAULT_WORKSPACE_ID = 'ws-default';
const DEFAULT_NOTE_TYPE_ID = 'type-default';

/**
 * Create the Automerge repository with IndexedDB storage
 */
export function createRepo(): Repo {
  if (repo) return repo;

  repo = new Repo({
    storage: new IndexedDBStorageAdapter('flint-notes')
  });

  return repo;
}

/**
 * Get the existing repo instance
 * @throws Error if repo hasn't been created yet
 */
export function getRepo(): Repo {
  if (!repo) {
    throw new Error('Repo not initialized. Call createRepo() first.');
  }
  return repo;
}

/**
 * Create a default workspace structure
 */
function createDefaultWorkspace(): {
  id: string;
  name: string;
  icon: string;
  pinnedNoteIds: string[];
  recentNoteIds: string[];
  created: string;
} {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default',
    icon: '📋',
    pinnedNoteIds: [] as string[],
    recentNoteIds: [] as string[],
    created: nowISO()
  };
}

/**
 * Create a default note type
 */
function createDefaultNoteType(): {
  id: string;
  name: string;
  purpose: string;
  icon: string;
  archived: boolean;
  created: string;
} {
  return {
    id: DEFAULT_NOTE_TYPE_ID,
    name: 'Note',
    purpose: 'General purpose notes',
    icon: '📝',
    archived: false,
    created: nowISO()
  };
}

/**
 * Create a new Automerge document with default structure
 */
export function createNewNotesDocument(r: Repo): DocHandle<NotesDocument> {
  return r.create<NotesDocument>({
    notes: {},
    workspaces: {
      [DEFAULT_WORKSPACE_ID]: createDefaultWorkspace()
    },
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    noteTypes: {
      [DEFAULT_NOTE_TYPE_ID]: createDefaultNoteType()
    }
  });
}

/**
 * Find an existing document by URL
 */
export async function findDocument(
  r: Repo,
  docUrl: string
): Promise<DocHandle<NotesDocument>> {
  return r.find<NotesDocument>(docUrl as AutomergeUrl);
}

// --- Vault CRUD (localStorage-based) ---

/**
 * Get all vaults from localStorage
 */
export function getVaults(): Vault[] {
  const stored = localStorage.getItem(VAULTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

/**
 * Save vaults to localStorage
 */
export function saveVaults(vaults: Vault[]): void {
  localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
}

/**
 * Get the active vault ID from localStorage
 */
export function getActiveVaultId(): string | null {
  return localStorage.getItem(ACTIVE_VAULT_KEY);
}

/**
 * Set the active vault ID in localStorage
 */
export function setActiveVaultId(id: string): void {
  localStorage.setItem(ACTIVE_VAULT_KEY, id);
}

/**
 * Get a vault by ID
 */
export function getVaultById(id: string): Vault | undefined {
  return getVaults().find((v) => v.id === id);
}

/**
 * Create a new vault with a fresh Automerge document
 */
export function createVault(r: Repo, name: string): Vault {
  const handle = createNewNotesDocument(r);

  const vault: Vault = {
    id: generateVaultId(),
    name,
    docUrl: handle.url,
    archived: false,
    created: nowISO()
  };

  const vaults = getVaults();
  vaults.push(vault);
  saveVaults(vaults);

  return vault;
}

/**
 * Update vault metadata
 */
export function updateVault(
  id: string,
  updates: Partial<Pick<Vault, 'name' | 'archived' | 'baseDirectory'>>
): void {
  const vaults = getVaults();
  const index = vaults.findIndex((v) => v.id === id);
  if (index !== -1) {
    vaults[index] = { ...vaults[index], ...updates };
    saveVaults(vaults);
  }
}

/**
 * Archive a vault (soft delete)
 */
export function archiveVault(id: string): void {
  updateVault(id, { archived: true });
}

/**
 * Initialize the vault system
 * Returns null for activeVault if no vaults exist (triggers first-time experience)
 */
export async function initializeVaults(
  // Repo parameter for future use (e.g., validating document exists)
  _r: Repo
): Promise<{ vaults: Vault[]; activeVault: Vault | null }> {
  const vaults = getVaults();
  const activeVaultId = getActiveVaultId();

  // No vaults - return null to trigger first-time experience
  if (vaults.length === 0) {
    return { vaults: [], activeVault: null };
  }

  // Find non-archived vaults
  const nonArchivedVaults = vaults.filter((v) => !v.archived);
  if (nonArchivedVaults.length === 0) {
    return { vaults, activeVault: null };
  }

  // Ensure we have a valid active vault
  let activeVault = nonArchivedVaults.find((v) => v.id === activeVaultId);
  if (!activeVault) {
    activeVault = nonArchivedVaults[0];
    setActiveVaultId(activeVault.id);
  }

  return { vaults, activeVault };
}

/**
 * Get non-archived vaults
 */
export function getNonArchivedVaults(): Vault[] {
  return getVaults().filter((v) => !v.archived);
}

// --- File System Sync Functions ---

/**
 * Connect a vault to file system sync via the main process.
 * Only works in Electron when the vault has a baseDirectory set.
 */
export async function connectVaultSync(r: Repo, vault: Vault): Promise<void> {
  const syncAPI = getAutomergeSyncAPI();
  if (!syncAPI || !vault.baseDirectory) {
    return;
  }

  // Disconnect any existing sync first
  if (currentSyncedVaultId && currentSyncedVaultId !== vault.id) {
    await disconnectVaultSync();
  }

  try {
    // Initialize the main process repo for this vault
    await syncAPI.initVaultSync({
      vaultId: vault.id,
      baseDirectory: vault.baseDirectory,
      docUrl: vault.docUrl
    });

    // Create and connect the renderer-side network adapter
    const networkAdapter = new IPCNetworkAdapterRenderer(syncAPI);
    vaultNetworkAdapters.set(vault.id, networkAdapter);

    // Add the network adapter to the repo's network subsystem
    r.networkSubsystem.addNetworkAdapter(networkAdapter);

    currentSyncedVaultId = vault.id;

    console.log(`[Renderer] Connected vault sync: ${vault.id}`);
  } catch (error) {
    console.error('[Renderer] Failed to connect vault sync:', error);
  }
}

/**
 * Disconnect the current vault from file system sync.
 */
export async function disconnectVaultSync(): Promise<void> {
  const syncAPI = getAutomergeSyncAPI();
  if (!syncAPI || !currentSyncedVaultId) {
    return;
  }

  const adapter = vaultNetworkAdapters.get(currentSyncedVaultId);

  if (adapter) {
    adapter.disconnect();
    vaultNetworkAdapters.delete(currentSyncedVaultId);
  }

  try {
    await syncAPI.disposeVaultSync({ vaultId: currentSyncedVaultId });
    console.log(`[Renderer] Disconnected vault sync: ${currentSyncedVaultId}`);
  } catch (error) {
    console.error('[Renderer] Failed to disconnect vault sync:', error);
  }

  currentSyncedVaultId = null;
}

/**
 * Get the currently synced vault ID
 */
export function getCurrentSyncedVaultId(): string | null {
  return currentSyncedVaultId;
}

/**
 * Check if file sync is available (running in Electron with API)
 */
export function isFileSyncAvailable(): boolean {
  return isElectron && getAutomergeSyncAPI() !== null;
}

/**
 * Select a sync directory via the system dialog
 */
export async function selectSyncDirectory(): Promise<string | null> {
  const syncAPI = getAutomergeSyncAPI();
  if (!syncAPI) {
    return null;
  }
  return syncAPI.selectSyncDirectory();
}
