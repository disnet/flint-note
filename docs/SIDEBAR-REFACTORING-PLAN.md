# Sidebar Sections Refactoring Plan

## Overview

This document outlines two complementary approaches to refactor the PinnedNotes and TemporaryTabs components, which currently have ~80% code duplication despite serving different purposes.

**Goal**: Eliminate duplication while preserving the distinct behaviors and flexibility of each section type.

## Current State Analysis

### Duplication Points

| Feature | PinnedNotes | TemporaryTabs | % Shared |
|---------|-------------|---------------|----------|
| Drag & drop logic | ✅ | ✅ | 95% |
| Auto-scroll to active | ✅ | ✅ | 100% |
| Icon rendering | ✅ | ✅ | 90% |
| Loading states | ✅ | ✅ | 95% |
| Item click handling | ✅ | ✅ | 100% |
| CSS styles | ✅ | ✅ | 70% |

### Key Differences

| Aspect | PinnedNotes | TemporaryTabs |
|--------|-------------|---------------|
| Header | Collapse toggle | Separator + "clear all" |
| Item actions | None | Close button per item |
| Empty state | Elaborate drag target | None (hidden when empty) |
| Store interaction | `pinnedNotesStore` | `temporaryTabsStore` |

### Files to Refactor

```
src/renderer/src/
├── components/
│   ├── PinnedNotes.svelte (422 lines)
│   └── TemporaryTabs.svelte (489 lines)
├── stores/
│   └── dragState.svelte.ts (shared)
└── utils/
    ├── dragDrop.svelte.ts (shared)
    └── crossSectionDrag.svelte.ts (shared)
```

---

## Option 3: Extract Shared Composables/Utils

**Philosophy**: Extract duplicate logic into reusable composable functions while keeping components independent.

### 3.1 Proposed Structure

```
src/renderer/src/
├── components/
│   ├── PinnedNotes.svelte (reduced to ~180 lines)
│   ├── TemporaryTabs.svelte (reduced to ~200 lines)
│   └── shared/
│       └── NoteIcon.svelte (NEW - 80 lines)
├── composables/
│   ├── useSectionDragDrop.svelte.ts (NEW - 150 lines)
│   ├── useAutoScrollToActive.svelte.ts (NEW - 30 lines)
│   └── useNoteHydration.svelte.ts (NEW - 40 lines)
└── utils/
    └── noteIconHelpers.ts (NEW - 60 lines)
```

### 3.2 Detailed Implementation

#### 3.2.1 `useSectionDragDrop.svelte.ts`

**Purpose**: Encapsulate all drag-and-drop logic for note sections.

```typescript
import { globalDragState } from '../stores/dragState.svelte';
import type { DragState } from '../stores/dragState.svelte';
import {
  handleDragStart as baseDragStart,
  handleDragOver as baseDragOver,
  handleDragEnd as baseDragEnd,
  calculateDropIndex
} from '../utils/dragDrop.svelte';
import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';

interface SectionDragDropOptions<T> {
  sectionType: 'pinned' | 'temporary';
  items: T[];
  getItemId: (item: T) => string;
  onReorder: (sourceIndex: number, targetIndex: number) => Promise<void>;
  onCrossSectionDrop?: (
    id: string,
    sourceType: string,
    dropIndex: number
  ) => Promise<boolean>;
}

export function useSectionDragDrop<T>(options: SectionDragDropOptions<T>) {
  const {
    sectionType,
    items,
    getItemId,
    onReorder,
    onCrossSectionDrop: customCrossSectionHandler
  } = options;

  const dragState = globalDragState;

  function onDragStart(event: DragEvent, item: T): void {
    const itemId = getItemId(item);
    baseDragStart(event, itemId, sectionType, dragState);
  }

  function onDragOver(event: DragEvent, index: number, element: HTMLElement): void {
    baseDragOver(event, index, sectionType, dragState, element);
  }

  async function onDrop(event: DragEvent, targetIndex: number): Promise<void> {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const position = dragState.dragOverPosition || 'bottom';

    // Calculate drop index
    const sourceIndex =
      type === sectionType ? items.findIndex((item) => getItemId(item) === id) : undefined;
    const dropIndex = calculateDropIndex(targetIndex, position, sourceIndex);

    // Handle cross-section drag
    if (type !== sectionType) {
      if (customCrossSectionHandler) {
        if (await customCrossSectionHandler(id, type, dropIndex)) {
          baseDragEnd(dragState);
          return;
        }
      } else {
        if (await handleCrossSectionDrop(id, type, sectionType, dropIndex)) {
          baseDragEnd(dragState);
          return;
        }
      }
    }

    // Handle same-section reorder
    if (type === sectionType && sourceIndex !== undefined && sourceIndex !== dropIndex) {
      try {
        await onReorder(sourceIndex, dropIndex);
      } catch (error) {
        console.error(`Failed to reorder items in ${sectionType}:`, error);
      }
    }

    baseDragEnd(dragState);
  }

  function onDragEnd(): void {
    baseDragEnd(dragState);
  }

  return {
    dragState,
    handlers: {
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd
    }
  };
}
```

**Usage in PinnedNotes.svelte:**

```svelte
<script lang="ts">
  import { useSectionDragDrop } from '../composables/useSectionDragDrop.svelte';

  const { dragState, handlers } = useSectionDragDrop({
    sectionType: 'pinned',
    items: pinnedNotes,
    getItemId: (note) => note.id,
    onReorder: (sourceIndex, targetIndex) =>
      pinnedNotesStore.reorderNotes(sourceIndex, targetIndex)
  });

  const { onDragStart, onDragOver, onDrop, onDragEnd } = handlers;
</script>

<button
  draggable={isNotesReady}
  ondragstart={(e) => onDragStart(e, note)}
  ondragover={(e) => onDragOver(e, index, e.currentTarget)}
  ondrop={(e) => onDrop(e, index)}
  ondragend={onDragEnd}
>
  <!-- ... -->
</button>
```

**Benefits:**
- Eliminates ~100 lines of duplicate drag logic per component
- Type-safe with generics
- Easy to test in isolation
- Consistent behavior across sections

---

#### 3.2.2 `useAutoScrollToActive.svelte.ts`

**Purpose**: Auto-scroll to the active item when it changes.

```typescript
interface AutoScrollOptions {
  activeId: string | null | undefined;
  selector: string;
  isReady: boolean;
  isCollapsed?: boolean;
  behavior?: ScrollBehavior;
  delay?: number;
}

export function useAutoScrollToActive(options: AutoScrollOptions): void {
  const {
    activeId,
    selector,
    isReady,
    isCollapsed = false,
    behavior = 'smooth',
    delay = 50
  } = options;

  $effect(() => {
    if (activeId && isReady && !isCollapsed) {
      setTimeout(() => {
        const activeElement = document.querySelector(
          `${selector}[data-id="${activeId}"]`
        ) as HTMLElement;

        if (activeElement) {
          activeElement.scrollIntoView({
            behavior,
            block: 'nearest'
          });
        }
      }, delay);
    }
  });
}
```

**Usage:**

```svelte
<script lang="ts">
  import { useAutoScrollToActive } from '../composables/useAutoScrollToActive.svelte';

  // PinnedNotes
  useAutoScrollToActive({
    activeId: activeNote?.id,
    selector: '.pinned-item',
    isReady: isNotesReady,
    isCollapsed
  });

  // TemporaryTabs
  useAutoScrollToActive({
    activeId: temporaryTabsStore.activeTabId,
    selector: '.tab-item',
    isReady: isTabsReady
  });
</script>
```

**Benefits:**
- Eliminates ~15 lines per component
- Centralized scroll behavior
- Easy to adjust timing/behavior globally

---

#### 3.2.3 `useNoteHydration.svelte.ts`

**Purpose**: Hydrate note IDs with metadata from notesStore.

```typescript
import type { NoteMetadata } from '../services/noteStore.svelte';

interface HydrationSource {
  id: string;
  [key: string]: any;
}

interface HydrationOptions<T extends HydrationSource> {
  sources: T[];
  notes: NoteMetadata[];
  getSourceId: (source: T) => string;
  isLoading: boolean;
  isReady: boolean;
  onMissing?: (source: T) => void;
}

export function useNoteHydration<T extends HydrationSource>(
  options: HydrationOptions<T>
) {
  const { sources, notes, getSourceId, isLoading, isReady, onMissing } = options;

  return $derived(
    sources.map((source) => {
      const noteId = getSourceId(source);
      const note = notes.find((n) => n.id === noteId);

      if (!note && !isLoading && isReady && onMissing) {
        onMissing(source);
      }

      return {
        ...source,
        note,
        title: note?.title || '',
        type: note?.type
      };
    })
  );
}
```

**Usage:**

```svelte
<script lang="ts">
  // PinnedNotes
  const pinnedNotes = $derived(
    pinnedNotesStore.notes
      .map((pinnedInfo) => notesStore.notes.find((note) => note.id === pinnedInfo.id))
      .filter((note): note is NoteMetadata => note !== undefined)
  );

  // TemporaryTabs - becomes cleaner
  const hydratedTabs = useNoteHydration({
    sources: temporaryTabsStore.tabs,
    notes: notesStore.notes,
    getSourceId: (tab) => tab.noteId,
    isLoading: notesStore.loading,
    isReady: temporaryTabsStore.isReady,
    onMissing: (tab) => console.warn('[TemporaryTabs] Missing note:', tab)
  });
</script>
```

**Benefits:**
- Consistent hydration pattern
- Centralized missing note handling
- Type-safe

---

#### 3.2.4 `NoteIcon.svelte` Component

**Purpose**: Unified icon rendering for notes.

```svelte
<script lang="ts">
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import { getNoteIconData, getIconSvg } from '../utils/noteIconHelpers';

  interface Props {
    note?: NoteMetadata;
    noteId?: string;
    source?: string;
    size?: number;
  }

  let { note, noteId, source, size = 14 }: Props = $props();

  const iconData = $derived(() => {
    if (note) {
      return getNoteIconData(note, notesStore.noteTypes);
    } else if (noteId) {
      const foundNote = notesStore.notes.find((n) => n.id === noteId);
      if (foundNote) {
        return getNoteIconData(foundNote, notesStore.noteTypes);
      }
    }

    // Fallback to source-based icon
    return {
      type: 'svg' as const,
      value: source || 'document'
    };
  });
</script>

<div class="note-icon" style="width: {size}px; height: {size}px;">
  {#if iconData().type === 'emoji'}
    <span class="emoji-icon" style="font-size: {size}px;">{iconData().value}</span>
  {:else}
    {@html getIconSvg(iconData().value, size)}
  {/if}
</div>

<style>
  .note-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    line-height: 1;
  }
</style>
```

**Usage:**

```svelte
<!-- PinnedNotes -->
<NoteIcon {note} />

<!-- TemporaryTabs -->
<NoteIcon noteId={tab.noteId} source={tab.source} size={12} />
```

**Benefits:**
- Single source of truth for icon logic
- Eliminates ~60 lines per component
- Easier to extend with new icon types

---

#### 3.2.5 `noteIconHelpers.ts`

**Purpose**: Pure functions for icon determination.

```typescript
import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';

export interface IconData {
  type: 'emoji' | 'svg';
  value: string;
}

export function getNoteIconData(
  note: NoteMetadata,
  noteTypes: NoteType[]
): IconData {
  // Check for custom note type icon first
  const noteType = noteTypes.find((t) => t.name === note.type);
  if (noteType?.icon) {
    return { type: 'emoji', value: noteType.icon };
  }

  // Fall back to smart icon logic based on note metadata
  if (note.title.includes('daily') || note.title.match(/\d{4}-\d{2}-\d{2}/)) {
    return { type: 'svg', value: 'calendar' };
  }

  if (note.tags?.includes('project')) {
    return { type: 'svg', value: 'folder' };
  }

  return { type: 'svg', value: 'document' };
}

export function getIconSvg(iconType: string, size: number = 14): string {
  switch (iconType) {
    case 'calendar':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>`;
    case 'folder':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"></path>
      </svg>`;
    case 'search':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>`;
    case 'wikilink':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>`;
    default: // document
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14,2 14,8 20,8"></polyline>
      </svg>`;
  }
}
```

**Benefits:**
- Pure functions (easy to test)
- Centralized icon definitions
- Size parameterization

---

### 3.3 Migration Steps (Option 3)

#### Phase 1: Setup (1-2 hours)
1. Create new directory structure:
   - `src/renderer/src/composables/`
   - `src/renderer/src/components/shared/`
   - `src/renderer/src/utils/noteIconHelpers.ts`

2. Create utility files:
   - `noteIconHelpers.ts` with pure functions
   - `NoteIcon.svelte` component

3. Add tests for utilities:
   - `tests/utils/noteIconHelpers.test.ts`

#### Phase 2: Extract Composables (2-3 hours)
1. Create `useSectionDragDrop.svelte.ts`
   - Extract from both components
   - Make generic with type parameters
   - Test with existing components

2. Create `useAutoScrollToActive.svelte.ts`
   - Extract $effect logic
   - Parameterize options

3. Create `useNoteHydration.svelte.ts`
   - Extract note lookup patterns
   - Add missing note handling

#### Phase 3: Refactor PinnedNotes (1-2 hours)
1. Replace drag & drop logic with `useSectionDragDrop`
2. Replace auto-scroll with `useAutoScrollToActive`
3. Replace icon rendering with `<NoteIcon>`
4. Test functionality thoroughly

#### Phase 4: Refactor TemporaryTabs (1-2 hours)
1. Replace drag & drop logic with `useSectionDragDrop`
2. Replace auto-scroll with `useAutoScrollToActive`
3. Replace icon rendering with `<NoteIcon>`
4. Replace hydration with `useNoteHydration`
5. Test functionality thoroughly

#### Phase 5: Cleanup & Polish (1 hour)
1. Remove duplicate code
2. Update component documentation
3. Run linter and type checker
4. Final integration testing

**Total Estimated Time: 7-10 hours**

---

## Option 4: Shared Component Library

**Philosophy**: Extract shared UI patterns into reusable primitive components.

### 4.1 Proposed Component Hierarchy

```
src/renderer/src/components/shared/
├── DraggableNoteItem.svelte (base item component)
├── NoteIcon.svelte (from Option 3)
├── SectionHeader.svelte (collapsible header)
├── EmptyState.svelte (empty section state)
└── LoadingState.svelte (loading spinner)
```

### 4.2 Component Specifications

#### 4.2.1 `DraggableNoteItem.svelte`

**Purpose**: Reusable note list item with drag support.

```svelte
<script lang="ts">
  import NoteIcon from './NoteIcon.svelte';
  import type { NoteMetadata } from '../../services/noteStore.svelte';

  interface Props {
    note?: NoteMetadata;
    noteId?: string;
    title: string;
    source?: string;
    active?: boolean;
    loading?: boolean;
    dragging?: boolean;
    dragOverPosition?: 'top' | 'bottom' | null;
    draggable?: boolean;

    // Drag event handlers
    ondragstart?: (e: DragEvent) => void;
    ondragover?: (e: DragEvent) => void;
    ondrop?: (e: DragEvent) => void;
    ondragend?: (e: DragEvent) => void;

    // Click handler
    onclick?: () => void;
  }

  let {
    note,
    noteId,
    title,
    source,
    active = false,
    loading = false,
    dragging = false,
    dragOverPosition = null,
    draggable = true,
    ondragstart,
    ondragover,
    ondrop,
    ondragend,
    onclick
  }: Props = $props();
</script>

<button
  class="note-item"
  class:active
  class:loading
  class:dragging
  class:drag-over-top={dragOverPosition === 'top'}
  class:drag-over-bottom={dragOverPosition === 'bottom'}
  data-id={note?.id || noteId}
  {draggable}
  ondragstart={ondragstart}
  ondragover={ondragover}
  ondrop={ondrop}
  ondragend={ondragend}
  onclick={onclick}
  title={loading ? 'Loading...' : title}
>
  <div class="item-content">
    <NoteIcon {note} {noteId} {source} />
    <span class="item-title">
      {#if title}
        {title}
      {:else}
        <span class="untitled-text">Untitled</span>
      {/if}
    </span>
  </div>

  {#if $$slots.actions}
    <div class="item-actions">
      <slot name="actions" />
    </div>
  {/if}
</button>

<style>
  .note-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    position: relative;
  }

  .note-item:hover {
    background: var(--bg-hover);
  }

  .note-item.active {
    background: var(--accent-light);
  }

  .note-item.loading {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .note-item.dragging {
    opacity: 0.4;
  }

  .note-item.drag-over-top::before,
  .note-item.drag-over-bottom::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-primary);
    z-index: 10;
  }

  .note-item.drag-over-top::before {
    top: -1px;
  }

  .note-item.drag-over-bottom::after {
    bottom: -1px;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .item-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .untitled-text {
    color: var(--text-placeholder);
    font-style: italic;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
</style>
```

**Usage in PinnedNotes:**

```svelte
{#each pinnedNotes as note, index (note.id)}
  <DraggableNoteItem
    {note}
    title={note.title}
    active={activeNote?.id === note.id}
    loading={!isNotesReady}
    dragging={dragState.draggedId === note.id}
    dragOverPosition={
      dragState.dragOverIndex === index && dragState.dragOverSection === 'pinned'
        ? dragState.dragOverPosition
        : null
    }
    draggable={isNotesReady}
    ondragstart={(e) => onDragStart(e, note)}
    ondragover={(e) => onDragOver(e, index, e.currentTarget)}
    ondrop={(e) => onDrop(e, index)}
    ondragend={onDragEnd}
    onclick={() => handleNoteClick(note)}
  />
{/each}
```

**Usage in TemporaryTabs:**

```svelte
{#each hydratedTabs as tab, index (tab.id)}
  <DraggableNoteItem
    noteId={tab.noteId}
    title={tab.title}
    source={tab.source}
    active={tab.id === temporaryTabsStore.activeTabId}
    loading={!isTabsReady}
    dragging={dragState.draggedId === tab.id}
    dragOverPosition={
      dragState.dragOverIndex === index && dragState.dragOverSection === 'temporary'
        ? dragState.dragOverPosition
        : null
    }
    draggable={isTabsReady}
    ondragstart={(e) => onDragStart(e, tab)}
    ondragover={(e) => onDragOver(e, index, e.currentTarget)}
    ondrop={(e) => onDrop(e, index)}
    ondragend={onDragEnd}
    onclick={() => handleTabClick(tab.noteId)}
  >
    {#snippet actions()}
      <button
        class="close-tab"
        onclick={(e) => handleCloseTab(tab.id, e)}
        aria-label="Close tab"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/snippet}
  </DraggableNoteItem>
{/each}
```

---

#### 4.2.2 `SectionHeader.svelte`

**Purpose**: Reusable section header with optional collapse/actions.

```svelte
<script lang="ts">
  interface Props {
    title: string;
    collapsible?: boolean;
    collapsed?: boolean;
    ontoggle?: () => void;
  }

  let { title, collapsible = false, collapsed = false, ontoggle }: Props = $props();
</script>

<div
  class="section-header"
  class:clickable={collapsible}
  onclick={collapsible ? ontoggle : undefined}
  onkeydown={(e) => collapsible && e.key === 'Enter' && ontoggle?.()}
  role={collapsible ? 'button' : undefined}
  tabindex={collapsible ? 0 : undefined}
>
  <span class="section-title">{title}</span>

  {#if collapsible}
    <button class="collapse-toggle" aria-label="Toggle section">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class:rotated={!collapsed}
      >
        <polyline points="9,18 15,12 9,6"></polyline>
      </svg>
    </button>
  {/if}

  {#if $$slots.actions}
    <div class="header-actions">
      <slot name="actions" />
    </div>
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    background: var(--bg-secondary);
    color: var(--text-muted);
  }

  .section-header.clickable {
    cursor: pointer;
  }

  .section-title {
    flex: 1;
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
  }

  .collapse-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .collapse-toggle svg {
    transition: transform 0.2s ease;
  }

  .collapse-toggle svg.rotated {
    transform: rotate(90deg);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
```

**Usage:**

```svelte
<!-- PinnedNotes -->
<SectionHeader
  title="Pinned"
  collapsible
  {collapsed}
  ontoggle={toggleCollapsed}
/>

<!-- TemporaryTabs -->
<SectionHeader title="">
  {#snippet actions()}
    {#if temporaryTabsStore.tabs.length > 0}
      <button class="clear-all" onclick={handleClearAll}>
        <svg>...</svg>
        close all
      </button>
    {/if}
  {/snippet}
</SectionHeader>
```

---

#### 4.2.3 `EmptyState.svelte`

**Purpose**: Reusable empty state with drag target support.

```svelte
<script lang="ts">
  interface Props {
    message: string;
    hint?: string;
    dragTarget?: boolean;
    dragHint?: string;

    ondragover?: (e: DragEvent) => void;
    ondragleave?: (e: DragEvent) => void;
    ondrop?: (e: DragEvent) => void;
  }

  let {
    message,
    hint,
    dragTarget = false,
    dragHint,
    ondragover,
    ondragleave,
    ondrop
  }: Props = $props();
</script>

<div
  class="empty-state"
  class:drag-target={dragTarget}
  role="button"
  tabindex="-1"
  ondragover={ondragover}
  ondragleave={ondragleave}
  ondrop={ondrop}
>
  <p class="empty-message">{message}</p>
  {#if hint || (dragTarget && dragHint)}
    <p class="empty-hint">
      {dragTarget && dragHint ? dragHint : hint}
    </p>
  {/if}
</div>

<style>
  .empty-state {
    padding: 1.5rem 1.25rem;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 0.75rem;
    min-height: 4rem;
    border: 2px solid transparent;
    position: relative;
    overflow: hidden;
  }

  .empty-state::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, var(--accent-light), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .empty-state.drag-target {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    border-style: dashed;
    box-shadow: 0 2px 12px rgba(0, 123, 255, 0.15);
  }

  .empty-state.drag-target::before {
    opacity: 0.1;
  }

  .empty-message {
    margin: 0;
    color: var(--text-secondary);
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
  }

  .empty-state.drag-target .empty-message {
    color: var(--accent-primary);
  }

  .empty-hint {
    font-size: 0.75rem;
    margin: 0.5rem 0 0;
    opacity: 0.7;
    color: var(--text-secondary);
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
  }

  .empty-state.drag-target .empty-hint {
    opacity: 1;
    color: var(--accent-primary);
  }
</style>
```

---

#### 4.2.4 `LoadingState.svelte`

**Purpose**: Reusable loading indicator.

```svelte
<script lang="ts">
  interface Props {
    message?: string;
    size?: number;
  }

  let { message = 'Loading...', size = 14 }: Props = $props();
</script>

<div class="loading-state">
  <div class="loading-spinner" style="width: {size}px; height: {size}px;"></div>
  {#if message}
    <span class="loading-text">{message}</span>
  {/if}
</div>

<style>
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-spinner {
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
```

---

### 4.3 Refactored Component Example

**PinnedNotes.svelte (after Option 3 + 4):**

```svelte
<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { useSectionDragDrop } from '../composables/useSectionDragDrop.svelte';
  import { useAutoScrollToActive } from '../composables/useAutoScrollToActive.svelte';
  import DraggableNoteItem from './shared/DraggableNoteItem.svelte';
  import SectionHeader from './shared/SectionHeader.svelte';
  import EmptyState from './shared/EmptyState.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { activeNote, onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);
  let isNotesReady = $derived(!notesStore.loading);

  // Hydrate pinned notes with metadata
  let pinnedNotes = $derived(
    pinnedNotesStore.notes
      .map((pinnedInfo) => notesStore.notes.find((note) => note.id === pinnedInfo.id))
      .filter((note): note is NoteMetadata => note !== undefined)
  );

  // Drag & drop composable
  const { dragState, handlers } = useSectionDragDrop({
    sectionType: 'pinned',
    items: pinnedNotes,
    getItemId: (note) => note.id,
    onReorder: (sourceIndex, targetIndex) =>
      pinnedNotesStore.reorderNotes(sourceIndex, targetIndex)
  });

  // Auto-scroll composable
  useAutoScrollToActive({
    activeId: activeNote?.id,
    selector: '.note-item',
    isReady: isNotesReady,
    isCollapsed
  });

  function toggleCollapsed(): void {
    isCollapsed = !isCollapsed;
  }

  function handleNoteClick(note: NoteMetadata): void {
    if (!isNotesReady) return;
    onNoteSelect(note);
  }

  function handleEmptyDragOver(e: DragEvent): void {
    e.preventDefault();
    if (dragState.draggedType === 'temporary') {
      dragState.dragOverSection = 'pinned';
      dragState.dragOverIndex = 0;
    }
  }

  function handleEmptyDragLeave(e: DragEvent): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      dragState.dragOverSection = null;
      dragState.dragOverIndex = null;
    }
  }
</script>

<div class="pinned-notes">
  <SectionHeader
    title="Pinned"
    collapsible
    collapsed={isCollapsed}
    ontoggle={toggleCollapsed}
  />

  {#if !isCollapsed}
    <div class="pinned-list">
      {#if pinnedNotes.length > 0}
        {#each pinnedNotes as note, index (note.id)}
          <DraggableNoteItem
            {note}
            title={note.title}
            active={activeNote?.id === note.id}
            loading={!isNotesReady}
            dragging={dragState.draggedId === note.id}
            dragOverPosition={
              dragState.dragOverIndex === index && dragState.dragOverSection === 'pinned'
                ? dragState.dragOverPosition
                : null
            }
            draggable={isNotesReady}
            ondragstart={(e) => handlers.onDragStart(e, note)}
            ondragover={(e) => handlers.onDragOver(e, index, e.currentTarget)}
            ondrop={(e) => handlers.onDrop(e, index)}
            ondragend={handlers.onDragEnd}
            onclick={() => handleNoteClick(note)}
          />
        {/each}
      {:else}
        <EmptyState
          message="No pinned notes"
          hint="Pin notes to keep them handy"
          dragTarget={dragState.isDragging && dragState.draggedType === 'temporary'}
          dragHint="Drop here to pin note"
          ondragover={handleEmptyDragOver}
          ondragleave={handleEmptyDragLeave}
          ondrop={(e) => handlers.onDrop(e, 0)}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .pinned-notes {
    display: flex;
    flex-direction: column;
  }

  .pinned-list {
    display: flex;
    flex-direction: column;
    padding: 0 0.75rem;
  }
</style>
```

**Result**: Component reduced from 422 lines to ~110 lines!

---

### 4.4 Migration Steps (Option 4)

**Prerequisites**: Complete Option 3 first

#### Phase 1: Create Shared Components (3-4 hours)
1. Create `DraggableNoteItem.svelte`
   - Extract common item markup and styles
   - Add slot support for actions
   - Test in isolation

2. Create `SectionHeader.svelte`
   - Extract header patterns
   - Support both collapsible and action-based variants

3. Create `EmptyState.svelte`
   - Extract empty state patterns
   - Add drag target support

4. Create `LoadingState.svelte`
   - Simple loading spinner component

#### Phase 2: Refactor PinnedNotes (2 hours)
1. Replace item rendering with `<DraggableNoteItem>`
2. Replace header with `<SectionHeader>`
3. Replace empty state with `<EmptyState>`
4. Test all interactions

#### Phase 3: Refactor TemporaryTabs (2 hours)
1. Replace item rendering with `<DraggableNoteItem>`
2. Replace header with `<SectionHeader>`
3. Replace loading with `<LoadingState>`
4. Test all interactions

#### Phase 4: Polish (1 hour)
1. Extract remaining duplicated styles
2. Create shared CSS custom properties if needed
3. Documentation
4. Final testing

**Total Estimated Time: 8-9 hours (on top of Option 3)**

---

## Combined Implementation Plan

**Recommended approach: Implement Option 3, then selectively adopt Option 4 components**

### Week 1: Foundation (Option 3)
- **Day 1-2**: Create composables and utilities
  - `useSectionDragDrop.svelte.ts`
  - `useAutoScrollToActive.svelte.ts`
  - `useNoteHydration.svelte.ts`
  - `noteIconHelpers.ts`
  - `NoteIcon.svelte`

- **Day 3**: Refactor PinnedNotes to use composables
- **Day 4**: Refactor TemporaryTabs to use composables
- **Day 5**: Testing, bug fixes, documentation

### Week 2: Component Library (Option 4 - Optional)
- **Day 1**: Create `DraggableNoteItem.svelte`
- **Day 2**: Create `SectionHeader.svelte`, `EmptyState.svelte`, `LoadingState.svelte`
- **Day 3**: Integrate shared components into PinnedNotes
- **Day 4**: Integrate shared components into TemporaryTabs
- **Day 5**: Testing, polish, documentation

---

## Success Metrics

### Code Reduction
- **Before**: PinnedNotes (422 lines) + TemporaryTabs (489 lines) = **911 lines**
- **After Option 3**: ~380 lines (58% reduction in duplication)
- **After Option 3 + 4**: ~220 lines + ~400 shared lines = **620 total** (32% overall reduction)

### Maintainability Improvements
- ✅ Single source of truth for drag & drop logic
- ✅ Reusable icon rendering
- ✅ Consistent auto-scroll behavior
- ✅ Shared component primitives
- ✅ Easier to add new section types in the future

### Testing Improvements
- ✅ Composables can be unit tested independently
- ✅ Shared components can be tested in isolation
- ✅ Reduced surface area for integration tests

---

## Risk Assessment

### Low Risk
- Creating new composables and utilities (Option 3)
- Extracting icon logic

### Medium Risk
- Refactoring drag & drop to use composables
  - **Mitigation**: Thorough testing of all drag scenarios
  - **Rollback**: Keep old code in comments initially

- Creating shared `DraggableNoteItem` (Option 4)
  - **Mitigation**: Start with one component, verify behavior matches
  - **Rollback**: Easy to revert individual components

### Testing Checklist
- [ ] Drag within same section (reorder)
- [ ] Drag between sections (pinned ↔ temporary)
- [ ] Drag to empty section
- [ ] Drag position indicators (top/bottom)
- [ ] Auto-scroll to active item
- [ ] Loading states block interactions
- [ ] Icon rendering (emoji vs SVG)
- [ ] Close tab button (temporary only)
- [ ] Collapse/expand (pinned only)
- [ ] Clear all (temporary only)
- [ ] Vault switching
- [ ] Note deletion updates

---

## Future Extensibility

After this refactoring, adding new section types becomes much easier:

```svelte
<!-- Example: RecentNotes.svelte -->
<script>
  import { useSectionDragDrop } from '../composables/useSectionDragDrop.svelte';
  import DraggableNoteItem from './shared/DraggableNoteItem.svelte';
  import SectionHeader from './shared/SectionHeader.svelte';

  // Just implement the specific logic for this section
  const recentNotes = $derived(/* ... */);

  const { dragState, handlers } = useSectionDragDrop({
    sectionType: 'recent',
    items: recentNotes,
    getItemId: (note) => note.id,
    onReorder: async (from, to) => { /* ... */ }
  });
</script>

<SectionHeader title="Recent" />
<div class="recent-list">
  {#each recentNotes as note, index (note.id)}
    <DraggableNoteItem {note} {/* ... */} />
  {/each}
</div>
```

Only need to implement section-specific behavior; all the infrastructure is reusable!

---

## Appendix: File Size Comparison

### Before Refactoring
```
PinnedNotes.svelte                422 lines
TemporaryTabs.svelte              489 lines
-------------------------------------------
Total                             911 lines
```

### After Option 3
```
PinnedNotes.svelte                180 lines
TemporaryTabs.svelte              200 lines
-------------------------------------------
Components Total                  380 lines

useSectionDragDrop.svelte.ts      150 lines
useAutoScrollToActive.svelte.ts    30 lines
useNoteHydration.svelte.ts         40 lines
NoteIcon.svelte                    80 lines
noteIconHelpers.ts                 60 lines
-------------------------------------------
Shared Total                      360 lines

Grand Total                       740 lines (19% reduction)
```

### After Option 3 + 4
```
PinnedNotes.svelte                110 lines
TemporaryTabs.svelte              110 lines
-------------------------------------------
Components Total                  220 lines

DraggableNoteItem.svelte          120 lines
SectionHeader.svelte               80 lines
EmptyState.svelte                  70 lines
LoadingState.svelte                40 lines
NoteIcon.svelte                    80 lines
-------------------------------------------
Shared Components                 390 lines

useSectionDragDrop.svelte.ts      150 lines
useAutoScrollToActive.svelte.ts    30 lines
useNoteHydration.svelte.ts         40 lines
noteIconHelpers.ts                 60 lines
-------------------------------------------
Shared Utilities                  280 lines

Grand Total                       890 lines (2% reduction)
BUT: Much more maintainable and reusable!
```

**Note**: While Option 4 doesn't reduce total line count significantly, it creates **highly reusable primitives** that make future development much faster.
