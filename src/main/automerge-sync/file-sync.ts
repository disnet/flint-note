/**
 * Two-way sync for binary files (PDFs, EPUBs, web archives, images)
 * between OPFS (renderer) and the filesystem (main process).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import type { WebContents } from 'electron';
import { logger } from '../logger';

// File types we support
export type FileType = 'pdf' | 'epub' | 'webpage' | 'image';

// Directory names for each file type
const FILE_TYPE_DIRS: Record<FileType, string> = {
  pdf: 'pdfs',
  epub: 'epubs',
  webpage: 'webpages',
  image: 'images'
};

// File extensions for each type
const FILE_TYPE_EXTENSIONS: Record<FileType, string> = {
  pdf: '.pdf',
  epub: '.epub',
  webpage: '.html',
  image: '' // Images have variable extensions
};

// Supported image extensions
const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

// Map of vaultId -> Set<relativePath> for files currently being written (to prevent sync loops)
const filesBeingWritten = new Map<string, Set<string>>();

// Map of vaultId -> FSWatcher for file watching
const fileWatchers = new Map<string, FSWatcher>();

/**
 * Result of listing files in the filesystem
 */
export interface FileListResult {
  hash: string;
  extension?: string; // Only for images
  size: number;
}

/**
 * Result of reading a file from the filesystem
 */
export interface FileReadResult {
  data: Buffer;
  metadata?: Record<string, unknown>; // For webpages
}

/**
 * Callback for when a file is added from the filesystem
 */
export interface FileAddedEvent {
  fileType: FileType;
  hash: string;
  extension?: string; // Only for images
  data: Buffer;
  metadata?: Record<string, unknown>; // For webpages
}

/**
 * Compute SHA-256 hash of data
 */
function computeHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get short hash (8 chars) from full hash - used for images
 */
function getShortHash(fullHash: string): string {
  return fullHash.slice(0, 8);
}

/**
 * Ensure the files directory structure exists
 */
export function ensureFilesDir(baseDirectory: string): string {
  const filesDir = path.join(baseDirectory, 'files');
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
  }
  return filesDir;
}

/**
 * Ensure a specific file type directory exists
 */
export function ensureFileTypeDir(baseDirectory: string, fileType: FileType): string {
  const filesDir = ensureFilesDir(baseDirectory);
  const typeDir = path.join(filesDir, FILE_TYPE_DIRS[fileType]);
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }
  return typeDir;
}

/**
 * Get the full path for a file
 */
function getFilePath(
  baseDirectory: string,
  fileType: FileType,
  hash: string,
  extension?: string
): string {
  const typeDir = path.join(baseDirectory, 'files', FILE_TYPE_DIRS[fileType]);

  if (fileType === 'image') {
    if (!extension) throw new Error('Extension required for image files');
    return path.join(typeDir, `${hash}.${extension}`);
  }

  return path.join(typeDir, `${hash}${FILE_TYPE_EXTENSIONS[fileType]}`);
}

/**
 * Get the metadata file path for a webpage
 */
function getMetadataPath(baseDirectory: string, hash: string): string {
  const typeDir = path.join(baseDirectory, 'files', FILE_TYPE_DIRS.webpage);
  return path.join(typeDir, `${hash}.meta.json`);
}

/**
 * Write a file to the filesystem
 */
export async function writeFile(
  baseDirectory: string,
  fileType: FileType,
  hash: string,
  data: Buffer,
  vaultId: string,
  options?: {
    extension?: string; // Required for images
    metadata?: Record<string, unknown>; // For webpages
  }
): Promise<void> {
  // Ensure directory exists
  ensureFileTypeDir(baseDirectory, fileType);

  // Get file path
  const filePath = getFilePath(baseDirectory, fileType, hash, options?.extension);
  const relativePath = path.relative(baseDirectory, filePath);

  // Get or create the set of files being written for this vault
  if (!filesBeingWritten.has(vaultId)) {
    filesBeingWritten.set(vaultId, new Set());
  }
  const writing = filesBeingWritten.get(vaultId)!;

  // Mark file as being written to prevent sync loop
  writing.add(relativePath);

  // Write the file
  fs.writeFileSync(filePath, data);
  logger.debug(`[FileSync] Wrote ${fileType}: ${relativePath}`);

  // Also write metadata for webpages
  if (fileType === 'webpage' && options?.metadata) {
    const metadataPath = getMetadataPath(baseDirectory, hash);
    const metadataRelative = path.relative(baseDirectory, metadataPath);
    writing.add(metadataRelative);
    fs.writeFileSync(metadataPath, JSON.stringify(options.metadata, null, 2), 'utf-8');
    logger.debug(`[FileSync] Wrote webpage metadata: ${metadataRelative}`);
    // Clear metadata from writing set after delay
    setTimeout(() => writing.delete(metadataRelative), 100);
  }

  // Remove from writing set after a short delay to allow fs events to settle
  setTimeout(() => writing.delete(relativePath), 100);
}

/**
 * Read a file from the filesystem
 */
export async function readFile(
  baseDirectory: string,
  fileType: FileType,
  hash: string,
  extension?: string
): Promise<FileReadResult | null> {
  const filePath = getFilePath(baseDirectory, fileType, hash, extension);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath);

  // Also read metadata for webpages
  if (fileType === 'webpage') {
    const metadataPath = getMetadataPath(baseDirectory, hash);
    let metadata: Record<string, unknown> | undefined;
    if (fs.existsSync(metadataPath)) {
      try {
        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch {
        // Ignore metadata parse errors
      }
    }
    return { data, metadata };
  }

  return { data };
}

/**
 * Check if a file exists on the filesystem
 */
export function fileExists(
  baseDirectory: string,
  fileType: FileType,
  hash: string,
  extension?: string
): boolean {
  const filePath = getFilePath(baseDirectory, fileType, hash, extension);
  return fs.existsSync(filePath);
}

/**
 * List all files of a given type in the filesystem
 */
export function listFiles(baseDirectory: string, fileType: FileType): FileListResult[] {
  const typeDir = path.join(baseDirectory, 'files', FILE_TYPE_DIRS[fileType]);

  if (!fs.existsSync(typeDir)) {
    return [];
  }

  const files = fs.readdirSync(typeDir);
  const results: FileListResult[] = [];

  for (const filename of files) {
    const filePath = path.join(typeDir, filename);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) continue;

    if (fileType === 'image') {
      // Parse image filename: {shortHash}.{ext}
      const match = filename.match(/^([a-f0-9]{8})\.(\w+)$/i);
      if (match && SUPPORTED_IMAGE_EXTENSIONS.includes(match[2].toLowerCase())) {
        results.push({
          hash: match[1].toLowerCase(),
          extension: match[2].toLowerCase(),
          size: stat.size
        });
      }
    } else if (fileType === 'webpage') {
      // Only include .html files, not .meta.json
      if (filename.endsWith('.html')) {
        const hash = filename.slice(0, -5); // Remove .html
        results.push({ hash, size: stat.size });
      }
    } else {
      // PDF or EPUB: {fullHash}.{ext}
      const ext = FILE_TYPE_EXTENSIONS[fileType];
      if (filename.endsWith(ext)) {
        const hash = filename.slice(0, -ext.length);
        results.push({ hash, size: stat.size });
      }
    }
  }

  return results;
}

/**
 * Delete a file from the filesystem
 */
export function removeFile(
  baseDirectory: string,
  fileType: FileType,
  hash: string,
  vaultId: string,
  extension?: string
): boolean {
  const filePath = getFilePath(baseDirectory, fileType, hash, extension);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  // Get or create the set of files being written for this vault
  if (!filesBeingWritten.has(vaultId)) {
    filesBeingWritten.set(vaultId, new Set());
  }
  const writing = filesBeingWritten.get(vaultId)!;
  const relativePath = path.relative(baseDirectory, filePath);

  writing.add(relativePath);
  fs.unlinkSync(filePath);
  logger.debug(`[FileSync] Removed ${fileType}: ${relativePath}`);

  // Also remove metadata for webpages
  if (fileType === 'webpage') {
    const metadataPath = getMetadataPath(baseDirectory, hash);
    if (fs.existsSync(metadataPath)) {
      const metadataRelative = path.relative(baseDirectory, metadataPath);
      writing.add(metadataRelative);
      fs.unlinkSync(metadataPath);
      setTimeout(() => writing.delete(metadataRelative), 100);
    }
  }

  setTimeout(() => writing.delete(relativePath), 100);
  return true;
}

/**
 * Parse a file to determine its type and hash
 */
function parseFileInfo(
  relativePath: string
): { fileType: FileType; hash: string; extension?: string } | null {
  // Expected format: files/{type}/{hash}.{ext}
  const parts = relativePath.split(path.sep);
  if (parts.length < 3 || parts[0] !== 'files') {
    return null;
  }

  const typeDir = parts[1];
  const filename = parts[2];

  // Find the file type from directory name
  const fileType = (Object.keys(FILE_TYPE_DIRS) as FileType[]).find(
    (type) => FILE_TYPE_DIRS[type] === typeDir
  );

  if (!fileType) return null;

  if (fileType === 'image') {
    const match = filename.match(/^([a-f0-9]{8})\.(\w+)$/i);
    if (match && SUPPORTED_IMAGE_EXTENSIONS.includes(match[2].toLowerCase())) {
      return {
        fileType,
        hash: match[1].toLowerCase(),
        extension: match[2].toLowerCase()
      };
    }
  } else if (fileType === 'webpage') {
    if (filename.endsWith('.html')) {
      return { fileType, hash: filename.slice(0, -5) };
    }
  } else {
    const ext = FILE_TYPE_EXTENSIONS[fileType];
    if (filename.endsWith(ext)) {
      return { fileType, hash: filename.slice(0, -ext.length) };
    }
  }

  return null;
}

/**
 * Set up file watching for two-way sync
 */
export function setupFileSync(
  vaultId: string,
  baseDirectory: string,
  webContents: WebContents
): () => void {
  // Clean up any existing watcher for this vault
  const existingWatcher = fileWatchers.get(vaultId);
  if (existingWatcher) {
    existingWatcher.close();
    fileWatchers.delete(vaultId);
  }

  // Initialize files being written set
  if (!filesBeingWritten.has(vaultId)) {
    filesBeingWritten.set(vaultId, new Set());
  }

  const filesDir = path.join(baseDirectory, 'files');

  // Ensure files directory exists
  ensureFilesDir(baseDirectory);

  // Create watcher for the files directory
  const watcher = chokidar.watch(filesDir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50
    }
  });

  // Debounce map for file events
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const handleFileAdd = async (filePath: string) => {
    const relativePath = path.relative(baseDirectory, filePath);
    const writing = filesBeingWritten.get(vaultId);

    // Skip if we're currently writing this file (sync loop prevention)
    if (writing?.has(relativePath)) {
      logger.debug(`[FileSync] Skipping own write: ${relativePath}`);
      return;
    }

    // Skip metadata files
    if (filePath.endsWith('.meta.json')) {
      return;
    }

    // Parse file info
    const fileInfo = parseFileInfo(relativePath);
    if (!fileInfo) {
      logger.debug(`[FileSync] Skipping unknown file: ${relativePath}`);
      return;
    }

    logger.info(`[FileSync] Detected new file: ${relativePath}`);

    // Read the file
    const data = fs.readFileSync(filePath);

    // For images, we need to verify the hash matches
    if (fileInfo.fileType === 'image') {
      const fullHash = computeHash(data);
      const expectedShortHash = getShortHash(fullHash);
      if (expectedShortHash !== fileInfo.hash) {
        logger.warn(
          `[FileSync] Image hash mismatch: expected ${expectedShortHash}, got ${fileInfo.hash}`
        );
        // Still import it, but use the correct hash
        fileInfo.hash = expectedShortHash;
      }
    }

    // For webpages, also read metadata
    let metadata: Record<string, unknown> | undefined;
    if (fileInfo.fileType === 'webpage') {
      const metadataPath = getMetadataPath(baseDirectory, fileInfo.hash);
      if (fs.existsSync(metadataPath)) {
        try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
          metadata = JSON.parse(metadataContent);
        } catch {
          // Ignore metadata parse errors
        }
      }
    }

    // Send event to renderer
    const event: FileAddedEvent = {
      fileType: fileInfo.fileType,
      hash: fileInfo.hash,
      extension: fileInfo.extension,
      data,
      metadata
    };

    if (!webContents.isDestroyed()) {
      webContents.send('file-added-from-filesystem', event);
    }
  };

  watcher.on('add', (filePath) => {
    // Debounce file add events
    const existing = debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      debounceTimers.delete(filePath);
      handleFileAdd(filePath).catch((err) => {
        logger.error(`[FileSync] Error handling file add: ${filePath}`, err);
      });
    }, 200);

    debounceTimers.set(filePath, timer);
  });

  watcher.on('error', (error) => {
    logger.error('[FileSync] Watcher error:', error);
  });

  fileWatchers.set(vaultId, watcher);

  logger.info(`[FileSync] Set up file watching for vault: ${vaultId} -> ${filesDir}`);

  // Return cleanup function
  return () => {
    logger.info(`[FileSync] Cleaning up file watching for vault: ${vaultId}`);

    // Clear debounce timers
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();

    // Close watcher
    watcher.close();
    fileWatchers.delete(vaultId);
    filesBeingWritten.delete(vaultId);
  };
}

/**
 * Clean up file sync for a vault
 */
export function cleanupFileSync(vaultId: string): void {
  const watcher = fileWatchers.get(vaultId);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(vaultId);
  }
  filesBeingWritten.delete(vaultId);
}

/**
 * Clean up all file sync watchers
 */
export function cleanupAllFileSync(): void {
  for (const [vaultId, watcher] of fileWatchers) {
    watcher.close();
    logger.info(`[FileSync] Cleaned up watcher for vault: ${vaultId}`);
  }
  fileWatchers.clear();
  filesBeingWritten.clear();
}
