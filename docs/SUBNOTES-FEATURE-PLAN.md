# Subnotes Feature Implementation Plan

## Overview

Subnotes introduce hierarchical note organization to Flint while preserving the core principle of frictionless note creation. This feature enables thinking at multiple scales—from individual thoughts to large projects—without imposing organizational burden during initial capture.

## Core Concept

**Hierarchical Independence**: A subnote is a regular note that maintains a parent-child relationship with another note. Unlike folders, subnotes:

- Remain independently accessible and linkable
- Can have multiple parents (many-to-many relationships)
- Preserve all existing note functionality (metadata, types, search, AI integration)
- Support arbitrary nesting depth

**Progressive Organization**: Users can create notes freely and add hierarchical structure later as ideas develop, supporting natural thought patterns without upfront categorization requirements.

## Design Principles

### 1. Frictionless Capture

- New notes require no organizational decisions
- Hierarchy can be added retroactively
- Quick capture workflow remains unchanged

### 2. Multi-Scale Focus

- Seamless zoom between individual notes and project overviews
- Collapse/expand hierarchies to manage cognitive load
- Context preservation during focus transitions

### 3. Flexible Relationships

- Notes can belong to multiple hierarchies simultaneously
- Easy reorganization as understanding evolves
- Support both sequential (chapter-like) and thematic organization

### 4. Preserve Existing Workflows

- All current note operations continue unchanged
- Wikilinks, search, and AI assistance work across hierarchy boundaries
- Backward compatibility with non-hierarchical notes

## Technical Implementation

### Data Model Extensions

**Frontmatter Schema Addition**:

```yaml
---
title: 'Project Alpha'
type: 'project'
subnotes:
  - 'tasks/setup-environment'
  - 'research/market-analysis'
  - 'Planning Session Notes'
---
```

**Core Data Structures**:

```typescript
interface NoteHierarchy {
  parents: string[]; // Note IDs of parent notes
  children: string[]; // Ordered list of child note IDs
  depth: number; // Nesting level for UI optimization
}

interface HierarchyGraph extends LinkGraph {
  hierarchies: {
    [noteId: string]: NoteHierarchy;
  };
}
```

### Service Layer Changes

**Note Service Extensions**:

- `addSubnote(parentId: string, childId: string, position?: number)`
- `removeSubnote(parentId: string, childId: string)`
- `reorderSubnotes(parentId: string, childIds: string[])`
- `getHierarchyPath(noteId: string): string[]`
- `getDescendants(noteId: string, depth?: number): NoteMetadata[]`

**Hierarchy Resolution**:

- Automatic parent-child relationship tracking
- Circular reference detection and prevention
- Bidirectional relationship maintenance
- Integration with existing link graph system

### UI Component Updates

**Left Sidebar Enhancement** (`LeftSidebar.svelte`):

- Hierarchical tree view with expand/collapse
- Visual nesting indicators (indentation, connecting lines)
- Drag-and-drop reordering within and between hierarchies
- Context menus for hierarchy management
- Compact view toggle for deeply nested structures

**Main View Integration** (`MainView.svelte`):

- Breadcrumb navigation showing hierarchy path
- "Add Subnote" action in note controls
- Visual parent/child relationship indicators
- Quick navigation between related notes in hierarchy

**Right Sidebar Context** (`RightSidebar.svelte`):

- Hierarchy panel showing current note's position
- Parent and child note quick links
- Hierarchy-aware metadata editing

### State Management

**New Store: `hierarchyStore.svelte.ts`**:

```typescript
interface HierarchyState {
  hierarchyGraph: HierarchyGraph;
  expandedNodes: Set<string>;
  dragState: {
    isDragging: boolean;
    draggedNote: string | null;
    dropTarget: string | null;
  };
}
```

**Store Operations**:

- Real-time hierarchy updates
- Expand/collapse state persistence
- Drag-and-drop state management
- Integration with existing `notesStore`

### Search and Discovery

**Enhanced Search**:

- Hierarchy-aware search results showing note paths
- Filter by hierarchy depth or specific parent
- "Search within subtree" functionality
- Preserve existing full-text search capabilities

**Navigation Improvements**:

- Hierarchy-aware note navigation
- "Go to parent/child" keyboard shortcuts
- Breadcrumb-based navigation
- Context-aware note suggestions

## User Experience Design

### Visual Design

**Hierarchy Indicators**:

- Subtle indentation with connecting lines
- Collapsible tree nodes with standard expand/collapse icons
- Visual depth limits to prevent excessive nesting display
- Parent-child relationship badges in note cards

**Responsive Behavior**:

- Collapsible hierarchy sections on mobile
- Touch-friendly drag-and-drop for reorganization
- Simplified hierarchy view for narrow screens
- Gesture support for expand/collapse

### Interaction Patterns

**Creation Workflow**:

1. Create note normally (no hierarchy required)
2. Optionally add as subnote via drag-drop or context menu
3. Hierarchy relationships appear automatically in navigation

**Organization Workflow**:

1. Drag existing notes into hierarchical relationships
2. Reorder subnotes within parent via drag-drop
3. Multi-select operations for bulk hierarchy changes
4. Copy/move notes between hierarchy branches

**Navigation Workflow**:

1. Click to navigate between parent/child notes
2. Breadcrumb navigation for hierarchy awareness
3. Keyboard shortcuts for hierarchy traversal
4. Context-aware "related notes" suggestions

## Implementation Phases

### Phase 1: Core Data Model ✅ **COMPLETED**

- ✅ Extend note metadata schema for subnote relationships
- ✅ Implement basic parent-child relationship storage
- ✅ Create hierarchy graph data structure
- ✅ Add relationship validation and circular reference detection

**Implementation Details:**

- Extended `NoteMetadata` interface with `subnotes?: string[]` field for frontmatter support
- Added comprehensive hierarchy type definitions (`NoteHierarchy`, `HierarchyGraph`, `HierarchyValidation`, `HierarchyOperationResult`)
- Created `note_hierarchies` database table with proper indexes and foreign key constraints
- Implemented complete `HierarchyManager` class with full CRUD operations:
  - `addSubnote()` with position support and validation
  - `removeSubnote()` with safe relationship removal
  - `reorderSubnotes()` with transaction-safe updates
  - `getHierarchyPath()` and `getDescendants()` for navigation
- Comprehensive validation system preventing circular dependencies and excessive nesting
- All TypeScript types, linting, and formatting checks pass

**Files Modified/Created:**

- `src/server/types/index.ts` - Extended with hierarchy types
- `src/server/database/schema.ts` - Added hierarchy table and interfaces
- `src/server/core/hierarchy.ts` - New complete hierarchy manager
- `src/server/api/types.ts` - Added hierarchy API argument types

### Phase 2: Service Layer Integration ✅ **COMPLETED**

- ✅ Implement hierarchy management APIs
- ✅ Extend note CRUD operations to handle relationships
- ✅ Add hierarchy-aware search and filtering
- ✅ Update link graph to include hierarchical relationships

**Implementation Details:**

- **Hierarchy Management APIs**: Complete API surface in `FlintNoteApi` and `NoteService`:
  - `addSubnote()`, `removeSubnote()`, `reorderSubnotes()` for relationship management
  - `getHierarchyPath()`, `getDescendants()`, `getChildren()`, `getParents()` for navigation
  - Full validation, error handling, and note ID conversion between identifiers and database IDs
- **Extended Note CRUD Operations**: Seamless integration between frontmatter and database:
  - **Create**: Auto-sync `subnotes` array from frontmatter to hierarchy database on note creation
  - **Update**: Sync hierarchy changes when `subnotes` metadata is modified via `updateNoteWithMetadata()`
  - **Delete**: Automatic cleanup of all parent-child relationships when notes are deleted
  - Helper methods for bidirectional synchronization between frontmatter and database storage
- **Hierarchy-Aware Search**: Extended `searchNotesAdvanced()` with powerful filtering:
  - `parent_of`, `child_of` for direct relationship queries
  - `descendants_of`, `ancestors_of` with recursive CTEs for multi-level traversal
  - `has_children`, `has_parents` for structural filtering
  - `max_depth` parameter for controlling recursion depth
- **Unified Relationship System**: New `RelationshipManager` class combining:
  - Content-based links (wikilinks, external URLs) with strength scoring
  - Hierarchy relationships (parent-child) with higher relationship strength
  - Path finding using BFS across both relationship types
  - Clustering coefficient analysis for measuring note interconnectedness
  - Comprehensive relationship analysis APIs for UI consumption

**Files Modified/Created:**

- `src/server/core/relationship-manager.ts` - New unified relationship analysis system
- `src/server/api/flint-note-api.ts` - Added complete hierarchy and relationship APIs
- `src/server/api/types.ts` - Added hierarchy and relationship argument type definitions
- `src/main/note-service.ts` - Extended main service with hierarchy methods
- `src/server/core/notes.ts` - Enhanced CRUD operations with automatic hierarchy synchronization
- `src/server/database/search-manager.ts` - Added hierarchy-specific search filters and queries

**Quality Assurance:**

- All TypeScript type checking passes
- ESLint and Prettier formatting compliance
- Comprehensive error handling and edge case management
- Automatic cleanup and data integrity maintenance

### Phase 3: Basic UI Implementation ⏳ **NEXT**

- Add hierarchical tree view to left sidebar
- Implement expand/collapse functionality
- Create basic drag-and-drop for subnote management
- Add breadcrumb navigation to main view

### Phase 4: Advanced UI Features ⏳ **PLANNED**

- Implement advanced drag-and-drop with visual feedback
- Add context menus for hierarchy management
- Create hierarchy-aware metadata editing
- Add keyboard shortcuts and navigation improvements

### Phase 5: Polish and Integration ⏳ **PLANNED**

- Integrate with AI assistant for hierarchy-aware operations
- Add hierarchy-specific settings and preferences
- Implement export/import for hierarchical structures
- Performance optimization for large hierarchies

## Success Metrics

**Functionality**:

- Notes can be organized hierarchically without losing independence
- All existing workflows continue unchanged
- Hierarchy operations are intuitive and efficient
- No performance degradation with deep or wide hierarchies

**User Experience**:

- Reduced cognitive load when working with large note collections
- Improved project organization and navigation
- Maintained frictionless note creation process
- Enhanced discoverability of related notes

**Technical Quality**:

- Consistent with existing architecture patterns
- Proper error handling and edge case management
- Comprehensive test coverage for hierarchy operations
- Documentation for new APIs and user features

## Open Questions

1. **Hierarchy Display Limits**: How deep should visual nesting go before using alternative display methods?
2. **Bulk Operations**: What batch operations are needed for managing large hierarchies efficiently?
3. **Migration Strategy**: How should existing notes be migrated to support the new hierarchy system?
4. **Performance Thresholds**: What are acceptable performance characteristics for hierarchies with hundreds of notes?
5. **Export Formats**: How should hierarchical relationships be preserved in export formats?

## Conclusion

The subnotes feature represents a natural evolution of Flint's note management capabilities, adding powerful organizational tools without compromising the system's core philosophy of frictionless capture and flexible thinking. By building on existing infrastructure and maintaining backward compatibility, this feature can significantly enhance user productivity while preserving the intuitive workflow that makes Flint effective.
