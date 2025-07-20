/**
 * Unit tests for GlobalConfigManager
 * Tests vault registry, platform-specific config directories, and vault management
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { GlobalConfigManager } from '../../src/utils/global-config.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('GlobalConfigManager', () => {
  let originalConfigDir: string | undefined;

  beforeEach(async () => {
    // Mock the config directory to use temp directory
    originalConfigDir = process.env.XDG_CONFIG_HOME;
  });

  afterEach(async () => {
    // Restore original config directory
    if (originalConfigDir !== undefined) {
      process.env.XDG_CONFIG_HOME = originalConfigDir;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  async function createTestConfig(): Promise<{
    globalConfig: GlobalConfigManager;
    tempDir: string;
    cleanup: () => void;
  }> {
    // Create unique temporary directory for each test
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flint-note-global-test-'));

    // Store original env var
    const originalXDGConfigHome = process.env.XDG_CONFIG_HOME;

    // Set test-specific env var
    process.env.XDG_CONFIG_HOME = tempDir;

    const globalConfig = new GlobalConfigManager();

    const cleanup = () => {
      // Restore original env var
      if (originalXDGConfigHome !== undefined) {
        process.env.XDG_CONFIG_HOME = originalXDGConfigHome;
      } else {
        delete process.env.XDG_CONFIG_HOME;
      }
    };

    return { globalConfig, tempDir, cleanup };
  }

  async function cleanupTestConfig(tempDir: string, cleanup: () => void): Promise<void> {
    cleanup();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  test('should get platform-specific configuration directory', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      const configDir = globalConfig.getPlatformConfigDir();
      assert.ok(
        configDir.includes('flint-note'),
        'Config directory should contain flint-note'
      );
      assert.ok(path.isAbsolute(configDir), 'Config directory should be absolute path');
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should create default configuration when none exists', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      const config = await globalConfig.load();

      assert.strictEqual(config.version, '1.0.0');
      assert.strictEqual(config.current_vault, null);
      assert.deepStrictEqual(config.vaults, {});
      assert.ok(config.settings);
      assert.strictEqual(typeof config.settings.auto_switch_on_create, 'boolean');
      assert.strictEqual(typeof config.settings.max_recent_vaults, 'number');
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should validate vault IDs correctly', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      // Valid IDs
      assert.ok(globalConfig.isValidVaultId('valid-id'));
      assert.ok(globalConfig.isValidVaultId('valid_id'));
      assert.ok(globalConfig.isValidVaultId('valid123'));
      assert.ok(globalConfig.isValidVaultId('Valid-ID_123'));

      // Invalid IDs
      assert.ok(!globalConfig.isValidVaultId(''));
      assert.ok(!globalConfig.isValidVaultId('invalid id')); // spaces
      assert.ok(!globalConfig.isValidVaultId('invalid/id')); // slash
      assert.ok(!globalConfig.isValidVaultId('invalid\\id')); // backslash
      assert.ok(!globalConfig.isValidVaultId('invalid.id')); // dot
      assert.ok(!globalConfig.isValidVaultId('config')); // reserved
      assert.ok(!globalConfig.isValidVaultId('cache')); // reserved
      assert.ok(!globalConfig.isValidVaultId('a'.repeat(65))); // too long
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should add vault to registry', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      // Create a test vault directory
      const vaultPath = path.join(tempDir, 'test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault('test', 'Test Vault', vaultPath, 'A test vault');

      const vault = globalConfig.getVault('test');
      assert.ok(vault);
      assert.strictEqual(vault.name, 'Test Vault');
      assert.strictEqual(vault.path, path.resolve(vaultPath));
      assert.strictEqual(vault.description, 'A test vault');
      assert.ok(vault.created);
      assert.ok(vault.last_accessed);

      // Should be set as current vault since it's the first one
      assert.strictEqual(globalConfig.getCurrentVaultPath(), path.resolve(vaultPath));
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should not add vault with invalid ID', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await assert.rejects(
        () => globalConfig.addVault('invalid id', 'Test', vaultPath),
        /Invalid vault ID/
      );
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should not add vault with duplicate ID', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'test-vault-duplicate');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault('duplicate-test', 'Test Vault', vaultPath);

      await assert.rejects(
        () => globalConfig.addVault('duplicate-test', 'Another Vault', vaultPath),
        /already exists/
      );
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should not add vault with non-existent path', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      await assert.rejects(
        () => globalConfig.addVault('nonexistent-test', 'Test', nonExistentPath),
        /does not exist/
      );
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should switch between vaults', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      // Create two test vaults
      const vault1Path = path.join(tempDir, 'vault1');
      const vault2Path = path.join(tempDir, 'vault2');
      await fs.mkdir(vault1Path, { recursive: true });
      await fs.mkdir(vault2Path, { recursive: true });

      await globalConfig.addVault('vault1', 'Vault 1', vault1Path);
      await globalConfig.addVault('vault2', 'Vault 2', vault2Path);

      // Switch to vault2
      await globalConfig.switchVault('vault2');
      assert.strictEqual(globalConfig.getCurrentVaultPath(), path.resolve(vault2Path));

      // Switch back to vault1
      await globalConfig.switchVault('vault1');
      assert.strictEqual(globalConfig.getCurrentVaultPath(), path.resolve(vault1Path));
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should remove vault from registry', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'remove-test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault('remove-test', 'Test Vault', vaultPath);
      assert.ok(globalConfig.hasVault('remove-test'));

      await globalConfig.removeVault('remove-test');
      assert.ok(!globalConfig.hasVault('remove-test'));
      assert.strictEqual(globalConfig.getCurrentVaultPath(), null);
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should update vault information', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'update-test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault(
        'update-test',
        'Test Vault',
        vaultPath,
        'Original description'
      );

      await globalConfig.updateVault('update-test', {
        name: 'Updated Vault',
        description: 'Updated description'
      });

      const vault = globalConfig.getVault('update-test');
      assert.ok(vault);
      assert.strictEqual(vault.name, 'Updated Vault');
      assert.strictEqual(vault.description, 'Updated description');
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should list vaults with current status', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vault1Path = path.join(tempDir, 'list-vault1');
      const vault2Path = path.join(tempDir, 'list-vault2');
      await fs.mkdir(vault1Path, { recursive: true });
      await fs.mkdir(vault2Path, { recursive: true });

      await globalConfig.addVault('list-vault1', 'Vault 1', vault1Path);
      await globalConfig.addVault('list-vault2', 'Vault 2', vault2Path);

      const vaults = globalConfig.listVaults();
      assert.strictEqual(vaults.length, 2);

      const vault1 = vaults.find(v => v.info.id === 'list-vault1');
      const vault2 = vaults.find(v => v.info.id === 'list-vault2');

      assert.ok(vault1);
      assert.ok(vault2);

      // One should be current (the last one added due to auto_switch_on_create default)
      const currentVaults = vaults.filter(v => v.is_current);
      assert.strictEqual(currentVaults.length, 1);
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should get recent vaults sorted by last accessed', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      // Create vaults
      const vault1Path = path.join(tempDir, 'recent-vault1');
      const vault2Path = path.join(tempDir, 'recent-vault2');
      const vault3Path = path.join(tempDir, 'recent-vault3');
      await fs.mkdir(vault1Path, { recursive: true });
      await fs.mkdir(vault2Path, { recursive: true });
      await fs.mkdir(vault3Path, { recursive: true });

      await globalConfig.addVault('recent-vault1', 'Vault 1', vault1Path);
      await globalConfig.addVault('recent-vault2', 'Vault 2', vault2Path);
      await globalConfig.addVault('recent-vault3', 'Vault 3', vault3Path);

      // Access vaults in specific order with delays to ensure timestamp differences
      await globalConfig.switchVault('recent-vault1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await globalConfig.switchVault('recent-vault3');
      await new Promise(resolve => setTimeout(resolve, 10));
      await globalConfig.switchVault('recent-vault2');

      const recentVaults = globalConfig.getRecentVaults();
      assert.strictEqual(recentVaults.length, 3);
      assert.strictEqual(recentVaults[0].info.id, 'recent-vault2'); // Most recent
      assert.strictEqual(recentVaults[1].info.id, 'recent-vault3');
      assert.strictEqual(recentVaults[2].info.id, 'recent-vault1'); // Least recent
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should persist and reload configuration', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'persist-test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault(
        'persist-test',
        'Test Vault',
        vaultPath,
        'Test description'
      );

      // Create new instance and load
      const newGlobalConfig = new GlobalConfigManager();
      await newGlobalConfig.load();

      const vault = newGlobalConfig.getVault('persist-test');
      assert.ok(vault);
      assert.strictEqual(vault.name, 'Test Vault');
      assert.strictEqual(vault.description, 'Test description');
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should handle configuration validation errors', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      // Manually corrupt the configuration
      const corruptConfig = {
        version: '1.0.0',
        current_vault: 'non-existent',
        vaults: {},
        settings: {}
      };

      // Write corrupt config
      const configPath = globalConfig.getConfigPath();
      await fs.writeFile(configPath, JSON.stringify(corruptConfig));

      // Should throw validation error
      const newGlobalConfig = new GlobalConfigManager();
      await assert.rejects(
        () => newGlobalConfig.load(),
        /does not exist in vault registry/
      );
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should export and import configuration as JSON', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'export-test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault('export-test', 'Test Vault', vaultPath);

      const jsonConfig = globalConfig.toJSON();
      assert.ok(jsonConfig);

      const newGlobalConfig = new GlobalConfigManager();
      await newGlobalConfig.fromJSON(jsonConfig);

      const vault = newGlobalConfig.getVault('export-test');
      assert.ok(vault);
      assert.strictEqual(vault.name, 'Test Vault');
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });

  test('should reset configuration to defaults', async () => {
    const { globalConfig, tempDir, cleanup } = await createTestConfig();
    try {
      await globalConfig.load();

      const vaultPath = path.join(tempDir, 'reset-test-vault');
      await fs.mkdir(vaultPath, { recursive: true });

      await globalConfig.addVault('reset-test', 'Test Vault', vaultPath);
      assert.ok(globalConfig.hasVault('reset-test'));

      await globalConfig.reset();
      assert.ok(!globalConfig.hasVault('reset-test'));
      assert.strictEqual(globalConfig.getCurrentVaultPath(), null);
    } finally {
      await cleanupTestConfig(tempDir, cleanup);
    }
  });
});
