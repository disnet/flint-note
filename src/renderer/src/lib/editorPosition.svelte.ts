/**
 * Editor position persistence using localStorage
 *
 * Stores scroll and cursor position for notes so users return to the same
 * position when switching back to a note or restarting the app.
 */

import type { EditorView } from '@codemirror/view';

// --- Types ---

interface EditorPosition {
  cursorPosition: number;
  scrollTop: number;
  timestamp: number;
}

// --- Constants ---

const STORAGE_PREFIX = 'flint:editor-position:';
const DEBOUNCE_MS = 1000;

// --- Storage Functions ---

function getStorageKey(noteId: string): string {
  return `${STORAGE_PREFIX}${noteId}`;
}

/**
 * Save editor position to localStorage
 */
export function saveEditorPosition(
  noteId: string,
  position: { cursorPosition: number; scrollTop: number }
): void {
  try {
    const data: EditorPosition = {
      ...position,
      timestamp: Date.now()
    };
    localStorage.setItem(getStorageKey(noteId), JSON.stringify(data));
  } catch {
    // localStorage may be unavailable or full - gracefully ignore
  }
}

/**
 * Get saved editor position from localStorage
 */
export function getEditorPosition(noteId: string): EditorPosition | null {
  try {
    const raw = localStorage.getItem(getStorageKey(noteId));
    if (!raw) return null;
    return JSON.parse(raw) as EditorPosition;
  } catch {
    return null;
  }
}

/**
 * Clear saved position for a note
 */
export function clearEditorPosition(noteId: string): void {
  try {
    localStorage.removeItem(getStorageKey(noteId));
  } catch {
    // Ignore errors
  }
}

/**
 * Clean up positions older than maxAgeDays
 * Call this periodically to prevent localStorage bloat from deleted notes
 */
export function cleanupOldPositions(maxAgeDays: number): void {
  try {
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const data = JSON.parse(raw) as EditorPosition;
        if (now - data.timestamp > maxAge) {
          localStorage.removeItem(key);
        }
      } catch {
        // Invalid data, remove it
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore errors
  }
}

// --- Position Tracker ---

export interface PositionTracker {
  savePosition: () => void;
  restorePosition: (onComplete?: () => void) => void;
  attachScrollListener: () => void;
  cleanup: () => void;
}

/**
 * Check if a note has a saved scroll position > 0
 * Used to pre-hide the scroll container before content loads
 */
export function hasSavedScrollPosition(noteId: string): boolean {
  const saved = getEditorPosition(noteId);
  return saved !== null && saved.scrollTop > 0;
}

/**
 * Find the scrollable parent element (the one with overflow-y: auto or scroll)
 */
function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Creates a position tracker for a CodeMirror editor.
 * Handles debounced saving and restoration of scroll/cursor position.
 */
export function createPositionTracker(
  noteId: string,
  getEditorView: () => EditorView | null
): PositionTracker {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedCursor: number | null = null;
  let lastSavedScroll: number | null = null;
  let scrollListener: (() => void) | null = null;
  let scrollContainer: HTMLElement | null = null;

  /**
   * Get or find the scroll container
   */
  function getScrollContainer(): HTMLElement | null {
    if (scrollContainer) return scrollContainer;
    const view = getEditorView();
    if (!view) return null;
    scrollContainer = findScrollParent(view.dom);
    return scrollContainer;
  }

  /**
   * Save current position with debouncing
   */
  function savePosition(): void {
    const view = getEditorView();
    const container = getScrollContainer();
    if (!view || !container) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const v = getEditorView();
      const c = getScrollContainer();
      if (!v || !c) return;

      const cursorPosition = v.state.selection.main.anchor;
      const scrollTop = Math.round(c.scrollTop);

      // Only save if position actually changed
      if (cursorPosition !== lastSavedCursor || scrollTop !== lastSavedScroll) {
        saveEditorPosition(noteId, { cursorPosition, scrollTop });
        lastSavedCursor = cursorPosition;
        lastSavedScroll = scrollTop;
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Restore saved position to the editor
   */
  function restorePosition(onComplete?: () => void): void {
    const view = getEditorView();
    const container = getScrollContainer();
    if (!view || !container) {
      onComplete?.();
      return;
    }

    const saved = getEditorPosition(noteId);
    if (!saved) {
      // No saved position, just reveal container and complete
      container.style.visibility = '';
      onComplete?.();
      return;
    }

    // Restore cursor position (with bounds checking)
    if (saved.cursorPosition !== undefined) {
      const docLength = view.state.doc.length;
      const safePosition = Math.min(saved.cursorPosition, docLength);

      view.dispatch({
        selection: { anchor: safePosition },
        scrollIntoView: false // Don't auto-scroll, we'll set scroll manually
      });
      lastSavedCursor = safePosition;
    }

    // Restore scroll position with retry logic
    // Content may still be loading, so we try multiple times
    if (saved.scrollTop !== undefined && saved.scrollTop > 0) {
      const targetScroll = saved.scrollTop;
      let attempts = 0;
      const maxAttempts = 5;

      const tryRestore = (): void => {
        const c = getScrollContainer();
        if (!c) {
          onComplete?.();
          return;
        }

        c.scrollTop = targetScroll;
        lastSavedScroll = targetScroll;

        attempts++;
        const actualScroll = c.scrollTop;

        if (actualScroll < targetScroll && attempts < maxAttempts) {
          requestAnimationFrame(tryRestore);
        } else {
          // Scroll restored (or max attempts reached), reveal container
          c.style.visibility = '';
          onComplete?.();
        }
      };

      requestAnimationFrame(tryRestore);
    } else {
      // No scroll to restore, just reveal and complete
      container.style.visibility = '';
      onComplete?.();
    }
  }

  /**
   * Attach scroll listener to the scroll container
   */
  function attachScrollListener(): void {
    const container = getScrollContainer();
    if (!container) return;

    scrollListener = () => savePosition();
    container.addEventListener('scroll', scrollListener);
  }

  /**
   * Cleanup - save final position and clear timer
   */
  function cleanup(): void {
    // Clear debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Remove scroll listener
    const container = getScrollContainer();
    if (container && scrollListener) {
      container.removeEventListener('scroll', scrollListener);
      scrollListener = null;
    }

    // Save current position immediately on cleanup
    const view = getEditorView();
    if (view && container) {
      const cursorPosition = view.state.selection.main.anchor;
      const scrollTop = Math.round(container.scrollTop);
      if (cursorPosition !== lastSavedCursor || scrollTop !== lastSavedScroll) {
        saveEditorPosition(noteId, { cursorPosition, scrollTop });
      }
    }

    // Clear cached scroll container
    scrollContainer = null;
  }

  return {
    savePosition,
    restorePosition,
    attachScrollListener,
    cleanup
  };
}
