/**
 * Directory scanner for plain markdown file import
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MarkdownDirectoryInfo,
  MarkdownFileInfo,
  MarkdownImportData
} from './types';

/**
 * Recursively find all markdown files in a directory
 * Returns paths relative to the root directory
 */
function findMarkdownFiles(
  rootDir: string,
  currentDir: string = rootDir,
  relativePath: string = ''
): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      const entryRelativePath = relativePath
        ? path.join(relativePath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        files.push(...findMarkdownFiles(rootDir, entryPath, entryRelativePath));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(entryRelativePath);
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Extract the first-level category name from a relative path
 * Returns null for root-level files
 */
function getCategoryName(relativePath: string): string | null {
  const segments = relativePath.split(path.sep);
  // If there's more than one segment, the first is the category
  return segments.length > 1 ? segments[0] : null;
}

/**
 * Extract title from filename (remove .md extension)
 */
function getTitleFromFilename(filename: string): string {
  return path.basename(filename, '.md');
}

/**
 * Check if a directory contains any markdown files
 */
export function isMarkdownDirectory(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return false;
    }

    const mdFiles = findMarkdownFiles(dirPath);
    return mdFiles.length > 0;
  } catch {
    return false;
  }
}

/**
 * Scan a directory and return summary info (without file contents)
 * Returns null if no markdown files are found
 */
export function scanMarkdownDirectory(dirPath: string): MarkdownDirectoryInfo | null {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return null;
    }

    const mdFiles = findMarkdownFiles(dirPath);
    if (mdFiles.length === 0) {
      return null;
    }

    // Extract unique categories from the files
    const categoriesSet = new Set<string>();
    for (const file of mdFiles) {
      const category = getCategoryName(file);
      if (category) {
        categoriesSet.add(category);
      }
    }

    return {
      path: dirPath,
      name: path.basename(dirPath),
      fileCount: mdFiles.length,
      categories: Array.from(categoriesSet).sort()
    };
  } catch {
    return null;
  }
}

/**
 * Get full import data including file contents
 * Returns null if no markdown files are found
 */
export async function getMarkdownImportData(
  dirPath: string
): Promise<MarkdownImportData | null> {
  const directoryInfo = scanMarkdownDirectory(dirPath);
  if (!directoryInfo) {
    return null;
  }

  const mdFiles = findMarkdownFiles(dirPath);
  const files: MarkdownFileInfo[] = [];

  for (const relativePath of mdFiles) {
    const fullPath = path.join(dirPath, relativePath);

    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      files.push({
        relativePath,
        title: getTitleFromFilename(relativePath),
        content,
        categoryName: getCategoryName(relativePath)
      });
    } catch {
      // Skip files we can't read, but continue with others
    }
  }

  // Return null if we couldn't read any files
  if (files.length === 0) {
    return null;
  }

  return {
    directory: {
      ...directoryInfo,
      fileCount: files.length // Update count to reflect successfully read files
    },
    files
  };
}
