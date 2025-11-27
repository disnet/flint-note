import type { Component } from 'svelte';

export interface NoteViewProps {
  activeNote: Record<string, unknown>;
  noteContent: string;
  metadata: Record<string, unknown>;
  onContentChange: (content: string) => void;
  onMetadataChange: (metadata: Record<string, unknown>) => void;
  onSave: () => void;
}

export type ViewMode = 'edit' | 'view' | 'hybrid';

/**
 * Content rendering types (kinds)
 * - markdown: Standard markdown notes (default)
 * - epub: EPUB ebook reader notes
 */
export type NoteKind = 'markdown' | 'epub';

export interface NoteView {
  component: Component<NoteViewProps>;
  modes: ViewMode[];
  /**
   * The content kinds this view supports (e.g., ['epub'], ['markdown'])
   * Views are routed based on kind, not type
   */
  supportedKinds: string[];
  priority: number; // Higher priority views take precedence
}

/**
 * ViewRegistry - Routes notes to appropriate view components based on their kind
 *
 * The registry separates content rendering (kind) from organizational categorization (type).
 * This allows users to organize notes into any type while preserving correct rendering.
 */
class ViewRegistryClass {
  // Map of kind -> views
  private viewsByKind = new Map<string, NoteView[]>();

  /**
   * Register a view for a specific content kind
   *
   * @param kind - The content kind this view handles (e.g., 'epub', 'markdown')
   * @param view - The view configuration
   */
  registerView(kind: string, view: NoteView): void {
    if (!this.viewsByKind.has(kind)) {
      this.viewsByKind.set(kind, []);
    }

    const kindViews = this.viewsByKind.get(kind)!;
    kindViews.push(view);

    // Sort by priority (highest first)
    kindViews.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get a view for a specific content kind
   *
   * @param kind - The content kind to get a view for
   * @param mode - The view mode to filter by
   * @returns The highest priority view that supports the mode, or null
   */
  getViewByKind(kind: string, mode: ViewMode = 'hybrid'): NoteView | null {
    const kindViews = this.viewsByKind.get(kind);
    if (!kindViews || kindViews.length === 0) {
      return null;
    }

    // Find the highest priority view that supports the requested mode
    return kindViews.find((view) => view.modes.includes(mode)) || null;
  }

  /**
   * @deprecated Use getViewByKind() instead. This method exists for backward compatibility.
   * Get a view for a note type (treats type as kind for legacy support)
   */
  getView(noteType: string, mode: ViewMode = 'hybrid'): NoteView | null {
    return this.getViewByKind(noteType, mode);
  }

  /**
   * Check if a custom view exists for a content kind
   */
  hasCustomViewForKind(kind: string): boolean {
    return this.viewsByKind.has(kind) && this.viewsByKind.get(kind)!.length > 0;
  }

  /**
   * @deprecated Use hasCustomViewForKind() instead
   */
  hasCustomView(noteType: string): boolean {
    return this.hasCustomViewForKind(noteType);
  }

  getAllViews(): Map<string, NoteView[]> {
    return new Map(this.viewsByKind);
  }

  /**
   * Unregister a view for a specific kind
   */
  unregisterViewByKind(kind: string, component: Component<NoteViewProps>): void {
    const kindViews = this.viewsByKind.get(kind);
    if (!kindViews) return;

    const filtered = kindViews.filter((view) => view.component !== component);
    if (filtered.length === 0) {
      this.viewsByKind.delete(kind);
    } else {
      this.viewsByKind.set(kind, filtered);
    }
  }

  /**
   * @deprecated Use unregisterViewByKind() instead
   */
  unregisterView(noteType: string, component: Component<NoteViewProps>): void {
    this.unregisterViewByKind(noteType, component);
  }
}

export const ViewRegistry = new ViewRegistryClass();
