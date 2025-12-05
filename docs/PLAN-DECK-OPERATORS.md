# Plan: NOT IN / BETWEEN Operators + Duplicate Field Validation

## Overview

Add `NOT IN` and `BETWEEN` operators to deck filters, and enforce single-filter-per-field to keep UI and YAML capabilities in sync. This prevents users/agents from creating configurations the UI can't properly edit.

## Design Decisions

- **Duplicate field handling**: Load first filter only, show UI warning
- **BETWEEN semantics**: Inclusive on both ends (`>= min AND <= max`)
- **NOT IN with single value**: Allowed (equivalent to `!=`)
- **Migration**: None needed (decks not yet released)

---

## Changes Required

### 1. Type Definitions (`src/renderer/src/lib/deck/types.ts`)

**Add new operators:**

```typescript
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'IN'
  | 'NOT IN'
  | 'BETWEEN';
```

**Update operator labels:**

```typescript
export function getOperatorLabel(operator: FilterOperator): string {
  const labels: Record<FilterOperator, string> = {
    // ... existing
    'NOT IN': 'not in list',
    BETWEEN: 'between'
  };
  return labels[operator] || operator;
}
```

**Update operators by type:**

```typescript
export const OPERATORS_BY_TYPE: Record<MetadataFieldType | 'system', FilterOperator[]> = {
  string: ['=', '!=', 'LIKE', 'NOT IN'],
  number: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  boolean: ['=', '!='],
  date: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  array: ['IN', '=', '!=', 'NOT IN'],
  select: ['=', '!=', 'IN', 'NOT IN'],
  system: ['=', '!=', 'LIKE', 'IN', 'NOT IN']
};
```

**Update DeckFilter type to support BETWEEN:**

```typescript
export interface DeckFilter {
  field: string;
  operator?: FilterOperator;
  /** Value to compare against. Array for IN/NOT IN, [min, max] tuple for BETWEEN */
  value: string | string[] | [string, string];
}
```

---

### 2. YAML Validation (`src/shared/deck-yaml-utils.ts`)

**Add duplicate field detection:**

```typescript
export interface DeckValidationWarning {
  type: 'duplicate_field';
  field: string;
  message: string;
}

export interface ParsedDeckResult {
  config: DeckConfig;
  warnings: DeckValidationWarning[];
}

function validateAndDeduplicateFilters(filters: DeckFilter[]): {
  filters: DeckFilter[];
  warnings: DeckValidationWarning[];
} {
  const seen = new Set<string>();
  const deduplicated: DeckFilter[] = [];
  const warnings: DeckValidationWarning[] = [];

  for (const filter of filters) {
    if (seen.has(filter.field)) {
      warnings.push({
        type: 'duplicate_field',
        field: filter.field,
        message: `Multiple filters for "${filter.field}" - only the first is used`
      });
      continue;
    }
    seen.add(filter.field);
    deduplicated.push(filter);
  }

  return { filters: deduplicated, warnings };
}
```

**Update parsing to return warnings:**

- `parseDeckYaml()` should call `validateAndDeduplicateFilters()` on each view's filters
- Return both config and warnings array

---

### 3. UI Warning Display (`src/renderer/src/lib/deck/DeckWidget.svelte`)

**Add warning state and display:**

```svelte
let validationWarnings = $state<DeckValidationWarning[]>([]);

// Show warning banner if any warnings exist
{#if validationWarnings.length > 0}
  <div class="validation-warning">
    <svg><!-- warning icon --></svg>
    {validationWarnings[0].message}
    {#if validationWarnings.length > 1}
      <span class="more-warnings">+{validationWarnings.length - 1} more</span>
    {/if}
  </div>
{/if}
```

---

### 4. Filter Builder Changes (`src/renderer/src/lib/deck/FilterBuilder.svelte`)

**Track used fields and disable in selector:**

```typescript
const usedFields = $derived(new Set(editingFilters.map((f) => f.field).filter(Boolean)));
```

**Pass to FieldSelector:**

```svelte
<FieldSelector
  {fields}
  selectedField={filter.field}
  disabledFields={usedFields}
  onSelect={handleFieldChange}
/>
```

---

### 5. Field Selector Changes (`src/renderer/src/lib/deck/FieldSelector.svelte`)

**Add disabled fields prop:**

```typescript
interface Props {
  fields: FilterFieldInfo[];
  selectedField: string;
  disabledFields?: Set<string>;
  onSelect: (field: string) => void;
}
```

**Disable already-used fields in dropdown:**

- Show disabled fields grayed out with "(already filtered)" hint
- Exclude current filter's field from disabled check (so you can still see your own selection)

---

### 6. Value Input Changes (`src/renderer/src/lib/deck/ValueInput.svelte`)

**Add BETWEEN input mode:**

When `operator === 'BETWEEN'`:

- Render two inputs side-by-side with "to" label between
- Value is `[min, max]` tuple
- For date fields: two date pickers
- For number fields: two number inputs

```svelte
{#if operator === 'BETWEEN'}
  <div class="between-inputs">
    <input
      type={fieldType === 'date' ? 'date' : 'number'}
      value={Array.isArray(value) ? value[0] : ''}
      onchange={(e) => handleBetweenChange(0, e.currentTarget.value)}
    />
    <span class="between-separator">to</span>
    <input
      type={fieldType === 'date' ? 'date' : 'number'}
      value={Array.isArray(value) ? value[1] : ''}
      onchange={(e) => handleBetweenChange(1, e.currentTarget.value)}
    />
  </div>
{/if}
```

**NOT IN handling:**

- Reuse existing `IN` multi-select UI (already supports array values)
- Just need to ensure operator switch preserves array value when going IN ↔ NOT IN

---

### 7. Filter Row Changes (`src/renderer/src/lib/deck/FilterRow.svelte`)

**Update operator change handler:**

```typescript
function handleOperatorChange(operator: FilterOperator): void {
  let newValue = filter.value;

  // Handle transitions between value types
  if (operator === 'BETWEEN') {
    // Convert to [min, max] tuple
    newValue = Array.isArray(filter.value)
      ? [filter.value[0] || '', filter.value[1] || '']
      : [filter.value || '', ''];
  } else if (operator === 'IN' || operator === 'NOT IN') {
    // Convert to array
    newValue = Array.isArray(filter.value)
      ? filter.value
      : filter.value
        ? [filter.value]
        : [];
  } else {
    // Convert to single value
    newValue = Array.isArray(filter.value) ? filter.value[0] || '' : filter.value;
  }

  onChange({ ...filter, operator, value: newValue });
}
```

---

### 8. SQL Generation (`src/server/database/search-manager.ts`)

**Add NOT IN support:**

```typescript
case 'NOT IN': {
  if (Array.isArray(condition.value) && condition.value.length > 0) {
    const placeholders = condition.value.map(() => '?').join(', ');
    // Use LEFT JOIN pattern to include notes missing the field
    whereClause = `(nm_${alias}.value IS NULL OR nm_${alias}.value NOT IN (${placeholders}))`;
    params.push(...condition.value);
  }
  break;
}
```

**Add BETWEEN support:**

```typescript
case 'BETWEEN': {
  if (Array.isArray(condition.value) && condition.value.length === 2) {
    whereClause = `nm_${alias}.value BETWEEN ? AND ?`;
    params.push(condition.value[0], condition.value[1]);
  }
  break;
}
```

---

### 9. Agent Tool Updates (`src/main/tool-service.ts`)

**Add validation in query_deck and create_deck:**

```typescript
function validateFilters(filters: DeckFilter[]): void {
  const seen = new Set<string>();
  for (const filter of filters) {
    if (seen.has(filter.field)) {
      throw new Error(
        `Duplicate filter field "${filter.field}". Use IN/NOT IN for multiple values or BETWEEN for ranges.`
      );
    }
    seen.add(filter.field);
  }
}
```

**Update filter schema to include new operators:**

```typescript
operator: z.enum([
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'IN',
  'NOT IN',
  'BETWEEN'
]).optional();
```

---

### 10. System Prompt Updates (`src/main/system-prompt.md`)

**Update operator reference:**

```markdown
**Supported Filter Operators:**

| Operator             | Description       | Value Type | Example                                                                           |
| -------------------- | ----------------- | ---------- | --------------------------------------------------------------------------------- |
| `=`                  | Equals (default)  | string     | `{ field: "status", value: "active" }`                                            |
| `!=`                 | Not equals        | string     | `{ field: "status", operator: "!=", value: "done" }`                              |
| `>`, `<`, `>=`, `<=` | Comparison        | string     | `{ field: "priority", operator: ">", value: "3" }`                                |
| `LIKE`               | Contains          | string     | `{ field: "title", operator: "LIKE", value: "meeting" }`                          |
| `IN`                 | Matches any       | string[]   | `{ field: "status", operator: "IN", value: ["active", "pending"] }`               |
| `NOT IN`             | Excludes all      | string[]   | `{ field: "status", operator: "NOT IN", value: ["done", "cancelled"] }`           |
| `BETWEEN`            | Range (inclusive) | [min, max] | `{ field: "due_date", operator: "BETWEEN", value: ["2024-01-01", "2024-12-31"] }` |

**Important:** Each field can only have ONE filter. Use `IN`/`NOT IN` for multiple values, `BETWEEN` for ranges.
```

**Add examples:**

```markdown
// Exclude multiple statuses (use NOT IN, not multiple != filters)
query_deck({
filters: [
{ field: "status", operator: "NOT IN", value: ["done", "cancelled", "archived"] }
]
})

// Date range (use BETWEEN, not multiple >= and <= filters)
query_deck({
filters: [
{ field: "due_date", operator: "BETWEEN", value: ["2024-01-01", "2024-03-31"] }
]
})
```

---

## Implementation Order

1. **Types** - Add new operators to type definitions
2. **SQL** - Implement NOT IN and BETWEEN in search-manager
3. **YAML validation** - Add duplicate detection with warnings
4. **ValueInput** - Add BETWEEN two-value input UI
5. **FilterRow** - Handle operator transitions for new types
6. **FieldSelector** - Add disabled fields support
7. **FilterBuilder** - Track used fields, pass to selector
8. **DeckWidget** - Display validation warnings
9. **Agent tools** - Add validation and update schemas
10. **System prompt** - Document new operators and constraints

---

## Testing Checklist

- [ ] NOT IN with multiple values filters correctly
- [ ] NOT IN with single value works (equivalent to !=)
- [ ] NOT IN includes notes missing the field (like != does)
- [ ] BETWEEN works for dates (inclusive both ends)
- [ ] BETWEEN works for numbers
- [ ] Duplicate field filters show warning in UI
- [ ] Duplicate field filters keep first, discard rest
- [ ] Field selector disables already-used fields
- [ ] Switching operators preserves/converts values appropriately
- [ ] Agent query_deck rejects duplicate fields with helpful error
- [ ] Agent create_deck rejects duplicate fields with helpful error
- [ ] YAML round-trips correctly for new operators
