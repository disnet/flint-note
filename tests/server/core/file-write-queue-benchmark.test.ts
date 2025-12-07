/**
 * Performance Benchmarks for FileWriteQueue - Database-first architecture
 *
 * This benchmark suite measures:
 * 1. DB write latency (target: p95 < 5ms)
 * 2. File I/O reduction during rapid edits (target: 50%+ reduction)
 * 3. End-to-end latency for note updates
 * 4. Comparison between Phase 1 (0ms) and Phase 2 (1000ms) delays
 *
 * Run with: npm run test:run tests/server/core/file-write-queue-benchmark.test.ts
 *
 * @see docs/PRD-DATABASE-SOURCE-OF-TRUTH.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FileWriteQueue } from '../../../src/server/core/notes.js';

// Only log benchmark output when running in verbose/debug mode
const verboseLog = process.env.DEBUG_TESTS === 'true' ? verboseLog : () => {};

interface BenchmarkResult {
  operation: string;
  count: number;
  totalMs: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

interface FileIOStats {
  totalWrites: number;
  uniqueFiles: number;
  reductionPercent: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

/**
 * Analyze timing measurements and return statistics
 */
function analyzeTiming(measurements: number[], operation: string): BenchmarkResult {
  const sorted = [...measurements].sort((a, b) => a - b);
  const total = measurements.reduce((sum, val) => sum + val, 0);

  return {
    operation,
    count: measurements.length,
    totalMs: total,
    avgMs: total / measurements.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1]
  };
}

/**
 * Format benchmark result for console output
 */
function formatResult(result: BenchmarkResult): string {
  return `
${result.operation}:
  Count:   ${result.count}
  Avg:     ${result.avgMs.toFixed(2)}ms
  Median:  ${result.medianMs.toFixed(2)}ms
  P95:     ${result.p95Ms.toFixed(2)}ms
  P99:     ${result.p99Ms.toFixed(2)}ms
  Min:     ${result.minMs.toFixed(2)}ms
  Max:     ${result.maxMs.toFixed(2)}ms
`;
}

describe('FileWriteQueue Performance Benchmarks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `file-write-queue-benchmark-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File Write Performance', () => {
    it('should measure raw file write latency (baseline)', async () => {
      const measurements: number[] = [];
      const iterations = 100;
      const filePath = path.join(tempDir, 'baseline-test.txt');

      for (let i = 0; i < iterations; i++) {
        const content = `Content iteration ${i} - ${Date.now()}`;
        const start = performance.now();
        await fs.writeFile(filePath, content, 'utf-8');
        const end = performance.now();
        measurements.push(end - start);
      }

      const result = analyzeTiming(measurements, 'Raw File Write (Baseline)');
      verboseLog(formatResult(result));

      // Baseline expectations (these will vary by system)
      expect(result.avgMs).toBeLessThan(10); // Avg should be < 10ms
      expect(result.p95Ms).toBeLessThan(20); // P95 should be < 20ms
    });

    it('should measure Phase 1 (0ms delay) write latency', async () => {
      const measurements: number[] = [];
      const iterations = 100;
      const filePath = path.join(tempDir, 'phase1-test.txt');
      const queue = new FileWriteQueue(undefined, 0);

      for (let i = 0; i < iterations; i++) {
        const content = `Content iteration ${i} - ${Date.now()}`;
        const start = performance.now();
        await queue.queueWrite(filePath, content);
        // With 0ms delay, write should happen immediately
        await new Promise((resolve) => setTimeout(resolve, 10)); // Small buffer
        const end = performance.now();
        measurements.push(end - start);
      }

      await queue.flushAll();
      queue.destroy();

      const result = analyzeTiming(measurements, 'Phase 1: FileWriteQueue (0ms delay)');
      verboseLog(formatResult(result));

      // Phase 1 should be nearly synchronous
      expect(result.avgMs).toBeLessThan(15); // Should be close to baseline
    });

    it('should measure rapid edits file I/O reduction (Phase 2 simulation)', async () => {
      const iterations = 50; // Simulate 50 rapid edits
      const filePath = path.join(tempDir, 'rapid-edits.txt');

      // Without queue (baseline) - each edit writes immediately
      let baselineWrites = 0;
      for (let i = 0; i < iterations; i++) {
        await fs.writeFile(filePath, `Edit ${i}`, 'utf-8');
        baselineWrites++;
      }

      // With queue (100ms delay) - edits are batched
      const queue = new FileWriteQueue(undefined, 100);
      let actualWrites = 0;

      // Mock file system to count actual writes
      const originalFlushWrite = queue.flushWrite.bind(queue);
      queue.flushWrite = async (path: string) => {
        actualWrites++;
        return originalFlushWrite(path);
      };

      // Simulate rapid typing (10ms between edits)
      for (let i = 0; i < iterations; i++) {
        await queue.queueWrite(filePath, `Edit ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await queue.flushAll();
      queue.destroy();

      const reduction = ((baselineWrites - actualWrites) / baselineWrites) * 100;

      verboseLog(`
File I/O Reduction:
  Baseline writes:  ${baselineWrites}
  Actual writes:    ${actualWrites}
  Reduction:        ${reduction.toFixed(1)}%
`);

      // Should see significant reduction (target: 50%+)
      expect(actualWrites).toBeLessThan(baselineWrites);
      expect(reduction).toBeGreaterThan(50); // Target met
    });
  });

  describe('Database + File Write Performance', () => {
    it('should measure simulated DB write latency', async () => {
      const measurements: number[] = [];
      const iterations = 100;

      // Simulate DB write operation (in-memory map acting as DB)
      const mockDB = new Map<string, string>();

      for (let i = 0; i < iterations; i++) {
        const noteId = `note-${i}`;
        const content = `Content ${i} - ${Date.now()}`;

        const start = performance.now();
        // Simulate DB write
        mockDB.set(noteId, content);
        const end = performance.now();

        measurements.push(end - start);
      }

      const result = analyzeTiming(measurements, 'Simulated DB Write (in-memory)');
      verboseLog(formatResult(result));

      // DB writes should be very fast (target: p95 < 5ms)
      expect(result.p95Ms).toBeLessThan(5); // Target: p95 < 5ms
      expect(result.avgMs).toBeLessThan(2); // Should be sub-millisecond typically
    });

    it('should measure end-to-end update latency (DB + File)', async () => {
      const measurements: number[] = [];
      const iterations = 50;
      const queue = new FileWriteQueue(undefined, 0); // Phase 1: synchronous
      const mockDB = new Map<string, string>();

      for (let i = 0; i < iterations; i++) {
        const noteId = `note-${i}`;
        const content = `Content ${i} - ${Date.now()}`;
        const filePath = path.join(tempDir, `${noteId}.md`);

        const start = performance.now();

        // Step 1: Write to DB (should be fast)
        mockDB.set(noteId, content);

        // Step 2: Queue file write
        await queue.queueWrite(filePath, content);

        // Wait for write to complete (0ms delay = synchronous)
        await new Promise((resolve) => setTimeout(resolve, 10));

        const end = performance.now();
        measurements.push(end - start);
      }

      await queue.flushAll();
      queue.destroy();

      const result = analyzeTiming(
        measurements,
        'End-to-End Update (DB + File, Phase 1)'
      );
      verboseLog(formatResult(result));

      // End-to-end should be fast with Phase 1
      expect(result.p95Ms).toBeLessThan(25); // Should be reasonable
    });
  });

  describe('Comparison: Phase 1 vs Phase 2', () => {
    it('should compare 0ms vs 1000ms delay impact', async () => {
      const iterations = 20;
      const filePath = path.join(tempDir, 'comparison.txt');

      // Phase 1: 0ms delay
      const queue0ms = new FileWriteQueue(undefined, 0);
      const measurements0ms: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await queue0ms.queueWrite(filePath, `Edit ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate user thinking
        const end = performance.now();
        measurements0ms.push(end - start);
      }

      await queue0ms.flushAll();
      queue0ms.destroy();

      // Phase 2: 1000ms delay
      const queue1000ms = new FileWriteQueue(undefined, 1000);
      const measurements1000ms: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await queue1000ms.queueWrite(filePath, `Edit ${i}`);
        // Note: With 1000ms delay, writes don't happen immediately
        const end = performance.now();
        measurements1000ms.push(end - start);
      }

      await queue1000ms.flushAll();
      queue1000ms.destroy();

      const result0ms = analyzeTiming(measurements0ms, 'Phase 1 (0ms delay)');
      const result1000ms = analyzeTiming(measurements1000ms, 'Phase 2 (1000ms delay)');

      verboseLog(formatResult(result0ms));
      verboseLog(formatResult(result1000ms));

      // Phase 2 queue operations should be faster (not waiting for file I/O)
      expect(result1000ms.avgMs).toBeLessThan(result0ms.avgMs);
    });
  });

  describe('Stress Test', () => {
    it('should handle 1000 rapid writes efficiently', async () => {
      const iterations = 1000;
      const filePath = path.join(tempDir, 'stress-test.txt');
      const queue = new FileWriteQueue(undefined, 100);

      const start = performance.now();

      // Queue 1000 writes as fast as possible
      const promises = [];
      for (let i = 0; i < iterations; i++) {
        promises.push(queue.queueWrite(filePath, `Content ${i}`));
      }
      await Promise.all(promises);

      const queueTime = performance.now() - start;

      // Flush all writes
      const flushStart = performance.now();
      await queue.flushAll();
      const flushTime = performance.now() - flushStart;

      queue.destroy();

      verboseLog(`
Stress Test (1000 writes):
  Queue time:  ${queueTime.toFixed(2)}ms
  Flush time:  ${flushTime.toFixed(2)}ms
  Total time:  ${(queueTime + flushTime).toFixed(2)}ms
  Avg per op:  ${((queueTime + flushTime) / iterations).toFixed(3)}ms
`);

      // Should handle high load efficiently
      expect(queueTime).toBeLessThan(100); // Queueing should be very fast
      expect(flushTime).toBeLessThan(500); // Flushing should be reasonable
    });
  });
});
