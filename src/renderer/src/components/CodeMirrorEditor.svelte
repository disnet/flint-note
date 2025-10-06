<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { EditorConfig } from '../stores/editorConfig.svelte.js';
  import { type CursorPosition } from '../stores/cursorPositionManager.svelte.js';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import { forceWikilinkRefresh, getSelectedWikilink } from '../lib/wikilinks.svelte.js';
  import { ScrollAutoService } from '../stores/scrollAutoService.svelte.js';
  import WikilinkPopover from './WikilinkPopover.svelte';
  import WikilinkActionPopover from './WikilinkActionPopover.svelte';

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

  // Edit popover state
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
  let savedSelection: { anchor: number; head: number } | null = null;

  // Action popover state (unified for cursor and mouse interactions)
  let actionPopoverVisible = $state(false);
  let actionPopoverX = $state(0);
  let actionPopoverY = $state(0);
  let actionPopoverIdentifier = $state('');
  let actionPopoverIsFromHover = $state(false); // Track if popover is from hover vs cursor
  let actionPopoverWikilinkData = $state<{
    identifier: string;
    title: string;
    exists: boolean;
    noteId?: string;
  } | null>(null);

  const editorConfig = new EditorConfig({
    onWikilinkClick,
    onContentChange,
    onCursorChange,
    placeholder,
    variant,
    onWikilinkHover: handleWikilinkHover,
    onWikilinkEdit: handleActionPopoverEdit,
    onHoverPopoverEnter: handleHoverPopoverEnter,
    onHoverPopoverAltEnter: handleHoverPopoverAltEnter
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

  // Track selected wikilink and show action popup
  $effect(() => {
    if (!editorView) return;

    // Poll for selection changes
    const interval = setInterval(() => {
      if (!editorView) return;

      const selected = getSelectedWikilink(editorView);

      if (selected && !popoverVisible && !actionPopoverIsFromHover) {
        // Show action popup only if edit popover is not visible and not already shown from hover
        // Position popup near the selected wikilink
        const coords = editorView.coordsAtPos(selected.from);
        if (coords) {
          actionPopoverIdentifier = selected.identifier;
          actionPopoverWikilinkData = {
            identifier: selected.identifier,
            title: selected.title,
            exists: selected.exists,
            noteId: selected.noteId
          };
          const position = calculateActionPopoverPosition(coords.left, coords.bottom);
          actionPopoverX = position.x;
          actionPopoverY = position.y;
          actionPopoverVisible = true;
          actionPopoverIsFromHover = false;
        }
      } else if ((!selected || popoverVisible) && !actionPopoverIsFromHover) {
        // Hide action popup if no wikilink selected or edit popover is visible
        // BUT only if it's not being shown from hover
        actionPopoverVisible = false;
      }
    }, 100);

    return () => clearInterval(interval);
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
      exists: boolean;
      noteId?: string;
    } | null
  ): void {
    // Clear any pending leave timeout
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }

    if (data) {
      // Don't show action popover if edit popover is visible
      if (popoverVisible) {
        return;
      }

      // If the popover is already visible from hover, update its data and position immediately
      if (actionPopoverVisible && actionPopoverIsFromHover) {
        // Cancel any pending hover timeout
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }

        // Update popover data and position immediately
        actionPopoverIdentifier = data.identifier;
        actionPopoverWikilinkData = {
          identifier: data.identifier,
          title: data.displayText,
          exists: data.exists,
          noteId: data.noteId
        };
        popoverFrom = data.from;
        popoverTo = data.to;
        popoverIdentifier = data.identifier;
        popoverDisplayText = data.displayText;

        const position = calculateActionPopoverPosition(data.x, data.y);
        actionPopoverX = position.x;
        actionPopoverY = position.y;
        return;
      }

      // If visible from cursor position, don't interfere with it
      if (actionPopoverVisible) {
        return;
      }

      // Clear any pending hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Set a delay before showing the action popover
      hoverTimeout = setTimeout(() => {
        // Double-check that edit popover isn't visible before showing
        if (popoverVisible) {
          return;
        }

        actionPopoverIdentifier = data.identifier;
        actionPopoverWikilinkData = {
          identifier: data.identifier,
          title: data.displayText,
          exists: data.exists,
          noteId: data.noteId
        };
        popoverFrom = data.from;
        popoverTo = data.to;
        popoverIdentifier = data.identifier;
        popoverDisplayText = data.displayText;

        // Calculate viewport-aware position
        const position = calculateActionPopoverPosition(data.x, data.y);
        actionPopoverX = position.x;
        actionPopoverY = position.y;

        actionPopoverVisible = true;
        actionPopoverIsFromHover = true; // Mark this as from hover
        hoverTimeout = null;
      }, 300);
    } else {
      // Mouse left the wikilink
      // Clear any pending hover timeout to prevent showing the popover
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }

      // Start leave timeout only if popover is from hover
      if (actionPopoverIsFromHover) {
        leaveTimeout = setTimeout(() => {
          actionPopoverVisible = false;
          actionPopoverIsFromHover = false; // Reset the hover flag
          leaveTimeout = null;
        }, 200);
      }
    }
  }

  function calculatePopoverPosition(x: number, y: number): { x: number; y: number } {
    // Popover dimensions (approximate)
    const popoverWidth = 300;
    const popoverHeight = 100;
    const padding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    // Check right edge
    if (finalX + popoverWidth + padding > viewportWidth) {
      finalX = viewportWidth - popoverWidth - padding;
    }

    // Check left edge
    if (finalX < padding) {
      finalX = padding;
    }

    // Check if there's enough space below the link
    // y is already at the bottom of the link from the hover coordinates
    const spaceBelow = viewportHeight - (finalY + padding);
    const spaceAbove = finalY - padding;

    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      // Show above the link with 8px padding
      finalY = finalY - popoverHeight - padding;
    } else {
      // Show below the link with 8px padding
      finalY = finalY + padding;
    }

    // Final bounds check
    if (finalY + popoverHeight + padding > viewportHeight) {
      finalY = viewportHeight - popoverHeight - padding;
    }

    if (finalY < padding) {
      finalY = padding;
    }

    return { x: finalX, y: finalY };
  }

  function calculateActionPopoverPosition(
    x: number,
    y: number
  ): { x: number; y: number } {
    // Action popover dimensions
    const popoverWidth = 240;
    const popoverHeight = 80;
    const padding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    // Check right edge
    if (finalX + popoverWidth + padding > viewportWidth) {
      finalX = viewportWidth - popoverWidth - padding;
    }

    // Check left edge
    if (finalX < padding) {
      finalX = padding;
    }

    // Check if there's enough space below the link
    const spaceBelow = viewportHeight - (finalY + padding);
    const spaceAbove = finalY - padding;

    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      // Show above the link
      finalY = finalY - popoverHeight - padding;
    } else {
      // Show below the link
      finalY = finalY + padding;
    }

    // Final bounds check
    if (finalY + popoverHeight + padding > viewportHeight) {
      finalY = viewportHeight - popoverHeight - padding;
    }

    if (finalY < padding) {
      finalY = padding;
    }

    return { x: finalX, y: finalY };
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

  function handlePopoverCommit(): void {
    popoverVisible = false;
    // Restore focus and selection after committing
    restoreFocusAndSelection();
  }

  function handlePopoverCancel(): void {
    popoverVisible = false;
    // Restore focus and selection
    restoreFocusAndSelection();
  }

  function restoreFocusAndSelection(): void {
    if (!editorView) return;

    // Focus the editor
    editorView.focus();

    // Restore the saved selection if available
    if (savedSelection) {
      editorView.dispatch({
        selection: savedSelection,
        scrollIntoView: true
      });
      savedSelection = null;
    }
  }

  function handleActionPopoverOpen(): void {
    if (!onWikilinkClick || !actionPopoverWikilinkData) return;

    const data = actionPopoverWikilinkData;
    if (data.exists && data.noteId) {
      onWikilinkClick(data.noteId, data.title);
    } else {
      // Handle broken link - create new note
      onWikilinkClick(data.identifier, data.title, true);
    }

    // Hide the action popover after opening
    actionPopoverVisible = false;
  }

  function handleActionPopoverEdit(): void {
    if (!editorView || !actionPopoverWikilinkData) return;

    // Save the current selection before opening the edit popover
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide action popover and show edit popover
    actionPopoverVisible = false;

    // Set the edit popover data from the action popover's stored wikilink data
    popoverIdentifier = actionPopoverWikilinkData.identifier;
    popoverDisplayText = actionPopoverWikilinkData.title;

    // Get the wikilink position for the edit popover
    const selected = getSelectedWikilink(editorView);
    if (selected) {
      popoverFrom = selected.from;
      popoverTo = selected.to;
    }

    // Get coordinates from the action popover position (reuse it for edit popover)
    const position = calculatePopoverPosition(actionPopoverX, actionPopoverY);
    popoverX = position.x;
    popoverY = position.y;

    popoverVisible = true;
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

  // Add mouse enter handler for the action popover
  function handleActionPopoverMouseEnter(): void {
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }
  }

  // Add mouse leave handler for the action popover
  function handleActionPopoverMouseLeave(): void {
    // Only hide on mouse leave if the popover was triggered by hover
    // If it was triggered by cursor position, let the cursor polling handle visibility
    if (actionPopoverIsFromHover) {
      leaveTimeout = setTimeout(() => {
        actionPopoverVisible = false;
        actionPopoverIsFromHover = false; // Reset the hover flag
        leaveTimeout = null;
      }, 200);
    }
  }

  // Handle Enter key when hover popover is visible
  function handleHoverPopoverEnter(): boolean {
    if (actionPopoverVisible && actionPopoverIsFromHover) {
      handleActionPopoverOpen();
      return true; // Consumed the event
    }
    return false; // Not consumed
  }

  // Handle Alt-Enter key when hover popover is visible
  function handleHoverPopoverAltEnter(): boolean {
    if (actionPopoverVisible && actionPopoverIsFromHover) {
      handleActionPopoverEdit();
      return true; // Consumed the event
    }
    return false; // Not consumed
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
    onCommit={handlePopoverCommit}
  />
</div>

<div
  role="tooltip"
  onmouseenter={handleActionPopoverMouseEnter}
  onmouseleave={handleActionPopoverMouseLeave}
>
  <WikilinkActionPopover
    bind:visible={actionPopoverVisible}
    x={actionPopoverX}
    y={actionPopoverY}
    identifier={actionPopoverIdentifier}
    onOpen={handleActionPopoverOpen}
    onEdit={handleActionPopoverEdit}
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
