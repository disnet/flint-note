import { BaseStorageService } from './storage-service';

/**
 * Storage service for vault-specific data that needs to be isolated per vault.
 * Manages files in the vault-data/{vaultId}/ directories under userData.
 */
export class VaultDataStorageService extends BaseStorageService {
  private readonly vaultDataDir: string;

  constructor() {
    super();
    this.vaultDataDir = this.getStoragePath('vault-data');
  }

  /**
   * Initialize the vault data storage directory
   */
  async initialize(): Promise<void> {
    await this.ensureDirectory(this.vaultDataDir);
  }

  /**
   * Get the directory path for a specific vault
   */
  private getVaultDir(vaultId: string): string {
    return this.getStoragePath('vault-data', vaultId);
  }

  /**
   * Ensure a vault's directory exists
   */
  private async ensureVaultDirectory(vaultId: string): Promise<void> {
    const vaultDir = this.getVaultDir(vaultId);
    await this.ensureDirectory(vaultDir);
  }

  /**
   * Load conversations for a vault
   */
  async loadConversations<T>(vaultId: string, defaultValue: T): Promise<T> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'conversations.json');
    return await this.readJsonFile(filePath, defaultValue);
  }

  /**
   * Save conversations for a vault
   */
  async saveConversations<T>(vaultId: string, conversations: T): Promise<void> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'conversations.json');
    await this.writeJsonFile(filePath, conversations);
  }

  /**
   * Load temporary tabs for a vault
   */
  async loadTemporaryTabs<T>(vaultId: string, defaultValue: T): Promise<T> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'temporary-tabs.json');
    return await this.readJsonFile(filePath, defaultValue);
  }

  /**
   * Save temporary tabs for a vault
   */
  async saveTemporaryTabs<T>(vaultId: string, tabs: T): Promise<void> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'temporary-tabs.json');
    await this.writeJsonFile(filePath, tabs);
  }

  /**
   * Load navigation history for a vault
   */
  async loadNavigationHistory<T>(vaultId: string, defaultValue: T): Promise<T> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath(
      'vault-data',
      vaultId,
      'navigation-history.json'
    );
    return await this.readJsonFile(filePath, defaultValue);
  }

  /**
   * Save navigation history for a vault
   */
  async saveNavigationHistory<T>(vaultId: string, history: T): Promise<void> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath(
      'vault-data',
      vaultId,
      'navigation-history.json'
    );
    await this.writeJsonFile(filePath, history);
  }

  /**
   * Load active note for a vault
   */
  async loadActiveNote(vaultId: string): Promise<string | null> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'active-note.json');
    const data = await this.readJsonFile<{ activeNote: string | null }>(filePath, {
      activeNote: null
    });
    return data.activeNote;
  }

  /**
   * Save active note for a vault
   */
  async saveActiveNote(vaultId: string, noteId: string | null): Promise<void> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'active-note.json');
    await this.writeJsonFile(filePath, { activeNote: noteId });
  }

  /**
   * Clear all data for a vault
   */
  async clearVaultData(vaultId: string): Promise<void> {
    const vaultDir = this.getVaultDir(vaultId);
    const files = await this.listFiles(vaultDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = this.getStoragePath('vault-data', vaultId, file);
        await this.deleteFile(filePath);
      }
    }
  }

  /**
   * Load cursor positions for a vault
   */
  async loadCursorPositions(vaultId: string): Promise<Record<string, CursorPosition>> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'cursor-positions.json');
    const data = await this.readJsonFile<CursorPositionsData>(filePath, {
      version: '1.0',
      vaultId,
      positions: {},
      lastUpdated: new Date().toISOString()
    });
    return data.positions;
  }

  /**
   * Save cursor positions for a vault
   */
  async saveCursorPositions(
    vaultId: string,
    positions: Record<string, CursorPosition>
  ): Promise<void> {
    await this.ensureVaultDirectory(vaultId);
    const filePath = this.getStoragePath('vault-data', vaultId, 'cursor-positions.json');
    const data: CursorPositionsData = {
      version: '1.0',
      vaultId,
      positions,
      lastUpdated: new Date().toISOString()
    };
    await this.writeJsonFile(filePath, data);
  }

  /**
   * Get cursor position for a specific note in a vault
   */
  async getCursorPosition(
    vaultId: string,
    noteId: string
  ): Promise<CursorPosition | null> {
    const positions = await this.loadCursorPositions(vaultId);
    return positions[noteId] || null;
  }

  /**
   * Set cursor position for a specific note in a vault
   */
  async setCursorPosition(
    vaultId: string,
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    const positions = await this.loadCursorPositions(vaultId);
    positions[noteId] = position;
    await this.saveCursorPositions(vaultId, positions);
  }

  /**
   * List all vault IDs that have data stored
   */
  async listVaults(): Promise<string[]> {
    const files = await this.listFiles(this.vaultDataDir);
    return files.filter((file) => !file.includes('.'));
  }
}

/**
 * Cursor position data structures
 */
export interface CursorPosition {
  noteId: string;
  position: number;
  selectionStart?: number;
  selectionEnd?: number;
  lastUpdated: string;
}

export interface CursorPositionsData {
  version: string;
  vaultId: string;
  positions: Record<string, CursorPosition>;
  lastUpdated: string;
}
