/**
 * OPFS (Origin Private File System) storage service for conversation data.
 * Stores full conversation objects as JSON files, indexed by conversation ID.
 */

import type { Conversation } from './types';

/**
 * Storage statistics
 */
export interface ConversationStorageStats {
  totalFiles: number;
  totalBytes: number;
}

/**
 * Get or create the conversations directory in OPFS
 */
async function getConversationsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('conversations', { create: true });
}

/**
 * Store a conversation in OPFS.
 * Overwrites if the conversation already exists.
 */
export async function store(conversation: Conversation): Promise<void> {
  const conversationsDir = await getConversationsDirectory();
  const fileHandle = await conversationsDir.getFileHandle(`${conversation.id}.json`, {
    create: true
  });

  const writable = await fileHandle.createWritable();
  try {
    const json = JSON.stringify(conversation);
    await writable.write(json);
  } finally {
    await writable.close();
  }
}

/**
 * Retrieve a conversation from OPFS by ID.
 * Returns null if not found.
 */
export async function retrieve(id: string): Promise<Conversation | null> {
  try {
    const conversationsDir = await getConversationsDirectory();
    const fileHandle = await conversationsDir.getFileHandle(`${id}.json`);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as Conversation;
  } catch (error) {
    // File not found or other error
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a conversation exists in OPFS by ID.
 */
export async function exists(id: string): Promise<boolean> {
  try {
    const conversationsDir = await getConversationsDirectory();
    await conversationsDir.getFileHandle(`${id}.json`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete a conversation from OPFS by ID.
 * Returns true if deleted, false if not found.
 */
export async function remove(id: string): Promise<boolean> {
  try {
    const conversationsDir = await getConversationsDirectory();
    await conversationsDir.removeEntry(`${id}.json`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Get storage statistics.
 */
export async function getStorageStats(): Promise<ConversationStorageStats> {
  const conversationsDir = await getConversationsDirectory();
  let totalFiles = 0;
  let totalBytes = 0;

  for await (const [name, handle] of conversationsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      totalFiles++;
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      totalBytes += file.size;
    }
  }

  return { totalFiles, totalBytes };
}

/**
 * List all stored conversation IDs.
 */
export async function listIds(): Promise<string[]> {
  const conversationsDir = await getConversationsDirectory();
  const ids: string[] = [];

  for await (const [name, handle] of conversationsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      // Extract ID from filename (remove .json extension)
      ids.push(name.slice(0, -5));
    }
  }

  return ids;
}

/**
 * Clear all stored conversations.
 * Use with caution!
 */
export async function clearAll(): Promise<number> {
  const conversationsDir = await getConversationsDirectory();
  let count = 0;

  const entries: string[] = [];
  for await (const [name, handle] of conversationsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      entries.push(name);
    }
  }

  for (const name of entries) {
    await conversationsDir.removeEntry(name);
    count++;
  }

  return count;
}

/**
 * OPFS storage service for conversations
 */
export const conversationOpfsStorage = {
  store,
  retrieve,
  exists,
  remove,
  getStorageStats,
  listIds,
  clearAll
};
