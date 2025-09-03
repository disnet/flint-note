# Subnotes Testing Plan

## Overview

This document outlines comprehensive testing requirements for the subnotes feature implemented in Phases 1 and 2. Based on analysis of the current implementation, we need tests covering the core data model, service layer integration, hierarchy operations, relationship management, and edge cases.

## Current Implementation Analysis

The subnotes feature has been implemented with the following key components:

### Core Components

- **HierarchyManager** (`src/server/core/hierarchy.ts`) - Complete hierarchy management with validation
- **RelationshipManager** (`src/server/core/relationship-manager.ts`) - Unified relationship system
- **Database Schema** (`src/server/database/schema.ts`) - `note_hierarchies` table with indexes
- **API Integration** (`src/server/api/flint-note-api.ts`) - Full hierarchy API surface
- **Service Integration** (`src/main/note-service.ts`) - Main process hierarchy methods
- **Search Integration** (`src/server/database/search-manager.ts`) - Hierarchy-aware search

### Key Features to Test

- Parent-child relationship management
- Circular dependency prevention
- Depth limit validation
- Position-based ordering
- Bidirectional relationship maintenance
- Frontmatter/database synchronization
- Hierarchy-aware search
- Relationship strength calculation
- Path finding between notes

## Testing Framework

**Test Runner**: Vitest (already configured)
**Test Location**: `tests/server/` directory structure
**Setup Pattern**: Following existing `TestApiSetup` class pattern

## Test Categories and Cases

### 1. HierarchyManager Unit Tests

**File**: `tests/server/core/hierarchy.test.ts`

#### Basic Hierarchy Operations

- **Create parent-child relationship**
  - Add valid subnote relationship
  - Verify database record creation
  - Check in-memory graph update
  - Confirm bidirectional links

- **Remove parent-child relationship**
  - Remove existing relationship
  - Verify database record deletion
  - Check graph cleanup
  - Handle non-existent relationship removal

- **Reorder subnotes**
  - Change position of existing child
  - Reorder multiple children
  - Handle invalid child ID in reorder
  - Verify position updates in database

#### Hierarchy Navigation

- **Get children**
  - Retrieve direct children in correct order
  - Handle parent with no children
  - Verify position-based ordering

- **Get parents**
  - Retrieve all parents of a child
  - Handle note with no parents
  - Order by creation time

- **Get hierarchy path**
  - Simple linear hierarchy path
  - Multiple parent scenarios (choose first parent)
  - Root note (no parents) path
  - Circular reference handling

- **Get descendants**
  - Retrieve all descendants to specified depth
  - Handle depth limits
  - Empty descendant tree
  - Deep nesting scenarios

#### Validation and Error Handling

- **Circular dependency prevention**
  - Direct circular reference (A->B, B->A)
  - Indirect circular reference (A->B->C->A)
  - Self-reference attempt (A->A)
  - Complex multi-level circular scenarios

- **Depth limit validation**
  - Exceed maximum depth (default 10)
  - Edge case at maximum depth
  - Custom depth limits
  - Deep hierarchy traversal performance

- **Input validation**
  - Invalid note IDs
  - NULL/undefined parameters
  - Empty string parameters
  - SQL injection attempts

#### Database Integration

- **Transaction handling**
  - Successful transaction commits
  - Transaction rollback on error
  - Concurrent operation handling
  - Database connection failures

- **Schema validation**
  - Proper foreign key constraints
  - Index usage verification
  - Unique constraint handling
  - Database integrity checks

### 2. RelationshipManager Unit Tests

**File**: `tests/server/core/relationship-manager.test.ts`

#### Relationship Analysis

- **Get note relationships**
  - Comprehensive relationship retrieval
  - Content links vs hierarchy relationships
  - Relationship strength calculation
  - Empty relationships handling

- **Get related notes**
  - Sorted by relationship strength
  - Multiple relationship types
  - Limit result count
  - Relationship type identification

- **Find relationship path**
  - Shortest path between connected notes
  - No path exists scenarios
  - Maximum depth limitations
  - Path through different relationship types

- **Clustering coefficient**
  - Notes with highly connected neighbors
  - Isolated notes (no relationships)
  - Sparse relationship networks
  - Dense relationship networks

#### Performance Tests

- **Large relationship graphs**
  - 100+ notes with complex relationships
  - Deep hierarchy traversal performance
  - Relationship strength calculation scaling
  - Memory usage during graph operations

### 3. API Integration Tests

**File**: `tests/server/api/hierarchy.test.ts`

#### Hierarchy API Endpoints

- **addSubnote**
  - Valid parent-child addition
  - Position parameter handling
  - Error responses for invalid operations
  - Note ID conversion (identifier to database ID)

- **removeSubnote**
  - Successful relationship removal
  - Non-existent relationship handling
  - Return value verification

- **reorderSubnotes**
  - Valid reordering operations
  - Invalid child ID handling
  - Empty reorder array
  - Duplicate child IDs

- **Navigation methods**
  - getHierarchyPath response format
  - getDescendants with depth limits
  - getChildren ordering verification
  - getParents multiple parent scenarios

#### Error Handling and Validation

- **Invalid parameters**
  - Malformed note IDs
  - Missing required parameters
  - Type validation failures

- **Database errors**
  - Connection failures
  - Constraint violations
  - Transaction failures

- **Business logic errors**
  - Circular dependency attempts
  - Depth limit violations
  - Permission/access errors

### 4. Note CRUD Integration Tests

**File**: `tests/server/api/notes-hierarchy.test.ts`

#### Frontmatter Synchronization

- **Note creation with subnotes**
  - Create note with `subnotes` in frontmatter
  - Verify database hierarchy creation
  - Invalid subnote references handling

- **Note updates with hierarchy changes**
  - Modify `subnotes` array in frontmatter
  - Verify database synchronization
  - Remove subnotes from frontmatter
  - Add new subnotes via frontmatter

- **Note deletion with hierarchy cleanup**
  - Delete parent note with children
  - Delete child note with parents
  - Verify orphaned relationship cleanup
  - Cascade deletion scenarios

#### Metadata Integration

- **Hierarchy-aware metadata**
  - Update note metadata preserving hierarchy
  - Metadata changes don't affect relationships
  - Bulk metadata operations

### 5. Search Integration Tests

**File**: `tests/server/database/search-hierarchy.test.ts`

#### Hierarchy-Aware Search

- **Search filters**
  - `parent_of` filter functionality
  - `child_of` filter functionality
  - `descendants_of` recursive search
  - `ancestors_of` recursive search
  - `has_children` and `has_parents` filters

- **Search result enhancement**
  - Hierarchy context in search results
  - Path information in results
  - Relationship strength in results

- **Complex search queries**
  - Multiple hierarchy filters combined
  - Hierarchy + content search
  - Hierarchy + metadata search
  - Performance with complex queries

### 6. Edge Cases and Stress Tests

**File**: `tests/server/stress/hierarchy-stress.test.ts`

#### Data Integrity

- **Concurrent operations**
  - Multiple hierarchy modifications
  - Race condition handling
  - Data consistency verification

- **Large datasets**
  - 1000+ note hierarchies
  - Deep nesting (approaching limits)
  - Wide hierarchies (many children)
  - Performance degradation thresholds

#### Error Recovery

- **Database corruption scenarios**
  - Orphaned hierarchy records
  - Inconsistent parent-child records
  - Recovery mechanism verification

- **Memory and performance**
  - Memory leak detection
  - Graph rebuild performance
  - Cache invalidation correctness

## Test Data Scenarios

### Simple Hierarchies

```
Project A
├── Task 1
├── Task 2
│   ├── Subtask 2.1
│   └── Subtask 2.2
└── Task 3
```

### Complex Hierarchies

```
Main Project
├── Research Phase
│   ├── Market Analysis
│   ├── User Research
│   └── Technical Research
├── Development Phase
│   ├── Backend Development
│   │   ├── Database Design
│   │   ├── API Implementation
│   │   └── Testing
│   └── Frontend Development
└── Documentation
    ├── API Docs
    ├── User Guide
    └── Developer Guide
```

### Multi-Parent Scenarios

```
Shared Research Note
├── Project A (parent)
├── Project B (parent)
└── Project C (parent)
```

### Edge Case Hierarchies

- Single note (no relationships)
- Maximum depth hierarchies (10 levels)
- Wide hierarchies (100+ children)
- Circular reference attempts
- Orphaned notes

## Test Implementation Strategy

### Phase 1: Core Unit Tests

1. **HierarchyManager tests** - Complete coverage of all methods
2. **RelationshipManager tests** - Relationship analysis and path finding
3. **Database integration tests** - Schema validation and constraints

### Phase 2: API Integration Tests

1. **Hierarchy API endpoints** - All CRUD operations
2. **Error handling** - Comprehensive error scenarios
3. **Parameter validation** - Input sanitization and validation

### Phase 3: Feature Integration Tests

1. **Note CRUD integration** - Frontmatter synchronization
2. **Search integration** - Hierarchy-aware search functionality
3. **Performance tests** - Large dataset handling

### Phase 4: Stress and Edge Case Tests

1. **Concurrent operation tests** - Race conditions and data integrity
2. **Large dataset tests** - Performance under load
3. **Recovery tests** - Error recovery and data consistency

## Testing Utilities

### Test Data Factory

Create utility functions for generating test hierarchies:

```typescript
class HierarchyTestFactory {
  createSimpleHierarchy(depth: number, width: number): TestHierarchy;
  createComplexHierarchy(): TestHierarchy;
  createCircularScenario(): TestHierarchy;
  createLargeDataset(noteCount: number): TestHierarchy;
}
```

### Database Setup and Teardown

Extend existing `TestApiSetup` class:

```typescript
class HierarchyTestSetup extends TestApiSetup {
  async createTestHierarchy(structure: HierarchyStructure): Promise<void>;
  async cleanupHierarchies(): Promise<void>;
  async verifyDatabaseIntegrity(): Promise<boolean>;
}
```

### Assertion Helpers

Custom assertions for hierarchy testing:

```typescript
expect(hierarchy).toHaveValidStructure();
expect(relationships).toMatchExpectedStrength();
expect(path).toConnectNotes(sourceId, targetId);
```

## Success Criteria

### Test Coverage Targets

- **Unit test coverage**: 95%+ for HierarchyManager and RelationshipManager
- **Integration test coverage**: 90%+ for API endpoints
- **Edge case coverage**: All identified edge cases tested

### Performance Benchmarks

- **Hierarchy operations**: <10ms for basic operations
- **Complex relationship analysis**: <100ms for medium datasets (100 notes)
- **Search with hierarchy filters**: <50ms response time

### Quality Metrics

- **Zero data integrity issues** in all test scenarios
- **Proper error handling** for all identified failure modes
- **Memory leak prevention** in long-running test scenarios
- **Consistent behavior** across all supported database operations

## Implementation Notes

### Test Environment

- Use in-memory SQLite for fast test execution
- Isolated test databases for each test suite
- Comprehensive cleanup between tests

### Mocking Strategy

- Mock external dependencies only when necessary
- Use real database for integration tests
- Mock time-sensitive operations for consistent results

### Continuous Integration

- Run full test suite on all commits
- Performance regression detection
- Automated test result reporting
- Coverage tracking over time

This comprehensive testing plan ensures the subnotes feature is robust, reliable, and performant across all use cases and edge conditions.
