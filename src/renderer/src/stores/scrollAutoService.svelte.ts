import { EditorView } from 'codemirror';

interface AutoScrollConfig {
  enabled: boolean;
  topMargin: number;
  bottomMargin: number;
  smoothScroll: boolean;
  debounceMs: number;
  variant: 'default' | 'daily-note' | 'shelf-note';
}

const autoScrollConfigs: Record<string, AutoScrollConfig> = {
  default: {
    enabled: true,
    bottomMargin: 150,
    topMargin: 75,
    smoothScroll: false,
    debounceMs: 50,
    variant: 'default'
  },
  'daily-note': {
    enabled: true,
    bottomMargin: 100,
    topMargin: 50,
    smoothScroll: true,
    debounceMs: 30,
    variant: 'daily-note'
  },
  'shelf-note': {
    enabled: true,
    bottomMargin: 80,
    topMargin: 40,
    smoothScroll: true,
    debounceMs: 30,
    variant: 'shelf-note'
  }
};

export class ScrollAutoService {
  private scrollContainer: HTMLElement | null = null;
  private editorView: EditorView | null = null;
  private config: AutoScrollConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(variant: 'default' | 'daily-note' | 'shelf-note' = 'default') {
    this.config = { ...autoScrollConfigs[variant] };
  }

  setupAutoScroll(editorView: EditorView, scrollContainer: HTMLElement): void {
    this.editorView = editorView;
    this.scrollContainer = scrollContainer;
    this.attachCursorListener();
  }

  private attachCursorListener(): void {
    if (!this.editorView || !this.config.enabled) return;

    // Remove existing listener if any
    this.detachCursorListener();

    // Add the update listener to the editor view
    this.editorView.dom.addEventListener('focus', () => {
      this.debouncedCheckAndScroll();
    });

    // Use a more reliable approach by checking selection changes periodically when focused
    this.startSelectionMonitoring();
  }

  private detachCursorListener(): void {
    this.stopSelectionMonitoring();
  }

  private selectionMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastSelectionRange: { from: number; to: number } | null = null;

  private startSelectionMonitoring(): void {
    this.stopSelectionMonitoring();

    this.selectionMonitorInterval = setInterval(() => {
      if (!this.editorView || !this.editorView.hasFocus || !this.config.enabled) return;

      const selection = this.editorView.state.selection.main;
      const currentRange = { from: selection.from, to: selection.to };

      if (
        !this.lastSelectionRange ||
        this.lastSelectionRange.from !== currentRange.from ||
        this.lastSelectionRange.to !== currentRange.to
      ) {
        this.lastSelectionRange = currentRange;
        this.debouncedCheckAndScroll();
      }
    }, 100); // Check every 100ms when focused
  }

  private stopSelectionMonitoring(): void {
    if (this.selectionMonitorInterval) {
      clearInterval(this.selectionMonitorInterval);
      this.selectionMonitorInterval = null;
    }
    this.lastSelectionRange = null;
  }

  private debouncedCheckAndScroll(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.checkAndScroll();
      this.debounceTimer = null;
    }, this.config.debounceMs);
  }

  private checkAndScroll(): void {
    if (!this.editorView || !this.scrollContainer || !this.config.enabled) return;

    // Only auto-scroll if editor has focus
    if (!this.editorView.hasFocus) return;

    try {
      // Get cursor position in document
      const cursorPos = this.editorView.state.selection.main.head;
      const cursorCoords = this.editorView.coordsAtPos(cursorPos);

      if (!cursorCoords) return;

      // Calculate scroll target
      const scrollTarget = this.calculateScrollTarget(cursorCoords);

      // Perform smooth scroll if needed
      if (scrollTarget !== null) {
        this.smoothScrollTo(scrollTarget);
      }
    } catch (error) {
      // Silently handle errors (e.g., cursor position out of bounds)
      console.debug('Auto-scroll calculation error:', error);
    }
  }

  private calculateScrollTarget(cursorCoords: {
    top: number;
    bottom: number;
  }): number | null {
    if (!this.scrollContainer) return null;

    const containerRect = this.scrollContainer.getBoundingClientRect();
    const relativeTop = cursorCoords.top - containerRect.top;
    const relativeBottom = cursorCoords.bottom - containerRect.top;

    // Check if cursor is in top margin zone
    if (relativeTop < this.config.topMargin) {
      return Math.max(
        0,
        this.scrollContainer.scrollTop - (this.config.topMargin - relativeTop)
      );
    }

    // Check if cursor is in bottom margin zone
    const bottomThreshold = containerRect.height - this.config.bottomMargin;
    if (relativeBottom > bottomThreshold) {
      return this.scrollContainer.scrollTop + (relativeBottom - bottomThreshold);
    }

    return null; // No scroll needed
  }

  private smoothScrollTo(targetY: number): void {
    if (!this.scrollContainer) return;

    if (this.config.smoothScroll) {
      this.scrollContainer.scrollTo({
        top: targetY,
        behavior: 'smooth'
      });
    } else {
      this.scrollContainer.scrollTop = targetY;
    }
  }

  updateConfig(config: Partial<AutoScrollConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled) {
      this.attachCursorListener();
    } else {
      this.detachCursorListener();
    }
  }

  destroy(): void {
    this.detachCursorListener();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.scrollContainer = null;
    this.editorView = null;
  }

  private findScrollContainer(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflowY === 'auto') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  // Alternative setup method that automatically finds the scroll container
  setupAutoScrollWithSearch(editorView: EditorView): boolean {
    const scrollContainer = this.findScrollContainer(editorView.dom as HTMLElement);
    if (scrollContainer) {
      this.setupAutoScroll(editorView, scrollContainer);
      return true;
    }
    return false;
  }
}
