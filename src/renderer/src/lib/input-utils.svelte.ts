/**
 * Utility functions for shared input components
 */

import { getNote } from './automerge';

/**
 * Calculate viewport-aware dropdown position
 * Returns position that avoids overflowing viewport edges
 */
export function calculateDropdownPosition(
  triggerRect: DOMRect,
  dropdownSize: { width: number; height: number },
  options?: {
    preferDirection?: 'below' | 'above' | 'right' | 'left';
    margin?: number;
    anchorTo?: 'left' | 'right';
  }
): { top: number; left: number } {
  const margin = options?.margin ?? 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = 0;
  let left = 0;

  // Default: position below trigger
  const preferBelow = options?.preferDirection !== 'above';

  // Calculate horizontal position
  if (options?.anchorTo === 'right') {
    // Anchor to right edge of trigger
    left = triggerRect.right - dropdownSize.width;
  } else {
    // Anchor to left edge of trigger (default)
    left = triggerRect.left;
  }

  // Check horizontal overflow
  if (left + dropdownSize.width > viewportWidth - margin) {
    left = Math.max(margin, triggerRect.right - dropdownSize.width);
  }
  if (left < margin) {
    left = margin;
  }

  // Calculate vertical position
  if (preferBelow) {
    top = triggerRect.bottom + 4;
    if (top + dropdownSize.height > viewportHeight - margin) {
      // Would overflow bottom, position above
      top = Math.max(margin, triggerRect.top - dropdownSize.height - 4);
    }
  } else {
    top = triggerRect.top - dropdownSize.height - 4;
    if (top < margin) {
      // Would overflow top, position below
      top = triggerRect.bottom + 4;
    }
  }

  return { top, left };
}

/**
 * Calculate dropdown position for a picker next to a list dropdown
 * Tries to position to the side, falling back to below
 */
export function calculateSidePickerPosition(
  containerRect: DOMRect,
  pickerSize: { width: number; height: number },
  options?: { margin?: number }
): { top: number; left: number } {
  const margin = options?.margin ?? 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = containerRect.top;
  let left = 0;

  // Try to position to the right first
  if (containerRect.right + pickerSize.width + 4 <= viewportWidth - margin) {
    left = containerRect.right + 4;
  } else if (containerRect.left - pickerSize.width - 4 >= margin) {
    // Position to the left if right doesn't fit
    left = containerRect.left - pickerSize.width - 4;
  } else {
    // Fall back to below
    left = Math.max(
      margin,
      Math.min(containerRect.left, viewportWidth - pickerSize.width - margin)
    );
    top = containerRect.bottom + 4;
  }

  // Check vertical overflow
  if (top + pickerSize.height > viewportHeight - margin) {
    top = Math.max(margin, viewportHeight - pickerSize.height - margin);
  }

  return { top, left };
}

/**
 * Get note title by ID, falling back to ID if note not found
 */
export function getNoteTitleById(noteId: string): string {
  const note = getNote(noteId);
  return note?.title || noteId;
}

/**
 * Format relative time from ISO date string
 */
export function formatRelativeTime(dateString: string): string {
  if (!dateString) return '—';
  try {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive date parsing
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive date comparison
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins <= 1) return 'just now';
        return `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}w ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}mo ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: '2-digit'
      });
    }
  } catch {
    return dateString;
  }
}
