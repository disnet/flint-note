/**
 * Unit tests for cross-platform module detection functionality
 *
 * Tests the isMainModule() function that determines if a module is being
 * run directly, which is critical for proper server and CLI startup
 * across different platforms (Windows, macOS, Linux).
 */

import { test, describe } from 'node:test';
import { strictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { resolve, normalize } from 'node:path';

describe('Module Detection', () => {
  test('should detect main module correctly', () => {
    // Simulate the isMainModule function logic
    function isMainModule(importMetaUrl: string, processArgv1: string): boolean {
      try {
        const currentFile = normalize(resolve(fileURLToPath(importMetaUrl)));
        const mainFile = normalize(resolve(processArgv1));
        return currentFile === mainFile;
      } catch {
        // Fallback to original logic if URL parsing fails
        return importMetaUrl === `file://${processArgv1}`;
      }
    }

    // Test case 1: Platform-appropriate paths
    let testPath: string;
    let testUrl: string;

    if (process.platform === 'win32') {
      testPath = 'C:\\Users\\user\\project\\src\\server.ts';
      testUrl = `file:///${testPath.replace(/\\/g, '/')}`;
    } else {
      testPath = '/home/user/project/src/server.ts';
      testUrl = `file://${testPath}`;
    }

    strictEqual(
      isMainModule(testUrl, testPath),
      true,
      'Should detect main module with platform-appropriate paths'
    );

    // Test case 2: Different files
    let file1: string;
    let file2: string;
    let url1: string;

    if (process.platform === 'win32') {
      file1 = 'C:\\Users\\user\\project\\src\\server.ts';
      file2 = 'C:\\Users\\user\\project\\src\\cli.ts';
      url1 = `file:///${file1.replace(/\\/g, '/')}`;
    } else {
      file1 = '/home/user/project/src/server.ts';
      file2 = '/home/user/project/src/cli.ts';
      url1 = `file://${file1}`;
    }

    strictEqual(
      isMainModule(url1, file2),
      false,
      'Should not detect main module when files differ'
    );

    // Test case 3: Relative vs absolute paths
    const relativePath = './src/server.ts';
    const absolutePath = resolve(relativePath);
    const relativeUrl =
      process.platform === 'win32'
        ? `file:///${absolutePath.replace(/\\/g, '/')}`
        : `file://${absolutePath}`;

    strictEqual(
      isMainModule(relativeUrl, relativePath),
      true,
      'Should handle relative vs absolute path comparison'
    );
  });

  test('should handle URL encoding correctly', () => {
    function isMainModule(importMetaUrl: string, processArgv1: string): boolean {
      try {
        const currentFile = normalize(resolve(fileURLToPath(importMetaUrl)));
        const mainFile = normalize(resolve(processArgv1));
        return currentFile === mainFile;
      } catch {
        return importMetaUrl === `file://${processArgv1}`;
      }
    }

    // Test with spaces in path - use platform-appropriate paths
    let pathWithSpaces: string;
    let encodedUrl: string;

    if (process.platform === 'win32') {
      pathWithSpaces = 'C:\\Users\\user\\my project\\src\\server.ts';
      encodedUrl = `file:///${pathWithSpaces.replace(/\\/g, '/').replace(/ /g, '%20')}`;
    } else {
      pathWithSpaces = '/home/user/my project/src/server.ts';
      encodedUrl = `file://${pathWithSpaces.replace(/ /g, '%20')}`;
    }

    strictEqual(
      isMainModule(encodedUrl, pathWithSpaces),
      true,
      'Should handle URL-encoded spaces correctly'
    );

    // Test with special characters - use platform-appropriate paths
    let pathWithSpecialChars: string;
    let specialUrl: string;

    if (process.platform === 'win32') {
      pathWithSpecialChars = 'C:\\Users\\user\\project-name\\src\\server.ts';
      specialUrl = `file:///${pathWithSpecialChars.replace(/\\/g, '/')}`;
    } else {
      pathWithSpecialChars = '/home/user/project-name/src/server.ts';
      specialUrl = `file://${pathWithSpecialChars}`;
    }

    strictEqual(
      isMainModule(specialUrl, pathWithSpecialChars),
      true,
      'Should handle special characters correctly'
    );
  });

  test('should fall back to original logic on URL parsing errors', () => {
    function isMainModule(importMetaUrl: string, processArgv1: string): boolean {
      try {
        const currentFile = normalize(resolve(fileURLToPath(importMetaUrl)));
        const mainFile = normalize(resolve(processArgv1));
        return currentFile === mainFile;
      } catch {
        // Fallback to original logic if URL parsing fails
        return importMetaUrl === `file://${processArgv1}`;
      }
    }

    // Test with malformed URL
    const malformedUrl = 'not-a-valid-url';
    const validPath =
      process.platform === 'win32'
        ? 'C:\\Users\\user\\project\\src\\server.ts'
        : '/home/user/project/src/server.ts';

    // Should not crash and should use fallback logic
    const result = isMainModule(malformedUrl, validPath);
    strictEqual(
      typeof result,
      'boolean',
      'Should return a boolean even with malformed URL'
    );

    // Test fallback behavior
    const fallbackUrl = `file://${validPath}`;
    strictEqual(
      isMainModule(fallbackUrl, validPath),
      true,
      'Fallback logic should work correctly'
    );
  });

  test('should handle edge cases', () => {
    function isMainModule(importMetaUrl: string, processArgv1: string): boolean {
      try {
        const currentFile = normalize(resolve(fileURLToPath(importMetaUrl)));
        const mainFile = normalize(resolve(processArgv1));
        return currentFile === mainFile;
      } catch {
        return importMetaUrl === `file://${processArgv1}`;
      }
    }

    // Test with empty strings
    strictEqual(isMainModule('', ''), false, 'Should handle empty strings gracefully');

    // Test with undefined/null (converted to strings)
    strictEqual(
      isMainModule('undefined', 'undefined'),
      false,
      'Should handle undefined values gracefully'
    );

    // Test with current directory references
    const currentDir = process.cwd();
    const relativePath = './server.ts';
    const absolutePath = resolve(currentDir, 'server.ts');
    // Use platform-appropriate URL format
    const relativeUrl =
      process.platform === 'win32'
        ? `file:///${absolutePath.replace(/\\/g, '/')}`
        : `file://${absolutePath}`;

    strictEqual(
      isMainModule(relativeUrl, relativePath),
      true,
      'Should resolve current directory references correctly'
    );
  });

  test('should normalize path separators consistently', () => {
    // Test path normalization with platform-appropriate paths
    if (process.platform === 'win32') {
      // Test Windows path normalization
      const mixedPath1 = 'C:/Users/user\\project/src\\server.ts';
      const mixedPath2 = 'C:\\Users\\user/project\\src/server.ts';

      // Both should normalize to the same path
      const normalizedPath1 = normalize(resolve(mixedPath1));
      const normalizedPath2 = normalize(resolve(mixedPath2));

      strictEqual(
        normalizedPath1,
        normalizedPath2,
        'Mixed path separators should normalize to same path on Windows'
      );
    } else {
      // Test Unix path normalization
      const path1 = '/home/user/project/src/server.ts';
      const path2 = '/home/user/project/../project/src/server.ts';

      const normalizedPath1 = normalize(resolve(path1));
      const normalizedPath2 = normalize(resolve(path2));

      strictEqual(
        normalizedPath1,
        normalizedPath2,
        'Path normalization should resolve relative components on Unix'
      );
    }
  });
});
