/**
 * File storage module for binary files (PDFs, EPUBs, images, webpages)
 * and conversation JSON files.
 *
 * Binary files: DATA_DIR/files/{fileType}/{hash}.{ext} (content-addressed)
 * Conversations: DATA_DIR/conversations/{userDid}/{vaultId}/{conversationId}.json (ID-addressed, user-scoped)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const FILES_DIR = path.join(DATA_DIR, 'files');
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');

type FileType = 'pdf' | 'epub' | 'image' | 'webpage';

/**
 * Get the directory path for a given file type
 */
function getTypeDir(fileType: FileType): string {
  return path.join(FILES_DIR, fileType);
}

/**
 * Build the file path for a given hash, type, and extension
 */
function getFilePath(hash: string, fileType: FileType, extension: string): string {
  return path.join(getTypeDir(fileType), `${hash}.${extension}`);
}

/**
 * Ensure the directory for a file type exists
 */
async function ensureDir(fileType: FileType): Promise<void> {
  await fs.mkdir(getTypeDir(fileType), { recursive: true });
}

/**
 * Store a file on disk. Skips write if file already exists (deduplication).
 */
export async function store(
  hash: string,
  fileType: FileType,
  extension: string,
  data: Buffer
): Promise<void> {
  await ensureDir(fileType);
  const filePath = getFilePath(hash, fileType, extension);

  try {
    await fs.access(filePath);
    return; // Already stored
  } catch {
    // File doesn't exist, proceed to write
  }

  await fs.writeFile(filePath, data);
}

/**
 * Retrieve a file from disk. Returns null if not found.
 */
export async function retrieve(
  hash: string,
  fileType: FileType,
  extension: string
): Promise<Buffer | null> {
  const filePath = getFilePath(hash, fileType, extension);

  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a file exists on disk.
 */
export async function exists(
  hash: string,
  fileType: FileType,
  extension: string
): Promise<boolean> {
  try {
    await fs.access(getFilePath(hash, fileType, extension));
    return true;
  } catch {
    return false;
  }
}

/**
 * Store webpage metadata JSON alongside the HTML file.
 */
export async function storeMetadata(
  hash: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await ensureDir('webpage');
  const metaPath = path.join(getTypeDir('webpage'), `${hash}.meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(metadata));
}

/**
 * Retrieve webpage metadata JSON.
 */
export async function retrieveMetadata(
  hash: string
): Promise<Record<string, unknown> | null> {
  const metaPath = path.join(getTypeDir('webpage'), `${hash}.meta.json`);

  try {
    const data = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(data) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// --- Conversation storage ---

/**
 * Sanitize a userDid for filesystem safety
 */
function sanitizeDid(userDid: string): string {
  return userDid.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Get the directory for a user's vault conversations
 */
function getConversationVaultDir(userDid: string, vaultId: string): string {
  return path.join(CONVERSATIONS_DIR, sanitizeDid(userDid), vaultId);
}

/**
 * Get the file path for a specific conversation
 */
function getConversationPath(
  userDid: string,
  vaultId: string,
  conversationId: string
): string {
  return path.join(getConversationVaultDir(userDid, vaultId), `${conversationId}.json`);
}

/**
 * Store a conversation JSON file. Always overwrites (conversations are mutable).
 */
export async function storeConversation(
  userDid: string,
  vaultId: string,
  conversationId: string,
  data: Buffer
): Promise<void> {
  const dir = getConversationVaultDir(userDid, vaultId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getConversationPath(userDid, vaultId, conversationId), data);
}

/**
 * Retrieve a conversation JSON file. Returns null if not found.
 */
export async function retrieveConversation(
  userDid: string,
  vaultId: string,
  conversationId: string
): Promise<Buffer | null> {
  try {
    return await fs.readFile(getConversationPath(userDid, vaultId, conversationId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a conversation file exists on disk.
 */
export async function conversationExists(
  userDid: string,
  vaultId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await fs.access(getConversationPath(userDid, vaultId, conversationId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a conversation file from disk. Returns true if deleted.
 */
export async function deleteConversation(
  userDid: string,
  vaultId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await fs.unlink(getConversationPath(userDid, vaultId, conversationId));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
