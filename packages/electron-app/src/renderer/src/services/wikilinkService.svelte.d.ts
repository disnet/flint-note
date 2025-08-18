/**
 * Centralized service for handling wikilink click interactions.
 * Consolidates note creation, navigation, and event dispatch logic
 * that was previously duplicated across multiple components.
 */
declare class WikilinkService {
    /**
     * Handles wikilink click events - either navigates to existing notes
     * or creates new notes if they don't exist.
     */
    handleWikilinkClick(noteId: string, title: string, shouldCreate?: boolean): Promise<void>;
    /**
     * Stub implementation for contexts where wikilink navigation
     * isn't supported (e.g., message input fields).
     */
    handleWikilinkClickStub(_noteId: string, _title: string, _shouldCreate?: boolean): void;
}
export declare const wikilinkService: WikilinkService;
export {};
