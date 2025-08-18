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
    priority: number;
}
declare class ViewRegistryClass {
    private views;
    registerView(noteType: string, view: NoteView): void;
    getView(noteType: string, mode?: ViewMode): NoteView | null;
    hasCustomView(noteType: string): boolean;
    getAllViews(): Map<string, NoteView[]>;
    unregisterView(noteType: string, component: Component<NoteViewProps>): void;
}
export declare const ViewRegistry: ViewRegistryClass;
export {};
