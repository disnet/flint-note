import { EditorView } from '@codemirror/view';

/**
 * CodeMirror theme for wikilinks with inline text flow.
 * Container uses display:inline for proper cursor positioning,
 * while inner text wraps naturally with surrounding content.
 */
export const wikilinkTheme = EditorView.theme({
  '.wikilink': {
    display: 'inline' // Inline box for cursor positioning, content still wraps
  },

  '.wikilink-segment': {
    cursor: 'pointer',
    display: 'inline',
    fontWeight: '600',
    transition: 'all 0.15s ease',
    padding: '0.1em 0.2em',
    borderRadius: '0.25em',
    boxDecorationBreak: 'clone', // Consistent styling across line breaks
    WebkitBoxDecorationBreak: 'clone'
  },

  '.wikilink-icon': {
    display: 'inline-block', // Breaks out of parent's text-decoration
    fontSize: '0.9em',
    lineHeight: '1',
    textDecoration: 'none'
  },

  '.wikilink-text': {
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
    wordBreak: 'break-word' // Allow very long words to break
  },

  // Existing links
  '.wikilink-exists .wikilink-segment': {
    background: 'rgba(0, 0, 0, 0.03)',
    color: '#1a1a1a'
  },

  '.wikilink-exists .wikilink-segment:hover': {
    background: 'rgba(0, 0, 0, 0.06)',
    color: '#0066cc'
  },

  // Selected existing links
  '.wikilink-selected .wikilink-segment': {
    background: 'rgba(0, 0, 0, 0.06)',
    color: '#0066cc'
  },

  // Broken links
  '.wikilink-broken .wikilink-segment': {
    background: 'rgba(215, 58, 73, 0.08)',
    color: '#d73a49'
  },

  '.wikilink-broken .wikilink-segment:hover': {
    background: 'rgba(215, 58, 73, 0.12)',
    color: '#cb2431'
  },

  // Selected broken links
  '.wikilink-selected-broken .wikilink-segment': {
    background: 'rgba(215, 58, 73, 0.12)',
    color: '#d73a49'
  },

  // Archived wikilinks (muted colors to indicate archived status)
  '.wikilink-archived .wikilink-segment': {
    opacity: '0.6',
    fontStyle: 'italic'
  },

  '.wikilink-archived .wikilink-segment:hover': {
    opacity: '0.8'
  },

  // Dark mode using CSS media queries
  '@media (prefers-color-scheme: dark)': {
    '.wikilink-exists .wikilink-segment': {
      background: 'rgba(255, 255, 255, 0.06)',
      color: '#ffffff'
    },

    '.wikilink-exists .wikilink-segment:hover': {
      background: 'rgba(255, 255, 255, 0.12)',
      color: '#60a5fa'
    },

    '.wikilink-broken .wikilink-segment': {
      background: 'rgba(248, 81, 73, 0.12)',
      color: '#f85149'
    },

    '.wikilink-broken .wikilink-segment:hover': {
      background: 'rgba(248, 81, 73, 0.18)',
      color: '#ff7b72'
    },

    '.wikilink-selected .wikilink-segment': {
      background: 'rgba(255, 255, 255, 0.12)',
      color: '#60a5fa'
    },

    '.wikilink-selected-broken .wikilink-segment': {
      background: 'rgba(248, 81, 73, 0.18)',
      color: '#f85149'
    }
  }
});
