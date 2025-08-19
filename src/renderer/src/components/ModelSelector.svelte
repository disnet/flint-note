<script lang="ts">
  import { getModelsByProvider } from '../config/models';
  import { modelStore } from '../stores/modelStore.svelte';
  import type { ModelInfo } from '../config/models';

  let isOpen = $state(false);
  let dropdownElement: HTMLDivElement;
  let selectorButton: HTMLButtonElement;
  let dropdownPosition = $state<'below' | 'above'>('below');

  const modelsByProvider = getModelsByProvider();
  const providerOrder = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral'];

  function handleModelSelect(model: ModelInfo): void {
    modelStore.setSelectedModel(model.id);
    isOpen = false;
  }

  function toggleDropdown(): void {
    isOpen = !isOpen;
    if (isOpen) {
      // Calculate optimal dropdown position
      updateDropdownPosition();
    }
  }

  function updateDropdownPosition(): void {
    if (!selectorButton) return;

    const rect = selectorButton.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 400; // max-height from CSS
    const buffer = 20; // Extra buffer space from viewport edges

    // Check if there's enough space below (with buffer)
    const spaceBelow = viewportHeight - rect.bottom - buffer;
    const spaceAbove = rect.top - buffer;

    // Position above if there's not enough space below but enough above
    dropdownPosition =
      spaceBelow < dropdownHeight && spaceAbove > dropdownHeight ? 'above' : 'below';
  }

  function handleClickOutside(event: MouseEvent): void {
    if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  // Close dropdown when clicking outside
  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return () => {};
  });

  // Close on escape key
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && isOpen) {
        isOpen = false;
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }

    return () => {};
  });

  // Reposition dropdown on window resize
  $effect(() => {
    function handleResize(): void {
      if (isOpen) {
        updateDropdownPosition();
      }
    }

    if (isOpen) {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    return () => {};
  });

  function formatCost(cost: { input: number; output: number }): string {
    const avgCost = (cost.input + cost.output) / 2;
    return `$${avgCost.toFixed(2)}/M`;
  }
</script>

<div class="model-selector" bind:this={dropdownElement}>
  <button
    bind:this={selectorButton}
    class="selector-button"
    class:open={isOpen}
    onclick={toggleDropdown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    <span class="model-display">
      <span class="model-icon">{modelStore.currentModelInfo.icon}</span>
      <span class="model-name">{modelStore.currentModelInfo.name}</span>
    </span>
    <span class="dropdown-arrow" class:rotated={isOpen}> ▼ </span>
  </button>

  {#if isOpen}
    <div
      class="dropdown-menu"
      class:dropdown-above={dropdownPosition === 'above'}
      role="listbox"
    >
      {#each providerOrder as provider (provider)}
        {#if modelsByProvider[provider]}
          <div class="provider-section">
            <div class="provider-header">{provider}</div>
            {#each modelsByProvider[provider] as model (model.id)}
              <button
                class="model-option"
                class:selected={model.id === modelStore.selectedModel}
                onclick={() => handleModelSelect(model)}
                role="option"
                aria-selected={model.id === modelStore.selectedModel}
              >
                <div class="model-info">
                  <div class="model-main">
                    <span class="model-icon">{model.icon}</span>
                    <span class="model-name">{model.name}</span>
                    {#if model.id === modelStore.selectedModel}
                      <span class="checkmark">✓</span>
                    {/if}
                  </div>
                  {#if model.costPerMTokens}
                    <div class="model-meta">
                      <span class="cost">{formatCost(model.costPerMTokens)}</span>
                      {#if model.contextLength}
                        <span class="context"
                          >{(model.contextLength / 1000).toFixed(0)}K ctx</span
                        >
                      {/if}
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
    display: inline-block;
  }

  .selector-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 110px;
    justify-content: space-between;
  }

  .selector-button:hover {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .selector-button.open {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-light);
  }

  .model-display {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .model-icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  .model-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-arrow {
    font-size: 0.625rem;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-top: 0.25rem;
    max-height: 400px;
    overflow-y: auto;
    min-width: 280px;
  }

  .dropdown-menu.dropdown-above {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: 0.25rem;
  }

  .provider-section:not(:last-child) {
    border-bottom: 1px solid var(--border-light);
  }

  .provider-header {
    padding: 0.75rem 1rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary);
    letter-spacing: 0.05em;
  }

  .model-option {
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--text-primary);
  }

  .model-option:hover {
    background: var(--bg-secondary);
  }

  .model-option.selected {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .model-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .checkmark {
    margin-left: auto;
    color: var(--accent-primary);
    font-weight: bold;
  }

  .model-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .cost {
    font-weight: 500;
  }

  .context {
    color: var(--text-placeholder);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .dropdown-menu {
      min-width: 250px;
    }

    .selector-button {
      min-width: 120px;
    }

    .model-name {
      max-width: 80px;
    }
  }
</style>
