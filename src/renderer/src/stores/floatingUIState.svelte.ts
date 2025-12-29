/**
 * Shared state for floating UI elements (FAB, control bars)
 * Manages visibility based on mouse activity with a shared timeout.
 */

const HIDE_DELAY = 2500; // Hide after 2.5s of inactivity

let visible = $state(true);
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let isMouseOverFloatingUI = $state(false);
let initialized = false;

function startHideTimer(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  hideTimeout = setTimeout(() => {
    if (!isMouseOverFloatingUI) {
      visible = false;
    }
  }, HIDE_DELAY);
}

function handleMouseMove(): void {
  visible = true;
  startHideTimer();
}

function init(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('mousemove', handleMouseMove);
  startHideTimer();
}

function cleanup(): void {
  if (!initialized) return;
  initialized = false;
  window.removeEventListener('mousemove', handleMouseMove);
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

export const floatingUIState = {
  get visible() {
    return visible;
  },

  /** Call when mouse enters a floating UI element */
  onMouseEnter(): void {
    isMouseOverFloatingUI = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    visible = true;
  },

  /** Call when mouse leaves a floating UI element */
  onMouseLeave(): void {
    isMouseOverFloatingUI = false;
    startHideTimer();
  },

  /** Call to show the floating UI (e.g., from iframe mouse activity) */
  show(): void {
    visible = true;
    startHideTimer();
  },

  init,
  cleanup
};
