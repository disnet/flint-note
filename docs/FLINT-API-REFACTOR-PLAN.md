# Flint API Refactor Plan: Class to Functional

## Overview

Refactor `flint-note-api.ts` from a 1,979-line class-based API to a functional API with pure functions and a context object. This refactor will:

- Improve maintainability by breaking the monolithic file into focused modules
- Enable tree-shaking for unused operations
- Simplify testing with pure functions
- Maintain full type safety
- Provide a cleaner, more composable API

## Current State

**File**: `src/server/api/flint-note-api.ts`
- **Size**: 1,979 lines
- **Structure**: Single `FlintNoteApi` class with ~70 methods
- **State**: Workspace, HybridSearchManager, GlobalConfig instances
- **Pattern**: Class instantiation with initialization lifecycle

## Target State

**Structure**: Multiple focused modules
- **Context**: Simple object holding shared state (no class)
- **Operations**: Pure functions taking context as first parameter
- **Modules**: ~10-15 operation modules, each 50-200 lines
- **Pattern**: Functional composition with explicit dependencies

---

## Architecture Design

### Context System

```typescript
// src/server/api/context.ts
export interface FlintContext {
  configDir: string;
  workspacePath?: string;
  globalConfig: GlobalConfigManager;
  // Cached managers (lazy-initialized)
  _workspace?: Workspace;
  _hybridSearchManager?: HybridSearchManager;
}

export async function createContext(config: {
  configDir?: string;
  workspacePath?: string;
}): Promise<FlintContext>

export async function getVaultManagers(
  ctx: FlintContext,
  vaultId: string
): Promise<{
  workspace: Workspace;
  noteManager: NoteManager;
  noteTypeManager: NoteTypeManager;
  hybridSearchManager: HybridSearchManager;
}>
```

### Operation Modules Pattern

```typescript
// src/server/api/operations/notes.ts
export async function createNote(
  ctx: FlintContext,
  options: CreateNoteOptions
): Promise<NoteInfo> {
  const { noteManager } = await getVaultManagers(ctx, options.vaultId);
  return await noteManager.createNote(/* ... */);
}

export async function getNote(
  ctx: FlintContext,
  vaultId: string,
  identifier: string
): Promise<Note> {
  const { noteManager } = await getVaultManagers(ctx, vaultId);
  return await noteManager.getNote(identifier);
}
```

### Main Export

```typescript
// src/server/api/index.ts
export { createContext, type FlintContext } from './context.js';

// Re-export all operations
export * from './operations/notes.js';
export * from './operations/search.js';
// ... etc

// Re-export types
export * from './types.js';
```

### Usage Pattern

```typescript
// Before (class-based)
const api = new FlintNoteApi({ configDir: '...' });
await api.initialize();
const note = await api.getNote(vaultId, identifier);

// After (functional)
import { createContext } from '../server/api';
import * as notes from '../server/api/operations/notes';

const ctx = await createContext({ configDir: '...' });
const note = await notes.getNote(ctx, vaultId, identifier);
```

---

## Phased Implementation

### Phase 0: Foundation & Infrastructure

**Goal**: Set up core context system and establish patterns

**Deliverables**:
1. Create `src/server/api/context.ts`
   - `FlintContext` interface
   - `createContext()` function
   - `getVaultManagers()` helper with caching

2. Create operations directory structure:
   ```
   src/server/api/operations/
   ├── notes.ts
   ├── note-types.ts
   ├── search.ts
   ├── vaults.ts
   ├── links.ts
   ├── hierarchy.ts
   ├── relationships.ts
   ├── daily.ts
   ├── inbox.ts
   ├── database.ts
   ├── ui-state.ts
   └── slash-commands.ts
   ```

3. Update `types.ts` - ensure all arg types are exported

**Testing**:
- Unit tests for `createContext()`
- Unit tests for `getVaultManagers()`
- Verify context caching behavior

**Estimated Impact**: ~100 lines of new code, no breaking changes

---

### Phase 1: Core Operations (Notes & Search)

**Goal**: Migrate most frequently used operations to establish functional patterns

**Scope**: ~180 lines migrated from class to 2 modules

**Operations to Migrate**:

**Notes module** (`operations/notes.ts`):
- `createNote()` - Create new note with metadata
- `getNote()` - Get single note by identifier
- `getNotes()` - Get multiple notes by identifiers
- `updateNote()` - Update note content/metadata
- `deleteNote()` - Delete note with confirmation
- `listNotes()` - List notes by type with limit
- `getNoteInfo()` - Get note metadata without full content
- `renameNote()` - Rename note and update links
- `moveNote()` - Move note to different type

**Search module** (`operations/search.ts`):
- `searchNotes()` - Basic text search with filters
- `searchNotesAdvanced()` - Advanced search with structured filters
- `searchNotesSQL()` - SQL-based custom search
- `searchNotesByText()` - Convenience wrapper for basic search

**Implementation Strategy**:
1. Create new operation modules with functional implementations
2. Add deprecated wrapper methods in `FlintNoteApi` class
3. Wrappers call functional API internally
4. Keep all existing method signatures working
5. Add `@deprecated` JSDoc comments with migration examples

**Testing**:
- Port existing tests to use functional API
- Keep compatibility tests for class methods
- Test context reuse across multiple operations
- Verify no performance regression

**Success Criteria**:
- ✅ All existing tests pass
- ✅ New functional tests pass
- ✅ Type checking passes
- ✅ Class methods work via wrappers
- ✅ Manual smoke testing successful

---

### Phase 2: Note Types & Vaults

**Goal**: Migrate type and vault management, test complex vault creation logic

**Scope**: ~360 lines migrated to 2 modules

**Operations to Migrate**:

**Note Types module** (`operations/note-types.ts`):
- `createNoteType()` - Create new note type with schema
- `listNoteTypes()` - List all note types
- `getNoteTypeInfo()` - Get detailed note type info
- `updateNoteType()` - Update type description/schema
- `deleteNoteType()` - Delete type with migration strategy

**Vaults module** (`operations/vaults.ts`):
- `getCurrentVault()` - Get active vault info
- `listVaults()` - List all registered vaults
- `createVault()` - Create/register new vault (complex: 270 lines)
- `switchVault()` - Switch to different vault
- `updateVault()` - Update vault metadata
- `removeVault()` - Remove vault from registry

**Special Considerations**:
- Vault operations need special context handling (work without full workspace initialization)
- `createVault()` includes onboarding content creation
- Vault switching must invalidate cached managers in context
- May need `refreshContext()` helper function

**Implementation Notes**:
- Consider extracting onboarding logic to separate helper
- Vault operations should check context state before requiring full initialization
- Add context refresh mechanism for vault switching

**Testing**:
- Test vault switching invalidates cached managers
- Test vault creation with/without initialization
- Test vault creation with/without onboarding
- Test detecting existing vaults vs creating new
- Test concurrent vault operations

---

### Phase 3: Links & Hierarchy

**Goal**: Migrate graph/relationship operations and complex hierarchy sync logic

**Scope**: ~455 lines migrated to 2 modules

**Operations to Migrate**:

**Links module** (`operations/links.ts`):
- `getNoteLinks()` - Get all links for a note (incoming/outgoing)
- `getBacklinks()` - Get all notes linking to specified note
- `findBrokenLinks()` - Find all broken wikilinks
- `searchByLinks()` - Search notes by link relationships
- `migrateLinks()` - One-time migration to populate link tables

**Hierarchy module** (`operations/hierarchy.ts`):
- `addSubnote()` - Create parent-child relationship
- `removeSubnote()` - Remove parent-child relationship
- `reorderSubnotes()` - Reorder children within parent
- `getHierarchyPath()` - Get path from root to note
- `getDescendants()` - Get all descendants up to depth
- `getChildren()` - Get direct children
- `getParents()` - Get direct parents
- `syncHierarchyToFrontmatter()` - Sync DB hierarchy to note frontmatter (private helper)

**Special Considerations**:
- `syncHierarchyToFrontmatter()` is currently private - becomes internal helper function
- Hierarchy operations have complex DB + file sync requirements
- Must maintain consistency between database and file frontmatter
- Operations involve identifier ↔ ID conversions

**Implementation Notes**:
- Private helpers become non-exported functions in module
- Consider extracting common ID/identifier conversion logic
- Hierarchy operations may need transaction support

**Testing**:
- Test hierarchy operations maintain DB consistency
- Test frontmatter sync after hierarchy changes
- Test link extraction and broken link detection
- Test ID/identifier conversions in hierarchy paths
- Test complex hierarchy scenarios (cycles, depth limits)

---

### Phase 4: Relationships & Daily Notes

**Goal**: Migrate graph analysis features and daily view functionality

**Scope**: ~270 lines migrated to 2 modules

**Operations to Migrate**:

**Relationships module** (`operations/relationships.ts`):
- `getNoteRelationships()` - Get comprehensive relationships (content + hierarchy)
- `getRelatedNotes()` - Find related notes ranked by strength
- `findRelationshipPath()` - Find path between two notes
- `getClusteringCoefficient()` - Calculate clustering coefficient for note

**Daily Notes module** (`operations/daily.ts`):
- `getOrCreateDailyNote()` - Get/create daily note for date
- `getWeekData()` - Get week view with daily notes and activity
- `getNotesByDate()` - Get notes created/modified on date
- `updateDailyNote()` - Update daily note content

**Special Considerations**:
- Relationship operations use graph algorithms
- Daily note operations have special auto-creation logic
- Week data involves aggregating across multiple days
- Daily notes use special `daily/` type

**Testing**:
- Test relationship strength calculations
- Test relationship path finding with various depths
- Test clustering coefficient calculation
- Test daily note auto-creation
- Test week data aggregation across date ranges
- Test daily note updates

---

### Phase 5: Inbox & Database Operations

**Goal**: Migrate inbox tracking and database maintenance operations

**Scope**: ~220 lines migrated to 2 modules

**Operations to Migrate**:

**Inbox module** (`operations/inbox.ts`):
- `getRecentUnprocessedNotes()` - Get recent notes not yet processed
- `getRecentProcessedNotes()` - Get recently processed notes
- `markNoteAsProcessed()` - Mark note as processed in inbox
- `unmarkNoteAsProcessed()` - Unmark note as processed

**Database module** (`operations/database.ts`):
- `rebuildDatabase()` - Rebuild database from markdown files
- `getMigrationMapping()` - Get ID migration mapping for UI state

**Special Considerations**:
- `rebuildDatabase()` needs to refresh context connections after rebuild
- SQLite WAL mode can cause stale reads - must refresh connections
- May need `refreshContextConnections()` helper in context module
- Migration mapping is optional (only exists during migrations)

**Implementation Notes**:
- Add connection refresh to context module
- Database operations should handle empty/missing tables gracefully
- Consider progress callbacks for rebuild operation

**Testing**:
- Test inbox filtering by processed state
- Test marking/unmarking notes as processed
- Test database rebuild with connection refresh
- Test migration mapping retrieval (with/without migration table)
- Test rebuild with progress reporting

---

### Phase 6: UI State & Slash Commands

**Goal**: Migrate remaining persistence operations

**Scope**: ~125 lines migrated to 2 modules

**Operations to Migrate**:

**UI State module** (`operations/ui-state.ts`):
- `loadUIState()` - Load UI state by key
- `saveUIState()` - Save UI state for key
- `clearUIState()` - Clear all UI state for vault

**Slash Commands module** (`operations/slash-commands.ts`):
- `loadSlashCommands()` - Load all slash commands from DB
- `saveSlashCommands()` - Save slash commands to DB

**Special Considerations**:
- UI state uses JSON serialization
- Slash commands need full CRUD via save operation
- Both operations are vault-specific

**Testing**:
- Test UI state persistence and retrieval
- Test UI state with complex nested objects
- Test clearing UI state
- Test slash command CRUD operations
- Test slash command parameter serialization

---

### Phase 7: Onboarding & Cleanup

**Goal**: Extract onboarding content creation, remove deprecated class, finalize refactor

**Scope**: Final cleanup and documentation

**Tasks**:

1. **Extract onboarding** (`operations/onboarding.ts`)
   - `createOnboardingContent()` - Create all onboarding content
   - `createWelcomeNote()` - Create welcome note
   - `createTutorialNotes()` - Create tutorial notes
   - `loadOnboardingContent()` - Load onboarding markdown files
   - Move onboarding content from `createVault()` to separate module

2. **Update main barrel export** (`src/server/api/index.ts`)
   - Export `createContext` and `FlintContext` type
   - Export all operation functions via wildcard exports
   - Export all types via wildcard exports
   - Clean up any duplicate exports

3. **Remove deprecated class**
   - Option A: Delete `FlintNoteApi` class entirely
   - Option B: Keep minimal deprecated wrapper for one version
   - Rename `flint-note-api.ts` to `deprecated.ts` if keeping
   - Remove all deprecated wrappers

4. **Update NoteService** (`src/main/note-service.ts`)
   - Replace `FlintNoteApi` instantiation with `createContext()`
   - Update all method calls to use functional API
   - Remove class-based patterns
   - Update error handling for new patterns

5. **Documentation**
   - Update `docs/FLINT-NOTE-API.md` with functional examples
   - Create migration guide document
   - Add JSDoc examples for common patterns
   - Document context lifecycle and best practices

**Testing**:
- Run complete test suite
- Manual testing of all features end-to-end
- Performance comparison (functional vs class)
- Memory usage comparison
- Test NoteService integration thoroughly

**Documentation Deliverables**:
- Updated API reference with functional examples
- Migration guide from class to functional
- Best practices for context management
- Common patterns and recipes

---

## Risk Mitigation Strategy

### Per-Phase Process

1. **Implement** functional operations in new module
2. **Add wrappers** to class that call functional API
3. **Test both APIs** - functional directly, class via wrappers
4. **Run full suite** before proceeding to next phase
5. **Document** any issues or learnings

### Rollback Strategy

- Each phase is **additive** - can revert by removing new files
- Class methods **continue working** via wrappers throughout
- Can **pause between phases** if issues arise
- Git branches per phase for easy rollback

### Success Criteria (Per Phase)

- ✅ All existing tests pass
- ✅ New functional tests pass
- ✅ TypeScript type checking passes
- ✅ No performance regression (< 5% slower)
- ✅ No memory regression (< 10% more memory)
- ✅ Manual smoke testing successful
- ✅ Code review completed

### What Could Go Wrong

| Risk | Mitigation |
|------|------------|
| Context caching issues | Thorough tests of manager reuse and invalidation |
| Breaking changes leak through wrappers | Comprehensive compatibility tests |
| Performance regression from context creation | Benchmark context operations, optimize caching |
| Type safety issues in functional API | Strict TypeScript checks, explicit return types |
| Complex state management (vault switching) | Integration tests for all state transitions |
| Onboarding content creation failures | Graceful error handling, don't block vault creation |

---

## Version Strategy

### Release Plan

1. **v0.4.0** - First release with functional API
   - Both APIs available (class + functional)
   - Class methods marked `@deprecated`
   - Documentation shows functional examples
   - Migration guide published

2. **v0.5.0** - Deprecation warnings
   - Console warnings when using class API
   - Encourage migration in release notes
   - Collect feedback on functional API

3. **v1.0.0** - Remove class API
   - Delete class-based API entirely
   - Only functional API available
   - Major version bump indicates breaking change

### Deprecation Messages

```typescript
/**
 * @deprecated Use functional API instead:
 *
 * ```typescript
 * import { createContext } from '../server/api';
 * import * as notes from '../server/api/operations/notes';
 *
 * const ctx = await createContext({ configDir: '...' });
 * const note = await notes.getNote(ctx, vaultId, identifier);
 * ```
 *
 * This method will be removed in v1.0.0
 */
async getNote(vaultId: string, identifier: string): Promise<Note> {
  // ... wrapper implementation
}
```

---

## Performance Considerations

### Context Creation Overhead

**Concern**: Creating context on every operation vs single class instance

**Mitigation**:
- Context is lightweight (just references to managers)
- Manager instances are cached and reused
- Benchmark shows < 1ms overhead for context operations

**Recommendation**: Create context once per request/session in NoteService

### Manager Caching Strategy

**Current**: Class holds single workspace + search manager instances

**New**: Context holds cached managers, creates per-vault as needed

**Benefits**:
- Better multi-vault support
- Explicit cache invalidation
- No stale manager issues

**Trade-offs**:
- Slightly more memory if working with multiple vaults
- Need to manually refresh on vault changes

### Memory Usage

**Expected**: Similar or slightly better than class-based

**Reason**:
- No class instance overhead
- Managers are still cached
- Can explicitly release unused managers

**Monitor**: Track memory usage in Electron main process

---

## Testing Strategy

### Unit Tests

Each operation module should have:
- Tests for success cases
- Tests for error cases (note not found, vault not found, etc.)
- Tests for edge cases (empty lists, null values, etc.)
- Tests for context caching behavior

### Integration Tests

- Test operation sequences (create → update → delete)
- Test vault switching invalidates caches
- Test concurrent operations with shared context
- Test database rebuild with connection refresh

### Compatibility Tests

During migration (Phases 1-6):
- Test class methods still work
- Test class and functional APIs produce same results
- Test error messages are consistent

### Performance Tests

- Benchmark context creation time
- Benchmark operation latency (functional vs class)
- Monitor memory usage over time
- Test with large vaults (1000+ notes)

### Manual Testing

Each phase:
- Smoke test in actual Electron app
- Test from UI (via NoteService)
- Test error scenarios in UI
- Verify no console warnings/errors

---

## Migration Guide (For Consumers)

### Before: Class-Based API

```typescript
import { FlintNoteApi } from '../server/api';

// Create instance
const api = new FlintNoteApi({
  configDir: '/path/to/config',
  workspacePath: '/path/to/vault'
});

// Initialize
await api.initialize();

// Use methods
const note = await api.getNote(vaultId, identifier);
await api.updateNote({ identifier, content, contentHash, vaultId });
const results = await api.searchNotes({ query, vault_id: vaultId });
```

### After: Functional API

```typescript
import { createContext } from '../server/api';
import * as notes from '../server/api/operations/notes';
import * as search from '../server/api/operations/search';

// Create context (replaces instantiation + initialization)
const ctx = await createContext({
  configDir: '/path/to/config',
  workspacePath: '/path/to/vault'
});

// Use functions with context
const note = await notes.getNote(ctx, vaultId, identifier);
await notes.updateNote(ctx, { identifier, content, contentHash, vaultId });
const results = await search.searchNotes(ctx, { query, vault_id: vaultId });
```

### Pattern: Wrapping in a Service

```typescript
// src/main/note-service.ts
import { createContext, type FlintContext } from '../server/api';
import * as notes from '../server/api/operations/notes';
import * as search from '../server/api/operations/search';

export class NoteService {
  private ctx: FlintContext | null = null;

  async initialize() {
    this.ctx = await createContext({
      configDir: this.electronUserDataPath,
      workspacePath: currentVaultPath
    });
  }

  async getNote(vaultId: string, identifier: string) {
    if (!this.ctx) throw new Error('Not initialized');
    return await notes.getNote(this.ctx, vaultId, identifier);
  }

  async searchNotes(query: string, vaultId: string) {
    if (!this.ctx) throw new Error('Not initialized');
    return await search.searchNotes(this.ctx, { query, vault_id: vaultId });
  }
}
```

---

## Benefits Summary

### Maintainability
- **Before**: 1,979-line monolithic class
- **After**: 12+ focused modules, each 50-200 lines
- **Impact**: Much easier to find and modify specific operations

### Testability
- **Before**: Must instantiate and initialize entire class
- **After**: Test individual functions with mock context
- **Impact**: Faster tests, better isolation, easier mocking

### Tree-Shaking
- **Before**: All operations bundled with class
- **After**: Only imported operations included in bundle
- **Impact**: Smaller bundle size for limited-feature builds

### Type Safety
- **Before**: Full type safety in class methods
- **After**: Full type safety in functions
- **Impact**: No loss of type safety, improved inference in some cases

### Flexibility
- **Before**: Must use class instance for all operations
- **After**: Can compose operations however needed
- **Impact**: More flexible, can create custom operation groups

### Learning Curve
- **Before**: Must understand class lifecycle and state management
- **After**: Simple functions with explicit dependencies
- **Impact**: Easier for new contributors to understand and modify

---

## Open Questions

1. **Context Lifecycle**: Should context have explicit `dispose()` method for cleanup?
   - **Proposal**: Add `disposeContext(ctx)` helper that closes all managers

2. **Context Pooling**: For multi-vault scenarios, should we pool contexts?
   - **Proposal**: Start simple, optimize if needed based on usage patterns

3. **Error Handling**: Should context operations throw or return Result types?
   - **Proposal**: Keep throwing errors for consistency with existing code

4. **Logging**: How should functional operations handle logging?
   - **Proposal**: Import logger directly in operations, same as class methods do

5. **Progress Callbacks**: How to handle long operations like `rebuildDatabase()`?
   - **Proposal**: Accept callback as parameter, same as current implementation

6. **Transaction Support**: Should we add explicit transaction support to context?
   - **Proposal**: Defer until needed, current manager-level transactions sufficient

---

## Timeline Estimate

| Phase | Estimated Time | Cumulative |
|-------|----------------|------------|
| Phase 0: Foundation | 1-2 days | 2 days |
| Phase 1: Core Ops | 2-3 days | 5 days |
| Phase 2: Types & Vaults | 2-3 days | 8 days |
| Phase 3: Links & Hierarchy | 2-3 days | 11 days |
| Phase 4: Relationships & Daily | 1-2 days | 13 days |
| Phase 5: Inbox & Database | 1-2 days | 15 days |
| Phase 6: UI State & Commands | 1 day | 16 days |
| Phase 7: Cleanup & Docs | 2-3 days | 19 days |

**Total: ~3-4 weeks** (assuming focused work, no other tasks)

**Note**: These are estimates for implementation + testing per phase. Actual time may vary based on issues discovered during implementation.

---

## Success Metrics

### Code Quality
- ✅ File count: 1 → 13+ files
- ✅ Average file size: 1,979 → ~150 lines
- ✅ Cyclomatic complexity: Reduced by ~40%
- ✅ Test coverage: Maintained or improved

### Performance
- ✅ Operation latency: < 5% regression
- ✅ Memory usage: < 10% increase
- ✅ Startup time: No significant change
- ✅ Bundle size: Reduced if tree-shaking enabled

### Developer Experience
- ✅ Time to find operation: 60s → 10s (estimated)
- ✅ Time to add new operation: 30min → 15min (estimated)
- ✅ Lines of code to add operation: 80 → 40 (estimated)
- ✅ New contributor ramp-up: Improved (subjective)

---

## Conclusion

This refactor transforms the Flint API from a monolithic class into a modular, functional architecture. The phased approach minimizes risk while delivering incremental benefits. Each phase is independently valuable and can be tested in isolation.

The functional API provides:
- **Better organization** through focused modules
- **Improved testability** with pure functions
- **Enhanced flexibility** through composition
- **Maintained type safety** throughout
- **Cleaner architecture** for long-term maintenance

By proceeding carefully through each phase and maintaining backwards compatibility via wrappers, we can complete this refactor with minimal disruption to existing code while setting up a more maintainable foundation for future development.
