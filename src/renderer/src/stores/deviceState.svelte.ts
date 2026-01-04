/**
 * Device state detection for responsive mobile/tablet/desktop layouts.
 * Uses matchMedia for reactive viewport detection.
 */

// Breakpoint constants
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

interface DeviceState {
  isMobile: boolean; // < 768px
  isTablet: boolean; // 768px - 1024px
  isDesktop: boolean; // > 1024px
  isTouchDevice: boolean; // Has touch capability
  isPortrait: boolean; // Portrait orientation
}

class DeviceStateStore {
  private state = $state<DeviceState>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
    isPortrait: false
  });

  private mobileQuery: MediaQueryList | null = null;
  private tabletQuery: MediaQueryList | null = null;
  private portraitQuery: MediaQueryList | null = null;
  private initialized = false;

  constructor() {
    // Initialize in browser environment only
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Detect touch capability
    this.state.isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - msMaxTouchPoints is IE/Edge specific
      navigator.msMaxTouchPoints > 0;

    // Set up media queries
    this.mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    this.tabletQuery = window.matchMedia(
      `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`
    );
    this.portraitQuery = window.matchMedia('(orientation: portrait)');

    // Initial state
    this.updateBreakpoints();
    this.state.isPortrait = this.portraitQuery.matches;

    // Add listeners
    this.mobileQuery.addEventListener('change', this.handleBreakpointChange);
    this.tabletQuery.addEventListener('change', this.handleBreakpointChange);
    this.portraitQuery.addEventListener('change', this.handleOrientationChange);
  }

  private handleBreakpointChange = (): void => {
    this.updateBreakpoints();
  };

  private handleOrientationChange = (e: MediaQueryListEvent): void => {
    this.state.isPortrait = e.matches;
  };

  private updateBreakpoints(): void {
    const isMobile = this.mobileQuery?.matches ?? false;
    const isTablet = this.tabletQuery?.matches ?? false;

    this.state.isMobile = isMobile;
    this.state.isTablet = isTablet;
    this.state.isDesktop = !isMobile && !isTablet;
  }

  // Getters for reactive access
  get isMobile(): boolean {
    return this.state.isMobile;
  }

  get isTablet(): boolean {
    return this.state.isTablet;
  }

  get isDesktop(): boolean {
    return this.state.isDesktop;
  }

  get isTouchDevice(): boolean {
    return this.state.isTouchDevice;
  }

  get isPortrait(): boolean {
    return this.state.isPortrait;
  }

  /**
   * Returns true if we should use mobile layout (phone-sized screens)
   */
  get useMobileLayout(): boolean {
    return this.state.isMobile;
  }

  /**
   * Returns true if we should use touch-optimized interactions
   * (mobile or tablet with touch capability)
   */
  get useTouchInteractions(): boolean {
    return (this.state.isMobile || this.state.isTablet) && this.state.isTouchDevice;
  }

  /**
   * Clean up event listeners (call when app unmounts)
   */
  cleanup(): void {
    this.mobileQuery?.removeEventListener('change', this.handleBreakpointChange);
    this.tabletQuery?.removeEventListener('change', this.handleBreakpointChange);
    this.portraitQuery?.removeEventListener('change', this.handleOrientationChange);
  }
}

export const deviceState = new DeviceStateStore();

// Convenience functions for use in components
export function isMobile(): boolean {
  return deviceState.isMobile;
}

export function isTablet(): boolean {
  return deviceState.isTablet;
}

export function isDesktop(): boolean {
  return deviceState.isDesktop;
}

export function isTouchDevice(): boolean {
  return deviceState.isTouchDevice;
}

export function useMobileLayout(): boolean {
  return deviceState.useMobileLayout;
}

export function useTouchInteractions(): boolean {
  return deviceState.useTouchInteractions;
}
