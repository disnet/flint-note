/**
 * Editor focus state tracking for mobile keyboard control panel.
 * Tracks whether the note editor is focused and holds a reference to the EditorView.
 */
import type { EditorView } from 'codemirror';

interface EditorFocusState {
  isFocused: boolean;
  editorView: EditorView | null;
}

class EditorFocusStateStore {
  private state = $state<EditorFocusState>({
    isFocused: false,
    editorView: null
  });

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
      scrollIntoView: true
    });
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
