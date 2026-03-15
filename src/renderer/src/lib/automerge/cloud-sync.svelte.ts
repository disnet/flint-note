/**
 * Cloud sync module for syncing Automerge documents via WebSocket
 * to the Flint sync server (fly.io).
 *
 * Handles:
 * - Auth state management (Bluesky OAuth session tokens)
 * - WebSocket lifecycle (connect/disconnect/reconnect)
 * - Vault and content doc registration with the sync server
 * - Sync status tracking
 */

import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import type { NetworkAdapterInterface, NetworkAdapter } from '@automerge/automerge-repo';
import { getRepo } from './repo';
import { isWeb } from '../platform.svelte';

// --- Configuration ---

const SYNC_SERVER_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYNC_SERVER_URL) ||
  'https://sync.flintnote.com';

const WS_URL = SYNC_SERVER_URL.replace(/^http/, 'ws');

// --- localStorage keys ---

const CLOUD_USER_DID_KEY = 'flint-cloud-user-did';

// --- Reactive state ---

export type CloudSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

let syncStatus = $state<CloudSyncStatus>('disconnected');
let userDid = $state<string | null>(null);
let lastSyncError = $state<string | null>(null);
let inviteRequired = $state(false);
let wsAdapter: BrowserWebSocketClientAdapter | null = null;
let onSyncConnectedCallback: (() => void) | null = null;

/**
 * Register a callback that fires when the WebSocket sync connection is established.
 * Used to update lastCloudSync timestamps on vaults.
 */
export function onSyncConnected(callback: () => void): void {
  onSyncConnectedCallback = callback;
}

// --- State getters ---

export function getCloudSyncStatus(): CloudSyncStatus {
  return syncStatus;
}

export function getCloudUserDid(): string | null {
  return userDid;
}

export function isCloudAuthenticated(): boolean {
  return !!userDid;
}

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function setLastSyncError(error: string | null): void {
  lastSyncError = error;
}

export function isInviteRequired(): boolean {
  return inviteRequired;
}

// --- Auth management ---

/**
 * Store user DID from OAuth callback.
 * The session token is now stored as an HTTP-only cookie by the server.
 */
export function setCloudSession(did: string): void {
  userDid = did;
  localStorage.setItem(CLOUD_USER_DID_KEY, did);
}

/**
 * Load user DID from localStorage on init.
 * The session cookie is automatically sent with requests.
 */
export function loadCloudSession(): boolean {
  // Clean up legacy token from localStorage (migrated to HTTP-only cookie)
  localStorage.removeItem('flint-cloud-session');

  const storedDid = localStorage.getItem(CLOUD_USER_DID_KEY);

  if (storedDid) {
    userDid = storedDid;
    return true;
  }
  return false;
}

/**
 * Clear the cloud session (logout)
 */
export async function clearCloudSession(): Promise<void> {
  // Notify server (clears the HTTP-only cookie)
  try {
    await fetch(`${SYNC_SERVER_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {
    // Best effort
  }

  disconnectCloudSync();
  userDid = null;
  localStorage.removeItem(CLOUD_USER_DID_KEY);
}

/**
 * Refresh the session token
 */
export async function refreshCloudSession(): Promise<boolean | 'network-error'> {
  if (!userDid) return false;

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!res.ok) {
      await clearCloudSession();
      return false;
    }

    // Cookie is set by the server response; just update DID if needed
    const data = await res.json();
    setCloudSession(data.userDid);
    return true;
  } catch {
    // Network error — don't clear session, we may just be offline
    return 'network-error';
  }
}

/**
 * Validate the current session with the server
 */
export async function validateCloudSession(): Promise<
  'valid' | 'invalid' | 'network-error'
> {
  if (!userDid) return 'invalid';

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/auth/session`, {
      credentials: 'include'
    });

    if (!res.ok) {
      // Try refresh
      const refreshed = await refreshCloudSession();
      if (refreshed === 'network-error') return 'network-error';
      return refreshed ? 'valid' : 'invalid';
    }

    return 'valid';
  } catch {
    return 'network-error';
  }
}

// --- OAuth flow ---

/**
 * Initiate Bluesky OAuth login.
 * Web: navigates the current page to the auth endpoint.
 * Electron: opens a dedicated BrowserWindow that intercepts the flint:// callback.
 */
export async function startBlueskyLogin(handle: string): Promise<void> {
  const returnTo = isWeb() ? window.location.origin : 'flint://auth/callback';

  // Build URL with query params (not reactive, immediately converted to string)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const params = new URLSearchParams();
  params.set('handle', handle);
  params.set('returnTo', returnTo);
  const loginUrl = `${SYNC_SERVER_URL}/auth/login?${params.toString()}`;

  if (isWeb()) {
    window.open(loginUrl, '_self');
  } else {
    // Open OAuth flow in a dedicated window that intercepts the flint:// redirect.
    // The session cookie is set by the server on the OAuth callback response;
    // Electron's session stores it automatically.
    const result = await window.api?.oauthLogin({ url: loginUrl });
    if (result) {
      if (result.error === 'invite_required' && result.did) {
        setCloudSession(result.did);
        inviteRequired = true;
        return;
      }
      if (result.error) {
        lastSyncError = result.error;
        return;
      }
      setCloudSession(result.did);
    }
  }
}

/**
 * Handle the OAuth callback (called from router or deep link handler).
 * Extracts DID from URL params. The session cookie is already set by the server.
 */
export function handleAuthCallback(params: URLSearchParams): boolean {
  const error = params.get('error');
  const did = params.get('did');

  if (error === 'invite_required' && did) {
    setCloudSession(did);
    inviteRequired = true;
    return true;
  }

  if (error) {
    lastSyncError = error;
    return false;
  }

  if (did) {
    setCloudSession(did);
    return true;
  }
  return false;
}

/**
 * Redeem an invite code for the current authenticated user.
 * Returns true on success, sets lastSyncError on failure.
 */
export async function redeemInviteCode(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${SYNC_SERVER_URL}/auth/redeem-invite`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!res.ok) {
      const data = await res.json();
      lastSyncError = data.error || 'Invalid invite code';
      return false;
    }

    inviteRequired = false;
    lastSyncError = null;
    return true;
  } catch {
    lastSyncError = 'Network error. Please try again.';
    return false;
  }
}

// --- WebSocket sync ---

/**
 * Connect to the cloud sync server via WebSocket.
 * Adds the WebSocket network adapter to the existing Automerge repo.
 */
export function connectCloudSync(): void {
  if (!userDid) {
    console.warn('[CloudSync] No user DID, cannot connect');
    return;
  }

  if (wsAdapter) {
    console.warn('[CloudSync] Already connected');
    return;
  }

  syncStatus = 'connecting';
  lastSyncError = null;

  try {
    const repo = getRepo();
    const wsUrl = `${WS_URL}/sync`;

    wsAdapter = new BrowserWebSocketClientAdapter(wsUrl);

    // Listen to adapter events for accurate sync status
    // Cast to NetworkAdapter (which extends EventEmitter) to access .on() — the
    // websocket package imports from automerge-repo/slim causing a type mismatch.
    const adapter = wsAdapter as unknown as NetworkAdapter;
    adapter.on('peer-candidate', () => {
      syncStatus = 'connected';
      lastSyncError = null;
      console.log('[CloudSync] Connected to sync server');
      onSyncConnectedCallback?.();
    });

    adapter.on('peer-disconnected', () => {
      // Adapter auto-reconnects, so go to 'connecting' not 'disconnected'
      syncStatus = 'connecting';
      console.log('[CloudSync] Peer disconnected, adapter will auto-reconnect');
    });

    // Cast to NetworkAdapterInterface to work around type mismatch between slim and full imports
    repo.networkSubsystem.addNetworkAdapter(
      wsAdapter as unknown as NetworkAdapterInterface
    );
  } catch (error) {
    syncStatus = 'error';
    lastSyncError = error instanceof Error ? error.message : 'Connection failed';
    console.error('[CloudSync] Connection failed:', error);
  }
}

/**
 * Disconnect from the cloud sync server.
 */
export function disconnectCloudSync(): void {
  if (wsAdapter) {
    wsAdapter.disconnect();
    wsAdapter = null;
  }
  syncStatus = 'disconnected';
  lastSyncError = null;
  console.log('[CloudSync] Disconnected from sync server');
}

// --- Vault and document registration ---

/**
 * Register a vault with the sync server so it can be synced.
 */
export async function registerVaultForSync(
  vaultId: string,
  docUrl: string,
  vaultName?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!userDid) return { ok: false, error: 'Not authenticated' };
  if (!navigator.onLine) return { ok: false, error: 'Offline' };

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/api/vaults/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId, docUrl, vaultName })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const error =
        res.status === 403
          ? (data.error ?? 'This vault is owned by another account')
          : (data.error ?? 'Failed to register vault');
      return { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    console.error('[CloudSync] Failed to register vault:', error);
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Register a content document with the sync server.
 */
export async function registerContentDocForSync(
  docUrl: string,
  vaultId: string
): Promise<boolean> {
  if (!userDid) return false;
  if (!navigator.onLine) return false;

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/api/documents/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docUrl, vaultId })
    });

    return res.ok;
  } catch (error) {
    console.error('[CloudSync] Failed to register content doc:', error);
    return false;
  }
}

/**
 * Register multiple content documents at once.
 */
export async function registerContentDocsBatch(
  docs: Array<{ docUrl: string; vaultId: string }>
): Promise<boolean> {
  if (!userDid) return false;
  if (!navigator.onLine) return false;

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/api/documents/register-batch`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs })
    });

    return res.ok;
  } catch (error) {
    console.error('[CloudSync] Failed to batch register content docs:', error);
    return false;
  }
}

/**
 * Fetch the user's vaults from the sync server (for new device setup).
 */
export async function fetchRemoteVaults(): Promise<
  Array<{
    vaultId: string;
    docUrl: string;
    vaultName: string | null;
    createdAt: string;
  }>
> {
  if (!userDid) return [];

  try {
    const res = await fetch(`${SYNC_SERVER_URL}/api/vaults`, {
      credentials: 'include'
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.vaults || [];
  } catch {
    return [];
  }
}

/**
 * Fetch content document URLs for a specific vault from the sync server.
 */
export async function fetchRemoteContentDocs(vaultId: string): Promise<string[]> {
  if (!userDid) return [];

  try {
    const res = await fetch(
      `${SYNC_SERVER_URL}/api/vaults/${encodeURIComponent(vaultId)}/documents`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return data.docUrls || [];
  } catch {
    return [];
  }
}

// --- Network listeners ---

let networkListenersSetup = false;

function setupNetworkListeners(): void {
  if (networkListenersSetup) return;
  networkListenersSetup = true;

  window.addEventListener('online', () => {
    if (isCloudAuthenticated() && !wsAdapter) {
      console.log('[CloudSync] Network online, attempting to connect');
      connectCloudSync();
    }
  });

  window.addEventListener('offline', () => {
    if (syncStatus !== 'disconnected') {
      console.log('[CloudSync] Network offline');
      syncStatus = 'disconnected';
    }
  });
}

/**
 * Initialize cloud sync on app startup.
 * Loads stored session, validates it, and connects if valid.
 */
export async function initCloudSync(): Promise<void> {
  const hasSession = loadCloudSession();
  if (!hasSession) return;

  const result = await validateCloudSession();
  if (result === 'invalid') {
    console.log('[CloudSync] Session invalid, clearing');
    await clearCloudSession();
    return;
  }

  if (result === 'network-error') {
    // Keep session, just note we're offline — adapter will auto-retry when online
    console.log('[CloudSync] Network error during validation, staying offline');
    syncStatus = 'disconnected';
    setupNetworkListeners();
    return;
  }

  // 'valid' — connect
  connectCloudSync();
  setupNetworkListeners();
}

/**
 * Register all existing content docs for a vault with the sync server.
 * Called when enabling cloud sync for a vault that already has content.
 */
export async function registerAllContentDocs(
  vaultId: string,
  contentUrls: Record<string, string>
): Promise<void> {
  const entries = Object.entries(contentUrls);
  if (entries.length === 0) return;

  const docs = entries.map(([, docUrl]) => ({
    docUrl,
    vaultId
  }));

  // Batch register in chunks of 100
  for (let i = 0; i < docs.length; i += 100) {
    const chunk = docs.slice(i, i + 100);
    await registerContentDocsBatch(chunk);
  }
}

export function getSyncServerUrl(): string {
  return SYNC_SERVER_URL;
}
