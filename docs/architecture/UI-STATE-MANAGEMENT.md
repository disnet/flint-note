# UI State Management Architecture

## Overview

Flint uses a **database-first approach** for all UI state persistence. This architecture ensures per-vault isolation, eliminates race conditions, and provides a single source of truth for application state.

## Core Principles

1. **Database as Single Source of Truth**: All UI state is stored in SQLite, not browser storage
2. **Per-Vault Isolation**: Each vault maintains independent UI state
3. **No Browser Storage**: Zero usage of localStorage, sessionStorage, or IndexedDB
4. **Atomic Updates**: Database transactions ensure consistency
5. **Graceful Degradation**: Missing or corrupted state falls back to sensible defaults

## Architecture Diagram

```
┌─────────────────────────────────────┐
│ Renderer Process (Svelte)          │
│  - UI Components                    │
│  - Svelte Stores ($state runes)     │
│  - No Browser Storage               │
└─────────────────────────────────────┘
                 ↓ IPC
         (load/save/clear UI state)
                 ↓
┌─────────────────────────────────────┐
│ Main Process (Electron)             │
│  - IPC Handlers                     │
│  - NoteService                      │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│ Server Layer                        │
│  - FlintNoteApi                     │
│  - HybridSearchManager              │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│ Database Layer                      │
│  {workspace}/.flint-note/search.db  │
│  - notes table                      │
│  - ui_state table                   │
└─────────────────────────────────────┘
```

## Database Schema

### UI State Table

```sql
CREATE TABLE ui_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_value TEXT NOT NULL,        -- JSON serialized
  schema_version TEXT NOT NULL DEFAULT '2.0.0',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vault_id, state_key)
);

CREATE INDEX idx_ui_state_vault ON ui_state(vault_id);
CREATE INDEX idx_ui_state_key ON ui_state(vault_id, state_key);
```

### State Keys

| State Key            | Purpose                      | Store                  |
| -------------------- | ---------------------------- | ---------------------- |
| `active_note`        | Currently selected note      | activeNoteStore        |
| `temporary_tabs`     | Open tabs and tab state      | temporaryTabsStore     |
| `navigation_history` | Forward/back navigation      | navigationHistoryStore |
| `cursor_positions`   | Editor cursor positions      | cursorPositionStore    |
| `pinned_notes`       | Pinned notes sidebar         | pinnedStore            |
| `conversations`      | Chat threads and active chat | unifiedChatStore       |

## API Layer

### IPC Interface

**Load UI State:**

```typescript
window.api.loadUIState({
  vaultId: string,
  stateKey: string
}) → Promise<object | null>
```

**Save UI State:**

```typescript
window.api.saveUIState({
  vaultId: string,
  stateKey: string,
  stateValue: object
}) → Promise<{ success: boolean }>
```

**Clear UI State:**

```typescript
window.api.clearUIState({
  vaultId: string
}) → Promise<{ success: boolean }>
```

### Implementation Flow

1. **Renderer** calls `window.api.loadUIState()` via IPC
2. **Main Process** handler receives request
3. **NoteService** wrapper validates vault exists
4. **FlintNoteApi** queries database via HybridSearchManager
5. **Database** returns JSON state value
6. Response flows back through layers to renderer

## Store Pattern

All Svelte stores follow a consistent pattern for state persistence:

### Loading State

```typescript
private async loadFromStorage(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const vaultId = this.state.currentVaultId || 'default';
    const stored = await window.api?.loadUIState({
      vaultId,
      stateKey: 'my_state_key'
    });

    if (stored) {
      // Apply stored state
      this.state.data = stored;
    } else {
      // Use default state
      this.state.data = this.getDefaultState();
    }
  } catch (error) {
    console.warn('Failed to load state:', error);
    this.state.data = this.getDefaultState();
  }
}
```

### Saving State

```typescript
private async saveToStorage(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const vaultId = this.state.currentVaultId || 'default';

    // CRITICAL: Use $state.snapshot() for IPC serialization
    const serializable = $state.snapshot(this.state.data);

    await window.api?.saveUIState({
      vaultId,
      stateKey: 'my_state_key',
      stateValue: serializable
    });
  } catch (error) {
    console.warn('Failed to save state:', error);
    throw error;
  }
}
```

### Critical: Svelte Reactivity and IPC

**Always use `$state.snapshot()` when sending reactive objects through IPC**

Svelte's `$state` objects contain reactivity metadata that breaks structured cloning:

```typescript
// ❌ WRONG - IPC will fail
await window.api?.saveUIState({
  vaultId,
  stateKey: 'data',
  stateValue: this.reactiveState // Contains Svelte proxies
});

// ✅ CORRECT - Snapshot removes reactivity
const plain = $state.snapshot(this.reactiveState);
await window.api?.saveUIState({
  vaultId,
  stateKey: 'data',
  stateValue: plain // Plain JavaScript object
});
```

## Vault Switching

When switching vaults, stores automatically reload state:

1. User switches to vault B
2. `currentVaultId` changes in stores
3. `$effect` triggers `loadFromStorage()`
4. New state loaded from vault B's `ui_state` rows
5. UI updates to reflect vault B's state

Each vault maintains completely isolated state:

- Vault A's tabs ≠ Vault B's tabs
- Vault A's active note ≠ Vault B's active note
- No cross-contamination possible

## Migration and Schema Versioning

### Current Version: 2.0.0

The migration to v2.0.0 includes:

1. Immutable note IDs (hash → UUID)
2. UI state table creation
3. **Clearing old UI state** (note IDs changed)

### Why Clear UI State on Migration

When migrating from v1.x to v2.0.0:

- Note IDs change format completely
- Old UI state contains references to old IDs
- Loading old UI state would cause "note not found" errors
- **Solution**: Clear all UI state, let users start fresh

### Future Migrations

Future schema changes can migrate UI state intelligently:

```typescript
{
  version: '2.1.0',
  description: 'Add new UI feature',
  migrationFunction: async (db) => {
    // Can preserve existing state
    // Can transform state_value JSON
    // Can add new state_key entries
    await db.run(`
      UPDATE ui_state
      SET schema_version = '2.1.0'
      WHERE schema_version = '2.0.0'
    `);
  }
}
```

## Error Handling

### Graceful Degradation

All stores handle errors gracefully:

**Missing State:**

- Returns `null` from database
- Store uses default state
- User sees fresh UI

**Corrupted State:**

- JSON parse fails
- Catch error, log warning
- Fall back to defaults

**Missing Vault:**

- Database connection fails
- Error logged
- Return null, use defaults

### No User Interruption

UI state errors never block the app:

- Notes always load
- UI always renders
- State problems logged silently
- Defaults provide working experience

## Performance Considerations

### Fast Loads

- SQLite queries are fast (< 1ms)
- Indexed by `(vault_id, state_key)`
- Single query per state key
- Lazy loading on demand

### Efficient Updates

- Upsert pattern (INSERT ... ON CONFLICT UPDATE)
- No separate existence check needed
- Atomic operation
- Transaction support available

### Debouncing

Some stores debounce frequent updates:

```typescript
// Example: Cursor positions save after 500ms idle
private debouncedSave = debounce(() => {
  this.saveToStorage();
}, 500);
```

## Testing Strategy

### Unit Tests

Test stores in isolation:

- Mock `window.api` methods
- Verify load/save calls made correctly
- Test error handling paths
- Verify default state fallback

### Integration Tests

Test with real database:

- Use `TestApiSetup` for isolated DB
- Verify state persists across loads
- Test vault switching scenarios
- Verify data isolation

### Migration Tests

Test schema migrations:

- Verify v1 → v2 clears UI state
- Test future migration paths
- Ensure no data corruption

## Benefits of This Architecture

### Developer Experience

- **Simple API**: Three methods (load/save/clear)
- **Consistent Pattern**: All stores follow same structure
- **Type Safety**: TypeScript throughout
- **Testable**: Easy to mock and test

### Reliability

- **No Race Conditions**: Database initialized before stores
- **Atomic Updates**: Transaction support
- **No Storage Limits**: SQLite handles large state
- **Per-Vault**: No cross-contamination bugs

### User Experience

- **Fast**: Sub-millisecond queries
- **Resilient**: Graceful error handling
- **Predictable**: State always vault-specific
- **Recoverable**: Can clear and rebuild state

## Related Documentation

- [Migration Plan](../prds/DB-UI-STATE-MIGRATION.md) - Detailed implementation history
- [Database Schema](../../src/server/database/schema.ts) - Full schema definitions
- [Migration Manager](../../src/server/database/migration-manager.ts) - Schema versioning logic
- [FlintNoteApi](../../src/server/api/flint-note-api.ts) - Server API implementation

## Summary

Flint's UI state management is built on **database-first principles** for reliability and simplicity:

- ✅ Single source of truth (SQLite)
- ✅ Per-vault isolation (no cross-contamination)
- ✅ No browser storage (eliminates whole class of bugs)
- ✅ Graceful degradation (errors never break the app)
- ✅ Simple API (load/save/clear)
- ✅ Consistent pattern (all stores identical)
- ✅ Fast and reliable (SQLite performance)

This architecture provides a solid foundation for future enhancements while maintaining stability and user trust.
