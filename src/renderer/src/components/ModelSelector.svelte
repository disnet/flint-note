<script lang="ts">
  import { modelStore } from '../stores/modelStore.svelte';
  import { SUPPORTED_MODELS } from '../config/models';

  let hoveredModelId = $state<string | null>(null);
  let tooltipPosition = $state<'above' | 'below'>('above');
  let segmentElements = new Map<string, HTMLElement>();

  function handleModelSelect(modelId: string): void {
    if (modelId !== modelStore.selectedModel) {
      modelStore.setSelectedModel(modelId);
    }
  }

  function handleMouseEnter(modelId: string, event: MouseEvent): void {
    hoveredModelId = modelId;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const tooltipHeight = 100; // Approximate tooltip height
    const spaceAbove = rect.top;

    // If not enough space above, show below
    tooltipPosition = spaceAbove < tooltipHeight ? 'below' : 'above';
  }

  function handleMouseLeave(): void {
    hoveredModelId = null;
  }
</script>

<div class="segmented-control" role="group" aria-label="Model selection">
  {#each SUPPORTED_MODELS as model (model.id)}
    <button
      class="segment"
      class:active={model.id === modelStore.selectedModel}
      onclick={() => handleModelSelect(model.id)}
      onmouseenter={(e) => handleMouseEnter(model.id, e)}
      onmouseleave={handleMouseLeave}
      aria-pressed={model.id === modelStore.selectedModel}
    >
      <span class="model-icon">{model.icon}</span>
      <span class="model-name">{model.name}</span>
      {#if hoveredModelId === model.id}
        <div class="tooltip" class:tooltip-below={tooltipPosition === 'below'}>
          {model.description}
        </div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    display: inline-flex;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    padding: 0.125rem;
    gap: 0.125rem;
    overflow: visible;
    position: relative;
  }

  .segment {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.15s ease;
    white-space: nowrap;
    position: relative;
    overflow: visible;
  }

  .segment:hover:not(.active) {
    background: rgba(var(--accent-primary-rgb, 59, 130, 246), 0.08);
    color: var(--text-secondary);
  }

  .segment.active {
    background: var(--bg-primary);
    color: var(--accent-primary);
    font-weight: 600;
    border-color: var(--accent-primary);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    cursor: default;
    transform: scale(1.02);
  }

  @media (prefers-color-scheme: dark) {
    .segmented-control {
      background: rgba(0, 0, 0, 0.3);
      border-color: var(--border-medium);
    }

    .segment.active {
      background: var(--bg-secondary);
      border-color: var(--accent-primary);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }

    .segment:hover:not(.active) {
      background: rgba(var(--accent-primary-rgb, 96, 165, 250), 0.15);
    }
  }

  .segment.active .model-icon {
    filter: brightness(1.1);
  }

  .model-icon {
    font-size: 0.875rem;
    line-height: 1;
    transition:
      filter 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .segment.active .model-icon {
    transform: scale(1.1);
  }

  .model-name {
    line-height: 1;
  }

  .tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-primary);
    white-space: normal;
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    z-index: 1000;
    min-width: 200px;
    max-width: 250px;
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .segment:hover .tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  .tooltip.tooltip-below {
    bottom: auto;
    top: calc(100% + 8px);
    transform: translateY(-4px);
  }

  .segment:hover .tooltip.tooltip-below {
    transform: translateY(0);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .model-name {
      display: none;
    }

    .segment {
      padding: 0.375rem 0.5rem;
    }
  }
</style>
