<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { EditorConfig } from '../stores/editorConfig.svelte.js';
  import { type CursorPosition } from '../stores/cursorPositionManager.svelte.js';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import { forceWikilinkRefresh } from '../lib/wikilinks.svelte.js';

  interface Props {
    content: string;
    onContentChange?: (content: string) => void;
    onCursorChange?: () => void;
    onWikilinkClick?: (
      noteId: string,
      title: string,
      shouldCreate?: boolean
    ) => Promise<void>;
    cursorPosition?: CursorPosition | null;
    placeholder?: string;
    variant?: 'default' | 'daily-note';
  }

  let {
    content,
    onContentChange,
    onCursorChange,
    onWikilinkClick,
    cursorPosition,
    placeholder,
    variant = 'default'
  }: Props = $props();

  let editorContainer: Element;
  let editorView: EditorView | null = null;
  let pendingCursorPosition: CursorPosition | null = null;

  const editorConfig = new EditorConfig({
    onWikilinkClick,
    onContentChange,
    onCursorChange,
    placeholder,
    variant
  });

  onMount(() => {
    editorConfig.initializeTheme();
    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
    };
  });

  $effect(() => {
    if (editorContainer && !editorView) {
      createEditor();
    }
  });

  $effect(() => {
    if (cursorPosition) {
      pendingCursorPosition = cursorPosition;
    }
  });

  $effect(() => {
    updateEditorContent();
  });

  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: '',
      extensions: editorConfig.getExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    measureAndUpdateMarkerWidths();
  }

  function updateEditorContent(): void {
    if (editorView && content !== undefined) {
      const currentDoc = editorView.state.doc.toString();
      if (currentDoc !== content) {
        const changes = {
          from: 0,
          to: currentDoc.length,
          insert: content
        };

        let selection: { anchor: number; head: number } | undefined = undefined;
        if (pendingCursorPosition) {
          const position = Math.min(pendingCursorPosition.position, content.length);

          if (
            pendingCursorPosition.selectionStart !== undefined &&
            pendingCursorPosition.selectionEnd !== undefined
          ) {
            const start = Math.min(pendingCursorPosition.selectionStart, content.length);
            const end = Math.min(pendingCursorPosition.selectionEnd, content.length);
            selection = { anchor: start, head: end };
          } else {
            selection = { anchor: position, head: position };
          }

          pendingCursorPosition = null;
        } else {
          selection = { anchor: 0, head: 0 };
        }

        editorView.dispatch({
          changes,
          selection,
          scrollIntoView: !!selection
        });
      }
    }
  }

  function updateEditorConfig(): void {
    if (!editorView) return;

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(editorConfig.getExtensions())
    });

    measureAndUpdateMarkerWidths();
  }

  $effect(() => {
    updateEditorConfig();
  });

  function measureAndUpdateMarkerWidths(): void {
    if (!editorView) return;

    setTimeout(() => {
      if (editorView) {
        const widths = measureMarkerWidths(editorView.dom);
        updateCSSCustomProperties(widths);
      }
    }, 10);
  }

  function focusAtEnd(): void {
    if (editorView) {
      const doc = editorView.state.doc;
      const endPos = doc.length;
      editorView.focus();
      editorView.dispatch({
        selection: { anchor: endPos, head: endPos },
        scrollIntoView: true
      });
    }
  }

  function handleEditorAreaClick(event: MouseEvent): void {
    if (!editorView) return;

    const target = event.target as Element;
    const editorDom = editorView.dom;

    if (!editorDom.contains(target)) {
      focusAtEnd();
      event.preventDefault();
      return;
    }

    setTimeout(() => {
      if (editorView && !editorView.hasFocus) {
        focusAtEnd();
      }
    }, 10);
  }

  function handleEditorAreaKeydown(event: KeyboardEvent): void {
    if (!editorView) return;

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target as Element;
      const editorDom = editorView.dom;
      const scrollerDom = editorDom.querySelector('.cm-scroller');

      if (scrollerDom && (target === scrollerDom || target === editorContainer)) {
        focusAtEnd();
        event.preventDefault();
      }
    }
  }

  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  export function refreshWikilinks(): void {
    if (editorView) {
      forceWikilinkRefresh(editorView);
    }
  }

  export function getCurrentCursorPosition(): {
    position: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null {
    if (!editorView) return null;

    const selection = editorView.state.selection.main;

    return {
      position: selection.head,
      selectionStart: selection.from !== selection.to ? selection.from : undefined,
      selectionEnd: selection.from !== selection.to ? selection.to : undefined
    };
  }

  export function getContent(): string {
    return editorView?.state.doc.toString() || '';
  }

  export function setContent(newContent: string): void {
    if (editorView) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newContent
        }
      });
    }
  }

  export { focusAtEnd };
</script>

<div
  class="editor-content"
  role="textbox"
  tabindex="-1"
  onclick={handleEditorAreaClick}
  onkeydown={handleEditorAreaKeydown}
>
  <div class="editor-container editor-font" bind:this={editorContainer}></div>
</div>

<style>
  .editor-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .editor-container {
    flex: 1;
  }
</style>
