/**
 * Cloud file sync module for binary files (PDFs, EPUBs, images, webpages).
 *
 * Provides upload/download to the sync server so binary files are available
 * across devices. Files are content-addressed by SHA-256 hash.
 *
 * Upload: fire-and-forget after local OPFS store
 * Download: on-demand when OPFS retrieval returns null
 * Background: scanner to sync missing files in both directions
 */

import { getSyncServerUrl, isCloudAuthenticated } from './cloud-sync.svelte';
import { getActiveVaultId } from './state.svelte';
import { conversationOpfsStorage } from './conversation-opfs-storage.svelte';
import type { Conversation } from './types';
import {
  getPdfHashes,
  getEpubHashes,
  getWebpageHashes,
  getImageKeys
} from './opfs-manifest.svelte';
import { pdfOpfsStorage } from './pdf-opfs-storage.svelte';
import { opfsStorage } from './opfs-storage.svelte';
import { webpageOpfsStorage } from './webpage-opfs-storage.svelte';
import { imageOpfsStorage } from './image-opfs-storage.svelte';

// --- Types ---

export type CloudFileType = 'pdf' | 'epub' | 'image' | 'webpage';

interface CloudFileManifestEntry {
  hash: string;
  fileType: string;
  extension: string;
  sizeBytes: number;
}

// --- Reactive sync status ---

export interface FileSyncWarning {
  fileType: CloudFileType;
  hash: string;
  reason: string;
}

let uploadQueue = $state(0);
let downloadQueue = $state(0);
let isSyncing = $state(false);
let warnings = $state<FileSyncWarning[]>([]);

export function getCloudFileSyncStatus(): {
  uploadQueue: number;
  downloadQueue: number;
  isSyncing: boolean;
  warnings: FileSyncWarning[];
} {
  return { uploadQueue, downloadQueue, isSyncing, warnings };
}

export function clearCloudFileSyncWarnings(): void {
  warnings = [];
}

function addWarning(fileType: CloudFileType, hash: string, reason: string): void {
  // Avoid duplicate warnings for the same file
  if (!warnings.some((w) => w.hash === hash && w.fileType === fileType)) {
    warnings = [...warnings, { fileType, hash, reason }];
  }
}

// --- Core API functions ---

/**
 * Upload a file to the cloud sync server.
 * Non-blocking — catches errors internally.
 */
export async function uploadFileToCloud(
  fileType: CloudFileType,
  hash: string,
  data: ArrayBuffer | Uint8Array,
  options: {
    extension: string;
    vaultId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  if (!isCloudAuthenticated()) return false;

  const serverUrl = getSyncServerUrl();
  const { extension, vaultId, metadata } = options;

  try {
    uploadQueue++;

    // Upload the file binary — wrap in Blob for fetch compatibility
    const blobData =
      data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer.slice(0);
    const blob = new Blob([blobData as ArrayBuffer], {
      type: 'application/octet-stream'
    });
    const res = await fetch(
      `${serverUrl}/api/files/${encodeURIComponent(fileType)}/${encodeURIComponent(hash)}?extension=${encodeURIComponent(extension)}&vaultId=${encodeURIComponent(vaultId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob
      }
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.error(`[CloudFileSync] Upload failed for ${fileType}/${hash}:`, err);

      if (res.status === 413) {
        addWarning(fileType, hash, 'File too large to sync (max 50MB)');
      } else if (res.status !== 401 && res.status !== 403) {
        addWarning(fileType, hash, err.error || `Upload failed (${res.status})`);
      }

      return false;
    }

    // For webpages, also upload metadata
    if (fileType === 'webpage' && metadata) {
      await fetch(`${serverUrl}/api/files/webpage/${encodeURIComponent(hash)}/metadata`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });
    }

    return true;
  } catch (error) {
    console.error(`[CloudFileSync] Upload error for ${fileType}/${hash}:`, error);
    return false;
  } finally {
    uploadQueue--;
  }
}

/**
 * Download a file from the cloud sync server.
 * Returns the binary data or null if not found.
 */
export async function downloadFileFromCloud(
  fileType: CloudFileType,
  hash: string,
  extension: string
): Promise<ArrayBuffer | null> {
  if (!isCloudAuthenticated()) return null;

  const serverUrl = getSyncServerUrl();

  try {
    downloadQueue++;

    const res = await fetch(
      `${serverUrl}/api/files/${encodeURIComponent(fileType)}/${encodeURIComponent(hash)}?extension=${encodeURIComponent(extension)}`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return null;

    return await res.arrayBuffer();
  } catch (error) {
    console.error(`[CloudFileSync] Download error for ${fileType}/${hash}:`, error);
    return null;
  } finally {
    downloadQueue--;
  }
}

/**
 * Download webpage metadata from the cloud.
 */
export async function downloadWebpageMetadataFromCloud(
  hash: string
): Promise<Record<string, unknown> | null> {
  if (!isCloudAuthenticated()) return null;

  const serverUrl = getSyncServerUrl();

  try {
    const res = await fetch(
      `${serverUrl}/api/files/webpage/${encodeURIComponent(hash)}/metadata`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return null;

    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if a file exists on the cloud server.
 */
export async function fileExistsOnCloud(
  fileType: CloudFileType,
  hash: string,
  extension: string
): Promise<boolean> {
  if (!isCloudAuthenticated()) return false;

  const serverUrl = getSyncServerUrl();

  try {
    const res = await fetch(
      `${serverUrl}/api/files/${encodeURIComponent(fileType)}/${encodeURIComponent(hash)}?extension=${encodeURIComponent(extension)}`,
      {
        method: 'HEAD',
        credentials: 'include'
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the cloud file manifest for a vault.
 */
export async function fetchCloudFileManifest(
  vaultId: string
): Promise<CloudFileManifestEntry[]> {
  if (!isCloudAuthenticated()) return [];

  const serverUrl = getSyncServerUrl();

  try {
    const res = await fetch(
      `${serverUrl}/api/files/manifest/${encodeURIComponent(vaultId)}`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as { files: CloudFileManifestEntry[] };
    return data.files || [];
  } catch {
    return [];
  }
}

// --- Fire-and-forget upload helpers (used by import flows) ---

/**
 * Upload a file to cloud in the background after OPFS store.
 * Fire-and-forget — errors are logged but don't affect the import.
 */
export function uploadFileToCloudBackground(
  fileType: CloudFileType,
  hash: string,
  data: ArrayBuffer | Uint8Array,
  options: {
    extension: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const vaultId = getActiveVaultId();
  if (!vaultId || !isCloudAuthenticated()) return;

  uploadFileToCloud(fileType, hash, data, {
    extension: options.extension,
    vaultId,
    metadata: options.metadata
  }).catch((error) => {
    console.error(
      `[CloudFileSync] Background upload failed for ${fileType}/${hash}:`,
      error
    );
  });
}

// --- Background sync ---

/**
 * Sync missing files between local OPFS and cloud.
 * - Files on cloud but not local → download
 * - Files local but not on cloud → upload
 */
export async function syncMissingFiles(vaultId: string): Promise<void> {
  if (!isCloudAuthenticated() || isSyncing) return;

  isSyncing = true;
  console.log('[CloudFileSync] Starting missing file sync for vault:', vaultId);

  try {
    // Fetch cloud manifest
    const cloudFiles = await fetchCloudFileManifest(vaultId);
    if (cloudFiles.length === 0) {
      // No files on cloud — upload all local files
      await uploadAllLocalFiles(vaultId);
      return;
    }

    // Build cloud file set
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const cloudFileSet = new Set(
      cloudFiles.map((f) => `${f.fileType}:${f.hash}:${f.extension}`)
    );

    // Get local manifest
    const localPdfs = getPdfHashes();
    const localEpubs = getEpubHashes();
    const localWebpages = getWebpageHashes();
    const localImages = getImageKeys();

    // Build local file set
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const localFileSet = new Set<string>();
    for (const hash of localPdfs) localFileSet.add(`pdf:${hash}:pdf`);
    for (const hash of localEpubs) localFileSet.add(`epub:${hash}:epub`);
    for (const hash of localWebpages) localFileSet.add(`webpage:${hash}:html`);
    for (const key of localImages) {
      const [shortHash, ext] = key.split('.');
      localFileSet.add(`image:${shortHash}:${ext}`);
    }

    // Files on cloud but not local → download
    const toDownload = cloudFiles.filter(
      (f) => !localFileSet.has(`${f.fileType}:${f.hash}:${f.extension}`)
    );

    // Files local but not on cloud → upload
    const toUpload: Array<{ fileType: CloudFileType; hash: string; extension: string }> =
      [];
    for (const key of localFileSet) {
      if (!cloudFileSet.has(key)) {
        const [fileType, hash, extension] = key.split(':');
        toUpload.push({ fileType: fileType as CloudFileType, hash, extension });
      }
    }

    console.log(
      `[CloudFileSync] Sync plan: ${toDownload.length} to download, ${toUpload.length} to upload`
    );

    // Process downloads (concurrency: 2)
    await processWithConcurrency(toDownload, 2, async (file) => {
      const data = await downloadFileFromCloud(
        file.fileType as CloudFileType,
        file.hash,
        file.extension
      );
      if (!data) return;

      // Store in OPFS
      switch (file.fileType) {
        case 'pdf':
          await pdfOpfsStorage.store(data);
          break;
        case 'epub':
          await opfsStorage.store(data);
          break;
        case 'webpage': {
          const decoder = new TextDecoder();
          const html = decoder.decode(data);
          await webpageOpfsStorage.store(html);
          // Also download metadata
          const metadata = await downloadWebpageMetadataFromCloud(file.hash);
          if (metadata) {
            await webpageOpfsStorage.storeMetadata(file.hash, metadata);
          }
          break;
        }
        case 'image':
          await imageOpfsStorage.storeWithFilename(
            data,
            `${file.hash}.${file.extension}`
          );
          break;
      }
    });

    // Process uploads (concurrency: 2)
    await processWithConcurrency(toUpload, 2, async (file) => {
      const data = await getLocalFileData(file.fileType, file.hash, file.extension);
      if (!data) return;

      const uploadOptions: {
        extension: string;
        vaultId: string;
        metadata?: Record<string, unknown>;
      } = {
        extension: file.extension,
        vaultId
      };

      // For webpages, include metadata
      if (file.fileType === 'webpage') {
        const metadata = await webpageOpfsStorage.retrieveMetadata(file.hash);
        if (metadata) {
          uploadOptions.metadata = metadata;
        }
      }

      await uploadFileToCloud(file.fileType, file.hash, data, uploadOptions);
    });

    console.log('[CloudFileSync] Missing file sync complete');
  } catch (error) {
    console.error('[CloudFileSync] Missing file sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

/**
 * Upload all local files to cloud (for first-time sync / migration).
 */
async function uploadAllLocalFiles(vaultId: string): Promise<void> {
  const uploads: Array<{ fileType: CloudFileType; hash: string; extension: string }> = [];

  for (const hash of getPdfHashes()) {
    uploads.push({ fileType: 'pdf', hash, extension: 'pdf' });
  }
  for (const hash of getEpubHashes()) {
    uploads.push({ fileType: 'epub', hash, extension: 'epub' });
  }
  for (const hash of getWebpageHashes()) {
    uploads.push({ fileType: 'webpage', hash, extension: 'html' });
  }
  for (const key of getImageKeys()) {
    const [shortHash, ext] = key.split('.');
    uploads.push({ fileType: 'image', hash: shortHash, extension: ext });
  }

  if (uploads.length === 0) return;

  console.log(`[CloudFileSync] Uploading ${uploads.length} local files to cloud`);

  await processWithConcurrency(uploads, 2, async (file) => {
    const data = await getLocalFileData(file.fileType, file.hash, file.extension);
    if (!data) return;

    const uploadOptions: {
      extension: string;
      vaultId: string;
      metadata?: Record<string, unknown>;
    } = {
      extension: file.extension,
      vaultId
    };

    if (file.fileType === 'webpage') {
      const metadata = await webpageOpfsStorage.retrieveMetadata(file.hash);
      if (metadata) {
        uploadOptions.metadata = metadata;
      }
    }

    await uploadFileToCloud(file.fileType, file.hash, data, uploadOptions);
  });
}

/**
 * Get local file data from OPFS by type and hash.
 */
async function getLocalFileData(
  fileType: CloudFileType,
  hash: string,
  extension: string
): Promise<ArrayBuffer | null> {
  switch (fileType) {
    case 'pdf':
      return pdfOpfsStorage.retrieve(hash);
    case 'epub':
      return opfsStorage.retrieve(hash);
    case 'webpage': {
      const html = await webpageOpfsStorage.retrieve(hash);
      if (!html) return null;
      return new TextEncoder().encode(html).buffer as ArrayBuffer;
    }
    case 'image':
      return imageOpfsStorage.retrieve(hash, extension);
    default:
      return null;
  }
}

// --- Conversation cloud sync ---

interface ConversationManifestEntry {
  conversationId: string;
  updatedAt: string;
  sizeBytes: number;
}

/**
 * Upload a conversation to the cloud sync server.
 */
export async function uploadConversationToCloud(
  conversationId: string,
  conversation: Conversation,
  vaultId: string
): Promise<boolean> {
  if (!isCloudAuthenticated()) return false;

  const serverUrl = getSyncServerUrl();

  try {
    uploadQueue++;

    const res = await fetch(
      `${serverUrl}/api/files/conversation/${encodeURIComponent(vaultId)}/${encodeURIComponent(conversationId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversation)
      }
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.error(
        `[CloudFileSync] Conversation upload failed for ${conversationId}:`,
        err
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `[CloudFileSync] Conversation upload error for ${conversationId}:`,
      error
    );
    return false;
  } finally {
    uploadQueue--;
  }
}

/**
 * Download a conversation from the cloud sync server.
 * Returns the conversation object or null if not found.
 */
export async function downloadConversationFromCloud(
  conversationId: string,
  vaultId: string
): Promise<Conversation | null> {
  if (!isCloudAuthenticated()) return null;

  const serverUrl = getSyncServerUrl();

  try {
    downloadQueue++;

    const res = await fetch(
      `${serverUrl}/api/files/conversation/${encodeURIComponent(vaultId)}/${encodeURIComponent(conversationId)}`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return null;

    return (await res.json()) as Conversation;
  } catch (error) {
    console.error(
      `[CloudFileSync] Conversation download error for ${conversationId}:`,
      error
    );
    return null;
  } finally {
    downloadQueue--;
  }
}

/**
 * Upload a conversation to cloud in the background (fire-and-forget).
 */
export function uploadConversationToCloudBackground(
  conversationId: string,
  conversation: Conversation
): void {
  const vaultId = getActiveVaultId();
  if (!vaultId || !isCloudAuthenticated()) return;

  uploadConversationToCloud(conversationId, conversation, vaultId).catch((error) => {
    console.error(
      `[CloudFileSync] Background conversation upload failed for ${conversationId}:`,
      error
    );
  });
}

/**
 * Fetch the conversation manifest for a vault from the cloud.
 */
export async function fetchConversationManifest(
  vaultId: string
): Promise<ConversationManifestEntry[]> {
  if (!isCloudAuthenticated()) return [];

  const serverUrl = getSyncServerUrl();

  try {
    const res = await fetch(
      `${serverUrl}/api/files/conversation/${encodeURIComponent(vaultId)}/manifest`,
      {
        credentials: 'include'
      }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as { conversations: ConversationManifestEntry[] };
    return data.conversations || [];
  } catch {
    return [];
  }
}

/**
 * Sync missing conversations between local OPFS and cloud.
 * - Conversations on cloud but not local → download to OPFS
 * - Conversations local but not on cloud → upload
 * - Conversations on both with different updatedAt → sync newer version (last-write-wins)
 */
export async function syncMissingConversations(vaultId: string): Promise<void> {
  if (!isCloudAuthenticated()) return;

  console.log('[CloudFileSync] Starting conversation sync for vault:', vaultId);

  try {
    // Fetch cloud manifest
    const cloudConversations = await fetchConversationManifest(vaultId);

    // Build cloud lookup by ID
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const cloudMap = new Map<string, ConversationManifestEntry>();
    for (const entry of cloudConversations) {
      cloudMap.set(entry.conversationId, entry);
    }

    // Get local conversation IDs from OPFS
    const localIds = await conversationOpfsStorage.listIds();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const localIdSet = new Set(localIds);

    const toDownload: string[] = [];
    const toUpload: string[] = [];

    // Check cloud conversations against local
    for (const [cloudId, cloudEntry] of cloudMap) {
      if (!localIdSet.has(cloudId)) {
        // On cloud but not local → download
        toDownload.push(cloudId);
      } else {
        // On both — compare timestamps for last-write-wins
        const localConversation = await conversationOpfsStorage.retrieve(cloudId);
        if (localConversation) {
          const localTime = Date.parse(localConversation.updated);
          const cloudTime = Date.parse(cloudEntry.updatedAt);
          if (cloudTime > localTime) {
            toDownload.push(cloudId);
          } else if (localTime > cloudTime) {
            toUpload.push(cloudId);
          }
        }
      }
    }

    // Check local conversations not on cloud → upload
    for (const localId of localIds) {
      if (!cloudMap.has(localId)) {
        toUpload.push(localId);
      }
    }

    console.log(
      `[CloudFileSync] Conversation sync: ${toDownload.length} to download, ${toUpload.length} to upload`
    );

    // Process downloads
    await processWithConcurrency(toDownload, 2, async (conversationId) => {
      const conversation = await downloadConversationFromCloud(conversationId, vaultId);
      if (conversation) {
        await conversationOpfsStorage.store(conversation);
      }
    });

    // Process uploads
    await processWithConcurrency(toUpload, 2, async (conversationId) => {
      const conversation = await conversationOpfsStorage.retrieve(conversationId);
      if (conversation) {
        await uploadConversationToCloud(conversationId, conversation, vaultId);
      }
    });

    console.log('[CloudFileSync] Conversation sync complete');
  } catch (error) {
    console.error('[CloudFileSync] Conversation sync failed:', error);
  }
}

/**
 * Process items with limited concurrency.
 */
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(
      batch.map((item) =>
        fn(item).catch((error) => {
          console.error('[CloudFileSync] Item processing failed:', error);
        })
      )
    );
  }
}
