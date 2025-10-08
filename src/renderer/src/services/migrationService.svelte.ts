/**
 * Migration Service
 *
 * Handles UI state migration from old note identifiers (type/filename)
 * to new immutable note IDs (n-xxxxxxxx).
 *
 * This service runs once per vault on app startup after database migration
 * has completed, updating all localStorage references to use new IDs.
 */

export class MigrationService {
  private migrationCompleteKey = 'note-id-migration-complete';

  /**
   * Check if migration has already been completed
   */
  isMigrationComplete(): boolean {
    return localStorage.getItem(this.migrationCompleteKey) === 'true';
  }

  /**
   * Run the full UI state migration
   */
  async migrateUIState(): Promise<void> {
    // Check if already migrated
    if (this.isMigrationComplete()) {
      console.log('UI state migration already complete, skipping');
      return;
    }

    console.log('Starting UI state migration...');

    try {
      // Get migration mapping from server
      const mapping = await window.api?.getMigrationMapping();

      if (!mapping) {
        console.log('No migration mapping available, skipping UI migration');
        this.markMigrationComplete();
        return;
      }

      console.log(`Migrating UI state with ${Object.keys(mapping).length} ID mappings`);

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

      console.log('UI state migration completed successfully');
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
    const raw = localStorage.getItem(key);

    if (!raw) return;

    try {
      const pinned = JSON.parse(raw) as Array<{ id: string; [key: string]: any }>;
      const migrated = pinned
        .map((note) => ({
          ...note,
          id: mapping[note.id] || note.id // Fallback to old ID if not in mapping
        }))
        .filter((note) => note.id); // Remove entries with invalid IDs

      localStorage.setItem(key, JSON.stringify(migrated));
      console.log(`Migrated ${migrated.length} pinned notes`);
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
    const raw = localStorage.getItem(key);

    if (!raw) return;

    try {
      const sidebar = JSON.parse(raw) as Array<{ noteId: string; [key: string]: any }>;
      const migrated = sidebar
        .map((note) => ({
          ...note,
          noteId: mapping[note.noteId] || note.noteId
        }))
        .filter((note) => note.noteId);

      localStorage.setItem(key, JSON.stringify(migrated));
      console.log(`Migrated ${migrated.length} sidebar notes`);
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
    const raw = localStorage.getItem(key);

    if (!raw) return;

    try {
      const tabs = JSON.parse(raw) as Array<{ id: string; [key: string]: any }>;
      const migrated = tabs
        .map((tab) => ({
          ...tab,
          id: mapping[tab.id] || tab.id
        }))
        .filter((tab) => tab.id);

      localStorage.setItem(key, JSON.stringify(migrated));
      console.log(`Migrated ${migrated.length} temporary tabs`);
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
    const raw = localStorage.getItem(key);

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
      console.log(`Migrated ${Object.keys(migrated).length} cursor positions`);
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
    const raw = localStorage.getItem(key);

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
      console.log(`Migrated ${Object.keys(migrated).length} scroll positions`);
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
    const raw = localStorage.getItem(key);

    if (!raw) return;

    try {
      const recent = JSON.parse(raw) as string[];
      const migrated = recent.map((id) => mapping[id] || id).filter((id) => id);

      localStorage.setItem(key, JSON.stringify(migrated));
      console.log(`Migrated ${migrated.length} recent notes`);
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
    const lastOpened = localStorage.getItem(key);

    if (!lastOpened) return;

    try {
      const newId = mapping[lastOpened];
      if (newId) {
        localStorage.setItem(key, newId);
        console.log('Migrated last opened note');
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
  }

  /**
   * Reset migration state (for testing/debugging)
   */
  resetMigration(): void {
    localStorage.removeItem(this.migrationCompleteKey);
    console.log('Migration state reset - will run on next startup');
  }
}

// Export singleton instance
export const migrationService = new MigrationService();
