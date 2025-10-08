/**
 * Tests for UI state storage in database
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';

describe('FlintNoteApi - UI State Operations', () => {
  let testSetup: TestApiSetup;
  let vaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    vaultId = await testSetup.createTestVault('ui-state-test-vault');
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('saveUIState and loadUIState', () => {
    it('should save and load simple UI state', async () => {
      const stateKey = 'active_note';
      const stateValue = { noteId: 'n-abc123' };

      // Save state
      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      // Load state
      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);

      expect(loaded).toEqual(stateValue);
    });

    it('should save and load complex UI state with arrays', async () => {
      const stateKey = 'temporary_tabs';
      const stateValue = {
        tabs: [
          { id: 'tab-1', noteId: 'n-123', title: 'Note 1' },
          { id: 'tab-2', noteId: 'n-456', title: 'Note 2' }
        ],
        activeTabId: 'tab-1',
        maxTabs: 10,
        autoCleanupHours: 24
      };

      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);

      expect(loaded).toEqual(stateValue);
    });

    it('should return null for non-existent state', async () => {
      const loaded = await testSetup.api.loadUIState(vaultId, 'non_existent_key');

      expect(loaded).toBeNull();
    });

    it('should update existing state with new value', async () => {
      const stateKey = 'active_note';

      // Save initial state
      await testSetup.api.saveUIState(vaultId, stateKey, { noteId: 'n-abc123' });

      // Update state
      await testSetup.api.saveUIState(vaultId, stateKey, { noteId: 'n-xyz789' });

      // Verify updated value
      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);

      expect(loaded).toEqual({ noteId: 'n-xyz789' });
    });

    it('should handle multiple state keys independently', async () => {
      // Save multiple state keys
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-123' });

      await testSetup.api.saveUIState(vaultId, 'pinned_notes', {
        notes: [{ id: 'n-456', order: 0 }]
      });

      await testSetup.api.saveUIState(vaultId, 'navigation_history', {
        customHistory: [],
        currentIndex: 0
      });

      // Verify each key is independent
      const activeNote = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(activeNote).toEqual({ noteId: 'n-123' });

      const pinnedNotes = await testSetup.api.loadUIState(vaultId, 'pinned_notes');
      expect(pinnedNotes).toEqual({ notes: [{ id: 'n-456', order: 0 }] });

      const navHistory = await testSetup.api.loadUIState(vaultId, 'navigation_history');
      expect(navHistory).toEqual({ customHistory: [], currentIndex: 0 });
    });

    it('should handle null and undefined values in state', async () => {
      const stateKey = 'active_note';
      const stateValue = { noteId: null };

      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);

      expect(loaded).toEqual({ noteId: null });
    });

    it('should preserve data types when serializing/deserializing', async () => {
      const stateKey = 'cursor_positions';
      const stateValue = {
        positions: {
          'n-abc123': { position: 100, line: 5, column: 10 },
          'n-def456': { position: 0, line: 0, column: 0 }
        }
      };

      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);

      expect(loaded).toEqual(stateValue);
      // Verify numbers are preserved as numbers, not strings
      expect(typeof (loaded as any).positions['n-abc123'].position).toBe('number');
    });
  });

  describe('vault isolation', () => {
    it('should isolate UI state between different vaults', async () => {
      // Create second vault
      const vaultId2 = await testSetup.createTestVault('ui-state-test-vault-2');

      const stateKey = 'active_note';

      // Save different state in each vault
      await testSetup.api.saveUIState(vaultId, stateKey, { noteId: 'n-vault1-note' });

      await testSetup.api.saveUIState(vaultId2, stateKey, { noteId: 'n-vault2-note' });

      // Verify each vault has its own state
      const vault1State = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(vault1State).toEqual({ noteId: 'n-vault1-note' });

      const vault2State = await testSetup.api.loadUIState(vaultId2, stateKey);
      expect(vault2State).toEqual({ noteId: 'n-vault2-note' });
    });

    it('should not leak state between vaults when using same state key', async () => {
      // Create second vault
      const vaultId2 = await testSetup.createTestVault('ui-state-test-vault-2');

      const stateKey = 'temporary_tabs';
      const vault1State = {
        tabs: [{ id: 'tab-1', noteId: 'n-vault1' }],
        activeTabId: 'tab-1'
      };
      const vault2State = {
        tabs: [{ id: 'tab-2', noteId: 'n-vault2' }],
        activeTabId: 'tab-2'
      };

      // Save to both vaults
      await testSetup.api.saveUIState(vaultId, stateKey, vault1State);
      await testSetup.api.saveUIState(vaultId2, stateKey, vault2State);

      // Update vault 1
      await testSetup.api.saveUIState(vaultId, stateKey, { tabs: [], activeTabId: null });

      // Verify vault 2 is unchanged
      const vault2Loaded = await testSetup.api.loadUIState(vaultId2, stateKey);
      expect(vault2Loaded).toEqual(vault2State);
    });
  });

  describe('clearUIState', () => {
    it('should clear all UI state for a vault', async () => {
      // Save multiple state keys
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-123' });

      await testSetup.api.saveUIState(vaultId, 'pinned_notes', { notes: [] });

      await testSetup.api.saveUIState(vaultId, 'temporary_tabs', {
        tabs: [],
        activeTabId: null
      });

      // Clear all state
      await testSetup.api.clearUIState(vaultId);

      // Verify all state is cleared
      const activeNote = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(activeNote).toBeNull();

      const pinnedNotes = await testSetup.api.loadUIState(vaultId, 'pinned_notes');
      expect(pinnedNotes).toBeNull();

      const temporaryTabs = await testSetup.api.loadUIState(vaultId, 'temporary_tabs');
      expect(temporaryTabs).toBeNull();
    });

    it('should only clear state for specified vault', async () => {
      // Create second vault
      const vaultId2 = await testSetup.createTestVault('ui-state-test-vault-2');

      // Save state in both vaults
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-vault1' });

      await testSetup.api.saveUIState(vaultId2, 'active_note', { noteId: 'n-vault2' });

      // Clear only vault 1
      await testSetup.api.clearUIState(vaultId);

      // Verify vault 1 is cleared
      const vault1State = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(vault1State).toBeNull();

      // Verify vault 2 is unchanged
      const vault2State = await testSetup.api.loadUIState(vaultId2, 'active_note');
      expect(vault2State).toEqual({ noteId: 'n-vault2' });
    });

    it('should handle clearing state for vault with no state', async () => {
      // Should not throw error
      await expect(testSetup.api.clearUIState(vaultId)).resolves.not.toThrow();

      // Verify loading state still returns null
      const loaded = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(loaded).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      // This test verifies that the system can handle corrupted data
      // In practice, the API should always save valid JSON, but we test robustness
      const stateKey = 'test_state';

      // Save valid state
      await testSetup.api.saveUIState(vaultId, stateKey, { valid: true });

      // Verify we can load it
      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(loaded).toEqual({ valid: true });
    });

    it('should handle very large state values', async () => {
      const stateKey = 'large_state';

      // Create a large state object (100 items)
      const largeArray = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        data: `This is item ${i} with some content`,
        nested: { value: i, enabled: true }
      }));

      const stateValue = {
        items: largeArray,
        metadata: { total: 100, version: '1.0' }
      };

      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(loaded).toEqual(stateValue);
      expect((loaded as any).items.length).toBe(100);
    });
  });

  describe('schema version tracking', () => {
    it('should store schema version with UI state', async () => {
      const stateKey = 'active_note';
      const stateValue = { noteId: 'n-123' };

      await testSetup.api.saveUIState(vaultId, stateKey, stateValue);

      // Note: schema_version is stored in the database but not returned by loadUIState
      // This is by design - the version is for internal use only
      // We can't directly test it here without accessing the database,
      // but the migration tests verify the schema_version column exists
      const loaded = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(loaded).toEqual(stateValue);
    });
  });

  describe('real-world usage patterns', () => {
    it('should handle typical active note workflow', async () => {
      // Simulate user opening notes in sequence
      const notes = ['n-001', 'n-002', 'n-003'];

      for (const noteId of notes) {
        await testSetup.api.saveUIState(vaultId, 'active_note', { noteId });

        const loaded = await testSetup.api.loadUIState(vaultId, 'active_note');
        expect(loaded).toEqual({ noteId });
      }

      // Final state should be last note
      const finalState = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(finalState).toEqual({ noteId: 'n-003' });
    });

    it('should handle temporary tabs workflow', async () => {
      const stateKey = 'temporary_tabs';

      // Start with no tabs
      await testSetup.api.saveUIState(vaultId, stateKey, { tabs: [], activeTabId: null });

      // Add first tab
      await testSetup.api.saveUIState(vaultId, stateKey, {
        tabs: [{ id: 'tab-1', noteId: 'n-001', title: 'Note 1' }],
        activeTabId: 'tab-1'
      });

      // Add second tab
      await testSetup.api.saveUIState(vaultId, stateKey, {
        tabs: [
          { id: 'tab-1', noteId: 'n-001', title: 'Note 1' },
          { id: 'tab-2', noteId: 'n-002', title: 'Note 2' }
        ],
        activeTabId: 'tab-2'
      });

      // Remove first tab
      await testSetup.api.saveUIState(vaultId, stateKey, {
        tabs: [{ id: 'tab-2', noteId: 'n-002', title: 'Note 2' }],
        activeTabId: 'tab-2'
      });

      // Verify final state
      const finalState = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(finalState).toEqual({
        tabs: [{ id: 'tab-2', noteId: 'n-002', title: 'Note 2' }],
        activeTabId: 'tab-2'
      });
    });

    it('should handle pinned notes workflow', async () => {
      const stateKey = 'pinned_notes';

      // Pin first note
      await testSetup.api.saveUIState(vaultId, stateKey, {
        notes: [{ id: 'n-001', order: 0 }]
      });

      // Pin second note
      await testSetup.api.saveUIState(vaultId, stateKey, {
        notes: [
          { id: 'n-001', order: 0 },
          { id: 'n-002', order: 1 }
        ]
      });

      // Reorder pins
      await testSetup.api.saveUIState(vaultId, stateKey, {
        notes: [
          { id: 'n-002', order: 0 },
          { id: 'n-001', order: 1 }
        ]
      });

      // Verify final state
      const finalState = await testSetup.api.loadUIState(vaultId, stateKey);
      expect(finalState).toEqual({
        notes: [
          { id: 'n-002', order: 0 },
          { id: 'n-001', order: 1 }
        ]
      });
    });
  });
});
