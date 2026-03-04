/**
 * File storage module for binary files (PDFs, EPUBs, images, webpages).
 * Files are stored on disk at DATA_DIR/files/{fileType}/{hash}.{ext}
 * Content-addressed by hash for automatic deduplication.
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const FILES_DIR = path.join(DATA_DIR, 'files');

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
function ensureDir(fileType: FileType): void {
  fs.mkdirSync(getTypeDir(fileType), { recursive: true });
}

/**
 * Store a file on disk. Skips write if file already exists (deduplication).
 */
export function store(
  hash: string,
  fileType: FileType,
  extension: string,
  data: Buffer
): void {
  ensureDir(fileType);
  const filePath = getFilePath(hash, fileType, extension);

  if (fs.existsSync(filePath)) {
    return; // Already stored
  }

  fs.writeFileSync(filePath, data);
}

/**
 * Retrieve a file from disk. Returns null if not found.
 */
export function retrieve(
  hash: string,
  fileType: FileType,
  extension: string
): Buffer | null {
  const filePath = getFilePath(hash, fileType, extension);

  try {
    return fs.readFileSync(filePath);
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
export function exists(hash: string, fileType: FileType, extension: string): boolean {
  return fs.existsSync(getFilePath(hash, fileType, extension));
}

/**
 * Store webpage metadata JSON alongside the HTML file.
 */
export function storeMetadata(hash: string, metadata: Record<string, unknown>): void {
  ensureDir('webpage');
  const metaPath = path.join(getTypeDir('webpage'), `${hash}.meta.json`);
  fs.writeFileSync(metaPath, JSON.stringify(metadata));
}

/**
 * Retrieve webpage metadata JSON.
 */
export function retrieveMetadata(hash: string): Record<string, unknown> | null {
  const metaPath = path.join(getTypeDir('webpage'), `${hash}.meta.json`);

  try {
    const data = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(data) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
