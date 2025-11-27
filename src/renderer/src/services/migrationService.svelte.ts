/**
 * Migration Service
 *
 * Handles UI state migration from old note identifiers (type/filename)
 * to new immutable note IDs (n-xxxxxxxx).
 *
 * This service runs once per vault on app startup after database migration
 * has completed, updating all localStorage references to use new IDs.
 */

import { logger } from '../utils/logger';

interface PinnedNote {
  id: string;
  [key: string]: unknown;
}

interface SidebarNote {
  noteId: string;
  [key: string]: unknown;
}

interface TemporaryTab {
  id: string;
  [key: string]: unknown;
}

export class MigrationService {
  private migrationCompleteKey = 'note-id-migration-complete';
  private migrationBackupKey = 'note-id-migration-backup';

  /**
   * Check if migration has already been completed
   */
  isMigrationComplete(): boolean {
    return localStorage.getItem(this.migrationCompleteKey) === 'true';
  }

  /**
   * Backup and clear all localStorage data that contains old note IDs
   * This is called BEFORE migration to prevent stores from loading stale data
   */
  clearStaleUIState(): void {
    if (this.isMigrationComplete()) {
      return; // Already migrated, don't clear
    }

    logger.info('Backing up and clearing stale UI state before migration...');

    // Keys that reference note IDs
    const keysToBackup = [
      'pinned-notes',
      'sidebar-notes',
      'temporary-tabs',
      'cursor-positions',
      'note-scroll-positions',
      'recent-notes',
      'last-opened-note'
    ];

    // Create backup object
    const backup: Record<string, string | null> = {};
    keysToBackup.forEach((key) => {
      backup[key] = localStorage.getItem(key);
    });

    // Save backup
    localStorage.setItem(this.migrationBackupKey, JSON.stringify(backup));

    // Clear the original keys to prevent stores from loading stale data
    keysToBackup.forEach((key) => {
      localStorage.removeItem(key);
    });

    logger.info('Stale UI state backed up and cleared');
  }

  /**
   * Get backed up localStorage data
   */
  private getBackup(): Record<string, string | null> | null {
    const backupRaw = localStorage.getItem(this.migrationBackupKey);
    if (!backupRaw) return null;

    try {
      return JSON.parse(backupRaw);
    } catch (error) {
      console.error('Failed to parse backup data:', error);
      return null;
    }
  }

  /**
   * Run the full UI state migration
   */
  async migrateUIState(): Promise<void> {
    // Check if already migrated
    if (this.isMigrationComplete()) {
      logger.info('UI state migration already complete, skipping');
      return;
    }

    logger.info('Starting UI state migration...');

    try {
      // Clear vault-specific UI state (server-side JSON files)
      try {
        const { getChatService } = await import('./chatService');
        const chatService = getChatService();
        const vault = await chatService.getCurrentVault();
        if (vault?.id && window.api?.clearVaultUIState) {
          await window.api.clearVaultUIState({ vaultId: vault.id });
          logger.info('Cleared vault-specific UI state');
        }
      } catch (error) {
        console.warn('Failed to clear vault-specific UI state:', error);
        // Non-blocking - continue with localStorage migration
      }

      // Get migration mapping from server
      const mapping = await window.api?.getMigrationMapping();

      if (!mapping) {
        logger.info('No migration mapping available, skipping UI migration');
        this.markMigrationComplete();
        return;
      }

      logger.info(`Migrating UI state with ${Object.keys(mapping).length} ID mappings`);

      // Migrate all localStorage keys
      this.migratePinnedNotes(mapping);
      this.migrateSidebarNotes(mapping);
      this.migrateTemporaryTabs(mapping);
      this.migrateCursorPositions(mapping);
      this.migrateScrollPositions(mapping);
      this.migrateRecentNotes(mapping);
      this.migrateLastOpenedNote(mapping);

      // Mark migration as complete
      this.markMigrationComplete();

      logger.info('UI state migration completed successfully');
    } catch (error) {
      console.error('UI state migration failed:', error);
      // Don't mark as complete - will retry on next app open
      throw error;
    }
  }

  /**
   * Migrate pinned notes store
   */
  private migratePinnedNotes(mapping: Record<string, string>): void {
    const key = 'pinned-notes';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const pinned = JSON.parse(raw) as PinnedNote[];
      const migrated = pinned
        .map((note) => ({
          ...note,
          id: mapping[note.id] || note.id // Fallback to old ID if not in mapping
        }))
        .filter((note) => note.id); // Remove entries with invalid IDs

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${migrated.length} pinned notes`);
    } catch (error) {
      console.error('Failed to migrate pinned notes:', error);
      // Clear corrupted data
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate sidebar notes store
   */
  private migrateSidebarNotes(mapping: Record<string, string>): void {
    const key = 'sidebar-notes';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const sidebar = JSON.parse(raw) as SidebarNote[];
      const migrated = sidebar
        .map((note) => ({
          ...note,
          noteId: mapping[note.noteId] || note.noteId
        }))
        .filter((note) => note.noteId);

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${migrated.length} sidebar notes`);
    } catch (error) {
      console.error('Failed to migrate sidebar notes:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate temporary tabs store
   */
  private migrateTemporaryTabs(mapping: Record<string, string>): void {
    const key = 'temporary-tabs';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const tabs = JSON.parse(raw) as TemporaryTab[];
      const migrated = tabs
        .map((tab) => ({
          ...tab,
          id: mapping[tab.id] || tab.id
        }))
        .filter((tab) => tab.id);

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${migrated.length} temporary tabs`);
    } catch (error) {
      console.error('Failed to migrate temporary tabs:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate cursor positions (keys are note IDs)
   */
  private migrateCursorPositions(mapping: Record<string, string>): void {
    const key = 'cursor-positions';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const positions = JSON.parse(raw) as Record<string, { line: number; col: number }>;
      const migrated: Record<string, { line: number; col: number }> = {};

      for (const [oldId, position] of Object.entries(positions)) {
        const newId = mapping[oldId] || oldId;
        if (newId) {
          migrated[newId] = position;
        }
      }

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${Object.keys(migrated).length} cursor positions`);
    } catch (error) {
      console.error('Failed to migrate cursor positions:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate scroll positions (keys are note IDs)
   */
  private migrateScrollPositions(mapping: Record<string, string>): void {
    const key = 'note-scroll-positions';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const positions = JSON.parse(raw) as Record<string, number>;
      const migrated: Record<string, number> = {};

      for (const [oldId, position] of Object.entries(positions)) {
        const newId = mapping[oldId] || oldId;
        if (newId) {
          migrated[newId] = position;
        }
      }

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${Object.keys(migrated).length} scroll positions`);
    } catch (error) {
      console.error('Failed to migrate scroll positions:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate recent notes list
   */
  private migrateRecentNotes(mapping: Record<string, string>): void {
    const key = 'recent-notes';
    const backup = this.getBackup();
    const raw = backup?.[key];

    if (!raw) return;

    try {
      const recent = JSON.parse(raw) as string[];
      const migrated = recent.map((id) => mapping[id] || id).filter((id) => id);

      localStorage.setItem(key, JSON.stringify(migrated));
      logger.info(`Migrated ${migrated.length} recent notes`);
    } catch (error) {
      console.error('Failed to migrate recent notes:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Migrate last opened note
   */
  private migrateLastOpenedNote(mapping: Record<string, string>): void {
    const key = 'last-opened-note';
    const backup = this.getBackup();
    const lastOpened = backup?.[key];

    if (!lastOpened) return;

    try {
      const newId = mapping[lastOpened];
      if (newId) {
        localStorage.setItem(key, newId);
        logger.info('Migrated last opened note');
      } else {
        // Old ID not in mapping - clear it
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Failed to migrate last opened note:', error);
      localStorage.removeItem(key);
    }
  }

  /**
   * Mark migration as complete
   */
  private markMigrationComplete(): void {
    localStorage.setItem(this.migrationCompleteKey, 'true');
    // Clean up backup after successful migration
    localStorage.removeItem(this.migrationBackupKey);
  }

  /**
   * Reset migration state (for testing/debugging)
   */
  resetMigration(): void {
    localStorage.removeItem(this.migrationCompleteKey);
    logger.info('Migration state reset - will run on next startup');
  }
}

// Export singleton instance
export const migrationService = new MigrationService();
