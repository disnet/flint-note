/**
 * Resource Handlers
 *
 * Handles all MCP resource operations including recent notes, workspace statistics,
 * individual notes, note collections, and other resource-based endpoints.
 */

import type { VaultContext } from './types.js';

export class ResourceHandlers {
  constructor(
    private requireWorkspace: () => void,
    private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>,
    private generateNoteIdFromIdentifier: (identifier: string) => string
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

  /**
   * Handles individual note resources
   * URI format: flint-note://note/{identifier} or flint-note://note/{vault_id}/{identifier}
   */
  handleNoteResource = async (uri: string) => {
    this.requireWorkspace();

    // Parse the URI to extract vault_id and identifier
    const uriParts = uri.replace('flint-note://note/', '').split('/');
    let vaultId: string | undefined;
    let identifier: string;

    if (uriParts.length >= 3) {
      // Format: flint-note://note/{vault_id}/{type}/{filename}
      vaultId = uriParts[0];
      identifier = uriParts.slice(1).join('/');
    } else {
      // Format: flint-note://note/{type}/{filename}
      identifier = uriParts.join('/');
    }

    const { noteManager } = await this.resolveVaultContext(vaultId);

    if (!noteManager) {
      throw new Error('Server not initialized');
    }

    const note = await noteManager.getNote(identifier);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    // Return note as JSON object
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(note, null, 2)
        }
      ]
    };
  };

  /**
   * Handles note collection resources
   * URI format: flint-note://notes/{type} or flint-note://notes/{vault_id}/{type}
   */
  handleNotesCollectionResource = async (uri: string) => {
    this.requireWorkspace();

    // Parse the URI to extract vault_id and type
    const uriParts = uri.replace('flint-note://notes/', '').split('/');
    let vaultId: string | undefined;
    let noteType: string;

    if (uriParts.length >= 2) {
      // Format: flint-note://notes/{vault_id}/{type}
      vaultId = uriParts[0];
      noteType = uriParts[1];
    } else {
      // Format: flint-note://notes/{type}
      noteType = uriParts[0];
    }

    const { noteManager } = await this.resolveVaultContext(vaultId);

    if (!noteManager) {
      throw new Error('Server not initialized');
    }

    const notes = await noteManager.listNotes(noteType);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(notes, null, 2)
        }
      ]
    };
  };

  /**
   * Handles tagged notes resources
   * URI format: flint-note://notes/tagged/{tag} or flint-note://notes/tagged/{vault_id}/{tag}
   */
  handleTaggedNotesResource = async (uri: string) => {
    this.requireWorkspace();

    // Parse the URI to extract vault_id and tag
    const uriParts = uri.replace('flint-note://notes/tagged/', '').split('/');
    let vaultId: string | undefined;
    let tag: string;

    if (uriParts.length >= 2) {
      // Format: flint-note://notes/tagged/{vault_id}/{tag}
      vaultId = uriParts[0];
      tag = uriParts[1];
    } else {
      // Format: flint-note://notes/tagged/{tag}
      tag = uriParts[0];
    }

    const { noteManager } = await this.resolveVaultContext(vaultId);

    if (!noteManager) {
      throw new Error('Server not initialized');
    }

    // Get all notes and filter by tag
    const allNotes = await noteManager.listNotes();
    const taggedNotes = allNotes.filter(note => note.tags && note.tags.includes(tag));

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(taggedNotes, null, 2)
        }
      ]
    };
  };

  /**
   * Handles incoming links resources
   * URI format: flint-note://links/incoming/{identifier} or flint-note://links/incoming/{vault_id}/{identifier}
   */
  handleIncomingLinksResource = async (uri: string) => {
    this.requireWorkspace();

    // Parse the URI to extract vault_id and identifier
    const uriParts = uri.replace('flint-note://links/incoming/', '').split('/');
    let vaultId: string | undefined;
    let identifier: string;

    if (uriParts.length >= 3) {
      // Format: flint-note://links/incoming/{vault_id}/{type}/{filename}
      vaultId = uriParts[0];
      identifier = uriParts.slice(1).join('/');
    } else {
      // Format: flint-note://links/incoming/{type}/{filename}
      identifier = uriParts.join('/');
    }

    const { noteManager } = await this.resolveVaultContext(vaultId);

    if (!noteManager) {
      throw new Error('Server not initialized');
    }

    // Check if the target note exists
    const targetNote = await noteManager.getNote(identifier);
    if (!targetNote) {
      throw new Error(`Note not found: ${identifier}`);
    }

    const incomingLinks = await noteManager.findIncomingLinks(identifier);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(incomingLinks, null, 2)
        }
      ]
    };
  };
}
