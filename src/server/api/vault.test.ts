/**
 * Tests for FlintNoteApi vault creation and removal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlintNoteApi } from './flint-note-api.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('FlintNoteApi - Vault Operations', () => {
  let api: FlintNoteApi;
  let testWorkspacePath: string;
  let createdVaultIds: string[] = [];

  beforeEach(async () => {
    // Create a temporary directory for testing
    testWorkspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'flint-test-'));

    // Initialize API with the test workspace path
    api = new FlintNoteApi({
      workspacePath: testWorkspacePath
    });

    await api.initialize();
  });

  afterEach(async () => {
    // Clean up created vaults from the global config
    for (const vaultId of createdVaultIds) {
      try {
        await api.removeVault({ id: vaultId });
      } catch (error) {
        // Vault might already be removed, ignore error
        console.warn(`Failed to remove vault ${vaultId}:`, error);
      }
    }

    // Reset the created vaults array
    createdVaultIds = [];

    // Clean up temporary directory
    try {
      await fs.rm(testWorkspacePath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error);
    }
  });

  describe('createVault', () => {
    it('should create a new vault with valid parameters', async () => {
      const vaultConfig = {
        id: 'test-vault-1',
        name: 'Test Vault 1',
        path: path.join(testWorkspacePath, 'vault1'),
        description: 'A test vault',
        initialize: true,
        switch_to: false
      };

      const createdVault = await api.createVault(vaultConfig);
      createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();
      expect(createdVault.id).toBe(vaultConfig.id);
      expect(createdVault.name).toBe(vaultConfig.name);
      expect(createdVault.description).toBe(vaultConfig.description);

      // Verify that the vault directory was created
      const vaultExists = await fs
        .access(vaultConfig.path)
        .then(() => true)
        .catch(() => false);
      expect(vaultExists).toBe(true);

      // Verify that the vault appears in the list of vaults
      const vaults = await api.listVaults();
      const foundVault = vaults.find((v) => v.id === vaultConfig.id);
      expect(foundVault).toBeDefined();
    });

    it('should reject invalid vault IDs', async () => {
      const invalidVaultConfig = {
        id: 'invalid vault id!', // Contains spaces and special characters
        name: 'Invalid Vault',
        path: path.join(testWorkspacePath, 'invalid-vault'),
        description: 'This should fail'
      };

      await expect(api.createVault(invalidVaultConfig)).rejects.toThrow(
        /Invalid vault ID/
      );
    });

    it('should reject duplicate vault IDs', async () => {
      const vaultConfig = {
        id: 'duplicate-vault',
        name: 'First Vault',
        path: path.join(testWorkspacePath, 'first-vault'),
        description: 'First vault'
      };

      // Create the first vault
      await api.createVault(vaultConfig);
      createdVaultIds.push(vaultConfig.id);

      // Try to create a vault with the same ID
      const duplicateConfig = {
        id: 'duplicate-vault',
        name: 'Second Vault',
        path: path.join(testWorkspacePath, 'second-vault'),
        description: 'This should fail'
      };

      await expect(api.createVault(duplicateConfig)).rejects.toThrow(
        /Vault with ID.*already exists/
      );
    });

    it('should initialize vault with default note types when initialize=true', async () => {
      const vaultConfig = {
        id: 'initialized-vault',
        name: 'Initialized Vault',
        path: path.join(testWorkspacePath, 'initialized-vault'),
        description: 'A vault that should be initialized',
        initialize: true,
        switch_to: false
      };

      await api.createVault(vaultConfig);
      createdVaultIds.push(vaultConfig.id);

      // Check that .flint-note directory was created
      const flintNoteDir = path.join(vaultConfig.path, '.flint-note');
      const flintNoteDirExists = await fs
        .access(flintNoteDir)
        .then(() => true)
        .catch(() => false);
      expect(flintNoteDirExists).toBe(true);

      // Check that initialization files were created
      const files = await fs.readdir(flintNoteDir);
      expect(files.length).toBeGreaterThan(0);

      // Should have at least config.yml from initialization
      expect(files).toContain('config.yml');
    });
  });

  describe('removeVault', () => {
    it('should remove an existing vault from the registry', async () => {
      const vaultConfig = {
        id: 'vault-to-remove',
        name: 'Vault To Remove',
        path: path.join(testWorkspacePath, 'vault-to-remove'),
        description: 'This vault will be removed',
        switch_to: false
      };

      // Create the vault first
      await api.createVault(vaultConfig);
      createdVaultIds.push(vaultConfig.id);

      // Verify it exists
      const vaultsBefore = await api.listVaults();
      const foundBefore = vaultsBefore.find((v) => v.id === vaultConfig.id);
      expect(foundBefore).toBeDefined();

      // Remove the vault
      await api.removeVault({ id: vaultConfig.id });

      // Remove from our cleanup list since it's already removed
      createdVaultIds = createdVaultIds.filter((id) => id !== vaultConfig.id);

      // Verify it's no longer in the list
      const vaultsAfter = await api.listVaults();
      const foundAfter = vaultsAfter.find((v) => v.id === vaultConfig.id);
      expect(foundAfter).toBeUndefined();

      // Verify that the files still exist (removeVault doesn't delete files)
      const vaultPathExists = await fs
        .access(vaultConfig.path)
        .then(() => true)
        .catch(() => false);
      expect(vaultPathExists).toBe(true);
    });

    it('should reject removal of non-existent vault', async () => {
      await expect(api.removeVault({ id: 'non-existent-vault' })).rejects.toThrow(
        /Vault with ID.*does not exist/
      );
    });
  });

  describe('vault lifecycle integration', () => {
    it('should create, list, and remove vault successfully', async () => {
      const vaultId = 'lifecycle-test-vault';
      const vaultConfig = {
        id: vaultId,
        name: 'Lifecycle Test Vault',
        path: path.join(testWorkspacePath, 'lifecycle-vault'),
        description: 'Testing the full lifecycle',
        switch_to: false
      };

      // 1. Create vault
      const createdVault = await api.createVault(vaultConfig);
      createdVaultIds.push(vaultId);
      expect(createdVault.id).toBe(vaultId);

      // 2. List vaults and verify it's there
      const vaults = await api.listVaults();
      const foundVault = vaults.find((v) => v.id === vaultId);
      expect(foundVault).toBeDefined();
      expect(foundVault?.name).toBe(vaultConfig.name);
      expect(foundVault?.description).toBe(vaultConfig.description);

      // 3. Remove vault
      await api.removeVault({ id: vaultId });
      createdVaultIds = createdVaultIds.filter((id) => id !== vaultId);

      // 4. Verify it's no longer in the list
      const vaultsAfterRemoval = await api.listVaults();
      const foundAfterRemoval = vaultsAfterRemoval.find((v) => v.id === vaultId);
      expect(foundAfterRemoval).toBeUndefined();
    });
  });
});
