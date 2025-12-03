# Phase 4: Column Configuration UI - Implementation Plan

## Overview

This plan implements Phase 4 from the PRD-DATAVIEW.md, adding a visual column configuration UI and type-aware column renderers to the dataview widget.

## Current State

- Columns are configured as simple string arrays in YAML: `columns: [status, priority]`
- All columns render as plain text via `getColumnValue()` in DataviewWidget.svelte
- Arrays show as comma-separated, dates use basic `toLocaleDateString()`
- No UI for column configuration - requires manual YAML editing
- Title column is always first (hardcoded)

## Goals

1. **Column Picker UI** (4.1) - Visual interface to add/remove/reorder columns
2. **Column Type Renderers** (4.2) - Type-specific formatting for dates, numbers, booleans, arrays, links

## Design Decisions

### 1. YAML Schema - Backward Compatible Enhancement

Keep simple string format for backward compatibility, add optional enhanced format:

```yaml
# Simple format (current, still supported)
columns:
  - status
  - priority

# Enhanced format (new, optional)
columns:
  - status
  - field: priority
    label: Priority Level
  - field: due_date
    format: relative  # "2 days ago" vs "Dec 15, 2024"
```

### 2. Column Configuration Type

```typescript
// In types.ts
interface ColumnConfig {
  field: string;           // Field name (required)
  label?: string;          // Custom display label
  format?: ColumnFormat;   // Type-specific formatting options
}

type ColumnFormat =
  | 'default'              // Use type-inferred formatting
  | 'relative'             // Dates: "2 days ago"
  | 'absolute'             // Dates: "Dec 15, 2024"
  | 'iso'                  // Dates: "2024-12-15"
  | 'pills'                // Arrays: pill/tag style
  | 'comma'                // Arrays: comma-separated
  | 'check'                // Booleans: checkbox
  | 'yesno';               // Booleans: Yes/No text

// In FlintQueryConfig, update columns type
columns?: (string | ColumnConfig)[];
```

### 3. Component Architecture

```
DataviewWidget.svelte
├── ColumnBuilder.svelte        # NEW - Column configuration panel
│   ├── ColumnRow.svelte        # NEW - Individual column with drag handle
│   └── FieldSelector.svelte    # REUSE from filters
└── ColumnCell.svelte           # NEW - Type-aware cell renderer
```

## Implementation Steps

### Step 1: Extend Type Definitions (`types.ts`)

- Add `ColumnConfig` interface
- Add `ColumnFormat` type
- Add system column fields for column selection (type, created, updated, title)
- Add helper `normalizeColumn()` to handle string vs ColumnConfig

### Step 2: Update YAML Utilities (`yaml-utils.ts`)

- Update `parseQueryYaml()` to parse enhanced column format
- Update `serializeQueryConfig()` to output enhanced format only when needed
- Maintain backward compatibility with string-only columns

### Step 3: Create ColumnCell Component (`ColumnCell.svelte`)

Smart cell renderer with type-specific formatting:

- **String**: Plain text (default)
- **Date**: Formatted with relative/absolute option
- **Number**: Numeric formatting (commas for thousands)
- **Boolean**: Checkbox display or Yes/No text
- **Array**: Pills (colored badges) or comma-separated
- **Link/Wikilink**: Detect `[[note]]` syntax, render as clickable (uses existing wikilink patterns)

### Step 4: Create ColumnRow Component (`ColumnRow.svelte`)

Individual column configuration row with:

- Drag handle (grip icon) for reordering
- Field selector dropdown (reuse FieldSelector pattern)
- Optional label input
- Format dropdown (for applicable types)
- Remove button

### Step 5: Create ColumnBuilder Component (`ColumnBuilder.svelte`)

Main column configuration panel with:

- Header: "Columns"
- Column list with drag-and-drop reordering
- "Add Column" button
- Empty state message
- Loading state for schema fields

Follows FilterBuilder patterns:

- Local editing state during configuration
- Only sync complete columns to parent
- Propagate changes on close (deferred YAML update)

### Step 6: Update DataviewWidget (`DataviewWidget.svelte`)

- Add column configuration toggle button (grid icon next to filter icon)
- Add `isConfiguringColumns` state
- Add `pendingColumns` for local edits during configuration
- Replace `getColumnValue()` calls with `<ColumnCell>` component
- Update `displayColumns` to handle both string and ColumnConfig

### Step 7: Implement Drag-and-Drop Reordering

Create local drag state for column reordering:

- Use native HTML5 drag-and-drop API (consistent with existing drag utilities)
- Visual feedback during drag (highlight drop target)
- Update column order on drop

### Step 8: Update Styling (`dataview-theme.ts`)

Add styles for:

- Column builder panel
- Column row with drag handle
- ColumnCell variants (pills, checkboxes, etc.)
- Grid icon for column configuration button

## File Changes Summary

| File                    | Change                                 |
| ----------------------- | -------------------------------------- |
| `types.ts`              | Add ColumnConfig, ColumnFormat types   |
| `yaml-utils.ts`         | Parse/serialize enhanced column format |
| `ColumnCell.svelte`     | NEW - Type-aware cell renderer         |
| `ColumnRow.svelte`      | NEW - Column config row with drag      |
| `ColumnBuilder.svelte`  | NEW - Main column configuration panel  |
| `DataviewWidget.svelte` | Add column config UI, use ColumnCell   |
| `dataview-theme.ts`     | Add column-related styles              |
| `index.ts`              | Export new components/types            |

## Testing Considerations

1. Backward compatibility - existing YAML with string columns still works
2. Mixed format - YAML with both string and object columns
3. Drag reordering - columns maintain correct order
4. Type detection - correct renderer for each field type
5. Real-time preview - column changes reflect immediately in table

## Out of Scope (Future Phases)

- Column width configuration (Phase 4 nice-to-have, defer if complex)
- Column sorting from builder (already have header click)
- Persisting column preferences separately from YAML
