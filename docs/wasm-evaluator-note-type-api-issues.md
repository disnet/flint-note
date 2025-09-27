# WASM Evaluator Note Type API Issues

## Overview

During comprehensive testing of note type CRUD operations in the WASM code evaluator, we discovered that while all note type APIs are properly exposed and accessible to agents, there are underlying issues with `updateNoteType` and `deleteNoteType` operations that cause them to fail with empty error objects.

## Working Operations

The following note type operations work correctly through the WASM evaluator:

- ✅ `flintApi.createNoteType` - Creates note types successfully
- ✅ `flintApi.listNoteTypes` - Lists all note types correctly
- ✅ `flintApi.getNoteType` - Retrieves specific note type info

## Problem Operations

### `updateNoteType` Issues

**Symptoms:**
- API call appears to execute without TypeScript compilation errors
- Promise rejects with an empty object: `{}`
- No meaningful error message or stack trace available
- Operation fails silently in try/catch blocks

**Test Evidence:**
```typescript
const updatedNoteType = await flintApi.updateNoteType({
  typeName: "test-update",
  description: "Updated description for testing",
  agent_instructions: "New instruction for testing"
}) as any;
// Results in Promise rejection: {}
```

**API Interface Used:**
- Parameter: `agent_instructions` (string) - correctly mapped to `instructions` (array) by evaluator
- WASM evaluator correctly converts single string to array format
- FlintNoteApi expects: `{ type_name, description?, instructions?, metadata_schema?, vault_id }`

### `deleteNoteType` Issues

**Symptoms:**
- Same empty object rejection pattern as updateNoteType
- API call compiles correctly but fails during execution
- No meaningful error information returned

**Test Evidence:**
```typescript
const deleteResult = await flintApi.deleteNoteType({
  typeName: "test-delete",
  deleteNotes: false // Only delete if empty (error if notes exist)
}) as any;
// Results in Promise rejection: {}
```

**API Interface Used:**
- Parameter: `deleteNotes` (boolean) - correctly mapped to `action`/`confirm` by evaluator
- WASM evaluator correctly converts to: `action: deleteNotes ? 'delete' : 'error'`
- FlintNoteApi expects: `{ type_name, action, confirm, vault_id }`

## Technical Analysis

### Error Pattern

Both operations show the same error pattern:
1. TypeScript compilation succeeds
2. WASM parameter mapping appears correct
3. Promise rejection occurs with empty object `{}`
4. No stack trace or meaningful error message
5. Error appears to originate from the FlintNoteApi layer, not the WASM evaluator

### API Layer Investigation

**WASM Code Evaluator Layer:** ✅ Working correctly
- Parameter mapping functions correctly
- API whitelisting allows the operations
- Promise proxy creation works
- Type conversions are accurate

**FlintNoteApi Layer:** ⚠️ Suspected issue location
- `updateNoteType()` method at `/flint-note-api.ts` line ~850
- `deleteNoteType()` method at `/flint-note-api.ts` line ~870
- Operations may be failing in the underlying NoteTypeManager calls
- Error handling may not be propagating properly

### Vault Context Theory

**Possible Root Cause:** Vault context handling
- Both operations require vault context via `vault_id` parameter
- The WASM evaluator automatically injects `vaultId` from the evaluation context
- Vault context retrieval: `await this.getVaultContext(args.vault_id)`
- Error might occur during vault context resolution or noteTypeManager access

## Evidence from Working Operations

The `createNoteType` operation works correctly with similar patterns:
- Same vault context handling
- Same parameter mapping approach
- Same promise proxy pattern
- Suggests the issue is specific to update/delete logic, not infrastructure

## Recommendations for Investigation

### 1. Add Debug Logging
Add comprehensive logging to FlintNoteApi methods:
```typescript
async updateNoteType(args) {
  console.log('updateNoteType called with:', args);
  try {
    this.ensureInitialized();
    console.log('Initialization check passed');
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);
    console.log('Vault context retrieved:', noteTypeManager ? 'success' : 'failed');
    // ... rest of method
  } catch (error) {
    console.log('updateNoteType error:', error);
    throw error;
  }
}
```

### 2. Check NoteTypeManager Implementation
Investigate the underlying NoteTypeManager methods:
- `noteTypeManager.updateNoteType(type_name, updates)`
- `noteTypeManager.deleteNoteType(type_name, options)`
- Verify error handling and return value consistency

### 3. Verify Vault Context Handling
- Test vault context retrieval in isolation
- Verify test vault creation creates proper vault structure
- Check if vault_id format matches expected patterns

### 4. Compare with Tool Service Implementation
The ToolService has working implementations of these operations:
- `src/main/tool-service.ts` - `update_note_type` and `delete_note_type` tools
- Compare parameter handling and error propagation
- Check if tool implementations have workarounds or different approaches

### 5. Test Direct API Calls
Create isolated tests that call FlintNoteApi methods directly (not through WASM evaluator):
```typescript
// Test direct API access
const result = await testSetup.api.updateNoteType({
  type_name: 'test-type',
  description: 'Updated description',
  vault_id: vaultId
});
```

## Files to Investigate

1. **Primary suspects:**
   - `src/server/api/flint-note-api.ts` (lines ~850-900)
   - `src/server/core/note-types.ts` (NoteTypeManager implementation)

2. **Reference implementations:**
   - `src/main/tool-service.ts` (working tool implementations)
   - `tests/server/api/enhanced-wasm-code-evaluator.test.ts` (test evidence)

3. **Infrastructure:**
   - `src/server/api/wasm-code-evaluator.ts` (parameter mapping)
   - `tests/server/api/test-setup.ts` (vault creation)

## Test Cases to Fix

Once the underlying issues are resolved, these test cases should be re-enabled:

- `enhanced-wasm-code-evaluator.test.ts:332` - "should update note type through evaluator"
- `enhanced-wasm-code-evaluator.test.ts:377` - "should delete note type through evaluator"
- `wasm-expanded-api.test.ts` - NoteTypes API tests that use update/delete operations

## Impact Assessment

**Current Impact:** Limited
- Core note type functionality (create, list, get) works correctly
- Agents can successfully create and query note types
- Complex workflows combining note types with note creation work properly

**Future Impact:** Moderate
- Agents cannot modify existing note types programmatically
- Note type lifecycle management is incomplete
- Advanced automation scenarios requiring note type updates are blocked

---

*Document created: 2025-09-27*
*Last investigation: Enhanced WASM Code Evaluator test implementation*
*Status: Issues identified, root cause investigation needed*