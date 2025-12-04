/**
 * CodeMirror theme for deck widgets
 * Minimal styles for the widget container - component-specific styles are in Svelte files
 */

import { EditorView } from '@codemirror/view';

export const deckTheme = EditorView.theme({
  '.deck-widget-container': {
    display: 'block',
    width: '100%',
    margin: '1rem 0',
    overflow: 'visible',
    fontFamily: 'inherit'
  }
});
