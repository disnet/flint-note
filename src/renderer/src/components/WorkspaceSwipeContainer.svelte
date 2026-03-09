<script lang="ts">
  /**
   * Mobile-only horizontal swipe container for switching between workspaces.
   * Renders 3 pages (prev, current, next) and uses spring physics for animation.
   */
  import { onMount, type Snippet } from 'svelte';
  import { createSpring } from '../lib/spring.svelte';
  import type { Workspace } from '../lib/automerge';

  interface Props {
    workspaces: Workspace[];
    activeWorkspaceId: string | undefined;
    onWorkspaceChange: (id: string) => void;
    /** Snippet that receives a workspaceId to render content for that workspace */
    page: Snippet<[string]>;
    /** Disable swiping (e.g. during drag-to-reorder) */
    disabled?: boolean;
    /** Called when swipe state changes (true = swiping, false = not swiping) */
    onSwipeStateChange?: (isSwiping: boolean) => void;
  }

  let {
    workspaces,
    activeWorkspaceId,
    onWorkspaceChange,
    page,
    disabled = false,
    onSwipeStateChange
  }: Props = $props();

  let viewportEl = $state<HTMLElement | null>(null);
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);

  // Spring for the track offset
  const spring = createSpring(0, { stiffness: 0.25, damping: 0.6, precision: 0.5 });

  // Track touch state manually (not using createSwipeHandler since we need direct spring control)
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = $state(false);
  let directionLocked = false;
  let isVerticalScroll = false;

  // Notify parent when swipe state changes
  $effect(() => {
    onSwipeStateChange?.(isSwiping);
  });

  const activeIndex = $derived(workspaces.findIndex((w) => w.id === activeWorkspaceId));

  // Get prev/current/next workspace (non-cyclic: null at edges)
  const prevWorkspace = $derived.by(() => {
    if (activeIndex <= 0) return null;
    return workspaces[activeIndex - 1];
  });

  const currentWorkspace = $derived(activeIndex >= 0 ? workspaces[activeIndex] : null);

  const nextWorkspace = $derived.by(() => {
    if (activeIndex < 0 || activeIndex >= workspaces.length - 1) return null;
    return workspaces[activeIndex + 1];
  });

  // Pages to render: [prev?, current, next?] with unique keys
  interface PageEntry {
    key: string;
    workspace: Workspace;
  }

  const pages = $derived.by(() => {
    const result: PageEntry[] = [];
    if (prevWorkspace)
      result.push({ key: 'prev-' + prevWorkspace.id, workspace: prevWorkspace });
    if (currentWorkspace)
      result.push({ key: 'current-' + currentWorkspace.id, workspace: currentWorkspace });
    if (nextWorkspace)
      result.push({ key: 'next-' + nextWorkspace.id, workspace: nextWorkspace });
    return result;
  });

  // Index of current workspace within the pages array
  const currentPageIndex = $derived(prevWorkspace ? 1 : 0);

  // The resting position: current page centered
  const restOffset = $derived(-currentPageIndex * viewportWidth);

  // Snap spring to rest position when workspace changes externally
  $effect(() => {
    // Depend on activeWorkspaceId to re-run when it changes
    void activeWorkspaceId;
    if (viewportWidth > 0) {
      spring.snap(restOffset);
    }
  });

  // Track transform
  const trackTransform = $derived(`translateX(${spring.value}px)`);

  function handleTouchStart(e: TouchEvent): void {
    if (workspaces.length <= 1 || disabled) return;

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    directionLocked = false;
    isVerticalScroll = false;
    isSwiping = false;
  }

  function handleTouchMove(e: TouchEvent): void {
    if (workspaces.length <= 1 || disabled) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // Lock direction after some movement
    if (!directionLocked && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      directionLocked = true;
      isVerticalScroll = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    }

    if (!directionLocked || isVerticalScroll) return;

    // We're swiping horizontally — touch-action: pan-y on the viewport
    // tells the browser to handle vertical scroll natively, so we don't
    // need preventDefault here.
    isSwiping = true;

    // Apply rubber-band resistance at edges (when no prev/next)
    let adjustedDelta = deltaX;
    if ((!prevWorkspace && deltaX > 0) || (!nextWorkspace && deltaX < 0)) {
      adjustedDelta = deltaX * 0.3; // rubber band
    }

    spring.snap(restOffset + adjustedDelta);
  }

  function handleTouchEnd(): void {
    if (!isSwiping) {
      isSwiping = false;
      return;
    }
    isSwiping = false;

    const currentOffset = spring.value;
    const displacement = currentOffset - restOffset;
    const threshold = viewportWidth * 0.25;

    if (displacement > threshold && prevWorkspace) {
      // Swiped right enough -> go to previous workspace
      spring.set(restOffset + viewportWidth);
      // After animation settles, switch workspace
      waitForSettle(() => onWorkspaceChange(prevWorkspace.id));
    } else if (displacement < -threshold && nextWorkspace) {
      // Swiped left enough -> go to next workspace
      spring.set(restOffset - viewportWidth);
      waitForSettle(() => onWorkspaceChange(nextWorkspace.id));
    } else {
      // Snap back
      spring.set(restOffset);
    }
  }

  function handleTouchCancel(): void {
    if (isSwiping) {
      isSwiping = false;
      spring.set(restOffset);
    }
  }

  function waitForSettle(callback: () => void): void {
    const check = (): void => {
      if (!spring.animating) {
        callback();
      } else {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }

  onMount(() => {
    if (viewportEl) {
      viewportWidth = viewportEl.clientWidth;
      viewportHeight = viewportEl.clientHeight;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          viewportWidth = entry.contentRect.width;
          viewportHeight = entry.contentRect.height;
        }
      });
      observer.observe(viewportEl);

      return () => {
        observer.disconnect();
        spring.destroy();
      };
    }
    return () => spring.destroy();
  });
</script>

<div
  class="swipe-viewport"
  bind:this={viewportEl}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchCancel}
>
  <div
    class="swipe-track"
    style:transform={trackTransform}
    style:will-change={isSwiping || spring.animating ? 'transform' : 'auto'}
  >
    {#each pages as p (p.key)}
      <div
        class="swipe-page"
        style:width="{viewportWidth}px"
        style:height="{viewportHeight}px"
      >
        {@render page(p.workspace.id)}
      </div>
    {/each}
  </div>
</div>

<style>
  .swipe-viewport {
    overflow: hidden;
    flex: 1;
    min-height: 0;
    touch-action: pan-y pinch-zoom;
  }

  .swipe-track {
    display: flex;
  }

  .swipe-page {
    flex-shrink: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
</style>
