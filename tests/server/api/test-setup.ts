/**
 * Test setup utilities for FlintNoteApi tests
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FlintNoteApi } from '../../../src/server/api/flint-note-api.js';

export class TestApiSetup {
  public api: FlintNoteApi;
  public testWorkspacePath: string;
  public createdVaultIds: string[] = [];

  constructor() {
    this.testWorkspacePath = '';
    this.api = null!;
  }

  async setup(): Promise<void> {
    // Create a temporary directory for testing with unique timestamp to prevent conflicts
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.testWorkspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), `flint-test-${uniqueId}-`)
    );

    // Create isolated global config directory for this test instance
    // Pass it directly to FlintNoteApi instead of using process.env
    // to avoid race conditions when tests run in parallel
    const testConfigDir = path.join(this.testWorkspacePath, 'config');

    // Initialize API with the test workspace path and isolated config directory
    this.api = new FlintNoteApi({
      workspacePath: this.testWorkspacePath,
      configDir: testConfigDir
    });

    // Initialize the API - this should set up database schema
    await this.api.initialize();

    // Wait a bit to ensure database is fully initialized and all locks released
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  /**
   * Set up with a single vault (workspace IS the vault)
   * This is the simpler setup for tests that don't need multiple vaults
   */
  async setupWithVault(vaultId: string): Promise<void> {
    // Create a temporary directory for the vault
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.testWorkspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), `flint-test-${uniqueId}-`)
    );

    // Create isolated global config directory for this test instance
    // Pass it directly to FlintNoteApi instead of using process.env
    // to avoid race conditions when tests run in parallel
    const testConfigDir = path.join(this.testWorkspacePath, 'config');

    // Initialize API with the vault path directly (single-vault mode) and isolated config directory
    this.api = new FlintNoteApi({
      workspacePath: this.testWorkspacePath,
      configDir: testConfigDir
    });

    // Initialize the API - this sets up the database and file watcher for this vault
    await this.api.initialize();

    // Register the vault in global config so API calls with vaultId work
    const vaultConfig = {
      id: vaultId,
      name: `Test Vault ${vaultId}`,
      path: this.testWorkspacePath, // Vault path = workspace path in single-vault mode
      description: `Test vault for ${vaultId}`,
      initialize: false, // Already initialized
      skipTemplate: true,
      switch_to: false
    };
    await this.api.createVault(vaultConfig);
    this.createdVaultIds.push(vaultId);

    // Wait a bit to ensure database is fully initialized and all locks released
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  async createTestVault(
    vaultId: string,
    options?: { initialize?: boolean; skipTemplate?: boolean }
  ): Promise<string> {
    // Generate unique vault ID if provided ID is already taken
    let uniqueVaultId = vaultId;
    let counter = 1;

    while (this.createdVaultIds.includes(uniqueVaultId)) {
      uniqueVaultId = `${vaultId}-${counter}`;
      counter++;
    }

    const vaultConfig = {
      id: uniqueVaultId,
      name: `Test Vault ${uniqueVaultId}`,
      path: path.join(this.testWorkspacePath, uniqueVaultId),
      description: `Test vault for ${uniqueVaultId}`,
      initialize: options?.initialize ?? true,
      skipTemplate: options?.skipTemplate ?? true, // Skip templates by default in tests
      switch_to: false
    };

    await this.api.createVault(vaultConfig);
    this.createdVaultIds.push(uniqueVaultId);

    return uniqueVaultId;
  }

  async cleanup(): Promise<void> {
    // Clean up created vaults from the global config
    for (const vaultId of this.createdVaultIds) {
      try {
        await this.api.removeVault({ id: vaultId });
      } catch (error) {
        // Vault might already be removed, ignore error
      }
    }

    // Reset the created vaults array
    this.createdVaultIds = [];

    // Clean up API resources and database connections
    if (this.api) {
      try {
        // Flush any pending file writes before cleanup (Phase 2: DB-first architecture)
        // This ensures all queued writes complete before we delete temp directories
        await this.api.flushPendingWrites();
        await this.api.cleanup();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }

    // Clean up temporary directory
    try {
      await fs.rm(this.testWorkspacePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  }

  getUniqueVaultId(baseId: string): string {
    let uniqueId = baseId;
    let counter = 1;

    while (this.createdVaultIds.includes(uniqueId)) {
      uniqueId = `${baseId}-${counter}`;
      counter++;
    }

    return uniqueId;
  }
}
