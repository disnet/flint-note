# Wikilink Popover Controls

## Overview

The wikilink popover system provides unified interaction controls for wikilinks in the editor. Users can interact with wikilinks through either keyboard cursor positioning or mouse hover, with consistent action buttons and keyboard shortcuts.

## Components

### WikilinkActionPopover

Located: `src/renderer/src/components/WikilinkActionPopover.svelte`

The main action popover that displays when a user positions their cursor next to a wikilink or hovers over it with the mouse.

**Features:**

- Two action buttons: **Open** and **Edit**
- Platform-aware keyboard shortcut display (⌥ on macOS, Alt on other platforms)
- Shows wikilink identifier
- Unified experience for both cursor and mouse interactions

**Actions:**

- **Open** (Enter key): Opens the linked note or creates a new note if the link is broken
- **Edit** (Alt/Option + Enter): Opens the edit popover to modify the display text

### WikilinkPopover

Located: `src/renderer/src/components/WikilinkPopover.svelte`

The edit popover for modifying wikilink display text.

**Features:**

- Shows link identifier (read-only)
- Editable display text input field
- Auto-focus and text selection when opened
- Real-time updates as user types

## Implementation Details

### State Management

The CodeMirrorEditor component manages popover state:

```typescript
// Action popover state (unified for cursor and mouse interactions)
let actionPopoverVisible = $state(false);
let actionPopoverX = $state(0);
let actionPopoverY = $state(0);
let actionPopoverIdentifier = $state('');
let actionPopoverIsFromHover = $state(false);
let actionPopoverWikilinkData = $state<{
  identifier: string;
  title: string;
  exists: boolean;
  noteId?: string;
} | null>(null);
```

### Trigger Mechanisms

#### 1. Cursor-Based Trigger

A polling effect checks every 100ms if the cursor is adjacent to a wikilink:

```typescript
$effect(() => {
  const interval = setInterval(() => {
    const selected = getSelectedWikilink(editorView);
    if (selected && !popoverVisible && !actionPopoverIsFromHover) {
      // Show action popover from cursor position
      actionPopoverVisible = true;
      actionPopoverIsFromHover = false;
    }
  }, 100);
});
```

#### 2. Mouse Hover Trigger

The wikilink widget emits hover events with complete link data:

```typescript
span.addEventListener('mouseenter', () => {
  this.hoverHandler({
    identifier: this.identifier,
    displayText: this.title,
    from: this.from,
    to: this.to,
    x: coords.left,
    y: coords.bottom,
    exists: this.exists,
    noteId: this.noteId
  });
});
```

### Hover Conflict Resolution

The system prevents conflicts between cursor and mouse interactions:

1. **Hover Data Update**: If the action popover is already visible from hover, moving to another wikilink immediately updates the popover data and position
2. **Edit Popover Priority**: When the edit popover is visible, the action popover is completely disabled
3. **Hover Flag Tracking**: `actionPopoverIsFromHover` tracks whether the popover was triggered by hover, preventing cursor polling from interfering

```typescript
function handleWikilinkHover(data) {
  // Don't show action popover if edit popover is visible
  if (popoverVisible) return;

  // If the popover is already visible from hover, update its data immediately
  if (actionPopoverVisible && actionPopoverIsFromHover) {
    // Update popover data and position immediately
    actionPopoverIdentifier = data.identifier;
    actionPopoverWikilinkData = {
      /* ... */
    };
    const position = calculateActionPopoverPosition(data.x, data.y);
    actionPopoverX = position.x;
    actionPopoverY = position.y;
    return;
  }

  // If visible from cursor position, don't interfere
  if (actionPopoverVisible) return;

  // Show with 300ms delay
  hoverTimeout = setTimeout(() => {
    if (popoverVisible) return; // Double-check
    actionPopoverVisible = true;
    actionPopoverIsFromHover = true;
  }, 300);
}
```

### Mouse Leave Behavior

When the mouse leaves a wikilink:

```typescript
// Mouse left the wikilink - start leave timeout only if popover is from hover
if (actionPopoverIsFromHover) {
  leaveTimeout = setTimeout(() => {
    actionPopoverVisible = false;
    actionPopoverIsFromHover = false;
  }, 200);
}
```

This timeout is cleared if:

- Mouse enters the popover itself (`handleActionPopoverMouseEnter`)
- Mouse re-enters the wikilink

### Keyboard Handlers

The system uses a two-tier keyboard handling approach:

#### 1. Hover Popover Handlers (High Precedence)

Located in `src/renderer/src/stores/editorConfig.svelte.ts`, these handlers have high precedence and check if a hover-triggered popover is visible:

```typescript
Prec.high(
  keymap.of([
    {
      key: 'Enter',
      run: () => {
        // Check if hover popover should handle it
        if (onHoverPopoverEnter?.()) {
          return true; // Consumed by hover popover
        }
        return false; // Let other handlers process it
      }
    },
    {
      key: 'Alt-Enter',
      run: () => {
        // Check if hover popover should handle it
        if (onHoverPopoverAltEnter?.()) {
          return true; // Consumed by hover popover
        }
        return false; // Let other handlers process it
      }
    }
  ])
);
```

The handler functions in CodeMirrorEditor check if the action popover is visible from hover:

```typescript
function handleHoverPopoverEnter(): boolean {
  if (actionPopoverVisible && actionPopoverIsFromHover) {
    handleActionPopoverOpen();
    return true; // Consumed the event
  }
  return false; // Not consumed
}

function handleHoverPopoverAltEnter(): boolean {
  if (actionPopoverVisible && actionPopoverIsFromHover) {
    handleActionPopoverEdit();
    return true; // Consumed the event
  }
  return false; // Not consumed
}
```

#### 2. Wikilink Selection Handlers (High Precedence)

Located in `src/renderer/src/lib/wikilinks.svelte.ts`, these handlers work when the cursor is adjacent to a wikilink:

```typescript
Prec.high(
  keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        const selectedWikilink = view.state.field(selectedWikilinkField);
        if (selectedWikilink) {
          // Open the note
          handler(selectedWikilink.noteId, selectedWikilink.title);
          return true;
        }
        return false;
      }
    },
    {
      key: 'Alt-Enter',
      run: (view) => {
        const selectedWikilink = view.state.field(selectedWikilinkField);
        if (selectedWikilink) {
          // Open edit popover
          editHandler();
          return true;
        }
        return false;
      }
    }
  ])
);
```

**Handler Priority:**

1. Hover popover handlers check first (when hovering over a wikilink without cursor adjacent)
2. Wikilink selection handlers check second (when cursor is adjacent to a wikilink)
3. Other default handlers process the key if neither consumes it

### Data Flow for Edit Action

When the user clicks Edit or presses Alt+Enter:

1. `handleActionPopoverEdit()` is called
2. It retrieves data from `actionPopoverWikilinkData` (which was stored when the action popover was shown)
3. Sets edit popover state:
   ```typescript
   popoverIdentifier = actionPopoverWikilinkData.identifier;
   popoverDisplayText = actionPopoverWikilinkData.title;
   ```
4. Gets wikilink position from cursor (for editing):
   ```typescript
   const selected = getSelectedWikilink(editorView);
   popoverFrom = selected.from;
   popoverTo = selected.to;
   ```
5. Shows edit popover with auto-focused input

### Data Flow for Open Action

When the user clicks Open or presses Enter:

1. `handleActionPopoverOpen()` is called
2. Uses stored `actionPopoverWikilinkData`:
   ```typescript
   if (data.exists && data.noteId) {
     onWikilinkClick(data.noteId, data.title);
   } else {
     // Broken link - create new note
     onWikilinkClick(data.identifier, data.title, true);
   }
   ```

## Position Calculation

The action popover uses viewport-aware positioning:

```typescript
function calculateActionPopoverPosition(x: number, y: number) {
  const popoverWidth = 240;
  const popoverHeight = 80;

  // Check right edge
  if (finalX + popoverWidth + padding > viewportWidth) {
    finalX = viewportWidth - popoverWidth - padding;
  }

  // Choose above or below based on available space
  const spaceBelow = viewportHeight - (finalY + padding);
  const spaceAbove = finalY - padding;

  if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
    finalY = finalY - popoverHeight - padding; // Show above
  } else {
    finalY = finalY + padding; // Show below
  }
}
```

## Edit Popover Auto-Focus

When the edit popover becomes visible, it automatically focuses the input:

```typescript
$effect(() => {
  if (visible && inputElement) {
    setTimeout(() => {
      inputElement?.focus();
      inputElement?.select(); // Select all text for easy editing
    }, 0);
  }
});
```

## Styling

Both popovers include:

- Light/dark mode support via `@media (prefers-color-scheme: dark)`
- Consistent border radius (8px for action popover, matching design system)
- Drop shadow for elevation
- Fixed z-index (1000) for proper layering
- Pointer events enabled for interaction

## Edge Cases Handled

1. **Rapid hover on/off**: Debounced with 300ms delay before showing, 200ms before hiding
2. **Cursor + mouse conflict**: Hover is ignored if popover already visible from cursor
3. **Edit popover open**: Action popover completely disabled during editing
4. **Missing wikilink data**: Guards check for null/undefined before accessing data
5. **Viewport boundaries**: Position calculation ensures popover stays within viewport
6. **Focus management**: Edit popover checks if input has focus before auto-hiding
7. **Quick hover between links**: When popover is visible from hover and user hovers over a different wikilink, data and position update immediately without hiding/reshowing
8. **Keyboard shortcuts on hover**: Enter and Alt-Enter work when hovering over a wikilink, even if cursor is not adjacent to it
