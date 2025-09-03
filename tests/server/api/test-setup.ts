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

    // Set up isolated global config directory for this test instance
    const testConfigDir = path.join(this.testWorkspacePath, 'config');
    process.env.XDG_CONFIG_HOME = testConfigDir;

    // Initialize API with the test workspace path
    this.api = new FlintNoteApi({
      workspacePath: this.testWorkspacePath
    });

    // Initialize the API - this should set up database schema
    await this.api.initialize();

    // Wait a bit to ensure database is fully initialized and all locks released
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  async createTestVault(
    vaultId: string,
    options?: { initialize?: boolean }
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
        console.warn(`Failed to remove vault ${vaultId}:`, error);
      }
    }

    // Reset the created vaults array
    this.createdVaultIds = [];

    // Clean up API resources and database connections
    if (this.api) {
      try {
        await this.api.cleanup();
      } catch (error) {
        console.warn('Failed to cleanup API:', error);
      }
    }

    // Clean up environment variable
    delete process.env.XDG_CONFIG_HOME;

    // Clean up temporary directory
    try {
      await fs.rm(this.testWorkspacePath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error);
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
