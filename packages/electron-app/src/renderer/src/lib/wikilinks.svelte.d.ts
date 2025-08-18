import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import type { NoteMetadata } from '../services/noteStore.svelte';
export interface WikilinkMatch {
    from: number;
    to: number;
    text: string;
    identifier: string;
    title: string;
    exists: boolean;
    noteId?: string;
}
export interface WikilinkClickHandler {
    (noteId: string, title: string, shouldCreate?: boolean): void;
}
/**
 * Parse wikilinks from text content
 */
export declare function parseWikilinks(text: string, notes: NoteMetadata[]): WikilinkMatch[];
/**
 * Autocomplete function for wikilinks
 */
export declare function wikilinkCompletion(context: CompletionContext): CompletionResult | null;
/**
 * Extension that adds wikilink support to CodeMirror
 */
/**
 * Wikilinks extension without autocomplete (for use when combining with other autocomplete sources)
 */
export declare function wikilinksWithoutAutocomplete(clickHandler: WikilinkClickHandler): Extension;
export declare function wikilinksExtension(clickHandler: WikilinkClickHandler): Extension;
/**
 * Function to update the click handler for an existing editor
 */
export declare function updateWikilinkHandler(view: EditorView, clickHandler: WikilinkClickHandler): void;
