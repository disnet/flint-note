<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createSwipeHandler } from '../lib/gestures.svelte';
  import { onMount } from 'svelte';

  interface Props {
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    drawerContent: Snippet;
    children: Snippet;
  }

  let { isOpen, onToggle, onClose, drawerContent, children }: Props = $props();

  let containerRef: HTMLElement | null = $state(null);
  let drawerRef: HTMLElement | null = $state(null);
  let dragProgress = $state(0);
  let isDragging = $state(false);

  // Handle body scroll lock
  $effect(() => {
    if (isOpen) {
      document.body.classList.add('mobile-drawer-open');
    } else {
      document.body.classList.remove('mobile-drawer-open');
    }
  });

  // Set up edge swipe gesture on main content
  onMount(() => {
    if (!containerRef) return;

    // Edge swipe to open drawer
    const cleanupOpen = createSwipeHandler(
      containerRef,
      {
        onSwipeStart: () => {
          if (!isOpen) {
            isDragging = true;
          }
        },
        onSwipeMove: (deltaX, _deltaY, progress) => {
          if (!isOpen && isDragging && deltaX > 0) {
            dragProgress = progress;
          }
        },
        onSwipeEnd: (direction) => {
          isDragging = false;
          if (!isOpen && direction === 'right') {
            dragProgress = 0;
            onToggle();
          } else {
            dragProgress = 0;
          }
        },
        onSwipeCancel: () => {
          isDragging = false;
          dragProgress = 0;
        }
      },
      {
        direction: 'horizontal',
        edgeThreshold: 20,
        edge: 'left',
        threshold: 50,
        maxDistance: 300
      }
    );

    return () => {
      cleanupOpen();
    };
  });

  // Set up swipe to close when drawer is open
  $effect(() => {
    if (!drawerRef || !isOpen) return;

    const cleanupClose = createSwipeHandler(
      drawerRef,
      {
        onSwipeStart: () => {
          isDragging = true;
        },
        onSwipeMove: (deltaX, _deltaY, progress) => {
          if (isOpen && isDragging && deltaX < 0) {
            dragProgress = 1 - progress;
          }
        },
        onSwipeEnd: (direction) => {
          isDragging = false;
          if (direction === 'left') {
            dragProgress = 0;
            onClose();
          } else {
            dragProgress = 0;
          }
        },
        onSwipeCancel: () => {
          isDragging = false;
          dragProgress = 0;
        }
      },
      {
        direction: 'horizontal',
        threshold: 50,
        maxDistance: 300
      }
    );

    return () => {
      cleanupClose();
    };
  });

  // Calculate transform based on state and drag
  const drawerTransform = $derived.by(() => {
    if (isDragging) {
      // During drag, show progress
      const translateX = isOpen
        ? (1 - dragProgress) * -100 // Closing: 0% to -100%
        : (1 - dragProgress) * -100; // Opening: -100% to 0%
      return `translateX(${translateX}%)`;
    }
    return isOpen ? 'translateX(0)' : 'translateX(-100%)';
  });

  const backdropOpacity = $derived.by(() => {
    if (isDragging) {
      return isOpen ? dragProgress * 0.5 : dragProgress * 0.5;
    }
    return isOpen ? 0.5 : 0;
  });

  function handleBackdropClick(): void {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mobile-drawer-container" bind:this={containerRef}>
  <!-- Drawer panel -->
  <div
    class="drawer-panel"
    class:open={isOpen}
    class:dragging={isDragging}
    style:transform={drawerTransform}
    bind:this={drawerRef}
    role="dialog"
    aria-modal="true"
    aria-label="Navigation drawer"
  >
    {@render drawerContent()}
  </div>

  <!-- Backdrop -->
  {#if isOpen || isDragging}
    <button
      class="drawer-backdrop"
      class:visible={isOpen || dragProgress > 0}
      style:opacity={backdropOpacity}
      onclick={handleBackdropClick}
      aria-label="Close drawer"
      tabindex={isOpen ? 0 : -1}
    ></button>
  {/if}

  <!-- Main content -->
  <main class="drawer-main-content">
    {@render children()}
  </main>
</div>

<style>
  .mobile-drawer-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .drawer-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: var(--mobile-drawer-width);
    height: 100%;
    background: var(--bg-primary);
    z-index: 1001;
    transform: translateX(-100%);
    transition: transform var(--mobile-drawer-transition);
    will-change: transform;
    box-shadow: 2px 0 8px var(--shadow-medium);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .drawer-panel.dragging {
    transition: none;
  }

  .drawer-panel.open {
    transform: translateX(0);
  }

  .drawer-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    opacity: 0;
    transition: opacity var(--mobile-drawer-transition);
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .drawer-backdrop.visible {
    opacity: 0.5;
  }

  .drawer-main-content {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
