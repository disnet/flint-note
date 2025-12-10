/**
 * Automerge repository management
 */

import { Repo, type DocHandle, type AutomergeUrl } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import type { NotesDocument, Vault } from './types';
import { generateVaultId, nowISO } from './utils';

// Singleton repo instance
let repo: Repo | null = null;

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
  openNoteIds: string[];
  created: string;
} {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default',
    icon: '📋',
    pinnedNoteIds: [] as string[],
    openNoteIds: [] as string[],
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
  updates: Partial<Pick<Vault, 'name' | 'archived'>>
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
