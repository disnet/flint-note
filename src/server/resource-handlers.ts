/**
 * Resource Handlers
 *
 * Handles all MCP resource operations including recent notes, workspace statistics,
 * and other resource-based endpoints.
 */

import type { VaultContext } from './types.js';

export class ResourceHandlers {
  constructor(
    private requireWorkspace: () => void,
    private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>
  ) {}

  /**
   * Handles the recent notes resource
   */
  handleRecentResource = async () => {
    this.requireWorkspace();
    const { noteManager } = await this.resolveVaultContext();

    if (!noteManager) {
      throw new Error('Server not initialized');
    }

    const recentNotes = await noteManager.listNotes(undefined, 20);
    return {
      contents: [
        {
          uri: 'flint-note://recent',
          mimeType: 'application/json',
          text: JSON.stringify(recentNotes, null, 2)
        }
      ]
    };
  };

  /**
   * Handles the workspace statistics resource
   */
  handleStatsResource = async () => {
    this.requireWorkspace();
    const { workspace } = await this.resolveVaultContext();

    if (!workspace) {
      throw new Error('Server not initialized');
    }

    const stats = await workspace.getStats();
    return {
      contents: [
        {
          uri: 'flint-note://stats',
          mimeType: 'application/json',
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  };
}
