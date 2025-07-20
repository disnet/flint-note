/**
 * Unit tests for vault context functionality through MCP tools
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { FlintNoteServer } from '../../src/server.js';
import { GlobalConfigManager } from '../../src/utils/global-config.js';
import { createTempDirName } from './helpers/test-utils.js';
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

describe('Vault Context via MCP Tools', () => {
  let server: FlintNoteServer;
  let globalConfig: GlobalConfigManager;
  let tempDir: string;
  let vault1Path: string;
  let vault2Path: string;

  before(async () => {
    // Setup temporary directory structure
    tempDir = await createTempDir('vault-context-test');
    vault1Path = path.join(tempDir, 'vault1');
    vault2Path = path.join(tempDir, 'vault2');

    await fs.mkdir(vault1Path, { recursive: true });
    await fs.mkdir(vault2Path, { recursive: true });

    // Set up global config to use temp directory
    process.env.XDG_CONFIG_HOME = tempDir;
    globalConfig = new GlobalConfigManager();
    await globalConfig.load();

    // Create test vaults
    await globalConfig.addVault('vault1', 'Test Vault 1', vault1Path);
    await globalConfig.addVault('vault2', 'Test Vault 2', vault2Path);
    await globalConfig.switchVault('vault1');

    // Initialize server with vault1 as active
    server = new FlintNoteServer({
      workspacePath: vault1Path,
      throwOnError: true
    });
    await server.initialize();
  });

  after(async () => {
    await cleanup(tempDir);
    delete process.env.XDG_CONFIG_HOME;
  });

  it('should initialize with multiple vaults configured', async () => {
    // Test that the server starts with the active vault
    assert(server, 'Server should be initialized');

    // Test that vault directories exist
    try {
      await fs.access(vault1Path);
      await fs.access(vault2Path);
    } catch {
      assert.fail('Vault directories should exist');
    }

    // Test that global config has the vaults
    const vaults = await globalConfig.listVaults();
    assert.strictEqual(vaults.length, 2);
    assert(vaults.some(v => v.info.id === 'vault1'));
    assert(vaults.some(v => v.info.id === 'vault2'));
  });

  it('should have vault1 as the active vault', async () => {
    const vaults = globalConfig.listVaults();
    const currentVault = vaults.find(v => v.is_current);
    assert.strictEqual(currentVault?.info.id, 'vault1');
  });

  it('should handle vault switching', async () => {
    // Switch to vault2
    await globalConfig.switchVault('vault2');

    let vaults = globalConfig.listVaults();
    const currentVault = vaults.find(v => v.is_current);
    assert.strictEqual(currentVault?.info.id, 'vault2');

    // Switch back to vault1
    await globalConfig.switchVault('vault1');

    vaults = globalConfig.listVaults();
    const finalVault = vaults.find(v => v.is_current);
    assert.strictEqual(finalVault?.info.id, 'vault1');
  });
});
