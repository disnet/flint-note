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

export interface NoteView {
  component: Component<NoteViewProps>;
  modes: ViewMode[];
  supportedTypes: string[];
  priority: number; // Higher priority views take precedence
}

class ViewRegistryClass {
  private views = new Map<string, NoteView[]>();

  registerView(noteType: string, view: NoteView): void {
    if (!this.views.has(noteType)) {
      this.views.set(noteType, []);
    }

    const typeViews = this.views.get(noteType)!;
    typeViews.push(view);

    // Sort by priority (highest first)
    typeViews.sort((a, b) => b.priority - a.priority);
  }

  getView(noteType: string, mode: ViewMode = 'hybrid'): NoteView | null {
    const typeViews = this.views.get(noteType);
    if (!typeViews || typeViews.length === 0) {
      return null;
    }

    // Find the highest priority view that supports the requested mode
    return typeViews.find((view) => view.modes.includes(mode)) || null;
  }

  hasCustomView(noteType: string): boolean {
    return this.views.has(noteType) && this.views.get(noteType)!.length > 0;
  }

  getAllViews(): Map<string, NoteView[]> {
    return new Map(this.views);
  }

  unregisterView(noteType: string, component: Component<NoteViewProps>): void {
    const typeViews = this.views.get(noteType);
    if (!typeViews) return;

    const filtered = typeViews.filter((view) => view.component !== component);
    if (filtered.length === 0) {
      this.views.delete(noteType);
    } else {
      this.views.set(noteType, filtered);
    }
  }
}

export const ViewRegistry = new ViewRegistryClass();
