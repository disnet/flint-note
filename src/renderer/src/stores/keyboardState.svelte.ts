/**
 * Keyboard visibility state detection using VisualViewport API.
 * Tracks when the virtual keyboard is visible on mobile devices.
 */

interface KeyboardState {
  isVisible: boolean;
  height: number;
}

class KeyboardStateStore {
  private state = $state<KeyboardState>({ isVisible: false, height: 0 });
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleResize);
      window.visualViewport.addEventListener('scroll', this.handleResize);
      // Initial check
      this.handleResize();
    }
  }

  private handleResize = (): void => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Keyboard is visible when visual viewport is significantly smaller than window
    // Use a threshold to avoid false positives from address bar changes
    const keyboardHeight = window.innerHeight - viewport.height;
    const isVisible = keyboardHeight > 100;

    this.state.isVisible = isVisible;
    this.state.height = Math.max(0, keyboardHeight);

    // Update CSS custom property for positioning
    document.documentElement.style.setProperty(
      '--keyboard-height',
      `${this.state.height}px`
    );
  };

  get isVisible(): boolean {
    return this.state.isVisible;
  }

  get height(): number {
    return this.state.height;
  }

  cleanup(): void {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleResize);
      window.visualViewport.removeEventListener('scroll', this.handleResize);
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
