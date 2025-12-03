/**
 * CodeMirror theme for dataview widgets
 */

import { EditorView } from '@codemirror/view';

export const dataviewTheme = EditorView.theme({
  '.dataview-widget-container': {
    display: 'block',
    margin: '1rem 0',
    border: '1px solid var(--border-light, #e0e0e0)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-primary, #fff)',
    overflow: 'hidden',
    fontFamily: 'inherit'
  },

  '.dataview-widget': {
    display: 'flex',
    flexDirection: 'column'
  },

  // Header
  '.dataview-header': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)'
  },

  '.dataview-name': {
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

  '.dataview-name:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.05))'
  },

  '.dataview-name-input': {
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

  '.dataview-name-input::placeholder': {
    color: 'var(--text-tertiary, #999)',
    fontWeight: '400'
  },

  '.dataview-meta': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },

  '.dataview-count': {
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

  // Configure panel
  '.dataview-configure': {
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    backgroundColor: 'var(--bg-primary, #fff)',
    overflow: 'visible'
  },

  // Content container with height cap
  '.dataview-content': {
    maxHeight: '300px',
    overflowY: 'auto',
    overflowX: 'hidden',
    transition: 'max-height 0.2s ease'
  },

  '.dataview-content.expanded': {
    maxHeight: 'none'
  },

  // States
  '.dataview-loading': {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem'
  },

  '.dataview-error': {
    padding: '1.5rem',
    textAlign: 'center',
    color: 'var(--text-error, #d32f2f)',
    fontSize: '0.875rem',
    backgroundColor: 'var(--bg-error, rgba(211, 47, 47, 0.05))'
  },

  '.dataview-error button': {
    marginTop: '0.5rem',
    padding: '0.25rem 0.75rem',
    border: '1px solid var(--border-light, #e0e0e0)',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-primary, #fff)',
    cursor: 'pointer',
    fontSize: '0.8125rem'
  },

  '.dataview-error button:hover': {
    backgroundColor: 'var(--bg-secondary, #f5f5f5)'
  },

  '.dataview-empty': {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.875rem'
  },

  // Table
  '.dataview-table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },

  '.dataview-table th': {
    textAlign: 'left',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    fontWeight: '500',
    color: 'var(--text-secondary, #666)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  },

  '.dataview-table th:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.03))'
  },

  '.dataview-table th.sorted': {
    color: 'var(--accent-primary, #2196f3)'
  },

  '.sort-indicator': {
    marginLeft: '0.25rem',
    fontSize: '0.75rem'
  },

  '.dataview-table td': {
    padding: '0.5rem 1rem',
    borderBottom: '1px solid var(--border-light, #e0e0e0)',
    color: 'var(--text-primary, #333)',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  '.dataview-table tbody tr': {
    cursor: 'pointer',
    transition: 'background-color 0.1s ease'
  },

  '.dataview-table tbody tr:hover': {
    backgroundColor: 'var(--bg-hover, rgba(0,0,0,0.03))'
  },

  '.dataview-table tbody tr:last-child td': {
    borderBottom: 'none'
  },

  // Title cell - styled like wikilinks (detailed styles in ColumnCell.svelte)
  '.dataview-title-cell': {
    fontWeight: '600'
  },

  // Footer
  '.dataview-footer': {
    padding: '0.75rem 1rem',
    borderTop: '1px solid var(--border-light, #e0e0e0)'
  },

  '.dataview-new-note-btn': {
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

  '.dataview-new-note-btn:hover': {
    borderColor: 'var(--accent-primary, #2196f3)',
    color: 'var(--accent-primary, #2196f3)',
    backgroundColor: 'var(--bg-hover, rgba(33, 150, 243, 0.05))'
  }
});
