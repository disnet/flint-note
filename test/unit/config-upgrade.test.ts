/**
 * Configuration Upgrade Tests
 *
 * Tests for the configuration upgrade functionality to ensure
 * old vaults without deletion config get upgraded gracefully.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import { Workspace } from '../../src/core/workspace.js';

describe('Configuration Upgrade', () => {
  let testDir: string;
  let workspace: Workspace;

  beforeEach(async () => {
    // Create temporary directory for test
    testDir = join(tmpdir(), `flint-note-config-upgrade-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    workspace = new Workspace(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it('should upgrade old config without deletion section', async () => {
    // Create old config without deletion section
    const oldConfig = {
      workspace_root: '.',
      default_note_type: 'daily',
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      }
      // No deletion section - simulating old config
    };

    // Write old config to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    await writeFile(configPath, yaml.dump(oldConfig));

    // Initialize workspace (should trigger upgrade)
    await workspace.initialize();

    // Verify config was upgraded
    const upgradedConfig = workspace.getConfig();
    assert.ok(upgradedConfig);
    assert.ok(upgradedConfig.deletion);
    assert.strictEqual(upgradedConfig.deletion.require_confirmation, true);
    assert.strictEqual(upgradedConfig.deletion.create_backups, true);
    assert.strictEqual(upgradedConfig.deletion.backup_path, '.flint-note/backups');
    assert.strictEqual(upgradedConfig.deletion.allow_note_type_deletion, true);
    assert.strictEqual(upgradedConfig.deletion.max_bulk_delete, 10);
    assert.strictEqual(upgradedConfig.version, '1.1.0');

    // Verify original settings were preserved
    assert.strictEqual(upgradedConfig.workspace_root, '.');
    assert.strictEqual(upgradedConfig.default_note_type, 'daily');
    assert.strictEqual(upgradedConfig.mcp_server.port, 3000);
    assert.strictEqual(upgradedConfig.search.index_enabled, true);
    assert.strictEqual(upgradedConfig.note_types.auto_create_directories, true);

    // Verify upgraded config was saved to disk
    const savedConfigContent = await readFile(configPath, 'utf-8');
    const savedConfig = yaml.load(savedConfigContent) as any;
    assert.ok(savedConfig.deletion);
    assert.strictEqual(savedConfig.version, '1.1.0');
  });

  it('should upgrade config with partial deletion section', async () => {
    // Create config with partial deletion section
    const partialConfig = {
      workspace_root: '.',
      default_note_type: 'daily',
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      },
      deletion: {
        require_confirmation: false, // Custom value
        create_backups: false // Custom value
        // Missing other deletion fields
      }
    };

    // Write partial config to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    await writeFile(configPath, yaml.dump(partialConfig));

    // Initialize workspace (should trigger upgrade)
    await workspace.initialize();

    // Verify config was upgraded
    const upgradedConfig = workspace.getConfig();
    assert.ok(upgradedConfig);
    assert.ok(upgradedConfig.deletion);

    // Verify existing values were preserved
    assert.strictEqual(upgradedConfig.deletion.require_confirmation, false);
    assert.strictEqual(upgradedConfig.deletion.create_backups, false);

    // Verify missing values were added with defaults
    assert.strictEqual(upgradedConfig.deletion.backup_path, '.flint-note/backups');
    assert.strictEqual(upgradedConfig.deletion.allow_note_type_deletion, true);
    assert.strictEqual(upgradedConfig.deletion.max_bulk_delete, 10);
    assert.strictEqual(upgradedConfig.version, '1.1.0');
  });

  it('should not upgrade config that is already up to date', async () => {
    // Create current config with all deletion fields
    const currentConfig = {
      workspace_root: '.',
      default_note_type: 'daily',
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      },
      deletion: {
        require_confirmation: true,
        create_backups: true,
        backup_path: '.flint-note/backups',
        allow_note_type_deletion: true,
        max_bulk_delete: 10
      },
      version: '1.1.0'
    };

    // Write current config to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    const originalContent = yaml.dump(currentConfig);
    await writeFile(configPath, originalContent);

    // Initialize workspace (should not trigger upgrade)
    await workspace.initialize();

    // Verify config was not modified
    const configAfterInit = workspace.getConfig();
    assert.deepStrictEqual(configAfterInit, currentConfig);

    // Verify file was not modified
    const fileContent = await readFile(configPath, 'utf-8');
    assert.strictEqual(fileContent, originalContent);
  });

  it('should handle config with old version number', async () => {
    // Create config with old version
    const oldVersionConfig = {
      workspace_root: '.',
      default_note_type: 'daily',
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      },
      version: '1.0.0' // Old version
    };

    // Write old version config to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    await writeFile(configPath, yaml.dump(oldVersionConfig));

    // Initialize workspace (should trigger upgrade)
    await workspace.initialize();

    // Verify config was upgraded
    const upgradedConfig = workspace.getConfig();
    assert.ok(upgradedConfig);
    assert.ok(upgradedConfig.deletion);
    assert.strictEqual(upgradedConfig.version, '1.1.0');
  });

  it('should preserve custom values during upgrade', async () => {
    // Create config with some custom values
    const customConfig = {
      workspace_root: './custom-workspace',
      default_note_type: 'custom-type',
      mcp_server: {
        port: 4000,
        log_level: 'debug'
      },
      search: {
        index_enabled: false,
        index_path: './custom-index.json'
      },
      note_types: {
        auto_create_directories: false,
        require_descriptions: false
      }
      // No deletion section
    };

    // Write custom config to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    await writeFile(configPath, yaml.dump(customConfig));

    // Initialize workspace (should trigger upgrade)
    await workspace.initialize();

    // Verify config was upgraded
    const upgradedConfig = workspace.getConfig();
    assert.ok(upgradedConfig);

    // Verify custom values were preserved
    assert.strictEqual(upgradedConfig.workspace_root, './custom-workspace');
    assert.strictEqual(upgradedConfig.default_note_type, 'custom-type');
    assert.strictEqual(upgradedConfig.mcp_server.port, 4000);
    assert.strictEqual(upgradedConfig.mcp_server.log_level, 'debug');
    assert.strictEqual(upgradedConfig.search.index_enabled, false);
    assert.strictEqual(upgradedConfig.search.index_path, './custom-index.json');
    assert.strictEqual(upgradedConfig.note_types.auto_create_directories, false);
    assert.strictEqual(upgradedConfig.note_types.require_descriptions, false);

    // Verify deletion section was added with defaults
    assert.ok(upgradedConfig.deletion);
    assert.strictEqual(upgradedConfig.deletion.require_confirmation, true);
    assert.strictEqual(upgradedConfig.deletion.create_backups, true);
    assert.strictEqual(upgradedConfig.deletion.backup_path, '.flint-note/backups');
    assert.strictEqual(upgradedConfig.deletion.allow_note_type_deletion, true);
    assert.strictEqual(upgradedConfig.deletion.max_bulk_delete, 10);
    assert.strictEqual(upgradedConfig.version, '1.1.0');
  });

  it('should handle config with removed protect_builtin_types field', async () => {
    // Create config with the old protect_builtin_types field that was removed
    const configWithRemovedField = {
      workspace_root: '.',
      default_note_type: 'daily',
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      },
      deletion: {
        require_confirmation: true,
        create_backups: true,
        backup_path: '.flint-note/backups',
        allow_note_type_deletion: true,
        protect_builtin_types: true, // This field was removed
        max_bulk_delete: 10
      },
      version: '1.0.0'
    };

    // Write config with removed field to file
    const flintNoteDir = join(testDir, '.flint-note');
    await mkdir(flintNoteDir, { recursive: true });
    const configPath = join(flintNoteDir, 'config.yml');
    await writeFile(configPath, yaml.dump(configWithRemovedField));

    // Initialize workspace (should handle the removed field gracefully)
    await workspace.initialize();

    // Verify config was upgraded and removed field is not present
    const upgradedConfig = workspace.getConfig();
    assert.ok(upgradedConfig);
    assert.ok(upgradedConfig.deletion);

    // Verify the removed field is not in the upgraded config
    assert.ok(!('protect_builtin_types' in upgradedConfig.deletion));

    // Verify other deletion settings are still present
    assert.strictEqual(upgradedConfig.deletion.require_confirmation, true);
    assert.strictEqual(upgradedConfig.deletion.create_backups, true);
    assert.strictEqual(upgradedConfig.deletion.backup_path, '.flint-note/backups');
    assert.strictEqual(upgradedConfig.deletion.allow_note_type_deletion, true);
    assert.strictEqual(upgradedConfig.deletion.max_bulk_delete, 10);
    assert.strictEqual(upgradedConfig.version, '1.1.0');
  });
});
