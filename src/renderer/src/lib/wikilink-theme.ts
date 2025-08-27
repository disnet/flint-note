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
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
  },

  '.wikilink-exists': {
    background: 'rgba(255, 255, 255, 0.9)',
    color: '#1a1a1a',
    borderColor: 'rgba(255, 255, 255, 0.3)'
  },

  '.wikilink-exists:hover': {
    background: 'rgba(255, 255, 255, 1)',
    color: '#0066cc',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    transform: 'translateY(-1px)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
  },

  '.wikilink-broken': {
    background: 'rgba(255, 255, 255, 0.8)',
    color: '#d73a49',
    borderColor: 'rgba(215, 58, 73, 0.3)'
  },

  '.wikilink-broken:hover': {
    background: 'rgba(255, 255, 255, 1)',
    color: '#cb2431',
    borderColor: 'rgba(215, 58, 73, 0.5)',
    transform: 'translateY(-1px)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
  },

  // Dark mode using CSS media queries
  '@media (prefers-color-scheme: dark)': {
    '.wikilink': {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)'
    },

    '.wikilink-exists': {
      background: 'rgba(255, 255, 255, 0.15)',
      color: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.2)'
    },

    '.wikilink-exists:hover': {
      background: 'rgba(255, 255, 255, 0.25)',
      color: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.3)',
      transform: 'translateY(-1px)',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)'
    },

    '.wikilink-broken': {
      background: 'rgba(255, 255, 255, 0.12)',
      color: '#f85149',
      borderColor: 'rgba(248, 81, 73, 0.2)'
    },

    '.wikilink-broken:hover': {
      background: 'rgba(255, 255, 255, 0.2)',
      color: '#ff7b72',
      borderColor: 'rgba(248, 81, 73, 0.3)',
      transform: 'translateY(-1px)',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)'
    }
  }
});
