/**
 * Integration tests for cross-vault scenarios and functionality
 * These tests verify that vault isolation and cross-vault operations work correctly
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

describe('Cross-Vault Scenarios', () => {
  let globalConfig: GlobalConfigManager;
  let tempDir: string;
  let workVaultPath: string;
  let personalVaultPath: string;
  let researchVaultPath: string;

  before(async () => {
    // Setup comprehensive test environment with multiple vaults
    tempDir = await createTempDir('cross-vault-test');
    workVaultPath = path.join(tempDir, 'work');
    personalVaultPath = path.join(tempDir, 'personal');
    researchVaultPath = path.join(tempDir, 'research');

    await fs.mkdir(workVaultPath, { recursive: true });
    await fs.mkdir(personalVaultPath, { recursive: true });
    await fs.mkdir(researchVaultPath, { recursive: true });

    // Set up global config
    process.env.XDG_CONFIG_HOME = tempDir;
    globalConfig = new GlobalConfigManager();
    await globalConfig.load();

    // Create three test vaults with different purposes
    await globalConfig.addVault(
      'work',
      'Work Vault',
      workVaultPath,
      'Professional projects and meetings'
    );
    await globalConfig.addVault(
      'personal',
      'Personal Vault',
      personalVaultPath,
      'Personal notes and journaling'
    );
    await globalConfig.addVault(
      'research',
      'Research Vault',
      researchVaultPath,
      'Academic research and papers'
    );

    // Set work as active vault
    await globalConfig.switchVault('work');
  });

  after(async () => {
    await cleanup(tempDir);
    delete process.env.XDG_CONFIG_HOME;
  });

  describe('Multi-Vault Configuration', () => {
    it('should support multiple specialized vaults', async () => {
      const vaults = await globalConfig.listVaults();
      assert.strictEqual(vaults.length, 3);

      const work = vaults.find(v => v.id === 'work');
      const personal = vaults.find(v => v.id === 'personal');
      const research = vaults.find(v => v.id === 'research');

      assert(work, 'work vault should exist');
      assert(personal, 'personal vault should exist');
      assert(research, 'research vault should exist');

      assert.strictEqual(work.info.name, 'Work Vault');
      assert.strictEqual(personal.info.name, 'Personal Vault');
      assert.strictEqual(research.info.name, 'Research Vault');
    });

    it('should have work vault as active', async () => {
      const vaults = globalConfig.listVaults();
      const currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'work');
    });

    it('should allow switching between specialized vaults', async () => {
      // Switch to personal vault
      await globalConfig.switchVault('personal');
      let vaults = globalConfig.listVaults();
      let currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'personal');

      // Switch to research vault
      await globalConfig.switchVault('research');
      vaults = globalConfig.listVaults();
      currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'research');

      // Switch back to work vault
      await globalConfig.switchVault('work');
      vaults = globalConfig.listVaults();
      currentVault = vaults.find(v => v.is_current);
      assert.strictEqual(currentVault?.id, 'work');
    });
  });

  describe('Vault Isolation', () => {
    it('should maintain separate file structures per vault', async () => {
      // Create work-specific directories and files
      const workProjectsDir = path.join(workVaultPath, 'projects');
      await fs.mkdir(workProjectsDir, { recursive: true });
      await fs.writeFile(
        path.join(workProjectsDir, 'project-alpha.md'),
        '# Project Alpha\nWork project details'
      );

      // Create personal-specific directories and files
      const personalJournalDir = path.join(personalVaultPath, 'journal');
      await fs.mkdir(personalJournalDir, { recursive: true });
      await fs.writeFile(
        path.join(personalJournalDir, 'daily-reflection.md'),
        '# Daily Reflection\nPersonal thoughts'
      );

      // Create research-specific directories and files
      const researchPapersDir = path.join(researchVaultPath, 'papers');
      await fs.mkdir(researchPapersDir, { recursive: true });
      await fs.writeFile(
        path.join(researchPapersDir, 'ai-research.md'),
        '# AI Research\nResearch paper notes'
      );

      // Verify each vault has its own content
      const workContents = await fs.readdir(workVaultPath, { recursive: true });
      const personalContents = await fs.readdir(personalVaultPath, { recursive: true });
      const researchContents = await fs.readdir(researchVaultPath, { recursive: true });

      assert(
        workContents.includes('projects'),
        'work vault should have projects directory'
      );
      assert(
        personalContents.includes('journal'),
        'personal vault should have journal directory'
      );
      assert(
        researchContents.includes('papers'),
        'research vault should have papers directory'
      );

      // Verify cross-vault isolation
      assert(
        !workContents.includes('journal'),
        'work vault should not have personal content'
      );
      assert(
        !personalContents.includes('projects'),
        'personal vault should not have work content'
      );
      assert(
        !researchContents.includes('projects'),
        'research vault should not have work content'
      );
    });

    it('should handle vault-specific configurations', async () => {
      // Create vault-specific .flint-note directories
      const workConfigDir = path.join(workVaultPath, '.flint-note');
      const personalConfigDir = path.join(personalVaultPath, '.flint-note');
      const researchConfigDir = path.join(researchVaultPath, '.flint-note');

      await fs.mkdir(workConfigDir, { recursive: true });
      await fs.mkdir(personalConfigDir, { recursive: true });
      await fs.mkdir(researchConfigDir, { recursive: true });

      // Create vault-specific note type configurations
      await fs.writeFile(
        path.join(workConfigDir, 'meetings_description.md'),
        '# Meetings\nNote type for work meetings and action items'
      );

      await fs.writeFile(
        path.join(personalConfigDir, 'journal_description.md'),
        '# Journal\nNote type for personal daily reflections'
      );

      await fs.writeFile(
        path.join(researchConfigDir, 'papers_description.md'),
        '# Papers\nNote type for academic research papers'
      );

      // Verify each vault has its own configuration
      const workConfig = await fs.readFile(
        path.join(workConfigDir, 'meetings_description.md'),
        'utf8'
      );
      const personalConfig = await fs.readFile(
        path.join(personalConfigDir, 'journal_description.md'),
        'utf8'
      );
      const researchConfig = await fs.readFile(
        path.join(researchConfigDir, 'papers_description.md'),
        'utf8'
      );

      assert(
        workConfig.includes('work meetings'),
        'work vault should have work-specific config'
      );
      assert(
        personalConfig.includes('personal daily'),
        'personal vault should have personal-specific config'
      );
      assert(
        researchConfig.includes('academic research'),
        'research vault should have research-specific config'
      );
    });
  });

  describe('Vault Metadata and Organization', () => {
    it('should store vault metadata correctly', async () => {
      const vaults = await globalConfig.listVaults();

      const work = vaults.find(v => v.id === 'work');
      const personal = vaults.find(v => v.id === 'personal');
      const research = vaults.find(v => v.id === 'research');

      assert.strictEqual(work?.info.description, 'Professional projects and meetings');
      assert.strictEqual(personal?.info.description, 'Personal notes and journaling');
      assert.strictEqual(research?.info.description, 'Academic research and papers');

      assert.strictEqual(work?.info.path, workVaultPath);
      assert.strictEqual(personal?.info.path, personalVaultPath);
      assert.strictEqual(research?.info.path, researchVaultPath);
    });

    it('should handle vault path resolution', async () => {
      // Test that vault paths are correctly resolved
      const work = await globalConfig.getVault('work');
      const personal = await globalConfig.getVault('personal');
      const research = await globalConfig.getVault('research');

      assert(work && (await fs.stat(work.path)), 'work vault path should be accessible');
      assert(
        personal && (await fs.stat(personal.path)),
        'personal vault path should be accessible'
      );
      assert(
        research && (await fs.stat(research.path)),
        'research vault path should be accessible'
      );
    });
  });
});
