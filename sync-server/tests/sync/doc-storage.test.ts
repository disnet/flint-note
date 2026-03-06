import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import { createTmpDir, cleanupTmpDir } from '../helpers/test-fs.js';
import {
  saveDocBinary,
  loadDocBinary,
  docExists,
  getDocSize,
  countDocs,
  totalDocsSize
} from '../../src/sync/doc-storage.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = createTmpDir();
});

afterEach(() => {
  cleanupTmpDir(tmpDir);
});

describe('saveDocBinary', () => {
  it('creates docs/ subdir and writes .bin file', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    saveDocBinary(tmpDir, 'testdoc', data);

    const filePath = `${tmpDir}/docs/testdoc.bin`;
    expect(fs.existsSync(filePath)).toBe(true);
    const written = new Uint8Array(fs.readFileSync(filePath));
    expect(written).toEqual(data);
  });
});

describe('loadDocBinary', () => {
  it('reads from disk', () => {
    const data = new Uint8Array([10, 20, 30]);
    saveDocBinary(tmpDir, 'doc1', data);

    const loaded = loadDocBinary(tmpDir, 'doc1');
    expect(loaded).toEqual(data);
  });

  it('returns null when doc does not exist', () => {
    const loaded = loadDocBinary(tmpDir, 'nonexistent');
    expect(loaded).toBeNull();
  });
});

describe('docExists', () => {
  it('returns true when doc exists', () => {
    saveDocBinary(tmpDir, 'doc1', new Uint8Array([1]));
    expect(docExists(tmpDir, 'doc1')).toBe(true);
  });

  it('returns false when missing', () => {
    expect(docExists(tmpDir, 'nonexistent')).toBe(false);
  });
});

describe('getDocSize', () => {
  it('returns correct size', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    saveDocBinary(tmpDir, 'sized', data);
    expect(getDocSize(tmpDir, 'sized')).toBe(5);
  });

  it('returns 0 when missing', () => {
    expect(getDocSize(tmpDir, 'missing')).toBe(0);
  });
});

describe('countDocs', () => {
  it('counts .bin files correctly', () => {
    expect(countDocs(tmpDir)).toBe(0);

    saveDocBinary(tmpDir, 'a', new Uint8Array([1]));
    saveDocBinary(tmpDir, 'b', new Uint8Array([2]));
    saveDocBinary(tmpDir, 'c', new Uint8Array([3]));

    expect(countDocs(tmpDir)).toBe(3);
  });

  it('returns 0 for nonexistent directory', () => {
    expect(countDocs('/nonexistent/path')).toBe(0);
  });
});

describe('totalDocsSize', () => {
  it('sums .bin file sizes correctly', () => {
    saveDocBinary(tmpDir, 'x', new Uint8Array([1, 2, 3])); // 3 bytes
    saveDocBinary(tmpDir, 'y', new Uint8Array([4, 5])); // 2 bytes

    expect(totalDocsSize(tmpDir)).toBe(5);
  });

  it('returns 0 for nonexistent directory', () => {
    expect(totalDocsSize('/nonexistent/path')).toBe(0);
  });
});
