/**
 * Shelf state management for Automerge version
 *
 * This is a thin wrapper around the Automerge shelf functions
 * for use by components that need reactive shelf state.
 */

import {
  getShelfItems,
  isItemOnShelf,
  addShelfItem,
  removeShelfItem,
  toggleShelfItemExpanded,
  setShelfItemExpanded,
  clearShelfItems
} from './state.svelte';
import type { ShelfItemData } from './types';

export type ShelfItem = ShelfItemData;

/** ID of the shelf item that should receive focus (cleared after focus) */
let pendingFocusId = $state<string | null>(null);

/**
 * Shelf store that wraps Automerge shelf functions
 * Provides a consistent API for components
 */
class ShelfStore {
  /**
   * Get the ID of item pending focus
   */
  get pendingFocusId(): string | null {
    return pendingFocusId;
  }

  /**
   * Set the ID of item that should receive focus
   */
  setPendingFocus(id: string | null): void {
    pendingFocusId = id;
  }

  /**
   * Get all shelf items (reactive via Automerge)
   */
  get items(): ShelfItem[] {
    return getShelfItems();
  }

  /**
   * Check if an item is on the shelf
   */
  isOnShelf(type: 'note' | 'conversation', id: string): boolean {
    return isItemOnShelf(type, id);
  }

  /**
   * Add an item to the shelf
   */
  addItem(type: 'note' | 'conversation', id: string): void {
    addShelfItem(type, id);
  }

  /**
   * Remove an item from the shelf
   */
  removeItem(type: 'note' | 'conversation', id: string): void {
    removeShelfItem(type, id);
  }

  /**
   * Toggle the expanded state of an item
   */
  toggleExpanded(type: 'note' | 'conversation', id: string): void {
    toggleShelfItemExpanded(type, id);
  }

  /**
   * Set the expanded state of an item
   */
  setExpanded(type: 'note' | 'conversation', id: string, expanded: boolean): void {
    setShelfItemExpanded(type, id, expanded);
  }

  /**
   * Clear all items from the shelf
   */
  clear(): void {
    clearShelfItems();
  }
}

export const automergeShelfStore = new ShelfStore();
