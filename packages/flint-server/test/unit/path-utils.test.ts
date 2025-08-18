/**
 * Path Utilities Tests
 *
 * Unit tests for simple tilde expansion utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import { expandTilde, resolvePath, hasTilde, isPathSafe } from '../../src/utils/path.ts';

describe('Path Utilities', () => {
  describe('expandTilde', () => {
    it('should expand ~ to home directory', () => {
      const result = expandTilde('~');
      assert.strictEqual(result, os.homedir());
    });

    it('should expand ~/path to home directory + path', () => {
      const result = expandTilde('~/Documents');
      assert.strictEqual(result, path.join(os.homedir(), 'Documents'));
    });

    it('should handle ~/path with nested directories', () => {
      const result = expandTilde('~/Documents/notes');
      assert.strictEqual(result, path.join(os.homedir(), 'Documents', 'notes'));
    });

    it('should not expand paths that do not start with ~', () => {
      const absolutePath = '/absolute/path';
      assert.strictEqual(expandTilde(absolutePath), absolutePath);

      const relativePath = './relative/path';
      assert.strictEqual(expandTilde(relativePath), relativePath);

      const windowsPath = 'C:\\Windows\\System32';
      assert.strictEqual(expandTilde(windowsPath), windowsPath);
    });

    it('should not expand ~ in the middle of a path', () => {
      const midTildePath = '/some/~/path';
      assert.strictEqual(expandTilde(midTildePath), midTildePath);
    });

    it('should handle empty or invalid input', () => {
      assert.strictEqual(expandTilde(''), '');
      assert.strictEqual(expandTilde(null as any), null);
      assert.strictEqual(expandTilde(undefined as any), undefined);
    });

    it('should handle edge cases', () => {
      assert.strictEqual(expandTilde('~/'), path.join(os.homedir(), ''));
    });
  });

  describe('resolvePath', () => {
    it('should resolve tilde paths to absolute paths', () => {
      const result = resolvePath('~/Documents');
      assert.strictEqual(path.isAbsolute(result), true);
      assert.strictEqual(result, path.resolve(os.homedir(), 'Documents'));
    });

    it('should resolve relative paths to absolute paths', () => {
      const result = resolvePath('./relative');
      assert.strictEqual(path.isAbsolute(result), true);
      assert.strictEqual(result, path.resolve('./relative'));
    });

    it('should handle absolute paths', () => {
      const absolutePath = path.resolve('/absolute/path');
      const result = resolvePath(absolutePath);
      assert.strictEqual(result, absolutePath);
    });

    it('should resolve complex tilde paths', () => {
      const result = resolvePath('~/Documents/notes');
      const expected = path.resolve(os.homedir(), 'Documents', 'notes');
      assert.strictEqual(result, expected);
    });
  });

  describe('hasTilde', () => {
    it('should detect tilde paths', () => {
      assert.strictEqual(hasTilde('~'), true);
      assert.strictEqual(hasTilde('~/Documents'), true);
    });

    it('should not detect non-tilde paths', () => {
      assert.strictEqual(hasTilde('/absolute/path'), false);
      assert.strictEqual(hasTilde('./relative/path'), false);
      assert.strictEqual(hasTilde('relative/path'), false);
      assert.strictEqual(hasTilde('C:\\Windows'), false);
    });

    it('should not detect tilde in middle of path', () => {
      assert.strictEqual(hasTilde('/some/~/path'), false);
      assert.strictEqual(hasTilde('prefix~suffix'), false);
    });

    it('should handle empty or invalid input', () => {
      assert.strictEqual(hasTilde(''), false);
      assert.strictEqual(hasTilde(null as any), false);
      assert.strictEqual(hasTilde(undefined as any), false);
    });
  });

  describe('isPathSafe', () => {
    it('should accept safe absolute paths', () => {
      assert.strictEqual(isPathSafe('/safe/absolute/path'), true);
      assert.strictEqual(isPathSafe('C:\\Windows\\System32'), true);
    });

    it('should accept safe relative paths', () => {
      assert.strictEqual(isPathSafe('./safe/relative'), true);
      assert.strictEqual(isPathSafe('safe/relative'), true);
    });

    it('should accept safe tilde paths', () => {
      assert.strictEqual(isPathSafe('~/Documents'), true);
      assert.strictEqual(isPathSafe('~'), true);
    });

    it('should reject paths with null bytes', () => {
      assert.strictEqual(isPathSafe('/path/with\0null'), false);
      assert.strictEqual(isPathSafe('~/Documents\0'), false);
    });

    it('should reject obvious path traversal attempts', () => {
      assert.strictEqual(isPathSafe('../../../etc/passwd'), false);
      assert.strictEqual(isPathSafe('../dangerous'), false);
    });

    it('should reject empty or invalid input', () => {
      assert.strictEqual(isPathSafe(''), false);
      assert.strictEqual(isPathSafe(null as any), false);
      assert.strictEqual(isPathSafe(undefined as any), false);
    });

    it('should handle complex safe paths', () => {
      assert.strictEqual(isPathSafe('~/Documents/Projects/flint-note/src/utils'), true);
      assert.strictEqual(isPathSafe('/usr/local/bin/flint-note'), true);
    });
  });

  describe('basic functionality', () => {
    it('should handle typical vault creation paths', () => {
      const tildeVaultPath = '~/my-vault';
      const expandedPath = expandTilde(tildeVaultPath);
      const resolvedPath = resolvePath(tildeVaultPath);

      assert.strictEqual(expandedPath, path.join(os.homedir(), 'my-vault'));
      assert.strictEqual(resolvedPath, path.resolve(os.homedir(), 'my-vault'));
      assert.strictEqual(hasTilde(tildeVaultPath), true);
      assert.strictEqual(isPathSafe(tildeVaultPath), true);
    });

    it('should be consistent with multiple calls', () => {
      const testPath = '~/Documents/test';
      const result1 = expandTilde(testPath);
      const result2 = expandTilde(testPath);
      assert.strictEqual(result1, result2);
    });
  });
});
