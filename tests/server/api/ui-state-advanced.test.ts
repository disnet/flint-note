import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';

/**
 * Advanced UI State Tests - Priority 1
 *
 * This test suite covers the critical scenarios for DB-based UI state management:
 * 1. Concurrent vault operations (the core problem the migration solved)
 * 2. Error recovery and edge cases
 * 3. State key schema compliance
 * 4. Multi-vault state management
 *
 * Related docs:
 * - docs/architecture/DB-UI-STATE-MIGRATION.md
 * - docs/architecture/UI-STATE-TEST-COVERAGE.md
 */

describe('UI State - Advanced Tests', () => {
  let testSetup: TestApiSetup;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  // =================================================================
  // Priority 1.1: Concurrent Vault Operations
  // =================================================================

  describe('Concurrent vault operations', () => {
    it('should isolate UI state during rapid vault switching', async () => {
      // Create 3 vaults
      const vaultA = await testSetup.createTestVault('vault-a');
      const vaultB = await testSetup.createTestVault('vault-b');
      const vaultC = await testSetup.createTestVault('vault-c');

      // Set different state in each vault
      await testSetup.api.saveUIState(vaultA, 'active_note', { noteId: 'n-a1' });
      await testSetup.api.saveUIState(vaultB, 'active_note', { noteId: 'n-b1' });
      await testSetup.api.saveUIState(vaultC, 'active_note', { noteId: 'n-c1' });

      // Simulate rapid switching: A → B → A → C → B
      const stateA1 = await testSetup.api.loadUIState(vaultA, 'active_note');
      const stateB1 = await testSetup.api.loadUIState(vaultB, 'active_note');
      const stateA2 = await testSetup.api.loadUIState(vaultA, 'active_note');
      const stateC1 = await testSetup.api.loadUIState(vaultC, 'active_note');
      const stateB2 = await testSetup.api.loadUIState(vaultB, 'active_note');

      // Verify no cross-contamination
      expect(stateA1).toEqual({ noteId: 'n-a1' });
      expect(stateA2).toEqual({ noteId: 'n-a1' });
      expect(stateB1).toEqual({ noteId: 'n-b1' });
      expect(stateB2).toEqual({ noteId: 'n-b1' });
      expect(stateC1).toEqual({ noteId: 'n-c1' });
    });

    it('should handle concurrent writes to different vaults', async () => {
      const vaultA = await testSetup.createTestVault('vault-a');
      const vaultB = await testSetup.createTestVault('vault-b');

      // Write to both vaults concurrently
      await Promise.all([
        testSetup.api.saveUIState(vaultA, 'active_note', { noteId: 'n-a1' }),
        testSetup.api.saveUIState(vaultB, 'active_note', { noteId: 'n-b1' }),
        testSetup.api.saveUIState(vaultA, 'pinned_notes', {
          notes: [{ id: 'n-a2', order: 0 }]
        }),
        testSetup.api.saveUIState(vaultB, 'pinned_notes', {
          notes: [{ id: 'n-b2', order: 0 }]
        })
      ]);

      // Verify all writes succeeded and are isolated
      const aActive = await testSetup.api.loadUIState(vaultA, 'active_note');
      const bActive = await testSetup.api.loadUIState(vaultB, 'active_note');
      const aPinned = await testSetup.api.loadUIState(vaultA, 'pinned_notes');
      const bPinned = await testSetup.api.loadUIState(vaultB, 'pinned_notes');

      expect(aActive).toEqual({ noteId: 'n-a1' });
      expect(bActive).toEqual({ noteId: 'n-b1' });
      expect(aPinned).toEqual({ notes: [{ id: 'n-a2', order: 0 }] });
      expect(bPinned).toEqual({ notes: [{ id: 'n-b2', order: 0 }] });
    });

    it('should handle concurrent writes to same state key in same vault', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Write to same key concurrently - last write should win
      await Promise.all([
        testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-1' }),
        testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-2' }),
        testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-3' })
      ]);

      // Verify one of the writes succeeded (don't care which, just verify no corruption)
      const state = await testSetup.api.loadUIState(vaultId, 'active_note');
      expect(state).toMatchObject({ noteId: expect.stringMatching(/^n-[123]$/) });
    });

    it('should maintain vault isolation when updating same state key', async () => {
      const vaultA = await testSetup.createTestVault('vault-a');
      const vaultB = await testSetup.createTestVault('vault-b');

      // Both vaults start with same state
      await testSetup.api.saveUIState(vaultA, 'temporary_tabs', {
        tabs: [{ id: 'tab-1', noteId: 'n-shared' }],
        activeTabId: 'tab-1'
      });
      await testSetup.api.saveUIState(vaultB, 'temporary_tabs', {
        tabs: [{ id: 'tab-1', noteId: 'n-shared' }],
        activeTabId: 'tab-1'
      });

      // Update vault A multiple times
      await testSetup.api.saveUIState(vaultA, 'temporary_tabs', {
        tabs: [
          { id: 'tab-1', noteId: 'n-shared' },
          { id: 'tab-2', noteId: 'n-a-specific' }
        ],
        activeTabId: 'tab-2'
      });
      await testSetup.api.saveUIState(vaultA, 'temporary_tabs', {
        tabs: [{ id: 'tab-2', noteId: 'n-a-specific' }],
        activeTabId: 'tab-2'
      });

      // Verify vault B is unchanged
      const stateB = await testSetup.api.loadUIState(vaultB, 'temporary_tabs');
      expect(stateB).toEqual({
        tabs: [{ id: 'tab-1', noteId: 'n-shared' }],
        activeTabId: 'tab-1'
      });
    });
  });

  // =================================================================
  // Priority 1.2: Error Recovery and Edge Cases
  // =================================================================

  describe('Error recovery', () => {
    it('should handle missing vault gracefully', async () => {
      // Try to load state for non-existent vault
      // The API throws an error for non-existent vaults, which is expected behavior
      await expect(
        testSetup.api.loadUIState('non-existent-vault-id', 'active_note')
      ).rejects.toThrow("Vault with ID 'non-existent-vault-id' does not exist");
    });

    it('should handle invalid state_key gracefully', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Save with invalid key
      await testSetup.api.saveUIState(vaultId, 'totally_unknown_key', { data: 'test' });

      // Should save successfully (we don't validate keys)
      const loaded = await testSetup.api.loadUIState(vaultId, 'totally_unknown_key');
      expect(loaded).toEqual({ data: 'test' });
    });

    it('should handle extremely large state values', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Create very large state (1000 items)
      const largeState = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: `item-${i}`,
          title: `Title ${i}`,
          content: 'Lorem ipsum '.repeat(50), // ~550 chars each
          metadata: { created: new Date().toISOString(), index: i }
        }))
      };

      // Should handle without error
      await testSetup.api.saveUIState(vaultId, 'large_state', largeState);
      const loaded = await testSetup.api.loadUIState(vaultId, 'large_state');

      expect(loaded).toEqual(largeState);
      expect((loaded as any).items.length).toBe(1000);
    });

    it('should handle empty/null/undefined values in state', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Test various empty values
      await testSetup.api.saveUIState(vaultId, 'empty_object', {});
      await testSetup.api.saveUIState(vaultId, 'empty_array', { items: [] });
      await testSetup.api.saveUIState(vaultId, 'null_value', { value: null });
      await testSetup.api.saveUIState(vaultId, 'undefined_becomes_null', {
        value: undefined
      });

      const emptyObj = await testSetup.api.loadUIState(vaultId, 'empty_object');
      const emptyArr = await testSetup.api.loadUIState(vaultId, 'empty_array');
      const nullVal = await testSetup.api.loadUIState(vaultId, 'null_value');
      const undefinedVal = await testSetup.api.loadUIState(
        vaultId,
        'undefined_becomes_null'
      );

      expect(emptyObj).toEqual({});
      expect(emptyArr).toEqual({ items: [] });
      expect(nullVal).toEqual({ value: null });
      // undefined properties are removed in JSON serialization
      expect(undefinedVal).toEqual({});
    });

    it('should handle rapid updates to same state key', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Rapidly update cursor position (simulating user scrolling)
      const updates = [];
      for (let i = 0; i < 20; i++) {
        updates.push(
          testSetup.api.saveUIState(vaultId, 'cursor_positions', {
            positions: { 'n-test': { position: i * 100, line: i, column: 0 } }
          })
        );
      }

      await Promise.all(updates);

      // Final state should be valid (any of the updates)
      const final = await testSetup.api.loadUIState(vaultId, 'cursor_positions');
      expect(final).toMatchObject({
        positions: {
          'n-test': {
            position: expect.any(Number),
            line: expect.any(Number),
            column: 0
          }
        }
      });
    });

    it('should maintain data integrity after clear and re-save', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // Save state
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-1' });
      await testSetup.api.saveUIState(vaultId, 'pinned_notes', {
        notes: [{ id: 'n-2', order: 0 }]
      });

      // Clear all
      await testSetup.api.clearUIState(vaultId);

      // Save new state
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-3' });

      // Verify clean slate
      const active = await testSetup.api.loadUIState(vaultId, 'active_note');
      const pinned = await testSetup.api.loadUIState(vaultId, 'pinned_notes');

      expect(active).toEqual({ noteId: 'n-3' });
      expect(pinned).toBeNull(); // Should not exist
    });
  });

  // =================================================================
  // Priority 1.3: State Key Schema Compliance
  // =================================================================

  describe('State key schema compliance', () => {
    // Document expected schemas for each state key
    const EXPECTED_SCHEMAS = {
      active_note: { noteId: expect.any(String) },
      temporary_tabs: {
        tabs: expect.any(Array),
        activeTabId: expect.any(String),
        maxTabs: expect.any(Number),
        autoCleanupHours: expect.any(Number)
      },
      navigation_history: {
        customHistory: expect.any(Array),
        currentIndex: expect.any(Number),
        maxHistorySize: expect.any(Number)
      },
      cursor_positions: {
        positions: expect.any(Object)
      },
      pinned_notes: {
        notes: expect.any(Array)
      },
      conversations: {
        threads: expect.any(Array),
        activeThreadId: expect.any(String)
      }
    };

    it('should accept all documented state keys', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      // active_note
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: 'n-123' });

      // temporary_tabs
      await testSetup.api.saveUIState(vaultId, 'temporary_tabs', {
        tabs: [{ id: 'tab-1', noteId: 'n-1', title: 'Test' }],
        activeTabId: 'tab-1',
        maxTabs: 10,
        autoCleanupHours: 24
      });

      // navigation_history
      await testSetup.api.saveUIState(vaultId, 'navigation_history', {
        customHistory: [{ noteId: 'n-1', timestamp: Date.now() }],
        currentIndex: 0,
        maxHistorySize: 50
      });

      // cursor_positions
      await testSetup.api.saveUIState(vaultId, 'cursor_positions', {
        positions: { 'n-1': { position: 100, line: 5, column: 10 } }
      });

      // pinned_notes
      await testSetup.api.saveUIState(vaultId, 'pinned_notes', {
        notes: [{ id: 'n-1', order: 0 }]
      });

      // conversations
      await testSetup.api.saveUIState(vaultId, 'conversations', {
        threads: [{ id: 't-1', messages: [] }],
        activeThreadId: 't-1'
      });

      // Verify all can be loaded
      for (const key of Object.keys(EXPECTED_SCHEMAS)) {
        const loaded = await testSetup.api.loadUIState(vaultId, key);
        expect(loaded).toBeDefined();
      }
    });

    it('should preserve complex temporary_tabs structure', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      const complexTabs = {
        tabs: [
          {
            id: 'tab-1',
            noteId: 'n-1',
            title: 'First Note',
            createdAt: Date.now(),
            isPinned: false
          },
          {
            id: 'tab-2',
            noteId: 'n-2',
            title: 'Second Note',
            createdAt: Date.now() + 1000,
            isPinned: true
          }
        ],
        activeTabId: 'tab-2',
        maxTabs: 15,
        autoCleanupHours: 48
      };

      await testSetup.api.saveUIState(vaultId, 'temporary_tabs', complexTabs);
      const loaded = await testSetup.api.loadUIState(vaultId, 'temporary_tabs');

      expect(loaded).toEqual(complexTabs);
    });

    it('should preserve complex navigation_history structure', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      const complexHistory = {
        customHistory: [
          { noteId: 'n-1', timestamp: Date.now(), scrollPosition: 100 },
          { noteId: 'n-2', timestamp: Date.now() + 1000, scrollPosition: 0 },
          { noteId: 'n-1', timestamp: Date.now() + 2000, scrollPosition: 500 }
        ],
        currentIndex: 2,
        maxHistorySize: 100
      };

      await testSetup.api.saveUIState(vaultId, 'navigation_history', complexHistory);
      const loaded = await testSetup.api.loadUIState(vaultId, 'navigation_history');

      expect(loaded).toEqual(complexHistory);
    });

    it('should handle pinned_notes with ordering', async () => {
      const vaultId = await testSetup.createTestVault('test-vault');

      const pinnedNotes = {
        notes: [
          { id: 'n-3', order: 0, pinnedAt: Date.now() },
          { id: 'n-1', order: 1, pinnedAt: Date.now() - 1000 },
          { id: 'n-5', order: 2, pinnedAt: Date.now() - 2000 }
        ]
      };

      await testSetup.api.saveUIState(vaultId, 'pinned_notes', pinnedNotes);
      const loaded = await testSetup.api.loadUIState(vaultId, 'pinned_notes');

      expect(loaded).toEqual(pinnedNotes);
      expect((loaded as any).notes[0].order).toBe(0);
      expect((loaded as any).notes[2].order).toBe(2);
    });
  });

  // =================================================================
  // Priority 1.4: Multi-Vault State Management
  // =================================================================

  describe('Multi-vault state management', () => {
    it('should handle 10 vaults with independent state', async () => {
      // Create 10 vaults
      const vaults = [];
      for (let i = 0; i < 10; i++) {
        const vaultId = await testSetup.createTestVault(`vault-${i}`);
        vaults.push(vaultId);

        // Give each vault unique state
        await testSetup.api.saveUIState(vaultId, 'active_note', {
          noteId: `n-vault-${i}`
        });
        await testSetup.api.saveUIState(vaultId, 'pinned_notes', {
          notes: [{ id: `n-pinned-${i}`, order: 0 }]
        });
      }

      // Verify each vault has correct state
      for (let i = 0; i < 10; i++) {
        const active = await testSetup.api.loadUIState(vaults[i], 'active_note');
        const pinned = await testSetup.api.loadUIState(vaults[i], 'pinned_notes');

        expect(active).toEqual({ noteId: `n-vault-${i}` });
        expect(pinned).toEqual({ notes: [{ id: `n-pinned-${i}`, order: 0 }] });
      }
    });

    it('should handle clear operation on one vault without affecting others', async () => {
      const vault1 = await testSetup.createTestVault('vault-1');
      const vault2 = await testSetup.createTestVault('vault-2');
      const vault3 = await testSetup.createTestVault('vault-3');

      // Set state in all vaults
      for (const vaultId of [vault1, vault2, vault3]) {
        await testSetup.api.saveUIState(vaultId, 'active_note', {
          noteId: `n-${vaultId}`
        });
        await testSetup.api.saveUIState(vaultId, 'pinned_notes', { notes: [] });
      }

      // Clear vault 2
      await testSetup.api.clearUIState(vault2);

      // Verify vault 1 and 3 unchanged
      expect(await testSetup.api.loadUIState(vault1, 'active_note')).toEqual({
        noteId: `n-${vault1}`
      });
      expect(await testSetup.api.loadUIState(vault3, 'active_note')).toEqual({
        noteId: `n-${vault3}`
      });

      // Verify vault 2 cleared
      expect(await testSetup.api.loadUIState(vault2, 'active_note')).toBeNull();
      expect(await testSetup.api.loadUIState(vault2, 'pinned_notes')).toBeNull();
    });

    it('should support same state values across different vaults', async () => {
      const vault1 = await testSetup.createTestVault('vault-1');
      const vault2 = await testSetup.createTestVault('vault-2');

      // Both vaults can have note with same ID (different workspaces)
      const sharedState = { noteId: 'n-shared-name' };

      await testSetup.api.saveUIState(vault1, 'active_note', sharedState);
      await testSetup.api.saveUIState(vault2, 'active_note', sharedState);

      // Updating one vault shouldn't affect the other
      await testSetup.api.saveUIState(vault1, 'active_note', { noteId: 'n-different' });

      expect(await testSetup.api.loadUIState(vault1, 'active_note')).toEqual({
        noteId: 'n-different'
      });
      expect(await testSetup.api.loadUIState(vault2, 'active_note')).toEqual(sharedState);
    });
  });
});
