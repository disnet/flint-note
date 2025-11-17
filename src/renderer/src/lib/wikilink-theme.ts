import { EditorView } from '@codemirror/view';

/**
 * CodeMirror theme for wikilinks with button-like styling
 */
export const wikilinkTheme = EditorView.theme({
  '.wikilink': {
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 0.175rem',
    margin: '0 0.125rem',
    borderRadius: '0.25rem',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    fontWeight: '600',
    transition: 'all 0.2s ease'
  },

  '.wikilink-icon': {
    fontSize: '0.9em',
    lineHeight: '1',
    display: 'inline-block',
    verticalAlign: 'baseline',
    marginRight: '0.25em'
  },

  '.wikilink-text': {
    textDecoration: 'underline'
  },

  '.wikilink-exists': {
    background: 'rgba(0, 0, 0, 0.03)',
    color: '#1a1a1a'
  },

  '.wikilink-exists:hover': {
    background: 'rgba(0, 0, 0, 0.06)',
    color: '#0066cc'
  },

  '.wikilink-selected': {
    background: 'rgba(0, 0, 0, 0.06)',
    color: '#0066cc'
  },

  '.wikilink-selected-broken': {
    background: 'rgba(215, 58, 73, 0.12)',
    color: '#d73a49'
  },

  '.wikilink-broken': {
    background: 'rgba(215, 58, 73, 0.08)',
    color: '#d73a49'
  },

  '.wikilink-broken:hover': {
    background: 'rgba(215, 58, 73, 0.12)',
    color: '#cb2431'
  },

  // Archived wikilinks (muted colors to indicate archived status)
  '.wikilink-archived': {
    opacity: '0.6',
    fontStyle: 'italic'
  },

  '.wikilink-archived:hover': {
    opacity: '0.8'
  },

  // Dark mode using CSS media queries
  '@media (prefers-color-scheme: dark)': {
    '.wikilink-exists': {
      background: 'rgba(255, 255, 255, 0.06)',
      color: '#ffffff'
    },

    '.wikilink-exists:hover': {
      background: 'rgba(255, 255, 255, 0.12)',
      color: '#ffffff'
    },

    '.wikilink-broken': {
      background: 'rgba(248, 81, 73, 0.12)',
      color: '#f85149'
    },

    '.wikilink-broken:hover': {
      background: 'rgba(248, 81, 73, 0.18)',
      color: '#ff7b72'
    },

    '.wikilink-selected': {
      background: 'rgba(255, 255, 255, 0.12)',
      color: '#60a5fa'
    },

    '.wikilink-selected-broken': {
      background: 'rgba(248, 81, 73, 0.18)',
      color: '#f85149'
    }
  }
});
