import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { StateField, StateEffect, Range, RangeSet, EditorState } from '@codemirror/state';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { notesStore } from '../services/noteStore.svelte';
import { wikilinkTheme } from './wikilink-theme';
// Regular expression to match wikilinks: [[Note Title]] or [[identifier|title]]
const WIKILINK_REGEX = /\[\[([^[\]]+)\]\]/g;
// Effect to update wikilink click handler
const setWikilinkHandler = StateEffect.define();
// State field to store the current click handler
const wikilinkHandlerField = StateField.define({
    create: () => null,
    update: (value, tr) => {
        for (const effect of tr.effects) {
            if (effect.is(setWikilinkHandler)) {
                return effect.value;
            }
        }
        return value;
    }
});
/**
 * Parse wikilinks from text content
 */
export function parseWikilinks(text, notes) {
    const matches = [];
    let match;
    WIKILINK_REGEX.lastIndex = 0; // Reset regex state
    while ((match = WIKILINK_REGEX.exec(text)) !== null) {
        const content = match[1].trim();
        // Check if it's in the format "identifier|title"
        const pipeIndex = content.indexOf('|');
        let identifier;
        let title;
        if (pipeIndex !== -1) {
            // Format: [[identifier|title]]
            identifier = content.substring(0, pipeIndex).trim();
            title = content.substring(pipeIndex + 1).trim();
        }
        else {
            // Format: [[title]] - use title as both identifier and title
            identifier = content;
            title = content;
        }
        const existingNote = findNoteByIdentifier(identifier, notes);
        matches.push({
            from: match.index,
            to: match.index + match[0].length,
            text: match[0],
            identifier,
            title,
            exists: !!existingNote,
            noteId: existingNote?.id
        });
    }
    return matches;
}
/**
 * Find a note by identifier (which can be note ID, title, or filename)
 */
function findNoteByIdentifier(identifier, notes) {
    const normalizedIdentifier = identifier.toLowerCase().trim();
    // First, try to match by note ID (exact match)
    const byId = notes.find((note) => note.id.toLowerCase() === normalizedIdentifier);
    if (byId)
        return byId;
    // Then try to match by title (case-insensitive)
    const byTitle = notes.find((note) => note.title.toLowerCase().trim() === normalizedIdentifier);
    if (byTitle)
        return byTitle;
    // Finally, try to match by filename without .md extension
    const byFilename = notes.find((note) => note.filename.toLowerCase().replace(/\.md$/, '').trim() === normalizedIdentifier);
    if (byFilename)
        return byFilename;
    return null;
}
/**
 * Autocomplete function for wikilinks
 */
export function wikilinkCompletion(context) {
    const word = context.matchBefore(/\[\[([^\]]*)/);
    if (!word)
        return null;
    // Extract the query from inside the brackets
    const match = word.text.match(/\[\[([^\]]*)/);
    if (!match)
        return null;
    const query = match[1];
    // Get current notes from store
    const notes = notesStore.notes;
    // Filter and sort notes based on query
    const filteredNotes = query.trim()
        ? notes
            .filter((note) => note.title.toLowerCase().includes(query.toLowerCase()) ||
            note.filename.toLowerCase().includes(query.toLowerCase()) ||
            note.id.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => {
            const aTitle = a.title.toLowerCase();
            const bTitle = b.title.toLowerCase();
            const aId = a.id.toLowerCase();
            const bId = b.id.toLowerCase();
            const normalizedQuery = query.toLowerCase();
            // Exact title match has highest priority
            if (aTitle === normalizedQuery)
                return -1;
            if (bTitle === normalizedQuery)
                return 1;
            // Exact ID match has second priority
            if (aId === normalizedQuery)
                return -1;
            if (bId === normalizedQuery)
                return 1;
            // Title starts with query
            if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
                return -1;
            if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
                return 1;
            // ID starts with query
            if (aId.startsWith(normalizedQuery) && !bId.startsWith(normalizedQuery))
                return -1;
            if (bId.startsWith(normalizedQuery) && !aId.startsWith(normalizedQuery))
                return 1;
            return aTitle.localeCompare(bTitle);
        })
            .slice(0, 10)
        : notes.slice(0, 10);
    // Create completion options with the new format [[identifier|title]]
    const options = filteredNotes.map((note) => ({
        label: note.title,
        apply: `${note.id}|${note.title}]]`,
        info: `ID: ${note.id} • Type: ${note.type || 'unknown'}`,
        type: 'text'
    }));
    // Add option to create new note if query doesn't match exactly
    if (query.trim() &&
        !filteredNotes.some((note) => note.title.toLowerCase() === query.toLowerCase().trim())) {
        options.push({
            label: `Create "${query.trim()}"`,
            apply: `${query.trim()}]]`, // For new notes, just use title format until created
            info: 'Create new note',
            type: 'text'
        });
    }
    return {
        from: word.from + 2, // Start after "[["
        options
    };
}
/**
 * Widget for rendering clickable wikilinks
 */
class WikilinkWidget extends WidgetType {
    identifier;
    title;
    exists;
    noteId;
    clickHandler;
    constructor(identifier, title, exists, noteId, clickHandler) {
        super();
        this.identifier = identifier;
        this.title = title;
        this.exists = exists;
        this.noteId = noteId;
        this.clickHandler = clickHandler;
    }
    toDOM() {
        const span = document.createElement('span');
        span.className = this.exists
            ? 'wikilink wikilink-exists'
            : 'wikilink wikilink-broken';
        // Display only the title part (no brackets), which is more user-friendly
        span.textContent = this.title;
        span.title = this.exists
            ? `Open note: ${this.title} (${this.identifier})`
            : `Note "${this.title}" not found - click to create`;
        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.clickHandler) {
                if (this.exists && this.noteId) {
                    this.clickHandler(this.noteId, this.title);
                }
                else {
                    // Handle broken link - create new note with this title
                    console.log('Creating new note for broken wikilink:', this.title);
                    this.clickHandler(this.identifier, this.title, true);
                }
            }
        });
        return span;
    }
    eq(other) {
        return (this.identifier === other.identifier &&
            this.title === other.title &&
            this.exists === other.exists &&
            this.noteId === other.noteId);
    }
    updateDOM() {
        return false; // Always recreate for simplicity
    }
}
/**
 * State field for managing wikilink decorations
 */
const wikilinkField = StateField.define({
    create(state) {
        return decorateWikilinks(state);
    },
    update(decorations, tr) {
        if (tr.docChanged) {
            return decorateWikilinks(tr.state);
        }
        return decorations.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f)
});
/**
 * Create decorations for wikilinks in the document
 */
function decorateWikilinks(state) {
    const decorations = [];
    const text = state.doc.toString();
    // Get current notes from store
    const notes = notesStore.notes; // Immediately unsubscribe since we just want current value
    // Get current click handler
    const clickHandler = state.field(wikilinkHandlerField, false) || null;
    const wikilinks = parseWikilinks(text, notes);
    for (const wikilink of wikilinks) {
        const widget = new WikilinkWidget(wikilink.identifier, wikilink.title, wikilink.exists, wikilink.noteId, clickHandler);
        decorations.push(Decoration.replace({
            widget,
            inclusive: false,
            block: false
        }).range(wikilink.from, wikilink.to));
    }
    return Decoration.set(decorations);
}
/**
 * Extension that adds wikilink support to CodeMirror
 */
/**
 * Wikilinks extension without autocomplete (for use when combining with other autocomplete sources)
 */
export function wikilinksWithoutAutocomplete(clickHandler) {
    return [
        wikilinkTheme,
        wikilinkHandlerField.init(() => clickHandler),
        wikilinkField,
        // Add atomic ranges for proper cursor movement
        EditorView.atomicRanges.of((view) => {
            const decorations = view.state.field(wikilinkField, false);
            if (!decorations) {
                return RangeSet.empty;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ranges = [];
            try {
                decorations.between(0, view.state.doc.length, (from, to, value) => {
                    if (value.spec.widget instanceof WikilinkWidget) {
                        ranges.push({ from, to, value: true });
                    }
                });
                // Sort ranges by position before creating RangeSet
                ranges.sort((a, b) => a.from - b.from);
                return ranges.length > 0 ? RangeSet.of(ranges) : RangeSet.empty;
            }
            catch (e) {
                console.warn('Error creating atomic ranges:', e);
                return RangeSet.empty;
            }
        }),
        EditorView.updateListener.of((update) => {
            if (update.view.state.field(wikilinkHandlerField) !== clickHandler) {
                update.view.dispatch({
                    effects: setWikilinkHandler.of(clickHandler)
                });
            }
        })
    ];
}
export function wikilinksExtension(clickHandler) {
    const baseExtensions = wikilinksWithoutAutocomplete(clickHandler);
    return [
        ...(Array.isArray(baseExtensions) ? baseExtensions : [baseExtensions]),
        autocompletion({
            override: [wikilinkCompletion]
        })
    ];
}
/**
 * Function to update the click handler for an existing editor
 */
export function updateWikilinkHandler(view, clickHandler) {
    view.dispatch({
        effects: setWikilinkHandler.of(clickHandler)
    });
}
