# API Type Alignment Plan

## Overview

This document outlines the type mismatches discovered between the FlintAPI type definitions (`flint-api-types.ts`), the FlintNoteApi implementation (`flint-note-api.ts`), and the WASM code evaluator bindings (`wasm-code-evaluator.ts`), along with a phased plan to resolve them.

## Current Issues

### 1. Method Naming Inconsistencies
- **FlintAPI types**: `create()`, `get()`, `update()`, `delete()`
- **FlintNoteApi implementation**: `createNote()`, `getNote()`, `updateNote()`, `deleteNote()`
- **WASM bindings**: Expose simple names but call prefixed methods

### 2. Parameter Structure Mismatches
- Inconsistent field naming (`name` vs `type_name`, `order` vs `position`)
- Optional vs required parameter differences
- Missing `vaultId` parameters in FlintAPI types
- Duplicate WASM interface definitions instead of reusing FlintAPI types

### 3. Return Type Mismatches
- `CreateNoteResult` vs `NoteInfo`
- `UpdateNoteResult` vs `UpdateResult`
- Structured objects vs raw database rows

### 4. Namespace Organization Issues
- Current: Separate namespaces (`notes.get`, `noteTypes.create`)
- Implementation methods are in single class with prefixed names

## Remediation Plan

## Phase 1: Flatten WASM API to Single Namespace

**Goal**: Change WASM bindings from separate namespaces to a single `flintApi` namespace that directly matches the underlying FlintNoteApi method names.

### Current Structure:
```javascript
// Multiple namespaces
notes.get(identifier)
notes.create(options)
noteTypes.list()
vaults.getCurrent()
```

### Target Structure:
```javascript
// Single flintApi namespace
flintApi.getNote(identifier)
flintApi.createNote(options)
flintApi.listNoteTypes()
flintApi.getCurrentVault()
```

### Implementation Steps:

1. **Remove separate namespace objects** in `wasm-code-evaluator.ts`:
   - Remove `notesObj`, `noteTypesObj`, `vaultsObj`, etc.
   - Create single `flintApiObj`

2. **Flatten method bindings** to match FlintNoteApi method signatures:
   ```typescript
   // Instead of: vm.setProp(notesObj, 'get', notesGetFn)
   // Use: vm.setProp(flintApiObj, 'getNote', notesGetFn)
   ```

3. **Update method names** to match implementation:
   - `get` → `getNote`
   - `create` → `createNote`
   - `update` → `updateNote`
   - `delete` → `deleteNote`
   - `list` → `listNotes` (Notes) / `listNoteTypes` (NoteTypes) / `listVaults` (Vaults)

4. **Update FlintAPI type definitions** to reflect flattened structure:
   ```typescript
   // Remove separate interfaces, create unified FlintAPI interface
   interface FlintAPI {
     // Notes
     getNote(identifier: string): Promise<Note | null>;
     createNote(options: CreateNoteOptions): Promise<CreateNoteResult>;
     updateNote(options: UpdateNoteOptions): Promise<UpdateNoteResult>;
     // ... etc
   }
   ```

### Benefits of Phase 1:
- Eliminates namespace confusion
- Direct method name alignment with implementation
- Simplified API surface area
- Easier to maintain consistency

## Phase 2: Standardize Parameter Interfaces

### 2.1 Eliminate Duplicate WASM Interfaces
- Remove `WASMCreateNoteOptions`, `WASMUpdateNoteOptions`, etc.
- Use FlintAPI interfaces directly in WASM bindings

### 2.2 Add Missing VaultId Parameters
- Update FlintAPI interfaces to include `vaultId` where needed
- Ensure consistent parameter naming across all layers

### 2.3 Standardize Field Names
- Make id naming consistent: `identifier` vs `noteId` vs `note_id` -- should be `noteId`
- Update all interfaces to use chosen convention
- Fix `name` vs `type_name` inconsistency in note types -- should be `typeName`

## Phase 3: Align Return Types

### 3.1 Create Type Mapping Layer
- Add conversion functions between FlintNoteApi return types and FlintAPI types
- Example: Convert `NoteInfo` → `CreateNoteResult`

### 3.2 Update FlintAPI Type Definitions
- Align FlintAPI return types with actual implementation return types
- Or create adapters in FlintNoteApi to return expected types

### 3.3 Fix Structured Return Types
- Update `parseLinks()` to return proper structured objects
- Align `LinkInfo` interface with actual database row structures

## Phase 4: Method Signature Alignment

### 4.1 Parameter Object Consistency
- Standardize hierarchy API parameter structures
- Fix `addSubnote` order vs position field naming
- Align `reorder` method parameter structure

### 4.2 Optional vs Required Parameters
- Review and standardize which parameters are optional
- Update FlintAPI interfaces to match implementation requirements

## Implementation Priority

### High Priority (Phase 1):
- Flatten WASM namespace structure
- Update method names to match implementation
- Critical for API consistency

### Medium Priority (Phase 2):
- Parameter interface standardization
- Remove duplicate WASM interfaces
- Important for maintainability

### Low Priority (Phases 3-4):
- Return type alignment
- Method signature fine-tuning
- Can be done incrementally

## Testing Strategy

1. **Update existing tests** to use new flattened API structure
2. **Add integration tests** to verify WASM bindings work correctly
3. **Create type-checking tests** to catch future misalignments
4. **Test custom function execution** with new API structure

## Migration Impact

### Breaking Changes:
- Custom functions using current namespace structure will need updates
- API method names will change from simple to prefixed versions

### Mitigation:
- Since we have no users currently, breaking changes are acceptable
- Focus on getting the API structure right for future stability

## Success Criteria

- [ ] All WASM bindings use single `flintApi` namespace
- [ ] Method names directly match FlintNoteApi implementation
- [ ] No duplicate interface definitions between layers
- [ ] All tests pass with new API structure
- [ ] TypeScript compilation succeeds without type errors
- [ ] Custom function examples work with new API structure
