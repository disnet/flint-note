/**
 * Basic tests for flint-note project structure and imports
 * Tests core class imports, configuration, and workspace functionality
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  TestAssertions,
  type TestContext
} from './helpers/test-utils.ts';

describe('Project Structure', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('basic-test');
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  test('should import and instantiate all core classes', () => {
    TestAssertions.assertCoreClassesImportable(context);
  });

  test('should create workspace paths correctly', () => {
    TestAssertions.assertWorkspacePaths(context.workspace);
  });

  test('should validate workspace path security', () => {
    TestAssertions.assertWorkspacePathValidation(context.workspace, context.tempDir);
  });
});

describe('Configuration Management', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('config-test');
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  test('should generate complete default configuration', () => {
    const defaultConfig = context.configManager.getDefaultConfig();

    // Verify all required top-level config sections exist
    assert.ok(defaultConfig.version, 'Should have version');
    assert.ok(defaultConfig.workspace_root, 'Should have workspace_root');
    assert.ok(defaultConfig.default_note_type, 'Should have default_note_type');
    assert.ok(defaultConfig.mcp_server, 'Should have mcp_server config');
    assert.ok(defaultConfig.search, 'Should have search config');
    assert.ok(defaultConfig.note_types, 'Should have note_types config');
    assert.ok(defaultConfig.features, 'Should have features config');
    assert.ok(defaultConfig.security, 'Should have security config');

    // Verify nested config structure
    assert.ok(
      typeof defaultConfig.mcp_server.port === 'number',
      'MCP server should have port'
    );
    assert.ok(
      typeof defaultConfig.search.index_enabled === 'boolean',
      'Search should have index_enabled'
    );
    assert.ok(
      typeof defaultConfig.note_types.auto_create_directories === 'boolean',
      'Note types should have auto_create_directories'
    );
    assert.ok(
      typeof defaultConfig.features.auto_linking === 'boolean',
      'Features should have auto_linking'
    );
    assert.ok(
      typeof defaultConfig.security.restrict_to_workspace === 'boolean',
      'Security should have restrict_to_workspace'
    );
  });

  test('should validate note type names correctly', () => {
    const { configManager } = context;

    // Valid names
    assert.ok(
      configManager.isValidNoteTypeName('general'),
      'Should accept basic valid name'
    );
    assert.ok(
      configManager.isValidNoteTypeName('my-notes'),
      'Should accept hyphenated name'
    );
    assert.ok(
      configManager.isValidNoteTypeName('my_notes'),
      'Should accept underscored name'
    );
    assert.ok(
      configManager.isValidNoteTypeName('notes123'),
      'Should accept names with numbers'
    );

    // Invalid names
    assert.ok(!configManager.isValidNoteTypeName(''), 'Should reject empty name');
    assert.ok(
      !configManager.isValidNoteTypeName('.hidden'),
      'Should reject name starting with dot'
    );
    assert.ok(
      !configManager.isValidNoteTypeName('CON'),
      'Should reject Windows reserved name'
    );
    assert.ok(
      !configManager.isValidNoteTypeName('my notes'),
      'Should reject name with spaces'
    );
    assert.ok(
      !configManager.isValidNoteTypeName('notes/test'),
      'Should reject name with slashes'
    );
    assert.ok(
      !configManager.isValidNoteTypeName('notes\\test'),
      'Should reject name with backslashes'
    );
  });
});
