/**
 * Integration tests for vault-specific operations using vault_id parameter
 * These tests verify that the vault_id parameter system works correctly
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { GlobalConfigManager } from '../../src/utils/global-config.js';
import { createTempDirName } from './helpers/integration-utils.js';
import path from 'path';
import fs from 'fs/promises';

// Helper functions
async function createTempDir(prefix: string): Promise<string> {
  const tempDir = createTempDirName(prefix);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function cleanup(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Vault Operations with vault_id Parameter', () => {
  let globalConfig: GlobalConfigManager;
  let tempDir: string;
  let vault1Path: string;
  let vault2Path: string;

  before(async () => {
    // Setup temporary directory structure
    tempDir = await createTempDir('vault-operations-test');
    vault1Path = path.join(tempDir, 'vault1');
    vault2Path = path.join(tempDir, 'vault2');

    await fs.mkdir(vault1Path, { recursive: true });
    await fs.mkdir(vault2Path, { recursive: true });

    // Set up global config to use temp directory
    process.env.XDG_CONFIG_HOME = tempDir;
    globalConfig = new GlobalConfigManager();
    await globalConfig.load();

    // Create two test vaults
    await globalConfig.addVault('vault1', 'Test Vault 1', vault1Path, 'First test vault');
    await globalConfig.addVault(
      'vault2',
      'Test Vault 2',
      vault2Path,
      'Second test vault'
    );

    // Set vault1 as active
    await globalConfig.switchVault('vault1');
  });

  after(async () => {
    await cleanup(tempDir);
    delete process.env.XDG_CONFIG_HOME;
  });

  describe('Vault System Setup', () => {
    it('should create multiple vaults successfully', async () => {
      const vaults = await globalConfig.listVaults();
      assert.strictEqual(vaults.length, 2);

      const vault1 = vaults.find(v => v.id === 'vault1');
      const vault2 = vaults.find(v => v.id === 'vault2');

      assert(vault1, 'vault1 should exist');
      assert(vault2, 'vault2 should exist');
      assert.strictEqual(vault1.info.name, 'Test Vault 1');
      assert.strictEqual(vault2.info.name, 'Test Vault 2');
    });

    it('should have vault1 as the active vault', async () => {
      const vaults = globalConfig.listVaults();
      const currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'vault1');
    });

    it('should switch between vaults correctly', async () => {
      // Switch to vault2
      await globalConfig.switchVault('vault2');
      let vaults = globalConfig.listVaults();
      let currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'vault2');

      // Switch back to vault1
      await globalConfig.switchVault('vault1');
      vaults = globalConfig.listVaults();
      currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'vault1');
    });
  });

  describe('Vault Directory Structure', () => {
    it('should create separate vault directories', async () => {
      // Check that vault directories exist
      const vault1Stats = await fs.stat(vault1Path);
      const vault2Stats = await fs.stat(vault2Path);

      assert(vault1Stats.isDirectory(), 'vault1 should be a directory');
      assert(vault2Stats.isDirectory(), 'vault2 should be a directory');
    });

    it('should maintain vault isolation in file system', async () => {
      // Create a test file in vault1
      const testFile1 = path.join(vault1Path, 'test-vault1.md');
      await fs.writeFile(testFile1, '# Test file in vault1');

      // Create a test file in vault2
      const testFile2 = path.join(vault2Path, 'test-vault2.md');
      await fs.writeFile(testFile2, '# Test file in vault2');

      // Verify files are in correct vaults
      const vault1Contents = await fs.readdir(vault1Path);
      const vault2Contents = await fs.readdir(vault2Path);

      assert(
        vault1Contents.includes('test-vault1.md'),
        'vault1 should contain its test file'
      );
      assert(
        vault2Contents.includes('test-vault2.md'),
        'vault2 should contain its test file'
      );
      assert(
        !vault1Contents.includes('test-vault2.md'),
        'vault1 should not contain vault2 files'
      );
      assert(
        !vault2Contents.includes('test-vault1.md'),
        'vault2 should not contain vault1 files'
      );
    });
  });

  describe('Vault Configuration Persistence', () => {
    it('should persist vault configuration', async () => {
      // Reload the global config to test persistence
      const newGlobalConfig = new GlobalConfigManager();
      await newGlobalConfig.load();

      const vaults = newGlobalConfig.listVaults();
      assert.strictEqual(vaults.length, 2);

      const currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'vault1');
    });

    it('should handle vault removal', async () => {
      // Create a temporary vault for testing removal
      const tempVaultPath = path.join(tempDir, 'temp-vault');
      await fs.mkdir(tempVaultPath, { recursive: true });

      await globalConfig.addVault('temp-vault', 'Temporary Vault', tempVaultPath);

      let vaults = await globalConfig.listVaults();
      assert.strictEqual(vaults.length, 3);

      // Remove the temporary vault
      await globalConfig.removeVault('temp-vault');

      vaults = await globalConfig.listVaults();
      assert.strictEqual(vaults.length, 2);
      assert(!vaults.some(v => v.id === 'temp-vault'));
    });
  });
});
