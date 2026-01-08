/**
 * Svelte action to enable auto-hiding scrollbar behavior.
 * Adds 'is-scrolling' class during scroll and 'is-resizing' during viewport resize.
 * Use with the 'scrollable' CSS class from base.css.
 *
 * Usage:
 *   <div class="scrollable" use:scrollable>...</div>
 */

import { onMount } from 'svelte';

interface ScrollableOptions {
  /** Time in ms to keep scrollbar visible after scrolling stops (default: 1000) */
  scrollTimeout?: number;
  /** Time in ms to keep scrollbar visible after resize stops (default: 500) */
  resizeTimeout?: number;
}

export function scrollable(
  node: HTMLElement,
  options: ScrollableOptions = {}
): { destroy: () => void } {
  const { scrollTimeout = 1000, resizeTimeout = 500 } = options;

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  function handleScroll(): void {
    node.classList.add('is-scrolling');

    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }

    scrollTimer = setTimeout(() => {
      node.classList.remove('is-scrolling');
      scrollTimer = null;
    }, scrollTimeout);
  }

  function handleResize(): void {
    node.classList.add('is-resizing');

    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = setTimeout(() => {
      node.classList.remove('is-resizing');
      resizeTimer = null;
    }, resizeTimeout);
  }

  // Observe resize on the element itself (for when container changes size)
  const resizeObserver = new ResizeObserver(() => {
    handleResize();
  });

  node.addEventListener('scroll', handleScroll, { passive: true });
  resizeObserver.observe(node);

  // Also observe window resize for viewport changes
  window.addEventListener('resize', handleResize, { passive: true });

  return {
    destroy() {
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }

      node.classList.remove('is-scrolling', 'is-resizing');
    }
  };
}

/**
 * Hook to setup scrollable behavior on an element reference.
 * For use when you can't use the action directly.
 *
 * Usage:
 *   let containerRef: HTMLElement;
 *   useScrollable(() => containerRef);
 */
export function useScrollable(
  getNode: () => HTMLElement | null | undefined,
  options: ScrollableOptions = {}
): void {
  onMount(() => {
    const node = getNode();
    if (!node) return;

    const action = scrollable(node, options);
    return action.destroy;
  });
}
