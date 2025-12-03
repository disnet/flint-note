<script lang="ts">
  import type { QueryFilter, FilterFieldInfo, FilterOperator } from './types';
  import { getOperatorsForType, SYSTEM_FIELDS } from './types';
  import FieldSelector from './FieldSelector.svelte';
  import OperatorSelector from './OperatorSelector.svelte';
  import ValueInput from './ValueInput.svelte';

  interface Props {
    filter: QueryFilter;
    fields: FilterFieldInfo[];
    valueSuggestions?: string[];
    onChange: (filter: QueryFilter) => void;
    onRemove: () => void;
  }

  let { filter, fields, valueSuggestions = [], onChange, onRemove }: Props = $props();

  // Combine system fields with custom fields
  const allFields = $derived.by(() => {
    const customFields = fields.filter((f) => !f.isSystem);
    return [...SYSTEM_FIELDS, ...customFields];
  });

  // Get field info for current field
  const selectedFieldInfo = $derived(
    allFields.find((f) => f.name === filter.field) || null
  );

  // Get available operators for field type
  const availableOperators = $derived.by(() => {
    if (!selectedFieldInfo) return ['=', '!='] as FilterOperator[];
    return getOperatorsForType(selectedFieldInfo.type);
  });

  // Ensure operator is valid for field type
  const currentOperator = $derived.by(() => {
    const op = filter.operator || '=';
    if (availableOperators.includes(op)) return op;
    return availableOperators[0];
  });

  function handleFieldChange(fieldName: string): void {
    const fieldInfo = allFields.find((f) => f.name === fieldName);
    const operators = fieldInfo
      ? getOperatorsForType(fieldInfo.type)
      : (['='] as FilterOperator[]);

    // Reset value and operator when field changes
    onChange({
      field: fieldName,
      operator: operators[0],
      value: ''
    });
  }

  function handleOperatorChange(operator: FilterOperator): void {
    // Reset value when switching to/from IN operator
    const newValue =
      operator === 'IN'
        ? Array.isArray(filter.value)
          ? filter.value
          : []
        : Array.isArray(filter.value)
          ? filter.value[0] || ''
          : filter.value;

    onChange({
      ...filter,
      operator,
      value: newValue
    });
  }

  function handleValueChange(value: string | string[]): void {
    onChange({
      ...filter,
      value
    });
  }
</script>

<div class="filter-row">
  <div class="filter-controls">
    <FieldSelector {fields} selectedField={filter.field} onSelect={handleFieldChange} />

    <OperatorSelector
      operators={availableOperators}
      selectedOperator={currentOperator}
      onSelect={handleOperatorChange}
    />

    <ValueInput
      fieldType={selectedFieldInfo?.type || 'string'}
      operator={currentOperator}
      value={filter.value}
      options={selectedFieldInfo?.options}
      suggestions={valueSuggestions}
      onChange={handleValueChange}
    />
  </div>

  <button
    class="remove-btn"
    onclick={onRemove}
    type="button"
    aria-label="Remove filter"
    title="Remove filter"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  </button>
</div>

<style>
  .filter-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
  }

  .filter-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    flex: 1;
    align-items: flex-start;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .remove-btn:hover {
    background: var(--bg-error, rgba(239, 68, 68, 0.1));
    color: var(--text-error, #ef4444);
  }

  .remove-btn svg {
    stroke: currentColor;
  }
</style>
