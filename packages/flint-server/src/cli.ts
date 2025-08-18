#!/usr/bin/env node

/**
 * flint-note CLI Utility
 *
 * Command-line interface for managing flint-note vaults.
 * Provides commands for creating, listing, switching, and managing vaults.
 */

import { GlobalConfigManager } from './utils/global-config.js';
import { Workspace } from './core/workspace.js';
import { resolvePath, isPathSafe } from './utils/path.js';
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'node:url';
import { resolve, normalize } from 'node:path';

interface CliCommand {
  name: string;
  description: string;
  args: string[];
  options?: Array<{ name: string; description: string; type: 'string' | 'boolean' }>;
}

const COMMANDS: CliCommand[] = [
  {
    name: 'list',
    description: 'List all configured vaults',
    args: []
  },
  {
    name: 'create',
    description: 'Create a new vault',
    args: ['<id>', '<name>', '<path>'],
    options: [
      { name: '--description', description: 'Description of the vault', type: 'string' },
      {
        name: '--no-init',
        description: 'Skip initialization with default note types',
        type: 'boolean'
      },
      {
        name: '--no-switch',
        description: 'Do not switch to the new vault',
        type: 'boolean'
      }
    ]
  },
  {
    name: 'switch',
    description: 'Switch to a different vault',
    args: ['<id>']
  },
  {
    name: 'remove',
    description: 'Remove a vault from the registry (files are not deleted)',
    args: ['<id>']
  },
  {
    name: 'current',
    description: 'Show information about the current vault',
    args: []
  },
  {
    name: 'update',
    description: 'Update vault information',
    args: ['<id>'],
    options: [
      { name: '--name', description: 'New name for the vault', type: 'string' },
      {
        name: '--description',
        description: 'New description for the vault',
        type: 'string'
      }
    ]
  },
  {
    name: 'init',
    description: 'Initialize current directory as a vault',
    args: [],
    options: [
      { name: '--id', description: 'Vault ID (default: directory name)', type: 'string' },
      {
        name: '--name',
        description: 'Vault name (default: directory name)',
        type: 'string'
      },
      { name: '--description', description: 'Vault description', type: 'string' },
      {
        name: '--force',
        description: 'Force initialization even if vault exists',
        type: 'boolean'
      }
    ]
  },
  {
    name: 'config',
    description: 'Show global configuration information',
    args: []
  },
  {
    name: 'delete',
    description: 'Delete notes or note types',
    args: ['<type>', '<target>'],
    options: [
      {
        name: '--action',
        description: 'Action for note type deletion: error, migrate, delete',
        type: 'string'
      },
      {
        name: '--target-type',
        description: 'Target note type for migration',
        type: 'string'
      },
      {
        name: '--confirm',
        description: 'Confirm deletion without prompting',
        type: 'boolean'
      },
      {
        name: '--type',
        description: 'Filter by note type for bulk deletion',
        type: 'string'
      },
      {
        name: '--tags',
        description: 'Filter by tags for bulk deletion (comma-separated)',
        type: 'string'
      },
      {
        name: '--pattern',
        description: 'Regex pattern for bulk deletion',
        type: 'string'
      }
    ]
  }
];

class FlintNoteCli {
  #globalConfig: GlobalConfigManager;

  constructor() {
    this.#globalConfig = new GlobalConfigManager();
  }

  async run(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.showHelp();
      return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    try {
      await this.#globalConfig.load();

      switch (command) {
        case 'list':
          await this.listVaults();
          break;
        case 'create':
          await this.createVault(commandArgs);
          break;
        case 'switch':
          await this.switchVault(commandArgs);
          break;
        case 'remove':
          await this.removeVault(commandArgs);
          break;
        case 'current':
          await this.showCurrentVault();
          break;
        case 'update':
          await this.updateVault(commandArgs);
          break;
        case 'init':
          await this.initVault(commandArgs);
          break;
        case 'config':
          await this.showConfig();
          break;
        case 'delete':
          await this.deleteCommand(commandArgs);
          break;
        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.error('Use "flint-note help" to see available commands.');
          process.exit(1);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  }

  showHelp(): void {
    console.log(`flint-note CLI - Vault Management Utility

USAGE:
  flint-note <command> [arguments] [options]

COMMANDS:`);

    for (const cmd of COMMANDS) {
      const argsStr = cmd.args.length > 0 ? ` ${cmd.args.join(' ')}` : '';
      console.log(`  ${cmd.name}${argsStr}`);
      console.log(`    ${cmd.description}`);

      if (cmd.options && cmd.options.length > 0) {
        console.log('    Options:');
        for (const option of cmd.options) {
          console.log(`      ${option.name}  ${option.description}`);
        }
      }
      console.log('');
    }

    console.log(`EXAMPLES:
  flint-note list
  flint-note create work "Work Notes" ~/work-vault
  flint-note create personal "Personal Notes" ~/personal --description "My personal knowledge base"
  flint-note switch work
  flint-note init --id=project --name="Project Notes"
  flint-note current
  flint-note update work --name "Work & Research"

GLOBAL CONFIG:
  Configuration is stored in: ${this.#globalConfig.getConfigDir()}
`);
  }

  async listVaults(): Promise<void> {
    const vaults = this.#globalConfig.listVaults();

    if (vaults.length === 0) {
      console.log('No vaults configured.');
      console.log(
        'Use "flint-note create" or "flint-note init" to create your first vault.'
      );
      return;
    }

    console.log('📁 Configured Vaults:\n');

    for (const { info, is_current } of vaults) {
      const indicator = is_current ? '🟢' : '⚪';
      console.log(`${indicator} ${info.id}: ${info.name}`);
      console.log(`   Path: ${info.path}`);
      console.log(`   Created: ${new Date(info.created).toLocaleDateString()}`);
      console.log(
        `   Last accessed: ${new Date(info.last_accessed).toLocaleDateString()}`
      );
      if (info.description) {
        console.log(`   Description: ${info.description}`);
      }
      console.log('');
    }
  }

  async createVault(args: string[]): Promise<void> {
    if (args.length < 3) {
      console.error('Usage: flint-note create <id> <name> <path> [options]');
      process.exit(1);
    }

    const [id, name, targetPath] = args;
    const options = this.parseOptions(args.slice(3));

    // Validate vault ID
    if (!this.#globalConfig.isValidVaultId(id)) {
      throw new Error(
        `Invalid vault ID '${id}'. Must contain only letters, numbers, hyphens, and underscores.`
      );
    }

    // Check if vault already exists
    if (this.#globalConfig.hasVault(id)) {
      throw new Error(`Vault with ID '${id}' already exists`);
    }

    // Resolve path with tilde expansion
    const resolvedPath = resolvePath(targetPath);

    // Validate path safety
    if (!isPathSafe(targetPath)) {
      throw new Error(`Invalid or unsafe path: ${targetPath}`);
    }

    // Ensure directory exists
    await fs.mkdir(resolvedPath, { recursive: true });

    // Add vault to registry
    await this.#globalConfig.addVault(
      id,
      name,
      resolvedPath,
      options.description as string
    );

    console.log(`✅ Created vault '${name}' (${id}) at: ${resolvedPath}`);

    // Initialize with default note types unless --no-init is specified
    if (!options['no-init']) {
      const workspace = new Workspace(resolvedPath);
      await workspace.initializeVault();
      console.log('✅ Initialized with default note types');
    }

    // Switch to new vault unless --no-switch is specified
    if (!options['no-switch']) {
      await this.#globalConfig.switchVault(id);
      console.log('🔄 Switched to new vault');
    }
  }

  async switchVault(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Usage: flint-note switch <id>');
      process.exit(1);
    }

    const id = args[0];
    const vault = this.#globalConfig.getVault(id);

    if (!vault) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    await this.#globalConfig.switchVault(id);
    console.log(`🔄 Switched to vault: ${vault.name} (${id})`);
    console.log(`Path: ${vault.path}`);
  }

  async removeVault(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Usage: flint-note remove <id>');
      process.exit(1);
    }

    const id = args[0];
    const vault = this.#globalConfig.getVault(id);

    if (!vault) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    const wasCurrentVault = this.#globalConfig.getCurrentVault()?.path === vault.path;

    await this.#globalConfig.removeVault(id);
    console.log(`✅ Removed vault '${vault.name}' (${id}) from registry.`);
    console.log(`⚠️  Note: Vault files at '${vault.path}' were not deleted.`);

    if (wasCurrentVault) {
      const newCurrent = this.#globalConfig.getCurrentVault();
      if (newCurrent) {
        console.log(`🔄 Switched to vault: ${newCurrent.name}`);
      } else {
        console.log('⚠️  No vaults remaining. You may want to create a new vault.');
      }
    }
  }

  async showCurrentVault(): Promise<void> {
    const currentVault = this.#globalConfig.getCurrentVault();

    if (!currentVault) {
      console.log('⚠️  No vault is currently selected.');
      console.log(
        'Use "flint-note list" to see available vaults or "flint-note create" to add a new one.'
      );
      return;
    }

    // Find the vault ID
    const vaults = this.#globalConfig.listVaults();
    const currentVaultEntry = vaults.find(v => v.is_current);
    const vaultId = currentVaultEntry?.info.id || 'unknown';

    console.log(`🟢 Current Vault: ${currentVault.name} (${vaultId})\n`);
    console.log(`Path: ${currentVault.path}`);
    console.log(`Created: ${new Date(currentVault.created).toLocaleDateString()}`);
    console.log(
      `Last accessed: ${new Date(currentVault.last_accessed).toLocaleDateString()}`
    );
    if (currentVault.description) {
      console.log(`Description: ${currentVault.description}`);
    }
  }

  async updateVault(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Usage: flint-note update <id> [options]');
      console.error('Options: --name <name>, --description <description>');
      process.exit(1);
    }

    const id = args[0];
    const options = this.parseOptions(args.slice(1));

    const vault = this.#globalConfig.getVault(id);
    if (!vault) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    const updates: { name?: string; description?: string } = {};
    if (options.name) updates.name = options.name as string;
    if (options.description !== undefined)
      updates.description = options.description as string;

    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided. Specify --name and/or --description.');
    }

    await this.#globalConfig.updateVault(id, updates);

    const updatedVault = this.#globalConfig.getVault(id)!;
    console.log(`✅ Updated vault '${id}':`);
    console.log(`Name: ${updatedVault.name}`);
    console.log(`Description: ${updatedVault.description || 'None'}`);
    console.log(`Path: ${updatedVault.path}`);
  }

  async initVault(args: string[]): Promise<void> {
    const options = this.parseOptions(args);
    const currentDir = process.cwd();
    const dirName = path.basename(currentDir);

    const id =
      (options.id as string) || dirName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const name = (options.name as string) || dirName;
    const description = options.description as string;

    // Validate vault ID
    if (!this.#globalConfig.isValidVaultId(id)) {
      throw new Error(
        `Invalid vault ID '${id}'. Must contain only letters, numbers, hyphens, and underscores.`
      );
    }

    // Check if vault already exists
    if (this.#globalConfig.hasVault(id)) {
      throw new Error(`Vault with ID '${id}' already exists`);
    }

    // Check if current directory already has a flint-note vault
    const flintNoteDir = path.join(currentDir, '.flint-note');
    let vaultExists = false;

    try {
      await fs.access(flintNoteDir);
      vaultExists = true;
    } catch {
      // Vault doesn't exist, which is fine
    }

    if (vaultExists && !options.force) {
      throw new Error(
        'Directory already contains a flint-note vault. Use --force to reinitialize.'
      );
    }

    // Add vault to registry
    await this.#globalConfig.addVault(id, name, currentDir, description);
    console.log(`✅ Created vault '${name}' (${id}) in current directory`);

    // Initialize vault
    const workspace = new Workspace(currentDir);
    await workspace.initializeVault();
    console.log('✅ Initialized with default note types');

    // Switch to the new vault
    await this.#globalConfig.switchVault(id);
    console.log('🔄 Switched to new vault');
  }

  async showConfig(): Promise<void> {
    console.log('📋 Global Configuration:\n');
    console.log(`Config directory: ${this.#globalConfig.getConfigDir()}`);
    console.log(`Config file: ${this.#globalConfig.getConfigPath()}`);

    const currentVault = this.#globalConfig.getCurrentVault();
    if (currentVault) {
      const vaults = this.#globalConfig.listVaults();
      const currentVaultEntry = vaults.find(v => v.is_current);
      console.log(
        `Current vault: ${currentVault.name} (${currentVaultEntry?.info.id || 'unknown'})`
      );
    } else {
      console.log('Current vault: None');
    }

    const vaultCount = this.#globalConfig.listVaults().length;
    console.log(`Total vaults: ${vaultCount}`);
  }

  parseOptions(args: string[]): Record<string, string | boolean> {
    const options: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        const optionName = arg.substring(2);

        // Check if it's a boolean flag
        if (optionName.startsWith('no-')) {
          options[optionName] = true;
        } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          // Option with value
          options[optionName] = args[i + 1];
          i++; // Skip the value
        } else {
          // Boolean flag
          options[optionName] = true;
        }
      }
    }

    return options;
  }

  async deleteCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.error('Usage: flint-note delete <type> [target] [options]');
      console.error('Types: note, note-type, notes');
      console.error('Examples:');
      console.error('  flint-note delete note "project/my-note.md"');
      console.error('  flint-note delete note-type "old-type" --action=error');
      console.error('  flint-note delete notes --tags bulk-test --confirm');
      return;
    }

    const type = args[0];
    const target = args[1];

    // For 'notes' command, we don't need a target
    const optionsStartIndex = type === 'notes' ? 1 : 2;
    const options = this.parseOptions(args.slice(optionsStartIndex));

    const currentVault = this.#globalConfig.getCurrentVault();
    if (!currentVault) {
      console.error('❌ No vault is currently selected.');
      console.error('Use "flint-note switch <vault-id>" to select a vault first.');
      return;
    }

    try {
      const workspace = new Workspace(currentVault.path);
      await workspace.initialize();

      switch (type) {
        case 'note':
          await this.deleteNote(workspace, target, options);
          break;
        case 'note-type':
          await this.deleteNoteType(workspace, target, options);
          break;
        case 'notes':
          await this.bulkDeleteNotes(workspace, options);
          break;
        default:
          console.error(`❌ Unknown delete type: ${type}`);
          console.error('Valid types: note, note-type, notes');
          return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Delete operation failed: ${errorMessage}`);
      process.exit(1);
    }
  }

  async deleteNote(
    workspace: Workspace,
    identifier: string,
    options: Record<string, string | boolean>
  ): Promise<void> {
    const { NoteManager } = await import('./core/notes.js');

    const noteManager = new NoteManager(workspace);

    const confirm = (options.confirm as boolean) || false;

    if (!confirm) {
      console.log(`⚠️  About to delete note: ${identifier}`);
      console.log('Use --confirm to proceed with deletion');
      return;
    }

    try {
      const result = await noteManager.deleteNote(identifier, confirm);

      if (result.deleted) {
        console.log(`✅ Note '${identifier}' deleted successfully`);
        if (result.backup_path) {
          console.log(`📁 Backup created at: ${result.backup_path}`);
        }
        if (result.warnings && result.warnings.length > 0) {
          console.log('⚠️  Warnings:');
          result.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
      } else {
        console.error('❌ Failed to delete note');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to delete note: ${errorMessage}`);
    }
  }

  async deleteNoteType(
    workspace: Workspace,
    typeName: string,
    options: Record<string, string | boolean>
  ): Promise<void> {
    const { NoteTypeManager } = await import('./core/note-types.js');
    const noteTypeManager = new NoteTypeManager(workspace);

    const action = (options.action as string) || 'error';
    const targetType = options['target-type'] as string;
    const confirm = (options.confirm as boolean) || false;

    if (!['error', 'migrate', 'delete'].includes(action)) {
      console.error('❌ Invalid action. Must be: error, migrate, or delete');
      return;
    }

    if (action === 'migrate' && !targetType) {
      console.error('❌ --target-type is required when using --action=migrate');
      return;
    }

    if (!confirm) {
      console.log(`⚠️  About to delete note type: ${typeName}`);
      console.log(`   Action: ${action}`);
      if (targetType) {
        console.log(`   Target type: ${targetType}`);
      }
      console.log('Use --confirm to proceed with deletion');
      return;
    }

    try {
      const result = await noteTypeManager.deleteNoteType(
        typeName,
        action as 'error' | 'migrate' | 'delete',
        targetType,
        confirm
      );

      if (result.deleted) {
        console.log(`✅ Note type '${typeName}' deleted successfully`);
        console.log(`   Action: ${result.action}`);
        console.log(`   Notes affected: ${result.notes_affected}`);

        if (result.backup_path) {
          console.log(`📁 Backup created at: ${result.backup_path}`);
        }
        if (result.migration_target) {
          console.log(`📋 Notes migrated to type: ${result.migration_target}`);
        }
      } else {
        console.error('❌ Failed to delete note type');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to delete note type: ${errorMessage}`);
    }
  }

  async bulkDeleteNotes(
    workspace: Workspace,
    options: Record<string, string | boolean>
  ): Promise<void> {
    const { NoteManager } = await import('./core/notes.js');

    const noteManager = new NoteManager(workspace);

    const type = options.type as string;
    const tags = options.tags
      ? (options.tags as string).split(',').map(t => t.trim())
      : undefined;
    const pattern = options.pattern as string;
    const confirm = (options.confirm as boolean) || false;

    if (!type && !tags && !pattern) {
      console.error('❌ At least one filter is required: --type, --tags, or --pattern');
      return;
    }

    const criteria = { type, tags, pattern };

    if (!confirm) {
      console.log('⚠️  About to perform bulk deletion with criteria:');
      if (type) console.log(`   Type: ${type}`);
      if (tags) console.log(`   Tags: ${tags.join(', ')}`);
      if (pattern) console.log(`   Pattern: ${pattern}`);
      console.log('Use --confirm to proceed with bulk deletion');
      return;
    }

    try {
      const results = await noteManager.bulkDeleteNotes(criteria, confirm);

      const successCount = results.filter(r => r.deleted).length;
      const failureCount = results.length - successCount;

      console.log(`✅ Bulk deletion completed:`);
      console.log(`   Total processed: ${results.length}`);
      console.log(`   Successfully deleted: ${successCount}`);
      console.log(`   Failed: ${failureCount}`);

      if (failureCount > 0) {
        console.log('\n❌ Failed deletions:');
        results
          .filter(r => !r.deleted)
          .forEach(result => {
            console.log(`   - ${result.id}: ${result.warnings?.[0] || 'Unknown error'}`);
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Bulk deletion failed: ${errorMessage}`);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const cli = new FlintNoteCli();
  const args = process.argv.slice(2);
  await cli.run(args);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nOperation cancelled.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nOperation terminated.');
  process.exit(0);
});

// Check if this module is being run directly (cross-platform compatible)
function isMainModule(): boolean {
  try {
    const currentFile = normalize(resolve(fileURLToPath(import.meta.url)));
    const mainFile = normalize(resolve(process.argv[1]));
    return currentFile === mainFile;
  } catch {
    // Fallback to original logic if URL parsing fails
    return import.meta.url === `file://${process.argv[1]}`;
  }
}

if (isMainModule()) {
  main().catch((error: Error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export { FlintNoteCli };
