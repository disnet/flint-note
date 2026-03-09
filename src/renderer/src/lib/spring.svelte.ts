/**
 * Simple damped spring animation utility using requestAnimationFrame.
 * Returns a reactive $state value that animates toward a target.
 */

interface SpringConfig {
  /** Spring stiffness (0-1, default 0.15) */
  stiffness?: number;
  /** Damping ratio (0-1, default 0.75) */
  damping?: number;
  /** Settle threshold in px (default 0.5) */
  precision?: number;
}

interface Spring {
  /** Current animated value (reactive) */
  readonly value: number;
  /** Current target value */
  readonly target: number;
  /** Whether the spring is currently animating */
  readonly animating: boolean;
  /** Animate to a new target with spring physics */
  set: (target: number) => void;
  /** Instantly jump to a value without animation */
  snap: (value: number) => void;
  /** Stop animation and clean up */
  destroy: () => void;
}

const DEFAULT_CONFIG: Required<SpringConfig> = {
  stiffness: 0.15,
  damping: 0.75,
  precision: 0.5
};

export function createSpring(initialValue: number, config?: SpringConfig): Spring {
  const opts = { ...DEFAULT_CONFIG, ...config };

  let currentValue = $state(initialValue);
  let currentTarget = $state(initialValue);
  let velocity = 0;
  let rafId: number | null = null;
  let isAnimating = $state(false);

  function step(): void {
    const force = (currentTarget - currentValue) * opts.stiffness;
    velocity = (velocity + force) * opts.damping;
    currentValue += velocity;

    // Check if settled
    if (
      Math.abs(currentTarget - currentValue) < opts.precision &&
      Math.abs(velocity) < opts.precision
    ) {
      currentValue = currentTarget;
      velocity = 0;
      isAnimating = false;
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(step);
  }

  function startAnimation(): void {
    if (rafId !== null) return;
    isAnimating = true;
    rafId = requestAnimationFrame(step);
  }

  function stopAnimation(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isAnimating = false;
    velocity = 0;
  }

  return {
    get value() {
      return currentValue;
    },
    get target() {
      return currentTarget;
    },
    get animating() {
      return isAnimating;
    },
    set(target: number) {
      currentTarget = target;
      startAnimation();
    },
    snap(value: number) {
      stopAnimation();
      currentValue = value;
      currentTarget = value;
      velocity = 0;
    },
    destroy() {
      stopAnimation();
    }
  };
}
