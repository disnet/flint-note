# Workflow Material Size Validation Implementation

**Date:** 2025-10-22
**Status:** ✅ Complete

## Overview

Implemented size validation for workflow supplementary materials as specified in the Agent Workflows PRD (Phase 2, Milestone 2.1).

## Implementation Details

### Size Limits

- **Individual Material:** 50KB maximum (per material)
- **Total Materials:** 500KB maximum (per workflow)

### Changes Made

#### 1. Core Validation Logic (`src/server/core/workflow-manager.ts`)

**Added Constants:**

```typescript
const MAX_INDIVIDUAL_MATERIAL_SIZE = 50 * 1024; // 50KB
const MAX_TOTAL_MATERIALS_SIZE = 500 * 1024; // 500KB
```

**Helper Functions:**

- `calculateMaterialSize()` - Calculates size of material content + metadata in bytes
- `formatBytes()` - Formats byte counts as human-readable strings (e.g., "50.00 KB")
- `getTotalMaterialsSize()` - Calculates total size of all materials for a workflow

**Updated Methods:**

- `addSupplementaryMaterial()` - Validates individual and total sizes before adding
- `createWorkflow()` - Validates all materials during workflow creation

#### 2. Size Calculation Details

The validation counts:

- ✅ **Content:** All text/code content (UTF-8 encoded)
- ✅ **Metadata:** JSON-serialized metadata object
- ❌ **Note References:** Note IDs don't count (only their metadata does)

#### 3. Error Messages

Clear, actionable error messages with size information:

**Individual Limit:**

```
Material size (60.00 KB) exceeds maximum allowed size of 50.00 KB
```

**Total Limit:**

```
Adding this material would exceed the total materials size limit.
Current: 490.00 KB, New material: 20.00 KB, Limit: 500.00 KB
```

### Test Coverage

Added comprehensive tests in `tests/server/core/workflow-materials.test.ts`:

**Individual Material Size Tests (5 tests):**

- ✅ Reject materials exceeding 50KB
- ✅ Accept materials exactly at 50KB limit
- ✅ Accept materials just under 50KB limit
- ✅ Include metadata size in validation
- ✅ Reject oversized materials during workflow creation

**Total Materials Size Tests (4 tests):**

- ✅ Reject adding material that would exceed 500KB total
- ✅ Allow adding materials up to 500KB total
- ✅ Reject workflow creation if total exceeds 500KB
- ✅ Allow workflow creation just under 500KB
- ✅ Correctly calculate total size with mixed material types

**Note Reference Tests (2 tests):**

- ✅ Allow note references without content (minimal size)
- ✅ Count metadata of note references toward limits

**Error Message Tests (2 tests):**

- ✅ Provide clear error messages with sizes
- ✅ Show current, new, and limit in total size errors

### Test Results

All workflow tests passing:

- ✅ 30/30 workflow materials tests
- ✅ 31/31 workflow manager tests
- ✅ 13/13 workflow execution tests
- ✅ 18/18 workflow tools integration tests

**Total: 92/92 tests passing** ✨

## Validation Behavior

### When Adding Individual Materials

1. Check if material has content or metadata
2. Calculate total size (content + serialized metadata)
3. If size > 50KB, reject with error
4. Calculate current total size of all workflow materials
5. If new total would exceed 500KB, reject with error
6. If all validations pass, add material

### When Creating Workflow with Materials

1. Validate each material individually (< 50KB)
2. Calculate sum of all materials
3. If total > 500KB, reject entire workflow creation
4. If all validations pass, create workflow with materials

## Edge Cases Handled

- ✅ Note references with no content (minimal metadata counted)
- ✅ Note references with large metadata (validated)
- ✅ Mixed material types (text, code, note_reference)
- ✅ Materials at exact limit boundaries (50KB, 500KB)
- ✅ Empty metadata (not counted)
- ✅ Complex nested metadata structures (JSON.stringify size counted)

## Files Modified

1. `src/server/core/workflow-manager.ts` - Core validation logic
2. `tests/server/core/workflow-materials.test.ts` - Comprehensive tests

## API Impact

No breaking changes - existing code continues to work. New validation adds:

- Runtime errors when size limits exceeded
- Clear error messages guiding users to fix the issue

## Next Steps

Phase 2 is now **100% complete**. Ready to move to:

- ✅ **Phase 3:** UI Components (Workflow Management View, etc.)
- ✅ **Phase 4:** Completion Tracking & History
- ✅ **Phase 5:** Testing & Documentation

## Notes

- Size validation applies to both agent tools and direct API calls
- Validation is UTF-8 aware (multi-byte characters counted correctly)
- Performance impact minimal (size calculation only on material add/create)
- Note references encourage using existing notes rather than duplicating large content
