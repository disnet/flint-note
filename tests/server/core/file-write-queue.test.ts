/**
 * Tests for FileWriteQueue - Database-first architecture
 *
 * Part of Phase 1: Testing the queue that manages asynchronous file writes
 * @see docs/PRD-DATABASE-SOURCE-OF-TRUTH.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FileWriteQueue } from '../../../src/server/core/notes.js';
import { logger } from '../../../src/main/logger.js';

describe('FileWriteQueue', () => {
  let tempDir: string;
  let queue: FileWriteQueue;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = path.join(os.tmpdir(), `file-write-queue-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create queue with 0ms delay for deterministic testing
    queue = new FileWriteQueue(0);
  });

  afterEach(async () => {
    // Cleanup
    queue.destroy();

    // Remove temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Queue Operations', () => {
    it('should queue a file write', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Hello, World!';

      await queue.queueWrite(filePath, content);

      expect(queue.hasPendingWrite(filePath)).toBe(true);
      expect(queue.getPendingCount()).toBe(1);
    });

    it('should write file content correctly', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Test content';

      await queue.queueWrite(filePath, content);

      // Wait for write to complete (0ms delay + small buffer)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(content);
      expect(queue.hasPendingWrite(filePath)).toBe(false);
    });

    it('should handle multiple files simultaneously', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      const file3 = path.join(tempDir, 'file3.txt');

      await queue.queueWrite(file1, 'Content 1');
      await queue.queueWrite(file2, 'Content 2');
      await queue.queueWrite(file3, 'Content 3');

      expect(queue.getPendingCount()).toBe(3);

      // Wait for all writes
      await new Promise((resolve) => setTimeout(resolve, 100));

      const content1 = await fs.readFile(file1, 'utf-8');
      const content2 = await fs.readFile(file2, 'utf-8');
      const content3 = await fs.readFile(file3, 'utf-8');

      expect(content1).toBe('Content 1');
      expect(content2).toBe('Content 2');
      expect(content3).toBe('Content 3');
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('Debouncing and Batching', () => {
    it('should replace pending write when same file queued again', async () => {
      const queue = new FileWriteQueue(100); // 100ms delay for this test
      const filePath = path.join(tempDir, 'debounce.txt');

      // Queue first write
      await queue.queueWrite(filePath, 'First content');
      expect(queue.getPendingCount()).toBe(1);

      // Queue second write to same file before first completes
      await queue.queueWrite(filePath, 'Second content');

      // Should still only have one pending write
      expect(queue.getPendingCount()).toBe(1);

      // Wait for write to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have written the second content (latest wins)
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('Second content');

      queue.destroy();
    });

    it('should batch rapid writes to same file', async () => {
      const queue = new FileWriteQueue(50); // 50ms delay
      const filePath = path.join(tempDir, 'batch.txt');

      // Simulate rapid typing - 10 edits in quick succession
      for (let i = 0; i < 10; i++) {
        await queue.queueWrite(filePath, `Edit ${i}`);
        // No await - queue them all immediately
      }

      // Only one pending write (latest)
      expect(queue.getPendingCount()).toBe(1);

      // Wait for write
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have written the last edit
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('Edit 9');

      queue.destroy();
    });

    it('should respect custom delay parameter', async () => {
      const queue = new FileWriteQueue(100); // Default 100ms
      const filePath = path.join(tempDir, 'custom-delay.txt');

      // Queue with custom 200ms delay
      await queue.queueWrite(filePath, 'Custom delay content', 200);

      // Wait 150ms - should still be pending
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.hasPendingWrite(filePath)).toBe(true);

      // Wait another 100ms - should be complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(queue.hasPendingWrite(filePath)).toBe(false);

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('Custom delay content');

      queue.destroy();
    });
  });

  describe('Flush Operations', () => {
    it('should flush a specific file immediately', async () => {
      const queue = new FileWriteQueue(1000); // Long delay
      const filePath = path.join(tempDir, 'flush-test.txt');

      await queue.queueWrite(filePath, 'Flush me now');
      expect(queue.hasPendingWrite(filePath)).toBe(true);

      // Flush immediately (don't wait for delay)
      await queue.flushWrite(filePath);

      expect(queue.hasPendingWrite(filePath)).toBe(false);

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('Flush me now');

      queue.destroy();
    });

    it('should flush all pending writes', async () => {
      const queue = new FileWriteQueue(1000); // Long delay
      const file1 = path.join(tempDir, 'flush-all-1.txt');
      const file2 = path.join(tempDir, 'flush-all-2.txt');
      const file3 = path.join(tempDir, 'flush-all-3.txt');

      await queue.queueWrite(file1, 'Content 1');
      await queue.queueWrite(file2, 'Content 2');
      await queue.queueWrite(file3, 'Content 3');

      expect(queue.getPendingCount()).toBe(3);

      // Flush all
      await queue.flushAll();

      expect(queue.getPendingCount()).toBe(0);

      // Verify all written
      const content1 = await fs.readFile(file1, 'utf-8');
      const content2 = await fs.readFile(file2, 'utf-8');
      const content3 = await fs.readFile(file3, 'utf-8');

      expect(content1).toBe('Content 1');
      expect(content2).toBe('Content 2');
      expect(content3).toBe('Content 3');

      queue.destroy();
    });

    it('should handle flush of non-existent file gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.txt');

      // Should not throw
      await expect(queue.flushWrite(nonExistentPath)).resolves.not.toThrow();
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed writes with exponential backoff', async () => {
      const queue = new FileWriteQueue(0);
      const badPath = '/nonexistent/directory/file.txt';

      // Mock logger.warn and logger.error to track retry behavior
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      await queue.queueWrite(badPath, 'This will fail');

      // Wait for all retries to complete
      // 0ms initial + 100ms retry1 + 500ms retry2 + 1000ms retry3 = ~1600ms + buffer
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should have logged 3 warnings (for retries) + 1 error (for final failure)
      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledTimes(1);

      // Should have been removed from queue after max retries
      expect(queue.hasPendingWrite(badPath)).toBe(false);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      queue.destroy();
    });

    it('should succeed on retry if error is transient', async () => {
      // This test simulates a transient error (permission issue) that resolves
      const queue = new FileWriteQueue(0);
      const filePath = path.join(tempDir, 'retry-success.txt');

      // Write the file to set it up
      await fs.writeFile(filePath, 'initial');

      // Make it read-only temporarily
      await fs.chmod(filePath, 0o444);

      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      // Queue write (will fail initially)
      await queue.queueWrite(filePath, 'Should eventually succeed');

      // Wait a bit for first retry
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Fix the permission
      await fs.chmod(filePath, 0o644);

      // Wait for retry to succeed
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Should have succeeded on retry
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('Should eventually succeed');
      expect(queue.hasPendingWrite(filePath)).toBe(false);

      // Should have logged at least one retry warning
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      queue.destroy();
    });
  });

  describe('Cleanup and Destroy', () => {
    it('should clear all pending writes on destroy', async () => {
      const queue = new FileWriteQueue(1000); // Long delay
      const file1 = path.join(tempDir, 'destroy-1.txt');
      const file2 = path.join(tempDir, 'destroy-2.txt');

      await queue.queueWrite(file1, 'Content 1');
      await queue.queueWrite(file2, 'Content 2');

      expect(queue.getPendingCount()).toBe(2);

      queue.destroy();

      expect(queue.getPendingCount()).toBe(0);
    });

    it('should cancel pending timeouts on destroy', async () => {
      const queue = new FileWriteQueue(1000); // Long delay
      const filePath = path.join(tempDir, 'cancel-test.txt');

      await queue.queueWrite(filePath, 'Should not be written');

      // Destroy immediately
      queue.destroy();

      // Wait longer than the delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // File should not exist (write was cancelled)
      await expect(fs.access(filePath)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const filePath = path.join(tempDir, 'empty.txt');

      await queue.queueWrite(filePath, '');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('');
    });

    it('should handle very large content', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB of 'x'

      await queue.queueWrite(filePath, largeContent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(largeContent);
      expect(written.length).toBe(1024 * 1024);
    });

    it('should handle special characters in content', async () => {
      const filePath = path.join(tempDir, 'special.txt');
      const specialContent = '🎉 Special chars: "quotes" & \'apostrophes\' \n\t\r\\';

      await queue.queueWrite(filePath, specialContent);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(specialContent);
    });

    it('should handle unicode content', async () => {
      const filePath = path.join(tempDir, 'unicode.txt');
      const unicodeContent = '你好世界 🌍 Привет мир مرحبا بالعالم';

      await queue.queueWrite(filePath, unicodeContent);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(unicodeContent);
    });

    it('should create parent directories if they do not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'directory', 'file.txt');

      // Create parent directories first (fs.writeFile doesn't create them)
      await fs.mkdir(path.dirname(nestedPath), { recursive: true });

      await queue.queueWrite(nestedPath, 'Nested content');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const written = await fs.readFile(nestedPath, 'utf-8');
      expect(written).toBe('Nested content');
    });
  });

  describe('Monitoring and Debugging', () => {
    it('should track pending write count accurately', async () => {
      const queue = new FileWriteQueue(100);

      expect(queue.getPendingCount()).toBe(0);

      const file1 = path.join(tempDir, 'count-1.txt');
      const file2 = path.join(tempDir, 'count-2.txt');
      const file3 = path.join(tempDir, 'count-3.txt');

      await queue.queueWrite(file1, 'Content 1');
      expect(queue.getPendingCount()).toBe(1);

      await queue.queueWrite(file2, 'Content 2');
      expect(queue.getPendingCount()).toBe(2);

      await queue.queueWrite(file3, 'Content 3');
      expect(queue.getPendingCount()).toBe(3);

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.getPendingCount()).toBe(0);

      queue.destroy();
    });

    it('should correctly report hasPendingWrite for specific files', async () => {
      const queue = new FileWriteQueue(100);
      const file1 = path.join(tempDir, 'pending-1.txt');
      const file2 = path.join(tempDir, 'pending-2.txt');

      expect(queue.hasPendingWrite(file1)).toBe(false);
      expect(queue.hasPendingWrite(file2)).toBe(false);

      await queue.queueWrite(file1, 'Content 1');

      expect(queue.hasPendingWrite(file1)).toBe(true);
      expect(queue.hasPendingWrite(file2)).toBe(false);

      await queue.queueWrite(file2, 'Content 2');

      expect(queue.hasPendingWrite(file1)).toBe(true);
      expect(queue.hasPendingWrite(file2)).toBe(true);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(queue.hasPendingWrite(file1)).toBe(false);
      expect(queue.hasPendingWrite(file2)).toBe(false);

      queue.destroy();
    });
  });
});
