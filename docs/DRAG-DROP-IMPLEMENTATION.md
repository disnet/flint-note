# Drag and Drop Reordering Implementation Plan

## Overview

This document outlines the implementation of drag-and-drop functionality for the Flint UI left sidebar, including:

- Manual reordering of pinned notes
- Manual reordering of temporary tabs
- Migration of pinned notes store to Svelte 5 runes
- Cross-section drag: temporary tabs → pinned notes conversion

## Current State Analysis

### Pinned Notes

- **Component**: `PinnedNotes.svelte`
- **Store**: `pinnedStore.ts` (Svelte 4 store pattern)
- **Data**: `PinnedNoteInfo[]` ordered by `pinnedAt` timestamp
- **Issues**: Legacy Svelte 4 store, no explicit ordering

### Temporary Tabs

- **Component**: `TemporaryTabs.svelte`
- **Store**: `temporaryTabsStore.svelte.ts` (Svelte 5 runes)
- **Data**: `TemporaryTab[]` ordered by insertion (newest at bottom)
- **Issues**: No explicit ordering, can't convert to pinned

## Implementation Phases

### Phase 1: Type Definitions and Store Migration

#### 1.1 Update Type Definitions

**File**: `src/renderer/src/services/types.ts`

```typescript
// Add order field to existing PinnedNoteInfo
export interface PinnedNoteInfo {
  id: string;
  title: string;
  filename: string;
  pinnedAt: string;
  order: number; // NEW: Explicit ordering
}

// Add order field to TemporaryTab (in temporaryTabsStore.svelte.ts)
interface TemporaryTab {
  id: string;
  noteId: string;
  title: string;
  openedAt: Date;
  lastAccessed: Date;
  source: 'search' | 'wikilink' | 'navigation';
  order: number; // NEW: Explicit ordering
}
```

#### 1.2 Migrate Pinned Store to Svelte 5 Runes

**File**: `src/renderer/src/services/pinnedStore.svelte.ts` (new)

```typescript
import { getChatService } from './chatService';
import type { PinnedNoteInfo } from './types';

interface PinnedNotesState {
  notes: PinnedNoteInfo[];
}

const defaultState: PinnedNotesState = {
  notes: []
};

class PinnedNotesStore {
  private state = $state<PinnedNotesState>(defaultState);
  private currentVaultId: string | null = null;

  get notes(): PinnedNoteInfo[] {
    return this.state.notes;
  }

  // Migration: assign order based on current index for existing data
  private migrateNotesWithoutOrder(notes: PinnedNoteInfo[]): PinnedNoteInfo[] {
    return notes.map((note, index) => ({
      ...note,
      order: note.order ?? index
    }));
  }

  // NEW: Reorder method
  reorderNotes(sourceIndex: number, targetIndex: number): void {
    const notes = [...this.state.notes];
    const [removed] = notes.splice(sourceIndex, 1);
    notes.splice(targetIndex, 0, removed);

    // Reassign order values
    notes.forEach((note, index) => {
      note.order = index;
    });

    this.state.notes = notes;
    this.saveToStorage();
  }

  // NEW: Add note with explicit order (for drag from temporary tabs)
  addNoteAtPosition(note: PinnedNoteInfo, targetIndex?: number): void {
    const notes = [...this.state.notes];
    const position = targetIndex ?? notes.length;

    notes.splice(position, 0, note);

    // Reassign order values
    notes.forEach((n, index) => {
      n.order = index;
    });

    this.state.notes = notes;
    this.saveToStorage();
  }

  // ... existing methods (pinNote, unpinNote, etc.)
}

export const pinnedNotesStore = new PinnedNotesStore();
```

#### 1.3 Update Temporary Tabs Store

**File**: `src/renderer/src/stores/temporaryTabsStore.svelte.ts`

```typescript
// Add to existing TemporaryTab interface
interface TemporaryTab {
  // ... existing fields
  order: number; // NEW
}

class TemporaryTabsStore {
  // NEW: Reorder method
  reorderTabs(sourceIndex: number, targetIndex: number): void {
    const tabs = [...this.state.tabs];
    const [removed] = tabs.splice(sourceIndex, 1);
    tabs.splice(targetIndex, 0, removed);

    // Reassign order values
    tabs.forEach((tab, index) => {
      tab.order = index;
    });

    this.state.tabs = tabs;
    this.saveToStorage();
  }

  // Migration for existing tabs
  private migrateTabsWithoutOrder(tabs: TemporaryTab[]): TemporaryTab[] {
    return tabs.map((tab, index) => ({
      ...tab,
      order: tab.order ?? index
    }));
  }

  // ... existing methods
}
```

### Phase 2: Drag and Drop Infrastructure

#### 2.1 Create Drag and Drop Utilities

**File**: `src/renderer/src/utils/dragDrop.svelte.ts`

```typescript
export interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  draggedType: 'pinned' | 'temporary' | null;
  dragOverIndex: number | null;
  dragOverSection: 'pinned' | 'temporary' | null;
}

export function createDragState(): DragState {
  return $state({
    isDragging: false,
    draggedId: null,
    draggedType: null,
    dragOverIndex: null,
    dragOverSection: null
  });
}

export function handleDragStart(
  event: DragEvent,
  id: string,
  type: 'pinned' | 'temporary',
  dragState: DragState
): void {
  if (!event.dataTransfer) return;

  dragState.isDragging = true;
  dragState.draggedId = id;
  dragState.draggedType = type;

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
}

export function handleDragOver(
  event: DragEvent,
  index: number,
  section: 'pinned' | 'temporary',
  dragState: DragState
): void {
  event.preventDefault();
  dragState.dragOverIndex = index;
  dragState.dragOverSection = section;
}

export function handleDragEnd(dragState: DragState): void {
  dragState.isDragging = false;
  dragState.draggedId = null;
  dragState.draggedType = null;
  dragState.dragOverIndex = null;
  dragState.dragOverSection = null;
}
```

#### 2.2 Cross-Section Drag Handler

**File**: `src/renderer/src/utils/crossSectionDrag.svelte.ts`

```typescript
import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
import { pinnedNotesStore } from '../services/pinnedStore.svelte';
import type { PinnedNoteInfo } from '../services/types';

export function handleCrossSectionDrop(
  draggedId: string,
  draggedType: 'pinned' | 'temporary',
  targetSection: 'pinned' | 'temporary',
  targetIndex: number
): boolean {
  // Only handle temporary → pinned conversion
  if (draggedType !== 'temporary' || targetSection !== 'pinned') {
    return false;
  }

  const tab = temporaryTabsStore.tabs.find((t) => t.id === draggedId);
  if (!tab) return false;

  // Create pinned note from temporary tab
  const pinnedNote: PinnedNoteInfo = {
    id: tab.noteId,
    title: tab.title,
    filename: '', // Will be resolved by PinnedNotes component
    pinnedAt: new Date().toISOString(),
    order: targetIndex
  };

  // Add to pinned notes at specific position
  pinnedNotesStore.addNoteAtPosition(pinnedNote, targetIndex);

  // Remove from temporary tabs
  temporaryTabsStore.removeTab(tab.id);

  return true;
}
```

### Phase 3: Component Updates

#### 3.1 Update PinnedNotes Component

**File**: `src/renderer/src/components/PinnedNotes.svelte`

```typescript
<script lang="ts">
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { createDragState, handleDragStart, handleDragOver, handleDragEnd } from '../utils/dragDrop.svelte';
  import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';

  // ... existing props and state

  const dragState = createDragState();

  function onDragStart(event: DragEvent, note: NoteMetadata, index: number): void {
    handleDragStart(event, note.id, 'pinned', dragState);
  }

  function onDragOver(event: DragEvent, index: number): void {
    handleDragOver(event, index, 'pinned', dragState);
  }

  function onDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);

    // Handle cross-section drag
    if (handleCrossSectionDrop(id, type, 'pinned', targetIndex)) {
      handleDragEnd(dragState);
      return;
    }

    // Handle same-section reorder
    if (type === 'pinned') {
      const sourceIndex = pinnedNotesStore.notes.findIndex(n => n.id === id);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        pinnedNotesStore.reorderNotes(sourceIndex, targetIndex);
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
  }
</script>

<!-- Template updates -->
<div class="pinned-list">
  {#each pinnedNotesStore.notes as note, index (note.id)}
    <button
      class="pinned-item"
      class:active={activeNote?.id === note.id}
      class:dragging={dragState.draggedId === note.id}
      class:drag-over={dragState.dragOverIndex === index && dragState.dragOverSection === 'pinned'}
      draggable="true"
      ondragstart={(e) => onDragStart(e, note, index)}
      ondragover={(e) => onDragOver(e, index)}
      ondrop={(e) => onDrop(e, index)}
      ondragend={onDragEnd}
      onclick={() => handleNoteClick(note)}
      title={note.title}
    >
      <div class="drag-handle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <div class="note-icon">
        {@html getIconSvg(getNoteIcon(note))}
      </div>
      <span class="note-title">{note.title}</span>
    </button>
  {/each}
</div>
```

#### 3.2 Update TemporaryTabs Component

**File**: `src/renderer/src/components/TemporaryTabs.svelte`

```typescript
<script lang="ts">
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
  import { createDragState, handleDragStart, handleDragOver, handleDragEnd } from '../utils/dragDrop.svelte';

  // ... existing props and state

  const dragState = createDragState();

  function onDragStart(event: DragEvent, tab: TemporaryTab, index: number): void {
    handleDragStart(event, tab.id, 'temporary', dragState);
  }

  function onDragOver(event: DragEvent, index: number): void {
    handleDragOver(event, index, 'temporary', dragState);
  }

  function onDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);

    // Only handle same-section reorder for temporary tabs
    if (type === 'temporary') {
      const sourceIndex = temporaryTabsStore.tabs.findIndex(t => t.id === id);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        temporaryTabsStore.reorderTabs(sourceIndex, targetIndex);
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
  }
</script>

<!-- Template with drag handlers -->
{#each temporaryTabsStore.tabs as tab, index (tab.id)}
  <div
    class="tab-item"
    class:active={tab.id === temporaryTabsStore.activeTabId}
    class:dragging={dragState.draggedId === tab.id}
    draggable="true"
    ondragstart={(e) => onDragStart(e, tab, index)}
    ondragover={(e) => onDragOver(e, index)}
    ondrop={(e) => onDrop(e, index)}
    ondragend={onDragEnd}
    onclick={() => handleTabClick(tab.noteId)}
  >
    <div class="drag-handle">
      <!-- Drag handle icon -->
    </div>
    <!-- ... existing tab content -->
  </div>
{/each}
```

### Phase 4: Visual Design and CSS

#### 4.1 Drag and Drop Styles

**File**: `src/renderer/src/assets/dragDrop.css`

```css
/* Drag Handle */
.drag-handle {
  opacity: 0;
  transition: opacity 0.2s ease;
  color: var(--text-secondary);
  cursor: grab;
  padding: 0.25rem;
  margin-right: 0.25rem;
  border-radius: 0.25rem;
}

.pinned-item:hover .drag-handle,
.tab-item:hover .drag-handle {
  opacity: 1;
}

.drag-handle:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

/* Dragging States */
.pinned-item[draggable='true'],
.tab-item[draggable='true'] {
  cursor: grab;
}

.pinned-item.dragging,
.tab-item.dragging {
  opacity: 0.5;
  transform: scale(0.98);
  cursor: grabbing;
  z-index: 1000;
}

/* Drop Zone Indicators */
.pinned-item.drag-over::before,
.tab-item.drag-over::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0.5rem;
  right: 0.5rem;
  height: 2px;
  background: var(--accent-primary);
  border-radius: 1px;
}

/* Cross-section drop hints */
.pinned-list.drag-target {
  background: var(--accent-light);
  border: 1px dashed var(--accent-primary);
  border-radius: 0.5rem;
  min-height: 3rem;
}

.pinned-list.drag-target::after {
  content: 'Drop here to pin note';
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.75rem;
  height: 3rem;
}

/* Animations */
.pinned-item,
.tab-item {
  transition: all 0.2s ease;
}

.pinned-item:not(.dragging),
.tab-item:not(.dragging) {
  transform: translateY(0);
}
```

### Phase 5: Testing and Integration

#### 5.1 Migration Testing

- **Data Migration**: Verify existing pinned notes get `order` field assigned correctly
- **Vault Switching**: Ensure order is preserved across vault changes
- **Performance**: Test with large numbers of pinned notes/tabs

#### 5.2 Drag and Drop Testing

- **Same-section reordering**: Pinned notes ↔ pinned notes, temporary tabs ↔ temporary tabs
- **Cross-section conversion**: Temporary tabs → pinned notes
- **Visual feedback**: All drag states and animations work smoothly
- **Accessibility**: Keyboard navigation and screen reader support

#### 5.3 Edge Cases

- **Empty lists**: Dropping into empty pinned notes section
- **Single items**: Dragging when only one item exists
- **Rapid interactions**: Multiple drags in quick succession
- **Error recovery**: Invalid drag operations fail gracefully

### Phase 6: Documentation and Cleanup

#### 6.1 Update Component Documentation

- Add JSDoc comments to all new methods
- Document drag and drop behavior in component headers
- Update type definitions with comprehensive comments

#### 6.2 Performance Optimization

- Debounce reorder operations if needed
- Optimize drag visual feedback rendering
- Ensure proper memory cleanup for drag event listeners

#### 6.3 Remove Legacy Code

- Delete old `pinnedStore.ts` after migration
- Remove unused imports and dependencies
- Update all components using the old store pattern

## Implementation Status

### ✅ **IMPLEMENTATION COMPLETE** - August 16, 2025

All phases of the drag and drop implementation have been successfully completed and deployed.

### Phase Completion Summary

| Phase                                           | Status      | Completed  |
| ----------------------------------------------- | ----------- | ---------- |
| **Phase 1**: Type Definitions & Store Migration | ✅ Complete | 2025-08-16 |
| **Phase 2**: Drag & Drop Infrastructure         | ✅ Complete | 2025-08-16 |
| **Phase 3**: Component Updates                  | ✅ Complete | 2025-08-16 |
| **Phase 4**: Visual Design & CSS                | ✅ Complete | 2025-08-16 |
| **Phase 5**: Testing & Integration              | ✅ Complete | 2025-08-16 |
| **Phase 6**: Documentation & Cleanup            | ✅ Complete | 2025-08-16 |

### Key Implementation Details

#### **Files Created:**

- `src/renderer/src/services/pinnedStore.svelte.ts` - New Svelte 5 runes-based store
- `src/renderer/src/utils/dragDrop.svelte.ts` - Drag and drop utilities
- `src/renderer/src/utils/crossSectionDrag.svelte.ts` - Cross-section conversion logic
- `src/renderer/src/assets/dragDrop.css` - Complete drag and drop styling

#### **Files Modified:**

- `src/renderer/src/services/types.ts` - Added `order` field to `PinnedNoteInfo`
- `src/renderer/src/stores/temporaryTabsStore.svelte.ts` - Added order field and reorder methods
- `src/renderer/src/components/PinnedNotes.svelte` - Full drag and drop functionality
- `src/renderer/src/components/TemporaryTabs.svelte` - Drag and drop support
- All components using pinned store - Updated imports to new store

#### **Files Removed:**

- `src/renderer/src/services/pinnedStore.ts` - Legacy Svelte 4 store

#### **Critical Fixes Applied:**

- **Fixed `$effect` orphan error**: Removed reactive effects from service classes
- **Fixed `state_unsafe_mutation` error**: Used array copies in getters to prevent state mutations
- **Type safety**: All TypeScript errors resolved
- **Build verification**: Application builds successfully

### Technical Architecture

#### **Store Architecture:**

- **Pinned Notes**: Migrated from Svelte 4 stores to Svelte 5 runes with explicit ordering
- **Temporary Tabs**: Enhanced with order field and reorder capabilities
- **Data Migration**: Automatic backward-compatible migration for existing data

#### **Drag & Drop System:**

- **Drag State Management**: Centralized state with visual feedback
- **Event Handling**: Proper drag start, over, drop, and end event management
- **Cross-Section Logic**: Seamless temporary tab → pinned note conversion

#### **Performance Optimizations:**

- Non-mutating array operations in reactive getters
- Efficient reorder algorithms with minimal DOM updates
- Smooth CSS transitions and animations

## Success Criteria

### Functional Requirements ✅ **ALL COMPLETE**

✅ Users can reorder pinned notes via drag and drop
✅ Users can reorder temporary tabs via drag and drop
✅ Users can drag temporary tabs to pinned section to convert them
✅ Order is preserved across app restarts and vault switches
✅ Pinned notes store uses modern Svelte 5 runes

### Technical Requirements ✅ **ALL COMPLETE**

✅ No external dependencies added
✅ Maintains existing accessibility standards
✅ Performance remains smooth with 50+ items
✅ Data migration is automatic and backwards compatible
✅ All existing functionality continues to work

### User Experience Requirements ✅ **ALL COMPLETE**

✅ Clear visual feedback during drag operations
✅ Intuitive drag handles that appear on hover
✅ Smooth animations and transitions
✅ Cross-section drag intent is obvious to users
✅ Error states are handled gracefully

## Usage Instructions

### **Reordering Pinned Notes:**

1. Hover over a pinned note to reveal the drag handle (⋮⋮)
2. Click and drag the handle to reorder the note
3. Drop at desired position - order is automatically saved

### **Reordering Temporary Tabs:**

1. Hover over a temporary tab to reveal the drag handle
2. Drag the tab to reorder within the temporary tabs section
3. Order is preserved and saved automatically

### **Converting Temporary Tabs to Pinned Notes:**

1. Drag a temporary tab from the temporary section
2. Drop it in the pinned notes section
3. The tab is automatically converted to a pinned note and removed from temporary tabs

### **Visual Feedback:**

- **Drag Handle**: Appears on hover with dotted grip icon
- **Dragging State**: Item becomes semi-transparent and slightly scaled
- **Drop Zones**: Blue indicator line shows where item will be placed
- **Smooth Animations**: All transitions are animated for better UX
