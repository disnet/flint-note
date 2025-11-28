import { EditorView } from '@codemirror/view';

export const inlineImageTheme = EditorView.theme({
  '.inline-image-container': {
    display: 'block',
    margin: '0.5rem 0',
    maxWidth: '100%'
  },

  '.inline-image': {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '4px',
    border: '1px solid var(--border-light, #e0e0e0)'
  },

  '.inline-image-loading': {
    minHeight: '100px',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted, #999)'
  },

  '.inline-image-error': {
    minHeight: '60px',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-error, #d32f2f)',
    fontSize: '0.8125rem',
    padding: '1rem',
    borderRadius: '4px',
    border: '1px dashed var(--border-light, #e0e0e0)'
  },

  '.inline-image-control-bar': {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.25rem',
    padding: '0.25rem',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '4px',
    alignItems: 'center'
  },

  '.inline-image-alt-input': {
    flex: '1',
    padding: '0.25rem 0.5rem',
    border: '1px solid var(--border-light, #e0e0e0)',
    borderRadius: '4px',
    fontSize: '0.8125rem',
    backgroundColor: 'var(--bg-primary, #fff)',
    color: 'var(--text-primary, #333)',
    minWidth: '0'
  },

  '.inline-image-alt-input:focus': {
    outline: 'none',
    borderColor: 'var(--accent-primary, #2196f3)'
  },

  '.inline-image-alt-input::placeholder': {
    color: 'var(--text-muted, #999)'
  },

  '.inline-image-path': {
    padding: '0.25rem 0.5rem',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary, #666)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
    flexShrink: '0'
  },

  '.inline-image-path:hover': {
    color: 'var(--accent-primary, #2196f3)'
  }
});
