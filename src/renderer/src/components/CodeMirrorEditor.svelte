<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { EditorConfig } from '../stores/editorConfig.svelte.js';
  import { type CursorPosition } from '../stores/cursorPositionManager.svelte.js';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import { forceWikilinkRefresh, getSelectedWikilink } from '../lib/wikilinks.svelte.js';
  import { ScrollAutoService } from '../stores/scrollAutoService.svelte.js';
  import { notesStore } from '../services/noteStore.svelte';
  import WikilinkPopover from './WikilinkPopover.svelte';
  import WikilinkActionPopover from './WikilinkActionPopover.svelte';
  import InlineCommentPopover from './InlineCommentPopover.svelte';
  import {
    commentDecorations,
    updateSuggestionsEffect,
    setExpandedEffect,
    getSuggestionsForLine
  } from '../lib/commentDecorations.svelte';
  import type { NoteSuggestion } from '../../../server/types';

  interface Props {
    content: string;
    onContentChange?: (content: string) => void;
    onCursorChange?: () => void;
    onWikilinkClick?: (
      noteId: string,
      title: string,
      shouldCreate?: boolean,
      shiftKey?: boolean
    ) => Promise<void>;
    onFocusChange?: (focused: boolean) => void;
    cursorPosition?: CursorPosition | null;
    placeholder?: string;
    variant?: 'default' | 'daily-note' | 'sidebar-note';
    maxHeight?: string;
    showExpandControls?: boolean;
    toggleExpansion?: () => void;
    readOnly?: boolean;
    isExpanded?: boolean;
    suggestions?: NoteSuggestion[];
    expandedSuggestions?: Set<string>;
    onDismissSuggestion?: (suggestionId: string) => void;
  }

  let {
    content,
    onContentChange,
    onCursorChange,
    onWikilinkClick,
    onFocusChange,
    cursorPosition,
    placeholder,
    variant = 'default',
    maxHeight,
    showExpandControls = false,
    toggleExpansion,
    readOnly = false,
    isExpanded = false,
    suggestions = [],
    expandedSuggestions = new Set(),
    onDismissSuggestion
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
  // Store link rect for consistent positioning across mode switches
  let linkRect = $state<{
    top: number;
    bottom: number;
    height: number;
    left: number;
  } | null>(null);

  // Comment popover state
  let commentPopoverVisible = $state(false);
  let commentPopoverX = $state(0);
  let commentPopoverY = $state(0);
  let commentPopoverSuggestions = $state<NoteSuggestion[]>([]);

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
      extensions: [
        ...editorConfig.getExtensions(),
        commentDecorations(handleCommentMarkerClick)
      ]
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
      effects: StateEffect.reconfigure.of([
        ...editorConfig.getExtensions(),
        commentDecorations(handleCommentMarkerClick),
        EditorState.readOnly.of(readOnly)
      ])
    });

    measureAndUpdateMarkerWidths();
  }

  // Update editor config when it changes or when readOnly changes
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

      // Check if editor has focus - hide popover if it doesn't
      if (!editorView.hasFocus) {
        if (!actionPopoverIsFromHover) {
          actionPopoverVisible = false;
        }
        return;
      }

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

          // Store link rect for cursor-based positioning
          linkRect = {
            left: coords.left,
            top: coords.top,
            bottom: coords.bottom,
            height: coords.bottom - coords.top
          };

          // Action popover dimensions
          const actionPopoverWidth = 240;
          const actionPopoverHeight = 80;

          const position = calculatePopoverPosition(
            linkRect.left,
            linkRect.top,
            linkRect.bottom,
            actionPopoverWidth,
            actionPopoverHeight
          );
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

  // Close popovers when editor loses focus
  $effect(() => {
    if (!editorView) return;

    const handleBlur = (): void => {
      // Use untrack to avoid state mutation errors during component teardown
      untrack(() => {
        // Close popovers if editor loses focus (but not if the popover itself has focus)
        if (!editorView?.hasFocus) {
          // Don't close edit popover if it has focus or is about to gain focus
          // We need a small delay to allow the popover's input to receive focus
          if (popoverVisible || (popoverRef && popoverRef.hasFocus())) {
            setTimeout(() => {
              if (popoverRef && popoverRef.hasFocus()) {
                return;
              }
              // If popover still doesn't have focus after delay, close it
              if (!editorView?.hasFocus) {
                actionPopoverVisible = false;
                actionPopoverIsFromHover = false;
                popoverVisible = false;
              }
            }, 50);
            return;
          }

          actionPopoverVisible = false;
          actionPopoverIsFromHover = false;
          popoverVisible = false;

          // Clear any pending timeouts
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
          }
          if (leaveTimeout) {
            clearTimeout(leaveTimeout);
            leaveTimeout = null;
          }
        }

        // Only notify parent of focus change if the document still has focus
        // This means focus moved to another element in the app, not that the window lost focus
        // Use setTimeout to check document.hasFocus after the blur event completes
        setTimeout(() => {
          if (document.hasFocus()) {
            onFocusChange?.(false);
          }
        }, 0);
      });
    };

    const handleFocus = (): void => {
      // Use untrack to avoid state mutation errors during component teardown
      untrack(() => {
        // Close edit popover when editor gains focus (unless popover has focus)
        if (popoverVisible && popoverRef && !popoverRef.hasFocus()) {
          popoverVisible = false;
        }

        // Close action popover when editor gains focus
        if (actionPopoverVisible) {
          actionPopoverVisible = false;
          actionPopoverIsFromHover = false;
        }

        // Notify parent of focus change
        onFocusChange?.(true);
      });
    };

    // Use blur and focus events on the editor
    editorView.dom.addEventListener('blur', handleBlur, true);
    editorView.dom.addEventListener('focus', handleFocus, true);

    return () => {
      editorView?.dom.removeEventListener('blur', handleBlur, true);
      editorView?.dom.removeEventListener('focus', handleFocus, true);
    };
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
      yTop: number;
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

        // Update link rect
        linkRect = {
          left: data.x,
          top: data.yTop,
          bottom: data.y,
          height: data.y - data.yTop
        };

        // Action popover dimensions
        const actionPopoverWidth = 240;
        const actionPopoverHeight = 80;

        const position = calculatePopoverPosition(
          linkRect.left,
          linkRect.top,
          linkRect.bottom,
          actionPopoverWidth,
          actionPopoverHeight
        );
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

        // Store link rect
        linkRect = {
          left: data.x,
          top: data.yTop,
          bottom: data.y,
          height: data.y - data.yTop
        };

        // Action popover dimensions
        const actionPopoverWidth = 240;
        const actionPopoverHeight = 80;

        // Calculate viewport-aware position
        const position = calculatePopoverPosition(
          linkRect.left,
          linkRect.top,
          linkRect.bottom,
          actionPopoverWidth,
          actionPopoverHeight
        );
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

  function calculatePopoverPosition(
    linkLeft: number,
    linkTop: number,
    linkBottom: number,
    popoverWidth: number,
    popoverHeight: number
  ): { x: number; y: number } {
    const padding = 8;
    const gap = 4; // Small gap between popover and link
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = linkLeft;
    let finalY: number;

    // Horizontal positioning
    // Check right edge
    if (finalX + popoverWidth + padding > viewportWidth) {
      finalX = viewportWidth - popoverWidth - padding;
    }
    // Check left edge
    if (finalX < padding) {
      finalX = padding;
    }

    // Vertical positioning - check if there's space below
    const spaceBelow = viewportHeight - linkBottom;
    const canFitBelow = spaceBelow >= popoverHeight + padding + gap;

    if (canFitBelow) {
      // Position below the link - anchor top edge below linkBottom with a gap
      finalY = linkBottom + gap;
    } else {
      // Position above the link - anchor bottom edge above linkTop with a gap
      // The popover top is at: linkTop - gap - popoverHeight
      // The popover bottom is at: linkTop - gap
      finalY = linkTop - gap - popoverHeight;
    }

    // Final bounds check
    if (finalY + popoverHeight > viewportHeight - padding) {
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
    if (!editorView || !actionPopoverWikilinkData || !linkRect) return;

    // Save the current selection before opening the edit popover
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide action popover and show edit popover
    actionPopoverVisible = false;

    // Set the edit popover data from the action popover's stored wikilink data
    popoverIdentifier = actionPopoverWikilinkData.identifier;

    // For ID-only links ([[n-id]]), show the note's title instead of the ID
    // For links with display text, show the display text
    if (actionPopoverWikilinkData.identifier === actionPopoverWikilinkData.title) {
      // ID-only link - get the note's current title
      if (actionPopoverWikilinkData.noteId && actionPopoverWikilinkData.exists) {
        const notes = notesStore.notes;
        const note = notes.find((n) => n.id === actionPopoverWikilinkData!.noteId);
        popoverDisplayText = note?.title || actionPopoverWikilinkData.title;
      } else {
        popoverDisplayText = actionPopoverWikilinkData.title;
      }
    } else {
      // Link with display text - use it as-is
      popoverDisplayText = actionPopoverWikilinkData.title;
    }

    // Get the wikilink position for the edit popover
    const selected = getSelectedWikilink(editorView);
    if (selected) {
      popoverFrom = selected.from;
      popoverTo = selected.to;
    }

    // Edit popover dimensions (approximate)
    const editPopoverWidth = 400;
    const editPopoverHeight = 100;

    // Use the stored link rect to calculate position with the same anchor logic
    const position = calculatePopoverPosition(
      linkRect.left,
      linkRect.top,
      linkRect.bottom,
      editPopoverWidth,
      editPopoverHeight
    );
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

  // Handle comment marker click
  function handleCommentMarkerClick(lineNumber: number): void {
    if (!editorView) return;

    // Get suggestions for this line
    const lineSuggestions = getSuggestionsForLine(editorView, lineNumber);

    if (lineSuggestions.length === 0) return;

    // Get the line position to place the popover
    try {
      const line = editorView.state.doc.line(lineNumber);
      const coords = editorView.coordsAtPos(line.from);
      const editorRect = editorView.dom.getBoundingClientRect();

      if (coords) {
        commentPopoverSuggestions = lineSuggestions;
        // Position popover to the left of the right-side gutter
        commentPopoverX = editorRect.right - 380; // 380px = popover width (350px) + gutter width (30px)
        commentPopoverY = coords.top;
        commentPopoverVisible = true;
      }
    } catch (error) {
      console.error('Error showing comment popover:', error);
    }
  }

  function handleCommentPopoverClose(): void {
    commentPopoverVisible = false;
  }

  function handleCommentDismiss(suggestionId: string): void {
    onDismissSuggestion?.(suggestionId);
    // If all suggestions for this line are dismissed, close the popover
    const remainingSuggestions = commentPopoverSuggestions.filter(
      (s) => s.id !== suggestionId
    );
    if (remainingSuggestions.length === 0) {
      commentPopoverVisible = false;
    }
  }

  // Update suggestions in the editor when they change
  $effect(() => {
    console.log('CodeMirrorEditor: suggestions effect triggered', {
      editorView: !!editorView,
      suggestions,
      suggestionsLength: suggestions?.length
    });
    if (editorView && suggestions) {
      console.log('CodeMirrorEditor: dispatching updateSuggestionsEffect');
      editorView.dispatch({
        effects: updateSuggestionsEffect.of(suggestions)
      });
    }
  });

  // Update expanded state in the editor when it changes
  $effect(() => {
    if (editorView && expandedSuggestions) {
      editorView.dispatch({
        effects: setExpandedEffect.of(expandedSuggestions)
      });
    }
  });
</script>

<div
  class="editor-content"
  class:read-only={readOnly}
  role="textbox"
  tabindex="-1"
  onclick={handleEditorAreaClick}
  onkeydown={handleEditorAreaKeydown}
>
  <div
    class="editor-container editor-font"
    class:has-max-height={!!maxHeight}
    class:collapsing={!isExpanded}
    bind:this={editorContainer}
    style:max-height={maxHeight}
  ></div>

  {#if showExpandControls && content && content.split('\n').length > 5}
    <div class="expand-controls">
      <div class="fade-gradient"></div>
      <button
        class="expand-button"
        onclick={(e) => {
          e.stopPropagation();
          toggleExpansion?.();
        }}
        type="button"
        title="Expand editor"
        aria-label="Expand editor"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>
  {/if}
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
    {linkRect}
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
    {linkRect}
    onOpen={handleActionPopoverOpen}
    onEdit={handleActionPopoverEdit}
  />
</div>

<InlineCommentPopover
  bind:visible={commentPopoverVisible}
  x={commentPopoverX}
  y={commentPopoverY}
  suggestions={commentPopoverSuggestions}
  onDismiss={handleCommentDismiss}
  onClose={handleCommentPopoverClose}
/>

<style>
  .editor-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .editor-content.read-only {
    cursor: text;
  }

  .editor-content.read-only .editor-container {
    overflow: hidden !important;
  }

  .editor-container {
    flex: 1;
    overflow: hidden;
    /* No transition by default (instant expansion on focus) */
    transition: none;
  }

  .editor-container.collapsing {
    /* Smooth collapse animation only when blurring */
    transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .editor-container.has-max-height {
    flex: 0 0 auto;
    overflow-y: auto;
  }

  .expand-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    pointer-events: none;
  }

  .fade-gradient {
    height: 80px;
    background: linear-gradient(to bottom, transparent 0%, var(--bg-primary) 100%);
    pointer-events: none;
  }

  .expand-button {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    /* Smooth hover transitions and subtle scale on hover */
    transition:
      background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .expand-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border-medium);
    /* Subtle lift on hover */
    transform: translateX(-50%) translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .expand-button:active {
    transform: translateX(-50%) translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .expand-button svg {
    width: 16px;
    height: 16px;
  }
</style>
