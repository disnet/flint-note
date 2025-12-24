/**
 * Automerge repository management
 */

import { Repo, type DocHandle, type AutomergeUrl } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import type { NotesDocument, Vault, SidebarItemRef } from './types';
import { generateVaultId, nowISO } from './utils';
import { IPCNetworkAdapterRenderer } from './ipc';
import type { ElectronSyncAPI } from './ipc';

// Check if running in Electron
const isElectron =
  typeof window !== 'undefined' &&
  !!(window as { api?: { automergeSync?: ElectronSyncAPI } }).api?.automergeSync;

// Get the automergeSync API from window.api
function getSyncAPI(): ElectronSyncAPI | null {
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

  const storage = new IndexedDBStorageAdapter('flint-notes');
  repo = new Repo({ storage });

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
  pinnedItemIds: SidebarItemRef[];
  recentItemIds: SidebarItemRef[];
  created: string;
} {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default',
    icon: '📋',
    pinnedItemIds: [] as SidebarItemRef[],
    recentItemIds: [] as SidebarItemRef[],
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
 * Find an existing document by URL and wait for it to be ready.
 * Throws an error if the document is unavailable (e.g., IndexedDB was cleared).
 */
export async function findDocument(
  r: Repo,
  docUrl: string
): Promise<DocHandle<NotesDocument>> {
  const handle = await r.find<NotesDocument>(docUrl as AutomergeUrl);
  // Wait for the document to be ready (loaded from storage)
  await handle.whenReady();

  // Check if document is actually available
  // If IndexedDB was cleared but localStorage still has vault data,
  // the document will be in "unavailable" state
  if (!handle.isReady()) {
    throw new Error(`Document ${docUrl} is unavailable`);
  }

  return handle;
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
 * Permanently delete a vault from localStorage
 * Used when the vault's document is unavailable (e.g., IndexedDB was cleared)
 */
export function deleteVault(id: string): void {
  const vaults = getVaults();
  const filtered = vaults.filter((v) => v.id !== id);
  saveVaults(filtered);

  // If this was the active vault, clear that too
  if (getActiveVaultId() === id) {
    localStorage.removeItem(ACTIVE_VAULT_KEY);
  }
}

/**
 * Clear all vault data from localStorage
 * Used when recovering from corrupted state
 */
export function clearAllVaults(): void {
  localStorage.removeItem(VAULTS_KEY);
  localStorage.removeItem(ACTIVE_VAULT_KEY);
}

/**
 * Initialize the vault system
 * Returns null for activeVault if no vaults exist (triggers first-time experience)
 */
export async function initializeVaults(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Repo parameter for future use (e.g., validating document exists)
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
  const syncAPI = getSyncAPI();
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
  const syncAPI = getSyncAPI();
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
  return isElectron && getSyncAPI() !== null;
}

/**
 * Select a sync directory via the system dialog
 */
export async function selectSyncDirectory(): Promise<string | null> {
  const syncAPI = getSyncAPI();
  if (!syncAPI) {
    return null;
  }
  return syncAPI.selectSyncDirectory();
}

// --- Document Compaction ---

/**
 * Compact a vault's document by creating a fresh copy with only current state.
 * This removes all change history, significantly reducing storage size and load time.
 *
 * WARNING: This creates a new document URL. The old document data remains in IndexedDB
 * until manually cleared.
 *
 * @returns The new document URL, or null if compaction failed
 */
export async function compactVaultDocument(vaultId: string): Promise<string | null> {
  const r = getRepo();
  const vaults = getVaults();
  const vault = vaults.find((v) => v.id === vaultId);

  if (!vault) {
    console.error('[Compact] Vault not found:', vaultId);
    return null;
  }

  console.log('[Compact] Starting compaction for vault:', vault.name);

  try {
    // Load the current document
    const oldHandle = await r.find<NotesDocument>(vault.docUrl as AutomergeUrl);
    await oldHandle.whenReady();

    const currentDoc = oldHandle.doc();
    if (!currentDoc) {
      console.error('[Compact] Could not load current document');
      return null;
    }

    // Log current state
    const noteCount = Object.keys(currentDoc.notes || {}).length;
    const workspaceCount = Object.keys(currentDoc.workspaces || {}).length;
    console.log(
      '[Compact] Current document has',
      noteCount,
      'notes,',
      workspaceCount,
      'workspaces'
    );

    // Create a fresh document with the current state (no history)
    const newHandle = r.create<NotesDocument>();

    // Copy all current data to the new document
    newHandle.change((doc) => {
      // Deep copy all fields
      doc.notes = JSON.parse(JSON.stringify(currentDoc.notes || {}));
      doc.workspaces = JSON.parse(JSON.stringify(currentDoc.workspaces || {}));
      doc.activeWorkspaceId = currentDoc.activeWorkspaceId;
      doc.noteTypes = JSON.parse(JSON.stringify(currentDoc.noteTypes || {}));

      if (currentDoc.workspaceOrder) {
        doc.workspaceOrder = [...currentDoc.workspaceOrder];
      }
      if (currentDoc.conversations) {
        doc.conversations = JSON.parse(JSON.stringify(currentDoc.conversations));
      }
      if (currentDoc.shelfItems) {
        doc.shelfItems = JSON.parse(JSON.stringify(currentDoc.shelfItems));
      }
      if (currentDoc.lastViewState) {
        doc.lastViewState = JSON.parse(JSON.stringify(currentDoc.lastViewState));
      }
    });

    // Update vault to use new document URL
    const newDocUrl = newHandle.url;

    // Update in localStorage
    const updatedVaults = vaults.map((v) =>
      v.id === vaultId ? { ...v, docUrl: newDocUrl } : v
    );
    saveVaults(updatedVaults);

    console.log('[Compact] Old document URL:', vault.docUrl);
    console.log('[Compact] New document URL:', newDocUrl);
    console.log('[Compact] ✅ Compaction complete!');
    console.log('[Compact] Reload the app to use the compacted document.');
    console.log(
      '[Compact] To reclaim space, clear IndexedDB via DevTools: Application > IndexedDB > flint-notes > Clear'
    );

    return newDocUrl;
  } catch (error) {
    console.error('[Compact] Compaction failed:', error);
    return null;
  }
}

/**
 * Get storage statistics for debugging
 */
export async function getStorageStats(): Promise<{
  entryCount: number;
  totalSizeKB: number;
  entries: { key: string; sizeKB: number }[];
} | null> {
  return new Promise((resolve) => {
    try {
      const dbName = 'flint-notes';
      const request = indexedDB.open(dbName);

      request.onsuccess = () => {
        const db = request.result;
        const storeNames = Array.from(db.objectStoreNames);

        if (storeNames.length === 0) {
          db.close();
          resolve({ entryCount: 0, totalSizeKB: 0, entries: [] });
          return;
        }

        const tx = db.transaction(storeNames, 'readonly');
        const store = tx.objectStore(storeNames[0]);

        const getAllKeysRequest = store.getAllKeys();
        const getAllRequest = store.getAll();

        let keys: IDBValidKey[] = [];
        let values: unknown[] = [];

        getAllKeysRequest.onsuccess = () => {
          keys = getAllKeysRequest.result;
        };

        getAllRequest.onsuccess = () => {
          values = getAllRequest.result;

          const entries: { key: string; sizeKB: number }[] = [];
          let totalSize = 0;

          for (let i = 0; i < keys.length; i++) {
            const key = String(keys[i]);
            const value = values[i];
            let size = 0;

            if (value instanceof ArrayBuffer) {
              size = value.byteLength;
            } else if (value instanceof Uint8Array) {
              size = value.byteLength;
            } else if (typeof value === 'object' && value !== null) {
              size = JSON.stringify(value).length;
            }

            entries.push({ key, sizeKB: size / 1024 });
            totalSize += size;
          }

          // Sort by size descending
          entries.sort((a, b) => b.sizeKB - a.sizeKB);

          db.close();
          resolve({
            entryCount: keys.length,
            totalSizeKB: totalSize / 1024,
            entries: entries.slice(0, 20) // Top 20 largest
          });
        };

        getAllRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}
