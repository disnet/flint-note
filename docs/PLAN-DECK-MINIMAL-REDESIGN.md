# Plan: Deck Minimal Redesign

## Overview

Redesign the Deck widget with a minimal, chip-based interface that replaces the current table layout.

## New Design

```
Deck Name                          n notes [▼]
───────────────────────────────────────────────
[+ New Note] [type="Note"] [created ↓] [+ Add Prop]
Note title 1
  ┌──────────┐ ┌──────────┐
  │ Dec 3    │ │ value    │
  └──────────┘ └──────────┘
Note title 2
  ┌──────────┐ ┌──────────┐
  │ Dec 2    │ │ value    │
  └──────────┘ └──────────┘
```

## Key Changes

### 1. Remove Table Structure

- Replace `<table>` with a simple list of notes
- Each note is a clickable row with title
- Prop values displayed as chips below each title

### 2. Chip-Based Toolbar

Replace current header/filter UI with a single toolbar row:

- `[+ New Note]` - Creates new note inline
- `[type="Note"]` - Type filter chip (clickable to change type)
- `[propName]` - Active prop chips (clickable to sort, shows sort indicator)
- `[+ Add Prop]` - Adds new prop filter/column

### 3. Default Type Filter

- Start with `flint_type = "note"` filter by default
- Always show type chip in toolbar
- Clicking type chip opens dropdown to select different type

### 4. Prop System (replaces columns + filters)

- "Props" unify the concept of displayed columns and potential filters
- Adding a prop adds it as a displayed field (no filter constraint by default)
- Clicking a prop chip can:
  - Sort by that field (primary action)
  - Open menu to add filter constraint
  - Remove the prop

### 5. Note List Styling

- Remove table borders and alternating row colors
- Title styled as link (clickable to navigate)
- Prop values as rounded chips below title
- Clean whitespace between notes

## Implementation Steps

### Step 1: Create New Toolbar Component

Create `DeckToolbar.svelte`:

- `[+ New Note]` button (triggers inline creation)
- Type chip with dropdown selector
- Prop chips for each active column/prop
- `[+ Add Prop]` button with field picker dialog

### Step 2: Create Prop Chip Component

Create `PropChip.svelte`:

- Display prop name and optional sort indicator
- Click to toggle sort
- Right-click or long-press for menu (filter, remove)
- Hover shows remove button

### Step 3: Create Note List Component

Create `NoteListItem.svelte`:

- Title row (clickable link)
- Prop values row (chips)
- Inline editing support
- Hover state for actions

### Step 4: Refactor DeckWidget

- Replace table structure with list
- Integrate new toolbar
- Default to type="note" filter on new decks
- Update expand/collapse behavior

### Step 5: Update Field Picker Dialog

Create `PropPickerDialog.svelte`:

- Show available fields from note type schema
- Grouped by system vs metadata fields
- Search/filter capability
- Quick-add on click

### Step 6: Update Type Selector

Modify type selection to be inline chip:

- Dropdown opens on click
- Shows all available note types
- Auto-updates schema when type changes

### Step 7: Update Styling

- Remove table styles from `deck-theme.ts`
- Add chip/pill styles
- Add list item styles
- Maintain edit mode styling

### Step 8: Prop Sorting

- Click prop chip header to toggle sort
- Visual indicator (↑/↓) on sorted prop
- Single active sort at a time

## Component Changes Summary

### New Components

- `DeckToolbar.svelte` - Toolbar with chips
- `PropChip.svelte` - Individual prop chip
- `NoteListItem.svelte` - Single note in list
- `PropPickerDialog.svelte` - Dialog to add props

### Modified Components

- `DeckWidget.svelte` - Use new layout
- `deck-theme.ts` - Update styles

### Removed/Deprecated

- Table-specific styling
- Separate column header row
- FilterBuilder (functionality moves to PropChip)
- ColumnBuilder (functionality moves to toolbar)

## YAML Schema Updates

The existing schema remains compatible. Changes:

- Default new decks to have `filters: [{ field: "flint_type", value: "note" }]`
- `columns` array continues to define visible props

## Migration

- Existing deck blocks work unchanged
- New decks get default type filter
- No breaking changes to YAML format

## Files to Modify

1. `src/renderer/src/lib/deck/DeckWidget.svelte`
2. `src/renderer/src/lib/deck/deck-theme.ts`
3. `src/renderer/src/lib/deck/types.ts` (if needed)
4. `src/renderer/src/lib/deck/index.ts` (exports)

## Files to Create

1. `src/renderer/src/lib/deck/DeckToolbar.svelte`
2. `src/renderer/src/lib/deck/PropChip.svelte`
3. `src/renderer/src/lib/deck/NoteListItem.svelte`
4. `src/renderer/src/lib/deck/PropPickerDialog.svelte`
