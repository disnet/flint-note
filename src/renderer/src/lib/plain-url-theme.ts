import { EditorView } from '@codemirror/view';

/**
 * CodeMirror theme for plain URLs.
 * Uses blue color scheme matching markdown links but simpler styling.
 */
export const plainUrlTheme = EditorView.theme({
  '.plain-url': {
    cursor: 'pointer',
    color: '#2563eb',
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
    transition: 'color 0.15s ease'
  },

  '.plain-url:hover': {
    color: '#1d4ed8'
  },

  // Dark mode using CSS media queries
  '@media (prefers-color-scheme: dark)': {
    '.plain-url': {
      color: '#60a5fa'
    },

    '.plain-url:hover': {
      color: '#93c5fd'
    }
  }
});
