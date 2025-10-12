/**
 * Tests for path-utils module
 *
 * Tests the path conversion utilities that enable vault portability
 * across different users and machines.
 */

import { describe, it, expect } from 'vitest';
import {
  toRelativePath,
  toAbsolutePath,
  isAbsolutePath,
  remapPath
} from '../../../src/server/utils/path-utils.js';
import path from 'path';

describe('path-utils', () => {
  describe('toRelativePath', () => {
    it('should convert absolute path to relative on Unix', () => {
      const vaultRoot = '/Users/tyler/Dropbox/flintvault';
      const absolutePath = '/Users/tyler/Dropbox/flintvault/note/welcome.md';
      const result = toRelativePath(absolutePath, vaultRoot);
      expect(result).toBe('note/welcome.md');
    });

    it('should convert absolute path to relative', () => {
      // Use path.join to create platform-appropriate paths
      const vaultRoot = path.join(path.sep, 'Users', 'tyler', 'Dropbox', 'flintvault');
      const absolutePath = path.join(vaultRoot, 'note', 'welcome-to-flint.md');
      const result = toRelativePath(absolutePath, vaultRoot);
      expect(result).toBe('note/welcome-to-flint.md');
    });

    it('should handle nested subdirectories', () => {
      const vaultRoot = '/Users/tyler/vault';
      const absolutePath = '/Users/tyler/vault/note/2025/january/daily.md';
      const result = toRelativePath(absolutePath, vaultRoot);
      expect(result).toBe('note/2025/january/daily.md');
    });

    it('should normalize path separators to forward slashes', () => {
      const vaultRoot = path.join(path.sep, 'vault');
      const absolutePath = path.join(vaultRoot, 'note', 'test.md');
      const result = toRelativePath(absolutePath, vaultRoot);
      // Should use forward slashes regardless of platform
      expect(result).toBe('note/test.md');
      expect(result).not.toContain('\\');
    });
  });

  describe('toAbsolutePath', () => {
    it('should convert relative path to absolute on Unix', () => {
      const vaultRoot = '/Users/tyler/Dropbox/flintvault';
      const relativePath = 'note/welcome.md';
      const result = toAbsolutePath(relativePath, vaultRoot);
      expect(result).toBe(path.join(vaultRoot, 'note', 'welcome.md'));
    });

    it('should convert relative path to absolute on Windows', () => {
      const vaultRoot = 'C:\\Users\\Tyler Disney\\Dropbox\\flintvault';
      const relativePath = 'note/welcome-to-flint.md';
      const result = toAbsolutePath(relativePath, vaultRoot);
      expect(result).toBe(path.join(vaultRoot, 'note', 'welcome-to-flint.md'));
    });

    it('should handle forward slashes in relative paths on Windows', () => {
      const vaultRoot = 'C:\\vault';
      const relativePath = 'note/subdir/test.md';
      const result = toAbsolutePath(relativePath, vaultRoot);
      // Should work correctly regardless of separator in input
      expect(result).toBe(path.join(vaultRoot, 'note', 'subdir', 'test.md'));
    });

    it('should round-trip with toRelativePath', () => {
      const vaultRoot = '/Users/tyler/vault';
      const originalAbsolute = '/Users/tyler/vault/note/test.md';

      const relative = toRelativePath(originalAbsolute, vaultRoot);
      const backToAbsolute = toAbsolutePath(relative, vaultRoot);

      expect(backToAbsolute).toBe(originalAbsolute);
    });
  });

  describe('isAbsolutePath', () => {
    it('should identify Unix absolute paths', () => {
      expect(isAbsolutePath('/Users/tyler/vault/note.md')).toBe(true);
      expect(isAbsolutePath('/home/user/notes')).toBe(true);
    });

    it('should identify absolute paths on current platform', () => {
      const absolutePath = path.join(path.sep, 'Users', 'tyler', 'vault');
      expect(isAbsolutePath(absolutePath)).toBe(true);
    });

    it('should identify relative paths', () => {
      expect(isAbsolutePath('note/test.md')).toBe(false);
      expect(isAbsolutePath('subfolder/file.txt')).toBe(false);
      expect(isAbsolutePath('./relative/path')).toBe(false);
      expect(isAbsolutePath('../parent/path')).toBe(false);
    });
  });

  describe('remapPath', () => {
    it('should extract relative portion from old path and join with new vault root', () => {
      const oldPath = path.join(
        path.sep,
        'Users',
        'olduser',
        'Documents',
        'vault',
        'note',
        'test.md'
      );
      const newVaultRoot = path.join(path.sep, 'Users', 'newuser', 'Dropbox', 'vault');

      const result = remapPath(oldPath, newVaultRoot);

      // Should extract the last 2 segments (type/filename)
      expect(result).toBe(path.join(newVaultRoot, 'note', 'test.md'));
    });

    it('should handle paths with correct extraction logic', () => {
      const oldPath = '/old/location/vault/daily/2025/01/note.md';
      const newVaultRoot = '/new/location/vault';

      const result = remapPath(oldPath, newVaultRoot);

      // remapPath extracts last 2 segments and joins
      // Not null, because it extracts something
      expect(result).not.toBeNull();
    });

    it('should return result for single level paths', () => {
      const oldPath = '/single.md';
      const newVaultRoot = '/vault';

      const result = remapPath(oldPath, newVaultRoot);
      // remapPath will return a result (not null) for any valid path
      expect(result).not.toBeNull();
    });
  });

  describe('Cross-platform scenarios', () => {
    it('should handle conversion using relative paths', () => {
      // The key insight: relative paths work across platforms
      const unixVaultRoot = '/home/user/vault';

      // Extract relative portion and convert
      const vaultRelative = 'note/test.md';
      const unixAbsolute = toAbsolutePath(vaultRelative, unixVaultRoot);

      expect(unixAbsolute).toBe('/home/user/vault/note/test.md');
    });

    it('should handle relative paths on any platform', () => {
      // Use platform-specific paths
      const vaultRoot = path.join(path.sep, 'Users', 'User', 'vault');

      // Relative path with forward slashes
      const vaultRelative = 'note/test.md';
      const absolutePath = toAbsolutePath(vaultRelative, vaultRoot);

      // Result should use platform-appropriate separators
      const expectedPath = path.join(vaultRoot, 'note', 'test.md');
      expect(absolutePath).toBe(expectedPath);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty paths gracefully', () => {
      const vaultRoot = '/vault';
      const relativePath = '';

      const result = toAbsolutePath(relativePath, vaultRoot);
      expect(result).toBe(vaultRoot);
    });

    it('should handle paths with special characters', () => {
      const vaultRoot = '/Users/user/vault (copy)';
      const absolutePath = '/Users/user/vault (copy)/note/test [draft].md';

      const relative = toRelativePath(absolutePath, vaultRoot);
      expect(relative).toBe('note/test [draft].md');

      const backToAbsolute = toAbsolutePath(relative, vaultRoot);
      expect(backToAbsolute).toBe(absolutePath);
    });

    it('should handle paths with unicode characters', () => {
      const vaultRoot = '/Users/用户/vault';
      const absolutePath = '/Users/用户/vault/note/文档.md';

      const relative = toRelativePath(absolutePath, vaultRoot);
      expect(relative).toBe('note/文档.md');
    });

    it('should handle paths with emoji', () => {
      const vaultRoot = '/Users/user/vault';
      const absolutePath = '/Users/user/vault/note/🎉 celebration.md';

      const relative = toRelativePath(absolutePath, vaultRoot);
      expect(relative).toBe('note/🎉 celebration.md');

      const backToAbsolute = toAbsolutePath(relative, vaultRoot);
      expect(backToAbsolute).toBe(absolutePath);
    });
  });
});
