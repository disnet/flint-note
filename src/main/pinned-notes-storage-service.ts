import { app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { logger } from './logger';

export interface PinnedNoteInfo {
  id: string;
  title: string;
  filename: string;
  pinnedAt: string;
  order: number;
}

interface PinnedNotesFileData {
  version: string;
  vaultId: string;
  lastUpdated: string;
  notes: PinnedNoteInfo[];
}

export class PinnedNotesStorageService {
  private readonly storageDir: string;

  constructor() {
    this.storageDir = join(app.getPath('userData'), 'pinned-notes');

    // Ensure storage directory exists
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Load pinned notes for a specific vault
   */
  async loadPinnedNotes(vaultId: string): Promise<PinnedNoteInfo[]> {
    try {
      const filePath = join(this.storageDir, `${vaultId}.json`);

      if (!existsSync(filePath)) {
        logger.debug('No pinned notes file found for vault', { vaultId, filePath });
        return [];
      }

      const fileContent = readFileSync(filePath, 'utf-8');
      const data: PinnedNotesFileData = JSON.parse(fileContent);

      return data.notes || [];
    } catch (error) {
      logger.error('Failed to load pinned notes from file', {
        error,
        vaultId
      });
      // Return empty array on error rather than throwing
      return [];
    }
  }

  /**
   * Save pinned notes for a specific vault
   */
  async savePinnedNotes(vaultId: string, notes: PinnedNoteInfo[]): Promise<void> {
    try {
      const filePath = join(this.storageDir, `${vaultId}.json`);

      const data: PinnedNotesFileData = {
        version: '1.0.0',
        vaultId,
        lastUpdated: new Date().toISOString(),
        notes
      };

      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save pinned notes to file', {
        error,
        vaultId,
        notesCount: notes.length
      });
      throw error;
    }
  }

  /**
   * Clear all pinned notes for a specific vault
   */
  async clearPinnedNotes(vaultId: string): Promise<void> {
    try {
      await this.savePinnedNotes(vaultId, []);
      logger.info('Cleared all pinned notes for vault', { vaultId });
    } catch (error) {
      logger.error('Failed to clear pinned notes for vault', { vaultId, error });
      throw error;
    }
  }

  /**
   * List all vault files that have pinned notes
   */
  async listVaultFiles(): Promise<string[]> {
    try {
      if (!existsSync(this.storageDir)) {
        return [];
      }

      const files = readdirSync(this.storageDir);
      const vaultIds = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''));
      return vaultIds;
    } catch (error) {
      logger.error('Failed to list vault files', { error });
      return [];
    }
  }
}
