/**
 * Tests for FlintNoteApi vault creation and removal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import fs from 'fs/promises';
import path from 'path';

// Helper function to recursively list all files
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string, basePath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        await walk(fullPath, basePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  try {
    await walk(dir, dir);
  } catch (error) {
    console.log('Error reading directory:', error);
  }

  return files.sort();
}

describe('FlintNoteApi - Vault Operations', () => {
  let testSetup: TestApiSetup;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('createVault', () => {
    it('should create a new vault with valid parameters', async () => {
      const vaultConfig = {
        id: 'test-vault-1',
        name: 'Test Vault 1',
        path: path.join(testSetup.testWorkspacePath, 'vault1'),
        description: 'A test vault',
        initialize: true,
        skipTemplate: true,
        switch_to: false
      };

      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

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
      const vaults = await testSetup.api.listVaults();
      const foundVault = vaults.find((v) => v.id === vaultConfig.id);
      expect(foundVault).toBeDefined();
    });

    it('should reject invalid vault IDs', async () => {
      const invalidVaultConfig = {
        id: 'invalid vault id!', // Contains spaces and special characters
        name: 'Invalid Vault',
        path: path.join(testSetup.testWorkspacePath, 'invalid-vault'),
        description: 'This should fail'
      };

      await expect(testSetup.api.createVault(invalidVaultConfig)).rejects.toThrow(
        /Invalid vault ID/
      );
    });

    it('should reject duplicate vault IDs', async () => {
      const vaultConfig = {
        id: 'duplicate-vault',
        name: 'First Vault',
        path: path.join(testSetup.testWorkspacePath, 'first-vault'),
        description: 'First vault',
        skipTemplate: true
      };

      // Create the first vault
      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Try to create a vault with the same ID
      const duplicateConfig = {
        id: 'duplicate-vault',
        name: 'Second Vault',
        path: path.join(testSetup.testWorkspacePath, 'second-vault'),
        description: 'This should fail'
      };

      await expect(testSetup.api.createVault(duplicateConfig)).rejects.toThrow(
        /Vault with ID.*already exists/
      );
    });

    it('should initialize vault with default note types when initialize=true', async () => {
      const vaultConfig = {
        id: 'initialized-vault',
        name: 'Initialized Vault',
        path: path.join(testSetup.testWorkspacePath, 'initialized-vault'),
        description: 'A vault that should be initialized',
        initialize: true,
        skipTemplate: true,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

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

    it.skip('should create onboarding content when initializing a new vault', async () => {
      // This test is skipped because it requires template functionality
      // Template files aren't available during test execution
      const vaultConfig = {
        id: 'onboarding-vault',
        name: 'Onboarding Test Vault',
        path: path.join(testSetup.testWorkspacePath, 'onboarding-vault'),
        description: 'A vault that should contain onboarding content',
        initialize: true,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Check that onboarding content files were created
      // Note: filenames are generated using kebab-case from titles
      const expectedFiles = [
        'note/welcome-to-flint.md',
        'note/tutorial-1-your-first-daily-note.md',
        'note/tutorial-2-connecting-ideas-with-wikilinks.md',
        'note/tutorial-3-your-ai-assistant-in-action.md',
        'note/tutorial-4-understanding-note-types.md'
      ];

      for (const expectedFile of expectedFiles) {
        const filePath = path.join(vaultConfig.path, expectedFile);
        const fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);

        // Verify file has content
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }

      // Verify that note type descriptions exist
      const flintNoteDir = path.join(vaultConfig.path, '.flint-note');
      const files = await fs.readdir(flintNoteDir);
      const descriptions = files.filter((f) => f.endsWith('_description.md'));
      expect(descriptions.length).toBeGreaterThan(0);
    });
  });

  describe('removeVault', () => {
    it('should remove an existing vault from the registry', async () => {
      const vaultConfig = {
        id: 'vault-to-remove',
        name: 'Vault To Remove',
        path: path.join(testSetup.testWorkspacePath, 'vault-to-remove'),
        description: 'This vault will be removed',
        skipTemplate: true,
        switch_to: false
      };

      // Create the vault first
      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Verify it exists
      const vaultsBefore = await testSetup.api.listVaults();
      const foundBefore = vaultsBefore.find((v) => v.id === vaultConfig.id);
      expect(foundBefore).toBeDefined();

      // Remove the vault
      await testSetup.api.removeVault({ id: vaultConfig.id });

      // Remove from our cleanup list since it's already removed
      testSetup.createdVaultIds = testSetup.createdVaultIds.filter(
        (id) => id !== vaultConfig.id
      );

      // Verify it's no longer in the list
      const vaultsAfter = await testSetup.api.listVaults();
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
      await expect(
        testSetup.api.removeVault({ id: 'non-existent-vault' })
      ).rejects.toThrow(/Vault with ID.*does not exist/);
    });
  });

  describe('vault lifecycle integration', () => {
    it('should create, list, and remove vault successfully', async () => {
      const vaultId = 'lifecycle-test-vault';
      const vaultConfig = {
        id: vaultId,
        name: 'Lifecycle Test Vault',
        path: path.join(testSetup.testWorkspacePath, 'lifecycle-vault'),
        description: 'Testing the full lifecycle',
        skipTemplate: true,
        switch_to: false
      };

      // 1. Create vault
      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultId);
      expect(createdVault.id).toBe(vaultId);

      // 2. List vaults and verify it's there
      const vaults = await testSetup.api.listVaults();
      const foundVault = vaults.find((v) => v.id === vaultId);
      expect(foundVault).toBeDefined();
      expect(foundVault?.name).toBe(vaultConfig.name);
      expect(foundVault?.description).toBe(vaultConfig.description);

      // 3. Remove vault
      await testSetup.api.removeVault({ id: vaultId });
      testSetup.createdVaultIds = testSetup.createdVaultIds.filter(
        (id) => id !== vaultId
      );

      // 4. Verify it's no longer in the list
      const vaultsAfterRemoval = await testSetup.api.listVaults();
      const foundAfterRemoval = vaultsAfterRemoval.find((v) => v.id === vaultId);
      expect(foundAfterRemoval).toBeUndefined();
    });
  });
});
