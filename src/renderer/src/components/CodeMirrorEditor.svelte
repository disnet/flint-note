<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { EditorConfig } from '../stores/editorConfig.svelte.js';
  import { type CursorPosition } from '../stores/cursorPositionManager.svelte.js';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import { forceWikilinkRefresh } from '../lib/wikilinks.svelte.js';
  import { ScrollAutoService } from '../stores/scrollAutoService.svelte.js';
  import WikilinkPopover from './WikilinkPopover.svelte';

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

  // Popover state
  let popoverVisible = $state(false);
  let popoverX = $state(0);
  let popoverY = $state(0);
  let popoverIdentifier = $state('');
  let popoverDisplayText = $state('');
  let popoverFrom = $state(0);
  let popoverTo = $state(0);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let leaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let popoverRef: WikilinkPopover | undefined = $state();

  const editorConfig = new EditorConfig({
    onWikilinkClick,
    onContentChange,
    onCursorChange,
    placeholder,
    variant,
    onWikilinkHover: handleWikilinkHover
  });

  const scrollAutoService = new ScrollAutoService(variant);

  onMount(() => {
    editorConfig.initializeTheme();
    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
      scrollAutoService.destroy();
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

  // Set up auto-scroll service when editor and container are available
  $effect(() => {
    if (editorView) {
      // Use the auto-search method to find the scroll container
      const success = scrollAutoService.setupAutoScrollWithSearch(editorView);
      if (!success) {
        console.debug('Auto-scroll: Could not find scroll container');
      }
    }
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

  export function setAutoScrollEnabled(enabled: boolean): void {
    scrollAutoService.setEnabled(enabled);
  }

  export function updateAutoScrollConfig(
    config: Partial<{
      enabled: boolean;
      topMargin: number;
      bottomMargin: number;
      smoothScroll: boolean;
      debounceMs: number;
    }>
  ): void {
    scrollAutoService.updateConfig(config);
  }

  function handleWikilinkHover(
    data: {
      identifier: string;
      displayText: string;
      from: number;
      to: number;
      x: number;
      y: number;
    } | null
  ): void {
    // Clear any pending leave timeout
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }

    if (data) {
      // Clear any pending hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Set a delay before showing the popover
      hoverTimeout = setTimeout(() => {
        popoverIdentifier = data.identifier;
        popoverDisplayText = data.displayText;
        popoverFrom = data.from;
        popoverTo = data.to;
        popoverX = data.x;
        popoverY = data.y;
        popoverVisible = true;
        hoverTimeout = null;
      }, 300);
    } else {
      // Mouse left the wikilink - start leave timeout
      leaveTimeout = setTimeout(() => {
        popoverVisible = false;
        leaveTimeout = null;
      }, 200);
    }
  }

  function handlePopoverSave(newDisplayText: string): void {
    if (!editorView) return;

    // Create the new wikilink text with updated display
    const newText = `[[${popoverIdentifier}|${newDisplayText}]]`;

    // Calculate the new end position based on the length difference
    const oldLength = popoverTo - popoverFrom;
    const newLength = newText.length;
    const lengthDiff = newLength - oldLength;

    // Replace the old wikilink with the new one
    editorView.dispatch({
      changes: {
        from: popoverFrom,
        to: popoverTo,
        insert: newText
      }
    });

    // Update the popover's to position to reflect the new text length
    popoverTo = popoverTo + lengthDiff;

    // Update the display text to match what we just inserted
    popoverDisplayText = newDisplayText;
  }

  function handlePopoverCancel(): void {
    popoverVisible = false;
  }

  // Add mouse enter handler for the popover
  function handlePopoverMouseEnter(): void {
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }
  }

  // Add mouse leave handler for the popover
  function handlePopoverMouseLeave(): void {
    leaveTimeout = setTimeout(() => {
      // Don't close if the input has focus
      if (popoverRef && popoverRef.hasFocus()) {
        return;
      }
      popoverVisible = false;
      leaveTimeout = null;
    }, 200);
  }
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

<div
  role="tooltip"
  onmouseenter={handlePopoverMouseEnter}
  onmouseleave={handlePopoverMouseLeave}
>
  <WikilinkPopover
    bind:this={popoverRef}
    bind:visible={popoverVisible}
    x={popoverX}
    y={popoverY}
    identifier={popoverIdentifier}
    displayText={popoverDisplayText}
    onSave={handlePopoverSave}
    onCancel={handlePopoverCancel}
  />
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
