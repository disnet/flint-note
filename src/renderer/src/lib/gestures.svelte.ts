/**
 * Touch gesture utilities for swipe detection.
 * Lightweight implementation without external dependencies.
 */

export interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  isActive: boolean;
}

export interface SwipeCallbacks {
  onSwipeStart?: () => void;
  onSwipeMove?: (deltaX: number, deltaY: number, progress: number) => void;
  onSwipeEnd?: (
    direction: 'left' | 'right' | 'up' | 'down' | null,
    velocity: number
  ) => void;
  onSwipeCancel?: () => void;
}

export interface SwipeOptions {
  /** Minimum distance in px to trigger swipe (default: 50) */
  threshold?: number;
  /** Minimum velocity in px/ms to trigger swipe (default: 0.3) */
  velocityThreshold?: number;
  /** Direction constraint (default: 'horizontal') */
  direction?: 'horizontal' | 'vertical' | 'both';
  /** Only start swipe if touch begins within this many px from edge (0 = anywhere) */
  edgeThreshold?: number;
  /** Which edge to detect (only used if edgeThreshold > 0) */
  edge?: 'left' | 'right' | 'top' | 'bottom';
  /** Maximum distance for progress calculation (default: 300) */
  maxDistance?: number;
}

const DEFAULT_OPTIONS: Required<SwipeOptions> = {
  threshold: 50,
  velocityThreshold: 0.3,
  direction: 'horizontal',
  edgeThreshold: 0,
  edge: 'left',
  maxDistance: 300
};

/**
 * Creates a swipe gesture handler for an element.
 * Returns a cleanup function to remove event listeners.
 */
export function createSwipeHandler(
  element: HTMLElement,
  callbacks: SwipeCallbacks,
  options: SwipeOptions = {}
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let state: SwipeState = {
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    isActive: false
  };

  function handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];

    // Check edge threshold if specified
    if (opts.edgeThreshold > 0) {
      const rect = element.getBoundingClientRect();
      let inEdge = false;

      switch (opts.edge) {
        case 'left':
          inEdge = touch.clientX - rect.left <= opts.edgeThreshold;
          break;
        case 'right':
          inEdge = rect.right - touch.clientX <= opts.edgeThreshold;
          break;
        case 'top':
          inEdge = touch.clientY - rect.top <= opts.edgeThreshold;
          break;
        case 'bottom':
          inEdge = rect.bottom - touch.clientY <= opts.edgeThreshold;
          break;
      }

      if (!inEdge) return;
    }

    state = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startTime: Date.now(),
      isActive: true
    };

    callbacks.onSwipeStart?.();
  }

  function handleTouchMove(e: TouchEvent): void {
    if (!state.isActive) return;

    const touch = e.touches[0];
    state.currentX = touch.clientX;
    state.currentY = touch.clientY;

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;

    // Check if swiping in the wrong direction (should scroll instead)
    if (opts.direction === 'horizontal' && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      // User is scrolling vertically, cancel swipe
      state.isActive = false;
      callbacks.onSwipeCancel?.();
      return;
    }

    if (opts.direction === 'vertical' && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      // User is scrolling horizontally, cancel swipe
      state.isActive = false;
      callbacks.onSwipeCancel?.();
      return;
    }

    // Prevent scrolling when swiping
    if (opts.direction === 'horizontal' && Math.abs(deltaX) > 10) {
      e.preventDefault();
    } else if (opts.direction === 'vertical' && Math.abs(deltaY) > 10) {
      e.preventDefault();
    }

    // Calculate progress (0 to 1)
    const distance = opts.direction === 'vertical' ? Math.abs(deltaY) : Math.abs(deltaX);
    const progress = Math.min(distance / opts.maxDistance, 1);

    callbacks.onSwipeMove?.(deltaX, deltaY, progress);
  }

  function handleTouchEnd(): void {
    if (!state.isActive) return;

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const duration = Date.now() - state.startTime;

    // Calculate velocity (px per ms)
    const distance = opts.direction === 'vertical' ? Math.abs(deltaY) : Math.abs(deltaX);
    const velocity = distance / duration;

    // Determine if swipe threshold is met
    const meetsThreshold =
      distance >= opts.threshold || velocity >= opts.velocityThreshold;

    let direction: 'left' | 'right' | 'up' | 'down' | null = null;

    if (meetsThreshold) {
      if (opts.direction === 'horizontal' || opts.direction === 'both') {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        }
      }
      if (opts.direction === 'vertical' || opts.direction === 'both') {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          direction = deltaY > 0 ? 'down' : 'up';
        }
      }
    }

    callbacks.onSwipeEnd?.(direction, velocity);

    state.isActive = false;
  }

  function handleTouchCancel(): void {
    if (state.isActive) {
      state.isActive = false;
      callbacks.onSwipeCancel?.();
    }
  }

  // Add event listeners with passive: false for touchmove to allow preventDefault
  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });
  element.addEventListener('touchcancel', handleTouchCancel, { passive: true });

  // Return cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    element.removeEventListener('touchcancel', handleTouchCancel);
  };
}

/**
 * Svelte action for edge swipe detection.
 * Usage: <div use:edgeSwipe={{ edge: 'left', onSwipe: () => openDrawer() }}>
 */
export function edgeSwipe(
  node: HTMLElement,
  params: {
    edge?: 'left' | 'right';
    edgeThreshold?: number;
    onSwipeStart?: () => void;
    onSwipeMove?: (progress: number) => void;
    onSwipeEnd?: (completed: boolean) => void;
    onSwipeCancel?: () => void;
  }
) {
  const edge = params.edge ?? 'left';
  const edgeThreshold = params.edgeThreshold ?? 20;

  const cleanup = createSwipeHandler(
    node,
    {
      onSwipeStart: params.onSwipeStart,
      onSwipeMove: (deltaX, _deltaY, progress) => {
        // Only call move if swiping in the right direction
        if ((edge === 'left' && deltaX > 0) || (edge === 'right' && deltaX < 0)) {
          params.onSwipeMove?.(progress);
        }
      },
      onSwipeEnd: (direction, _velocity) => {
        const completed =
          (edge === 'left' && direction === 'right') ||
          (edge === 'right' && direction === 'left');
        params.onSwipeEnd?.(completed);
      },
      onSwipeCancel: params.onSwipeCancel
    },
    {
      direction: 'horizontal',
      edgeThreshold,
      edge,
      threshold: 50,
      maxDistance: 300
    }
  );

  return {
    destroy() {
      cleanup();
    },
    update(_newParams: typeof params) {
      // For simplicity, we don't support dynamic updates
      // If needed, destroy and recreate
      console.warn('edgeSwipe action does not support dynamic updates');
    }
  };
}
