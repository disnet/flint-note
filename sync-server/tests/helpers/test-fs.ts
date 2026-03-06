import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flint-test-'));
}

export function cleanupTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
