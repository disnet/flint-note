import { EditorView } from '@codemirror/view';

/**
 * CodeMirror theme for markdown links with inline text flow.
 * Uses blue color scheme to distinguish from wikilinks.
 */
export const markdownLinkTheme = EditorView.theme({
  '.markdown-link': {
    display: 'contents' // No box - children flow inline with surrounding text
  },

  '.markdown-link-segment': {
    cursor: 'pointer',
    display: 'inline',
    fontWeight: '600',
    transition: 'all 0.15s ease',
    padding: '0.1em 0.2em',
    borderRadius: '0.25em',
    boxDecorationBreak: 'clone', // Consistent styling across line breaks
    WebkitBoxDecorationBreak: 'clone'
  },

  '.markdown-link-icon-wrapper': {
    display: 'inline',
    textDecoration: 'none', // No underline for space and icon
    marginLeft: '0.25em' // Explicit spacing from text
  },

  '.markdown-link-icon': {
    display: 'inline',
    fontSize: '0.85em',
    verticalAlign: 'baseline',
    textDecoration: 'none'
  },

  '.markdown-link-text': {
    display: 'inline',
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
    wordBreak: 'break-word' // Allow very long words to break
  },

  // Default state - blue tones for external links
  '.markdown-link .markdown-link-segment': {
    background: 'rgba(59, 130, 246, 0.08)',
    color: '#2563eb'
  },

  '.markdown-link .markdown-link-segment:hover': {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#1d4ed8'
  },

  // Selected state
  '.markdown-link-selected .markdown-link-segment': {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#1d4ed8'
  },

  // Dark mode using CSS media queries
  '@media (prefers-color-scheme: dark)': {
    '.markdown-link .markdown-link-segment': {
      background: 'rgba(96, 165, 250, 0.12)',
      color: '#60a5fa'
    },

    '.markdown-link .markdown-link-segment:hover': {
      background: 'rgba(96, 165, 250, 0.2)',
      color: '#93c5fd'
    },

    '.markdown-link-selected .markdown-link-segment': {
      background: 'rgba(96, 165, 250, 0.2)',
      color: '#93c5fd'
    }
  }
});
