/**
 * Vault Handlers
 *
 * Handles all vault management operations including creation, switching,
 * removal, updates, and listing vaults.
 */

import { GlobalConfigManager } from '../utils/global-config.js';
import { Workspace } from '../core/workspace.js';
import { HybridSearchManager } from '../database/search-manager.js';
import { resolvePath, isPathSafe } from '../utils/path.js';
import { validateToolArgs } from './validation.js';
import type {
  CreateVaultArgs,
  SwitchVaultArgs,
  RemoveVaultArgs,
  UpdateVaultArgs
} from './types.js';
import fs from 'fs/promises';

export class VaultHandlers {
  constructor(
    private globalConfig: GlobalConfigManager,
    private initializeServer: () => Promise<void>
  ) {}

  /**
   * Lists all configured vaults with their details
   */
  handleListVaults = async (): Promise<{
    content: Array<{ type: string; text: string }>;
  }> => {
    try {
      const vaults = this.globalConfig.listVaults();

      if (vaults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No vaults configured. Use create_vault to add your first vault.'
            }
          ]
        };
      }

      const vaultList = vaults
        .map(({ id, info, is_current }) => {
          const indicator = is_current ? '🟢 (current)' : '⚪';
          return `${indicator} **${id}**: ${info.name}\n   Path: ${info.path}\n   Created: ${new Date(info.created).toLocaleDateString()}\n   Last accessed: ${new Date(info.last_accessed).toLocaleDateString()}${info.description ? `\n   Description: ${info.description}` : ''}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `📁 **Configured Vaults**\n\n${vaultList}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list vaults: ${errorMessage}`
          }
        ]
      };
    }
  };

  /**
   * Creates a new vault with optional initialization and switching
   */
  handleCreateVault = async (
    args: CreateVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      // Validate arguments
      validateToolArgs('create_vault', args);
      // Validate vault ID
      if (!this.globalConfig.isValidVaultId(args.id)) {
        throw new Error(
          `Invalid vault ID '${args.id}'. Must contain only letters, numbers, hyphens, and underscores.`
        );
      }

      // Check if vault already exists
      if (this.globalConfig.hasVault(args.id)) {
        throw new Error(`Vault with ID '${args.id}' already exists`);
      }

      // Resolve path with tilde expansion
      const resolvedPath = resolvePath(args.path);

      // Validate path safety
      if (!isPathSafe(args.path)) {
        throw new Error(`Invalid or unsafe path: ${args.path}`);
      }

      // Ensure directory exists
      await fs.mkdir(resolvedPath, { recursive: true });

      // Add vault to registry
      await this.globalConfig.addVault(
        args.id,
        args.name,
        resolvedPath,
        args.description
      );

      let initMessage = '';
      if (args.initialize !== false) {
        // Initialize the vault with default note types
        const tempHybridSearchManager = new HybridSearchManager(resolvedPath);
        const workspace = new Workspace(
          resolvedPath,
          tempHybridSearchManager.getDatabaseManager()
        );
        await workspace.initializeVault();
        initMessage =
          '\n\n✅ Vault initialized with default note types (daily, reading, todos, projects, goals, games, movies)';
      }

      let switchMessage = '';
      if (args.switch_to !== false) {
        // Switch to the new vault
        await this.globalConfig.switchVault(args.id);

        // Reinitialize server with new vault
        await this.initializeServer();

        switchMessage = '\n\n🔄 Switched to new vault';
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Created vault '${args.name}' (${args.id}) at: ${resolvedPath}${initMessage}${switchMessage}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  /**
   * Switches to a different vault
   */
  handleSwitchVault = async (
    args: SwitchVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      // Validate arguments
      validateToolArgs('switch_vault', args);
      const vault = this.globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      // Switch to the vault
      await this.globalConfig.switchVault(args.id);

      // Reinitialize server with new vault
      await this.initializeServer();

      return {
        content: [
          {
            type: 'text',
            text: `🔄 Switched to vault: ${vault.name} (${args.id})\nPath: ${vault.path}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to switch vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  /**
   * Removes a vault from the registry (does not delete files)
   */
  handleRemoveVault = async (
    args: RemoveVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      // Validate arguments
      validateToolArgs('remove_vault', args);
      const vault = this.globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      const wasCurrentVault = this.globalConfig.getCurrentVault()?.path === vault.path;

      // Remove vault from registry
      await this.globalConfig.removeVault(args.id);

      let switchMessage = '';
      if (wasCurrentVault) {
        // Reinitialize server if we removed the current vault
        await this.initializeServer();
        const newCurrent = this.globalConfig.getCurrentVault();
        if (newCurrent) {
          switchMessage = `\n\n🔄 Switched to vault: ${newCurrent.name}`;
        } else {
          switchMessage =
            '\n\n⚠️  No vaults remaining. You may want to create a new vault.';
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Removed vault '${vault.name}' (${args.id}) from registry.\n\n⚠️  Note: Vault files at '${vault.path}' were not deleted.${switchMessage}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to remove vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };

  /**
   * Gets information about the currently active vault
   */
  handleGetCurrentVault = async (): Promise<{
    content: Array<{ type: string; text: string }>;
  }> => {
    try {
      const currentVault = this.globalConfig.getCurrentVault();

      if (!currentVault) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️  No vault is currently selected. Use list_vaults to see available vaults or create_vault to add a new one.'
            }
          ]
        };
      }

      // Find the vault ID
      const vaults = this.globalConfig.listVaults();
      const currentVaultEntry = vaults.find(v => v.is_current);
      const vaultId = currentVaultEntry?.id || 'unknown';

      return {
        content: [
          {
            type: 'text',
            text: `🟢 **Current Vault**: ${currentVault.name} (${vaultId})

**Path**: ${currentVault.path}
**Created**: ${new Date(currentVault.created).toLocaleDateString()}
**Last accessed**: ${new Date(currentVault.last_accessed).toLocaleDateString()}${currentVault.description ? `\n**Description**: ${currentVault.description}` : ''}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get current vault: ${errorMessage}`
          }
        ]
      };
    }
  };

  /**
   * Updates vault metadata (name and/or description)
   */
  handleUpdateVault = async (
    args: UpdateVaultArgs
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    try {
      // Validate arguments
      validateToolArgs('update_vault', args);
      const vault = this.globalConfig.getVault(args.id);
      if (!vault) {
        throw new Error(`Vault with ID '${args.id}' does not exist`);
      }

      const updates: Partial<Pick<typeof vault, 'name' | 'description'>> = {};
      if (args.name) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;

      if (Object.keys(updates).length === 0) {
        throw new Error(
          'No updates provided. Specify name and/or description to update.'
        );
      }

      await this.globalConfig.updateVault(args.id, updates);

      const updatedVault = this.globalConfig.getVault(args.id)!;
      return {
        content: [
          {
            type: 'text',
            text: `✅ Updated vault '${args.id}':
**Name**: ${updatedVault.name}
**Description**: ${updatedVault.description || 'None'}
**Path**: ${updatedVault.path}`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update vault: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  };
}
