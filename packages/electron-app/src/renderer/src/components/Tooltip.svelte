<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, content }: { children: Snippet; content: string } = $props();

  let showTooltip = $state(false);

  function handleMouseEnter(): void {
    showTooltip = true;
  }

  function handleMouseLeave(): void {
    showTooltip = false;
  }
</script>

<div
  class="tooltip-trigger"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="tooltip"
>
  {@render children()}
  {#if showTooltip}
    <div class="tooltip">
      {content}
    </div>
  {/if}
</div>

<style>
  .tooltip-trigger {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    padding: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    white-space: pre-line;
    box-shadow: 0 4px 12px var(--shadow-medium);
    z-index: 1000;
    margin-bottom: 0.5rem;
    min-width: 200px;
    max-width: 300px;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--bg-primary);
  }

  .tooltip::before {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 7px solid transparent;
    border-top-color: var(--border-medium);
    margin-top: 1px;
  }
</style>
