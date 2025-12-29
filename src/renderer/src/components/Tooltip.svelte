<script lang="ts">
  /**
   * Reusable tooltip wrapper component with viewport-safe positioning.
   * Renders tooltip in a portal to escape parent container clipping.
   */

  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    children: Snippet;
  }

  let { text, position = 'top', children }: Props = $props();

  let wrapperEl: HTMLSpanElement | undefined = $state();
  let tooltipEl: HTMLDivElement | undefined = $state();

  const GAP = 8;
  const PADDING = 8;

  onMount(() => {
    // Create tooltip element and append to body
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'portal-tooltip';
    tooltipEl.textContent = text;
    document.body.appendChild(tooltipEl);
  });

  onDestroy(() => {
    tooltipEl?.remove();
  });

  // Update text if it changes
  $effect(() => {
    if (tooltipEl) {
      tooltipEl.textContent = text;
    }
  });

  function showTooltip(): void {
    if (!wrapperEl || !tooltipEl) return;

    tooltipEl.classList.add('visible');

    // Calculate position after making visible so we can measure
    requestAnimationFrame(() => {
      if (!wrapperEl || !tooltipEl) return;

      const trigger = wrapperEl.getBoundingClientRect();
      const tooltip = tooltipEl.getBoundingClientRect();

      let top = 0;
      let left = 0;

      if (position === 'top') {
        top = trigger.top - tooltip.height - GAP;
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
      } else if (position === 'bottom') {
        top = trigger.bottom + GAP;
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
      } else if (position === 'left') {
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        left = trigger.left - tooltip.width - GAP;
      } else if (position === 'right') {
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        left = trigger.right + GAP;
      }

      // Clamp to viewport
      left = Math.max(PADDING, Math.min(left, window.innerWidth - tooltip.width - PADDING));
      top = Math.max(PADDING, Math.min(top, window.innerHeight - tooltip.height - PADDING));

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
    });
  }

  function hideTooltip(): void {
    tooltipEl?.classList.remove('visible');
  }
</script>

<svelte:head>
  <style>
    .portal-tooltip {
      position: fixed;
      top: 0;
      left: 0;
      padding: 0.375rem 0.625rem;
      background: var(--bg-primary);
      border: 1px solid var(--border-medium);
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 99999;
    }
    .portal-tooltip.visible {
      opacity: 1;
      visibility: visible;
    }
  </style>
</svelte:head>

<span
  bind:this={wrapperEl}
  class="tooltip-wrapper"
  onmouseenter={showTooltip}
  onmouseleave={hideTooltip}
>
  {@render children()}
</span>

<style>
  .tooltip-wrapper {
    display: inline-flex;
  }
</style>
