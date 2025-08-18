/**
 * Path Utilities
 *
 * Simple path utilities for tilde expansion to home directory.
 */

import path from 'path';
import os from 'os';

/**
 * Expand tilde (~) to home directory
 * Only handles the simple case of ~ at the start of a path
 *
 * @param filePath - Path that may start with tilde
 * @returns Path with tilde expanded to home directory
 *
 * @example
 * expandTilde('~/Documents') // '/Users/username/Documents' on macOS
 * expandTilde('~') // '/Users/username' on macOS
 * expandTilde('/absolute/path') // '/absolute/path' (unchanged)
 */
export function expandTilde(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    return filePath;
  }

  // Handle exact tilde
  if (filePath === '~') {
    return os.homedir();
  }

  // Handle tilde with path separator
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  // Return path as-is if it doesn't start with tilde
  return filePath;
}

/**
 * Resolve path with tilde expansion and absolute path resolution
 *
 * @param filePath - Path to resolve
 * @returns Absolute path with tilde expanded
 *
 * @example
 * resolvePath('~/Documents/notes') // '/Users/username/Documents/notes'
 * resolvePath('./notes') // '/current/working/directory/notes'
 * resolvePath('/absolute/path') // '/absolute/path'
 */
export function resolvePath(filePath: string): string {
  const expandedPath = expandTilde(filePath);
  return path.resolve(expandedPath);
}

/**
 * Check if a path starts with tilde
 *
 * @param filePath - Path to check
 * @returns True if path starts with tilde
 */
export function hasTilde(filePath: string): boolean {
  return Boolean(filePath && (filePath === '~' || filePath.startsWith('~/')));
}

/**
 * Basic path safety check
 * Rejects null bytes and obvious path traversal attempts
 *
 * @param filePath - Path to validate
 * @returns True if path appears safe
 */
export function isPathSafe(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for null bytes (security issue)
  if (filePath.includes('\0')) {
    return false;
  }

  // Very basic path traversal check - reject if it starts with ../
  if (filePath.startsWith('../')) {
    return false;
  }

  return true;
}
