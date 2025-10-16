<script lang="ts">
  interface Props {
    side: 'left' | 'right';
    onResize: (width: number) => void;
    minWidth?: number;
    maxWidth?: number;
  }

  let { side, onResize, minWidth = 200, maxWidth = 800 }: Props = $props();

  let isResizing = $state(false);
  let isHovering = $state(false);
  let startX = $state(0);
  let startWidth = $state(0);

  function handleMouseDown(e: MouseEvent): void {
    isResizing = true;
    startX = e.clientX;

    // Get the sidebar element (parent's parent: handle -> sidebar-inner -> sidebar)
    const handleElement = e.currentTarget as HTMLElement;
    const sidebarElement = handleElement.closest(
      '.left-sidebar, .right-sidebar'
    ) as HTMLElement;
    if (sidebarElement) {
      startWidth = sidebarElement.offsetWidth;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';

    // Prevent text selection during resize
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!isResizing) return;

    const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));

    onResize(newWidth);
  }

  function handleMouseUp(): void {
    isResizing = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function handleMouseEnter(): void {
    isHovering = true;
  }

  function handleMouseLeave(): void {
    if (!isResizing) {
      isHovering = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="resize-handle"
  class:left={side === 'left'}
  class:right={side === 'right'}
  class:visible={isHovering || isResizing}
  class:resizing={isResizing}
  onmousedown={handleMouseDown}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="separator"
  aria-orientation="vertical"
  aria-label="Resize sidebar"
  tabindex="0"
  onkeydown={(e) => {
    // Allow keyboard navigation
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
    }
  }}
></div>

<style>
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    cursor: col-resize;
    user-select: none;
    z-index: 100;
    background-color: transparent;
  }

  .resize-handle.left {
    right: 0;
  }

  .resize-handle.right {
    left: 0;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    background-color: #3b82f6;
    transition:
      width 0.15s ease,
      background-color 0.15s ease;
  }

  .resize-handle.left::before {
    right: 0;
  }

  .resize-handle.right::before {
    left: 0;
  }

  .resize-handle.visible::before {
    width: 2px;
  }

  .resize-handle.resizing::before {
    width: 4px;
  }
</style>
