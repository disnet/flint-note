<script lang="ts">
  import type { FilterOperator } from './types';
  import { getOperatorLabel } from './types';

  interface Props {
    operators: FilterOperator[];
    selectedOperator: FilterOperator;
    onSelect: (operator: FilterOperator) => void;
  }

  let { operators, selectedOperator, onSelect }: Props = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let highlightedIndex = $state(0);
  let dropdownPosition = $state({ top: 0, left: 0, minWidth: 0 });

  // Find current selection index
  const selectedIndex = $derived(operators.indexOf(selectedOperator));

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
      highlightedIndex = 0;
    }
  }

  $effect(() => {
    if (isOpen) {
      // Use capture phase to detect clicks before stopPropagation() in parent elements
      document.addEventListener('click', handleClickOutside, true);
      highlightedIndex = selectedIndex >= 0 ? selectedIndex : 0;
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
    return undefined;
  });

  function toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    if (!isOpen && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width
      };
    }
    isOpen = !isOpen;
  }

  function selectOperator(operator: FilterOperator): void {
    isOpen = false;
    onSelect(operator);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      isOpen = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOperator(operators[highlightedIndex]);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % operators.length;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + operators.length) % operators.length;
      return;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={dropdownRef} class="operator-selector">
  <button
    bind:this={buttonRef}
    class="operator-button"
    onclick={toggleDropdown}
    onkeydown={handleKeyDown}
    type="button"
    aria-haspopup="true"
    aria-expanded={isOpen}
    title={getOperatorLabel(selectedOperator)}
  >
    <span class="operator-symbol">{selectedOperator}</span>
    <span class="dropdown-icon" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div
      class="dropdown-menu"
      role="listbox"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; min-width: {dropdownPosition.minWidth}px;"
    >
      {#each operators as operator, index (operator)}
        <button
          class="dropdown-item"
          class:selected={operator === selectedOperator}
          class:highlighted={index === highlightedIndex}
          onclick={() => selectOperator(operator)}
          type="button"
          role="option"
          aria-selected={operator === selectedOperator}
        >
          <span class="operator-symbol">{operator}</span>
          <span class="operator-label">{getOperatorLabel(operator)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .operator-selector {
    position: relative;
    display: inline-block;
  }

  .operator-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-primary);
    transition: all 0.2s ease;
    min-width: 3.5rem;
  }

  .operator-button:hover {
    border-color: var(--border-medium);
  }

  .operator-button:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .operator-symbol {
    font-family: var(--font-mono, 'SF Mono', 'Monaco', 'Inconsolata', monospace);
    font-weight: 600;
  }

  .dropdown-icon {
    font-size: 0.5rem;
    opacity: 0.6;
    transition: transform 0.2s ease;
    margin-left: auto;
  }

  .dropdown-icon.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: fixed;
    width: max-content;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
    overflow: hidden;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: var(--bg-secondary);
  }

  .dropdown-item.selected {
    background: var(--accent-primary);
    color: white;
  }

  .dropdown-item.selected:hover,
  .dropdown-item.selected.highlighted {
    background: var(--accent-hover);
  }

  .dropdown-item .operator-symbol {
    min-width: 2rem;
    text-align: center;
  }

  .operator-label {
    color: var(--text-secondary);
    font-weight: 400;
  }

  .dropdown-item.selected .operator-label {
    color: rgba(255, 255, 255, 0.8);
  }
</style>
