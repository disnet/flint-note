/**
 * Theme for live preview markdown styling
 *
 * Provides CSS classes for formatted content when syntax markers are hidden,
 * and muted styling for markers when they're visible during editing.
 */
import { EditorView } from '@codemirror/view';

export const livePreviewTheme = EditorView.theme({
  // === STYLED MODE (cursor away - markers hidden) ===

  // Bold
  '.live-preview-bold': {
    fontWeight: '700'
  },

  // Italic
  '.live-preview-italic': {
    fontStyle: 'italic'
  },

  // Headings
  '.live-preview-heading1': {
    fontSize: '1.75em',
    fontWeight: '700',
    lineHeight: '1.3'
  },
  '.live-preview-heading2': {
    fontSize: '1.5em',
    fontWeight: '700',
    lineHeight: '1.3'
  },
  '.live-preview-heading3': {
    fontSize: '1.25em',
    fontWeight: '600',
    lineHeight: '1.3'
  },
  '.live-preview-heading4': {
    fontSize: '1.1em',
    fontWeight: '600',
    lineHeight: '1.3'
  },
  '.live-preview-heading5': {
    fontSize: '1em',
    fontWeight: '600',
    lineHeight: '1.3'
  },
  '.live-preview-heading6': {
    fontSize: '0.9em',
    fontWeight: '600',
    lineHeight: '1.3'
  },

  // Inline code
  '.live-preview-code': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '0.9em',
    background: 'var(--code-bg, rgba(0, 0, 0, 0.05))',
    padding: '0.1em 0.3em',
    borderRadius: '3px'
  },

  // Strikethrough
  '.live-preview-strikethrough': {
    textDecoration: 'line-through',
    opacity: '0.7'
  },

  // Horizontal rule (line decoration)
  '.live-preview-horizontalrule': {
    borderBottom: '1px solid var(--border-color, rgba(0, 0, 0, 0.2))',
    display: 'block',
    height: '0.5em'
  },

  // Blockquote (line decoration)
  '.live-preview-blockquote': {
    borderLeft: '3px solid var(--accent-color, #6366f1)',
    paddingLeft: '1em',
    color: 'var(--text-secondary, #666)',
    fontStyle: 'italic'
  },

  // Task list checkboxes
  '.live-preview-task-checkbox': {
    display: 'inline-flex',
    alignItems: 'center',
    marginRight: '0.5em',
    verticalAlign: 'baseline',
    cursor: 'pointer'
  },
  '.live-preview-task-checkbox .checkbox-box': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    border: '1.5px solid var(--text-muted, #888)',
    transition: 'all 0.15s ease'
  },
  '.live-preview-task-checkbox .checkbox-box svg': {
    width: '12px',
    height: '12px'
  },
  '.live-preview-task-checkbox.unchecked .checkbox-box': {
    background: 'transparent'
  },
  '.live-preview-task-checkbox.checked .checkbox-box': {
    background: 'var(--accent-color, #6366f1)',
    borderColor: 'var(--accent-color, #6366f1)',
    color: 'white'
  },
  '.live-preview-task-checked-text': {
    textDecoration: 'line-through',
    opacity: '0.6'
  },

  // === EDITING MODE (cursor near - markers visible but muted) ===

  '.live-preview-marker': {
    color: 'var(--text-muted, #888)',
    opacity: '0.5'
  }
});

// Dark mode overrides using CSS media query
export const livePreviewDarkTheme = EditorView.theme(
  {
    '.live-preview-code': {
      background: 'rgba(255, 255, 255, 0.1)'
    },
    '.live-preview-horizontalrule': {
      borderBottomColor: 'rgba(255, 255, 255, 0.3)'
    },
    '.live-preview-blockquote': {
      borderLeftColor: 'var(--accent-color, #818cf8)',
      color: 'var(--text-secondary, #aaa)'
    }
  },
  { dark: true }
);
