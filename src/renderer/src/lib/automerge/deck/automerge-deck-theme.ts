/**
 * CodeMirror theme for Automerge deck widgets
 * Minimal styles for the widget container - component-specific styles are in Svelte files
 */

import { EditorView } from '@codemirror/view';

export const automergeDeckTheme = EditorView.theme({
  '.deck-widget-container': {
    display: 'block',
    width: '100%',
    margin: '1rem 0',
    overflow: 'visible',
    fontFamily: 'inherit'
  },
  '.deck-widget-container.deck-embedded': {
    border: '1px solid var(--border-light, #e5e7eb)',
    borderRadius: '0.5rem',
    background: 'var(--bg-secondary, #f9fafb)'
  },
  '.deck-error-widget': {
    display: 'block',
    width: '100%',
    margin: '1rem 0',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--warning-border, #fcd34d)',
    background: 'var(--warning-bg, #fffbeb)',
    fontFamily: 'inherit'
  },
  '.deck-error-content': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    color: 'var(--warning-text, #92400e)'
  },
  '.deck-error-content svg': {
    flexShrink: '0',
    marginTop: '0.125rem'
  },
  '.deck-error-text': {
    flex: '1'
  },
  '.deck-error-text strong': {
    display: 'block',
    fontWeight: '600',
    marginBottom: '0.25rem'
  },
  '.deck-error-text p': {
    margin: '0',
    fontSize: '0.875rem',
    opacity: '0.9'
  },
  '.deck-error-text code': {
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    background: 'rgba(0, 0, 0, 0.1)',
    fontFamily: 'monospace',
    fontSize: '0.8125rem'
  },
  '.deck-loading': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: 'var(--text-secondary, #6b7280)'
  },
  '.deck-loading-text': {
    fontSize: '0.875rem'
  }
});
