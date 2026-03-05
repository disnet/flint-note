/**
 * Keyboard visibility state detection using VisualViewport API.
 * Tracks when the virtual keyboard is visible on mobile devices.
 */

interface KeyboardState {
  isVisible: boolean;
  height: number;
  /** The top position for UI anchored to the bottom of the visual viewport */
  visualBottom: number;
}

class KeyboardStateStore {
  private state = $state<KeyboardState>({ isVisible: false, height: 0, visualBottom: 0 });
  private initialized = false;
  private rafId: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (window.visualViewport) {
      // Use resize to detect keyboard show/hide and height changes
      window.visualViewport.addEventListener('resize', this.handleViewportChange);
      // Use scroll to track visual viewport offset (for positioning during scroll)
      window.visualViewport.addEventListener('scroll', this.handleViewportChange);
      // Initial check
      this.handleViewportChange();
    }
  }

  private handleViewportChange = (): void => {
    // Batch updates with rAF to avoid layout thrashing during scroll
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.updateState();
    });
  };

  private updateState(): void {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Keyboard is visible when visual viewport is significantly smaller than window
    // Use a threshold to avoid false positives from address bar changes
    const keyboardHeight = window.innerHeight - viewport.height;
    const isVisible = keyboardHeight > 100;

    this.state.isVisible = isVisible;
    this.state.height = Math.max(0, keyboardHeight);

    // Calculate the bottom of the visual viewport in layout viewport coordinates.
    // This is where UI should be positioned to sit at the bottom of the visible area.
    // On iOS, position:fixed is relative to the layout viewport, so we need offsetTop
    // to account for the visual viewport scrolling independently when the keyboard is open.
    this.state.visualBottom = viewport.offsetTop + viewport.height;

    // Update CSS custom property for positioning
    document.documentElement.style.setProperty(
      '--keyboard-height',
      `${this.state.height}px`
    );
  }

  get isVisible(): boolean {
    return this.state.isVisible;
  }

  get height(): number {
    return this.state.height;
  }

  /** The bottom edge of the visual viewport in layout viewport coordinates */
  get visualBottom(): number {
    return this.state.visualBottom;
  }

  cleanup(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleViewportChange);
      window.visualViewport.removeEventListener('scroll', this.handleViewportChange);
    }
  }
}

export const keyboardState = new KeyboardStateStore();

// Convenience functions
export function isKeyboardVisible(): boolean {
  return keyboardState.isVisible;
}

export function getKeyboardHeight(): number {
  return keyboardState.height;
}
