/**
 * Editor focus state tracking for mobile keyboard control panel.
 * Tracks whether the note editor is focused and holds a reference to the EditorView.
 */
import type { EditorView } from 'codemirror';
import { Transaction } from '@codemirror/state';
import { startCompletion } from '@codemirror/autocomplete';
import type { FormatType } from '../lib/automerge/selection-toolbar.svelte';
import { toggleFormat } from '../lib/automerge/keyboard-shortcuts-extension.svelte';

type InsertMenuCallback = () => void;

interface EditorFocusState {
  isFocused: boolean;
  editorView: EditorView | null;
}

class EditorFocusStateStore {
  private state = $state<EditorFocusState>({
    isFocused: false,
    editorView: null
  });

  private insertMenuCallback: InsertMenuCallback | null = null;

  /**
   * Update the editor focus state
   * @param focused Whether the editor is focused
   * @param editorView The EditorView instance (or null when blurred)
   */
  setFocused(focused: boolean, editorView: EditorView | null): void {
    this.state.isFocused = focused;
    this.state.editorView = focused ? editorView : null;
  }

  get isFocused(): boolean {
    return this.state.isFocused;
  }

  get editorView(): EditorView | null {
    return this.state.editorView;
  }

  /**
   * Insert text at the current cursor position
   * @param text Text to insert
   * @param cursorOffset Optional offset to position cursor after insertion (from start of inserted text)
   */
  insertText(text: string, cursorOffset?: number): void {
    const view = this.state.editorView;
    if (!view) return;

    const pos = view.state.selection.main.head;
    const newCursorPos =
      cursorOffset !== undefined ? pos + cursorOffset : pos + text.length;

    view.dispatch({
      changes: {
        from: pos,
        to: pos,
        insert: text
      },
      selection: { anchor: newCursorPos },
      scrollIntoView: true,
      annotations: Transaction.userEvent.of('input')
    });

    // Trigger autocompletion (e.g. after inserting [[)
    startCompletion(view);
  }

  /**
   * Apply a formatting action using selection-aware toggle
   * (matches desktop keyboard shortcut behavior — finds word at cursor, toggles existing formatting, etc.)
   */
  format(format: FormatType): void {
    const view = this.state.editorView;
    if (!view) return;

    const markers: Record<string, [string, string]> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      strikethrough: ['~~', '~~'],
      code: ['`', '`']
    };

    const marker = markers[format];
    if (marker) {
      toggleFormat(view, marker[0], marker[1]);
    }
  }

  /**
   * Whether the editor currently has a non-empty text selection
   */
  get hasSelection(): boolean {
    const view = this.state.editorView;
    if (!view) return false;
    return !view.state.selection.main.empty;
  }

  /**
   * Register a callback to open the insert menu for the current editor
   */
  registerInsertMenu(callback: InsertMenuCallback | null): void {
    this.insertMenuCallback = callback;
  }

  /**
   * Open the insert menu at the current cursor line
   */
  openInsertMenu(): void {
    this.insertMenuCallback?.();
  }

  /**
   * Blur the editor to dismiss the keyboard
   */
  blur(): void {
    const view = this.state.editorView;
    if (view) {
      view.contentDOM.blur();
    }
  }
}

export const editorFocusState = new EditorFocusStateStore();

// Convenience functions
export function isEditorFocused(): boolean {
  return editorFocusState.isFocused;
}

export function getEditorView(): EditorView | null {
  return editorFocusState.editorView;
}

export function insertTextAtCursor(text: string, cursorOffset?: number): void {
  editorFocusState.insertText(text, cursorOffset);
}

export function blurEditor(): void {
  editorFocusState.blur();
}

export function formatSelection(format: FormatType): void {
  editorFocusState.format(format);
}

export function hasEditorSelection(): boolean {
  return editorFocusState.hasSelection;
}

export function openInsertMenu(): void {
  editorFocusState.openInsertMenu();
}
