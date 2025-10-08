# UI State Management - Test Coverage Analysis

**Status:** Test gap analysis for DB-based UI state management (v2.0.0)

**Related:** [DB-UI-STATE-MIGRATION.md](./DB-UI-STATE-MIGRATION.md)

---

## Executive Summary

After migrating UI state from localStorage/JSON files to the database, we have solid coverage of basic CRUD operations and migration logic. However, there are gaps in:

1. **Concurrent vault operations** (the core problem the migration solved)
2. **Error recovery and edge cases**
3. **End-to-end store integration**

This document prioritizes test recommendations based on what's implementable with our current Vitest test harness.

---

## Current Test Coverage

### ✅ Well-Covered

**`tests/server/api/ui-state.test.ts`** (375 lines)
- Basic save/load operations
- Complex data structures (arrays, nested objects)
- Vault isolation (basic)
- Clear operations
- Data type preservation
- Real-world usage patterns

**`tests/server/database/migration-manager.test.ts`** (876 lines)
- v1.1.0 → v2.0.0 migration
- UI state table creation and schema
- Partial migration recovery
- Idempotency
- Edge cases (special characters, missing frontmatter)

### ❌ Coverage Gaps

See prioritized recommendations below.

---

## Test Recommendations

### Priority 1: Implementable with Current Test Harness

These tests can be written **today** using our existing `TestApiSetup` infrastructure.

#### 1.1 Concurrent Vault Operations

**Why critical:** The root cause of the original bug was global localStorage contaminating per-vault state during vault switching.

**Tests to add:**

```typescript
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
      testSetup.api.saveUIState(vaultA, 'pinned_notes', { notes: [{ id: 'n-a2', order: 0 }] }),
      testSetup.api.saveUIState(vaultB, 'pinned_notes', { notes: [{ id: 'n-b2', order: 0 }] })
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
      tabs: [{ id: 'tab-1', noteId: 'n-shared' }, { id: 'tab-2', noteId: 'n-a-specific' }],
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
```

**Estimated effort:** 2-3 hours
**Impact:** High - validates core architecture fix

---

#### 1.2 Error Recovery and Edge Cases

**Why critical:** Production stability requires graceful degradation.

**Tests to add:**

```typescript
describe('Error recovery', () => {
  it('should handle missing vault gracefully', async () => {
    // Try to load state for non-existent vault
    const state = await testSetup.api.loadUIState('non-existent-vault-id', 'active_note');

    // Should return null, not throw
    expect(state).toBeNull();
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
    await testSetup.api.saveUIState(vaultId, 'undefined_becomes_null', { value: undefined });

    const emptyObj = await testSetup.api.loadUIState(vaultId, 'empty_object');
    const emptyArr = await testSetup.api.loadUIState(vaultId, 'empty_array');
    const nullVal = await testSetup.api.loadUIState(vaultId, 'null_value');
    const undefinedVal = await testSetup.api.loadUIState(vaultId, 'undefined_becomes_null');

    expect(emptyObj).toEqual({});
    expect(emptyArr).toEqual({ items: [] });
    expect(nullVal).toEqual({ value: null });
    // undefined becomes null in JSON serialization
    expect(undefinedVal).toEqual({ value: null });
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
    await testSetup.api.saveUIState(vaultId, 'pinned_notes', { notes: [{ id: 'n-2', order: 0 }] });

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
```

**Estimated effort:** 2-3 hours
**Impact:** High - prevents production errors

---

#### 1.3 State Key Schema Compliance

**Why important:** Validates actual usage matches documented schema.

**Tests to add:**

```typescript
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
```

**Estimated effort:** 1-2 hours
**Impact:** Medium - documents and validates schema contracts

---

#### 1.4 Multi-Vault State Management

**Why important:** Real users have multiple vaults; need to ensure clean separation.

**Tests to add:**

```typescript
describe('Multi-vault state management', () => {
  it('should handle 10 vaults with independent state', async () => {
    // Create 10 vaults
    const vaults = [];
    for (let i = 0; i < 10; i++) {
      const vaultId = await testSetup.createTestVault(`vault-${i}`);
      vaults.push(vaultId);

      // Give each vault unique state
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: `n-vault-${i}` });
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
      await testSetup.api.saveUIState(vaultId, 'active_note', { noteId: `n-${vaultId}` });
      await testSetup.api.saveUIState(vaultId, 'pinned_notes', { notes: [] });
    }

    // Clear vault 2
    await testSetup.api.clearUIState(vault2);

    // Verify vault 1 and 3 unchanged
    expect(await testSetup.api.loadUIState(vault1, 'active_note')).toEqual({ noteId: `n-${vault1}` });
    expect(await testSetup.api.loadUIState(vault3, 'active_note')).toEqual({ noteId: `n-${vault3}` });

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

    expect(await testSetup.api.loadUIState(vault1, 'active_note')).toEqual({ noteId: 'n-different' });
    expect(await testSetup.api.loadUIState(vault2, 'active_note')).toEqual(sharedState);
  });
});
```

**Estimated effort:** 1-2 hours
**Impact:** Medium - validates multi-vault isolation

---

### Priority 2: Requires Test Infrastructure Changes

These tests would benefit from additional test utilities or renderer-process testing capabilities.

#### 2.1 Store-Level Integration Tests

**Current limitation:** Our tests run in Node.js; stores run in browser/Svelte environment.

**What's needed:**
- Mock IPC layer (`window.api`)
- Mock Svelte reactivity (`$state`, `$derived`)
- Test harness that can initialize stores

**Tests we'd want:**

```typescript
// Requires: Browser-like test environment
describe('ActiveNoteStore integration', () => {
  it('should persist active note across reinitialization', async () => {
    // Initialize store
    const store1 = new ActiveNoteStore();
    await store1.setActiveNote({ id: 'n-123', title: 'Test' });

    // Destroy and recreate
    const store2 = new ActiveNoteStore();
    await store2.ensureInitialized();

    // Should restore state
    expect(store2.activeNote?.id).toBe('n-123');
  });
});
```

**Estimated effort:** 4-6 hours (need to build test infrastructure)
**Impact:** Medium - could catch store-specific bugs

**Recommendation:** Defer until we have browser-like test environment or Vitest browser mode.

---

#### 2.2 $state.snapshot() Compliance Tests

**Current limitation:** Need Svelte runtime in tests.

**What's needed:**
- Svelte compiler integration
- Mock Svelte runes
- IPC call interception

**Tests we'd want:**

```typescript
// Requires: Svelte test environment
describe('Svelte reactivity compliance', () => {
  it('should use $state.snapshot before IPC calls', async () => {
    const store = new TemporaryTabsStore();

    // Mock IPC and verify snapshot was used
    const spy = vi.spyOn(window.api, 'saveUIState');

    await store.addTab({ id: 'tab-1', noteId: 'n-1', title: 'Test' });

    // Verify snapshot was called (no Svelte proxy objects sent)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        stateValue: expect.not.objectContaining({
          __v_isReactive: expect.anything()
        })
      })
    );
  });
});
```

**Estimated effort:** 6-8 hours (need Svelte test infrastructure)
**Impact:** Low-Medium - important for correctness but failures are obvious

**Recommendation:** Defer or handle via manual testing/code review. Add ESLint rule if possible.

---

#### 2.3 Performance Tests

**Current limitation:** Need realistic data sets and timing infrastructure.

**What's needed:**
- Performance timing utilities
- Large test data generators
- Baseline measurements

**Estimated effort:** 4-6 hours
**Impact:** Low - performance issues are usually discovered manually

**Recommendation:** Defer; handle via manual testing and profiling.

---

### Priority 3: Not Feasible with Current Infrastructure

#### 3.1 Multi-Instance/Multi-Window Tests

**Why not feasible:** Requires multiple Electron processes and IPC coordination.

**Recommendation:** Manual testing only; document test scenarios for QA.

---

## Implementation Plan

### Phase 1: High-Value, Easy Wins (6-8 hours)

1. **Concurrent vault operations** (1.1) - 2-3 hours
2. **Error recovery** (1.2) - 2-3 hours
3. **State key schema** (1.3) - 1-2 hours
4. **Multi-vault management** (1.4) - 1-2 hours

**Deliverable:** `tests/server/api/ui-state-extended.test.ts` with ~40-50 new test cases

### Phase 2: Infrastructure Investment (10-14 hours)

Only if we want store-level testing:

1. Set up Vitest browser mode or Svelte test environment
2. Implement store integration tests (2.1)
3. Implement $state.snapshot tests (2.2)

**Recommendation:** Defer Phase 2 until we have broader renderer testing needs.

---

## Test File Organization

### Recommended Structure

```
tests/
├── server/
│   ├── api/
│   │   ├── ui-state.test.ts              # ✅ Existing: Basic CRUD
│   │   ├── ui-state-concurrency.test.ts  # 🆕 Priority 1.1
│   │   ├── ui-state-errors.test.ts       # 🆕 Priority 1.2
│   │   └── ui-state-schema.test.ts       # 🆕 Priority 1.3 + 1.4
│   └── database/
│       └── migration-manager.test.ts      # ✅ Existing
└── renderer/                              # 🔮 Future: Phase 2
    └── stores/
        ├── activeNoteStore.test.ts
        ├── temporaryTabsStore.test.ts
        └── ...
```

### Alternative: Single Extended Test File

If we prefer consolidation:

```
tests/
└── server/
    └── api/
        ├── ui-state.test.ts          # ✅ Existing: Basic operations
        └── ui-state-advanced.test.ts # 🆕 All Priority 1 tests (1.1-1.4)
```

**Recommendation:** Single `ui-state-advanced.test.ts` for Phase 1 to keep related tests together.

---

## Success Criteria

### Phase 1 Complete When:

- ✅ 40+ new test cases added
- ✅ All Priority 1 scenarios covered
- ✅ No regressions in existing tests
- ✅ Test execution time < 30 seconds total
- ✅ Code coverage for ui-state operations > 90%

### Overall Test Suite Health:

- ✅ Vault isolation verified under concurrent access
- ✅ Error recovery paths tested
- ✅ All documented state keys validated
- ✅ Multi-vault scenarios covered
- ✅ CI pipeline passes consistently

---

## Appendix: Manual Test Scenarios

For tests not automatable with current infrastructure:

### Manual Test 1: Multi-Window Vault Switching

1. Open vault A in window 1
2. Open vault B in window 2
3. Switch both windows to different vaults rapidly
4. Verify no UI state contamination

### Manual Test 2: Application Restart

1. Open vault, set active note, pin notes, open tabs
2. Close application completely
3. Reopen application to same vault
4. Verify all UI state restored correctly

### Manual Test 3: Database Corruption Recovery

1. Corrupt `ui_state` table (manually edit DB file)
2. Open application
3. Verify application doesn't crash, uses default state

---

## Conclusion

**Immediate action:** Implement Phase 1 tests (6-8 hours of work).

These tests will provide strong confidence in:
- Core vault isolation (the original bug)
- Error resilience
- Schema compliance
- Multi-vault operations

**Defer:** Store-level and performance tests until infrastructure exists.

**Manual testing:** Multi-window and restart scenarios.
