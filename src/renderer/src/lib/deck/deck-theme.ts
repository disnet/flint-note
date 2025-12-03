/**
 * CodeMirror theme for deck widgets
 */

import { EditorView } from '@codemirror/view';

export const deckTheme = EditorView.theme({
  '.deck-widget-container': {
    display: 'block',
    margin: '1rem 0',
    border: '1px solid var(--border-light, #e0e0e0)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-primary, #fff)',
    overflow: 'hidden',
    fontFamily: 'inherit'
  },

  '.deck-widget': {
    display: 'flex',
    flexDirection: 'column'
  },

  // Header
  '.deck-header': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)'
  },

  '.deck-name': {
    fontWeight: '600',
    fontSize: '0.9rem',
    color: 'var(--text-primary, #333)',
    background: 'transparent',
    border: 'none',
    padding: '0.125rem 0.25rem',
    margin: '-0.125rem -0.25rem',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s ease'
  },

  '.deck-name:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.05))'
  },

  '.deck-name-input': {
    fontWeight: '600',
    fontSize: '0.9rem',
    color: 'var(--text-primary, #333)',
    background: 'var(--bg-primary, #fff)',
    border: '1px solid var(--accent-primary, #2196f3)',
    padding: '0.125rem 0.25rem',
    margin: '-0.125rem -0.25rem',
    borderRadius: '4px',
    outline: 'none',
    minWidth: '120px',
    maxWidth: '300px'
  },

  '.deck-name-input::placeholder': {
    color: 'var(--text-tertiary, #999)',
    fontWeight: '400'
  },

  '.deck-meta': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },

  '.deck-count': {
    fontSize: '0.8rem',
    color: 'var(--text-secondary, #666)'
  },

  // Configure button
  '.configure-btn': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.75rem',
    height: '1.75rem',
    padding: '0',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-tertiary, #999)',
    transition: 'all 0.2s ease'
  },

  '.configure-btn:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.05))',
    color: 'var(--text-primary, #333)'
  },

  '.configure-btn.active': {
    backgroundColor: 'var(--accent-primary-alpha, rgba(33, 150, 243, 0.1))',
    color: 'var(--accent-primary, #2196f3)'
  },

  '.configure-btn svg': {
    stroke: 'currentColor'
  },

  '.configure-btn:disabled': {
    opacity: '0.3',
    cursor: 'default',
    pointerEvents: 'none'
  },

  // Configure panel
  '.deck-configure': {
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    backgroundColor: 'var(--bg-primary, #fff)',
    overflow: 'visible'
  },

  // Content container with height cap
  '.deck-content': {
    maxHeight: '300px',
    overflowY: 'auto',
    overflowX: 'hidden',
    transition: 'max-height 0.2s ease',
    scrollbarGutter: 'stable' // Reserve space for scrollbar to prevent layout shift
  },

  '.deck-content.expanded': {
    maxHeight: 'none'
  },

  // States
  '.deck-loading': {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem'
  },

  '.deck-error': {
    padding: '1.5rem',
    textAlign: 'center',
    color: 'var(--text-error, #d32f2f)',
    fontSize: '0.875rem',
    backgroundColor: 'var(--bg-error, rgba(211, 47, 47, 0.05))'
  },

  '.deck-error button': {
    marginTop: '0.5rem',
    padding: '0.25rem 0.75rem',
    border: '1px solid var(--border-light, #e0e0e0)',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-primary, #fff)',
    cursor: 'pointer',
    fontSize: '0.8125rem'
  },

  '.deck-error button:hover': {
    backgroundColor: 'var(--bg-secondary, #f5f5f5)'
  },

  '.deck-empty': {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem'
  },

  // Table
  '.deck-table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },

  '.deck-table th': {
    textAlign: 'left',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    fontWeight: '500',
    color: 'var(--text-secondary, #666)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  },

  '.deck-table th:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.03))'
  },

  '.deck-table th.sorted': {
    color: 'var(--accent-primary, #2196f3)'
  },

  '.sort-indicator': {
    marginLeft: '0.25rem',
    fontSize: '0.75rem'
  },

  '.deck-table td': {
    padding: '0.5rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    color: 'var(--text-primary, #333)',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  '.deck-table tbody tr': {
    transition: 'background-color 0.1s ease'
  },

  '.deck-table tbody tr:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.03))'
  },

  '.deck-table tbody tr:last-child td': {
    borderBottom: 'none'
  },

  // Row actions (edit button)
  '.row-actions': {
    width: '2rem',
    padding: '0.25rem !important',
    textAlign: 'center',
    opacity: '0',
    transition: 'opacity 0.15s ease'
  },

  '.data-row:hover .row-actions': {
    opacity: '1'
  },

  '.edit-row-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.75rem',
    height: '1.75rem',
    padding: '0',
    border: 'none',
    borderRadius: '0.25rem',
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary, #999)',
    fontSize: '1.1rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },

  '.edit-row-btn:hover': {
    backgroundColor: 'var(--bg-tertiary, #e5e5e5)',
    color: 'var(--text-primary, #333)'
  },

  // Title cell - styled like wikilinks (detailed styles in ColumnCell.svelte)
  '.deck-title-cell': {
    fontWeight: '600'
  },

  // Editing row
  '.editing-row': {
    backgroundColor: 'var(--bg-secondary, #f8f9fa)'
  },

  '.editing-row td': {
    padding: '0.375rem 0.75rem'
  },

  '.editing-actions': {
    display: 'flex',
    gap: '0.25rem',
    padding: '0.375rem 0.5rem !important',
    whiteSpace: 'nowrap'
  },

  '.save-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.5rem',
    height: '1.5rem',
    padding: '0',
    border: 'none',
    borderRadius: '0.25rem',
    backgroundColor: 'var(--accent-success, #22c55e)',
    color: 'white',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease'
  },

  '.save-btn:hover': {
    backgroundColor: 'var(--accent-success-hover, #16a34a)'
  },

  '.save-btn:disabled': {
    opacity: '0.5',
    cursor: 'not-allowed'
  },

  '.cancel-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.5rem',
    height: '1.5rem',
    padding: '0',
    border: 'none',
    borderRadius: '0.25rem',
    backgroundColor: 'var(--bg-tertiary, #e5e7eb)',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },

  '.cancel-btn:hover': {
    backgroundColor: 'var(--bg-error, rgba(239, 68, 68, 0.1))',
    color: 'var(--text-error, #ef4444)'
  },

  '.cancel-btn:disabled': {
    opacity: '0.5',
    cursor: 'not-allowed'
  },

  // Footer
  '.deck-footer': {
    padding: '0.75rem 1rem',
    borderTop: '1px solid var(--border-light, #e0e0e0)'
  },

  '.deck-new-note-btn': {
    width: '100%',
    padding: '0.5rem 1rem',
    border: '1px dashed var(--border-light, #ccc)',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem',
    transition: 'all 0.15s ease'
  },

  '.deck-new-note-btn:hover': {
    borderColor: 'var(--accent-primary, #2196f3)',
    color: 'var(--accent-primary, #2196f3)',
    backgroundColor: 'var(--bg-hover, rgba(33, 150, 243, 0.05))'
  }
});
