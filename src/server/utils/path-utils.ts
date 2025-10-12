/**
 * Path Utilities for Relative/Absolute Path Conversion
 *
 * Utilities for converting between absolute and relative paths in the database.
 * This ensures vault portability across different users and machines.
 */

import path from 'path';

/**
 * Convert an absolute file path to a relative path from the vault root
 * @param absolutePath - Absolute path to convert
 * @param vaultRoot - Root path of the vault
 * @returns Relative path from vault root
 */
export function toRelativePath(absolutePath: string, vaultRoot: string): string {
  const relative = path.relative(vaultRoot, absolutePath);

  // Normalize path separators to forward slashes for consistency across platforms
  return relative.split(path.sep).join('/');
}

/**
 * Convert a relative path to an absolute path using the vault root
 * @param relativePath - Relative path from vault root
 * @param vaultRoot - Root path of the vault
 * @returns Absolute path
 */
export function toAbsolutePath(relativePath: string, vaultRoot: string): string {
  // Convert forward slashes back to platform-specific separators
  const normalizedPath = relativePath.split('/').join(path.sep);
  return path.join(vaultRoot, normalizedPath);
}

/**
 * Check if a path appears to be absolute
 * @param filePath - Path to check
 * @returns True if path appears to be absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Attempt to remap an old absolute path to the current vault location
 * This is used during migration when paths may have changed due to:
 * - Different username (e.g., C:\Users\OldUser vs C:\Users\NewUser)
 * - Different vault location (e.g., moved from one folder to another)
 *
 * @param oldAbsolutePath - Old absolute path that no longer exists
 * @param currentVaultRoot - Current vault root path
 * @returns New absolute path or null if remapping not possible
 */
export function remapPath(
  oldAbsolutePath: string,
  currentVaultRoot: string
): string | null {
  try {
    // Extract the vault-relative portion by looking for note type directories
    // Typical structure: /path/to/vault/note-type/filename.md
    const parts = oldAbsolutePath.split(path.sep);

    // Find the vault root by looking for a note type directory structure
    // We need at least 2 parts: note-type/filename.md
    if (parts.length < 2) {
      return null;
    }

    // Try to find a reasonable split point - look for common note type names
    // or use the last 2 segments (type/filename)
    const noteTypeIndex = parts.length - 2;
    const relativeParts = parts.slice(noteTypeIndex);
    const relativePath = relativeParts.join('/');

    // Construct new absolute path
    return toAbsolutePath(relativePath, currentVaultRoot);
  } catch {
    return null;
  }
}
